from __future__ import annotations

import json
import base64
import hashlib
import hmac
import io
import mimetypes
import os
import secrets
import sqlite3
import struct
import time
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

try:
    import qrcode
except ImportError:  # pragma: no cover - production should install requirements.txt
    qrcode = None


ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("ALTAVET_DB", ROOT_DIR / "data" / "altavet.db"))
HOST = os.environ.get("ALTAVET_HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", os.environ.get("ALTAVET_PORT", "8000")))
SESSION_COOKIE = "altavet_session"
SESSION_DAYS = 7
ADMIN_USER = os.environ.get("ALTAVET_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ALTAVET_ADMIN_PASSWORD", "AltaVet@2026")
ISSUER = "AltaVet"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS pets (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                species TEXT NOT NULL,
                breed TEXT NOT NULL DEFAULT '',
                age TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                professional TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL CHECK(status IN ('agendado', 'cancelado')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                mfa_secret TEXT NOT NULL,
                mfa_enabled INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_challenges (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        ensure_admin_user(db)
        touch_updated_at(db)


def ensure_admin_user(db: sqlite3.Connection) -> None:
    total = db.execute("SELECT COUNT(*) AS total FROM users").fetchone()["total"]

    if total:
        return

    now = utc_now()
    db.execute(
        """
        INSERT INTO users (id, username, password_hash, mfa_secret, mfa_enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        """,
        (
            secrets.token_hex(16),
            ADMIN_USER,
            hash_password(ADMIN_PASSWORD),
            generate_mfa_secret(),
            now,
            now,
        ),
    )


def touch_updated_at(db: sqlite3.Connection) -> None:
    db.execute(
        """
        INSERT INTO app_meta (key, value)
        VALUES ('updated_at', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (utc_now(),),
    )


def get_state() -> dict:
    with connect() as db:
        users = [
            {
                "id": row["id"],
                "username": row["username"],
                "mfaEnabled": bool(row["mfa_enabled"]),
                "createdAt": row["created_at"],
            }
            for row in db.execute("SELECT id, username, mfa_enabled, created_at FROM users ORDER BY username COLLATE NOCASE")
        ]
        clients = [
            {
                "id": row["id"],
                "name": row["name"],
                "phone": row["phone"],
                "email": row["email"],
                "address": row["address"],
            }
            for row in db.execute("SELECT * FROM clients ORDER BY name COLLATE NOCASE")
        ]
        pets = [
            {
                "id": row["id"],
                "ownerId": row["owner_id"],
                "name": row["name"],
                "species": row["species"],
                "breed": row["breed"],
                "age": row["age"],
                "notes": row["notes"],
            }
            for row in db.execute("SELECT * FROM pets ORDER BY name COLLATE NOCASE")
        ]
        appointments = [
            {
                "id": row["id"],
                "petId": row["pet_id"],
                "type": row["type"],
                "date": row["date"],
                "time": row["time"],
                "professional": row["professional"],
                "notes": row["notes"],
                "status": row["status"],
            }
            for row in db.execute("SELECT * FROM appointments ORDER BY date, time")
        ]
        meta = db.execute("SELECT value FROM app_meta WHERE key = 'updated_at'").fetchone()

    return {
        "users": users,
        "clients": clients,
        "pets": pets,
        "appointments": appointments,
        "updatedAt": meta["value"] if meta else None,
    }


def require_fields(payload: dict, fields: tuple[str, ...]) -> None:
    missing = [field for field in fields if not str(payload.get(field, "")).strip()]

    if missing:
        raise ValueError(f"Campos obrigatorios ausentes: {', '.join(missing)}")


def insert_client(payload: dict) -> None:
    require_fields(payload, ("id", "name", "phone"))
    now = utc_now()

    with connect() as db:
        db.execute(
            """
            INSERT INTO clients (id, name, phone, email, address, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["id"],
                payload["name"].strip(),
                payload["phone"].strip(),
                payload.get("email", "").strip(),
                payload.get("address", "").strip(),
                now,
                now,
            ),
        )
        touch_updated_at(db)


def insert_user(payload: dict) -> None:
    require_fields(payload, ("id", "username", "password"))

    if len(str(payload["password"])) < 8:
        raise ValueError("A senha precisa ter pelo menos 8 caracteres")

    now = utc_now()

    with connect() as db:
        db.execute(
            """
            INSERT INTO users (id, username, password_hash, mfa_secret, mfa_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?)
            """,
            (
                payload["id"],
                payload["username"].strip(),
                hash_password(payload["password"]),
                generate_mfa_secret(),
                now,
                now,
            ),
        )
        touch_updated_at(db)


def insert_pet(payload: dict) -> None:
    require_fields(payload, ("id", "ownerId", "name", "species"))
    now = utc_now()

    with connect() as db:
        db.execute(
            """
            INSERT INTO pets (id, owner_id, name, species, breed, age, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["id"],
                payload["ownerId"],
                payload["name"].strip(),
                payload["species"].strip(),
                payload.get("breed", "").strip(),
                str(payload.get("age", "")).strip(),
                payload.get("notes", "").strip(),
                now,
                now,
            ),
        )
        touch_updated_at(db)


def insert_appointment(payload: dict) -> None:
    require_fields(payload, ("id", "petId", "type", "date", "time"))
    now = utc_now()
    status = payload.get("status", "agendado")

    if status not in {"agendado", "cancelado"}:
        raise ValueError("Status invalido")

    with connect() as db:
        db.execute(
            """
            INSERT INTO appointments
                (id, pet_id, type, date, time, professional, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["id"],
                payload["petId"],
                payload["type"].strip(),
                payload["date"].strip(),
                payload["time"].strip(),
                payload.get("professional", "").strip(),
                payload.get("notes", "").strip(),
                status,
                now,
                now,
            ),
        )
        touch_updated_at(db)


def update_appointment_status(appointment_id: str, payload: dict) -> None:
    status = payload.get("status")

    if status not in {"agendado", "cancelado"}:
        raise ValueError("Status invalido")

    with connect() as db:
        cursor = db.execute(
            "UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?",
            (status, utc_now(), appointment_id),
        )

        if cursor.rowcount == 0:
            raise KeyError("Agendamento nao encontrado")

        touch_updated_at(db)


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 260_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
      algorithm, salt, expected = stored.split("$", 2)
    except ValueError:
      return False

    if algorithm != "pbkdf2_sha256":
      return False

    candidate = hash_password(password, salt).split("$", 2)[2]
    return hmac.compare_digest(candidate, expected)


def generate_mfa_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def hotp(secret: str, counter: int, digits: int = 6) -> str:
    padded_secret = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded_secret, casefold=True)
    message = struct.pack(">Q", counter)
    digest = hmac.new(key, message, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(code % (10**digits)).zfill(digits)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    if not code.isdigit():
        return False

    counter = int(time.time() // 30)

    return any(hmac.compare_digest(hotp(secret, counter + offset), code) for offset in range(-window, window + 1))


def otpauth_uri(username: str, secret: str) -> str:
    label = quote(f"{ISSUER}:{username}")
    issuer = quote(ISSUER)
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30"


def qr_image(uri: str) -> str | None:
    if qrcode is None or not hasattr(qrcode, "make"):
        return None

    image = qrcode.make(uri)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f'<img src="data:image/png;base64,{encoded}" alt="QR Code MFA" />'


def iso_from_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def create_challenge(db: sqlite3.Connection, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = utc_now()
    expires_at = iso_from_timestamp(time.time() + 5 * 60)
    db.execute("DELETE FROM auth_challenges WHERE user_id = ?", (user_id,))
    db.execute(
        "INSERT INTO auth_challenges (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (hashlib.sha256(token.encode("utf-8")).hexdigest(), user_id, expires_at, now),
    )
    return token


def create_session(db: sqlite3.Connection, user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    now = utc_now()
    expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (hashlib.sha256(token.encode("utf-8")).hexdigest(), user_id, expires_at, now),
    )
    return token


def get_authenticated_user(handler: "AltaVetHandler") -> sqlite3.Row | None:
    cookies = SimpleCookie(handler.headers.get("Cookie", ""))
    morsel = cookies.get(SESSION_COOKIE)

    if not morsel:
        return None

    token_hash = hashlib.sha256(morsel.value.encode("utf-8")).hexdigest()

    with connect() as db:
        row = db.execute(
            """
            SELECT users.*
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (token_hash, utc_now()),
        ).fetchone()

    return row


def authenticate_login(payload: dict) -> dict:
    require_fields(payload, ("username", "password"))

    with connect() as db:
        user = db.execute("SELECT * FROM users WHERE username = ?", (payload["username"],)).fetchone()

        if not user or not verify_password(payload["password"], user["password_hash"]):
            raise PermissionError("Usuario ou senha invalidos")

        challenge = create_challenge(db, user["id"])
        uri = otpauth_uri(user["username"], user["mfa_secret"])

        return {
            "challenge": challenge,
            "mfaEnabled": bool(user["mfa_enabled"]),
            "setupRequired": not bool(user["mfa_enabled"]),
            "secret": None if user["mfa_enabled"] else user["mfa_secret"],
            "otpauth": None if user["mfa_enabled"] else uri,
            "qrSvg": None if user["mfa_enabled"] else qr_image(uri),
        }


def verify_login_challenge(payload: dict) -> str:
    require_fields(payload, ("challenge", "code"))
    token_hash = hashlib.sha256(payload["challenge"].encode("utf-8")).hexdigest()

    with connect() as db:
        row = db.execute(
            """
            SELECT auth_challenges.token_hash, users.*
            FROM auth_challenges
            JOIN users ON users.id = auth_challenges.user_id
            WHERE auth_challenges.token_hash = ? AND auth_challenges.expires_at > ?
            """,
            (token_hash, utc_now()),
        ).fetchone()

        if not row or not verify_totp(row["mfa_secret"], str(payload["code"]).replace(" ", "")):
            raise PermissionError("Codigo MFA invalido")

        now = utc_now()
        db.execute("DELETE FROM auth_challenges WHERE token_hash = ?", (token_hash,))
        db.execute(
            "UPDATE users SET mfa_enabled = 1, updated_at = ? WHERE id = ?",
            (now, row["id"]),
        )
        return create_session(db, row["id"])


def destroy_session(handler: "AltaVetHandler") -> None:
    cookies = SimpleCookie(handler.headers.get("Cookie", ""))
    morsel = cookies.get(SESSION_COOKIE)

    if not morsel:
        return

    token_hash = hashlib.sha256(morsel.value.encode("utf-8")).hexdigest()

    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


class AltaVetHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/login":
            self.serve_static("login.html")
            return

        if parsed.path == "/api/health":
            self.send_json({"ok": True})
            return

        if parsed.path == "/api/auth/me":
            user = get_authenticated_user(self)
            self.send_json({"authenticated": bool(user), "username": user["username"] if user else None})
            return

        if parsed.path == "/api/state":
            if not self.require_auth():
                return
            self.send_json(get_state())
            return

        if not self.is_public_asset(parsed.path) and not self.require_auth(redirect=True):
            return

        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        try:
            payload = self.read_json()

            if parsed.path == "/api/auth/login":
                self.send_json(authenticate_login(payload))
                return

            if parsed.path == "/api/auth/verify":
                session_token = verify_login_challenge(payload)
                self.send_json({"ok": True}, cookie=session_token)
                return

            if parsed.path == "/api/auth/logout":
                destroy_session(self)
                self.send_json({"ok": True}, clear_cookie=True)
                return

            if not self.require_auth():
                return

            if parsed.path == "/api/users":
                insert_user(payload)
                self.send_json(get_state(), HTTPStatus.CREATED)
                return

            if parsed.path == "/api/clients":
                insert_client(payload)
                self.send_json(get_state(), HTTPStatus.CREATED)
                return

            if parsed.path == "/api/pets":
                insert_pet(payload)
                self.send_json(get_state(), HTTPStatus.CREATED)
                return

            if parsed.path == "/api/appointments":
                insert_appointment(payload)
                self.send_json(get_state(), HTTPStatus.CREATED)
                return

            self.send_error_json("Rota nao encontrada", HTTPStatus.NOT_FOUND)
        except sqlite3.IntegrityError as error:
            self.send_error_json(f"Erro de integridade: {error}", HTTPStatus.BAD_REQUEST)
        except ValueError as error:
            self.send_error_json(str(error), HTTPStatus.BAD_REQUEST)
        except PermissionError as error:
            self.send_error_json(str(error), HTTPStatus.UNAUTHORIZED)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        parts = [part for part in parsed.path.split("/") if part]

        try:
            if not self.require_auth():
                return

            if len(parts) == 4 and parts[:2] == ["api", "appointments"] and parts[3] == "status":
                update_appointment_status(unquote(parts[2]), self.read_json())
                self.send_json(get_state())
                return

            self.send_error_json("Rota nao encontrada", HTTPStatus.NOT_FOUND)
        except KeyError as error:
            self.send_error_json(str(error), HTTPStatus.NOT_FOUND)
        except ValueError as error:
            self.send_error_json(str(error), HTTPStatus.BAD_REQUEST)

    def require_auth(self, redirect: bool = False) -> bool:
        if get_authenticated_user(self):
            return True

        if redirect:
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/login")
            self.end_headers()
        else:
            self.send_error_json("Autenticacao obrigatoria", HTTPStatus.UNAUTHORIZED)

        return False

    def is_public_asset(self, path: str) -> bool:
        return path in {"/login.html", "/login.css", "/login.js", "/styles.css"} or path.startswith("/assets/")

    def read_json(self) -> dict:
        size = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(size).decode("utf-8") if size else "{}"
        payload = json.loads(raw)

        if not isinstance(payload, dict):
            raise ValueError("JSON precisa ser um objeto")

        return payload

    def serve_static(self, path: str) -> None:
        clean_path = unquote(path).lstrip("/") or "index.html"
        target = (ROOT_DIR / clean_path).resolve()

        if not str(target).startswith(str(ROOT_DIR)) or not target.exists() or target.is_dir():
            target = ROOT_DIR / "index.html"

        content_type, _ = mimetypes.guess_type(target.name)
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(
        self,
        payload: dict,
        status: HTTPStatus = HTTPStatus.OK,
        cookie: str | None = None,
        clear_cookie: bool = False,
    ) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if cookie:
            self.send_header(
                "Set-Cookie",
                f"{SESSION_COOKIE}={cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_DAYS * 24 * 60 * 60}",
            )
        if clear_cookie:
            self.send_header("Set-Cookie", f"{SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, message: str, status: HTTPStatus) -> None:
        self.send_json({"error": message}, status)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), AltaVetHandler)
    print(f"AltaVet rodando em http://{HOST}:{PORT}")
    print(f"Banco de dados: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()

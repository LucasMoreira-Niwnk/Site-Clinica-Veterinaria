let currentChallenge = null;

const passwordStep = document.querySelector("#passwordStep");
const mfaStep = document.querySelector("#mfaStep");
const mfaSetup = document.querySelector("#mfaSetup");
const mfaTitle = document.querySelector("#mfaTitle");
const qrBox = document.querySelector("#qrBox");
const manualSecret = document.querySelector("#manualSecret");
const loginMessage = document.querySelector("#loginMessage");

passwordStep.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  try {
    const response = await postJson("/api/auth/login", {
      username: document.querySelector("#username").value.trim(),
      password: document.querySelector("#password").value
    });

    currentChallenge = response.challenge;
    passwordStep.classList.add("hidden");
    mfaStep.classList.remove("hidden");
    document.querySelector("#mfaCode").focus();

    if (response.setupRequired) {
      mfaTitle.textContent = "Configurar MFA";
      mfaSetup.classList.remove("hidden");
      qrBox.innerHTML = response.qrSvg || `<p>QR indisponível. Use a chave manual no aplicativo Authenticator.</p>`;
      manualSecret.value = response.secret || "";
    } else {
      mfaTitle.textContent = "Código MFA";
      mfaSetup.classList.add("hidden");
      qrBox.innerHTML = "";
      manualSecret.value = "";
    }
  } catch (error) {
    setMessage(error.message || "Não foi possível autenticar.");
  }
});

mfaStep.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  try {
    await postJson("/api/auth/verify", {
      challenge: currentChallenge,
      code: document.querySelector("#mfaCode").value.trim()
    });
    window.location.href = "/";
  } catch (error) {
    setMessage(error.message || "Código inválido.");
  }
});

document.querySelector("#backToPassword").addEventListener("click", () => {
  currentChallenge = null;
  mfaStep.classList.add("hidden");
  passwordStep.classList.remove("hidden");
  setMessage("");
});

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Erro de autenticação.");
  }

  return data;
}

function setMessage(message) {
  loginMessage.textContent = message;
}

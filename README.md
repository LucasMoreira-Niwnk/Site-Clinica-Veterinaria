# AltaVet

Sistema web simples para cadastro de tutores, pets e agenda da clínica AltaVet.

## Como rodar localmente

Instale as dependências e rode o backend:

```powershell
pip install -r requirements.txt
python server.py
```

Depois abra:

```text
http://localhost:8000
```

O banco será criado automaticamente em:

```text
data/altavet.db
```

## Login e MFA

No primeiro start, se ainda não existir usuário no banco, o sistema cria um administrador inicial.

Credenciais padrão:

```text
Usuário: admin
Senha: AltaVet@2026
```

Em produção, defina uma senha própria antes de iniciar o serviço:

```bash
export ALTAVET_ADMIN_USER=admin
export ALTAVET_ADMIN_PASSWORD='uma-senha-forte-aqui'
```

No primeiro login, escaneie o QR Code com Google Authenticator, Microsoft Authenticator, Authy ou outro aplicativo TOTP compatível.

Depois de entrar, use a seção **Usuários** dentro da aplicação para criar novos acessos. Cada usuário novo recebe uma senha temporária e, no primeiro login, será obrigado a escanear o QR Code do MFA antes de acessar o sistema.

## Variáveis de ambiente

- `ALTAVET_PORT` ou `PORT`: porta HTTP. Padrão: `8000`.
- `ALTAVET_HOST`: host de escuta. Padrão: `0.0.0.0`.
- `ALTAVET_DB`: caminho do arquivo SQLite. Padrão: `data/altavet.db`.

## Deploy em uma VM Oracle

1. Instale Python 3 na VM.
2. Envie os arquivos do projeto para o servidor.
3. Entre na pasta do projeto.
4. Rode `python3 -m pip install -r requirements.txt`.
5. Defina `ALTAVET_ADMIN_PASSWORD` antes do primeiro start.
6. Rode `python3 server.py`.
7. Configure o firewall/security list da Oracle para liberar a porta escolhida.
8. Para produção, rode atrás de Nginx com HTTPS e use `systemd` para manter o processo ativo.

Exemplo de serviço `systemd`:

```ini
[Unit]
Description=AltaVet
After=network.target

[Service]
WorkingDirectory=/opt/altavet
ExecStart=/usr/bin/python3 /opt/altavet/server.py
Restart=always
Environment=ALTAVET_PORT=8000
Environment=ALTAVET_DB=/opt/altavet/data/altavet.db
Environment=ALTAVET_ADMIN_USER=admin
Environment=ALTAVET_ADMIN_PASSWORD=troque-esta-senha

[Install]
WantedBy=multi-user.target
```

## Banco de dados

Os dados ficam no arquivo SQLite `data/altavet.db`.
Em produção, faça backup periódico desse arquivo diretamente no servidor.

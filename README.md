# P2Web Desktop

Navegador + hospedagem de sites P2P. Sites ficam em `p2p://nome` (HTML, JS, CSS, imagens...).

## Rodar (desenvolvimento)
    npm install
    npm start

## Gerar o executável
    npm run dist
- Windows: `dist/P2Web 1.0.0.exe` (portátil, um arquivo só). Rode no Windows.
- Linux: AppImage. macOS: .dmg. (Gere cada um no seu sistema.)
- Sem instalar nada: envie a pasta para um repositório no GitHub; a aba Actions gera os 3 executáveis.

## Limites
- "Livre" = nenhum par alcançado registrou o nome (não há consenso global).
- O site só abre se algum par que o tenha estiver online.
- Só o dono (chave em userData/identity.json) atualiza o site; faça backup.
- Só sites estáticos, ~3,5 MB cada.

## Contas (v1.1)
- Contas locais: usuário + senha. A chave que assina seus sites fica criptografada com a senha (scrypt + AES-256-GCM). **Senha perdida = não há recuperação.**
- "Convidado": só navega; não publica nem salva personalização.
- Personalização (foto, nome, tema, cor, fundo, fonte, formato) é salva por conta em `accounts.json`.
- Logo: `logo.svg`, `logo-wordmark.svg`, `build/icon.png` (ícone do app).

## Senha e admin (v1.2)
- Menu do perfil → **Alterar senha** (a chave da conta é recriptografada; seus sites continuam seus).
- A primeira conta criada (ou a mais antiga, se ainda não houver admin) é **admin**. Admins veem o **Painel admin**: gerenciar contas locais, remover/bloquear sites neste computador. Poderes só locais.

## Instalador (v1.2)
`npm run dist` gera em `dist/`:
- `P2Web-Setup-<versão>.exe` — instalador (atalho na área de trabalho e no menu Iniciar, instala sem admin). **Mande este aos amigos.**
- `P2Web-Portable-<versão>.exe` — versão que roda sem instalar.
Desinstalar não apaga contas nem sites (ficam em `%APPDATA%\P2Web`).

## Atualizações pela própria rede P2P (v1.4, sem GitHub nem servidor)
O app é um "carregador" (`main.js`) + código (`core.js`, `preload.js`, `home.html`, `shell.html`). Atualizações desses 4 arquivos viajam pela rede P2P, assinadas com a SUA chave de atualização; os apps dos amigos só aceitam o que foi assinado por ela.

Uma vez só, ANTES de compilar o instalador:
    npm run keygen        # cria update-pub.txt (vai dentro do app) e update-private.key (SECRETA, faça backup!)

A cada atualização:
1. Edite `core.js` / `home.html` etc.
2. `npm run update -- "o que mudou"`  → gera `updates/update.json`
3. Abra o P2Web com uma conta admin → Painel admin → **Publicar atualização do app…** → escolha `update.json`.
4. Quem estiver online recebe, e o app pergunta se pode reiniciar. Quem estiver offline recebe ao se conectar a qualquer par que já tenha a atualização (deixe o app aberto um tempo).

Quando é preciso recompilar o instalador (e mandar de novo): mudar `package.json`/dependências/ícone/versão do Electron. Um instalador novo (versão nova no `package.json`) ignora atualizações P2P antigas automaticamente.

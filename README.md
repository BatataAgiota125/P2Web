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

## Menu ⋮ dos seus sites (v1.4.x)
Em "Seus sites", o botão ⋮ de cada site abre: Abrir, Editar, Visibilidade, Copiar link e Excluir.
- 🌐 **Público**: aparece na lista de todos e qualquer um abre.
- 🔗 **Só com o link**: fora das listas; abre quem souber o endereço (use um nome difícil de adivinhar).
- 🔒 **Privado**: nada sai do seu computador; só a sua conta abre.
- **Excluir**: remove de quem estiver conectado (se era público). O endereço continua reservado para a sua conta.
- Limites: não dá para apagar cópias que alguém já baixou nem desfazer um link já compartilhado.
- Páginas de erro agora têm botões Voltar / Tentar de novo / Início. Atalhos: Alt+←, Alt+→, F5, Ctrl+L.

## Enviar esta versão aos amigos (sem recompilar)
Esta versão só muda `core.js`, `preload.js`, `home.html` e `shell.html` e mantém `version` = 1.4.0 no `package.json`.
Com a chave já criada (`npm run keygen` antes de gerar o instalador): `npm run update -- "menu dos sites e correções"`
e depois Painel admin → Publicar atualização do app… → `updates/update.json`.

## Busca de sites
A caixa da tela inicial pesquisa os sites que o seu app conhece (todos os públicos da rede + os seus).
- Cada site tem **título, descrição e palavras-chave** (campos ao publicar/editar; ficam no arquivo `p2web.json` do site).
  Sem isso, o app usa o `<title>` e a `<meta name="description">` do `index.html`.
- Ignora acentos e maiúsculas; várias palavras = todas precisam combinar. Pesos: endereço > título > palavra-chave > descrição.
- Sites "só com o link" e privados não aparecem na busca dos outros.
- ↑ ↓ navegam, Enter abre. Sem resultados, Enter tenta abrir o endereço direto.

// Empacota e assina o código: npm run update -- "notas da versão"
const crypto = require('crypto'), fs = require('fs'), pkg = require('../package.json');
const FILES = ['core.js', 'preload.js', 'home.html', 'shell.html'];
if (!fs.existsSync('update-private.key')) { console.log('Rode "npm run keygen" primeiro.'); process.exit(1); }
const priv = crypto.createPrivateKey({ key: Buffer.from(fs.readFileSync('update-private.key', 'utf8').trim(), 'base64'), format: 'der', type: 'pkcs8' });
const pub = fs.readFileSync('update-pub.txt', 'utf8').trim();
const b64 = x => Buffer.from(x).toString('base64');
const files = { 'index.html': b64('<h1>P2Web update</h1>'), 'update-meta.json': b64(JSON.stringify({ base: pkg.version, notes: process.argv[2] || '' })) };
for (const f of FILES) files[f] = fs.readFileSync(f).toString('base64');
const t = Math.floor(Date.now() / 1000);
const b = { name: 'p2web-update', owner: pub, createdAt: t, version: t, files };
b.sig = crypto.sign(null, Buffer.from(JSON.stringify([b.name, b.createdAt, b.version, b.files])), priv).toString('base64');
fs.mkdirSync('updates', { recursive: true });
fs.writeFileSync('updates/update.json', JSON.stringify(b));
console.log(`Criado updates/update.json (para a versão ${pkg.version}, ${Math.round(JSON.stringify(b).length / 1024)} KB).\nAgora: abra o P2Web como admin → Painel admin → Publicar atualização do app…`);

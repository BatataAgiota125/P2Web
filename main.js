// Carregador: usa a atualização P2P mais recente (assinada pela chave do autor) se houver; senão, o código embutido.
const { app } = require('electron');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
global.__P2W_REQUIRE = require;     // para o core.js achar os módulos instalados (hyperswarm)
global.__P2W_VERSION = 0;
let entry = path.join(__dirname, 'core.js');

function verify(b, pub) {
  try {
    if (b.owner !== pub || b.name !== 'p2web-update') return false;
    const k = crypto.createPublicKey({ key: Buffer.from(b.owner, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(JSON.stringify([b.name, b.createdAt, b.version, b.files])), k, Buffer.from(b.sig, 'base64'));
  } catch { return false; }
}
try {
  const pub = fs.readFileSync(path.join(app.getAppPath(), 'update-pub.txt'), 'utf8').trim();
  const root = path.join(app.getPath('userData'), 'code');
  for (const v of fs.readdirSync(root).map(Number).filter(Boolean).sort((a, b) => b - a)) {
    const dir = path.join(root, String(v));
    try {
      const b = JSON.parse(fs.readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
      const meta = JSON.parse(Buffer.from(b.files['update-meta.json'], 'base64'));
      if (pub && meta.base === app.getVersion() && verify(b, pub) && fs.existsSync(path.join(dir, 'core.js'))) {
        entry = path.join(dir, 'core.js'); global.__P2W_VERSION = b.version; break;
      }
    } catch {}
  }
} catch {}
require(entry);

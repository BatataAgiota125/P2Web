// P2Web Desktop: navegador + hospedagem P2P. Endereços: p2p://nome
const { app, BrowserWindow, WebContentsView, ipcMain, protocol, dialog } = require('electron');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Hyperswarm = (global.__P2W_REQUIRE || require)('hyperswarm');

protocol.registerSchemesAsPrivileged([{ scheme: 'p2p',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const MAX = 5 * 1024 * 1024, NAME = /^[a-z0-9-]{1,40}$/, RESERVED = ['home'], TOP = 48;
// Atualizações P2P: só vale o que for assinado com a chave cuja parte pública está em update-pub.txt
const UPDATE_NAME = 'p2web-update', RUNNING = global.__P2W_VERSION || 0;
const TRUSTED = (() => { try { return fs.readFileSync(path.join(app.getAppPath(), 'update-pub.txt'), 'utf8').trim(); } catch { return ''; } })();
let offered = false;
let DATA, win, view, current = null, db = { users: {} };
const sites = new Map(), conns = new Set();

// ---------- identidade e assinatura ----------
const payload = b => Buffer.from(JSON.stringify([b.name, b.createdAt, b.version, b.files]));
// ---------- contas ----------
const DEFAULTS = { theme: 'auto', accent: '#7c5cff', bg: 'aurora', font: 'moderna', shape: 'round', greeting: true, motion: true };
const OPT = { theme: ['auto', 'light', 'dark'], bg: ['aurora', 'grade', 'pontos', 'liso'],
  font: ['moderna', 'serifada', 'mono', 'arredondada'], shape: ['round', 'square'] };
function cleanSettings(s) {
  const o = { ...DEFAULTS }; s = s || {};
  for (const k in OPT) if (OPT[k].includes(s[k])) o[k] = s[k];
  if (/^#[0-9a-f]{6}$/i.test(s.accent)) o.accent = s.accent;
  o.greeting = !!s.greeting; o.motion = !!s.motion; return o;
}
const dbFile = () => path.join(DATA, 'accounts.json');
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(dbFile())); } catch {}
  db.users = db.users || {}; db.blocked = db.blocked || [];
  // se ninguém é admin (ex.: contas criadas antes desta versão), a conta mais antiga vira admin
  const first = Object.keys(db.users)[0];
  if (first && !Object.values(db.users).some(u => u.admin)) { db.users[first].admin = true; saveDb(); }
}
const saveDb = () => fs.writeFileSync(dbFile(), JSON.stringify(db), { mode: 0o600 });
// a chave privada da conta fica criptografada com a senha (scrypt + AES-256-GCM)
const kdf = (pw, salt) => crypto.scryptSync(pw, salt, 32);
function encKey(der, pw) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', kdf(pw, salt), iv);
  const ct = Buffer.concat([c.update(der), c.final()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
function decKey(e, pw) {
  const d = crypto.createDecipheriv('aes-256-gcm', kdf(pw, Buffer.from(e.salt, 'base64')), Buffer.from(e.iv, 'base64'));
  d.setAuthTag(Buffer.from(e.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(e.ct, 'base64')), d.final()]);
}
const pub = () => current
  ? { state: current.guest ? 'guest' : 'user', admin: !!current.admin, username: current.username, name: current.displayName, avatar: current.avatar, settings: current.settings }
  : { state: 'none', settings: db.last || DEFAULTS };
const notify = () => { if (win && !win.isDestroyed()) win.webContents.send('session', pub()); };
function start(u, der) {
  const r = db.users[u];
  current = { guest: false, admin: !!r.admin, username: u, displayName: r.displayName, avatar: r.avatar, settings: cleanSettings(r.settings), pub: r.pub,
    privKey: crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }) };
  notify(); return { ok: true };
}
function register(u, dn, pw) {
  u = String(u || '').toLowerCase(); pw = String(pw || '');
  if (!/^[a-z0-9_]{3,20}$/.test(u)) return { error: 'Usuário: 3 a 20 caracteres (a-z, 0-9, _).' };
  if (db.users[u]) return { error: 'Este usuário já existe.' };
  if (pw.length < 6) return { error: 'A senha precisa de no mínimo 6 caracteres.' };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const der = privateKey.export({ type: 'pkcs8', format: 'der' });
  db.users[u] = { admin: Object.keys(db.users).length === 0, displayName: String(dn || '').trim().slice(0, 30) || u, avatar: null, settings: db.last || DEFAULTS,
    pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), key: encKey(der, pw) };
  saveDb(); return start(u, der);
}
function login(u, pw) {
  u = String(u || '').toLowerCase(); const r = db.users[u]; let der;
  try { der = decKey(r.key, String(pw || '')); } catch { return { error: 'Usuário ou senha incorretos.' }; }
  return start(u, der);
}
const okAvatar = a => typeof a === 'string' && a.length < 250000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(a);
function saveProfile(o) {
  if (!current) return { error: 'Sem sessão.' };
  if (o.settings) current.settings = cleanSettings(o.settings);
  if (!current.guest) {
    const r = db.users[current.username];
    if (typeof o.displayName === 'string' && o.displayName.trim()) r.displayName = current.displayName = o.displayName.trim().slice(0, 30);
    if ('avatar' in o && (o.avatar === null || okAvatar(o.avatar))) r.avatar = current.avatar = o.avatar;
    if (o.settings) r.settings = current.settings;
    db.last = current.settings; saveDb();
  }
  notify(); return { ok: true };
}
function valid(b) {
  try {
    if (!b || !NAME.test(b.name) || (b.name === UPDATE_NAME ? !TRUSTED || b.owner !== TRUSTED : RESERVED.includes(b.name)) || typeof b.files !== 'object' || !b.files['index.html']) return false;
    if (JSON.stringify(b).length > MAX) return false;
    const k = crypto.createPublicKey({ key: Buffer.from(b.owner, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, payload(b), k, Buffer.from(b.sig, 'base64'));
  } catch { return false; }
}
// Primeiro dono visto fica com o nome; só ele publica versões novas.
function accept(b) {
  if (!valid(b) || db.blocked.includes(b.name)) return false;
  const c = sites.get(b.name);
  if (c && !(c.owner === b.owner && b.version > c.version)) return false;
  sites.set(b.name, b);
  fs.writeFileSync(path.join(DATA, 'store', b.name + '.json'), JSON.stringify(b));
  if (b.name === UPDATE_NAME) installUpdate(b);
  return true;
}

// ---------- atualização do código via P2P ----------
const CODE_FILES = ['core.js', 'preload.js', 'home.html', 'shell.html', 'index.html', 'update-meta.json'];
function installUpdate(b) {
  try {
    const meta = JSON.parse(Buffer.from(b.files['update-meta.json'], 'base64'));
    if (meta.base !== app.getVersion() || !b.files['core.js']) return;       // só para a versão instalada
    const root = path.join(DATA, 'code'), dir = path.join(root, String(b.version));
    fs.mkdirSync(dir, { recursive: true });
    for (const n of CODE_FILES) if (b.files[n]) fs.writeFileSync(path.join(dir, n), Buffer.from(b.files[n], 'base64'));
    fs.writeFileSync(path.join(dir, 'bundle.json'), JSON.stringify(b));
    for (const v of fs.readdirSync(root)) if (+v < b.version) fs.rmSync(path.join(root, v), { recursive: true, force: true });
    if (b.version > RUNNING && !offered) {
      offered = true;
      const o = { type: 'info', buttons: ['Reiniciar agora', 'Depois'], defaultId: 0, title: 'Atualização do P2Web',
        message: 'Há uma atualização do P2Web pronta.', detail: (meta.notes ? meta.notes + '\n\n' : '') + 'Reinicie para aplicar. Se escolher "Depois", ela vale na próxima vez que abrir o app.' };
      const a = win && !win.isDestroyed() ? [win, o] : [o];
      dialog.showMessageBox(...a).then(r => { if (r.response === 0) { app.relaunch(); app.quit(); } });
    }
  } catch {}
}

// ---------- rede P2P ----------
const broadcast = m => conns.forEach(s => s.write(JSON.stringify(m) + '\n'));
function handle(m, send) {
  if (m.t === 'index') {
    for (const x of m.list || []) {
      const c = sites.get(x.name);
      if (NAME.test(x.name) && !db.blocked.includes(x.name) && (!c || (c.owner === x.owner && x.version > c.version))) send({ t: 'get', name: x.name });
    }
  } else if (m.t === 'get') { const b = sites.get(m.name); if (b) send({ t: 'bundle', b }); }
  else if (m.t === 'bundle' && accept(m.b)) broadcast({ t: 'bundle', b: m.b });
}
function startNetwork() {
  const swarm = new Hyperswarm();
  swarm.on('connection', sock => {
    conns.add(sock);
    const send = o => sock.write(JSON.stringify(o) + '\n');
    send({ t: 'index', list: [...sites.values()].map(b => ({ name: b.name, owner: b.owner, version: b.version })) });
    let buf = '';
    sock.on('data', d => {
      buf += d;
      if (buf.length > MAX * 2) return sock.destroy();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { handle(JSON.parse(line), send); } catch {}
      }
    });
    sock.on('close', () => conns.delete(sock));
    sock.on('error', () => {});
  });
  swarm.join(crypto.createHash('sha256').update('p2web-v1').digest(), { server: true, client: true });
  app.on('before-quit', () => swarm.destroy());
}

// ---------- protocolo p2p:// ----------
const MIME = { html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
  json: 'application/json', txt: 'text/plain', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon', mp3: 'audio/mpeg',
  mp4: 'video/mp4', webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', wasm: 'application/wasm', xml: 'application/xml' };
const mime = p => { const t = MIME[path.extname(p).slice(1).toLowerCase()] || 'application/octet-stream';
  return /^(text|application\/(json|xml))/.test(t) || t.includes('javascript') ? t + '; charset=utf-8' : t; };
const page = (code, msg) => new Response(`<meta charset=utf-8><body style="font-family:sans-serif;text-align:center;margin-top:20vh"><h2>${msg}</h2>`,
  { status: code, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

function registerProtocol() {
  protocol.handle('p2p', req => {
    const u = new URL(req.url);
    if (u.hostname === 'home') return new Response(fs.readFileSync(path.join(__dirname, 'home.html')), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const b = sites.get(u.hostname);
    if (!b) return page(404, 'Site não encontrado na rede (ainda). Tente novamente em alguns segundos.');
    let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    const data = b.files[p] ?? b.files[p + '/index.html'];
    if (data === undefined) return page(404, 'Arquivo não encontrado neste site.');
    return new Response(Buffer.from(data, 'base64'), { headers: { 'Content-Type': mime(p), 'X-Content-Type-Options': 'nosniff' } });
  });
}

// ---------- publicação ----------
function walk(d, base = d, out = {}) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p, base, out); }
    else out[path.relative(base, p).split(path.sep).join('/')] = fs.readFileSync(p).toString('base64');
  }
  return out;
}
function publish(name, { dir, code }) {
  if (!current || current.guest) return { error: 'Entre com uma conta para publicar sites.' };
  name = String(name || '').trim().toLowerCase();
  if (!NAME.test(name) || RESERVED.includes(name) || name === UPDATE_NAME) return { error: 'Nome inválido (use a-z, 0-9 e hífen, até 40).' };
  const old = sites.get(name);
  if (old && old.owner !== current?.pub) return { error: 'Este endereço já está ocupado.' };
  let files;
  try { files = dir ? walk(dir) : { 'index.html': Buffer.from(code || '').toString('base64') }; }
  catch (e) { return { error: 'Não consegui ler a pasta.' }; }
  if (!files['index.html']) return { error: 'A pasta precisa ter um index.html.' };
  const b = { name, owner: current?.pub, createdAt: old ? old.createdAt : Date.now(), version: old ? old.version + 1 : 1, files };
  b.sig = crypto.sign(null, payload(b), current.privKey).toString('base64');
  if (!accept(b)) return { error: 'Site grande demais (máx. ~3,5 MB).' };
  broadcast({ t: 'bundle', b });
  return { ok: true, version: b.version };
}

// ---------- janela ----------
function toUrl(t) {
  t = String(t || '').trim().replace(/^p2p:\/\//i, '');
  const i = t.indexOf('/');
  const host = (i < 0 ? t : t.slice(0, i)).toLowerCase().replace(/\.p2p$/, '');
  if (!NAME.test(host)) return 'p2p://home/';
  return 'p2p://' + host + (i < 0 ? '/' : t.slice(i));
}
function layout() { const [w, h] = win.getContentSize(); view.setBounds({ x: 0, y: TOP, width: w, height: h - TOP }); }

function createWindow() {
  const prefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true };
  win = new BrowserWindow({ width: 1100, height: 760, title: 'P2Web', icon: path.join(app.getAppPath(), 'build', 'icon.png'), autoHideMenuBar: true, webPreferences: prefs });
  win.loadFile(path.join(__dirname, 'shell.html'));
  win.webContents.on('did-finish-load', notify);
  view = new WebContentsView({ webPreferences: prefs });
  win.contentView.addChildView(view);
  layout(); win.on('resize', layout);
  const wc = view.webContents;
  const upd = (_, u) => { if (!win.isDestroyed()) win.webContents.send('url', u.startsWith('p2p://home') ? '' : u.replace('p2p://', '').replace(/\/$/, '')); };
  wc.on('did-navigate', upd); wc.on('did-navigate-in-page', upd);
  wc.setWindowOpenHandler(({ url }) => { if (url.startsWith('p2p://')) wc.loadURL(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!url.startsWith('p2p://')) e.preventDefault(); }); // só navega dentro da rede P2P
  wc.loadURL('p2p://home/');
  ipcMain.on('nav', (e, t) => { if (e.sender === win.webContents && current) wc.loadURL(toUrl(t)); });
  ipcMain.on('cmd', (e, c) => {
    if (e.sender !== win.webContents || !current) return;
    if (c === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (c === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    if (c === 'reload') wc.reload();
    if (c === 'home') wc.loadURL('p2p://home/');
  });
}

// só a página inicial (p2p://home) pode usar a API; sites comuns não têm acesso
const fromHome = e => (e.senderFrame?.url || '').startsWith('p2p://home/');
function changePassword(oldPw, newPw) {
  if (!current || current.guest) return { error: 'Entre com uma conta.' };
  newPw = String(newPw || '');
  if (newPw.length < 6) return { error: 'A nova senha precisa de no mínimo 6 caracteres.' };
  const r = db.users[current.username]; let der;
  try { der = decKey(r.key, String(oldPw || '')); } catch { return { error: 'Senha atual incorreta.' }; }
  r.key = encKey(der, newPw); saveDb(); return { ok: true };
}
// ---------- admin (poderes locais: valem só neste computador) ----------
const sitesOf = pk => [...sites.values()].filter(b => b.owner === pk);
function adminUsers() {
  return Object.entries(db.users).map(([u, r]) => ({ username: u, displayName: r.displayName, admin: !!r.admin, sites: sitesOf(r.pub).length, me: u === current.username }));
}
function adminSites() {
  const owners = Object.fromEntries(Object.entries(db.users).map(([u, r]) => [r.pub, u]));
  return { blocked: db.blocked, sites: [...sites.values()].map(b => ({ name: b.name, version: b.version,
    kb: Math.round(JSON.stringify(b).length / 1024), owner: owners[b.owner] ? '@' + owners[b.owner] : 'outro par' })) };
}
function dropSite(name, block) {
  sites.delete(name); fs.rmSync(path.join(DATA, 'store', name + '.json'), { force: true });
  if (block && !db.blocked.includes(name)) { db.blocked.push(name); saveDb(); }
}
function setupIpc() {
  const isAdmin = e => fromHome(e) && current && current.admin;
  ipcMain.handle('changePassword', (e, o, n) => fromHome(e) ? changePassword(o, n) : null);
  ipcMain.handle('adminUsers', e => isAdmin(e) ? adminUsers() : []);
  ipcMain.handle('adminSites', e => isAdmin(e) ? adminSites() : { sites: [], blocked: [] });
  ipcMain.handle('adminSetAdmin', (e, u, v) => {
    const r = db.users[u]; if (!isAdmin(e) || !r || u === current.username) return { error: 'Não permitido.' };
    r.admin = !!v; saveDb(); return { ok: true };
  });
  ipcMain.handle('adminRemoveUser', (e, u, withSites) => {
    const r = db.users[u]; if (!isAdmin(e) || !r || u === current.username) return { error: 'Não permitido.' };
    if (withSites) sitesOf(r.pub).forEach(b => dropSite(b.name, false));
    delete db.users[u]; saveDb(); return { ok: true };
  });
  ipcMain.handle('adminRemoveSite', (e, n, block) => {
    if (!isAdmin(e) || !NAME.test(n)) return { error: 'Não permitido.' };
    dropSite(n, !!block); return { ok: true };
  });
  ipcMain.handle('adminPublishUpdate', async e => {
    if (!isAdmin(e)) return { error: 'Não permitido.' };
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Atualização', extensions: ['json'] }] });
    if (r.canceled) return { canceled: true };
    try {
      const b = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      if (b.name !== UPDATE_NAME || !accept(b)) return { error: 'Arquivo inválido, não assinado com a sua chave de atualização, ou não é mais novo que o atual.' };
      broadcast({ t: 'bundle', b }); return { ok: true };
    } catch { return { error: 'Não consegui ler o arquivo.' }; }
  });
  ipcMain.handle('adminUnblock', (e, n) => {
    if (!isAdmin(e)) return { error: 'Não permitido.' };
    db.blocked = db.blocked.filter(x => x !== n); saveDb(); return { ok: true };
  });
  ipcMain.handle('session', e => fromHome(e) ? pub() : null);
  ipcMain.handle('accounts', e => fromHome(e) ? Object.entries(db.users).map(([u, r]) => ({ username: u, displayName: r.displayName, avatar: r.avatar })) : []);
  ipcMain.handle('register', (e, u, d, p) => fromHome(e) ? register(u, d, p) : null);
  ipcMain.handle('login', (e, u, p) => fromHome(e) ? login(u, p) : null);
  ipcMain.handle('guest', e => { if (!fromHome(e)) return null;
    current = { guest: true, username: '', displayName: 'Convidado', avatar: null, settings: cleanSettings(db.last) }; notify(); return { ok: true }; });
  ipcMain.handle('logout', e => { if (!fromHome(e)) return null; current = null; notify(); return { ok: true }; });
  ipcMain.handle('save', (e, o) => fromHome(e) ? saveProfile(o || {}) : null);
  ipcMain.handle('status', e => fromHome(e) ? { peers: conns.size, sites: sites.size } : null);
  ipcMain.handle('sites', e => fromHome(e) ? [...sites.values()].filter(b => b.name !== UPDATE_NAME).map(b => ({ name: b.name, mine: b.owner === current?.pub, version: b.version })) : []);
  ipcMain.handle('check', (e, n) => {
    if (!fromHome(e)) return null;
    n = String(n || '').toLowerCase(); const b = sites.get(n);
    return { valid: NAME.test(n) && !RESERVED.includes(n) && n !== UPDATE_NAME, free: !b, mine: !!b && b.owner === current?.pub };
  });
  ipcMain.handle('pickFolder', async e => {
    if (!fromHome(e)) return null;
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('publish', (e, name, opts) => fromHome(e) ? publish(name, opts || {}) : { error: 'proibido' });
}

app.whenReady().then(() => {
  DATA = app.getPath('userData');
  fs.mkdirSync(path.join(DATA, 'store'), { recursive: true });
  loadDb();
  for (const f of fs.readdirSync(path.join(DATA, 'store'))) {
    try { const b = JSON.parse(fs.readFileSync(path.join(DATA, 'store', f))); if (valid(b)) sites.set(b.name, b); } catch {}
  }
  registerProtocol(); setupIpc(); startNetwork(); createWindow();
});
app.on('window-all-closed', () => app.quit());

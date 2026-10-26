const { contextBridge, ipcRenderer } = require('electron');
const inv = c => (...a) => ipcRenderer.invoke(c, ...a);
if (location.protocol === 'file:') {            // barra de navegação
  contextBridge.exposeInMainWorld('shell', {
    nav: t => ipcRenderer.send('nav', t),
    cmd: c => ipcRenderer.send('cmd', c),
    onUrl: f => ipcRenderer.on('url', (_, u) => f(u)),
    onSession: f => ipcRenderer.on('session', (_, s) => f(s)),
  });
} else if (location.protocol === 'p2p:' && location.hostname === 'home') {   // página inicial
  const api = {}; // nome da função -> canal IPC
  for (const k of ['session', 'accounts', 'register', 'login', 'guest', 'logout', 'save', 'status', 'sites', 'check', 'pickFolder', 'publish', 'changePassword', 'adminUsers', 'adminSites', 'adminSetAdmin', 'adminRemoveUser', 'adminRemoveSite', 'adminUnblock', 'adminPublishUpdate']) api[k] = inv(k);
  contextBridge.exposeInMainWorld('p2p', api);
}

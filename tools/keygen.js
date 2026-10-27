// Cria a chave de atualização. Rode UMA vez: npm run keygen
const crypto = require('crypto'), fs = require('fs');
if (fs.existsSync('update-private.key')) {
  console.log('update-private.key já existe. Trocar a chave desliga as atualizações P2P dos apps já instalados. Apague o arquivo só se tiver certeza.');
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync('update-pub.txt', publicKey.export({ type: 'spki', format: 'der' }).toString('base64'));
fs.writeFileSync('update-private.key', privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), { mode: 0o600 });
console.log('Chaves criadas.\n- update-pub.txt: vai dentro do app (compile o instalador DEPOIS disto).\n- update-private.key: SECRETA. Faça backup e nunca envie a ninguém.');

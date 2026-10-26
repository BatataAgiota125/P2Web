// Embute o ícone no P2Web.exe. O rcedit não aceita caminhos com acentos (ex.: "Área de Trabalho"),
// então o trabalho é feito numa pasta temporária só com caracteres ASCII.
const path = require('path'), fs = require('fs'), os = require('os');

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe');
  const ico = path.join(ctx.packager.projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(ico)) throw new Error('Arquivo não encontrado: ' + ico + '\nCopie a pasta "build" (com icon.ico e icon.png) para dentro da pasta do projeto.');

  let base = os.tmpdir();
  if (/[^\x20-\x7e]/.test(base)) base = path.join(process.env.SystemDrive || 'C:', 'p2web-tmp'); // temp com acento
  fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, 'p2web-'));
  const tExe = path.join(tmp, 'P2Web.exe'), tIco = path.join(tmp, 'icon.ico');

  try {
    fs.copyFileSync(exe, tExe);
    fs.copyFileSync(ico, tIco);
    const mod = await import('rcedit');
    const rcedit = mod.rcedit || mod.default;
    await rcedit(tExe, {
      icon: tIco,
      'version-string': { ProductName: 'P2Web', FileDescription: 'P2Web', OriginalFilename: 'P2Web.exe' },
    });
    fs.copyFileSync(tExe, exe);
    console.log('  • ícone embutido em', exe);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

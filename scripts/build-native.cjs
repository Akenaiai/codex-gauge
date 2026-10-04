const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'native', 'bin'), { recursive: true });
if (process.platform !== 'win32') process.exit(0);
const framework = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const references = ['UIAutomationClient.dll', 'UIAutomationTypes.dll', 'WindowsBase.dll'].map(name => {
  const base = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'assembly', 'GAC_MSIL', name.replace('.dll', ''));
  const version = fs.readdirSync(base).find(p => fs.existsSync(path.join(base, p, name)));
  if (!version) throw new Error(`Missing .NET reference: ${name}`);
  return '/reference:' + path.join(base, version, name);
});
for (const [name, target, refs] of [['GaugeHost', 'exe', references], ['GaugeStarter', 'winexe', ['/reference:Microsoft.CSharp.dll', '/reference:System.Core.dll', '/reference:System.Web.Extensions.dll']]]) {
  const input = path.join(root, 'native', name + '.cs');
  const output = path.join(root, 'native/bin', name + '.exe');
  if (fs.existsSync(output) && fs.statSync(output).mtimeMs >= fs.statSync(input).mtimeMs) continue;
  const r = spawnSync(path.join(framework, 'csc.exe'), ['/nologo', '/target:' + target, '/optimize+', '/out:' + output, ...refs, input], { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

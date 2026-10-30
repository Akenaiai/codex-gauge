const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'native', 'bin'), { recursive: true });
if (process.platform === 'darwin') {
  const result = spawnSync('/usr/bin/swiftc', ['-O', '-parse-as-library', path.join(root, 'native/GaugeHostMac.swift'), '-o', path.join(root, 'native/bin/GaugeHostMac')], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const headers = [process.env.NODE_INCLUDE, path.resolve(path.dirname(process.execPath), '../include/node'), '/opt/homebrew/include/node', '/usr/local/include/node', path.join(process.env.HOME, 'Library/Caches/node-gyp', process.versions.node, 'include/node')].filter(Boolean).find(p => fs.existsSync(path.join(p, 'node_api.h')));
  if (!headers) throw new Error('Node-API headers missing. Set NODE_INCLUDE to the existing Node include directory.');
  for (const [command, args] of [
    ['/usr/bin/swiftc', ['-O', '-D', 'GAUGE_NODE_LIBRARY', '-emit-library', path.join(root, 'native/GaugeHostMac.swift'), '-Xlinker', '-install_name', '-Xlinker', '@rpath/libGaugeHostMac.dylib', '-o', path.join(root, 'native/bin/libGaugeHostMac.dylib')]],
    ['/usr/bin/clang++', ['-std=c++17', '-bundle', '-undefined', 'dynamic_lookup', '-I' + headers, path.join(root, 'native/GaugeHostAddon.cc'), '-L' + path.join(root, 'native/bin'), '-lGaugeHostMac', '-Wl,-rpath,@loader_path', '-o', path.join(root, 'native/bin/GaugeHostMac.node')]]
  ]) {
    const built = spawnSync(command, args, { stdio: 'inherit' });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }
  const follow = spawnSync('/usr/bin/swiftc', ['-O', path.join(root, 'native/GaugeFollowMac.swift'), '-o', path.join(root, 'native/bin/GaugeFollowMac')], { stdio: 'inherit' });
  process.exit(follow.status ?? 1);
}
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

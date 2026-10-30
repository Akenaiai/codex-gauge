'use strict';
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

function verifyPackage(resources, platform) {
  const archive = path.join(resources, 'app.asar');
  const names = new Set(asar.listPackage(archive).map(name => name.replace(/\\/g, '/').replace(/^\//, '')));
  const missing = [];
  for (const file of ['src/main.cjs', 'src/preload.cjs', 'src/ui/index.html', 'src/ui/credits.html', 'src/ui/credits.js']) {
    if (!names.has(file)) missing.push(file);
  }
  for (const file of names) {
    if (!file.endsWith('.cjs')) continue;
    const source = asar.extractFile(archive, path.normalize(file)).toString();
    for (const match of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      if (![target, target + '.cjs', target + '.js', target + '/index.js'].some(name => names.has(name))) missing.push(file + ' -> ' + target);
    }
  }
  const external = ['mcp/scripts/gauge-mcp.cjs', 'mcp/src/catalog.cjs', 'mcp/src/credit-model.cjs', 'mcp/src/credit-policies.cjs', 'mcp/src/credit-date-observations.cjs', 'adapters/relay-credit-bridge.py'];
  if (platform === 'darwin') external.push('native/GaugeHostMac.node', 'native/libGaugeHostMac.dylib', 'native/GaugeFollowMac');
  if (platform === 'win32') external.push('native/GaugeHost.exe', 'native/GaugeStarter.exe');
  for (const file of external) if (!fs.existsSync(path.join(resources, file))) missing.push(file);
  if (missing.length) throw new Error('Incomplete packaged application:\n' + missing.join('\n'));
  console.log('Packaged application dependency and companion files verified.');
}
exports.verifyPackage = verifyPackage;
exports.default = async context => {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app/Contents/Resources')
    : path.join(context.appOutDir, 'resources');
  verifyPackage(resources, context.electronPlatformName);
};
if (require.main === module) verifyPackage(process.argv[2], process.argv[3]);

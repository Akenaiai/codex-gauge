'use strict';
const path = require('node:path');
const { execFile } = require('node:child_process');
function createStartup(app, root, run = execFile) {
  const helper = path.join(app.isPackaged ? process.resourcesPath : root, app.isPackaged ? 'native' : 'native/bin', 'GaugeStarter.exe');
  const command = (...args) => new Promise((resolve, reject) => run(helper, args, { windowsHide: true, timeout: 15000 }, error => error ? reject(error) : resolve()));
  return {
    async set(enabled) {
      if (process.platform !== 'win32') { app.setLoginItemSettings({ openAtLogin: enabled }); return; }
      if (enabled) { await command('--resume'); await command('--enable', process.execPath); }
      else await command('--disable');
      // Remove the old login-only entry only after replacement registration succeeds.
      app.setLoginItemSettings({ openAtLogin: false });
    },
    pause: () => process.platform === 'win32' ? command('--pause') : Promise.resolve()
  };
}
module.exports = { createStartup };

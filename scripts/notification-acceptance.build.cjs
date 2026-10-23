// A separate NSIS install identity keeps native activation and synthetic inputs
// isolated from the user's installed Gauge and startup registration.
const build = require('../package.json').build;
module.exports = { ...build, appId: 'com.aken.codexgauge.acceptance', productName: 'Codex Gauge Acceptance',
  extraMetadata: { main: 'scripts/notification-acceptance.cjs' },
  files: [...build.files, 'scripts/notification-acceptance.cjs'],
  directories: { output: '.local/notification-acceptance-build' },
  nsis: { ...build.nsis, createDesktopShortcut: false, runAfterFinish: false } };

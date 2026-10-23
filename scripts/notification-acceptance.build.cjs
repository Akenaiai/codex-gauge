// A separate NSIS install identity keeps native activation and synthetic inputs
// isolated from the user's installed Gauge and startup registration.
const build = require('../package.json').build;
module.exports = { ...build, appId: 'com.aken.codexgauge.acceptance', productName: 'Codex Gauge Acceptance',
  extraMetadata: { main: 'scripts/notification-acceptance.cjs' },
  files: [...build.files, 'scripts/notification-acceptance.cjs'],
  extraResources: [],
  directories: { output: '.local/notification-acceptance-build' },
  nsis: { ...build.nsis, include: 'scripts/notification-acceptance.nsh', createDesktopShortcut: false, runAfterFinish: false } };

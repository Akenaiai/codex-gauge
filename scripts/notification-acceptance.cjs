'use strict';
// Development-only native acceptance. Deliberately excluded from production packages.
// Both Git and the separately packaged acceptance app exercise the production main.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const Module = require('node:module'), { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream');
const E = require('electron');
const ROOT = path.resolve(__dirname, '..');
const APP_ID = 'com.aken.codexgauge.acceptance';
const CLSID = '{8bb688cf-a6e4-46ba-8fe9-fc36541dbd07}';
const directory = path.join(os.tmpdir(), 'codex-gauge-notification-acceptance');
fs.mkdirSync(directory, { recursive: true });
const profile = path.join(directory, 'profile');
E.app.setPath('userData', profile); E.app.setPath('sessionData', profile);
E.app.disableHardwareAcceleration();
const log = (kind, details = {}) => fs.appendFileSync(path.join(directory, 'events.jsonl'),
  JSON.stringify({ at: new Date().toISOString(), pid: process.pid, kind, ...details }) + '\n');
const hash = file => fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const protectedFiles = [path.join(os.homedir(), 'AppData/Roaming/Codex Gauge/settings.json'),
  path.join(os.homedir(), 'AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Roaming/Codex Gauge/settings.json')];
const before = protectedFiles.map(hash);
const fixtureFile = path.join(directory, 'fixture.json');
if (!fs.existsSync(fixtureFile)) fs.writeFileSync(fixtureFile, JSON.stringify({ resetsAt: Date.now() + 90 * 60000 }));
let fixture = JSON.parse(fs.readFileSync(fixtureFile)), quota, feed, toastCount = 0;
const { Store } = require('../src/store.cjs');
const settings = new Store(profile);
if (!fs.existsSync(settings.file)) settings.save({ notifications: true, autostart: false });
if (settings.settings.autostart) throw new Error('Acceptance profile must have autostart disabled');
const RealQuota = require('../src/cli.cjs').QuotaService;
class TestQuota extends RealQuota {
  constructor() { super(); quota = this; }
  async connect() {
    this.rpc = { stop() {}, call: async method => {
      if (method === 'account/read') return { account: { type: 'chatgpt', email: 'notification-test@example.invalid' } };
      if (method === 'account/rateLimits/read') return { rateLimits: { primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: fixture.resetsAt / 1000 } },
        rateLimitResetCredits: { credits: fixture.creditAt ? [{ id: 'synthetic-credit', status: 'available', expiresAt: fixture.creditAt / 1000 }] : [] } };
      throw new Error('Unexpected synthetic RPC');
    } }; return this.rpc;
  }
}
const RealFeed = require('../src/reset-feed.cjs').ResetFeed;
class TestFeed extends RealFeed {
  constructor() { super({ request: async () => new Response(JSON.stringify({ schemaVersion: 1, checkedAt: new Date().toISOString(), events: [{
    id: 'synthetic-baseline', type: 'direct_reset', status: 'confirmed', updatedAt: new Date(fixture.resetsAt - 90 * 60000).toISOString(), posts: [] }] })) }); feed = this; }
}
let access;
const panelState = () => ({ visible: access?.panel?.isVisible() || false, focused: access?.panel?.isFocused() || false });
function Notification(options) {
  const n = new E.Notification({ ...options, title: '[Gauge acceptance] ' + options.title });
  toastCount++;
  log('notification_created', { id: options.id, toastCount });
  for (const kind of ['show', 'failed', 'click', 'close']) n.on(kind, () => log('native_' + kind, { id: options.id }));
  return n;
}
Notification.isSupported = () => E.Notification.isSupported();
Notification.handleActivation = callback => E.Notification.handleActivation(details => {
  log('native_activation', { type: details.type }); callback(details);
  setTimeout(() => log('panel_after_activation', panelState()), 500);
});
const app = new Proxy(E.app, { get(target, property) {
  if (property === 'setName') return () => target.setName('Codex Gauge Acceptance');
  if (property === 'setAppUserModelId') return () => target.setAppUserModelId(APP_ID);
  if (property === 'setToastActivatorCLSID') return () => target.setToastActivatorCLSID(CLSID);
  const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
} });
const filename = path.join(ROOT, 'src/main.cjs'), load = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === filename) {
    if (request === 'electron') return { ...E, app, Notification, shell: { openExternal: async () => { throw new Error('External navigation disabled'); } } };
    if (request === './cli.cjs') return { QuotaService: TestQuota };
    if (request === './reset-feed.cjs') return { ResetFeed: TestFeed, PAGE: 'https://aihot.news/codex-reset' };
    if (request === './startup.cjs') return { createStartup: () => ({ set: async () => { throw new Error('Startup mutation blocked'); } }) };
    if (request === 'node:child_process') return { spawn() {
      const child = new EventEmitter(); child.stdout = new PassThrough();
      const heartbeat = setInterval(() => child.stdout.write(JSON.stringify({ exists: true, foreground: false, anchored: false }) + '\n'), 1000);
      child.kill = () => { clearInterval(heartbeat); child.stdout.end(); }; return child;
    } };
  }
  return load.call(this, request, parent, isMain);
};
globalThis.fetch = async () => { throw new Error('Real network disabled'); };
log('start', { packaged: E.app.isPackaged, electron: process.versions.electron, appId: APP_ID, source: hash(filename), noRealInputs: true });
const main = new Module(filename, module); main.filename = filename; main.paths = Module._nodeModulePaths(path.dirname(filename));
main._compile(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = { action, get panel() { return panel; }, get store() { return store; } };', filename);
access = main.exports;
E.app.on('second-instance', () => {
  log('second_instance'); setTimeout(() => log('panel_after_second_instance', panelState()), 500);
});
let busy = false;
const commandFile = path.join(directory, 'command.json');
const control = setInterval(async () => {
  if (busy || !fs.existsSync(commandFile)) return;
  busy = true;
  try {
    const { name } = JSON.parse(fs.readFileSync(commandFile, 'utf8')); fs.unlinkSync(commandFile);
    if (name === 'quit') E.app.quit();
    else if (name === 'close') await access.action('close');
    else if (name === 'snapshot') log('snapshot', { ...panelState(), toastCount, ledgerCount: Object.keys(access.store.ledger).length });
    else if (name === 'new' || name === 'credit') {
      if (name === 'new') fixture.resetsAt = Date.now() + 89 * 60000;
      else fixture.creditAt = Date.now() + 36 * 3600000;
      fs.writeFileSync(fixtureFile, JSON.stringify(fixture)); await quota.refresh();
    } else throw new Error('Unknown acceptance command');
    log('command_done', { name, toastCount });
  } catch (error) { log('command_failed', { error: error.message }); }
  finally { busy = false; }
}, 300);
E.app.on('before-quit', () => {
  clearInterval(control);
  log('protected_settings', { unchanged: JSON.stringify(before) === JSON.stringify(protectedFiles.map(hash)) });
});
E.app.whenReady().then(() => setTimeout(() => log('ready', { toastCount, ledgerCount: Object.keys(access.store.ledger).length,
  packaged: E.app.isPackaged, nativeSupport: E.Notification.isSupported(), ...panelState() }), 3500));

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMacStartup, LABEL } = require('../src/mac-startup.cjs');
// LaunchAgent round-trips use macOS filesystem semantics; validate them on the Mac runner.
const macTest = (name, fn) => test(name, { skip: process.platform !== 'darwin' }, fn);
function fixture({ fail = false, previous = null, loginFailure = false } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-launch-agent-'));
  const data = path.join(home, 'data'), resources = path.join(home, 'resources');
  fs.mkdirSync(path.join(resources, 'native'), { recursive: true });
  fs.writeFileSync(path.join(resources, 'native/GaugeFollowMac'), 'fixture');
  const target = path.join(home, 'Library/LaunchAgents', LABEL + '.plist');
  if (previous) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, previous); }
  const calls = []; let loaded = !!previous;
  const app = { isPackaged: true, getPath: name => name === 'userData' ? data : path.join(home, 'Gauge & One.app/Contents/MacOS/Gauge'), setLoginItemSettings: x => { calls.push(['login', x.openAtLogin]); if (loginFailure) throw new Error('login_cleanup_failed'); } };
  const run = (_file, args, _options, done) => {
    calls.push(args);
    if (args[0] === 'print' && !loaded) return done(new Error('not_loaded'));
    if (args[0] === 'bootout') loaded = false;
    if (args[0] === 'bootstrap') { if (fail) return done(new Error('registration_failed')); loaded = true; }
    done(null);
  };
  return { startup: createMacStartup(app, '.', run, { home, uid: 501, resourcesPath: resources }), home, data, target, calls };
}
macTest('Mac registers a portable helper and disabling preserves recoverable configuration', async () => {
  const f = fixture(); await f.startup.set(true);
  const text = fs.readFileSync(f.target, 'utf8');
  assert.ok(text.includes('Gauge &amp; One.app')); assert.ok(text.includes('GaugeFollowMac'));
  assert.ok(f.calls.some(c => c[0] === 'bootstrap'));
  await f.startup.set(false); assert.equal(fs.existsSync(f.target), false);
  assert.ok(fs.readdirSync(path.join(f.data, 'startup-backups')).some(n => n.startsWith('disabled-')));
});
macTest('Mac registration failure restores a prior known helper entry', async () => {
  const previous = `<plist><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array><string>/old/codex-gauge-follow</string></array></dict></plist>`;
  const f = fixture({ fail: true, previous });
  await assert.rejects(f.startup.set(true), /registration_failed/);
  assert.equal(fs.readFileSync(f.target, 'utf8'), previous);
  assert.equal(f.calls.some(c => c[0] === 'login'), false);
});
macTest('Mac refuses an unknown owner instead of overwriting a same-name launch job', async () => {
  const f = fixture({ previous: '<plist>unrelated-job</plist>' });
  await assert.rejects(f.startup.set(true), /startup_entry_conflict/);
  assert.equal(f.calls.length, 0);
});
macTest('Mac manual quit pause is tied to the observed host process, not permanently disabled', async () => {
  const f = fixture(); fs.mkdirSync(f.data);
  fs.writeFileSync(path.join(f.data, 'follow-status.json'), JSON.stringify({ hostPids: [123] }));
  await f.startup.pause();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.data, 'follow-pause.json'))).hostPids, [123]);
});
macTest('failure after bootstrap stops the new job and restores the previous loaded helper', async () => {
  const previous = `<plist><dict><key>Label</key><string>${LABEL}</string><array><string>/old/codex-gauge-follow</string></array></dict></plist>`;
  const f = fixture({ previous, loginFailure: true });
  await assert.rejects(f.startup.set(true), /login_cleanup_failed/);
  assert.equal(fs.readFileSync(f.target, 'utf8'), previous);
  assert.equal(f.calls.filter(c => c[0] === 'bootout').length, 2);
  assert.equal(f.calls.filter(c => c[0] === 'bootstrap').length, 2);
});

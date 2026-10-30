const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/main.cjs', 'utf8');
function fixture(platform, pause) {
  let handler, prevented = 0, quits = 0, stops = 0;
  const context = vm.createContext({
    process: { platform }, store: { settings: { autostart: true } }, startup: { pause },
    quitting: false,
    app: { on(_event, fn) { handler = fn; }, quit() { quits++; handler(event); } },
    center: { stop() { stops++; } }, delivery: null, quota: null, resetFeed: null, observer: null, tray: null,
    reminderTimer: null, watchdog: null, dragTimer: null, leaveTimer: null, hoverTimer: null,
    clearInterval() {}, clearTimeout() {}
  });
  const event = { preventDefault() { prevented++; } };
  vm.runInContext(source.slice(source.indexOf("app.on('before-quit'"), source.indexOf("app.on('window-all-closed'")), context);
  return { quit: () => handler(event), state: () => ({ prevented, quits, stops, quitting: context.quitting }) };
}
test('Mac keyboard/menu quit persists a durable pause before teardown without cancelling native quit', () => {
  const events = [];
  const f = fixture('darwin', () => { events.push('persisted'); });
  f.quit();
  assert.deepEqual(events, ['persisted']);
  assert.deepEqual(f.state(), { prevented: 0, quits: 0, stops: 1, quitting: true });
});
test('a missing helper status cannot trap Mac in an unquittable state', () => {
  const f = fixture('darwin', () => { throw new Error('startup_state_unavailable'); });
  f.quit();
  assert.equal(f.state().quitting, true); assert.equal(f.state().prevented, 0);
});
test('Windows quit cleanup remains synchronous', () => {
  const f = fixture('win32', () => assert.fail('Mac pause must not run on Windows'));
  f.quit(); assert.deepEqual(f.state(), { prevented: 0, quits: 0, stops: 1, quitting: true });
});

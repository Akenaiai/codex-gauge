const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { placeBadge } = require('../src/domain.cjs');
const source = fs.readFileSync('src/main.cjs', 'utf8');
test('Mac follows live anchor movement even with a saved legacy floating position', () => {
  const positions = [];
  const context = vm.createContext({
    process: { platform: 'darwin' }, drag: null,
    store: { settings: { topmost: true, floating: { x: 1800, y: 90 }, offset: { x: 0, y: 0 } } },
    host: { anchored: true, x: 130, y: 700 }, placeBadge,
    areaFor: () => ({ x: -1600, y: -900, width: 3520, height: 1980 }),
    badge: { setBounds: r => positions.push(r) }, panel: { isVisible: () => false }
  });
  vm.runInContext(source.slice(source.indexOf('function layout()'), source.indexOf('function updateVisibility()')), context);
  context.layout();
  context.host.x = -1400; context.host.y = -200; context.layout();
  assert.deepEqual(positions, [
    { x: 104, y: 638, width: 52, height: 52 },
    { x: -1426, y: -262, width: 52, height: 52 }
  ]);
});
function visibility(host) {
  const calls = [];
  const context = vm.createContext({
    quitting: false, demo: false, hadAnchor: true, forcedPanel: false, badgeRaisedAt: 0,
    host: { exists: true, anchored: true, foreground: true, minimized: false, platform: 'darwin', ...host },
    store: { settings: { topmost: true, floating: { x: 1800, y: 90 }, resetNews: true } },
    layout() { calls.push('layout'); }, closePanel() {},
    badge: { isVisible: () => false, showInactive() { calls.push('show'); }, hide() { calls.push('hide'); }, moveTop() {} },
    panel: { isVisible: () => false }, quota: { setActive() {} }, resetFeed: { setActive() {} }
  });
  vm.runInContext(source.slice(source.indexOf('function updateVisibility()'), source.indexOf('function openPanel(')), context);
  context.updateVisibility();
  return calls;
}
test('Mac hides stale or missing anchors instead of falling back to the desktop', () => {
  assert.deepEqual(visibility({ anchored: false }), ['hide']);
  assert.deepEqual(visibility({ exists: false }), ['hide']);
});
test('Mac hides on minimize and foreground loss even with a legacy topmost setting', () => {
  assert.deepEqual(visibility({ minimized: true }), ['hide']);
  assert.deepEqual(visibility({ foreground: false }), ['hide']);
  assert.deepEqual(visibility({}), ['layout', 'show']);
});
test('Mac does not launch an accessibility observer before explicit in-app enablement', () => {
  let spawned = false;
  const context = vm.createContext({
    process: { platform: 'darwin' }, store: { settings: { macAnchorEnabled: false } },
    updateVisibility() {}, broadcast() {}, spawn() { spawned = true; }
  });
  vm.runInContext(source.slice(source.indexOf('function observe()'), source.indexOf('async function checkUpdate(')), context);
  context.observe();
  assert.equal(spawned, false);
  assert.equal(context.host.accessibilityRequired, true);
  assert.equal(context.host.anchored, false);
});
test('Mac reads anchors in the authorized main process without spawning a separate AX client', () => {
  let poll, stopped = false, reads = 0;
  const context = vm.createContext({
    process: { platform: 'darwin', pid: 42, resourcesPath: '/app/Resources' }, app: { isPackaged: true },
    store: { settings: { macAnchorEnabled: true } }, hostGeneration: 0, helperRetries: 0,
    hadAnchor: false, quitting: false, observer: null, path: require('node:path').posix,
    require(filename) {
      assert.equal(filename, '/app/Resources/native/GaugeHostMac.node');
      return { read(pid) { assert.equal(pid, 42); reads++; return JSON.stringify({ exists: true, anchored: true, x: 120, y: 700 }); }, stop() { stopped = true; } };
    },
    setInterval(fn) { poll = fn; return 1; }, clearInterval() {},
    updateVisibility() {}, broadcast() {},
    spawn() { assert.fail('Mac AX client must not be a separate process'); }
  });
  vm.runInContext(source.slice(source.indexOf('function observe()'), source.indexOf('async function checkUpdate(')), context);
  context.observe(); poll();
  assert.equal(reads, 2); assert.equal(context.host.anchored, true);
  context.observer.kill(); assert.equal(stopped, true);
});

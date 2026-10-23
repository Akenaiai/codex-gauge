const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture({ visible = true, panelVisible = false, foreground = true, topmost = false } = {}) {
  const calls = []; let now = 10000;
  const source = fs.readFileSync('src/main.cjs', 'utf8');
  const context = vm.createContext({ quitting: false, demo: false, hadAnchor: true, forcedPanel: false, badgeRaisedAt: 0,
    host: { exists: true, anchored: true, minimized: false, foreground },
    store: { settings: { topmost, resetNews: true } }, layout() { calls.push('layout'); },
    closePanel() { calls.push('close'); }, Date: { now: () => now },
    badge: { isVisible: () => visible, showInactive() { visible = true; calls.push('show'); }, hide() { visible = false; calls.push('hide'); }, moveTop() { calls.push('raise-badge'); } },
    panel: { isVisible: () => panelVisible, moveTop() { calls.push('raise-panel'); } },
    quota: { setActive() {} }, resetFeed: { setActive() {} } });
  vm.runInContext(source.slice(source.indexOf('function updateVisibility()'), source.indexOf('function openPanel(')), context);
  return { calls, context, update: () => context.updateVisibility(), time: n => { now = n; } };
}
test('a visible badge whose native order fell behind Codex is raised without changing the non-topmost preference', () => {
  const f = fixture(); f.update(); assert.ok(f.calls.includes('raise-badge'));
  assert.equal(f.context.store.settings.topmost, false);
});
test('hidden badge is raised immediately on foreground return without requesting keyboard focus', () => {
  const f = fixture({ visible: false }); f.update();
  assert.deepEqual(f.calls, ['layout', 'show', 'raise-badge']);
});
test('order repair is throttled and leaves an open panel above the badge', () => {
  const f = fixture({ panelVisible: true }); f.update(); f.time(10500); f.update();
  assert.equal(f.calls.filter(c => c === 'raise-badge').length, 1);
  f.time(12000); f.update(); assert.equal(f.calls.filter(c => c === 'raise-badge').length, 2);
  assert.deepEqual(f.calls.slice(-2), ['raise-badge', 'raise-panel']);
});
test('normal mode still hides when Codex loses foreground; returning restores order immediately', () => {
  const f = fixture({ foreground: false }); f.update();
  assert.deepEqual(f.calls, ['hide', 'close']);
  f.context.host.foreground = true; f.update(); assert.ok(f.calls.includes('raise-badge'));
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  let visible = false;
  const broadcasts = [];
  const context = vm.createContext({
    quota: { state: () => ({}), setActive() {} }, resetFeed: { state: () => ({}), setActive() {} },
    store: { settings: { panelFace: 'creative', language: 'en', theme: 'dark' } },
    nativeTheme: {}, host: {}, update: {}, demo: false, startupError: false, process: { platform: 'win32' },
    creativeSnapshot: () => ({}), app: { getVersion: () => 'test' },
    panel: { isVisible: () => visible, setBounds() {}, show() { visible = true; },
      showInactive() { visible = true; }, hide() { visible = false; }, moveTop() {} },
    clearTimeout() {}, leaveTimer: null, hoverTimer: null, forcedPanel: false, pinnedPanel: false,
    delivery: null, center: null, panelBounds: () => ({}),
    broadcast() { broadcasts.push(context.state().settings.panelFace); },
    save() { throw new Error('a face change must not write preferences'); }
  });
  const source = fs.readFileSync('src/main.cjs', 'utf8');
  vm.runInContext(source.match(/let panelFace = [^;]+;/)[0] + '\n' +
    source.slice(source.indexOf('function state()'), source.indexOf('function centerState()')) +
    source.slice(source.indexOf('function openPanel('), source.indexOf('function save(')) +
    source.slice(source.indexOf('async function action('), source.indexOf('function processResetReminders()')), context);
  return { context, broadcasts, hide: () => { visible = false; } };
}

test('legacy saved creative face is ignored; flipping stays local to the current opening', async () => {
  const { context: c } = fixture();
  assert.equal(c.state().settings.panelFace, 'codex');
  c.openPanel();
  assert.equal((await c.action('panel-face', 'creative')).ok, true);
  c.openPanel();
  assert.equal(c.state().settings.panelFace, 'creative');
  assert.equal(c.store.settings.panelFace, 'creative');
});

test('closing or reopening a hidden panel restores Codex and broadcasts the reset', async () => {
  const { context: c, broadcasts, hide } = fixture();
  c.openPanel(); await c.action('panel-face', 'creative');
  c.closePanel();
  assert.equal(c.panel.isVisible(), false);
  assert.equal(broadcasts.at(-1), 'codex');
  c.openPanel();
  assert.equal(c.state().settings.panelFace, 'codex');
  await c.action('panel-face', 'creative'); hide(); c.openPanel();
  assert.equal(c.state().settings.panelFace, 'codex');
});

test('an unknown face cannot change the current panel', async () => {
  const { context: c } = fixture();
  assert.equal((await c.action('panel-face', 'unexpected')).ok, false);
  assert.equal(c.state().settings.panelFace, 'codex');
});

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
    codingRows: () => [], cursor: {}, qoder: {}, desktopQuotaBusy: false, quitting: false,
    kilo: {}, kiloBusy: false, kiloCheckedAt: 0,
    devin: {}, devinBusy: false, devinCheckedAt: 0,
    nativeDirectory: () => '', path: require('node:path'), readCursor: async () => ({ status: 'usage_hidden' }),
    readQoder: async () => ({ status: 'usage_hidden' }),
    readKiloQuota: async () => ({ status: 'missing' }),
    readDevinQuota: async () => ({ status: 'missing' }),
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

test('legacy saved face is ignored; selecting a tab stays local to the current opening', async () => {
  const { context: c } = fixture();
  assert.equal(c.state().settings.panelFace, 'codex');
  c.openPanel();
  assert.equal((await c.action('panel-face', 'creative')).ok, true);
  c.openPanel();
  assert.equal(c.state().settings.panelFace, 'creative');
  assert.equal((await c.action('panel-face', 'coding')).ok, true);
  assert.equal(c.state().settings.panelFace, 'coding');
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

test('hiding Cursor leaves Qoder reads enabled and ambiguous Qoder windows clear the old reading', async () => {
  const { context: c } = fixture();
  c.store.settings.hideCursor = true;
  let cursorReads = 0;
  c.readCursor = async () => { cursorReads++; return { status: 'usage_hidden' }; };
  c.readQoder = async () => ({ status: 'ready', reading: { pools: [] } });
  c.openPanel();
  await c.action('panel-face', 'coding');
  await new Promise(setImmediate);
  assert.equal(c.state().coding.qoder.status, 'ready');
  c.readQoder = async () => ({ status: 'usage_hidden' });
  await c.refreshDesktopQuotas();
  assert.ok(c.state().coding.qoder.reading);
  c.readQoder = async () => ({ status: 'multiple' });
  await c.refreshDesktopQuotas();
  assert.equal(c.state().coding.qoder.reading, undefined);
  assert.equal(cursorReads, 0);
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { CreditCenter } = require('../src/credit-center.cjs');
const { cleanRecord } = require('../src/credit-model.cjs');
const { runwayRecord } = require('../src/creative-providers.cjs');
const { creativeSnapshot } = require('../src/creative-credits.cjs');
const { markup } = require('../src/ui/creative-panel.js');
const { NotificationDelivery } = require('../src/notifications.cjs');
const { Store } = require('../src/store.cjs');
const localDate = value => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('Runway warns when a large plan balance has only a grant forecast and switches to expiry alerts once a date is confirmed', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-runway-expiry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const center = new CreditCenter(directory, { home: directory, env: { PATH: '' } });
  const account = { authenticated: true, team: { id: 'test-workspace', name: 'Test Workspace' } };
  const putBalance = (plan, purchased, extra) => {
    const response = { ...account, ...extra, credits: { unlimited: false, total: plan + purchased, plan, purchased } };
    center.put(cleanRecord(runwayRecord(response, response, 'test-link')), false);
  };
  putBalance(9301, 79);
  center.setUserDate({ provider: 'runway', account: 'Forecast only', label: 'Expected grant', poolType: 'subscription', monthlyDay: 22 });

  const alerts = [];
  center.on('alert', alert => alerts.push(alert));
  const tick = () => { alerts.length = 0; center.tick(); return alerts.filter(alert => alert.provider === 'runway'); };
  const ui = () => markup({ state: { creative: creativeSnapshot(center.state()), settings: { language: 'zh-CN' } },
    t: zh => zh, esc: String, icon: () => '' });

  const missing = tick().find(alert => alert.kind === 'expiry_date_missing');
  assert.equal(missing?.amount, 9301);
  assert.equal(alerts.some(alert => alert.kind === 'expiry'), false);
  assert.match(ui(), /套餐积分缺少到期日/);
  assert.match(ui(), /补充到期日/);

  const id = center.records[0].id;
  center.setRule(id + '/subscription', { expiresAt: Date.now() + 48 * 3600000, notify: true });
  assert.equal(tick().filter(alert => alert.kind === 'expiry_date_missing').length, 0);
  assert.equal(alerts.find(alert => alert.kind === 'expiry')?.amount, 9301);
  assert.doesNotMatch(ui(), /套餐积分缺少到期日/);

  center.setRule(id + '/subscription', {});
  putBalance(100, 1500);
  assert.equal(tick().filter(alert => alert.kind === 'expiry_date_missing').length, 0);
  putBalance(125, 79, { upgradeUrl: 'https://app.runwayml.com/settings/billing' });
  assert.equal(tick().filter(alert => alert.kind === 'expiry_date_missing').length, 0);
  assert.doesNotMatch(ui(), /套餐积分缺少到期日/);

  const notifications = [];
  class Toast extends EventEmitter {
    static isSupported() { return true; }
    constructor(options) { super(); this.options = options; }
    show() { notifications.push(this.options); this.emit('show'); }
  }
  const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
  const listener = main.slice(main.indexOf("  center.on('alert'"), main.indexOf("  quota.on('state'"));
  for (let launch = 0; launch < 2; launch++) {
    const store = new Store(directory);
    const delivery = new NotificationDelivery({ store, Notification: Toast, platform: 'win32' });
    const receiver = new EventEmitter();
    Object.assign(receiver, { enabled: true, reminders: true, inventory: { tools: [{ id: 'runway', name: 'Runway' }] } });
    vm.runInNewContext(listener, { center: receiver, delivery, demo: false, quitting: false, text: zh => zh });
    receiver.emit('alert', missing);
    delivery.stop();
  }
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].toastXml, /gauge:creative.*套餐积分缺少到期日/);
});

test('balance-only sources flag missing coverage without counting all credits as expiring', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-credit-coverage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const center = new CreditCenter(directory, { home: directory, env: { PATH: '' } });
  const now = Date.now();
  const cases = [
    ['suno', 'song_credits', 'mcp', false], ['kling', 'effective', 'mcp', true],
    ['xyq', 'effective', 'cli', true], ['jimeng', 'effective', 'cli', true],
    ['lovart', 'effective', 'mcp', false], ['tapnow', 'effective', 'browser', false],
    ['ideogram', 'effective', 'browser', false], ['recraft', 'effective', 'mcp', true],
  ];
  for (const [provider, id, source, identityVerified] of cases) {
    center.ensureTool(provider);
    center.setConnectionPreferences({ provider, followed: true });
    center.put(cleanRecord({ provider, scope: provider, source, identityVerified, fetchedAt: now,
      account: provider === 'recraft' ? 'Recraft MCP · Pro' : 'Sample',
      pools: [{ id, amount: 4000, unit: 'credits', periodEnd: now + 86400000 }] }), false);
  }
  const alerts = [];
  center.on('alert', alert => alerts.push(alert));
  const tick = () => { alerts.length = 0; center.tick(); };
  tick();
  const missing = alerts.filter(alert => alert.kind === 'expiry_date_missing');
  assert.deepEqual(missing.map(alert => alert.provider).sort(), cases.map(([provider]) => provider).sort());
  assert.ok(missing.every(alert => alert.amount == null));
  assert.equal(creativeSnapshot(center.state()).expiring, 0);

  const expiryDate = localDate(now + 86400000);
  const input = { provider: 'suno', account: 'My Suno', label: 'Confirmed batch', poolType: 'subscription', expiryDate, notify: true };
  const id = center.setUserDate(input);
  tick();
  assert.equal(alerts.some(alert => alert.provider === 'suno' && alert.scheduleKind === 'expiry'), false);
  center.setUserDate({ ...input, id, verifyWithoutAmount: true });
  tick();
  const prompt = alerts.find(alert => alert.provider === 'suno' && alert.scheduleKind === 'expiry');
  assert.equal(prompt?.amount, null);
  assert.equal(prompt.verifyWithoutAmount, true);
  assert.equal(alerts.some(alert => alert.provider === 'suno' && alert.kind === 'expiry_date_missing'), false);
  assert.equal(creativeSnapshot(center.state()).expiring, 0);

  const recraft = center.records.find(record => record.provider === 'recraft');
  recraft.account = 'Recraft MCP · Free';
  tick();
  assert.equal(alerts.some(alert => alert.provider === 'recraft' && alert.kind === 'expiry_date_missing'), false);
});

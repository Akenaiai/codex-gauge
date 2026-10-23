const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { Store } = require('../src/store.cjs');
const { NotificationDelivery } = require('../src/notifications.cjs');
const { resetAlerts, newsPlan } = require('../src/reminders.cjs');
const { creditAlerts } = require('../src/domain.cjs');
const { parseFeed } = require('../src/reset-feed.cjs');
const NOW = 1800000000000;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-main-notifications-'));
  t.after(() => { for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); });
  const store = new Store(dir), notifications = [];
  store.save({ notifications: true });
  class Notification extends EventEmitter {
    constructor(options) { super(); this.options = options; notifications.push(this); }
    static isSupported() { return true; }
    show() {}
  }
  class Clock extends Date { static now() { return NOW; } }
  const quota = { active: true, status: 'ready', accountKey: 'synthetic-account', snapshot: { fetchedAt: NOW,
    windows: [{ minutes: 300, remaining: 80, resetsAt: NOW + 5400000 }], credits: [{ key: 'credit', expiresAt: NOW + 36 * 3600000 }] } };
  const feed = { status: 'ready', ...parseFeed({ schemaVersion: 1, checkedAt: new Date(NOW).toISOString(), events: [{
    id: 'synthetic-news', type: 'reset_credit', status: 'announced', updatedAt: new Date(NOW).toISOString(), posts: [] }] }, NOW) };
  const delivery = new NotificationDelivery({ store, Notification, clock: () => NOW, open() {} });
  t.after(() => delivery.stop());
  const context = vm.createContext({ store, quota, resetFeed: { state: () => feed }, delivery, demo: false, quitting: false,
    Notification, resetAlerts: (...args) => resetAlerts(...args, NOW), newsPlan,
    creditAlerts: (...args) => creditAlerts(...args, NOW), Date: Clock, text: (_cn, en) => en });
  const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
  vm.runInContext(main.slice(main.indexOf('function processResetReminders()'), main.indexOf('async function start()')), context);
  return { store, quota, feed, delivery, notifications, process() { context.processCreditReminders(); context.processResetReminders(); } };
}
test('production main routes credit, schedule and public news through acknowledgement and deduplicates concurrent state events', t => {
  const f = fixture(t); f.process(); assert.equal(f.notifications.length, 3);
  assert.equal(Object.keys(f.store.ledger).length, 0);
  f.process(); assert.equal(f.notifications.length, 3);
  for (const n of f.notifications) n.emit('show');
  assert.equal(Object.keys(f.store.ledger).length, 3);
  f.process(); assert.equal(f.notifications.length, 3);
});
test('main persists announcement discovery across a first-send disk failure and retries after recovery', t => {
  const f = fixture(t); f.quota.snapshot.windows = []; f.quota.snapshot.credits = [];
  const save = f.store.save.bind(f.store); let writes = 0;
  f.store.save = () => { if (++writes === 2) throw new Error('injected write failure'); return save(); };
  f.process(); assert.equal(f.notifications.length, 0);
  assert.equal(Object.values(f.store.deliveries)[0].status, 'queued');
  f.store.save = save; f.process(); assert.equal(f.notifications.length, 1);
  f.notifications[0].emit('show'); f.process(); assert.equal(f.notifications.length, 1);
});
test('main rolls back discovery on a failed baseline save and preserves opt outs, freshness and host suspension', t => {
  const f = fixture(t); f.quota.snapshot.windows = []; f.quota.snapshot.credits = [];
  const save = f.store.save.bind(f.store); f.store.save = () => { throw new Error('injected write failure'); };
  f.process(); assert.equal(Object.keys(f.store.newsSeen).length, 0);
  f.store.save = save;
  f.quota.active = false; f.process(); assert.equal(f.notifications.length, 0);
  f.quota.active = true; f.store.settings.resetReminders = false; f.process(); assert.equal(f.notifications.length, 0);
  f.store.settings.resetReminders = true; f.feed.status = 'offline'; f.process(); assert.equal(f.notifications.length, 0);
  f.quota.snapshot.fetchedAt = NOW - 121000; f.quota.snapshot.windows = [{ minutes: 300, remaining: 80, resetsAt: NOW + 5400000 }];
  f.process(); assert.equal(f.notifications.length, 0);
});

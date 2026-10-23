const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store.cjs');
const { NotificationDelivery, configureActivation, TOAST_CLSID } = require('../src/notifications.cjs');
const { newsPlan } = require('../src/reminders.cjs');
const { parseFeed } = require('../src/reset-feed.cjs');
const NOW = 1800000000000;
function fixture(t, mode = 'manual') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-delivery-'));
  t.after(() => { for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); });
  const notifications = [], timers = new Map(); let now = NOW, serial = 0, opens = 0;
  class Notification extends EventEmitter {
    constructor(options) { super(); this.options = options; notifications.push(this); }
    static isSupported() { return true; }
    show() { if (mode === 'throw') throw new Error('injected'); if (mode === 'shown') this.emit('show'); }
  }
  const store = new Store(dir);
  const options = { store, Notification, platform: 'win32', open: () => opens++, clock: () => now,
    schedule: fn => { timers.set(++serial, fn); return serial; }, cancel: id => timers.delete(id) };
  const delivery = new NotificationDelivery(options);
  t.after(() => delivery.stop());
  const alert = { key: 'account:reset:300:synthetic:2', expiresAt: NOW + 5400000 };
  return { store, delivery, options, alert, notifications, timers, dir, setNow: n => { now = n; }, opens: () => opens,
    send: () => delivery.send(alert, { title: 'Synthetic', body: 'Synthetic test', silent: true }) };
}
test('deduplication commits on native show, never on submission; restart preserves settings and success', t => {
  const f = fixture(t); f.store.save({ language: 'en', notifications: true, offset: { x: 12, y: 34 } });
  const settings = { ...f.store.settings };
  f.send(); assert.equal(f.store.ledger[f.alert.key], undefined);
  assert.equal(new Store(f.dir).deliveries[f.alert.key].status, 'sending');
  f.send(); assert.equal(f.notifications.length, 1);
  f.notifications[0].emit('show'); f.send(); assert.equal(f.notifications.length, 1);
  const loaded = new Store(f.dir); assert.equal(loaded.ledger[f.alert.key], f.alert.expiresAt);
  assert.deepEqual(loaded.settings, settings);
  new NotificationDelivery({ ...f.options, store: loaded }).send(f.alert, {});
  assert.equal(f.notifications.length, 1);
});
test('synchronous and asynchronous failures persist retry budget across restarts, then stop at three attempts', t => {
  for (const mode of ['throw', 'manual']) {
    const f = fixture(t, mode); let delivery = f.delivery;
    for (let attempt = 1; attempt <= 3; attempt++) {
      delivery.send(f.alert, {});
      if (mode === 'manual') f.notifications.at(-1).emit('failed', {}, 'injected native error');
      assert.equal(f.store.ledger[f.alert.key], undefined);
      assert.equal(f.store.deliveries[f.alert.key].attempts, attempt);
      assert.equal(delivery.state().failed, 1);
      delivery.send(f.alert, {}); assert.equal(f.notifications.length, attempt);
      const nextAt = f.store.deliveries[f.alert.key].nextAt;
      delivery.stop();
      const reloaded = new Store(f.dir);
      delivery = new NotificationDelivery({ ...f.options, store: reloaded });
      f.store.deliveries = reloaded.deliveries;
      f.setNow(nextAt + 1);
    }
    delivery.send(f.alert, {}); assert.equal(f.notifications.length, 3); delivery.stop();
  }
});
test('failure then success clears the error, uses a stable short toast ID, ignores late callbacks', t => {
  const f = fixture(t); f.send(); const old = f.notifications[0]; old.emit('failed', {}, 'injected');
  f.setNow(NOW + 30001); f.send(); const retry = f.notifications[1];
  assert.equal(old.options.id, retry.options.id); assert.match(retry.options.id, /^[a-f0-9]{16}$/);
  old.emit('show'); assert.equal(f.store.ledger[f.alert.key], undefined);
  retry.emit('show'); retry.emit('failed', {}, 'late');
  assert.equal(f.store.ledger[f.alert.key], f.alert.expiresAt); assert.equal(f.delivery.state().failed, 0);
});
test('missing acknowledgement and interrupted send remain unknown after restart and do not auto resend', t => {
  const f = fixture(t); f.send(); const onTimeout = [...f.timers.values()][0]; onTimeout();
  assert.equal(f.store.deliveries[f.alert.key].status, 'unknown');
  f.setNow(NOW + 180000); f.send(); assert.equal(f.notifications.length, 1);
  f.notifications[0].emit('show'); assert.equal(f.store.ledger[f.alert.key], f.alert.expiresAt);
  const g = fixture(t); g.send(); g.delivery.stop();
  const reloaded = new Store(g.dir); const delivery = new NotificationDelivery({ ...g.options, store: reloaded });
  assert.equal(reloaded.deliveries[g.alert.key].status, 'unknown');
  delivery.send(g.alert, {}); assert.equal(g.notifications.length, 1); delivery.stop();
});
test('storage failures prevent sending; failed success-save cannot cause another popup or a restart duplicate', t => {
  const f = fixture(t); const save = f.store.save.bind(f.store);
  f.store.save = () => { throw new Error('injected disk failure'); };
  f.send(); assert.equal(f.notifications.length, 0); assert.equal(f.store.error, true);
  f.store.save = save; f.send(); assert.equal(f.notifications.length, 1);
  f.store.save = () => { throw new Error('injected disk failure'); };
  f.notifications[0].emit('show'); f.send(); assert.equal(f.notifications.length, 1);
  const loaded = new Store(f.dir); const delivery = new NotificationDelivery({ ...f.options, store: loaded });
  delivery.send(f.alert, {}); assert.equal(f.notifications.length, 1); delivery.stop();
});
test('legacy successes, expired reminders and exhausted stages never replay', t => {
  const f = fixture(t); f.store.ledger[f.alert.key] = f.alert.expiresAt;
  f.send(); assert.equal(f.notifications.length, 0);
  delete f.store.ledger[f.alert.key]; f.setNow(f.alert.expiresAt); f.send(); assert.equal(f.notifications.length, 0);
});
test('failed announcement stays eligible after newsSeen persists, but outages and historical baselines stay quiet', () => {
  const event = { id: 'synthetic-news', type: 'reset_credit', status: 'announced', updatedAt: new Date(NOW).toISOString(), posts: [] };
  const feed = { status: 'ready', ...parseFeed({ schemaVersion: 1, checkedAt: new Date(NOW).toISOString(), events: [event] }, NOW) };
  const first = newsPlan(feed, {}, {}, null, NOW); assert.equal(first.alerts.length, 1);
  const pending = { [first.alerts[0].key]: { status: 'failed' } };
  assert.equal(newsPlan(feed, first.seen, {}, null, NOW, pending).alerts.length, 1);
  assert.equal(newsPlan({ ...feed, status: 'offline' }, first.seen, {}, null, NOW, pending).alerts.length, 0);
  const confirmed = { ...feed, events: feed.events.map(e => ({ ...e, status: 'confirmed' })) };
  assert.equal(newsPlan(confirmed, {}, {}, null, NOW).alerts.length, 0);
});
test('global activation queues cold-start and early second-instance events until the panel exists', async () => {
  const app = new EventEmitter(); let clsid, handler, opens = 0;
  app.setToastActivatorCLSID = value => { clsid = value; }; app.whenReady = () => Promise.resolve();
  const Notification = { handleActivation: fn => { handler = fn; fn({ type: 'click' }); } };
  const activation = configureActivation({ app, Notification, platform: 'win32', open: () => opens++ });
  assert.equal(clsid, TOAST_CLSID); assert.match(clsid, /^\{[a-f0-9-]{36}\}$/i);
  app.emit('second-instance'); await Promise.resolve(); assert.equal(opens, 0);
  activation.ready(); assert.equal(opens, 1);
  handler({ type: 'click' }); assert.equal(opens, 2);
  app.emit('second-instance'); assert.equal(opens, 3);
});
test('non-Windows instance clicks open the panel; Windows uses one global route', t => {
  for (const platform of ['darwin', 'win32']) {
    const f = fixture(t); const delivery = new NotificationDelivery({ ...f.options, platform });
    delivery.send(f.alert, {}); f.notifications[0].emit('show'); f.notifications[0].emit('click');
    assert.equal(f.opens(), platform === 'darwin' ? 1 : 0); delivery.stop();
  }
});

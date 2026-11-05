'use strict';
const { createHash } = require('node:crypto');
// Stable across releases: Windows uses this COM identity to activate retained toasts.
const TOAST_CLSID = '{29cfae32-d308-4b2d-8a9e-8875c6fe8214}';
const MAX_ATTEMPTS = 3, ACK_TIMEOUT = 15000;
function configureActivation({ app, Notification, open, platform = process.platform }) {
  let ready = false, pending = null;
  const activate = details => { const target=details?.arguments==='gauge:creative'?'creative':details?.arguments==='gauge:center'?'center':'codex';if (ready) open(target); else if(target!=='codex'||!pending)pending = target; };
  app.on('second-instance', activate);
  if (platform === 'win32') {
    app.setToastActivatorCLSID(TOAST_CLSID);
    app.whenReady().then(() => {
      Notification.handleActivation(activate);
      // Electron 44 initializes the COM presenter lazily. Historical clicks must
      // work even when every reminder switch is off and no new toast is created.
      Notification.isSupported();
    });
  }
  return { ready() { ready = true; if (pending) { const target=pending;pending = null; open(target); } } };
}
class NotificationDelivery {
  constructor({ store, Notification, open, changed = () => {}, platform = process.platform,
    clock = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
    Object.assign(this, { store, Notification, open, changed, platform, clock, schedule, cancel });
    this.live = new Map(); this.stopped = false; this.storageError = false;
    let recovered = false;
    for (const entry of Object.values(store.deliveries)) {
      // A crash cannot tell us whether Windows accepted the toast. Keep it quiet.
      if (entry.status === 'sending') { entry.status = 'unknown'; recovered = true; }
    }
    if (recovered) this.persist();
  }
  persist() {
    try { this.store.save(); this.storageError = false; return true; }
    catch { this.store.error = true; this.storageError = true; return false; }
  }
  state() {
    const entries = Object.values(this.store.deliveries).filter(e => e.expiresAt > this.clock());
    return { failed: entries.filter(e => e.status === 'failed').length,
      exhausted: entries.filter(e => e.status === 'failed' && e.attempts >= MAX_ATTEMPTS).length,
      unknown: entries.filter(e => e.status === 'unknown').length, storageError: this.storageError };
  }
  send(alert, options) {
    const { store } = this, now = this.clock(), previous = store.deliveries[alert.key];
    if (this.stopped || alert.expiresAt <= now || store.ledger[alert.key] || !this.Notification.isSupported()) return;
    if (previous && (!['failed', 'queued'].includes(previous.status) || previous.attempts >= MAX_ATTEMPTS || previous.nextAt > now || previous.expiresAt <= now)) return;
    for (const [key, entry] of Object.entries(store.deliveries)) if (entry.expiresAt <= now) delete store.deliveries[key];
    for (const [key, expiry] of Object.entries(store.ledger)) if (expiry <= now) delete store.ledger[key];
    const entry = { status: 'sending', attempts: (previous?.attempts || 0) + 1, expiresAt: previous?.expiresAt || alert.expiresAt, nextAt: 0 };
    store.deliveries[alert.key] = entry;
    // Write intent, not success, before the external side effect.
    if (!this.persist()) {
      if (previous) store.deliveries[alert.key] = previous; else delete store.deliveries[alert.key];
      this.changed(); return;
    }
    const attempt = { notification: null, timer: null, settled: false };
    this.live.set(alert.key, attempt);
    const finish = status => {
      if (this.stopped || this.live.get(alert.key) !== attempt || attempt.settled) return;
      if (status === 'unknown' && entry.status !== 'sending') return;
      this.cancel(attempt.timer);
      entry.status = status;
      if (status === 'sent') {
        attempt.settled = true; store.ledger[alert.key] = alert.expiresAt;
      } else if (status === 'failed') {
        attempt.settled = true;
        entry.nextAt = this.clock() + (entry.attempts === 1 ? 30000 : 120000);
        this.live.delete(alert.key);
      }
      this.persist(); this.changed();
    };
    try {
      const id = createHash('sha256').update(alert.key).digest('hex').slice(0, 16);
      const target=['creative','center'].includes(alert.target)?alert.target:'codex';
      const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
      const toastXml=this.platform==='win32'&&target!=='codex'?`<toast launch="gauge:${target}"><visual><binding template="ToastGeneric"><text>${xml(options.title)}</text><text>${xml(options.body)}</text></binding></visual><audio silent="true"/></toast>`:options.toastXml;
      const notification = new this.Notification({ ...options, ...(toastXml?{toastXml}:{}), id, groupId: target==='creative'?'gauge-creative':'gauge-reminders' });
      attempt.notification = notification;
      notification.on('show', () => finish('sent'));
      notification.on('failed', () => finish('failed'));
      // Windows invokes the global handler as well as instance events; use one route.
      if (this.platform !== 'win32') notification.on('click', () => this.open(target));
      notification.on('close', () => {
        if (this.live.get(alert.key) !== attempt) return;
        finish('unknown'); this.live.delete(alert.key);
      });
      attempt.timer = this.schedule(() => finish('unknown'), ACK_TIMEOUT);
      notification.show();
    } catch { finish('failed'); }
  }
  stop() { this.stopped = true; for (const attempt of this.live.values()) this.cancel(attempt.timer); this.live.clear(); }
}
module.exports = { NotificationDelivery, configureActivation, TOAST_CLSID };

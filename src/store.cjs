'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { cleanSettings } = require('./domain.cjs');
class Store {
  constructor(directory) {
    this.file = path.join(directory, 'settings.json'); this.writable = true; this.error = false;
    let data = {};
    try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') { this.writable = false; this.error = true; } }
    this.settings = cleanSettings(data.settings); this.ledger = data.ledger && typeof data.ledger === 'object' ? data.ledger : {};
    this.newsSeen = Object.fromEntries(Object.entries(data.newsSeen || {}).filter(([key, value]) => /^[a-f0-9]{64}$/.test(key) &&
      /^[a-f0-9]{64}$/.test(value?.signature) && Number.isFinite(value.at)).slice(-100));
    this.deliveries = Object.fromEntries(Object.entries(data.deliveries || {}).filter(([key, value]) => key.length <= 512 &&
      ['queued', 'sending', 'sent', 'failed', 'unknown'].includes(value?.status) && Number.isInteger(value.attempts) && value.attempts >= (value.status === 'queued' ? 0 : 1) &&
      value.attempts <= 3 && Number.isFinite(value.expiresAt) && Number.isFinite(value.nextAt)));
  }
  save(patch = {}) {
    const next = cleanSettings({ ...this.settings, ...patch });
    if (!this.writable) throw new Error('settings_read_failed');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ settings: next, ledger: this.ledger, newsSeen: this.newsSeen, deliveries: this.deliveries }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, this.file); this.settings = next; this.error = false;
    return next;
  }
}
module.exports = { Store };

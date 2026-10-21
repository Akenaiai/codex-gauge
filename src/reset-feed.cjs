'use strict';
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const SOURCE = 'https://aihot.news/api/v1/codex-resets/recent';
const PAGE = 'https://aihot.news/codex-reset';
const POLL = 5 * 60000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const short = (value, max = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '';
function sourceLink(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && ['x.com', 'twitter.com'].includes(u.hostname) && /^\/[a-zA-Z0-9_]+\/status\/\d+$/.test(u.pathname) && !u.username && !u.password && !u.port ? u.origin + u.pathname : null; }
  catch { return null; }
}
function parseFeed(data, now = Date.now()) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.events) || data.events.length > 100 || !timestamp(data.checkedAt) ||
      timestamp(data.checkedAt) > now + 60000 || data.events.length === 0) throw new Error('invalid_feed');
  const events = data.events.flatMap(e => {
    if (!e || !['direct_reset', 'reset_credit'].includes(e.type) || !['announced', 'confirmed'].includes(e.status) || typeof e.id !== 'string') return [];
    const updatedAt = timestamp(e.updatedAt) || timestamp(e.createdAt);
    if (!updatedAt || updatedAt > now + 60000) return [];
    const presentation = e.presentation || {};
    const kindKnown = presentation.kindExplicit === true;
    const scopeKnown = presentation.scopeKnown === true;
    const precision = ['exact', 'deadline', 'window', 'date', 'approximate'].includes(e.schedule?.precision) ? e.schedule.precision : null;
    const from = timestamp(e.schedule?.from), until = timestamp(e.schedule?.through);
    const posts = (Array.isArray(e.posts) ? e.posts : []).slice(0, 10);
    const post = posts.find(p => sourceLink(p.url));
    const event = { id: hash(e.id), type: e.type, status: e.status, kindKnown, scopeKnown,
      scope: short(presentation.audienceZh || presentation.scopeLabel || e.scope),
      precision, from: precision ? from : null, until: precision && until && (!from || until >= from) ? until : null,
      timeInferred: presentation.timeInferred === true || !precision || ['date', 'approximate'].includes(precision),
      updatedAt, confirmation: ['source_post', 'receipt_review'].includes(e.confirmationBasis) ? e.confirmationBasis : 'unknown',
      sourceUrl: post ? sourceLink(post.url) : null, pageUrl: PAGE };
    event.signature = hash(JSON.stringify([e.type, e.status, event.kindKnown, event.scopeKnown, event.scope,
      event.precision, event.from, event.until, event.timeInferred, event.confirmation, posts.map(p => short(p.id))]));
    return [event];
  });
  if (!events.length) throw new Error('invalid_feed');
  return { events: events.slice(0, 20), checkedAt: timestamp(data.monitor?.lastVerifiedAt) || timestamp(data.checkedAt),
    fetchedAt: now, sourceHealthy: !data.outage && (!data.monitor || data.monitor.status === 'healthy') };
}
class ResetFeed extends EventEmitter {
  constructor({ request = fetch, clock = Date.now } = {}) { super(); this.request = request; this.clock = clock; this.status = 'disabled'; this.active = false; this.nextAt = 0; }
  state() { return { status: this.status, events: this.snapshot?.events || [], checkedAt: this.snapshot?.checkedAt || null, fetchedAt: this.snapshot?.fetchedAt || null }; }
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (active) this.refresh();
    else { clearTimeout(this.timer); this.controller?.abort(); this.status = 'disabled'; this.emit('state'); }
  }
  async refresh() {
    if (!this.active || this.busy) return;
    clearTimeout(this.timer);
    if (this.clock() < this.nextAt) { this.timer = setTimeout(() => this.refresh(), this.nextAt - this.clock()); return; }
    this.busy = true; this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller.abort(), 12000);
    this.nextAt = this.clock() + POLL;
    try {
      const headers = { Accept: 'application/json', 'User-Agent': 'Codex-Gauge/0.2.0 (+https://github.com/Akenaiai/codex-gauge)' };
      if (this.etag) headers['If-None-Match'] = this.etag;
      const response = await this.request(SOURCE, { headers, signal: this.controller.signal, redirect: 'error', credentials: 'omit' });
      const retry = response.headers.get('retry-after');
      if (retry) this.nextAt = Math.max(this.nextAt, /^\d+$/.test(retry) ? this.clock() + Number(retry) * 1000 : Date.parse(retry) || 0);
      const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control') || '');
      if (maxAge) this.nextAt = Math.max(this.nextAt, this.clock() + Number(maxAge[1]) * 1000);
      if (response.status === 304 && this.snapshot) this.snapshot.fetchedAt = this.clock();
      else {
        if (!response.ok) throw new Error('feed_unavailable');
        const raw = await response.text();
        if (raw.length > 500000) throw new Error('invalid_feed');
        const snapshot = parseFeed(JSON.parse(raw), this.clock());
        if (!this.active) return;
        this.snapshot = snapshot; this.etag = response.headers.get('etag');
      }
      this.status = this.snapshot?.sourceHealthy ? 'ready' : 'offline';
    } catch { if (this.active) this.status = 'offline'; }
    finally {
      clearTimeout(timeout); this.busy = false;
      if (this.active) { this.emit('state'); this.timer = setTimeout(() => this.refresh(), Math.max(1000, this.nextAt - this.clock())); }
    }
  }
  stop() { this.setActive(false); }
}
module.exports = { ResetFeed, parseFeed, sourceLink, PAGE };

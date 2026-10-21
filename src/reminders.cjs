'use strict';
const { HOUR, freshQuota, freshNews, resetWindows, activeNews } = require('./ui/reset-model.js');
function resetAlerts(snapshot, accountKey, ledger, now = Date.now()) {
  if (!accountKey || !freshQuota(snapshot, now)) return [];
  return resetWindows(snapshot, now).flatMap(w => {
    if (w.delta <= 0 || w.delta > 2 * HOUR || w.remaining < 30) return [];
    const stage = w.delta <= HOUR ? 1 : 2;
    const key = `${accountKey}:reset:${w.minutes}:${w.resetsAt}:${stage}`;
    return ledger[key] ? [] : [{ key, expiresAt: w.resetsAt, minutes: Math.ceil(w.delta / 60000), window: w.minutes, remaining: Math.floor(w.remaining) }];
  });
}
function newsPlan(feed, previous, ledger, snapshot, now = Date.now()) {
  if (!freshNews(feed, now)) return { seen: previous, alerts: [] };
  const seen = { ...previous }, alerts = [];
  const initialized = Object.keys(previous).length > 0;
  for (const e of activeNews(feed, now)) {
    const old = seen[e.id];
    const changed = old && old.signature !== e.signature;
    if (!old || changed) seen[e.id] = { signature: e.signature, at: now };
    const upcoming = e.status === 'announced' && (!e.until || e.until > now);
    // Existing confirmations form a baseline; only new transitions notify.
    const announce = upcoming && (!old || changed) || (changed || initialized && !old) && e.status === 'confirmed' && now - e.updatedAt <= 86400000;
    let stage = 'change';
    const urgent = upcoming && e.kindKnown && e.type === 'direct_reset' && !e.timeInferred && e.until > now && e.until - now <= 2 * HOUR &&
      freshQuota(snapshot, now) && resetWindows(snapshot, now).some(w => w.remaining >= 30);
    if (urgent) stage = e.until - now <= HOUR ? '1h' : '2h';
    const key = `news:${e.id}:${e.signature}:${stage}`;
    if ((announce || urgent) && !ledger[key]) alerts.push({ key, expiresAt: now + 7 * 86400000, event: e, urgent });
  }
  for (const [key, value] of Object.entries(seen)) if (!Number.isFinite(value?.at) || now - value.at > 7 * 86400000) delete seen[key];
  return { seen, alerts };
}
module.exports = { resetAlerts, newsPlan };

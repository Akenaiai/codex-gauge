(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.resetModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  const HOUR = 3600000, NEWS_AGE = 30 * 60000;
  const freshQuota = (snapshot, now) => snapshot && Number.isFinite(snapshot.fetchedAt) && now >= snapshot.fetchedAt && now - snapshot.fetchedAt <= 120000;
  const freshNews = (feed, now) => feed?.status === 'ready' && Number.isFinite(feed.checkedAt) && now >= feed.checkedAt && now - feed.checkedAt <= NEWS_AGE && now - feed.fetchedAt <= NEWS_AGE;
  function resetWindows(snapshot, now = Date.now()) {
    return (snapshot?.windows || [snapshot?.fiveHour, snapshot?.weekly]).filter(w => w && Number.isFinite(w.resetsAt) &&
      Number.isFinite(w.remaining) && w.remaining >= 0 && w.remaining <= 100)
      .map(w => ({ ...w, delta: w.resetsAt - now })).sort((a, b) => a.resetsAt - b.resetsAt);
  }
  function activeNews(feed, now = Date.now()) {
    return (feed?.events || []).filter(e => {
      if (e.status === 'confirmed') return now - e.updatedAt <= 7 * 86400000;
      return e.until ? now - e.until <= 86400000 : now - e.updatedAt <= 3 * 86400000;
    }).sort((a, b) => (a.status === 'announced' ? 0 : 1) - (b.status === 'announced' ? 0 : 1) || b.updatedAt - a.updatedAt);
  }
  function attention(snapshot, quotaReady, feed, now = Date.now()) {
    return quotaReady && freshQuota(snapshot, now) && resetWindows(snapshot, now).some(w => w.delta > 0 && w.delta <= 2 * HOUR && w.remaining >= 30) ||
      freshNews(feed, now) && activeNews(feed, now).some(e => e.kindKnown && e.type === 'direct_reset' && e.status === 'announced' && (!e.until || e.until > now));
  }
  function expiringCredit(snapshot, quotaReady, now = Date.now()) {
    if (!quotaReady || !freshQuota(snapshot, now)) return null;
    const credit = (snapshot.credits || []).filter(c => Number.isFinite(c.expiresAt) && c.expiresAt > now)
      .sort((a, b) => a.expiresAt - b.expiresAt)[0];
    if (!credit || credit.expiresAt - now > 48 * HOUR) return null;
    return { ...credit, critical: credit.expiresAt - now <= 24 * HOUR };
  }
  return { HOUR, freshQuota, freshNews, resetWindows, activeNews, attention, expiringCredit };
});

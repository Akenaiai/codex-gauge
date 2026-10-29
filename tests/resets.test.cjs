const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed, ResetFeed, sourceLink } = require('../src/reset-feed.cjs');
const { resetAlerts, newsPlan } = require('../src/reminders.cjs');
const { attention, expiringCredit } = require('../src/ui/reset-model.js');
const { cleanSettings } = require('../src/domain.cjs');
const NOW = 1800000000000, HOUR = 3600000;
const quota = (delta = 1.5 * HOUR, remaining = 80) => ({ fetchedAt: NOW, windows: [{ minutes: 10080, remaining, resetsAt: NOW + delta }] });
const event = (patch = {}) => ({ id: 'synthetic-reset', type: 'direct_reset', status: 'announced',
  updatedAt: new Date(NOW).toISOString(), presentation: { kindExplicit: true, scopeKnown: true, scopeLabel: 'Global' },
  schedule: { precision: 'deadline', from: new Date(NOW + 1.5 * HOUR).toISOString(), through: new Date(NOW + 1.5 * HOUR).toISOString() },
  posts: [{ id: 'synthetic-post', url: 'https://x.com/example/status/1234' }], ...patch });
const feed = (events = [event()]) => ({ status: 'ready', ...parseFeed({ schemaVersion: 1, checkedAt: new Date(NOW).toISOString(), events }, NOW) });

test('scheduled reminders keep account, reset time and 2h/1h stages isolated', () => {
  const s = quota(), first = resetAlerts(s, 'account-a', {}, NOW);
  assert.equal(first.length, 1); assert.equal(first[0].remaining, 80);
  const ledger = { [first[0].key]: first[0].expiresAt };
  assert.equal(resetAlerts(s, 'account-a', ledger, NOW).length, 0);
  assert.equal(resetAlerts(s, 'account-b', ledger, NOW).length, 1);
  const later = NOW + HOUR; s.fetchedAt = later;
  assert.equal(resetAlerts(s, 'account-a', ledger, later).length, 1);
  s.windows[0].resetsAt += 7 * 86400000;
  assert.equal(resetAlerts(s, 'account-a', ledger, later).length, 0);
});
test('expired, low balance, stale, unavailable and distant quotas cannot urge use', () => {
  for (const s of [quota(-1), quota(HOUR, 29), quota(3 * HOUR), { ...quota(), fetchedAt: NOW - 121000 }, null])
    assert.equal(resetAlerts(s, 'account', {}, NOW).length, 0);
  assert.equal(resetAlerts(quota(), null, {}, NOW).length, 0);
  assert.equal(attention(quota(), false, null, NOW), false);
});
test('first historical confirmation forms baseline; future confirmations and changed posts notify once', () => {
  const f = feed([event({ status: 'confirmed' })]);
  const initial = newsPlan(f, {}, {}, null, NOW);
  assert.equal(initial.alerts.length, 0);
  const next = feed([event({ id: 'another-reset', status: 'confirmed' })]);
  const changed = newsPlan(next, initial.seen, {}, null, NOW);
  assert.equal(changed.alerts.length, 1);
  const ledger = { [changed.alerts[0].key]: changed.alerts[0].expiresAt };
  assert.equal(newsPlan(next, changed.seen, ledger, null, NOW).alerts.length, 0);
  const postChange = feed([event({ status: 'confirmed', posts: [{ id: 'new-post' }] })]);
  assert.equal(newsPlan(postChange, initial.seen, {}, null, NOW).alerts.length, 1);
});
test('news distinguishes giving credits, approximate windows, elapsed announcements and real reset warnings', () => {
  const direct = newsPlan(feed(), {}, {}, quota(), NOW);
  assert.equal(direct.alerts[0].urgent, true);
  const credits = newsPlan(feed([event({ type: 'reset_credit' })]), {}, {}, quota(), NOW);
  assert.equal(credits.alerts[0].urgent, false);
  const approximate = newsPlan(feed([event({ presentation: { timeInferred: true } })]), {}, {}, quota(), NOW);
  assert.equal(approximate.alerts[0].urgent, false);
  const noTime = newsPlan(feed([event({ schedule: null })]), {}, {}, quota(), NOW);
  assert.equal(noTime.alerts[0].urgent, false);
  const unspecified = feed([event({ presentation: {} })]);
  assert.equal(newsPlan(unspecified, {}, {}, quota(), NOW).alerts[0].urgent, false);
  assert.equal(attention(null, false, unspecified, NOW), false);
  const elapsed = feed([event({ schedule: { precision: 'deadline', through: new Date(NOW - 1).toISOString() } })]);
  assert.equal(newsPlan(elapsed, {}, {}, quota(), NOW).alerts.length, 0);
});
test('source outages and old source timestamps never produce actionable public reminders', () => {
  const f = feed();
  assert.equal(newsPlan({ ...f, status: 'offline' }, {}, {}, quota(), NOW).alerts.length, 0);
  assert.equal(newsPlan({ ...f, checkedAt: NOW - 31 * 60000 }, {}, {}, quota(), NOW).alerts.length, 0);
  assert.equal(attention(null, false, { ...f, checkedAt: NOW - 31 * 60000 }, NOW), false);
});
test('untrusted feed text and links are constrained; malformed or empty payloads are rejected', () => {
  for (const url of ['javascript:alert(1)', 'https://x.com.evil.example/a/status/123', 'https://x.com/a/status/123?redirect=bad', 'https://user:pass@x.com/a/status/123']) {
    if (url.includes('?')) assert.equal(sourceLink(url), 'https://x.com/a/status/123');
    else assert.equal(sourceLink(url), null);
  }
  assert.equal(feed([event({ presentation: null })]).events[0].kindKnown, false);
  for (const data of [{}, { schemaVersion: 1, checkedAt: new Date(NOW).toISOString(), events: [] }]) assert.throws(() => parseFeed(data, NOW), /invalid_feed/);
});
test('feed uses recent endpoint, conditional requests and 304 without refreshing source collection time', async () => {
  let time = NOW, calls = [];
  const body = { schemaVersion: 1, checkedAt: new Date(NOW).toISOString(), events: [event()] };
  const service = new ResetFeed({ clock: () => time, request: async (url, options) => {
    calls.push({ url, headers: options.headers });
    return calls.length === 1 ? new Response(JSON.stringify(body), { headers: { ETag: 'sample-tag' } }) : new Response(null, { status: 304 });
  } });
  service.active = true;
  try {
    await service.refresh(); clearTimeout(service.timer);
    assert.ok(calls[0].url.endsWith('/recent'));
    time += 5 * 60000; await service.refresh(); clearTimeout(service.timer);
    assert.equal(calls[1].headers['If-None-Match'], 'sample-tag');
    assert.equal(service.state().checkedAt, NOW); assert.equal(service.state().fetchedAt, time);
  } finally { service.stop(); }
});
test('rate limits and malformed data retain prior snapshot and honor Retry-After', async () => {
  let time = NOW, calls = 0;
  const body = { schemaVersion: 1, checkedAt: new Date(NOW).toISOString(), events: [event()] };
  const service = new ResetFeed({ clock: () => time, request: async () => ++calls === 1 ? new Response(JSON.stringify(body))
    : calls === 2 ? new Response('', { status: 429, headers: { 'Retry-After': '900' } }) : new Response('{}') });
  service.active = true;
  try {
    await service.refresh(); clearTimeout(service.timer);
    const id = service.state().events[0].id;
    time += 5 * 60000; await service.refresh(); clearTimeout(service.timer);
    assert.equal(service.status, 'offline'); assert.equal(service.state().events[0].id, id);
    assert.equal(service.nextAt, time + 900000);
    await service.refresh(); clearTimeout(service.timer); assert.equal(calls, 2);
    time = service.nextAt; await service.refresh(); clearTimeout(service.timer);
    assert.equal(service.state().events[0].id, id); assert.equal(service.status, 'offline');
  } finally { service.stop(); }
});
test('new reminder preferences preserve existing choices and support independent opt out', () => {
  const s = cleanSettings({ notifications: false, resetReminders: false, resetNews: false, autostart: true });
  assert.equal(s.notifications, false); assert.equal(s.resetReminders, false); assert.equal(s.resetNews, false); assert.equal(s.autostart, true);
  assert.equal(cleanSettings().resetReminders, true);
});
test('credit visual urgency uses 48h/24h boundaries and retains last known expiry while distinguishing stale data', () => {
  const snapshot = hours => ({ ...quota(), credits: [{ expiresAt: NOW + hours * HOUR }] });
  assert.equal(expiringCredit(snapshot(48), true, NOW).critical, false);
  assert.equal(expiringCredit(snapshot(24), true, NOW).critical, true);
  assert.equal(expiringCredit(snapshot(49), true, NOW), null);
  assert.equal(expiringCredit(snapshot(0), true, NOW), null);
  assert.equal(expiringCredit(snapshot(1), false, NOW).stale, true);
  assert.equal(expiringCredit({ ...snapshot(1), fetchedAt: NOW - 121000 }, true, NOW).stale, true);
  assert.equal(expiringCredit(snapshot(1), true, NOW).stale, false);
  assert.equal(expiringCredit(null, false, NOW), null);
  assert.equal(expiringCredit({ ...snapshot(1), credits: [] }, true, NOW), null);
  assert.equal(expiringCredit({ ...snapshot(1), fetchedAt: NaN }, false, NOW), null);
  assert.equal(expiringCredit({ ...snapshot(1), fetchedAt: NOW + 1 }, false, NOW), null);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseQuota, identity, placeBadge, placePanel, creditAlerts, cleanSettings } = require('../src/domain.cjs');
const { Store } = require('../src/store.cjs');
const NOW = 1800000000000;
const window = (usedPercent, windowDurationMins) => ({ usedPercent, windowDurationMins, resetsAt: NOW / 1000 + 3600 });
test('selects Codex bucket, not an unrelated legacy or other-model allowance', () => {
  const s = parseQuota({ rateLimitsByLimitId: { codex: { primary: window(25, 300), secondary: window(80, 10080) }, other: { primary: window(99, 300) } }, rateLimits: { primary: window(1, 300) } }, NOW);
  assert.equal(s.fiveHour.remaining, 75); assert.equal(s.weekly.remaining, 20);
  assert.throws(() => parseQuota({ rateLimitsByLimitId: { other: {} }, rateLimits: { primary: window(1, 300) } }), /no_quota/);
});
test('weekly-only accounts remain weekly; unknown windows are never relabeled 5h', () => {
  const s = parseQuota({ rateLimits: { primary: window(17, 10080) } }, NOW);
  assert.equal(s.fiveHour, null); assert.equal(s.weekly.remaining, 83);
  const other = parseQuota({ rateLimits: { primary: window(20, 1440) } }, NOW);
  assert.equal(other.fiveHour, null); assert.equal(other.weekly, null); assert.equal(other.windows[0].minutes, 1440);
});
test('missing and malformed usage never become a fabricated zero balance', () => {
  for (const w of [{}, window(-1, 300), window(101, 300), window(null, 300), window(50, -300), window(50, 0)])
    assert.throws(() => parseQuota({ rateLimits: { primary: w } }), /invalid_quota/);
  assert.throws(() => parseQuota({ rateLimits: {} }), /no_quota/);
});
test('credits exclude used, expired and unknown expiry entries; missing metadata stays unknown', () => {
  const s = parseQuota({ rateLimits: { primary: window(50, 300) }, rateLimitResetCredits: { credits: [
    { id: 'a', status: 'available', expiresAt: NOW / 1000 + 60 }, { id: 'b', status: 'used', expiresAt: NOW / 1000 + 60 },
    { id: 'c', status: 'available', expiresAt: NOW / 1000 - 1 }, { id: 'd', status: 'available' }] } }, NOW);
  assert.equal(s.creditCount, 1); assert.equal(s.credits.length, 1); assert.notEqual(s.credits[0].key, 'a');
  assert.equal(parseQuota({ rateLimits: { primary: window(50, 300) } }).creditCount, null);
});
test('notifications isolate accounts and stages, ignore stale observations', () => {
  const snapshot = { fetchedAt: NOW, credits: [{ key: 'credit', expiresAt: NOW + 36 * 3600000 }] };
  const alerts = creditAlerts(snapshot, 'account-one', {}, NOW);
  assert.equal(alerts.length, 1);
  const ledger = { [alerts[0].key]: alerts[0].expiresAt };
  assert.equal(creditAlerts(snapshot, 'account-one', ledger, NOW).length, 0);
  assert.equal(creditAlerts(snapshot, 'account-two', ledger, NOW).length, 1);
  assert.equal(creditAlerts(snapshot, 'account-one', {}, NOW + 121000).length, 0);
  snapshot.fetchedAt = NOW + 13 * 3600000;
  assert.equal(creditAlerts(snapshot, 'account-one', ledger, snapshot.fetchedAt).length, 1);
});
test('all windows stay within multi-monitor bounds including negative coordinates', () => {
  const work = { x: -1920, y: 0, width: 1920, height: 1040 };
  const badge = placeBadge({ x: -1910, y: 1020 }, work);
  assert.equal(badge.x, -1920); assert.equal(badge.y + badge.height, 1010);
  const panel = placePanel({ x: -70, y: 20, width: 52, height: 52 }, work);
  assert.ok(panel.x + panel.width <= 0); assert.equal(panel.y, 0);
});
test('settings save immediately, reload, and preserve corrupt existing data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-settings-test-'));
  const store = new Store(dir); store.save({ language: 'en', offset: { x: 15, y: -22 }, notifications: true });
  const second = new Store(dir); assert.equal(second.settings.language, 'en'); assert.deepEqual(second.settings.offset, { x: 15, y: -22 });
  fs.writeFileSync(second.file, '{corrupt');
  const bad = new Store(dir); assert.equal(bad.error, true); assert.throws(() => bad.save({ language: 'en' }));
  assert.equal(fs.readFileSync(second.file, 'utf8'), '{corrupt');
  fs.unlinkSync(second.file); fs.rmdirSync(dir);
});
test('settings validation restricts public input and account identities are not exposed', () => {
  assert.equal(cleanSettings({ theme: '<script>', language: 'bad', topmost: 'true' }).theme, 'system');
  assert.equal(cleanSettings({ topmost: 'true' }).topmost, false);
  assert.equal(identity({ type: 'apiKey' }), null);
  const key = identity({ type: 'chatgpt', email: 'sample@example.invalid' });
  assert.equal(key.length, 64); assert.equal(key.includes('sample'), false);
});

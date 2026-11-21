const { test } = require('node:test');
const assert = require('node:assert/strict');
const { codingRows, cursorReading, qoderReading, codingQueryTargets } = require('../src/coding-quotas.cjs');
const { poolStatus, resetStatus } = require('../src/ui/coding-status.js');

test('Cursor inverts used percentage and preserves real zero, partial pools and date-only precision', () => {
  const read = cursorReading({ status: 'ready', cursorUsed: 0, otherUsed: 100, resetDate: '11月25日' }, 1000);
  assert.deepEqual(read.reading.pools.map(pool => pool.remaining), [100, 0]);
  assert.equal(read.reading.resetDate, '11月25日');
  assert.equal(read.reading.fetchedAt, 1000);
  const partial = cursorReading({ status: 'ready', cursorUsed: null, otherUsed: 68.5, resetDate: 'not a date' }, 1000);
  assert.deepEqual(partial.reading.pools.map(pool => pool.remaining), [31.5]);
  assert.equal(partial.reading.resetDate, null);
  assert.deepEqual(cursorReading({ status: 'ready', cursorUsed: '0', otherUsed: 101 }, 1000), { status: 'unavailable' });
  assert.deepEqual(cursorReading({ status: 'usage_hidden', cursorUsed: 0 }, 1000), { status: 'usage_hidden' });
});

test('low, critical, confirmed empty and unknown are distinct even when a reset is near', () => {
  const now = Date.now();
  const reset = resetStatus({ resetsAt: now + 2 * 3600000 }, now);
  assert.equal(reset.near, true);
  assert.deepEqual([null, 0, 0.2, 10, 10.1, 20, 20.1].map(value => poolStatus(value, false, reset)),
    ['unknown', 'empty', 'critical', 'critical', 'low', 'low', 'normal']);
  assert.equal(poolStatus(0, true, reset), 'stale');
  assert.equal(poolStatus(0, false, resetStatus({ resetsAt: now }, now)), 'stale');
  assert.equal(resetStatus({ resetsAt: now + 2 * 3600000 + 1 }, now).near, false);
});

test('date-only reset stays day-precise across a year boundary and rejects invalid dates', () => {
  const fetchedAt = new Date(2026, 11, 31, 18).getTime();
  const now = new Date(2027, 0, 1, 15).getTime();
  assert.deepEqual(resetStatus({ resetDate: '1月1日', fetchedAt }, now), { kind: 'date', near: true, elapsed: false });
  assert.deepEqual(resetStatus({ resetDate: 'Dec 31', fetchedAt }, now), { kind: 'date', near: false, elapsed: true });
  assert.equal(resetStatus({ resetDate: 'February 30', fetchedAt }, now), null);
  assert.equal(resetStatus({ resetDate: null, fetchedAt }, now), null);
  assert.equal(resetStatus({ resetDate: '2027年1月1日', fetchedAt }, now).near, true);
});

test('Qoder reads independent localized credit pools and keeps expiry apart from renewal', () => {
  const read = qoderReading({ status: 'ready', labels: [
    '我的用量', '套餐内 Credits', '0', '/ 0 (已使用 0%)', '剩余 ', '0',
    '资源包', '250.5', '/ 1,000 (已使用 26%)', '剩余 ', '749.5',
    'SOTA 专属积分', '有效期至 2030年2月3日', '0', '/ 500 (已使用 0%)', '剩余 ', '500'
  ] }, 1000);
  assert.equal(read.reading.fetchedAt, 1000);
  assert.deepEqual(read.reading.pools.map(p => [p.credits, p.total, p.expiryDate, p.resetDate]),
    [[749.5, 1000, null, null], [500, 500, '2030年2月3日', null]]);
  const en = qoderReading({ status: 'ready', labels: [
    'Plan Credits', 'Renews on Feb 3, 2030', '100', '/ 100 (100% used)', 'Remaining', '0'
  ] }, 1000);
  assert.equal(en.reading.pools[0].resetDate, 'Feb 3, 2030');
  assert.equal(en.reading.pools[0].remaining, 0);
});

test('Qoder distinguishes absent, incomplete, and exhausted credits', () => {
  const read = labels => qoderReading({ status: 'ready', labels }, 1000);
  const zero = ['Plan Credits', '0', '/ 0 (used 0%)', 'Remaining', '0'];
  assert.equal(read(zero).status, 'empty');
  assert.equal(read([...zero, 'Add-on Credits', '0']).status, 'unavailable');
  assert.equal(read(['Plan Credits', '20', '/ 100 (used 20%)', 'Remaining', '0']).status, 'unavailable');
  assert.equal(read(['Plan Credits', '20', '/ 20 (used 100%)', 'Remaining', '0']).reading.pools[0].credits, 0);
  assert.deepEqual(qoderReading({ status: 'multiple' }, 1000), { status: 'multiple' });
});

test('coding board isolates model quota from creative, tool quotas and retired accounts', () => {
  const now = 900000;
  const pool = (id, amount, label = id) => ({ id, unit: 'percent', amount, label, labelEn: label });
  const record = (source, status, fetchedAt, pools) => ({ source, status, fetchedAt, pools });
  const tool = (id, records, followed = true) => ({ id, name: id, records, followed });
  const rows = codingRows({ tools: [
    tool('codex', [record('cli', 'ready', now, [pool('coding', 2)])]),
    tool('minimax', [
      record('api', 'ready', now, [pool('coding', 0), pool('video', 80), pool('tools', 50), pool('search', 60, 'Tool requests')]),
      record('relay', 'account_changed', now + 1, [pool('coding', 80)])
    ]),
    tool('kimi', [record('relay', 'offline', now - 400000, [pool('coding', 50)])]),
    tool('zai', [record('relay', 'ready', now, [pool('coding', 80)])], false),
    tool('claude', [record('manual', 'ready', now, [pool('coding', 80)])])
  ] }, now);
  assert.deepEqual(rows.map(row => [row.name, row.stale, row.pools.map(pool => pool.remaining)]),
    [['minimax', false, [0]], ['kimi', true, [50]]]);
});

test('coding refresh uses the existing direct and shared Relay routes without querying other tools', () => {
  const tool = (id, route, options = {}) => ({ id, access: { query: { route } }, queryReady: true, ...options });
  assert.deepEqual(codingQueryTargets({ tools: [
    tool('kimi', 'relay'), tool('zai', 'api'), tool('minimax', 'subscription_api'),
    tool('firecrawl', 'api'), tool('claude', 'unsupported'), tool('qwen', 'relay', { followed: false }),
    tool('gemini', 'relay', { queryReady: false })
  ] }), ['kimi', 'zai', 'minimax']);
});

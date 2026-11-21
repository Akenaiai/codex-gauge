const { test } = require('node:test');
const assert = require('node:assert/strict');
const { devinReading } = require('../src/devin-quota.cjs');

const now = Date.UTC(2026, 10, 16, 7, 40);

test('Devin converts percentages and both reset formats and preserves an explicit zero balance', () => {
  const output = ' Daily  ■■■■  25% used  · resets in 2h 20m\r\n' +
    ' Weekly  ■■■■  100% used  · resets Nov 22, 4:00 PM (UTC+8)\r\n Extra usage balance  $0.00\r\n';
  const result = devinReading(output, now);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.reading.pools.map(pool => [pool.remaining, pool.resetsAt, pool.resetApproximate]), [
    [75, Date.UTC(2026, 10, 16, 10), true], [0, Date.UTC(2026, 10, 22, 8), undefined]
  ]);
  assert.equal(result.reading.balance, 0);
  assert.equal(result.reading.fetchedAt, now);
});

test('Devin keeps account omissions unknown and resolves a weekly reset across New Year', () => {
  const lastDay = Date.UTC(2026, 11, 30, 15);
  const result = devinReading('Weekly ■□□□ 12.5% used · resets Jan 2, 12:00 AM (UTC+5:30)', lastDay);
  assert.equal(result.reading.balance, null);
  assert.deepEqual(result.reading.pools.map(pool => [pool.labelEn, pool.remaining, pool.resetsAt]), [
    ['Weekly quota', 87.5, Date.UTC(2027, 0, 1, 18, 30)]
  ]);
  assert.equal(devinReading('Extra usage balance $1,250.25', now).reading.balance, 1250.25);
});

test('Devin rejects corrupted or ambiguous output and keeps invalid reset times unknown', () => {
  assert.deepEqual(devinReading('login_required\r\n', now), { status: 'sign_in' });
  for (const invalid of ['', 'Daily 101% used', 'Weekly 10% used\nWeekly 20% used', 'hello\nWeekly 50% used',
    'Extra usage balance $1,25.00', 'Weekly 10% used\nExtra usage balance $12 undeciphered']) {
    assert.deepEqual(devinReading(invalid, now), { status: 'unavailable' });
  }
  const invalidDate = devinReading('Weekly 10% used · resets Nov 31, 2:15 AM (UTC+8)', now);
  assert.equal(invalidDate.reading.pools[0].resetsAt, undefined);
});

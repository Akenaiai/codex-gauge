'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readKiloQuota } = require('../src/kilo-quota.cjs');

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gauge-kilo-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const directory = path.join(home, 'kilo');
  const file = path.join(directory, 'auth.json');
  const save = kilo => fs.writeFile(file, JSON.stringify({ kilo }));
  await fs.mkdir(directory);
  const read = request => readKiloQuota({ home, env: { XDG_DATA_HOME: home }, request, now: () => 12345 });
  return { read, save };
}

const entry = { type: 'oauth', access: 'synthetic-access', refresh: 'synthetic-refresh' };
const trpc = value => Response.json({ result: { data: { json: value } } });

test('Kilo reads the selected team wallet and preserves confirmed zero', async t => {
  const { read, save } = await fixture(t);

  assert.deepEqual(await read(() => assert.fail('No session should trigger a request')), { status: 'missing' });
  await save({ ...entry, accountId: 'team-1' });
  assert.deepEqual(await read(async (url, options) => {
    assert.equal(url, 'https://api.kilo.ai/api/profile/balance');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-access');
    assert.equal(options.headers['X-KiloCode-OrganizationId'], 'team-1');
    assert.equal(options.redirect, 'error');
    return Response.json({ balance: 0, other: 'field omitted from reading' });
  }), { status: 'ready', reading: { balance: 0, organization: true, fetchedAt: 12345, plans: [], subscriptionsUnavailable: false } });

  for (const payload of [{}, { balance: '0' }, { balance: null }]) {
    assert.deepEqual(await read(async () => Response.json(payload)), { status: 'unavailable' });
  }
  assert.deepEqual(await read(async () => new Response(null, { status: 401 })), { status: 'sign_in' });
  assert.deepEqual(await read(async () => new Response(null, { status: 429 })), { status: 'unavailable' });
  assert.deepEqual(await read(async () => {
    await save({ type: 'api', key: 'synthetic-key' });
    return Response.json({ balance: 5 });
  }), { status: 'unavailable' });
  assert.deepEqual(await read(async (url, options) => {
    assert.equal(options.headers['X-KiloCode-OrganizationId'], undefined);
    if (url.includes('kiloPass.getState')) return trpc({ subscription: null });
    if (url.includes('codingPlans.listSubscriptions')) return trpc([]);
    return Response.json({ balance: 2.15 });
  }), { status: 'ready', reading: { balance: 2.15, organization: false, fetchedAt: 12345, plans: [], subscriptionsUnavailable: false } });
});

test('Kilo reconciles Pass cycle money and each marketplace reset without treating billing as a reset', async t => {
  const { read, save } = await fixture(t);
  await save(entry);
  const billing = '2027-01-13T17:00:00+08:00';
  const reset = '2026-11-19T03:00:00Z';
  const plan = { id: 'subscription', planName: 'Lite', providerName: 'BytePlus', providerId: 'byteplus',
    status: 'active', canQueryUsage: true };
  const result = await read(async url => {
    const path = new URL(url);
    if (path.pathname.endsWith('/balance')) return Response.json({ balance: 40.57 });
    if (path.pathname.endsWith('kiloPass.getState')) {
      assert.equal(path.searchParams.get('batch'), '1');
      return Response.json([{ result: { data: { json: { subscription: {
        status: 'active', currentPeriodBaseCreditsUsd: 19, currentPeriodBonusCreditsUsd: 9.5, currentPeriodUsageUsd: 20, nextBillingAt: billing
      } } } } }]);
    }
    if (path.pathname.endsWith('listSubscriptions')) return trpc([plan, { ...plan, id: 'canceled', status: 'canceled' }]);
    assert.equal(path.pathname, '/api/trpc/codingPlans.getUsage');
    assert.deepEqual(JSON.parse(path.searchParams.get('input')), { subscriptionId: plan.id });
    return trpc({ schemaVersion: 1, subscription: { ...plan, windows: [
      { id: 'five_hour', period: { value: 5, unit: 'hour' }, remainingPercent: 0, resetsAt: reset },
      { id: 'weekly', period: { value: 1, unit: 'week' }, remainingPercent: 48, resetsAt: '2026-02-30T03:00:00Z' },
      { id: 'monthly', period: { value: 1, unit: 'month' }, remainingPercent: 150, resetsAt: reset }
    ] } });
  });
  assert.equal(result.reading.balance, 40.57);
  const [pass, marketplace] = result.reading.plans;
  assert.equal(pass.name, 'Kilo Pass');
  assert.equal(pass.pools[0].credits, 8.5);
  assert.equal(pass.pools[0].total, 28.5);
  assert.equal(pass.billingAt, Date.parse(billing));
  assert.equal(pass.pools[0].resetsAt, undefined);
  assert.equal(marketplace.name, 'BytePlus · Lite');
  assert.deepEqual(marketplace.pools.map(p => [p.labelEn, p.remaining, p.resetsAt]), [
    ['5-hour', 0, Date.parse(reset)], ['1-week', 48, null]
  ]);
});

test('Kilo wallet survives partial failures; canceled or mismatched subscriptions cannot manufacture quota', async t => {
  const { read, save } = await fixture(t);
  await save(entry);
  const plan = { id: 'subscription', planName: 'MiniMax Plus', providerName: 'MiniMax', providerId: 'minimax',
    status: 'past_due', canQueryUsage: true };
  const result = await read(async url => {
    if (url.includes('kiloPass.getState')) return trpc({ subscription: { status: 'canceled', currentPeriodBaseCreditsUsd: 49 } });
    if (url.includes('listSubscriptions')) return trpc([plan]);
    if (url.includes('getUsage')) return trpc({ schemaVersion: 1, subscription: { id: 'different-account-subscription' } });
    return Response.json({ balance: 8 });
  });
  assert.deepEqual(result.reading.plans, [{ name: 'MiniMax Plus', pools: [] }]);
  const unavailable = await read(async url => {
    if (url.includes('kiloPass.getState')) throw new Error('offline');
    if (url.includes('listSubscriptions')) return trpc([]);
    return Response.json({ balance: 8 });
  });
  assert.equal(unavailable.reading.subscriptionsUnavailable, true);
  assert.equal(unavailable.reading.balance, 8);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { QuotaService } = require('../src/cli.cjs');
test('an account switch during a fetch discards the whole observation', async () => {
  const service = new QuotaService(); service.active = true;
  let reads = 0;
  service.rpc = { call: async method => method === 'account/read'
    ? { account: { type: 'chatgpt', email: ++reads === 1 ? 'one@example.invalid' : 'two@example.invalid' } }
    : { rateLimits: { primary: { usedPercent: 20, windowDurationMins: 300 } } }, stop() {} };
  await service.refresh(); service.stop();
  assert.equal(service.status, 'account_changed'); assert.equal(service.snapshot, null); assert.equal(service.accountKey, null);
});
test('a quota read failure keeps the previous reading but explicitly marks it offline', async () => {
  const service = new QuotaService(); service.active = true; service.snapshot = { fetchedAt: 1 };
  service.rpc = { call: async () => { throw new Error('network_detail_must_not_surface'); }, stop() {} };
  await service.refresh(); service.stop();
  assert.equal(service.status, 'offline'); assert.equal(service.snapshot.fetchedAt, 1);
});

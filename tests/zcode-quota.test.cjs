const { test } = require('node:test');
const assert = require('node:assert/strict');
const { apiBalance, securedApiBalance } = require('../src/credit-adapters.cjs');
const { accessFor } = require('../src/connection-capabilities.cjs');
const { CreditSecrets } = require('../src/credit-credentials.cjs');
const { CreditCenter } = require('../src/credit-center.cjs');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const key = 'synthetic-coding-plan-key';
const result = { code: 200, data: { limits: [{ type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 56, nextResetTime: 1800000000000 }] } };

test('BigModel China uses the explicitly supplied key on the fixed quota endpoint', async () => {
  const [row] = await apiBalance('zai', key, async (url, options) => {
    assert.equal(url, 'https://open.bigmodel.cn/api/monitor/usage/quota/limit');
    assert.equal(options.headers.Authorization, 'Bearer ' + key);
    return result;
  });
  assert.equal(row.pools[0].amount, 44);
  assert.equal(row.pools[0].resetsAt, 1800000000000);
  assert.equal(row.source, 'api');
  assert.ok(!JSON.stringify(row).includes(key));
  await assert.rejects(apiBalance('zai', key, async () => ({ code: 200, data: {} })), /invalid_response/);
});

test('ZCode stays disconnected until Gauge verifies and stores a user-supplied key', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-zai-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const secrets = new CreditSecrets(dir, { isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(value), decryptString: buffer => buffer.toString() });
  const probe = { platform: 'win32', api: {}, checks: {}, mcp: {} };
  assert.equal(accessFor({ id: 'zai' }, { probe, relayEnabled: true }).query.canAttempt, false);
  await assert.rejects(securedApiBalance('zai', { home: dir, env: {}, request: () => assert.fail() }), /login_required/);
  let response = { code: 401 };
  const options = { home: dir, env: {}, request: async () => response,
    credentialProvider: id => secrets.get(id), hasCredential: id => secrets.has(id), saveCredential: (id, value) => secrets.set(id, value) };
  const center = new CreditCenter(dir, options);
  t.after(() => center.stop());
  await assert.rejects(center.connect('zai', key));
  assert.equal(secrets.has('zai'), false);
  response = result;
  await center.connect('zai', key);
  assert.equal(secrets.get('zai'), key);
  assert.equal(center.access({id:'zai'}).query.canAttempt, true);
  await center.query('zai');
  assert.equal(center.records.filter(r => r.provider === 'zai' && r.status === 'ready').length, 1);
  assert.equal(center.records.find(r => r.provider === 'zai').pools[0].amount, 44);
});

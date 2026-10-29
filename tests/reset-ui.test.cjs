const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const resetModel = require('../src/ui/reset-model.js');
const NOW = 1800000000000;
async function render({ language = 'zh-CN', status = 'ready', until = NOW + 5400000, newsStatus = 'announced', kind = 'direct_reset', precision = 'deadline', sourceStatus = 'ready', creditHours = null, age = 0, view = 'panel', notificationDelivery } = {}) {
  const app = { innerHTML: '' };
  const weekly = { remaining: 80, minutes: 10080, resetsAt: NOW + 5400000 };
  const state = { settings: { language, resetNews: true, resetReminders: true }, dark: true, status, notificationDelivery,
    snapshot: { windows: [weekly], weekly, credits: creditHours == null ? [] : [{ expiresAt: NOW + creditHours * 3600000 }], creditCount: creditHours == null ? 0 : 1, fetchedAt: NOW - age }, host: { platform: 'win32', anchored: true },
    update: { state: 'idle' }, version: '0.2.0', resetFeed: { status: sourceStatus, fetchedAt: NOW, checkedAt: NOW,
      events: [{ id: 'demo', type: kind, status: newsStatus, kindKnown: true, scopeKnown: false, precision, until, updatedAt: NOW, confirmation: 'source_post', sourceUrl: 'https://x.com/example/status/123' }] } };
  const noop = () => {};
  class Clock extends Date { static now() { return NOW; } }
  const window = { resetModel, gauge: { state: async () => state, onState: noop } };
  vm.runInNewContext(fs.readFileSync('src/ui/app.js', 'utf8'), { window, Date: Clock, URLSearchParams,
    location: { search: '?view=' + view }, document: { getElementById: () => app, addEventListener: noop,
      documentElement: {}, body: { addEventListener: noop } }, setInterval: noop });
  await Promise.resolve();
  return app.innerHTML;
}
test('notification failure, exhaustion and uncertain delivery have distinct bilingual notices', async () => {
  const notificationDelivery = { failed: 2, exhausted: 1, unknown: 1, storageError: true };
  const cn = await render({ notificationDelivery }), en = await render({ language: 'en', notificationDelivery });
  for (const text of ['有限重试', '3 次上限', '送达结果未知', '通知状态未能保存']) assert.ok(cn.includes(text));
  for (const text of ['Limited retries', 'three-attempt limit', 'notification is unknown', 'could not be saved']) assert.ok(en.includes(text));
});
test('Chinese and English show countdown, balance and eligibility uncertainty together', async () => {
  const cn = await render();
  for (const text of ['还有 1 小时 30 分钟', '剩余 80%', '预告最晚', '适用账户范围尚未明确', 'AIHOT 整理']) assert.ok(cn.includes(text), text);
  const en = await render({ language: 'en' });
  for (const text of ['In 1h 30m', '80% remaining', 'Announced by', 'Eligible accounts unspecified', 'Via AIHOT']) assert.ok(en.includes(text), text);
});
test('unknown timing and confirmed credit grants cannot become imminent reset countdowns', async () => {
  assert.ok((await render({ until: null })).includes('具体时间待定'));
  const confirmed = await render({ newsStatus: 'confirmed', kind: 'reset_credit' });
  assert.ok(confirmed.includes('重置卡发放')); assert.ok(confirmed.includes('原帖确认'));
  assert.ok(!confirmed.includes('有待执行预告'));
});
test('offline and elapsed news remain explicitly unconfirmed or stale', async () => {
  assert.ok((await render({ sourceStatus: 'offline' })).includes('消息源暂未更新'));
  assert.ok((await render({ until: NOW - 1 })).includes('预告时间已过，等待确认'));
  assert.ok((await render({ status: 'offline' })).includes('上次读数'));
});
test('active announcements and urgent credits appear before dials exactly once', async () => {
  const html = await render({ creditHours: 12 });
  assert.ok(html.indexOf('credit-card expiring critical') < html.indexOf('reset-news prominent'));
  assert.ok(html.indexOf('reset-news prominent') < html.indexOf('class="dials"'));
  assert.equal((html.match(/class="credit-card /g) || []).length, 1);
  assert.equal((html.match(/class="reset-news /g) || []).length, 1);
  assert.ok(html.includes('重置卡即将失效'));
  const en = await render({ language: 'en', creditHours: 12 });
  assert.ok(en.includes('RESET CREDIT EXPIRES SOON')); assert.ok(en.includes('WITHIN 24H'));
});
test('stale or elapsed announcements and distant credits do not get urgency styling', async () => {
  for (const options of [{ sourceStatus: 'offline', creditHours: 84 }, { until: NOW - 1, creditHours: 84 }]) {
    const html = await render(options);
    assert.ok(!html.includes('reset-news prominent'));
    assert.ok(!html.includes('credit-card expiring'));
  }

});
test('small gauge gives expiring cards a red marker ahead of reset markers', async () => {
  const urgent = await render({ view: 'badge', creditHours: 12 });
  assert.ok(urgent.includes('credit-urgent')); assert.ok(urgent.includes('credit-dot'));
  assert.ok(urgent.includes('重置卡即将到期，展开查看'));
  const normal = await render({ view: 'badge', creditHours: 84 });
  assert.ok(!normal.includes('credit-urgent')); assert.ok(normal.includes('has-reset'));
});

test('offline and old ready readings retain red credit priority with explicit bilingual last-reading labels', async () => {
  for (const options of [{ status: 'offline' }, { status: 'timeout' }, { status: 'ready', age: 180000 }]) {
    for (const language of ['zh-CN', 'en']) {
      const html = await render({ ...options, language, creditHours: 5 });
      assert.ok(html.includes('credit-card expiring critical'));
      assert.ok(html.indexOf('credit-card expiring') < html.indexOf('class="dials"'));
      assert.ok(html.includes(language === 'en' ? 'Last reading ·' : '上次数据 ·'));
      assert.ok(html.includes(language === 'en' ? 'availability awaiting refresh' : '实际可用情况待刷新确认'));
      const badge = await render({ ...options, language, creditHours: 5, view: 'badge' });
      assert.ok(badge.includes('credit-urgent')); assert.ok(badge.includes('credit-dot'));
      assert.ok(badge.includes(language === 'en' ? '(last reading)' : '（上次数据）'));
    }
  }
});
test('fresh readings clear stale labels, and elapsed or absent credits clear red urgency', async () => {
  assert.ok(!(await render({ creditHours: 5 })).includes('credit-last-reading'));
  for (const creditHours of [0, -1, null, 49]) {
    assert.ok(!(await render({ status: 'offline', creditHours })).includes('credit-card expiring'));
    assert.ok(!(await render({ status: 'offline', creditHours, view: 'badge' })).includes('credit-urgent'));
  }
  assert.ok((await render({ status: 'offline', creditHours: -1 })).includes('最近一张已到期，等待更新'));
});

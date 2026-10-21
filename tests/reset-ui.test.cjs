const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const resetModel = require('../src/ui/reset-model.js');
const NOW = 1800000000000;
async function render({ language = 'zh-CN', status = 'ready', until = NOW + 5400000, newsStatus = 'announced', kind = 'direct_reset', precision = 'deadline', sourceStatus = 'ready' } = {}) {
  const app = { innerHTML: '' };
  const weekly = { remaining: 80, minutes: 10080, resetsAt: NOW + 5400000 };
  const state = { settings: { language, resetNews: true, resetReminders: true }, dark: true, status,
    snapshot: { windows: [weekly], weekly, credits: [], creditCount: 0, fetchedAt: NOW }, host: { platform: 'win32', anchored: true },
    update: { state: 'idle' }, version: '0.2.0', resetFeed: { status: sourceStatus, fetchedAt: NOW, checkedAt: NOW,
      events: [{ id: 'demo', type: kind, status: newsStatus, kindKnown: true, scopeKnown: false, precision, until, updatedAt: NOW, confirmation: 'source_post', sourceUrl: 'https://x.com/example/status/123' }] } };
  const noop = () => {};
  class Clock extends Date { static now() { return NOW; } }
  const window = { resetModel, gauge: { state: async () => state, onState: noop } };
  vm.runInNewContext(fs.readFileSync('src/ui/app.js', 'utf8'), { window, Date: Clock, URLSearchParams,
    location: { search: '?view=panel' }, document: { getElementById: () => app, addEventListener: noop,
      documentElement: {}, body: { addEventListener: noop } }, setInterval: noop });
  await Promise.resolve();
  return app.innerHTML;
}
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

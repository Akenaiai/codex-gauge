const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function renderer() {
  const app = { innerHTML: '' }, noop = () => {};
  let update;
  const window = { resetModel: require('../src/ui/reset-model.js'), gauge: {
    state: () => new Promise(noop), onState: callback => { update = callback; }
  } };
  vm.runInNewContext(fs.readFileSync('src/ui/app.js', 'utf8'), {
    window, URLSearchParams, location: { search: '?view=badge' }, setInterval: noop,
    document: { getElementById: () => app, addEventListener: noop, documentElement: {}, body: { addEventListener: noop } }
  });
  return (remaining, { weekly = 64, weeklyOnly = false, offline = false, credit = false, language = 'en' } = {}) => {
    const w = value => value === null ? null : { remaining: value, minutes: 300, resetsAt: Date.now() + 8640000 };
    update({ settings: { language }, status: offline ? 'offline' : 'ready', dark: true,
      snapshot: { fiveHour: weeklyOnly ? null : w(remaining), weekly: weeklyOnly ? { ...w(remaining), minutes: 10080 } : w(weekly),
        fetchedAt: Date.now(), credits: credit ? [{ expiresAt: Date.now() + 3600000 }] : [] } });
    return app.innerHTML;
  };
}

test('badge follows the visible battery thresholds, including zero and fractional readings', async () => {
  const render = await renderer();
  for (const [value, tone] of [[100, ''], [21, ''], [20.9, 'quota-low'], [20, 'quota-low'], [11, 'quota-low'], [10.9, 'quota-critical'], [10, 'quota-critical'], [0, 'quota-critical'], [null, ''], [NaN, '']]) {
    const html = render(value, { weekly: value === null ? null : 64 });
    const badge = html.match(/class="micro ([^"]*)"/)[1];
    assert.equal(badge.includes('quota-low'), tone === 'quota-low', String(value));
    assert.equal(badge.includes('quota-critical'), tone === 'quota-critical', String(value));
    if (tone) assert.ok(html.includes(`stroke="var(--${tone})"`));
    if (value === null || Number.isNaN(value)) assert.ok(html.includes('class="reading">—'));
  }
});

test('weekly arc is independent, weekly-only accounts and replenishment recover correctly', async () => {
  const render = await renderer();
  const mixed = render(70, { weekly: 7 });
  assert.ok(mixed.includes('stroke="var(--quota-critical)" stroke-width="1"'));
  assert.ok(!mixed.match(/class="micro ([^"]*)"/)[1].includes('quota-critical'));
  assert.ok(render(9, { weeklyOnly: true }).includes('class="unit">WEEK'));
  const recovered = render(80);
  assert.ok(!recovered.includes('quota-critical'));
  assert.ok(!recovered.includes('quota-low'));
});

test('low quota coexists with expiry markers and marks stale readings in both languages', async () => {
  const render = await renderer();
  for (const language of ['en', 'zh-CN']) {
    const html = render(10, { offline: true, credit: true, language });
    for (const marker of ['quota-critical', 'stale', 'credit-urgent', 'credit-dot']) assert.ok(html.includes(marker));
    assert.ok(html.includes(language === 'en' ? 'quota nearly depleted' : '额度即将用尽'));
    assert.ok(html.includes(language === 'en' ? '(last reading)' : '（上次读数）'));
  }
});

'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

const existingProviders = new Set(['claude', 'gemini', 'qwen', 'kimi', 'minimax', 'zai']);
const percent = value => Number.isFinite(value) && value >= 0 && value <= 100;
const cursorPools = [
  ['cursorUsed', 'Cursor 模型', 'Cursor Models'],
  ['otherUsed', '其他模型', 'Other Models']
];

async function readDesktopQuota(executable, parse, now = Date.now) {
  if (!executable) return { status: 'unsupported' };
  try {
    const { stdout } = await exec(executable, [], { windowsHide: true, timeout: 5000, maxBuffer: 65536, encoding: 'utf8' });
    return parse(JSON.parse(stdout), now());
  } catch { return { status: 'unavailable' }; }
}

const readCursor = executable => readDesktopQuota(executable, cursorReading);
const readQoder = executable => readDesktopQuota(executable, qoderReading);

function cursorReading(input, now) {
  if (['closed', 'usage_hidden', 'multiple'].includes(input?.status)) return { status: input.status };
  if (input?.status !== 'ready') return { status: 'unavailable' };
  const pools = cursorPools.filter(([key]) => percent(input[key])).map(([key, label, labelEn]) =>
    ({ label, labelEn, remaining: 100 - input[key] }));
  if (!pools.length) return { status: 'unavailable' };
  const date = input.resetDate;
  const resetDate = typeof date === 'string' && /^(?:\d{1,2}月\d{1,2}日|[A-Za-z]{3,9} \d{1,2}(?:, \d{4})?|\d{1,2} [A-Za-z]{3,9}(?: \d{4})?)$/.test(date) ? date : null;
  return { status: 'ready', reading: { pools, resetDate, fetchedAt: now } };
}

const qoderPools = [
  ['套餐内 Credits', 'Plan Credits', /^套餐内 Credits$|^Plan Credits$/i],
  ['资源包', 'Add-on Credits', /^资源包$|^Add-on Credits$/i],
  ['共享资源包', 'Shared Add-on Credits', /^共享资源包$|^Shared Add-on Credits$/i],
  ['个人专属资源包', 'Dedicated Credits', /^个人专属资源包$|^Dedicated Credits$/i],
  ['SOTA 专属积分', 'SOTA Credits', /^SOTA (?:专属积分|(?:Exclusive )?Credits)$/i]
];
const creditNumber = '(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]+)?';
const creditAmount = new RegExp(`^${creditNumber}$`);
const usedTotal = new RegExp(`^/\\s*(${creditNumber})\\s*\\((?:已使用\\s*${creditNumber}%|used\\s*${creditNumber}%|${creditNumber}%\\s*used)\\)$`, 'i');
const digits = value => creditAmount.test(value) ? Number(value.replace(/,/g, '')) : NaN;

function qoderReading(input, now) {
  if (['closed', 'usage_hidden', 'multiple'].includes(input?.status)) return { status: input.status };
  if (input?.status !== 'ready' || !Array.isArray(input.labels)) return { status: 'unavailable' };
  const fields = input.labels.map(field => typeof field === 'string' ? field.trim() : '');
  const pools = [];
  let knownPools = 0, zeroTotals = 0;
  for (const [index, title] of fields.entries()) {
    const definition = qoderPools.find(([, , pattern]) => pattern.test(title));
    if (!definition) continue;
    knownPools++;
    const [label, labelEn] = definition;
    const caption = fields[index + 1];
    const expiryDate = /^(?:有效期至\s+|Expires on\s+)(.+)$/i.exec(caption)?.[1] ?? null;
    const resetDate = (/^将于\s+(.+?)\s+刷新$/.exec(caption) || /^Renews on\s+(.+)$/i.exec(caption))?.[1] ?? null;
    const first = index + (expiryDate || resetDate ? 2 : 1);
    const used = digits(fields[first]);
    const total = digits(usedTotal.exec(fields[first + 1])?.[1]);
    const credits = digits(fields[first + 3]);
    // The app renders used, total, and remaining independently. Validate all three before using the row.
    if (!/^(?:剩余|Remaining)$/i.test(fields[first + 2]) || ![used, total, credits].every(Number.isFinite) ||
        Math.abs(credits - Math.max(0, total - used)) > 0.02) continue;
    if (total === 0) { if (used === 0) zeroTotals++; continue; }
    pools.push({ label, labelEn, remaining: 100 * (credits / total), credits, total, expiryDate, resetDate });
  }
  if (pools.length) return { status: 'ready', reading: { pools, fetchedAt: now } };
  return { status: knownPools > 0 && knownPools === zeroTotals || fields.some(field => /^(?:当前账户暂无可展示的用量。|There is no usage to display for this account\.)$/i.test(field))
    ? 'empty' : 'unavailable' };
}

function codingRows(state, now = Date.now()) {
  return (state?.tools || []).filter(tool => existingProviders.has(tool.id) && tool.followed !== false).flatMap(tool => {
    const record = (tool.records || []).filter(r => r.status !== 'account_changed' &&
      ['relay', 'api', 'cli'].includes(r.source) && r.pools?.some(isCodingPool)).sort((a, b) =>
      Number(b.status === 'ready') - Number(a.status === 'ready') || b.fetchedAt - a.fetchedAt)[0];
    if (!record) return [];
    const pools = record.pools.filter(isCodingPool).map(p => ({
      label: p.label, labelEn: p.labelEn, remaining: p.amount, resetsAt: p.resetsAt
    }));
    const stale = record.status !== 'ready' || record.stale || now - record.fetchedAt >= 300000;
    return [{ name: tool.name, fetchedAt: record.fetchedAt, stale, pools, querying: tool.querying,
      error: record.error }];
  });
}

function isCodingPool(pool) {
  return pool.unit === 'percent' && percent(pool.amount) && !pool.resource &&
    !['video', 'tools'].includes(pool.id) && !['not_in_plan', 'unknown'].includes(pool.entitlement) &&
    !/工具|tool\s*(?:requests|quota)/i.test(pool.label + ' ' + pool.labelEn);
}

function codingQueryTargets(state) {
  const targets = new Map();
  for (const tool of state?.tools || []) {
    if (!existingProviders.has(tool.id) || tool.followed === false || !tool.queryReady) continue;
    const route = tool.access?.query?.route;
    if (route === 'relay' && ['kimi', 'minimax'].includes(tool.id) || tool.id === 'minimax' && route === 'subscription_api' || tool.id === 'zai' && route === 'api') {
      targets.set(route, tool.id);
    }
  }
  return [...targets.values()];
}

module.exports = { readCursor, cursorReading, readQoder, qoderReading, codingRows, codingQueryTargets };

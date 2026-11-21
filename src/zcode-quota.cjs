'use strict';
const { hash } = require('./catalog.cjs');

// Use only the Coding Plan key supplied to Gauge for this connection.
async function zcodePools(key, request) {
  const raw = await request('https://open.bigmodel.cn/api/monitor/usage/quota/limit', {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' }
  });
  if (![0, 200, '0', '200'].includes(raw?.code) || !Array.isArray(raw.data?.limits)) throw Error('invalid_response');
  const usage = raw.data;
  const units = { 3: ['小时', 'hours'], 4: ['天', 'days'], 5: ['月', 'months'], 6: ['周', 'weeks'] };
  const pools = (Array.isArray(usage.limits) ? usage.limits : []).flatMap(window => {
    const unit = units[window?.unit], used = window?.percentage, count = window?.number;
    if (!['TOKENS_LIMIT', 'CREDIT_LIMIT', 'TIME_LIMIT'].includes(window?.type)) return [];
    const tool = window.type === 'TIME_LIMIT';
    if (!unit || !Number.isInteger(count) || count < 1 || !Number.isFinite(used) || used < 0 || used > 100) {
      if (tool) return [];
      throw Error('invalid_response');
    }
    const reset = window.nextResetTime;
    const resetsAt = Number.isSafeInteger(reset) && reset > 0 ? (reset < 1e11 ? reset * 1000 : reset) : null;
    return [{ id: hash(`${window.type}:${window.unit}:${count}`),
      label: `${count} ${unit[0]}${tool ? ' · 工具次数' : ''}`, labelEn: `${count} ${unit[1]}${tool ? ' · Tool requests' : ''}`,
      amount: 100 - used, unit: 'percent', resource: tool ? 'tools' : null, resetsAt }];
  });
  if (!pools.some(pool => !pool.resource) || new Set(pools.map(pool => pool.id)).size !== pools.length) throw Error('invalid_response');
  return pools;
}

module.exports = { zcodePools };

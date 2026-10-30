'use strict';
const { hash } = require('./catalog.cjs');
const FRESH_MS = 5 * 60000;
const numeric = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function time(v) { return Number.isSafeInteger(v) && v > 0 ? v : null; }
function value(v) { if (v == null) return null; const n = typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v) ? Number(v) : v; if (!numeric(n)) throw new Error('invalid_balance'); return n; }
function cleanRecord(input, now = Date.now()) {
  if (!input || !/^[a-z0-9_-]{1,80}$/.test(input.provider) || typeof input.scope !== 'string' || input.scope.length < 1 || input.scope.length > 180) throw new Error('invalid_account');
  if (!Array.isArray(input.pools) || input.pools.length > 30 || !input.pools.length) throw new Error('invalid_pools');
  const fetchedAt = time(input.fetchedAt); if (!fetchedAt || fetchedAt > now + 10000) throw new Error('invalid_timestamp');
  const ids = new Set();
  const pools = input.pools.map(p => {
    if (!p || !/^[a-z0-9_.:-]{1,100}$/.test(p.id) || ids.has(p.id) || !['credits', 'cards', 'percent', 'CNY', 'USD', 'requests', 'tokens'].includes(p.unit)) throw new Error('invalid_pool');
    ids.add(p.id);
    const amount = value(p.amount), limit = value(p.limit);
    if (p.unit === 'percent' && amount !== null && amount > 100) throw new Error('invalid_balance');
    return { id: p.id, label: String(p.label || p.id).slice(0, 100), labelEn: String(p.labelEn || p.label || p.id).slice(0, 100),
      unit: p.unit, amount, limit, expiresAt: time(p.expiresAt), resetsAt: time(p.resetsAt), periodStart: time(p.periodStart), periodEnd: time(p.periodEnd),
      dateSource: p.dateSource === 'user' ? 'user' : 'upstream', entitlement: ['available','exhausted','not_in_plan','unknown'].includes(p.entitlement) ? p.entitlement : null };
  });
  const account = typeof input.account === 'string' ? input.account.slice(0, 100) : '';
  return { id: input.provider + ':' + hash(input.scope), provider: input.provider, scope: hash(input.scope), account,
    identityVerified: input.identityVerified === true, fetchedAt, status: 'ready', error: null,
    source: ['cli', 'api', 'relay', 'host', 'codex', 'manual', 'mcp'].includes(input.source) ? input.source : 'host', pools };
}
function fresh(record, now = Date.now()) { return record?.status === 'ready' && record.fetchedAt <= now && now - record.fetchedAt < FRESH_MS; }
function poolWithRule(record, pool, rules) {
  const rule = rules[record.id + '/' + pool.id];
  if (!rule) return pool;
  return { ...pool, expiresAt: rule.expiresAt || pool.expiresAt, resetsAt: rule.resetsAt || pool.resetsAt,
    dateSource: rule.expiresAt || rule.resetsAt ? 'user' : pool.dateSource, rule };
}
function validateRule(input) {
  if (!input || typeof input !== 'object') throw new Error('invalid_rule');
  const expiresAt = input.expiresAt == null || input.expiresAt === '' ? null : time(input.expiresAt);
  const resetsAt = input.resetsAt == null || input.resetsAt === '' ? null : time(input.resetsAt);
  if (input.expiresAt && !expiresAt || input.resetsAt && !resetsAt) throw new Error('invalid_rule');
  return { expiresAt, resetsAt, notify: input.notify !== false, confirmedAt: Date.now() };
}
function events(records, rules = {}, now = Date.now()) {
  const result = [];
  for (const record of records) for (const raw of record.pools) {
    const p = poolWithRule(record, raw, rules), stale = !fresh(record, now);
    for (const kind of ['expiry', 'reset', 'billing']) {
      const at = kind === 'expiry' ? p.expiresAt : kind === 'reset' ? p.resetsAt : p.periodEnd;
      if (!at || at < now - 7 * 86400000 || at > now + 366 * 86400000) continue;
      result.push({ id: `${record.id}/${p.id}/${kind}/${at}`, recordId: record.id, provider: record.provider, poolId: p.id,
        label: p.label, labelEn: p.labelEn, amount: p.amount, unit: p.unit, kind, at, stale, elapsed: at <= now,
        source: kind==='expiry'&&p.rule?.expiresAt||kind==='reset'&&p.rule?.resetsAt?'user':'upstream', recordSource:record.source, identityVerified:record.identityVerified, notify: p.rule?.notify !== false });
    }
  }
  return result.sort((a,b) => a.at - b.at);
}
function expiryAlerts(records, rules = {}, now = Date.now()) {
  return events(records, rules, now).filter(e => e.kind === 'expiry' && e.notify && (!e.stale || ['manual','host'].includes(e.recordSource) && e.source === 'user') &&
    (!['relay','cli','mcp'].includes(e.recordSource) || e.identityVerified) && !e.elapsed && e.amount > 0 && e.at - now <= 7 * 86400000).map(e => {
    const hours = (e.at - now) / 3600000; const stage = hours <= 24 ? '1d' : hours <= 72 ? '3d' : '7d';
    return { ...e, key: 'center:' + hash(e.id) + ':' + stage, expiresAt: e.at, stage, hours: Math.ceil(hours) };
  });
}
function recoveryAlerts(previous, current, now = Date.now()) {
  if (!previous || !['ready','offline','stale'].includes(previous.status) || now - previous.fetchedAt > 35*86400000 || !fresh(current, now) || previous.id !== current.id || !current.identityVerified || !previous.identityVerified || current.fetchedAt <= previous.fetchedAt) return [];
  const result = [];
  for (const pool of current.pools) {
    const old = previous.pools.find(p => p.id === pool.id);
    // A larger balance alone is not evidence of renewal. Require a crossed,
    // upstream-reported cycle boundary AND the next upstream cycle AND recovery.
    if (!old?.resetsAt || old.resetsAt > now || old.resetsAt <= previous.fetchedAt || !pool.resetsAt || pool.resetsAt <= old.resetsAt || pool.amount == null || old.amount == null || pool.amount <= old.amount) continue;
    result.push({ key: `center:recovered:${current.id}:${hash(pool.id)}:${old.resetsAt}`, expiresAt: now + 86400000,
      provider: current.provider, recordId: current.id, poolId:pool.id, label: pool.label, labelEn: pool.labelEn, amount: pool.amount, unit: pool.unit, kind: 'recovered', at: now });
  }
  return result;
}
function renewalAlerts(records,rules={},now=Date.now()) {
  return events(records,rules,now).filter(e=>e.kind==='reset'&&e.notify&&(!['cli','relay','mcp'].includes(e.recordSource)||e.identityVerified)).flatMap(e=>{
    if(e.source==='user'&&e.at<=now&&now-e.at<86400000)return[{...e,kind:'check_renewal',key:'center:check:'+hash(e.id),expiresAt:e.at+86400000}];
    if(e.source!=='upstream'||e.stale||e.unit!=='percent'||e.amount<30||e.at<=now||e.at-now>2*3600000)return[];
    const minutes=Math.ceil((e.at-now)/60000),stage=minutes<=60?'1h':'2h';
    return[{...e,kind:'reset_soon',key:'center:reset:'+hash(e.id)+':'+stage,expiresAt:e.at,minutes}];
  });
}
module.exports = { FRESH_MS, numeric, time, value, cleanRecord, fresh, poolWithRule, validateRule, events, expiryAlerts, recoveryAlerts, renewalAlerts };

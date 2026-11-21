'use strict';
const { readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const API = 'https://api.kilo.ai';

async function readLogin(file) {
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const entry = JSON.parse(content)?.kilo;
  if (!entry) return null;
  const token = entry.type === 'oauth' ? entry.access : entry.type === 'api' ? entry.key : null;
  const organizationId = entry.type === 'oauth' ? entry.accountId : undefined;
  if (typeof token !== 'string' || !/^[\x21-\x7e]+$/.test(token) ||
      (organizationId != null && (typeof organizationId !== 'string' || !/^[\w-]+$/.test(organizationId)))) {
    throw new Error('invalid_kilo_login');
  }
  return { token, organizationId };
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const local = value.slice(0, 19);
  const calendar = Date.parse(local + 'Z');
  const ms = Date.parse(value);
  return Number.isFinite(ms) && Number.isFinite(calendar) && new Date(calendar).toISOString().slice(0, 19) === local ? ms : null;
}

async function trpc(get, procedure, params) {
  const response = await get('/api/trpc/' + procedure + (params ? '?' + params : ''));
  if (!response.ok) throw new Error('kilo_subscription_unavailable');
  const payload = await response.json();
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (item?.error || !item?.result || !Object.hasOwn(item.result, 'data')) throw new Error('kilo_subscription_unavailable');
  const data = item.result.data;
  return data && typeof data === 'object' && Object.hasOwn(data, 'json') ? data.json : data;
}

async function passPlan(get) {
  const params = new URLSearchParams({ batch: '1', input: JSON.stringify({ 0: null }) });
  const result = await trpc(get, 'kiloPass.getState', params);
  if (!result || !Object.hasOwn(result, 'subscription')) throw new Error('kilo_pass_unavailable');
  const subscription = result.subscription;
  if (subscription === null) return [];
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) throw new Error('kilo_pass_unavailable');
  if (typeof subscription.status === 'string' && !['active', 'trialing', 'past_due'].includes(subscription.status)) return [];
  const base = subscription.currentPeriodBaseCreditsUsd;
  const bonus = subscription.currentPeriodBonusCreditsUsd === null ? 0 : subscription.currentPeriodBonusCreditsUsd;
  const used = subscription.currentPeriodUsageUsd;
  const total = base + bonus;
  const valid = [base, bonus, used, total].every(amount => Number.isFinite(amount) && amount >= 0) && total > 0;
  const credits = valid ? Math.max(0, Math.round((total - used) * 1e6) / 1e6) : null;
  return [{
    name: 'Kilo Pass', billingAt: timestamp(subscription.nextBillingAt) ?? timestamp(subscription.nextRenewalAt),
    pools: valid ? [{
      label: '本期额度（含奖励）', labelEn: 'Cycle allowance (incl. bonus)', unit: 'USD',
      remaining: Math.min(100, 100 * credits / total), credits, total
    }] : []
  }];
}

async function marketplacePlan(get, entry) {
  const { id, planName, providerName } = entry;
  const name = (planName.toLowerCase().includes(providerName.toLowerCase()) ? planName : providerName + ' · ' + planName).slice(0, 160);
  const plan = { name, pools: [] };
  if (entry.canQueryUsage !== true) return plan;
  try {
    const usage = await trpc(get, 'codingPlans.getUsage', new URLSearchParams({ input: JSON.stringify({ subscriptionId: id }) }));
    const windows = usage?.subscription?.windows;
    if (usage?.schemaVersion !== 1 || usage.subscription?.id !== id || usage.subscription?.providerId !== entry.providerId ||
        !Array.isArray(windows) || windows.length > 16) return plan;
    const units = { hour: ['小时', 'hour'], day: ['天', 'day'], week: ['周', 'week'], month: ['个月', 'month'] };
    const seen = new Set();
    for (const window of windows) {
      const { id, period, remainingPercent, resetsAt } = window ?? {};
      if (typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(id) || seen.has(id) ||
          !Number.isFinite(remainingPercent) || remainingPercent < 0 || remainingPercent > 100 ||
          !Object.hasOwn(units, period?.unit) || !Number.isSafeInteger(period.value) || period.value <= 0) continue;
      seen.add(id);
      const [zh, en] = units[period.unit];
      plan.pools.push({ label: period.value + ' ' + zh, labelEn: period.value + '-' + en,
        remaining: remainingPercent, resetsAt: timestamp(resetsAt) });
    }
  } catch { }
  return plan;
}

async function marketplacePlans(get) {
  const entries = await trpc(get, 'codingPlans.listSubscriptions');
  if (!Array.isArray(entries)) throw new Error('kilo_marketplace_unavailable');
  const active = entries.filter(entry => ['active', 'past_due'].includes(entry?.status) &&
    ['id', 'planName', 'providerName', 'providerId'].every(key => typeof entry[key] === 'string' && entry[key].trim()));
  return Promise.all(active.map(entry => marketplacePlan(get, entry)));
}

async function readBalance(get) {
  const response = await get('/api/profile/balance');
  if (response.status === 401 || response.status === 403) return { status: 'sign_in' };
  if (!response.ok) return { status: 'unavailable' };
  const balance = (await response.json())?.balance;
  return Number.isFinite(balance) ? { status: 'ready', balance } : { status: 'unavailable' };
}

async function readKiloQuota({ home = os.homedir(), env = process.env, request = fetch, now = Date.now } = {}) {
  try {
    if (env.KILO_API_URL && new URL(env.KILO_API_URL).origin !== API) return { status: 'unsupported' };
    const dataHome = path.isAbsolute(env.XDG_DATA_HOME || '') ? env.XDG_DATA_HOME : path.join(home, '.local', 'share');
    const file = path.join(dataHome, 'kilo', 'auth.json');
    const login = await readLogin(file);
    if (!login) return { status: 'missing' };
    const headers = { Authorization: 'Bearer ' + login.token };
    if (login.organizationId) headers['X-KiloCode-OrganizationId'] = login.organizationId;
    const signal = AbortSignal.timeout(10000);
    const get = suffix => request(API + suffix, { headers, redirect: 'error', signal });
    const organization = Boolean(login.organizationId);
    const [wallet, pass, marketplace] = await Promise.allSettled([
      readBalance(get), organization ? [] : passPlan(get), organization ? [] : marketplacePlans(get)
    ]);
    const current = await readLogin(file);
    if (!current) return { status: 'missing' };
    if (current.token !== login.token || current.organizationId !== login.organizationId) return { status: 'unavailable' };
    const plans = [...(pass.value ?? []), ...(marketplace.value ?? [])];
    const status = wallet.value?.status ?? 'unavailable';
    if (status !== 'ready' && !plans.length) return { status };
    return { status: 'ready', reading: {
      balance: wallet.value?.balance, organization, fetchedAt: now(), plans,
      subscriptionsUnavailable: pass.status === 'rejected' || marketplace.status === 'rejected'
    } };
  } catch {
    return { status: 'unavailable' };
  }
}

module.exports = { readKiloQuota };

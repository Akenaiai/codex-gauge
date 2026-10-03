'use strict';
const crypto = require('node:crypto');

function identity(account) {
  if (!account || account.type !== 'chatgpt') return null;
  const key = account.id || account.accountId || account.email;
  return key ? crypto.createHash('sha256').update(String(key)).digest('hex') : null;
}

function parseQuota(result, now = Date.now()) {
  const map = result?.rateLimitsByLimitId;
  const limits = map && typeof map === 'object' ? map.codex : result?.rateLimits;
  if (!limits || typeof limits !== 'object') throw new Error('no_quota');
  const windows = [];
  for (const key of ['primary', 'secondary']) {
    const value = limits[key];
    if (value == null) continue;
    if (!Number.isFinite(value.usedPercent) || value.usedPercent < 0 || value.usedPercent > 100 ||
        !Number.isInteger(value.windowDurationMins) || value.windowDurationMins <= 0) throw new Error('invalid_quota');
    windows.push({ remaining: 100 - value.usedPercent, minutes: value.windowDurationMins,
      resetsAt: Number.isFinite(value.resetsAt) && value.resetsAt > 0 ? value.resetsAt * 1000 : null });
  }
  if (!windows.length) throw new Error('no_quota');
  const source = result.rateLimitResetCredits;
  const credits = (Array.isArray(source?.credits) ? source.credits : [])
    .filter(c => c.status === 'available' && Number.isFinite(c.expiresAt) && c.expiresAt * 1000 > now)
    .map(c => ({ key: crypto.createHash('sha256').update(String(c.id)).digest('hex').slice(0, 16), expiresAt: c.expiresAt * 1000 }))
    .sort((a, b) => a.expiresAt - b.expiresAt);
  const count = Number.isInteger(source?.availableCount) && source.availableCount >= 0
    ? source.availableCount : Array.isArray(source?.credits) ? credits.length : null;
  return { windows, fiveHour: windows.find(w => w.minutes === 300) || null,
    weekly: windows.find(w => w.minutes === 10080) || null,
    credits, creditCount: count, fetchedAt: now };
}

const defaults = Object.freeze({ theme: 'system', language: 'zh-CN', topmost: false,
  autostart: false, notifications: false, offset: { x: 0, y: 0 }, floating: null });
function cleanSettings(input = {}) {
  const number = (n, max) => Number.isFinite(n) ? Math.max(-max, Math.min(max, Math.round(n))) : 0;
  return { theme: ['dark', 'light', 'system'].includes(input.theme) ? input.theme : 'system',
    language: ['en', 'zh-CN'].includes(input.language) ? input.language : 'zh-CN',
    topmost: input.topmost === true, autostart: input.autostart === true, notifications: input.notifications === true,
    offset: { x: number(input.offset?.x, 1500), y: number(input.offset?.y, 1500) },
    floating: input.floating && Number.isFinite(input.floating.x) && Number.isFinite(input.floating.y)
      ? { x: number(input.floating.x, 30000), y: number(input.floating.y, 30000) } : null };
}

function placeBadge(anchor, workArea, offset = { x: 0, y: 0 }, size = 52) {
  const point = { x: Math.round(anchor.x - size / 2 + offset.x), y: Math.round(anchor.y - size - 10 + offset.y) };
  return clampRect({ ...point, width: size, height: size }, workArea);
}
function clampRect(rect, area) {
  return { ...rect, x: Math.round(Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width))),
    y: Math.round(Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height))) };
}
function placePanel(badge, workArea, width = 356, height = 476) {
  const right = badge.x + badge.width + 8;
  const x = right + width <= workArea.x + workArea.width ? right : badge.x - width - 8;
  return clampRect({ x, y: badge.y + badge.height - height, width, height }, workArea);
}

function creditAlerts(snapshot, accountKey, ledger, now = Date.now()) {
  if (!accountKey || !snapshot || now - snapshot.fetchedAt > 120000) return [];
  const alerts = [];
  for (const credit of snapshot.credits) {
    const hours = (credit.expiresAt - now) / 3600000;
    if (hours <= 0 || hours > 48) continue;
    const stage = hours <= 24 ? 24 : 48;
    const key = `${accountKey}:${credit.key}:${credit.expiresAt}:${stage}`;
    if (!ledger[key]) alerts.push({ key, hours: Math.ceil(hours), expiresAt: credit.expiresAt });
  }
  return alerts;
}
module.exports = { identity, parseQuota, defaults, cleanSettings, placeBadge, placePanel, clampRect, creditAlerts };

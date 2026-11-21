((root) => {
  'use strict';
  const hour = 3600000, day = 24 * hour;
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const calendarDay = value => {
    const date = new Date(value);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  function resetDay(text, observedAt) {
    const chinese = /^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日$/.exec(text);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    const english = /^(?:([a-z]{3,9}) (\d{1,2})(?:, (\d{4}))?|(\d{1,2}) ([a-z]{3,9})(?: (\d{4}))?)$/i.exec(text);
    if ((!chinese && !iso && !english) || !Number.isFinite(observedAt)) return null;
    const numeric = chinese || iso;
    const name = english ? (english[1] || english[5]).toLowerCase() : '';
    const month = numeric ? Number(numeric[2]) - 1 : months.findIndex(m => m === name || m.slice(0, 3) === name || m === 'september' && name === 'sept');
    const date = Number(numeric ? numeric[3] : english[2] || english[4]);
    const explicitYear = Number(numeric?.[1] || english?.[3] || english?.[6]);
    const year = new Date(observedAt).getFullYear();
    const candidates = (explicitYear ? [explicitYear] : [year - 1, year, year + 1]).map(y => Date.UTC(y, month, date))
      .filter(value => month >= 0 && new Date(value).getUTCMonth() === month && new Date(value).getUTCDate() === date);
    const observedDay = calendarDay(observedAt);
    return candidates.sort((a, b) => Math.abs(a - observedDay) - Math.abs(b - observedDay))[0] ?? null;
  }
  function resetStatus({ resetsAt, resetDate, fetchedAt }, now) {
    if (Number.isFinite(resetsAt) && resetsAt > 0) {
      const time = resetsAt - now;
      return { kind: 'time', near: time > 0 && time <= 2 * hour, elapsed: time <= 0, time };
    }
    const date = resetDay(resetDate, fetchedAt);
    if (date === null) return null;
    const days = (date - calendarDay(now)) / day;
    return { kind: 'date', near: days === 0, elapsed: days < 0 };
  }
  function poolStatus(remaining, stale, reset) {
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > 100) return 'unknown';
    if (stale || reset?.elapsed) return 'stale';
    if (remaining === 0) return 'empty';
    if (remaining <= 10) return 'critical';
    if (remaining <= 20) return 'low';
    return 'normal';
  }
  const api = { resetStatus, poolStatus };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.codingStatus = api;
})(typeof window === 'undefined' ? globalThis : window);

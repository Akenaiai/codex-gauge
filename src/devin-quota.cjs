'use strict';
const { execFile } = require('node:child_process');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(execFile);

const minute = 60_000;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const quotaLine = /^(Daily|Weekly)\s+(?:[^\s\d]+\s+)?(\d+(?:\.\d+)?)% used(?:\s+·\s+resets\s+(.+))?$/;
const balanceLine = /^Extra usage balance\s+\$(-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)$/;

function readReset(value, observedAt) {
  const relative = /^in (?:(\d+)d\s*)?(?:(\d+)h\s*)?(?:(<?\d+)m)?$/.exec(value);
  if (relative?.slice(1).some(Boolean)) {
    const minutes = Number(relative[1] || 0) * 1440 + Number(relative[2] || 0) * 60 + Number(relative[3]?.replace('<', '') || 0);
    if (minutes <= 8 * 1440) return { resetsAt: observedAt + minutes * minute, resetApproximate: true };
  }
  const absolute = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{1,2}):(\d\d) (AM|PM) \(UTC(?:([+-])(\d{1,2})(?::(\d\d))?)?\)$/.exec(value);
  if (!absolute) return {};
  const [, monthName, dayText, hourText, minuteText, period, sign, offsetHour, offsetMinute] = absolute;
  const month = months.indexOf(monthName);
  const day = Number(dayText), hour = Number(hourText), mins = Number(minuteText);
  const offsetHours = Number(offsetHour || 0), offsetMinutes = Number(offsetMinute || 0);
  if (month < 0 || hour < 1 || hour > 12 || mins > 59 || offsetHours > 14 || offsetMinutes > 59) return {};
  const offset = (sign === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * minute;
  const localYear = new Date(observedAt + offset).getUTCFullYear();
  for (const year of [localYear, localYear + 1]) {
    const date = Date.UTC(year, month, day, hour % 12 + (period === 'PM' ? 12 : 0), mins);
    const resetsAt = date - offset;
    if (new Date(date).getUTCMonth() === month && resetsAt >= observedAt - minute && resetsAt <= observedAt + 8 * 1440 * minute) {
      return { resetsAt };
    }
  }
  return {};
}

function devinReading(output, observedAt) {
  if (output.trim() === 'login_required') return { status: 'sign_in' };
  const pools = new Map();
  let balance = null;
  for (const line of output.trim().split(/\r?\n/).map(line => line.trim())) {
    const quota = quotaLine.exec(line);
    if (quota && Number(quota[2]) <= 100 && !pools.has(quota[1])) {
      const daily = quota[1] === 'Daily';
      pools.set(quota[1], {
        label: daily ? '日额度' : '周额度', labelEn: `${quota[1]} quota`, remaining: 100 - Number(quota[2]),
        ...readReset(quota[3], observedAt)
      });
      continue;
    }
    const extra = balanceLine.exec(line);
    if (!extra || balance !== null) return { status: 'unavailable' };
    balance = Number(extra[1].replace(/,/g, ''));
    if (!Number.isFinite(balance)) return { status: 'unavailable' };
  }
  if (!pools.size && balance === null) return { status: 'unavailable' };
  return { status: 'ready', reading: { pools: [...pools.values()], balance, fetchedAt: observedAt } };
}

async function readDevinQuota(helper) {
  if (!helper) return { status: 'unsupported' };
  const home = os.homedir();
  const desktop = process.env.LOCALAPPDATA;
  const cli = [path.join(home, '.local', 'bin', 'devin.exe'),
    desktop && path.join(desktop, 'Programs', 'Devin', 'resources', 'app', 'extensions', 'windsurf', 'devin', 'bin', 'devin.exe')]
    .find(file => file && path.isAbsolute(file) && existsSync(file));
  if (!cli) return { status: 'missing' };
  try {
    const { stdout } = await exec(helper, [cli], { windowsHide: true, timeout: 24_000, maxBuffer: 4096, encoding: 'utf8' });
    return devinReading(stdout, Date.now());
  } catch {
    return { status: 'unavailable' };
  }
}

module.exports = { devinReading, readDevinQuota };

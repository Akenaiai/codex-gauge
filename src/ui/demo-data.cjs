module.exports = () => {
  const now = Date.now();
  const fiveHour = { remaining: 68, minutes: 300, resetsAt: now + 2.4 * 3600000 };
  const weekly = { remaining: 34, minutes: 10080, resetsAt: now + 3.2 * 86400000 };
  return { fiveHour, weekly, windows: [fiveHour, weekly], credits: [{ key: 'demo', expiresAt: now + 36 * 3600000 }], creditCount: 1, fetchedAt: now };
};

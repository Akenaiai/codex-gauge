const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStartup } = require('../src/startup.cjs');

test('failed task registration preserves the legacy login entry', { skip: process.platform !== 'win32' }, async () => {
  const logins = [];
  const app = { isPackaged: false, setLoginItemSettings: value => logins.push(value) };
  const startup = createStartup(app, '.', (_file, args, _options, done) => done(args[0] === '--enable' ? new Error('access_denied') : null));
  await assert.rejects(startup.set(true), /access_denied/);
  assert.deepEqual(logins, []);
});

test('only successful registration retires the old login mechanism', { skip: process.platform !== 'win32' }, async () => {
  const events = [];
  const app = { isPackaged: false, setLoginItemSettings: value => events.push(['login', value.openAtLogin]) };
  const startup = createStartup(app, '.', (_file, args, _options, done) => { events.push([args[0]]); done(null); });
  await startup.set(true);
  assert.deepEqual(events, [['--resume'], ['--enable'], ['login', false]]);
  events.length = 0;
  await startup.set(false);
  assert.deepEqual(events, [['--disable'], ['login', false]]);
});

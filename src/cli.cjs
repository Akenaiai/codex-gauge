'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { createInterface } = require('node:readline');
const { identity, parseQuota } = require('./domain.cjs');

function findCli(env = process.env, platform = process.platform, arch = process.arch) {
  if (env.CODEX_GAUGE_CLI) {
    if (fs.existsSync(env.CODEX_GAUGE_CLI) && !/\.(cmd|bat|ps1)$/i.test(env.CODEX_GAUGE_CLI)) return env.CODEX_GAUGE_CLI;
    throw new Error('cli_missing');
  }
  const binary = platform === 'win32' ? 'codex.exe' : 'codex';
  const triple = `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-${platform === 'win32' ? 'pc-windows-msvc' : 'apple-darwin'}`;
  const platformPackage = `codex-${platform === 'win32' ? 'win32' : 'darwin'}-${arch}`;
  const pathDirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  const roots = [...pathDirs, path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  if (env.APPDATA) roots.push(path.join(env.APPDATA, 'npm'));
  for (const root of roots) {
    const direct = path.join(root, binary);
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
    for (const base of [path.join(root, 'node_modules'), path.join(root, '..', 'lib', 'node_modules')]) {
      for (const packageRoot of [path.join(base, '@openai', 'codex', 'node_modules', '@openai', platformPackage),
        path.join(base, '@openai', platformPackage), path.join(base, '@openai', 'codex')]) {
        for (const sub of ['bin', 'codex']) {
          const candidate = path.join(packageRoot, 'vendor', triple, sub, binary);
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    }
  }
  throw new Error('cli_missing');
}

class Rpc extends EventEmitter {
  constructor(executable) { super(); this.executable = executable; this.nextId = 0; this.pending = new Map(); }
  start() {
    if (this.child) return;
    this.child = spawn(this.executable, ['app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.resume(); // Never collect credentials, private paths or raw server diagnostics.
    this.child.stdin.on('error', () => this.fail());
    this.child.once('error', () => this.fail());
    this.child.once('exit', () => this.fail());
    this.reader = createInterface({ input: this.child.stdout });
    this.reader.on('line', line => {
      if (line.length > 2000000) return;
      let message; try { message = JSON.parse(line); } catch { return; }
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) pending.reject(new Error('rpc_failed')); else pending.resolve(message.result);
      } else if (['account/rateLimits/updated', 'account/updated'].includes(message.method)) this.emit('changed');
    });
  }
  call(method, params = {}, timeout = 20000) {
    return new Promise((resolve, reject) => {
      if (!this.child || this.child.killed || !this.child.stdin.writable) return reject(new Error('disconnected'));
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  notify(method) { if (this.child?.stdin.writable) this.child.stdin.write(JSON.stringify({ method, params: {} }) + '\n'); }
  fail() {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('disconnected')); }
    this.pending.clear(); this.emit('closed');
  }
  stop() { this.reader?.close(); this.child?.kill(); this.child = null; this.fail(); }
}

class QuotaService extends EventEmitter {
  constructor() { super(); this.status = 'connecting'; this.snapshot = null; this.accountKey = null; this.active = false; this.busy = false; this.failures = 0; }
  state() { return { status: this.status, snapshot: this.snapshot }; }
  setActive(value) {
    if (this.active === value) return;
    this.active = value;
    if (value) this.refresh(); else { clearTimeout(this.timer); this.rpc?.stop(); this.rpc = null; }
  }
  async connect() {
    const rpc = new Rpc(findCli()); rpc.start();
    this.rpc = rpc;
    rpc.on('changed', () => { if (this.active && !this.busy) { clearTimeout(this.timer); this.timer = setTimeout(() => this.refresh(), 1000); } });
    await rpc.call('initialize', { clientInfo: { name: 'codex_gauge', title: 'Codex Gauge', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    rpc.notify('initialized');
    return rpc;
  }
  async refresh() {
    if (this.busy || !this.active) return;
    clearTimeout(this.timer); this.busy = true;
    try {
      const rpc = this.rpc || await this.connect();
      const before = (await rpc.call('account/read', { refreshToken: false }))?.account;
      const beforeKey = identity(before);
      if (!beforeKey) { this.snapshot = null; this.accountKey = null; throw new Error('login_required'); }
      if (beforeKey !== this.accountKey) { this.snapshot = null; this.accountKey = beforeKey; this.emit('state', this.state()); }
      const result = await rpc.call('account/rateLimits/read');
      const afterKey = identity((await rpc.call('account/read', { refreshToken: false }))?.account);
      if (beforeKey !== afterKey) { this.snapshot = null; this.accountKey = null; throw new Error('account_changed'); }
      this.snapshot = parseQuota(result); this.status = 'ready'; this.failures = 0;
    } catch (error) {
      const known = ['cli_missing', 'login_required', 'account_changed', 'no_quota', 'invalid_quota', 'timeout'];
      this.status = known.includes(error.message) ? error.message : 'offline';
      this.rpc?.stop(); this.rpc = null; this.failures++;
    } finally {
      this.busy = false; this.emit('state', this.state());
      if (this.active) this.timer = setTimeout(() => this.refresh(), this.failures ? Math.min(300000, 15000 * 2 ** Math.min(this.failures - 1, 5)) : 60000);
    }
  }
  stop() { this.setActive(false); }
}
module.exports = { findCli, Rpc, QuotaService };

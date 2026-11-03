'use strict';
// Independent, main-process-only OAuth and Streamable HTTP quota client.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { runwayRecord, recraftRecord, recraftResponse } = require('./creative-providers.cjs');
const definitions = Object.freeze({
  runway: { endpoint: 'https://mcp.runwayml.com/mcp', metadata: 'https://mcp.runwayml.com/.well-known/oauth-protected-resource/mcp', tools: ['whoami'] },
  recraft: { endpoint: 'https://mcp.recraft.ai/mcp', metadata: 'https://mcp.recraft.ai/.well-known/oauth-protected-resource', tools: ['get_user'] }
});
const fail = code => { throw new Error(code); };
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\r\n]/.test(value);
const random = () => crypto.randomBytes(32).toString('base64url');
function official(url, origin) {
  let u; try { u = new URL(url); } catch { fail('invalid_response'); }
  if (u.protocol !== 'https:' || u.origin !== origin || u.username || u.password || u.hash) fail('invalid_response');
  return u.href;
}
async function bounded(response, sseId) {
  const reader = response.body?.getReader(); if (!reader) fail('invalid_response');
  const decoder = new TextDecoder(); let output = '', bytes = 0, buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length; if (bytes > 2e6) fail('invalid_response');
      output += decoder.decode(value, { stream: true });
      if (sseId !== undefined) {
        buffer = output.replaceAll('\r\n', '\n');
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
          if (!data) continue;
          let message; try { message = JSON.parse(data); } catch { fail('invalid_response'); }
          // Ignore unrelated server notifications, never execute server requests.
          if (message.id === sseId) return message;
        }
        output = buffer;
      }
    }
    if (sseId !== undefined) fail('invalid_response');
    try { return JSON.parse(output + decoder.decode()); } catch { fail('invalid_response'); }
  } finally { await reader.cancel().catch(() => {}); }
}
class OAuthVault {
  constructor(directory, storage) { this.file = path.join(directory, 'credit-oauth.json'); this.storage = storage; }
  read() {
    try { if (fs.statSync(this.file).size > 262144) fail('credential_storage_failed'); const data = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (!data || Array.isArray(data) || typeof data !== 'object') fail('credential_storage_failed'); return data; }
    catch (e) { if (e.code === 'ENOENT') return {}; fail('credential_storage_failed'); }
  }
  selected(id) { return Object.hasOwn(this.read(), id); }
  get(id) {
    const encrypted = this.read()[id]; if (!encrypted) return null;
    if (!this.storage?.isEncryptionAvailable() || this.storage.getSelectedStorageBackend?.() === 'basic_text') fail('credential_storage_failed');
    try { return JSON.parse(this.storage.decryptString(Buffer.from(encrypted, 'base64'))); } catch { fail('credential_storage_failed'); }
  }
  set(id, grant) {
    if (!Object.hasOwn(definitions, id)) fail('unsupported');
    if (grant && (!this.storage?.isEncryptionAvailable() || this.storage.getSelectedStorageBackend?.() === 'basic_text')) fail('credential_storage_failed');
    const previous = this.read(), data = {...previous}; data[id] = grant ? this.storage.encryptString(JSON.stringify(grant)).toString('base64') : null;
    this.write(data); return () => this.write(previous);
  }
  write(data) { fs.mkdirSync(path.dirname(this.file), { recursive: true }); const temp = this.file + '.tmp'; fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(temp, this.file); }
  legacy(id) { const data = this.read(); delete data[id]; const temp = this.file + '.tmp'; fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(temp, this.file); }
}
class NativeMcp extends EventEmitter {
  constructor(vault, { fetch: request = globalThis.fetch, openExternal, timeout = 20000, authorizationTimeout = 180000 } = {}) {
    super(); this.vault = vault; this.request = request; this.openExternal = openExternal; this.timeout = timeout; this.authorizationTimeout = authorizationTimeout;
    this.pending = new Map(); this.errors = {}; this.epochs = new Map(); this.refreshes = new Map(); this.stopped = false;
  }
  state(id) {
    if (!Object.hasOwn(definitions, id)) return null;
    try { return { selected: this.vault.selected(id), connected: !!this.vault.get(id), pending: this.pending.has(id), error: this.errors[id] || null }; }
    catch { return { selected: true, connected: false, pending: this.pending.has(id), error: 'credential_storage_failed' }; }
  }
  current(id, epoch) { if (this.stopped || this.epochs.get(id) !== epoch) fail('authorization_cancelled'); }
  async response(url, options = {}, signal) {
    try { return await this.request(url, { ...options, redirect: 'error', credentials: 'omit', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(this.timeout)]) : AbortSignal.timeout(this.timeout) }); }
    catch (e) { fail(e.name === 'TimeoutError' ? 'timeout' : e.name === 'AbortError' ? 'authorization_cancelled' : 'query_failed'); }
  }
  async json(url, options, signal) {
    const r = await this.response(url, options, signal);
    if (!r.ok) { await r.body?.cancel(); fail(r.status === 401 ? 'login_required' : r.status === 403 ? 'permission_denied' : r.status === 429 ? 'rate_limited' : 'query_failed'); }
    return bounded(r);
  }
  async discover(id, signal) {
    const d = definitions[id]; if (!d) fail('unsupported');
    const origin = new URL(d.endpoint).origin, resource = await this.json(d.metadata, {}, signal);
    if (resource.resource !== d.endpoint || resource.authorization_servers?.length !== 1 || resource.authorization_servers[0] !== origin) fail('invalid_response');
    const auth = await this.json(origin + '/.well-known/oauth-authorization-server', {}, signal);
    if (auth.issuer !== origin || !auth.code_challenge_methods_supported?.includes('S256') || !auth.token_endpoint_auth_methods_supported?.includes('none')) fail('invalid_response');
    for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) official(auth[key], origin);
    if (!Array.isArray(resource.scopes_supported) || !resource.scopes_supported.every(s => typeof s === 'string' && /^[\w:.-]{1,80}$/.test(s))) fail('invalid_response');
    return { issuer: origin, authorization: auth.authorization_endpoint, token: auth.token_endpoint, registration: auth.registration_endpoint, scope: id === 'runway' ? 'api:read_write' : resource.scopes_supported.join(' ') };
  }
  async token(id, metadata, client, params, signal) {
    official(metadata.token, new URL(definitions[id].endpoint).origin);
    const r = await this.response(metadata.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ ...params, client_id: client, resource: definitions[id].endpoint }).toString() }, signal);
    const body = await bounded(r);
    if (!r.ok || body.error) fail(['invalid_grant', 'invalid_client'].includes(body.error) || r.status === 401 ? 'login_required' : r.status === 403 || body.error === 'invalid_scope' ? 'permission_denied' : 'query_failed');
    if (!opaque(body.access_token) || body.token_type?.toLowerCase() !== 'bearer' || body.refresh_token != null && !opaque(body.refresh_token) || body.expires_in != null && (!Number.isFinite(body.expires_in) || body.expires_in <= 0)) fail('invalid_response');
    return { access: body.access_token, refresh: body.refresh_token || null, expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : null };
  }
  begin(id) {
    if (!Object.hasOwn(definitions,id) || this.stopped) fail('unsupported');
    if (this.pending.has(id)) return;
    const epoch = (this.epochs.get(id) || 0) + 1; this.epochs.set(id, epoch);
    const abort = new AbortController(), pending = { abort, epoch, close: () => {} }; this.pending.set(id, pending); delete this.errors[id]; this.emit('state', id);
    // Entire flow, including discovery/browser/code exchange, has a deadline.
    const timer = setTimeout(() => { this.errors[id] = 'timeout'; abort.abort(); pending.close(); }, this.authorizationTimeout);
    pending.done = this.authorize(id, pending).catch(e => { if (this.epochs.get(id) === epoch) this.errors[id] ||= ['authorization_cancelled','authorization_denied','timeout','permission_denied','login_required','credential_storage_failed','invalid_response'].includes(e.message) ? e.message : 'query_failed'; })
      .finally(() => { clearTimeout(timer); pending.close(); if (this.pending.get(id) === pending) this.pending.delete(id); this.emit('state', id); });
  }
  async authorize(id, pending) {
    const { abort, epoch } = pending, signal = abort.signal;
    const metadata = await this.discover(id, signal); this.current(id, epoch);
    const state = random(), verifier = random(), callbackPath = '/oauth/' + random();
    let resolveCode, rejectCode;
    const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; }); codePromise.catch(() => {});
    const server = http.createServer((req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Security-Policy', "default-src 'none'"); res.setHeader('Referrer-Policy', 'no-referrer');
      const deny = () => { res.writeHead(400); res.end('Invalid callback / 回调无效'); };
      let url; try { url = new URL(req.url, redirect); } catch { return deny(); }
      if (req.method !== 'GET' || req.headers.host !== new URL(redirect).host || url.origin !== new URL(redirect).origin || url.pathname !== callbackPath || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state || url.searchParams.has('iss') && url.searchParams.get('iss') !== metadata.issuer || ['code','error','iss'].some(k => url.searchParams.getAll(k).length > 1)) return deny();
      const code = url.searchParams.get('code'), error = url.searchParams.get('error');
      if ((!opaque(code) && !error) || code && error) return deny();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Return to Gauge / 请返回刻度查看连接结果');
      if (error) rejectCode(Error('authorization_denied')); else resolveCode(code);
      server.close();
    });
    let redirect;
    pending.close = () => { rejectCode(Error('authorization_cancelled')); server.close(); server.closeAllConnections(); };
    await new Promise((resolve, reject) => { server.once('error', () => reject(Error('query_failed'))); server.listen(0, '127.0.0.1', resolve); });
    redirect = `http://127.0.0.1:${server.address().port}${callbackPath}`;
    signal.addEventListener('abort', pending.close, { once: true });
    try {
      const client = await this.json(metadata.registration, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Codex Gauge — quota reader', redirect_uris: [redirect], grant_types: ['authorization_code','refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) }, signal);
      if (!opaque(client.client_id) || client.token_endpoint_auth_method && client.token_endpoint_auth_method !== 'none' || !Array.isArray(client.redirect_uris) || !client.redirect_uris.includes(redirect)) fail('invalid_response');
      this.current(id, epoch);
      const url = new URL(metadata.authorization); for (const [k,v] of Object.entries({ response_type: 'code', client_id: client.client_id, redirect_uri: redirect, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state, resource: definitions[id].endpoint, scope: metadata.scope })) url.searchParams.set(k, v);
      let abortOpen;
      try { await Promise.race([this.openExternal(url.href),new Promise((_,reject)=>{abortOpen=()=>reject(Error('authorization_cancelled'));signal.addEventListener('abort',abortOpen,{once:true});if(signal.aborted)abortOpen();})]); }
      finally { signal.removeEventListener('abort',abortOpen); }
      const code = await codePromise; this.current(id, epoch);
      const tokens = await this.token(id, metadata, client.client_id, { grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier }, signal);
      const grant = { metadata, client: client.client_id, ...tokens };
      const rows = await this.readGrant(id, grant, signal); this.current(id, epoch);
      const undo = this.vault.set(id, grant);
      try { this.emit('connected', id, rows); } catch { try { undo(); } catch { fail('credential_storage_failed'); } fail('storage_failed'); }
    } finally { signal.removeEventListener('abort', pending.close); pending.close(); }
  }
  cancel(id) { const p = this.pending.get(id); if (p) { this.epochs.set(id, p.epoch + 1); p.abort.abort(); p.close(); this.pending.delete(id); this.errors[id] = 'authorization_cancelled'; this.emit('state', id); } }
  disconnect(id, legacy = false) {
    this.cancel(id); this.epochs.set(id, (this.epochs.get(id) || 0) + 1);
    if (legacy) this.vault.legacy(id); else this.vault.set(id, null);
    delete this.errors[id]; this.emit('disconnected', id); this.emit('state', id);
  }
  async read(id) {
    if (this.pending.has(id)) fail('authorization_pending');
    let grant = this.vault.get(id); if (!grant) fail('login_required');
    const epoch = this.epochs.get(id);
    // A single refresh per provider also prevents rotated-token races.
    let refreshed = false;
    const refresh = async () => {
      if (!grant.refresh) fail('login_required');
      if (!this.refreshes.has(id)) {
        const refresh = this.token(id, grant.metadata, grant.client, { grant_type: 'refresh_token', refresh_token: grant.refresh }).then(tokens => {
          this.current(id, epoch); const next = { ...grant, ...tokens, refresh: tokens.refresh || grant.refresh }; this.vault.set(id, next); return next;
        }).finally(() => this.refreshes.delete(id)); this.refreshes.set(id, refresh);
      }
      grant = await this.refreshes.get(id);
      refreshed = true;
    };
    try {
      if (grant.expiresAt && grant.expiresAt <= Date.now() + 30000) await refresh();
      let rows;
      try { rows = await this.readGrant(id, grant); }
      catch(e) { if(e.message !== 'login_required' || refreshed) throw e; await refresh(); rows = await this.readGrant(id, grant); }
      this.current(id, epoch); delete this.errors[id]; return rows;
    }
    catch (e) { if (['login_required','permission_denied'].includes(e.message)) this.errors[id] = e.message; throw e; }
  }
  async readGrant(id, grant, signal) {
    const d = definitions[id]; let session, sequence = 0, protocol = '2025-03-26';
    const call = async (method, params, notification = false) => {
      if (!['initialize','notifications/initialized','tools/list','tools/call'].includes(method) || method === 'tools/call' && (!d.tools.includes(params?.name) || Object.keys(params.arguments || {}).length)) fail('permission_denied');
      const number = ++sequence;
      const r = await this.response(d.endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.access, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'Mcp-Session-Id': session } : {}), ...(method !== 'initialize' ? { 'MCP-Protocol-Version': protocol } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', ...(!notification ? { id: number } : {}), method, params }) }, signal);
      if (!r.ok) { await r.body?.cancel(); fail(r.status === 401 ? 'login_required' : r.status === 403 ? 'permission_denied' : r.status === 429 ? 'rate_limited' : 'query_failed'); }
      if (notification) { await r.body?.cancel(); return; }
      const sid = r.headers.get('mcp-session-id'); if (sid) { if (!opaque(sid) || sid.length > 2048 || session && session !== sid) fail('invalid_response'); session = sid; }
      const result = await bounded(r, r.headers.get('content-type')?.includes('text/event-stream') ? number : undefined);
      if (result.jsonrpc !== '2.0' || result.id !== number || result.error) fail(result.error?.code === -32003 ? 'permission_denied' : 'invalid_response');
      return result.result;
    };
    const init = await call('initialize', { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'codex-gauge-quota', version: '0.4.4' } });
    if (!['2025-03-26','2025-06-18','2025-11-25'].includes(init?.protocolVersion)) fail('invalid_response'); protocol = init.protocolVersion;
    await call('notifications/initialized', {}, true);
    const listed = await call('tools/list', {}); if (!d.tools.every(name => listed?.tools?.some(t => t.name === name))) fail('permission_denied');
    const read = async name => { const r = await call('tools/call', { name, arguments: {} }); if (r?.isError) fail('query_failed'); if (id === 'recraft') return recraftResponse(r); if (r?.structuredContent) return r.structuredContent; const texts = r?.content?.filter(c => c.type === 'text'); if (texts?.length !== 1) fail('invalid_response'); try { return JSON.parse(texts[0].text); } catch { fail('invalid_response'); } };
    const before = await read(d.tools[0]), after = await read(d.tools[0]);
    return [id === 'runway' ? runwayRecord(before, after, 'gauge-native:runway') : recraftRecord(before, after, 'gauge-native:recraft')];
  }
  stop() { this.stopped = true; for (const id of this.pending.keys()) this.cancel(id); }
}
module.exports = { definitions, OAuthVault, NativeMcp, bounded };

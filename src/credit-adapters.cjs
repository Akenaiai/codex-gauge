'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { findExecutable, findPippitBinary, hash } = require('./catalog.cjs');
const { value } = require('./credit-model.cjs');

function nativePippit(options = {}) {
  return findPippitBinary(options);
}
function execJson(executable, args, { timeout = 25000, env = process.env, cwd = os.tmpdir() } = {}) {
  return new Promise((resolve, reject) => {
    if (!executable || /\.(cmd|bat|ps1)$/i.test(executable)) return reject(new Error('cli_missing'));
    let settled = false, output = '';
    const child = spawn(executable, args, { windowsHide: true, shell: false, cwd, env: { ...env, PIPPIT_CLI_DISABLE_UPDATE_CHECK: '1' }, stdio: ['ignore','pipe','ignore'] });
    const finish = (error, data) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolve(data); };
    const timer = setTimeout(() => finish(new Error('timeout')), timeout);
    child.stdout.on('data', data => {
      output += data.toString('utf8');
      if (Buffer.byteLength(output) > 2e6) return finish(new Error('invalid_response'));
      // Some CLIs leave an update-check process alive after their JSON result.
      try { const data = JSON.parse(output.trim()); finish(null, data); } catch { }
    });
    child.once('error', () => finish(new Error('cli_missing')));
    child.once('exit', () => { if (settled) return; try { finish(null, JSON.parse(output.trim())); } catch { finish(new Error('query_failed')); } });
  });
}
async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(options.timeout || 20000) });
  if (!response.ok) throw new Error([401,403].includes(response.status) ? 'login_required' : response.status === 429 ? 'rate_limited' : 'query_failed');
  const length = Number(response.headers.get('content-length')); if (length > 2e6) throw new Error('invalid_response');
  const reader = response.body.getReader(); let text = '', bytes = 0; const decoder = new TextDecoder();
  for (;;) { const { value: chunk, done } = await reader.read(); if (done) break; bytes += chunk.length; if (bytes > 2e6) { await reader.cancel(); throw new Error('invalid_response'); } text += decoder.decode(chunk, { stream: true }); }
  try { return JSON.parse(text + decoder.decode()); } catch { throw new Error('invalid_response'); }
}
async function xyq(options = {}) {
  const exe = nativePippit(options);
  if (!exe) throw new Error('cli_missing');
  const identity = await execJson(exe, ['status']);
  if (identity.logged_in !== true) throw new Error('login_required');
  const raw = await execJson(exe, ['get-credit-balance']);
  const after = await execJson(exe, ['status']);
  if (after.logged_in !== true || identity.uid !== after.uid || identity.team_id !== after.team_id || identity.source !== after.source) throw new Error('account_changed');
  if (raw.total_remain_amount == null) throw new Error('invalid_response');
  const uid = identity.uid;
  return [{ provider: 'xyq', scope: uid ? String(uid)+':'+String(identity.team_id||'personal') : 'local-cli', identityVerified: !!uid, account: 'CLI', source: 'cli', fetchedAt: Date.now(),
    pools: [{ id: 'effective', label: '可用积分', labelEn: 'Available credits', amount: value(raw.total_remain_amount), unit: 'credits' }] }];
}
async function jimeng(options = {}) {
  const raw = await execJson(findExecutable('dreamina', options), ['user_credit']);
  if (raw.total_credit == null || raw.user_id == null) throw new Error('invalid_response');
  return [{ provider: 'jimeng', scope: String(raw.user_id), identityVerified: true, account: raw.vip_level || 'CLI', source: 'cli', fetchedAt: Date.now(),
    pools: [{ id: 'effective', label: '可用积分', labelEn: 'Available credits', amount: value(raw.total_credit), unit: 'credits' }] }];
}
async function apiBalance(provider, key, request = jsonRequest) {
  if (!key) throw new Error('login_required');
  const headers = { Authorization: 'Bearer ' + key, Accept: 'application/json' };
  const base = { provider, scope: 'key:' + (key.startsWith('ref:') ? key.slice(4).toLowerCase().slice(0,20) : hash(key)), identityVerified: false, account: 'API Key', source: 'api', fetchedAt: Date.now() };
  if (provider === 'firecrawl') {
    const raw = await request('https://api.firecrawl.dev/v2/team/credit-usage', { headers });
    if (raw.success !== true || raw.data?.remainingCredits == null) throw new Error('invalid_response');
    return [{ ...base, fetchedAt: Date.now(), pools: [{ id: 'team', label: '团队可用积分', labelEn: 'Team credits', amount: value(raw.data.remainingCredits), limit: value(raw.data.planCredits), unit: 'credits',
      periodStart: Date.parse(raw.data.billingPeriodStart) || null, periodEnd: Date.parse(raw.data.billingPeriodEnd) || null }] }];
  }
  if (provider === 'deepseek') {
    const raw = await request('https://api.deepseek.com/user/balance', { headers });
    if (!Array.isArray(raw.balance_infos) || !raw.balance_infos.length) throw new Error('invalid_response');
    return [{ ...base, fetchedAt: Date.now(), pools: raw.balance_infos.flatMap(p => [
      { id: String(p.currency).toLowerCase() + '.granted', label: '赠送余额', labelEn: 'Granted balance', amount: value(p.granted_balance), unit: p.currency },
      { id: String(p.currency).toLowerCase() + '.purchased', label: '充值余额', labelEn: 'Purchased balance', amount: value(p.topped_up_balance), unit: p.currency },
    ]) }];
  }
  throw new Error('unsupported');
}
async function securedApiBalance(provider, options = {}) {
  const env = options.env || process.env, key = env[provider === 'firecrawl' ? 'FIRECRAWL_API_KEY' : 'DEEPSEEK_API_KEY'];
  if (key) return apiBalance(provider,key);
  const file = path.join(options.home || os.homedir(),'.codex','private','credentials',provider+'-api-key.dpapi');
  if (process.platform !== 'win32' || !fs.existsSync(file) || !['firecrawl','deepseek'].includes(provider)) throw new Error('login_required');
  const endpoint = provider === 'firecrawl' ? 'https://api.firecrawl.dev/v2/team/credit-usage' : 'https://api.deepseek.com/user/balance';
  const code = `$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $secure=Get-Content -LiteralPath $env:GAUGE_CREDENTIAL_FILE -Raw | ConvertTo-SecureString; try { $secret=[System.Net.NetworkCredential]::new('', $secure).Password; $digest=[Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($secret))); $response=Invoke-RestMethod -Method Get -Uri '${endpoint}' -Headers @{Authorization=('Bearer '+$secret)} -TimeoutSec 18 -MaximumRedirection 0; @{response=$response; account_ref=$digest} | ConvertTo-Json -Depth 15 -Compress } finally { $secret=$null; $secure.Dispose() }`;
  // PowerShell 7 supports the SHA helpers; fallback Windows PowerShell uses a
  // SHA256 instance instead. The secret never leaves this child process.
  const portable = code.replace("[Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($secret)))", "([BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($secret)))).Replace('-','')");
  const childEnv = {...env,GAUGE_CREDENTIAL_FILE:file};
  delete childEnv.PSModulePath; // Do not mix a parent PowerShell 7 module path with Windows PowerShell.
  const guarded = `try { ${portable} } catch { @{query_error=$_.Exception.GetType().Name} | ConvertTo-Json -Compress }`;
  const raw = await execJson(findExecutable('pwsh',options) || findExecutable('powershell',options),['-NoProfile','-NonInteractive','-Command',guarded],{env:childEnv});
  if(raw.query_error)throw new Error(raw.query_error==='CommandNotFoundException'?'credential_reader_unavailable':'query_failed');
  if(typeof raw.account_ref!=='string'||!raw.response)throw new Error('invalid_response');
  return apiBalance(provider,'ref:'+raw.account_ref,async()=>raw.response);
}
async function relay({ home = os.homedir(), env = process.env } = {}) {
  // Reuse the installed companion's query implementation, with before/after
  // identity binding. No scheduler, task dispatch or credential export.
  const root = path.join(home, '.codex', 'plugins', 'cache', 'personal', 'agent-relay');
  let versions; try { versions = fs.readdirSync(root).sort((a,b) => b.localeCompare(a,undefined,{numeric:true})); } catch { throw new Error('relay_unavailable'); }
  const plugin = versions.map(v => path.join(root,v)).find(p => fs.existsSync(path.join(p,'relay','quota.py')));
  const python = findExecutable('python', {home,env});
  if (!plugin || !python) throw new Error('relay_unavailable');
  const manifest = JSON.parse(fs.readFileSync(path.join(plugin,'.codex-plugin','plugin.json'),'utf8'));
  if (manifest.name !== 'agent-relay') throw new Error('relay_unavailable');
  const bridge = /(?:^|[/\\])app\.asar(?:[/\\]|$)/.test(__dirname)
    ? path.join(process.resourcesPath,'adapters','relay-credit-bridge.py') : path.join(__dirname,'relay-credit-bridge.py');
  if(!fs.existsSync(bridge))throw new Error('relay_unavailable');
  const raw = await execJson(python, [bridge,plugin], { cwd:plugin,env,timeout:65000 });
  const rows = Array.isArray(raw) ? raw : raw.pools || raw.quotas;
  if (!Array.isArray(rows)) throw new Error('invalid_response');
  return rows.map(row => {
    if (!['kimi','minimax','zcode'].includes(row.id)) return null;
    const provider = row.id === 'zcode' ? 'zai' : row.id;
    if (row.error || row.binding_error === 'account_changed') return {provider,pools:[],error:'query_failed'};
    const labelEn = label => String(label).replace(/小时/g,'hours').replace(/天/g,'days').replace(/月/g,'month').replace(/周额度/g,'Weekly quota').replace(/工具次数/g,'Tool requests').replace(/当前时段/g,'Current interval');
    const pools = (row.windows || []).filter(w => w.remaining_percent != null).map(w => ({ id: hash(w.id || w.label), label: w.label, labelEn: labelEn(w.label), amount: value(w.remaining_percent), unit: 'percent', resetsAt: w.reset_at ? Math.round(w.reset_at * 1000) : null }));
    for (const [label, times] of Object.entries(row.cards || {})) {
      const groups = new Map(); for (const at of times || []) if (at) groups.set(at,(groups.get(at)||0)+1);
      for (const [at,count] of groups) pools.push({ id: 'card.' + hash(label + at), label: label + '重置卡', labelEn: label.includes('5') ? '5-hour reset credits' : 'Weekly reset credits', amount: count, unit: 'cards', expiresAt: Math.round(at * 1000) });
    }
    if (row.id === 'minimax' && row.video_entitlement?.status) pools.push({ id: 'video', label: '视频权益', labelEn: 'Video entitlement', amount: row.video_entitlement.status === 'not_in_plan' ? null : value(row.video_entitlement.remaining_percent), unit: 'percent', entitlement: row.video_entitlement.status });
    return { provider, scope: row.identity_ref ? 'relay:'+row.identity_ref : 'relay-unverified', identityVerified: !!row.identity_ref, account: 'Agent Relay', source: 'relay',
      fetchedAt: row.observed_at ? Math.round(row.observed_at * 1000) : Date.now(), pools, error: row.error ? 'query_failed' : null,
      reportedStatus: row.error || row.status === 'stale' ? 'stale' : pools.length ? 'ready' : 'unknown' };
  }).filter(Boolean);
}
module.exports = { nativePippit, execJson, jsonRequest, xyq, jimeng, apiBalance, securedApiBalance, relay };

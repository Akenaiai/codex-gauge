'use strict';
// Describes existing adapters; discovery never installs, authenticates or queries.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { providers, findExecutable, findPippitBinary, entriesToml } = require('./catalog.cjs');
const { findCli } = require('./cli.cjs');
const { configuredKey } = require('./credit-credentials.cjs');
const { fresh } = require('./credit-model.cjs');

const checkedOn = '2026-11-03';
const text = (zh, en) => ({ zh, en });
const profiles = {};
function define(ids, connection) { for (const id of ids) profiles[id] = { provider: id, os: ['win32', 'darwin'], checkedOn, ...connection }; }
define(['codex'], { route: 'codex', quotaKind: 'coding_subscription', components: ['codex_cli'], auth: 'original_client', entry: 'https://developers.openai.com/codex/cli/', sources: ['https://developers.openai.com/codex/app-server/'], limits: text('沿用原仪表的本机账号与周期额度；API Key 不代表订阅额度。', 'Uses the original badge account and coding windows; an API key is not a subscription quota.') });
define(['xyq'], { route: 'cli', quotaKind: 'account_credits', components: ['pippit_cli'], auth: 'original_client', entry: 'https://github.com/Pippit-dev/cli', sources: ['https://github.com/Pippit-dev/cli'], limits: text('读取 CLI 当前个人或团队空间的有效积分；接口未提供到期日期。', 'Reads effective credits in the CLI current personal/team space; this response provides no expiry.') });
define(['jimeng'], { route: 'cli', quotaKind: 'account_credits', components: ['dreamina_cli'], auth: 'original_client', entry: 'https://dreamina.capcut.com/ai-tool/install', sources: ['https://dreamina.capcut.com/tools/dreamina-cli'], limits: text('读取现有 Dreamina CLI 账户；地区与账号权益由原客户端确定。', 'Reads the existing Dreamina CLI account; region and entitlement belong to that client.') });
define(['lovart', 'suno', 'runway', 'recraft'], { route: 'codex_mcp', quotaKind: 'account_credits', components: ['codex_cli'], auth: 'original_client', remote: true });
Object.assign(profiles.lovart, { entry: 'https://www.lovart.ai/', sources: ['https://www.lovart.ai/statement/lovart-subscribe-faq'], evidence: 'adapter_contract', limits: text('已有 Codex lovart MCP 的 get_credits；账号身份与日期未返回。公开安装文档尚未核实，不能据此自动配置。', 'Existing Codex lovart MCP get_credits; identity and dates are absent. Public installation instructions remain unverified; do not auto-configure from this entry.') });
Object.assign(profiles.suno, { entry: 'https://suno.com/mcp', endpoint: 'https://api.suno.com/mcp', sources: ['https://help.suno.com/en/articles/14486145'], limits: text('歌曲与下载积分分开；公开 handle 不作为稳定账号身份；续费日不是积分发放证明。', 'Song/download credits are separate; public handles are not stable identity; billing renewal is not a grant receipt.') });
Object.assign(profiles.runway, { entry: 'https://help.runwayml.com/hc/en-us/articles/51931843164691-Connecting-to-Runway-MCP', endpoint: 'https://mcp.runwayml.com/mcp', sources: ['https://help.runwayml.com/hc/en-us/articles/51931843164691-Connecting-to-Runway-MCP'], limits: text('官方会员 MCP 当前团队积分，区别于 Runway Developer API 账户。', 'Official member MCP credits for the current team, separate from a Runway Developer API account.') });
Object.assign(profiles.recraft, { entry: 'https://www.recraft.ai/docs/mcp-reference/remote-server', endpoint: 'https://mcp.recraft.ai/mcp', sources: ['https://www.recraft.ai/docs/mcp-reference/remote-server'], limits: text('官方会员 MCP 当前个人空间；本地 API MCP 的计费额度不适用此适配。', 'Official member MCP current personal space; local API MCP billing units do not use this adapter.') });
define(['kling'], { route: 'kling', quotaKind: 'personal_paid_credits', components: ['codex_cli'], auth: 'original_client', remote: true, endpoint: 'https://klingai.com/mcp', endpointEvidence: 'existing_adapter', entry: null, sources: ['https://kling.ai/app/mcp/guide'], limits: text('优先原 Codex 中国站 MCP，否则原可灵中国站 CLI；只读个人空间付费灵感值。官方全球站说明不能替代中国站安装来源（本次未核实），两站不可互换；赠送和团队权益不在此范围。', 'Prefers existing Codex China MCP, otherwise existing Kling China CLI; reads personal paid credits. Official global guidance does not verify China installation instructions (unverified here); endpoints are not interchangeable. Bonus/team entitlements are outside this scope.') });
define(['kimi', 'minimax', 'zai'], { route: 'relay', quotaKind: 'coding_subscription', components: ['agent_relay', 'python', 'relay_bridge'], auth: 'original_client', entry: null, sources: [], evidence: 'adapter_contract', limits: text('依赖另外安装的 Agent Relay 只读桥接与 Python；缓存名称不足以证明组件完整。编程订阅不等于视频、通用 API 或本人填写的会员记录。', 'Requires separately installed Agent Relay read bridge and Python; a cache name alone is insufficient. Coding subscription is separate from video, general API and user-entered membership.') });
define(['deepseek', 'firecrawl', 'tavily'], { route: 'api', quotaKind: 'api_balance', components: [], auth: 'api_key', remote: true });
Object.assign(profiles.deepseek, { entry: 'https://platform.deepseek.com/', sources: ['https://api-docs.deepseek.com/api/get-user-balance'], limits: text('API 赠金与充值余额分开；不是聊天会员。Windows 私有 DPAPI 后备需要 PowerShell。', 'API grant and purchased balances are separate from chat membership. Windows private DPAPI fallback requires PowerShell.') });
Object.assign(profiles.firecrawl, { entry: 'https://www.firecrawl.dev/app', sources: ['https://docs.firecrawl.dev/api-reference/endpoint/credit-usage'], limits: text('对应 API Key 的团队积分；账期结束不自动当作积分到期。Windows 私有 DPAPI 后备需要 PowerShell。', 'Team credits for the API key; billing-period end is not automatically expiry. Windows private DPAPI fallback requires PowerShell.') });
Object.assign(profiles.tavily, { entry: 'https://app.tavily.com/', sources: ['https://docs.tavily.com/documentation/api-reference/endpoint/usage'], limits: text('API 套餐剩余积分，与按量付费分开。', 'Remaining API plan credits, separate from pay-as-you-go.') });
define(['tapnow', 'ideogram'], { route: 'browser', quotaKind: 'visible_page_credits', components: ['browser_extension'], auth: 'original_browser', remote: false, evidence: 'adapter_contract', sources: [], limits: text('需本人安装并配对刻度浏览器组件；只读已授权可见余额，网页身份始终待核实。官方 MCP 可见不等于有可用余额接口。', 'Requires the user-installed paired Gauge browser extension; reads authorized visible credits with unverified identity. MCP availability does not establish a balance method.') });
profiles.tapnow.entry = 'https://www.tapnow.ai/';
profiles.ideogram.entry = 'https://ideogram.ai/';
define(['kimi-subscription','minimax-subscription'], { route: 'unsupported', quotaKind: 'membership_record', components: [], os: [], auth: 'unknown', entry: null, sources: [], evidence: 'adapter_inventory', limits: text('本人会员与日期记录；不证明登录、可用余额或编程/API 权益。', 'User membership/date record; does not establish sign-in, balance or coding/API entitlement.') });
profiles['openai-api'] = { ...profileFor('unconfigured-api'), provider: 'openai-api', quotaKind: 'api_balance', entry: 'https://platform.openai.com/' };

function profileFor(id) {
  return Object.hasOwn(profiles,id) ? profiles[id] : { provider: id, route: 'unsupported', quotaKind: 'unverified', components: [], os: [], checkedOn, entry: null, sources: [], evidence: 'adapter_inventory', auth: 'unknown', limits: text('当前版本没有自动额度适配；Skill、插件、本人会员或日期记录均不是账户权益实查。', 'No automatic quota adapter in this version; Skills, plugins and user membership/date records are not verified account entitlements.') };
}
function connectionCatalog() { return Object.keys(providers).map(profileFor); }
function componentCatalog() {
  return [
    ['codex_cli', 'Codex CLI', 'Codex CLI', 'https://developers.openai.com/codex/cli/', false],
    ['pippit_cli', '小云雀原生 CLI', 'Pippit native CLI', 'https://github.com/Pippit-dev/cli', false],
    ['dreamina_cli', 'Dreamina 原生 CLI', 'Dreamina native CLI', 'https://dreamina.capcut.com/ai-tool/install', false],
    ['kling_cli', '可灵中国站 CLI', 'Kling China CLI', null, false],
    ['agent_relay', 'Agent Relay 配套插件', 'Agent Relay companion plugin', null, false],
    ['python', 'Python', 'Python', 'https://www.python.org/downloads/', false],
    ['powershell', 'PowerShell', 'PowerShell', 'https://learn.microsoft.com/powershell/scripting/install/installing-powershell', false],
    ['relay_bridge', '刻度 Relay 只读桥接', 'Gauge Relay read bridge', null, true],
    ['browser_extension', '刻度浏览器组件', 'Gauge browser extension', null, true],
  ].map(([id, zh, en, entry, bundled]) => ({ id, name: text(zh, en), entry, bundled, checkedOn }));
}
function file(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function native(p) { return !!p && !/\.(cmd|bat|ps1)$/i.test(p); }
function relayInstallation({ home = os.homedir() } = {}) {
  const root = path.join(home, '.codex', 'plugins', 'cache', 'personal', 'agent-relay');
  try {
    for (const v of fs.readdirSync(root).sort((a,b) => b.localeCompare(a, undefined, { numeric: true }))) {
      const candidate = path.join(root, v);
      try {
        if (JSON.parse(fs.readFileSync(path.join(candidate, '.codex-plugin', 'plugin.json'), 'utf8')).name === 'agent-relay' && ['quota.py', 'kimi.py', 'kimi_runtime.py'].every(n => file(path.join(candidate, 'relay', n)))) return candidate;
      } catch { }
    }
  } catch { }
  return null;
}
function probeComponents(options = {}) {
  const home = options.home || os.homedir(), env = options.env || process.env, platform = options.platform || process.platform;
  let codex = false; try { codex = !!findCli(env, platform, options.arch || process.arch, home); } catch { }
  const kling = findExecutable('kling', { home, env, platform });
  const checks = {
    codex_cli: codex, pippit_cli: native(findPippitBinary({ home, env, platform })),
    dreamina_cli: native(findExecutable('dreamina', { home, env, platform })),
    kling_cli: native(kling) || !!kling && file(path.join(path.dirname(kling), 'node_modules/@klingai/cli-cn/dist/cli.js')),
    python: native(findExecutable('python', { home, env, platform })), agent_relay: !!relayInstallation({ home }),
    relay_bridge: file(/(?:^|[/\\])app\.asar(?:[/\\]|$)/.test(__dirname) ? path.join(process.resourcesPath, 'adapters', 'relay-credit-bridge.py') : path.join(__dirname, 'relay-credit-bridge.py')),
    powershell: native(findExecutable('pwsh', { home, env, platform }) || findExecutable('powershell', { home, env, platform })),
  };
  const api = {};
  for (const id of ['deepseek', 'firecrawl', 'tavily']) {
    const key = !!configuredKey(id, { home, env });
    const dpapi = platform === 'win32' && id !== 'tavily' && file(path.join(home, '.codex/private/credentials', id + '-api-key.dpapi'));
    api[id] = { key, dpapi };
  }
  let config = '', entries = []; try { config = fs.readFileSync(path.join(home, '.codex/config.toml'), 'utf8'); entries = entriesToml(config); } catch { }
  const mcp = {}, mcpErrors = {};
  for (const id of ['lovart', 'suno', 'runway', 'recraft', 'kling']) {
    if (id === 'lovart' || id === 'suno') mcp[id] = entries.some(e => e.kind === 'mcp' && e.name === id && e.enabled);
    else try { require('./creative-providers.cjs').officialServer(id, profiles[id].endpoint, { home }); mcp[id] = true; } catch (e) { mcp[id] = false; if(e.message !== 'login_required') mcpErrors[id] = 'invalid_mcp_configuration'; }
  }
  // Only presence booleans and fixed error codes leave this probe. Paths,
  // configuration text and keys stay here.
  return { checkedAt: Date.now(), platform, checks, api, mcp, mcpErrors };
}

function accessFor(tool, { probe, records = [], queryStatus = null, browser = {}, hasCredential = false, relayEnabled = false, now = Date.now() } = {}) {
  const profile = profileFor(tool.id), p = probe || { platform: process.platform, checks: {}, api: {}, mcp: {} };
  const supported = profile.route !== 'unsupported' && profile.os.includes(p.platform);
  let route = profile.route, required = [...profile.components], connected = false;
  const configurationError = p.mcpErrors?.[tool.id] || null;
  if (route === 'kling') {
    const useMcp = p.mcp.kling || configurationError;
    route = useMcp ? 'codex_mcp' : 'cli'; required = [useMcp ? 'codex_cli' : 'kling_cli'];
    connected = !configurationError;
  } else if (route === 'api') {
    const a = p.api[tool.id] || {};
    connected = !!(hasCredential || a.key || a.dpapi);
    if (!hasCredential && !a.key && a.dpapi) required = ['powershell'];
  } else if (route === 'codex_mcp') connected = !!p.mcp[tool.id];
  else if (route === 'browser') connected = !!(browser.enabled && browser.paired && browser.providers?.[tool.id]?.configured);
  else if (route === 'relay') connected = relayEnabled;
  else connected = supported;
  const checks = required.map(id => ({ id, ready: id === 'browser_extension' ? !!(browser.enabled && browser.paired) : !!p.checks[id] }));
  const missing = checks.filter(c => !c.ready).map(c => c.id), componentReady = supported && !missing.length;
  const canAttempt = componentReady && connected && (route !== 'browser' || !!browser.connected);
  const active = records.filter(r => r.provider === tool.id && r.status !== 'account_changed');
  const automatic = active.filter(r => !['manual', 'host'].includes(r.source));
  const current = automatic.filter(r => fresh(r, now));
  const latest = automatic.slice().sort((a,b) => b.fetchedAt - a.fetchedAt)[0];
  const known = current.flatMap(r => r.pools).filter(pool => pool.unit !== 'cards' && pool.entitlement !== 'not_in_plan');
  const reading = !active.length ? records.some(r => r.provider === tool.id && r.status === 'account_changed') ? 'account_changed' : 'none'
    : !automatic.length ? 'recorded' : !current.length ? 'stale' : !known.length || known.some(pool => pool.amount == null) ? 'unknown' : known.some(pool => pool.amount > 0) ? 'available' : 'zero';
  const failure = queryStatus && !['ready', 'querying', 'connecting', 'offline', 'stale'].includes(queryStatus) ? queryStatus : null;
  const error = failure || configurationError || latest?.error || (reading === 'account_changed' ? 'account_changed' : null);
  let status = !supported ? 'unsupported' : !componentReady ? 'component_missing' : !connected ? 'connection_required' : route === 'browser' && !browser.connected ? 'offline' : 'query_available';
  if (canAttempt && current.length) status = 'ready';
  if (canAttempt && reading === 'stale') status = 'stale';
  if (canAttempt && ['connecting', 'offline', 'stale'].includes(queryStatus)) status = queryStatus;
  if (error && supported && componentReady && connected) status = ['login_required', 'account_changed'].includes(error) ? error : 'query_failed';
  if (configurationError) status = 'configuration_invalid';
  if (queryStatus === 'querying') status = 'querying';
  const authorization = ['login_required','account_changed'].includes(error) ? 'required' : current.length ? current.every(r => r.identityVerified) ? 'verified' : 'identity_unverified' : 'unconfirmed';
  return { schemaVersion: 1, profile, discovery: { found: !!tool.connections?.length, evidence: tool.connections || [] },
    components: { ready: componentReady, checks, missing, checkedAt: p.checkedAt || null },
    authorization: { status: authorization, checkedAt: current.length ? Math.max(...current.map(r => r.fetchedAt)) : null },
    query: { supported, route, canAttempt, status, error },
    reading: { status: reading, fetchedAt: latest?.fetchedAt || null, source: latest?.source || null, identityVerified: latest?.identityVerified === true },
    membershipInputVerifiesQuota: false };
}
module.exports = { profileFor, connectionCatalog, componentCatalog, probeComponents, accessFor, relayInstallation };

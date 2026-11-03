const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { CreditCenter } = require('../src/credit-center.cjs');
const { probeComponents, accessFor, profileFor, connectionCatalog, componentCatalog } = require('../src/connection-capabilities.cjs');
const { cleanRecord } = require('../src/credit-model.cjs');
const adapters = require('../src/credit-adapters.cjs');
function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gauge-access-'));
  const env = { PATH: path.join(home, 'bin'), APPDATA: path.join(home, 'appdata') };
  fs.mkdirSync(env.PATH); fs.mkdirSync(path.join(home, '.codex'));
  const options = { home, env, platform: 'win32' };
  return { home, options, write(name, value='') { const target=path.join(home,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value); },
    binary(name) { fs.writeFileSync(path.join(env.PATH, name+'.exe'), 'synthetic executable presence'); },
    center() { return new CreditCenter(path.join(home,'gauge'), options); } };
}
const tool = id => ({ id, connections: [] });
const row = (provider, amount, extra={}) => cleanRecord({provider,scope:'synthetic-account',source:'api',identityVerified:true,fetchedAt:Date.now(),pools:[{id:'credits',unit:'credits',amount}],...extra});

test('clean user has no invented inventory or queries; optional catalog stays separate', async () => {
  const f=fixture(), c=f.center();const s=c.rescan();assert.equal(s.tools.length,0);assert.equal(s.records.length,0);
  assert.ok(s.connectionCatalog.length>20);assert.ok(s.connectionComponents.every(x=>x.name.zh&&x.name.en));
  const calls=[];c.query=async id=>calls.push(id);await c.refresh();assert.deepEqual(calls,[]);
});
test('only Skill/cache/host inventory discovers a tool, without installing or authenticating it',async()=>{
  const f=fixture();f.write('.codex/skills/xyq-skill/SKILL.md','synthetic');f.write('.codex/plugins/cache/personal/agent-relay/1.0/README.md','cache');
  const c=f.center();c.rescan();const xyq=c.state().tools.find(t=>t.id==='xyq');assert.equal(xyq.access.query.status,'component_missing');assert.equal(xyq.queryReady,false);
  assert.equal(xyq.access.authorization.status,'unconfirmed');assert.equal(xyq.access.reading.status,'none');
  const calls=[];c.query=async id=>calls.push(id);await c.refresh();assert.deepEqual(calls,[]);
});
test('native CLI presence differs from shell wrappers and missing executable',()=>{
  const f=fixture();f.write('bin/dreamina.cmd','wrapper');let p=probeComponents(f.options);assert.equal(p.checks.dreamina_cli,false);
  f.binary('dreamina');p=probeComponents(f.options);const access=accessFor(tool('jimeng'),{probe:p});assert.equal(access.query.canAttempt,true);assert.equal(access.authorization.status,'unconfirmed');assert.equal(access.query.status,'query_available');
});
test('Codex npm native executable is discovered even when PATH has only its wrapper',()=>{
  const f=fixture();f.write('bin/codex.cmd','wrapper');f.write('bin/node_modules/@openai/codex/vendor/x86_64-pc-windows-msvc/bin/codex.exe','synthetic');
  const c=f.center();assert.equal(c.rescan().tools.find(t=>t.id==='codex').access.components.ready,true);
});
test('MCP needs its owning Codex runtime and exact supported configuration, not another host or API MCP',()=>{
  const f=fixture();f.write('.cursor/mcp.json',JSON.stringify({mcpServers:{recraft:{url:'https://mcp.recraft.ai/mcp'}}}));
  f.write('.codex/config.toml','[mcp_servers.recraft]\nurl="https://local.invalid/api"');let c=f.center();assert.equal(c.rescan().tools.find(t=>t.id==='recraft').queryReady,false);
  f.binary('codex');f.write('.codex/config.toml','[mcp_servers.recraft]\nurl="https://mcp.recraft.ai/mcp"\nenabled=false');assert.equal(c.rescan().tools.find(t=>t.id==='recraft').queryReady,false);
  f.write('.codex/config.toml','[mcp_servers.recraft]\nurl="https://mcp.recraft.ai/mcp"');let r=c.rescan().tools.find(t=>t.id==='recraft');assert.equal(r.queryReady,true);assert.equal(r.access.authorization.status,'unconfirmed');
  assert.equal(r.access.profile.remote,true);assert.deepEqual(r.access.components.checks,[{id:'codex_cli',ready:true}]);
});
test('complete Relay files still need Python and an enabled companion or existing use',async()=>{
  const f=fixture();for(const n of ['quota.py','kimi.py','kimi_runtime.py'])f.write('.codex/plugins/cache/personal/agent-relay/1/relay/'+n,'synthetic');
  f.write('.codex/plugins/cache/personal/agent-relay/1/.codex-plugin/plugin.json','{"name":"agent-relay"}');
  const c=f.center();c.rescan();assert.equal(c.access(tool('kimi')).components.missing.includes('python'),true);f.binary('python');c.rescan();assert.equal(c.access(tool('kimi')).query.canAttempt,false);
  f.write('.codex/config.toml','[plugins."agent-relay@personal"]\nenabled=true');c.rescan();assert.equal(c.access(tool('kimi')).query.canAttempt,true);
  const calls=[];c.query=async id=>calls.push(id);await c.refresh('minimax',{manual:true});assert.deepEqual(calls,['relay']);
});
test('installed Kling CLI cannot bypass wrong or ambiguous MCP configuration',async()=>{
  const f=fixture();f.binary('kling');f.binary('codex');const c=f.center();
  for(const config of ['[mcp_servers.kling]\nurl="https://wrong.invalid/mcp"','[mcp_servers.kling]\nurl="https://klingai.com/mcp"\n[mcp_servers."kling copy"]\nurl="https://klingai.com/mcp"']){
    f.write('.codex/config.toml',config);const t=c.rescan().tools.find(t=>t.id==='kling');assert.equal(t.queryReady,false);assert.equal(t.access.query.route,'codex_mcp');assert.equal(t.access.query.status,'configuration_invalid');assert.equal(t.access.query.error,'invalid_mcp_configuration');
    await assert.rejects(require('../src/creative-providers.cjs').kling({...f.options,klingRead:()=>assert.fail('CLI must not be called')}),/query_failed|invalid_response/);
    const calls=[];c.query=async id=>calls.push(id);await c.refresh();assert.deepEqual(calls,[]);
  }
  f.write('.codex/config.toml','');assert.equal(c.rescan().tools.find(t=>t.id==='kling').access.query.route,'cli');assert.equal(c.state().tools.find(t=>t.id==='kling').queryReady,true);
});
test('API credential references are not login proof; placeholders and unsupported DPAPI on Mac do not enable reads',()=>{
  const f=fixture();f.options.env.TAVILY_API_KEY='your_api_key_placeholder';f.write('.codex/private/credentials/deepseek-api-key.dpapi','encrypted-fixture');
  const c=f.center();let p=probeComponents(f.options);assert.equal(p.api.tavily.key,false);assert.equal(accessFor(tool('deepseek'),{probe:p}).query.canAttempt,false);
  f.binary('powershell');p=probeComponents(f.options);assert.equal(accessFor(tool('deepseek'),{probe:p}).query.canAttempt,true);
  p=probeComponents({...f.options,platform:'darwin'});assert.equal(p.api.deepseek.dpapi,false);
  f.options.env.TAVILY_API_KEY='synthetic-secret-value-12345';const s=c.rescan(),r=s.tools.find(t=>t.id==='tavily');assert.equal(r.queryReady,true);assert.equal(r.access.authorization.status,'unconfirmed');assert.ok(!JSON.stringify(s).includes(f.options.env.TAVILY_API_KEY));
});
test('browser pairing, page configuration and heartbeat are separate from platform authentication',()=>{
  const f=fixture(),probe=probeComponents(f.options),browser={enabled:true,paired:true,connected:false,providers:{tapnow:{configured:true}}};
  let a=accessFor(tool('tapnow'),{probe,browser});assert.equal(a.components.ready,true);assert.equal(a.query.canAttempt,false);assert.equal(a.query.status,'offline');
  browser.connected=true;a=accessFor(tool('tapnow'),{probe,browser,records:[row('tapnow',0,{source:'browser',identityVerified:false})]});assert.equal(a.reading.status,'zero');assert.equal(a.authorization.status,'identity_unverified');
});
test('missing balance, zero, stale and manual values keep distinct meanings',()=>{
  const f=fixture(),probe=probeComponents(f.options), base={probe,hasCredential:true};
  for(const [amount,expected]of [[null,'unknown'],[0,'zero'],[7,'available']])assert.equal(accessFor(tool('firecrawl'),{...base,records:[row('firecrawl',amount)]}).reading.status,expected);
  assert.equal(accessFor(tool('firecrawl'),{...base,records:[row('firecrawl',0,{fetchedAt:Date.now()-600001})]}).reading.status,'stale');
  const a=accessFor(tool('firecrawl'),{...base,records:[row('firecrawl',999,{source:'manual'})]});assert.equal(a.reading.status,'recorded');assert.equal(a.authorization.status,'unconfirmed');
});
test('authorization expiry retires account, while transient failure keeps an explicitly stale reading and timestamp',async()=>{
  const f=fixture(),c=f.center(),old=adapters.securedApiBalance;f.options.env.FIRECRAWL_API_KEY='synthetic-secret-value-12345';c.rescan();
  try{
    adapters.securedApiBalance=async()=>{throw Error('timeout');};c.put(row('firecrawl',4),false);const at=c.records[0].fetchedAt;await c.query('firecrawl');let a=c.state().tools.find(t=>t.id==='firecrawl').access;
    assert.equal(a.query.status,'query_failed');assert.equal(a.reading.status,'stale');assert.equal(a.reading.fetchedAt,at);assert.equal(c.records[0].pools[0].amount,4);
    adapters.securedApiBalance=async()=>{throw Error('login_required');};await c.query('firecrawl');a=c.state().tools.find(t=>t.id==='firecrawl').access;assert.equal(a.authorization.status,'required');assert.equal(a.reading.status,'account_changed');assert.equal(c.state().records.length,0);
    const again=f.center();assert.equal(again.state().tools.find(t=>t.id==='firecrawl').access.authorization.status,'required');
  }finally{adapters.securedApiBalance=old;}
});
test('failed Relay rows never produce a ready status or erase the failure at batch end',async()=>{
  const f=fixture(),c=f.center(),old=adapters.relay;c.ensureTool('kimi');c.put(row('kimi',5,{source:'relay'}),false);
  try{adapters.relay=async()=>[{provider:'kimi',pools:[],error:'query_failed'}];await c.query('relay');const t=c.state().tools.find(t=>t.id==='kimi');assert.equal(t.queryStatus,'query_failed');assert.equal(t.access.reading.status,'stale');assert.equal(c.statuses.relay,undefined);}finally{adapters.relay=old;}
});
test('Codex refresh remains owned by the original badge and cannot become a stuck center query',async()=>{
  const f=fixture(),c=f.center();c.statuses.codex='ready';await c.refresh('codex',{manual:true});assert.equal(c.statuses.codex,'ready');assert.equal(c.busy.size,0);
  await c.query('unsupported');assert.equal(c.statuses.unsupported,undefined);
});
test('account switch hides prior scope and its reminder bindings, including Codex login changes',()=>{
  const f=fixture(),c=f.center();c.ensureTool('firecrawl');const old=row('firecrawl',5);c.put(old,false);c.setRule(old.id+'/credits',{expiresAt:Date.now()+100000,notify:true});c.put(row('firecrawl',0,{scope:'new-account'}),false);
  let r=c.state().tools.find(t=>t.id==='firecrawl');assert.equal(r.records.length,1);assert.notEqual(r.records[0].id,old.id);assert.deepEqual(r.records[0].rules,{});
  c.ensureTool('codex');c.put(row('codex',10,{source:'codex'}),false);c.persist();c.updateCodex({status:'login_required'},null);r=c.state().tools.find(t=>t.id==='codex');assert.equal(r.records.length,0);assert.equal(r.access.authorization.status,'required');assert.equal(f.center().state().records.some(r=>r.provider==='codex'),false);
});
test('catalog clearly separates unsupported API, membership records and subscription quotas',()=>{
  assert.equal(profileFor('openai-api').route,'unsupported');assert.equal(profileFor('kimi-subscription').quotaKind,'membership_record');assert.equal(profileFor('kimi').quotaKind,'coding_subscription');
  for(const p of connectionCatalog()){assert.ok(p.limits.zh&&p.limits.en);assert.ok(p.checkedOn);for(const url of [p.entry,...p.sources].filter(Boolean))assert.ok(url.startsWith('https://'));}
  assert.equal(componentCatalog().find(x=>x.id==='browser_extension').bundled,true);
  for(const id of ['constructor','__proto__','toString'])assert.equal(accessFor(tool(id)).query.supported,false);
});
test('read-only MCP exposes timestamped capability snapshots and accepts older inventory without them',async()=>{
  const f=fixture(),c=f.center();c.ensureTool('firecrawl');c.persist();
  const directory=path.join(f.home,'gauge');process.argv.push('--data-dir='+directory);const mcp=require('../scripts/gauge-mcp.cjs');process.argv.pop();
  const read=async()=>JSON.parse((await mcp.handle({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'gauge_inventory',arguments:{}}})).result.content[0].text);
  let result=await read();assert.equal(result.accessIsSnapshot,true);assert.ok(result.accessObservedAt);assert.equal(result.tools[0].access.query.canAttempt,false);
  const old=JSON.parse(fs.readFileSync(path.join(directory,'credit-center.json')));delete old.connectionAccess;delete old.connectionObservedAt;fs.writeFileSync(path.join(directory,'credit-center.json'),JSON.stringify(old));
  result=await read();assert.equal(result.tools[0].access,null);assert.equal(result.accessObservedAt,null);
});

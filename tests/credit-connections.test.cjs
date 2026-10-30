const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const{CreditSecrets,configuredKey}=require('../src/credit-credentials.cjs');
const{apiBalance}=require('../src/credit-adapters.cjs');
const{cleanRecord,events,renewalAlerts}=require('../src/credit-model.cjs');
const{CreditCenter}=require('../src/credit-center.cjs');
const secret='test-local-credential-1234567890';
test('credential discovery is provider-scoped, ignores disabled MCPs and placeholder values',()=>{
const home=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-key-'));fs.mkdirSync(path.join(home,'.codex'));
fs.writeFileSync(path.join(home,'.codex/config.toml'),`[mcp_servers.unrelated.env]\nTAVILY_API_KEY="${secret}"\n[mcp_servers.tavily]\nenabled=false\n[mcp_servers.tavily.env]\nTAVILY_API_KEY="${secret}"\n`);
assert.equal(configuredKey('tavily',{home,env:{}}),null);
fs.appendFileSync(path.join(home,'.codex/config.toml'),`[mcp_servers."tavily-mcp 网络搜索".env]\nTAVILY_API_KEY="${secret}"\n`);
const found=configuredKey('tavily',{home,env:{}});assert.equal(found.key,secret);assert.equal(found.source,'configured_mcp');
assert.equal(configuredKey('firecrawl',{home,env:{FIRECRAWL_API_KEY:'your-api-key-placeholder'}}),null);
});
test('an active Cursor provider can supply the same read-only credential without enabling disabled Codex MCPs',()=>{
const home=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-cursor-key-'));fs.mkdirSync(path.join(home,'.cursor'));fs.writeFileSync(path.join(home,'.cursor/mcp.json'),JSON.stringify({mcpServers:{'tavily-mcp 网络搜索':{env:{TAVILY_API_KEY:secret}}}}));assert.equal(configuredKey('tavily',{home,env:{}}).key,secret);
});
test('credential persistence encrypts and roundtrips, refusing unavailable or basic-text storage',()=>{
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-secrets-'));
const crypto={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
const store=new CreditSecrets(dir,crypto);store.set('firecrawl',secret);assert.equal(store.get('firecrawl'),secret);assert.ok(!fs.readFileSync(path.join(dir,'credit-secrets.json'),'utf8').includes(secret));
assert.throws(()=>new CreditSecrets(dir,{isEncryptionAvailable:()=>false}).set('firecrawl',secret),/credential_storage_failed/);
assert.throws(()=>new CreditSecrets(dir,{...crypto,getSelectedStorageBackend:()=>'basic_text'}).set('firecrawl',secret),/credential_storage_failed/);
});
test('Tavily reports account plan remainder, not pay-as-you-go money or fabricated exact reset time',async()=>{
const[r]=await apiBalance('tavily',secret,async(url,options)=>{assert.equal(url,'https://api.tavily.com/usage');assert.ok(options.headers.Authorization);return{account:{current_plan:'Researcher',plan_usage:125,plan_limit:1000,paygo_limit:null},key:{usage:125,limit:null}};});
const record=cleanRecord(r),p=record.pools[0];assert.equal(p.amount,875);assert.equal(p.limit,1000);assert.equal(p.resetsAt,null);assert.match(p.resetDate,/^\d{4}-\d{2}-01$/);assert.equal(p.resetSource,'policy');
assert.ok(!JSON.stringify(record).includes(secret));assert.equal(record.pools.length,1);
});
test('Firecrawl monthly policy identifies a renewal, never a total expiry or an inferred annual monthly day',async()=>{
const monthly={success:true,data:{remainingCredits:1400,planCredits:1000,billingPeriodStart:'2026-09-10T12:00:00Z',billingPeriodEnd:'2026-10-10T12:00:00Z'}};
const[r]=await apiBalance('firecrawl',secret,async()=>monthly),record=cleanRecord(r),p=record.pools[0];
assert.equal(p.amount,1400);assert.equal(p.expiresAt,null);assert.equal(p.resetsAt,Date.parse(monthly.data.billingPeriodEnd));assert.equal(p.resetSource,'policy');
const row=events([record],{},Date.parse('2026-09-15T00:00:00Z')).find(e=>e.kind==='reset');assert.equal(row.label,'套餐月度积分');assert.equal(row.source,'policy');
const[annual]=await apiBalance('firecrawl',secret,async()=>({...monthly,data:{...monthly.data,billingPeriodEnd:'2027-09-10T12:00:00Z'}}));assert.equal(annual.pools[0].resetsAt,null);
});
test('date-only policy schedules stay date-only in events and ask for verification on the local date',()=>{
const now=new Date(2026,10,1,12).getTime();const r=cleanRecord({provider:'tavily',scope:'key-one',source:'api',identityVerified:true,fetchedAt:now,pools:[{id:'monthly',amount:450,unit:'credits',resetDate:'2026-11-01',resetSource:'policy'}]},now);
const e=events([r],{},now)[0];assert.equal(e.dateOnly,true);assert.equal(e.onDate,'2026-11-01');assert.equal(e.source,'policy');
const alerts=renewalAlerts([r],{},now);assert.equal(alerts.length,1);assert.equal(alerts[0].kind,'check_renewal');
assert.equal(renewalAlerts([r],{},new Date(2026,10,2,12).getTime()).length,0);
const exact=events([r],{[r.id+'/monthly']:{resetsAt:now+30000}},now)[0];assert.equal(exact.dateOnly,false);assert.equal(exact.source,'user');
});
test('connecting one workspace replaces only its confirmed snapshot, preserving independent workspaces',async()=>{
const original=global.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-migration-'));let saved=null;
const c=new CreditCenter(dir,{home:dir,env:{PATH:''},saveCredential:key=>{const before=saved;saved=key;return()=>{saved=before;};}});c.rescan();
const now=Date.now(),make=scope=>cleanRecord({provider:'firecrawl',scope,source:'host',fetchedAt:now,pools:[{id:'team',unit:'credits',amount:7}]});
const a=make('workspace-a'),b=make('workspace-b');c.put(a,false);c.put(b,false);
try{global.fetch=async()=>new Response(JSON.stringify({success:true,data:{remainingCredits:20,planCredits:1000}}));await c.connect('firecrawl',secret,{replaceRecordId:b.id});
assert.equal(c.state().records.length,2);assert.ok(c.state().records.some(r=>r.id===a.id));assert.ok(!c.state().records.some(r=>r.id===b.id));
fs.writeFileSync(path.join(dir,'credit-imports.json'),JSON.stringify({records:[{provider:'firecrawl',scope:'workspace-a',fetchedAt:now+1000,pools:[{id:'team',unit:'credits',amount:99}]},{provider:'firecrawl',scope:'workspace-b',fetchedAt:now+1000,pools:[{id:'team',unit:'credits',amount:99}]}]}));c.loadImports();
assert.equal(c.state().records.length,2);assert.equal(c.state().records.find(r=>r.id===a.id).pools[0].amount,99);
}finally{global.fetch=original;c.stop();}
});
test('invalid connection response never saves credentials or replaces the existing account',async()=>{
const original=global.fetch;let saved=false;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-connect-')),c=new CreditCenter(dir,{home:dir,env:{PATH:''},saveCredential:()=>{saved=true;}});c.rescan();
try{global.fetch=async()=>new Response(JSON.stringify({success:false}),{status:401});await assert.rejects(c.connect('firecrawl',secret),/login_required/);assert.equal(saved,false);assert.equal(c.records.length,0);}finally{global.fetch=original;c.stop();}
});
test('saving a new credential invalidates a late query using the previous credential',async()=>{
const adapters=require('../src/credit-adapters.cjs'),original=adapters.securedApiBalance,fetchBefore=global.fetch;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-key-race-')),c=new CreditCenter(dir,{home:dir,env:{PATH:''},saveCredential:()=>()=>{}});c.rescan();let release;
try{adapters.securedApiBalance=()=>new Promise(resolve=>{release=resolve;});const pending=c.query('tavily');
global.fetch=async()=>new Response(JSON.stringify({account:{current_plan:'NEW',plan_usage:1,plan_limit:1000}}));await c.connect('tavily',secret);
release([{provider:'tavily',scope:'old-credential',source:'api',account:'OLD',identityVerified:true,fetchedAt:Date.now(),pools:[{id:'monthly',unit:'credits',amount:1}]}]);await pending;
assert.equal(c.state().records.length,1);assert.equal(c.state().records[0].account,'API · NEW');
}finally{adapters.securedApiBalance=original;global.fetch=fetchBefore;c.stop();}
});
test('failed center persistence rolls back the credential and previous account snapshot',async()=>{
const fetchBefore=global.fetch,dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-key-rollback-'));let saved='original';
const c=new CreditCenter(dir,{home:dir,env:{PATH:''},saveCredential:(_provider,key)=>{const old=saved;saved=key;return()=>{saved=old;};}});c.rescan();
const old=cleanRecord({provider:'firecrawl',scope:'previous',source:'api',identityVerified:true,fetchedAt:Date.now(),pools:[{id:'team',unit:'credits',amount:3}]});c.put(old,false);c.persist();c.store.save=()=>{throw Error('Disk failed');};
try{global.fetch=async()=>new Response(JSON.stringify({success:true,data:{remainingCredits:10,planCredits:1000}}));await assert.rejects(c.connect('firecrawl',secret),/storage_failed/);assert.equal(saved,'original');assert.equal(c.state().records[0].id,old.id);assert.equal(c.state().records[0].status,'ready');}finally{global.fetch=fetchBefore;c.stop();}
});
test('policy-derived cycles never upgrade an aggregate balance increase into confirmed renewal',()=>{
const{recoveryAlerts}=require('../src/credit-model.cjs'),now=Date.now();const record=(time,amount,reset)=>cleanRecord({provider:'firecrawl',scope:'same-key',source:'api',identityVerified:true,fetchedAt:time,pools:[{id:'team',unit:'credits',amount,resetsAt:reset,resetSource:'policy',resetLabel:'套餐月度积分'}]},now);
const before=record(now-60000,300,now-1000),after=record(now,1300,now+30*86400000);const alerts=recoveryAlerts(before,after,now);assert.equal(alerts.some(e=>e.kind==='recovered'),false);assert.equal(alerts[0].kind,'check_renewal');
});
test('Firecrawl policy provenance survives persisting and reloading an existing host snapshot',()=>{
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-policy-reload-')),options={home:dir,env:{PATH:''}},c=new CreditCenter(dir,options);c.rescan();
c.put(cleanRecord({provider:'firecrawl',scope:'host-workspace',source:'host',fetchedAt:Date.now(),pools:[{id:'team',unit:'credits',amount:10,limit:1000,periodStart:Date.parse('2026-09-10T12:00:00Z'),periodEnd:Date.parse('2026-10-10T12:00:00Z')}]}),false);c.persist();
const again=new CreditCenter(dir,options);assert.equal(again.records[0].pools[0].resetSource,'policy');assert.equal(again.records[0].pools[0].expiresAt,null);again.stop();c.stop();
});

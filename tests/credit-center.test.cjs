const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {cleanRecord,events,expiryAlerts,recoveryAlerts}=require('../src/credit-model.cjs');
const {entriesToml,entriesJson,scan,canonical}=require('../src/catalog.cjs');
const {CreditCenter}=require('../src/credit-center.cjs');
const {apiBalance,execJson}=require('../src/credit-adapters.cjs');
const now=Date.now();
const reading=(options={})=>cleanRecord({provider:'example',scope:'account-one',source:'cli',identityVerified:true,fetchedAt:now,pools:[{id:'credits',amount:10,unit:'credits'}],...options},now+100);

test('discovery reads section metadata only, separates disabled entries and never copies credential strings',()=>{
  const input='[mcp_servers.one]\nurl="https://example.invalid/?key=PRIVATE"\n[mcp_servers.one.env]\nTOKEN="PRIVATE"\n[mcp_servers."one 中文副本"]\nenabled=false\n[plugins."sample@personal"]\nenabled=true\n';
  const entries=entriesToml(input);assert.equal(entries.length,3);assert.equal(entries[1].enabled,false);assert.ok(!JSON.stringify(entries).includes('PRIVATE'));
  assert.equal(canonical('one 中文副本'),canonical('one'));assert.notEqual(canonical('one tool'),canonical('one other'));
  assert.equal(entriesJson('{"mcpServers":{"one":{"disabled":true,"headers":{"Authorization":"PRIVATE"}}}}')[0].enabled,false);
});
test('local inventory explicitly distinguishes a cached plugin, Skill evidence and an actual CLI',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-inventory-'));
  fs.mkdirSync(path.join(home,'.codex','plugins','cache','test','cached-tool'),{recursive:true});
  fs.mkdirSync(path.join(home,'.codex','skills','xyq-skill'),{recursive:true});fs.writeFileSync(path.join(home,'.codex','skills','xyq-skill','SKILL.md'),'name: xyq-skill');
  const s=scan({home,env:{PATH:''},hostTools:[{name:'lovart',kind:'mcp'}]});
  assert.equal(s.tools.find(t=>t.id==='cached-tool').connections[0].enabled,false);
  assert.equal(s.tools.find(t=>t.id==='xyq').connections[0].evidence,'instructions');
  assert.equal(s.tools.find(t=>t.id==='lovart').connections[0].evidence,'host_available');
});
test('zero stays zero; missing stays unknown; negative, nonfinite and invalid percentage observations are rejected',()=>{
  assert.equal(reading({pools:[{id:'x',amount:0,unit:'credits'}]}).pools[0].amount,0);
  assert.equal(reading({pools:[{id:'x',unit:'credits'}]}).pools[0].amount,null);
  for(const amount of [-1,NaN,Infinity,'garbage'])assert.throws(()=>reading({pools:[{id:'x',amount,unit:'credits'}]}));
  assert.throws(()=>reading({pools:[{id:'x',amount:101,unit:'percent'}]}));
  assert.throws(()=>reading({pools:[{id:'x',amount:1,unit:'credits'},{id:'x',amount:2,unit:'credits'}]}));
});
test('accounts and workspaces produce different keys; source account identifiers are hashed',()=>{
  const a=reading(),b=reading({scope:'account-two'});assert.notEqual(a.id,b.id);assert.ok(!JSON.stringify(a).includes('account-one'));
});
test('billing period end never becomes expiry or confirmed renewal',()=>{
  const r=reading({pools:[{id:'x',amount:100,unit:'credits',periodEnd:now+10000}]});
  assert.deepEqual(events([r],{},now).map(e=>e.kind),['billing']);assert.equal(expiryAlerts([r],{},now).length,0);
});
test('expiry alerts require a future known expiry, fresh data and positive balance; dates from a confirmed rule retain their source',()=>{
  const r=reading({pools:[{id:'x',amount:3,unit:'credits',expiresAt:now+48*3600000}]});
  assert.equal(expiryAlerts([r],{},now)[0].stage,'3d');
  assert.equal(expiryAlerts([{...r,status:'offline'}],{},now).length,0);
  assert.equal(expiryAlerts([{...r,fetchedAt:now-6*60000}],{},now).length,0);
  assert.equal(expiryAlerts([reading({pools:[{id:'x',amount:0,unit:'credits',expiresAt:now+5000}]})],{},now).length,0);
  const rule={[r.id+'/x']:{expiresAt:now+10000,notify:false}};
  assert.equal(events([r],rule,now)[0].source,'user');assert.equal(expiryAlerts([r],rule,now).length,0);
});
test('balance increases, unknown identity and elapsed schedule alone do not prove renewal; an advanced cycle and recovered balance do',()=>{
  const old=reading({fetchedAt:now-30000,pools:[{id:'x',amount:2,unit:'percent',resetsAt:now-1000}]});
  const current=reading({pools:[{id:'x',amount:100,unit:'percent',resetsAt:now+3600000}]});
  assert.equal(recoveryAlerts(old,current,now).length,1);
  assert.equal(recoveryAlerts(old,{...current,identityVerified:false},now).length,0);
  assert.equal(recoveryAlerts(old,reading({scope:'another',pools:current.pools}),now).length,0);
  assert.equal(recoveryAlerts(old,reading({pools:[{id:'x',amount:100,unit:'percent'}]}),now).length,0);
  assert.equal(recoveryAlerts(old,reading({pools:[{id:'x',amount:100,unit:'percent',resetsAt:now-1000}]}),now).length,0);
});
test('state survives reload without changing account keys; switching CLI account suppresses old account reminders',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-center-')),c=new CreditCenter(dir);c.rescan();const r=reading();c.put(r);c.ensureTool('example');
  c.setRule(r.id+'/credits',{expiresAt:now+3600000,notify:true});c.persist();
  const again=new CreditCenter(dir);assert.equal(again.records[0].id,r.id);assert.equal(again.rules[r.id+'/credits'].expiresAt,now+3600000);
  again.put(reading({scope:'other-account'}));assert.equal(again.records.find(x=>x.id===r.id).status,'account_changed');
  assert.equal(again.state().records.length,1);
});
test('malformed on-disk records are protected and cannot be overwritten by a refresh',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-corrupt-'));fs.writeFileSync(path.join(dir,'credit-center.json'),'{broken');
  const c=new CreditCenter(dir);c.rescan();assert.equal(c.store.error,'storage_failed');assert.equal(fs.readFileSync(path.join(dir,'credit-center.json'),'utf8'),'{broken');
});
test('Firecrawl adapter keeps billing boundaries separate and does not assume plan-minus-balance is usage',async()=>{
  const [r]=await apiBalance('firecrawl','example-secret',async(url,opt)=>{assert.equal(url,'https://api.firecrawl.dev/v2/team/credit-usage');assert.equal(opt.headers.Authorization,'Bearer example-secret');return{success:true,data:{remainingCredits:1200,planCredits:1000,billingPeriodEnd:'2027-01-01T00:00:00Z'}};});
  assert.equal(r.pools[0].amount,1200);assert.equal(r.pools[0].expiresAt,undefined);assert.equal(r.pools[0].resetsAt,undefined);assert.ok(!JSON.stringify(r).includes('example-secret'));
});
test('DeepSeek grants and purchased credits remain disjoint pools and never become an invented expiry',async()=>{
  const [r]=await apiBalance('deepseek','example-secret',async()=>({balance_infos:[{currency:'CNY',total_balance:'15.00',granted_balance:'5',topped_up_balance:'10'}]}));
  assert.deepEqual(r.pools.map(p=>p.amount),[5,10]);assert.equal(r.pools.some(p=>p.id.includes('total')),false);
  assert.equal(cleanRecord(r).pools.length,2);
});
test('native CLI wrapper accepts complete JSON without waiting for a stuck update process and never invokes shell launchers',async()=>{
  assert.deepEqual(await execJson(process.execPath,['-e','process.stdout.write(JSON.stringify({remaining:0}));setInterval(()=>{},1000)']),{remaining:0});
  await assert.rejects(execJson('example.cmd',[]),/cli_missing/);
});
test('scheduled renewal accepts the prior verified cycle after a temporary outage or five-minute polling gap',()=>{
  const old=reading({fetchedAt:now-10*60000,pools:[{id:'x',amount:2,unit:'percent',resetsAt:now-1000}]});
  const current=reading({pools:[{id:'x',amount:100,unit:'percent',resetsAt:now+3600000}]});
  assert.equal(recoveryAlerts(old,current,now).length,1);
  assert.equal(recoveryAlerts({...old,status:'offline'},current,now).length,1);
  assert.equal(recoveryAlerts({...old,status:'account_changed'},current,now).length,0);
});
test('confirmed manual schedules still remind after the reading ages, explicitly as a stale recorded date',()=>{
  const r=reading({source:'manual',identityVerified:false,fetchedAt:now-86400000});
  const rule={[r.id+'/credits']:{expiresAt:now+86400000,notify:true}};
  assert.equal(expiryAlerts([r],rule,now).length,1);assert.equal(expiryAlerts([r],rule,now)[0].stale,true);
  assert.equal(expiryAlerts([{...r,source:'relay'}],rule,now).length,0);
});
test('a user expiry override cannot relabel upstream renewal and billing dates',()=>{
  const r=reading({pools:[{id:'x',amount:3,unit:'credits',resetsAt:now+2000,periodEnd:now+3000}]});
  const rows=events([r],{[r.id+'/x']:{expiresAt:now+1000}},now);
  assert.deepEqual(rows.map(e=>[e.kind,e.source]),[['expiry','user'],['reset','upstream'],['billing','upstream']]);
});
test('schema-invalid null storage degrades without crashing the original app and preserves bytes',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-null-'));fs.writeFileSync(path.join(dir,'credit-center.json'),'null');
  const c=new CreditCenter(dir);assert.equal(c.state().storageError,'storage_failed');c.persist();assert.equal(fs.readFileSync(path.join(dir,'credit-center.json'),'utf8'),'null');
});
test('custom tool names survive scan and restart; failed preferences and manual saves roll back memory',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-manual-')),options={home:dir,env:{PATH:''}},c=new CreditCenter(dir,options);
  c.rescan();c.addManual({name:'Example creative tool',account:'Workspace one',amount:20,unit:'credits'});const id=c.records[0].provider;c.rescan();
  assert.equal(c.state().tools.find(t=>t.id===id).name,'Example creative tool');
  const again=new CreditCenter(dir,options);again.rescan();assert.equal(again.state().tools.find(t=>t.id===id).name,'Example creative tool');
  again.store.save=()=>{throw new Error('disk failed');};
  assert.throws(()=>again.setPreferences({enabled:false,reminders:false}));assert.equal(again.enabled,true);assert.equal(again.reminders,true);
  assert.throws(()=>again.addManual({name:'Must not save',account:'one',amount:5,unit:'credits'}));assert.equal(again.records.length,1);
});
test('stopping invalidates pending reads and an old completion cannot overwrite the resumed reader',async()=>{
  const adapters=require('../src/credit-adapters.cjs'),original=adapters.xyq;let resolveOld;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-stop-')),c=new CreditCenter(dir,{home:dir,env:{PATH:''}});c.rescan();
  try{
    adapters.xyq=()=>new Promise(resolve=>{resolveOld=resolve;});const old=c.query('xyq');c.stop();c.stopped=false;
    adapters.xyq=async()=>[{provider:'xyq',scope:'new',source:'cli',identityVerified:true,fetchedAt:now,pools:[{id:'x',amount:7,unit:'credits'}]}];
    await c.query('xyq');resolveOld([{provider:'xyq',scope:'old',source:'cli',identityVerified:true,fetchedAt:now,pools:[{id:'x',amount:99,unit:'credits'}]}]);await old;
    assert.equal(c.records.length,1);assert.equal(c.records[0].pools[0].amount,7);assert.equal(c.busy.size,0);
  }finally{adapters.xyq=original;c.stop();}
});
test('Lovart uses only the allowlisted balance tool in an ephemeral context; other MCPs and plugins stay disabled',async()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-mcp-'));fs.mkdirSync(path.join(home,'.codex'));
  fs.writeFileSync(path.join(home,'.codex/config.toml'),'[mcp_servers.lovart]\nenabled=true\n[mcp_servers.unrelated]\nenabled=true\n[plugins."example@personal"]\nenabled=true\n');
  const calls=[];let stopped=false;
  const rpc={start(){},notify(){},stop(){stopped=true;},async call(method,args){calls.push([method,args]);if(method==='initialize')return{};if(method==='thread/start'){assert.equal(args.ephemeral,true);assert.equal(args.config.mcp_servers.unrelated.enabled,false);assert.equal(args.config.plugins['example@personal'].enabled,false);return{thread:{id:'ephemeral-test'}};}if(method==='mcpServerStatus/list')return{data:[{name:'lovart',runtimeStatus:'connected',tools:{get_credits:{}}}]};if(method==='mcpServer/tool/call'){assert.equal(args.tool,'get_credits');return{structuredContent:{credits:0}};}throw new Error('Unexpected method');}};
  const [r]=await require('../src/codex-mcp-credit.cjs').lovart({home,rpcFactory:()=>rpc});assert.equal(r.pools[0].amount,0);assert.equal(stopped,true);assert.equal(calls.some(([m])=>m==='turn/start'),false);
});
test('renewal schedules distinguish a user date reached from an upstream approaching reset',()=>{
  const {renewalAlerts}=require('../src/credit-model.cjs');
  const r=reading({pools:[{id:'x',amount:50,unit:'percent',resetsAt:now+90*60000}]});
  assert.equal(renewalAlerts([r],{},now)[0].kind,'reset_soon');
  assert.equal(renewalAlerts([r],{},now)[0].minutes,90);
  assert.equal(renewalAlerts([{...r,status:'offline'}],{},now).length,0);
  const manual={...r,source:'manual',fetchedAt:now-86400000};
  const alerts=renewalAlerts([manual],{[r.id+'/x']:{resetsAt:now-1000}},now);
  assert.equal(alerts[0].kind,'check_renewal');assert.notEqual(alerts[0].kind,'recovered');
});
test('Pippit is discovered in a stable fnm installation even without a terminal PATH entry',()=>{
  const {findPippitBinary}=require('../src/catalog.cjs');
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-pippit-')),roaming=path.join(home,'roaming');
  const folder=path.join(roaming,'fnm','node-versions','v26.0.0','installation','node_modules','@pippit-dev','cli','bin');fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,'pippit-tool-cli.exe');fs.writeFileSync(file,'fixture');
  const env={PATH:'',APPDATA:roaming};assert.equal(findPippitBinary({home,env,platform:'win32'}),file);
  assert.equal(scan({home,env,platform:'win32'}).tools.find(t=>t.id==='xyq').connections.some(c=>c.evidence==='installed'),true);
});

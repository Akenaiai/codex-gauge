'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {creativeSnapshot}=require('../src/creative-credits.cjs');
const {CreditCenter}=require('../src/credit-center.cjs');
const {cleanRecord,expiryAlerts}=require('../src/credit-model.cjs');
const {build}=require('../src/ui/credit-overview.js');
const {markup}=require('../src/ui/creative-panel.js');
const DAY=86400000,NOW=Date.now();
const pool=(id,amount,days=2)=>({id,amount,unit:'credits',label:id,labelEn:id,expiresAt:NOW+days*DAY});
const tool=(id,pools)=>({id,name:id,connections:[],records:[{id:id+':demo',provider:id,account:'Synthetic',source:'api',identityVerified:true,status:'ready',fetchedAt:NOW,pools}]});
function center(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-expiry-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new CreditCenter(dir,{home:dir,env:{PATH:''}});}
test('default cutoff includes 100, and tiny expiring sub-pools never borrow a large total balance',()=>{
  for(const amount of [0,10,100]){const state={tools:[tool('runway',[pool('effective',5000,30),pool('gift',amount)])]};const row=creativeSnapshot(state,NOW).rows[0];assert.equal(row.expiring,false);assert.equal(row.amount,5000);assert.equal(build(state,NOW).urgent,0);}
  assert.equal(creativeSnapshot({tools:[tool('runway',[pool('gift',101)])]},NOW).expiring,1);
});
test('eligible expiries sort above ordinary balances by deadline, with platform-specific cutoffs',()=>{
  const state={creativeExpiry:{thresholds:{suno:5}},tools:[tool('lovart',[pool('effective',100)]),tool('runway',[pool('monthly',400,3)]),tool('suno',[pool('song_credits',10,1)])]};
  assert.deepEqual(creativeSnapshot(state,NOW).rows.map(r=>r.id),['suno','runway','lovart']);
  assert.equal(creativeSnapshot(state,NOW).expiring,2);
});
test('unknown expiring amounts stay ordinary and daily gifts stay silent even above cutoff',()=>{
  const t=tool('lovart',[pool('effective',1000,30)]);t.webDates=[{kind:'expiry',provider:'lovart',source:'web',dateOnly:true,onDate:new Date(NOW+DAY).toISOString().slice(0,10),at:NOW+DAY,days:1,amount:null,unit:'credits'}];
  assert.equal(creativeSnapshot({tools:[t]},NOW).expiring,0);
  t.records[0].pools.push({...pool('daily',1000,1),poolType:'daily'});assert.equal(creativeSnapshot({tools:[t]},NOW).expiring,0);
});
test('credit cutoff and quiet seven-day stage apply to creative notifications without changing Codex cards',()=>{
  const record=(provider,amount,days)=>cleanRecord({provider,scope:'Synthetic',source:'api',identityVerified:true,fetchedAt:NOW,pools:[pool('monthly',amount,days)]},NOW);
  assert.equal(expiryAlerts([record('runway',100,1)],{},NOW).length,0);
  assert.equal(expiryAlerts([record('runway',101,5)],{},NOW).length,0);
  assert.equal(expiryAlerts([record('runway',101,2)],{},NOW).length,1);
  assert.equal(expiryAlerts([record('runway',10,2)],{},NOW,{thresholds:{runway:5}}).length,1);
  assert.equal(expiryAlerts([record('codex',1,2)],{},NOW).length,1);
});
test('platform cutoff persists, rejects invalid writes, and rolls back on disk failure',t=>{
  const c=center(t);c.ensureTool('runway');c.setCreativeExpiry('runway',25);assert.equal(new CreditCenter(c.store.directory).state().creativeExpiry.thresholds.runway,25);
  for(const value of [-1,NaN,Infinity,'20'])assert.throws(()=>c.setCreativeExpiry('runway',value));
  assert.throws(()=>c.setCreativeExpiry('codex',0));
  c.store.save=()=>{throw Error('injected');};assert.throws(()=>c.setCreativeExpiry('runway',300),/storage_failed/);assert.equal(c.creativeExpiry.thresholds.runway,25);
});
test('dismissing one batch clears its emphasis across restart, but another batch and Codex remain eligible',t=>{
  const c=center(t);const record=cleanRecord({provider:'runway',scope:'Synthetic',source:'api',identityVerified:true,fetchedAt:NOW,pools:[pool('monthly',400,2),pool('gift',200,3)]},NOW);c.put(record,false);c.ensureTool('runway');c.persist();
  const first=creativeSnapshot(c.state(),NOW).rows[0].priorityExpiry;c.dismissCreativeExpiry(first);
  const reloaded=new CreditCenter(c.store.directory),row=creativeSnapshot(reloaded.state(),NOW).rows[0];assert.equal(row.priorityExpiry.poolId,'gift');
  assert.deepEqual(expiryAlerts(reloaded.records,{},NOW,reloaded.creativeExpiry).map(e=>e.poolId),['gift']);
});
test('website and user-date expiry notices also honor the platform cutoff',t=>{
  const c=center(t),at=NOW+DAY;const today=new Date(at),onDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  c.ensureTool('xyq');c.dateObservations=[{id:'a'.repeat(20),provider:'xyq',account:'Synthetic',accountRef:'b'.repeat(20),observedAt:NOW,sourceUrl:'https://xyq.jianying.com/',items:[{id:'monthly',kind:'expiry',label:'Monthly',labelEn:'Monthly',amount:50,unit:'credits',onDate,poolType:'subscription'}]}];
  const alerts=[];c.on('alert',a=>alerts.push(a));c.tick();assert.equal(alerts.length,0);
  c.setCreativeExpiry('xyq',0);c.tick();assert.ok(alerts.some(a=>a.scheduleKind==='expiry'));
});
test('creative panel names its reminder source, explains priority, and exposes adjustment and dismissal',()=>{
  const creative=creativeSnapshot({tools:[tool('runway',[pool('monthly',200,1)])]},NOW);
  const html=markup({state:{creative,settings:{language:'zh-CN'}},t:(zh,en)=>zh,esc:String,button:()=>'',icon:()=>'',now:NOW});
  for(const value of ['创作积分','临期','按到期时间','creative-expiry-settings','creative-expiry-dismiss'])assert.ok(html.includes(value),value);
});
test('main routes creative expiry to the back and non-creative expiry to the credit center',()=>{
  const vm=require('node:vm'),{EventEmitter}=require('node:events'),source=fs.readFileSync(path.join(__dirname,'../src/main.cjs'),'utf8');
  const center=new EventEmitter();Object.assign(center,{enabled:true,reminders:true,inventory:{tools:[]}});const sent=[];
  const context={center,demo:false,quitting:false,store:{settings:{language:'zh-CN'}},creativeExpiryRules:require('../src/ui/creative-expiry.js'),observationNotice:()=>null,text:(zh,en)=>zh,delivery:{send:(alert,notice)=>sent.push({alert,notice})}};
  vm.runInNewContext(source.slice(source.indexOf("  center.on('alert',"),source.indexOf("  quota.on('state',")),context);
  for(const provider of ['runway','firecrawl'])center.emit('alert',{provider,kind:'expiry',label:'Monthly',labelEn:'Monthly',amount:200,hours:2});
  assert.equal(sent[0].alert.target,'creative');assert.match(sent[0].notice.title,/创作积分/);assert.match(sent[0].notice.body,/打开创作积分/);
  assert.equal(sent[1].alert.target,'center');assert.match(sent[1].notice.body,/打开额度中心/);
});

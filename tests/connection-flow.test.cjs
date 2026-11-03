const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CreditCenter}=require('../src/credit-center.cjs'),{cleanRecord}=require('../src/credit-model.cjs');
const {build}=require('../src/ui/credit-overview.js'),{creativeSnapshot}=require('../src/creative-credits.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-flow-'));t.after(()=>{for(const name of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,name));fs.rmdirSync(dir);});const c=new CreditCenter(dir,{home:dir,env:{PATH:''}});c.rescan();return {c,dir};}
function reading(provider,amount){return cleanRecord({provider,scope:'synthetic-user',account:'Synthetic',source:'api',identityVerified:true,fetchedAt:Date.now(),pools:[{id:'effective',amount,unit:'credits'}]});}
test('blank install chooses a catalog platform without inventing discovery, login or zero balance',t=>{
  const {c,dir}=fixture(t);assert.equal(c.state().tools.length,0);assert.ok(c.state().connectionCatalog.length>0);
  c.setConnectionPreferences({provider:'runway',followed:true});let s=c.state(),p=s.tools.find(t=>t.id==='runway');
  assert.equal(p.followed,true);assert.deepEqual(p.connections,[]);assert.equal(p.access.discovery.found,false);assert.equal(p.access.authorization.status,'unconfirmed');assert.equal(p.access.reading.status,'none');assert.equal(build(s).rows[0].status,'unknown');assert.equal(s.records.length,0);
  c.setConnectionPreferences({step:'connect',activeProvider:'runway'});
  const restored=new CreditCenter(dir,{home:dir,env:{PATH:''}});restored.rescan();s=restored.state();assert.equal(s.onboardingCompleted,false);assert.equal(s.connectionPreferences.step,'connect');assert.equal(s.connectionPreferences.activeProvider,'runway');assert.equal(s.tools.find(t=>t.id==='runway').followed,true);
  restored.completeOnboarding();assert.equal(new CreditCenter(dir).onboardingCompleted,true);
});
test('rescan keeps unselected discoveries out of new-user overview, including after skipping all choices',t=>{
  const {c}=fixture(t);c.ensureTool('suno');assert.equal(c.state().tools[0].followed,false);c.completeOnboarding();assert.equal(c.state().tools[0].followed,false);assert.equal(build(c.state()).rows.length,0);
});
test('hide and restore preserve verified zero, accounts, dates, rules and reminder preferences',t=>{
  const {c,dir}=fixture(t);c.ensureTool('runway');c.put(reading('runway',0),false);c.setConnectionPreferences({provider:'runway',followed:true});
  const r=c.records[0];c.setRule(r.id+'/effective',{notify:false});const id=c.setUserDate({provider:'runway',recordId:r.id,poolId:'effective',account:'Synthetic',label:'Credits',poolType:'subscription',expiryDate:'2030-01-31',monthlyDay:2,notify:true});
  const evidence=JSON.stringify([c.records,c.rules,c.userDates,c.reminders]);assert.equal(build(c.state()).rows[0].status,'empty');assert.equal(creativeSnapshot(c.state()).rows.length,1);
  c.setConnectionPreferences({provider:'runway',followed:false});assert.equal(build(c.state()).rows.length,0);assert.equal(creativeSnapshot(c.state()).rows.length,0);assert.equal(JSON.stringify([c.records,c.rules,c.userDates,c.reminders]),evidence);
  const restored=new CreditCenter(dir,{home:dir,env:{PATH:''}});restored.rescan();assert.equal(restored.state().tools.find(t=>t.id==='runway').followed,false);restored.setConnectionPreferences({provider:'runway',followed:true});assert.equal(restored.userDates[0].id,id);assert.equal(restored.rules[r.id+'/effective'].notify,false);
});
test('membership notes never create a quota, verify sign-in, attach dates or change an API reading',t=>{
  const {c}=fixture(t);c.setConnectionPreferences({provider:'deepseek',followed:true});const before=JSON.stringify(c.state().tools[0].access);
  for(const membership of ['paid','free','api','unknown']){c.setConnectionPreferences({provider:'deepseek',membership});assert.equal(JSON.stringify(c.state().tools[0].access),before);assert.equal(c.records.length,0);assert.equal(c.userDates.length,0);}
  c.put(reading('deepseek',null),false);const records=JSON.stringify(c.records);c.setConnectionPreferences({provider:'deepseek',membership:'paid'});assert.equal(JSON.stringify(c.records),records);assert.equal(build(c.state()).rows[0].status,'unknown');
});
test('legacy upgrade preserves all previous visible tools, references, dates and original badge settings',t=>{
  const {c,dir}=fixture(t);c.ensureTool('suno');c.put(reading('suno',9),false);c.persist();const file=path.join(dir,'credit-center.json'),old=JSON.parse(fs.readFileSync(file));delete old.connectionPreferences;delete old.onboardingCompleted;fs.writeFileSync(file,JSON.stringify(old));fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({settings:{language:'en',theme:'dark',autostart:true},ledger:{original:true}}));
  const badge=fs.readFileSync(path.join(dir,'settings.json'),'utf8'),restored=new CreditCenter(dir,{home:dir,env:{PATH:''}});restored.rescan();assert.equal(restored.onboardingCompleted,true);assert.equal(restored.state().tools.find(t=>t.id==='suno').followed,true);assert.equal(restored.records[0].id,c.records[0].id);assert.equal(fs.readFileSync(path.join(dir,'settings.json'),'utf8'),badge);
});
test('invalid preferences and failed saves preserve both disk and in-memory selections',t=>{
  const {c,dir}=fixture(t);c.setConnectionPreferences({provider:'runway',followed:true});const previous=JSON.stringify(c.connectionPreferences),inventory=JSON.stringify(c.inventory),disk=fs.readFileSync(path.join(dir,'credit-center.json'),'utf8');
  for(const input of [{provider:'never-known',followed:true},{provider:'runway',followed:'yes'},{provider:'runway',membership:'verified'},{step:'complete'},{activeProvider:'never-known'}])assert.throws(()=>c.setConnectionPreferences(input));
  c.store.save=()=>{throw Error('disk');};assert.throws(()=>c.setConnectionPreferences({provider:'suno',followed:true}));assert.equal(JSON.stringify(c.connectionPreferences),previous);assert.equal(JSON.stringify(c.inventory),inventory);assert.equal(fs.readFileSync(path.join(dir,'credit-center.json'),'utf8'),disk);
});
test('directly authored dates and manual readings follow their platform, while explicit hiding is retained',t=>{
  const {c}=fixture(t);c.addManual({name:'Synthetic tool',account:'Work',amount:0,unit:'credits'});const id=c.records[0].provider;assert.equal(c.state().tools[0].followed,true);c.setConnectionPreferences({provider:id,followed:false});c.addManual({provider:id,name:'Synthetic tool',account:'Work',amount:2,unit:'credits'});assert.equal(c.state().tools[0].followed,false);
});
test('new-user existing connections auto-follow successful current readings including zero; explicit hiding survives refresh and restart',t=>{
  const {c,dir}=fixture(t);c.ensureTool('runway');c.ensureTool('suno');c.ensureTool('recraft');
  c.put(reading('runway',0),false);c.put(reading('suno',4),false);c.put({...reading('recraft',8),fetchedAt:Date.now()-600000},false);c.persist();
  assert.equal(c.state().tools.find(t=>t.id==='runway').followed,true);assert.equal(c.state().tools.find(t=>t.id==='suno').followed,true);assert.equal(c.state().tools.find(t=>t.id==='recraft').followed,false);assert.deepEqual(build(c.state()).rows.map(r=>r.status).sort(),['available','empty']);
  c.setConnectionPreferences({provider:'runway',followed:false});c.put(reading('runway',5),false);c.persist();assert.equal(c.state().tools.find(t=>t.id==='runway').followed,false);
  const restored=new CreditCenter(dir,{home:dir,env:{PATH:''}});restored.rescan();assert.equal(restored.state().tools.find(t=>t.id==='runway').followed,false);assert.equal(restored.state().tools.find(t=>t.id==='suno').followed,true);
});
test('failed, host, unknown, cache and card-only evidence cannot auto-follow a new platform',t=>{
 const {c}=fixture(t);for(const [id,change]of [['runway',{status:'offline'}],['suno',{source:'host'}],['lovart',{pools:[{id:'effective',amount:null,unit:'credits'}]}],['codex',{pools:[{id:'card.a',amount:1,unit:'cards'}]}]]){c.ensureTool(id);c.put({...reading(id,5),...change},false);assert.equal(c.state().tools.find(t=>t.id===id).followed,false);}c.ensureTool('recraft');assert.equal(c.state().tools.find(t=>t.id==='recraft').followed,false);
});
test('legacy default visibility does not turn old cache/Skill inventory into explicitly followed overview placeholders',t=>{
 const {c,dir}=fixture(t);c.ensureTool('suno');c.ensureTool('recraft');c.inventory.tools.find(t=>t.id==='recraft').connections=[{kind:'skill',source:'Codex',label:'Recraft instructions',enabled:true,evidence:'instructions'}];c.put(reading('suno',3),false);c.persist();const file=path.join(dir,'credit-center.json'),old=JSON.parse(fs.readFileSync(file));delete old.connectionPreferences;delete old.onboardingCompleted;fs.writeFileSync(file,JSON.stringify(old));
 const restored=new CreditCenter(dir,{home:dir,env:{PATH:''}});let s=restored.state();assert.equal(s.tools.length,2);assert.equal(s.tools.find(t=>t.id==='recraft').followed,true);assert.equal(s.tools.find(t=>t.id==='recraft').userFollowed,false);assert.deepEqual(build(s).rows.map(r=>r.id),['suno']);
 restored.setConnectionPreferences({provider:'recraft',followed:true});assert.equal(build(restored.state()).rows.length,2);
});
test('source opener resolves only catalog references, including the actual API DPAPI component fallback',()=>{
 const {connectionSource}=require('../src/connection-capabilities.cjs');
 assert.match(connectionSource('runway','codex_cli'),/^https:\/\/developers\.openai\.com\//);assert.match(connectionSource('deepseek','powershell'),/^https:\/\/learn\.microsoft\.com\//);assert.equal(connectionSource('kling','kling_cli'),null);assert.equal(connectionSource('kimi'),null);assert.equal(connectionSource('runway','python'),null);assert.equal(connectionSource('https://untrusted.invalid/'),null);assert.equal(connectionSource('__proto__'),null);
});

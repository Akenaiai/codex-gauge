const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CreditCenter}=require('../src/credit-center.cjs'),{CreditSecrets,configuredKey}=require('../src/credit-credentials.cjs');
test('a new user inherits no other profile inventory, balances, dates, rules or encrypted credentials',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-user-isolation-')),a=path.join(root,'user-a'),b=path.join(root,'user-b');
  const env=home=>({PATH:'',APPDATA:path.join(home,'roaming'),LOCALAPPDATA:path.join(home,'local')});
  for(const home of [a,b])fs.mkdirSync(path.join(home,'.codex'),{recursive:true});
  t.after(()=>{for(const home of [a,b]){for(const f of ['.codex/config.toml','credit-center.json','credit-imports.json','credit-host-tools.json','credit-date-observations.json','credit-secrets.json'])if(fs.existsSync(path.join(home,f)))fs.unlinkSync(path.join(home,f));fs.rmdirSync(path.join(home,'.codex'));fs.rmdirSync(home);}fs.rmdirSync(root);});
  fs.writeFileSync(path.join(a,'.codex/config.toml'),'[mcp_servers.synthetic_profile_a]\ncommand = "never-run"\n');
  fs.writeFileSync(path.join(a,'credit-imports.json'),JSON.stringify({records:[{provider:'lovart',scope:'synthetic-profile-a',account:'Synthetic A',source:'host',fetchedAt:Date.now(),pools:[{id:'monthly',label:'Sample credits',labelEn:'Sample credits',amount:17,unit:'credits'}]}]}));
  fs.writeFileSync(path.join(a,'credit-secrets.json'),JSON.stringify({firecrawl:'synthetic-encrypted-fixture'}));
  const first=new CreditCenter(a,{home:a,env:env(a)});first.rescan();assert.ok(first.state().records.length>0);
  const second=new CreditCenter(b,{home:b,env:env(b)});second.rescan();const state=second.state();
  assert.equal(state.tools.length,0);assert.equal(state.records.length,0);assert.equal(state.events.length,0);assert.equal(second.dateObservations.length,0);assert.equal(Object.keys(second.monthlySchedules).length,0);assert.equal(Object.keys(new CreditSecrets(b).read()).length,0);assert.equal(configuredKey('firecrawl',{home:b,env:env(b)})===null,true);
  fs.writeFileSync(path.join(b,'.codex/config.toml'),'[mcp_servers.synthetic_profile_b]\ncommand = "never-run"\n');second.rescan();assert.equal(second.state().tools.length,1);assert.equal(second.state().tools[0].id==='synthetic_profile_b',true);assert.equal(second.state().records.length,0);
});

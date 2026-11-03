'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {once}=require('node:events');
const {NativeMcp,OAuthVault,definitions}=require('../src/native-mcp.cjs');
const {CreditCenter}=require('../src/credit-center.cjs');
const {CreditSecrets}=require('../src/credit-credentials.cjs');
const {apiBalance}=require('../src/credit-adapters.cjs');
const {cleanRecord}=require('../src/credit-model.cjs');
const origin='https://mcp.runwayml.com',key='synthetic-subscription-key-12345678';
const crypt={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from([...s].reverse().join('')),decryptString:b=>[...b.toString()].reverse().join('')};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
const grant=()=>({metadata:{token:origin+'/token'},client:'synthetic-client',access:'synthetic-access',refresh:'synthetic-refresh',expiresAt:Date.now()+3600000});
function setup(t,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-native-')),vault=new OAuthVault(dir,crypt),requests=[],browsers=[];
 let count=0;
 const fixture=async(url,opt={})=>{
  requests.push({url,opt});if(options.response){const r=await options.response(url,opt);if(r)return r;}
  if(url===definitions.runway.metadata)return json({resource:definitions.runway.endpoint,authorization_servers:[origin],scopes_supported:['openid','api:read_write']});
  if(url===origin+'/.well-known/oauth-authorization-server')return json({issuer:origin,authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']});
  if(url===origin+'/register'){const d=JSON.parse(opt.body);return json({client_id:'synthetic-client',redirect_uris:d.redirect_uris,token_endpoint_auth_method:'none'});}
  if(url===origin+'/token')return json({access_token:'synthetic-access',refresh_token:'synthetic-refresh-rotated',token_type:'Bearer',expires_in:3600});
  if(url===definitions.runway.endpoint){const body=JSON.parse(opt.body);assert.equal(opt.headers.Authorization,'Bearer synthetic-access');
   if(body.method==='notifications/initialized')return new Response(null,{status:202});
   const result=body.method==='initialize'?{protocolVersion:'2025-03-26'}:body.method==='tools/list'?{tools:[{name:'whoami'},{name:'generate_video'}]}:{structuredContent:{authenticated:true,team:{id:options.team?.(++count)||'team-a',name:'Synthetic team'},credits:{total:0,plan:0,purchased:0,unlimited:false}}};
   const message={jsonrpc:'2.0',id:body.id,result};
   return options.sse?new Response('event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',method:'notifications/message',params:{}})+'\n\ndata: '+JSON.stringify(message)+'\n\n',{headers:{'content-type':'text/event-stream','mcp-session-id':'synthetic-session'}}):json(message,200,{'mcp-session-id':'synthetic-session'});
  }
  throw Error('unexpected request');
 };
 const n=new NativeMcp(vault,{fetch:fixture,authorizationTimeout:options.authorizationTimeout||1500,openExternal:async url=>{browsers.push(url);await options.open?.(new URL(url));}});
 t.after(()=>n.stop());return{n,vault,dir,requests,browsers};
}
async function callback(url,changes={}){
 const r=new URL(url.searchParams.get('redirect_uri'));r.searchParams.set('state',url.searchParams.get('state'));r.searchParams.set('code','synthetic-code');for(const[k,v]of Object.entries(changes)){if(v===null)r.searchParams.delete(k);else r.searchParams.set(k,v);}return fetch(r,{redirect:'error'});
}
async function finished(n){await n.pending.get('runway').done;}
test('independent OAuth uses PKCE/resource and only account reads with empty CLI/Python/Relay environment',async t=>{
 const {n,vault,dir,requests}=setup(t,{sse:true,open:async url=>{assert.equal(url.origin,origin);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('resource'),definitions.runway.endpoint);assert.equal((await callback(url)).status,200);}});
 const c=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:n});c.setConnectionPreferences({provider:'runway',followed:true});
 assert.equal(c.state().tools[0].access.query.route,'native_mcp');assert.deepEqual(c.state().tools[0].access.components.missing,[]);
 c.nativeAction('connect','runway');await finished(n);
 assert.equal(n.state('runway').connected,true);assert.equal(c.records[0].pools[0].amount,0);assert.equal(c.records[0].identityVerified,true);
 assert.equal(c.state().tools[0].access.query.status,'ready');
 const methods=requests.filter(r=>r.url===definitions.runway.endpoint).map(r=>JSON.parse(r.opt.body));assert.deepEqual(methods.filter(b=>b.method==='tools/call').map(b=>b.params.name),['whoami','whoami']);
 const params=new URLSearchParams(requests.find(r=>r.url===origin+'/token').opt.body);assert.equal(params.get('resource'),definitions.runway.endpoint);assert.equal(params.get('code_verifier').length,43);
 assert.ok(!JSON.stringify(c.state()).includes('synthetic-access'));assert.ok(!fs.readFileSync(vault.file,'utf8').includes('synthetic-access'));
 const restarted=new NativeMcp(new OAuthVault(dir,crypt),{fetch:n.request});t.after(()=>restarted.stop());assert.equal((await restarted.read('runway'))[0].pools[0].amount,0);
});
test('forged/missing state, wrong callback path, duplicate code and issuer mismatch cannot redeem a code',async t=>{
 const {n,requests}=setup(t,{open:async url=>{
  for(const changes of [{state:'forged'},{state:null},{iss:'https://attacker.invalid'},{code:null}])assert.equal((await callback(url,changes)).status,400);
  const wrong=new URL(url.searchParams.get('redirect_uri'));wrong.pathname='/wrong';assert.equal((await fetch(wrong)).status,400);
  const duplicate=new URL(url.searchParams.get('redirect_uri'));duplicate.searchParams.set('state',url.searchParams.get('state'));duplicate.searchParams.append('code','a');duplicate.searchParams.append('code','b');assert.equal((await fetch(duplicate)).status,400);
  assert.equal(requests.some(r=>r.url===origin+'/token'),false);await callback(url,{iss:origin});
 }});n.begin('runway');await finished(n);assert.equal(n.state('runway').connected,true);
});
test('user denial leaves the previous independent connection unchanged',async t=>{
 const{n,vault}=setup(t,{open:async url=>{await callback(url,{code:null,error:'access_denied'});}});vault.set('runway',grant());const before=fs.readFileSync(vault.file,'utf8');n.begin('runway');await finished(n);assert.equal(n.state('runway').error,'authorization_denied');assert.equal(fs.readFileSync(vault.file,'utf8'),before);
});
test('cancel closes the callback and ignores a late response without modifying credentials',async t=>{
 let opened;const openedPromise=new Promise(r=>opened=r);const{n,vault}=setup(t,{open:async url=>opened(url)});vault.set('runway',grant());const before=fs.readFileSync(vault.file,'utf8');n.begin('runway');const done=n.pending.get('runway').done,url=await openedPromise;n.cancel('runway');await done;assert.equal(n.state('runway').error,'authorization_cancelled');assert.equal(n.state('runway').pending,false);await assert.rejects(callback(url));assert.equal(fs.readFileSync(vault.file,'utf8'),before);
});
test('authorization timeout and shutdown close callbacks and do not save tokens',async t=>{
 const{n}=setup(t,{authorizationTimeout:60});n.begin('runway');await finished(n);assert.equal(n.state('runway').error,'timeout');assert.equal(n.state('runway').connected,false);
 n.begin('runway');const done=n.pending.get('runway').done;n.stop();await done;assert.equal(n.state('runway').pending,false);assert.equal(n.state('runway').connected,false);
});
test('a stalled system-browser opener remains cancellable under the whole-flow deadline',async t=>{
 const{n}=setup(t,{authorizationTimeout:50,open:()=>new Promise(()=>{})});n.begin('runway');await finished(n);assert.equal(n.state('runway').error,'timeout');assert.equal(n.state('runway').pending,false);assert.equal(n.state('runway').connected,false);
});
test('wrong resource/authorization host or missing PKCE prevents registration and browser launch',async t=>{
 for(const bad of ['resource','issuer','pkce','endpoint']){
 const{n,browsers,requests}=setup(t,{response:async url=>{
  if(url===definitions.runway.metadata&&bad==='resource')return json({resource:'https://attacker.invalid',authorization_servers:[origin]});
  if(url===definitions.runway.metadata&&bad==='issuer')return json({resource:definitions.runway.endpoint,authorization_servers:['https://attacker.invalid']});
  if(url===origin+'/.well-known/oauth-authorization-server')return json({issuer:origin,authorization_endpoint:bad==='endpoint'?'https://attacker.invalid/authorize':origin+'/authorize',token_endpoint:origin+'/token',registration_endpoint:origin+'/register',code_challenge_methods_supported:bad==='pkce'?['plain']:['S256'],token_endpoint_auth_methods_supported:['none']});
 }});n.begin('runway');await finished(n);assert.equal(browsers.length,0);assert.equal(requests.some(r=>r.url===origin+'/register'),false);assert.equal(n.state('runway').error,'invalid_response');
 }
});
test('permission failure after authorization never commits credentials or invokes generation',async t=>{
 const{n,requests}=setup(t,{open:callback,response:async(url,opt)=>url===definitions.runway.endpoint?json({},403):null});n.begin('runway');await finished(n);assert.equal(n.state('runway').error,'permission_denied');assert.equal(n.state('runway').connected,false);assert.ok(requests.every(r=>!r.opt.body?.includes('generate_video')));
});
test('account/team change between reads rejects the entire result',async t=>{
 const{n,vault}=setup(t,{team:count=>count===1?'team-a':'team-b'});vault.set('runway',grant());await assert.rejects(n.read('runway'),/account_changed/);
});
test('malformed RPC IDs, oversized bodies and offline failures preserve no fabricated quota',async t=>{
 for(const kind of ['id','large','offline']){
  const{n,vault}=setup(t,{response:async(url,opt)=>{if(url!==definitions.runway.endpoint)return;if(kind==='offline')throw Error('offline');if(kind==='large')return new Response('x'.repeat(2000001));const b=JSON.parse(opt.body);return json({jsonrpc:'2.0',id:b.id+1,result:{protocolVersion:'2025-03-26'}});}});vault.set('runway',grant());await assert.rejects(n.read('runway'),/invalid_response|query_failed/);assert.equal(n.state('runway').selected,true);
 }
});
test('refresh token rotation is encrypted, survives restart and never opens a browser',async t=>{
 const{n,vault,browsers}=setup(t);vault.set('runway',{...grant(),expiresAt:Date.now()-1});await n.read('runway');assert.equal(vault.get('runway').refresh,'synthetic-refresh-rotated');assert.equal(browsers.length,0);assert.ok(!fs.readFileSync(vault.file,'utf8').includes('synthetic-refresh-rotated'));
});
test('401 without expiry gets one refresh, while invalid refresh and insufficient permission never fall back',async t=>{
 let calls=0;const{n,vault,requests}=setup(t,{response:async(url,opt)=>{if(url===definitions.runway.endpoint&&++calls===1)return json({},401);}});vault.set('runway',{...grant(),expiresAt:null});await n.read('runway');assert.equal(requests.filter(r=>r.url===origin+'/token').length,1);
 const second=setup(t,{response:async url=>url===origin+'/token'?json({error:'invalid_grant'},400):null});second.vault.set('runway',{...grant(),expiresAt:Date.now()-1});await assert.rejects(second.n.read('runway'),/login_required/);assert.equal(second.n.state('runway').error,'login_required');assert.equal(second.n.state('runway').selected,true);
 const third=setup(t,{response:async url=>url===definitions.runway.endpoint?json({},403):null});third.vault.set('runway',grant());await assert.rejects(third.n.read('runway'),/permission_denied/);assert.equal(third.requests.some(r=>r.url===origin+'/token'),false);
});
test('disconnect blocks in-flight refresh and restart cannot silently switch to an original-client account',async t=>{
 let release,entered;const enter=new Promise(r=>entered=r),wait=new Promise(r=>release=r);const{n,vault,dir}=setup(t,{response:async url=>{if(url===origin+'/token'){entered();await wait;return json({access_token:'synthetic-access',token_type:'Bearer'});}}});vault.set('runway',{...grant(),expiresAt:Date.now()-1});const read=n.read('runway');await enter;n.disconnect('runway');release();await assert.rejects(read,/authorization_cancelled/);assert.equal(vault.get('runway'),null);assert.equal(new OAuthVault(dir,crypt).selected('runway'),true);
 const c=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:n});c.setConnectionPreferences({provider:'runway',followed:true});assert.equal(c.state().tools[0].access.query.route,'native_mcp');assert.equal(c.state().tools[0].queryReady,false);
});
test('failed center commit restores previous credentials, records and dates',async t=>{
 const{n,vault,dir}=setup(t,{open:callback});vault.set('runway',{...grant(),access:'old-account-access',refresh:'old-account-refresh'});const c=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:n});c.setConnectionPreferences({provider:'runway',followed:true});
 c.put(cleanRecord({provider:'runway',scope:'old-team',source:'mcp',account:'Synthetic old team',identityVerified:true,fetchedAt:Date.now(),pools:[{id:'effective',unit:'credits',amount:9}]}),false);c.persist();const record=c.records[0];c.setUserDate({provider:'runway',recordId:record.id,poolId:'effective',account:'Synthetic old team',label:'Old pool',poolType:'subscription',monthlyDay:5});
 const before=fs.readFileSync(vault.file,'utf8'),records=JSON.stringify(c.records),dates=JSON.stringify(c.userDates),disk=fs.readFileSync(path.join(dir,'credit-center.json'),'utf8');c.store.save=()=>{throw Error('disk');};n.begin('runway');await finished(n);assert.equal(fs.readFileSync(vault.file,'utf8'),before);assert.equal(JSON.stringify(c.records),records);assert.equal(JSON.stringify(c.userDates),dates);assert.equal(fs.readFileSync(path.join(dir,'credit-center.json'),'utf8'),disk);assert.equal(n.state('runway').connected,true);
 const restartedNative=new NativeMcp(new OAuthVault(dir,crypt),{fetch:n.request});t.after(()=>restartedNative.stop());const restarted=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:restartedNative});restarted.rescan();assert.equal(restartedNative.vault.get('runway').access,'old-account-access');assert.equal(restarted.records.filter(r=>r.status!=='account_changed')[0].id,record.id);assert.equal(restarted.records[0].pools[0].amount,9);assert.equal(JSON.stringify(restarted.userDates),dates);
});
test('unavailable/basic-text encryption rejects new OAuth and credential files fail closed',t=>{
 const{dir}=setup(t);for(const storage of [{isEncryptionAvailable:()=>false},{...crypt,getSelectedStorageBackend:()=>'basic_text'}])assert.throws(()=>new OAuthVault(dir,storage).set('runway',grant()),/credential_storage_failed/);
 fs.writeFileSync(path.join(dir,'credit-oauth.json'),'{bad');assert.throws(()=>new OAuthVault(dir,crypt).get('runway'),/credential_storage_failed/);
});
test('stop/suspend during authorization read cancels late completion and preserves old credentials and balance across restart',async t=>{
 let entered,release;const waiting=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);
 const{n,vault,dir}=setup(t,{open:callback,response:async(url,opt)=>{if(url===definitions.runway.endpoint&&JSON.parse(opt.body).method==='tools/call'){entered();await blocked;}}});
 vault.set('runway',{...grant(),access:'old-account-access',refresh:'old-refresh'});const c=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:n});c.ensureTool('runway');c.put(cleanRecord({provider:'runway',scope:'old-account',source:'mcp',identityVerified:true,fetchedAt:Date.now(),pools:[{id:'effective',amount:11,unit:'credits'}]}),false);c.persist();const before=fs.readFileSync(vault.file,'utf8'),recordId=c.records[0].id;
 n.begin('runway');const done=n.pending.get('runway').done;await waiting;c.stop();release();await done;assert.equal(fs.readFileSync(vault.file,'utf8'),before);assert.equal(c.records.length,1);assert.equal(c.records[0].id,recordId);assert.equal(n.state('runway').pending,false);
 const restarted=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:n});assert.equal(restarted.records[0].id,recordId);assert.equal(restarted.records[0].pools[0].amount,11);assert.equal(vault.get('runway').access,'old-account-access');
});
test('Recraft native reader preserves personal-account identity and rejects unknown/team response formats',async t=>{
 const{n,vault}=setup(t);vault.set('recraft',{...grant(),metadata:{token:'https://mcp.recraft.ai/token'}});
 n.request=async(url,opt)=>{assert.equal(url,definitions.recraft.endpoint);const b=JSON.parse(opt.body);if(b.method==='notifications/initialized')return new Response(null,{status:202});return json({jsonrpc:'2.0',id:b.id,result:b.method==='initialize'?{protocolVersion:'2025-03-26'}:b.method==='tools/list'?{tools:[{name:'get_user'}]}:{content:[{type:'text',text:'User ID: synthetic-user\nActive account: your personal account. You have 42 credits left there.\n- Personal account: 42 credits, plan Free (active)\n'}]}});};
 const[r]=await n.read('recraft');assert.equal(r.pools[0].amount,42);assert.equal(r.identityVerified,true);assert.match(r.scope,/recraft-mcp:/);
});
test('MiniMax direct key reads only general subscription percentages and never fabricates video/API entitlement',async()=>{
 const[r]=await apiBalance('minimax',key,async(url,opt)=>{assert.equal(url,'https://www.minimax.io/v1/token_plan/remains');assert.equal(opt.headers.Authorization,'Bearer '+key);return{base_resp:{status_code:0},model_remains:[{model_name:'general',current_interval_remaining_percent:0,current_weekly_remaining_percent:80,end_time:Date.now()+500000},{model_name:'video',current_interval_remaining_percent:100}]};});assert.deepEqual(r.pools.map(p=>p.amount),[0,80]);assert.equal(r.identityVerified,false);assert.ok(!JSON.stringify(cleanRecord(r)).includes(key));assert.equal(r.pools.length,2);
 for(const raw of [{base_resp:{status_code:1004}},{base_resp:{status_code:0},model_remains:[{model_name:'general',current_interval_total_count:0,current_interval_usage_count:0}]},{base_resp:{status_code:0},model_remains:[{model_name:'general',current_interval_remaining_percent:101}]}])await assert.rejects(apiBalance('minimax',key,async()=>raw));
});
test('MiniMax direct connection persists encrypted without companions, failure retains prior stale source and does not query Relay',async t=>{
 const{dir}=setup(t),secrets=new CreditSecrets(dir,crypt);let calls=0,broken=false;
 const c=new CreditCenter(dir,{home:dir,env:{PATH:''},hasCredential:id=>secrets.has(id),credentialProvider:id=>secrets.get(id),saveCredential:(id,key)=>secrets.set(id,key),request:async()=>{calls++;if(broken)throw Error('query_failed');return{base_resp:{status_code:0},model_remains:[{model_name:'general',current_interval_remaining_percent:65}]};}});
 await c.connect('minimax',key);assert.equal(c.state().tools[0].access.query.route,'subscription_api');assert.deepEqual(c.state().tools[0].access.components.missing,[]);broken=true;await c.refresh('minimax',{manual:true});assert.equal(c.records[0].pools[0].amount,65);assert.equal(c.records[0].status,'offline');assert.equal(calls,2);assert.equal(c.records[0].source,'api');assert.ok(!JSON.stringify(c.state()).includes(key));assert.ok(!fs.readFileSync(path.join(dir,'credit-secrets.json'),'utf8').includes(key));
});
test('MiniMax environment route retires Relay only after success, preserves manual records and never reactivates Relay on key removal/restart',async t=>{
 const{dir}=setup(t);const env={PATH:'',MINIMAX_SUBSCRIPTION_KEY:key};let broken=false;
 const options={home:dir,env,request:async()=>{if(broken)throw Error('query_failed');return{base_resp:{status_code:0},model_remains:[{model_name:'general',current_interval_remaining_percent:40}]};}};
 const c=new CreditCenter(dir,options);c.ensureTool('minimax');
 for(const[source,amount]of [['relay',88],['manual',12]])c.put(cleanRecord({provider:'minimax',scope:'old-'+source,source,identityVerified:source==='relay',fetchedAt:Date.now(),pools:[{id:'general',amount,unit:'percent'}]}),false);c.persist();
 await c.refresh('minimax',{manual:true});assert.equal(c.records.find(r=>r.source==='relay').status,'account_changed');assert.equal(c.records.find(r=>r.source==='manual').status,'ready');assert.equal(c.records.find(r=>r.source==='api').pools[0].amount,40);
 broken=true;await c.refresh('minimax',{manual:true});assert.equal(c.records.find(r=>r.source==='relay').status,'account_changed');assert.equal(c.records.find(r=>r.source==='api').status,'offline');
 delete env.MINIMAX_SUBSCRIPTION_KEY;const restarted=new CreditCenter(dir,options);restarted.rescan();const tool=restarted.state().tools.find(t=>t.id==='minimax');assert.equal(tool.access.query.route,'subscription_api');assert.equal(tool.queryReady,false);assert.equal(tool.records.some(r=>r.source==='relay'),false);assert.equal(tool.records.some(r=>r.source==='manual'),true);
 restarted.setSubscriptionRoute('minimax','relay');assert.equal(restarted.state().tools.find(t=>t.id==='minimax').access.query.route,'relay');assert.equal(restarted.records.find(r=>r.source==='api').status,'account_changed');
});
test('API/MCP login and account-change failures never retire or hide independent manual records',async t=>{
 for(const provider of ['minimax','runway'])for(const error of ['login_required','account_changed','query_failed']){
  const{n,dir}=setup(t);const options={home:dir,env:{PATH:'',MINIMAX_SUBSCRIPTION_KEY:key},nativeMcp:n,request:async()=>{throw Error(error);}};
  if(provider==='runway'){n.vault.set('runway',grant());n.read=async()=>{throw Error(error);};}
  const c=new CreditCenter(dir,options);c.ensureTool(provider);c.put(cleanRecord({provider,scope:'manual-independent',source:'manual',identityVerified:false,fetchedAt:Date.now(),pools:[{id:'reading',unit:'credits',amount:17}]}),false);
  await c.refresh(provider,{manual:true});assert.equal(c.records[0].status,'ready');assert.equal(c.state().records.length,1);assert.equal(c.state().records[0].pools[0].amount,17);c.persist();const restarted=new CreditCenter(dir,options);assert.equal(restarted.state().records.length,1);
 }
});
test('disconnect remains closed after a failed center save and restart',async t=>{
 const{n,vault,dir}=setup(t);vault.set('runway',grant());const c=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:n});c.ensureTool('runway');c.put(cleanRecord({provider:'runway',scope:'old-native-team',source:'mcp',identityVerified:true,fetchedAt:Date.now(),pools:[{id:'effective',amount:9,unit:'credits'}]}),false);c.persist();c.store.save=()=>{throw Error('disk');};c.nativeAction('disconnect','runway');assert.equal(vault.get('runway'),null);
 const restarted=new CreditCenter(dir,{home:dir,env:{PATH:''},nativeMcp:n});restarted.rescan();assert.equal(restarted.state().records.length,0);assert.equal(restarted.state().tools[0].queryReady,false);
});

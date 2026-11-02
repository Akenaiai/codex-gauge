const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),http=require('node:http');
const{BrowserLink,browserRecord,extensionId}=require('../src/browser-link.cjs'),{CreditCenter}=require('../src/credit-center.cjs'),{cleanRecord}=require('../src/credit-model.cjs'),{creativeSnapshot}=require('../src/creative-credits.cjs'),{gaugeAmount}=require('../browser-extension/reader.js');
const manifest=require('../browser-extension/manifest.json'),store={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s.split('').reverse().join('')),decryptString:b=>b.toString().split('').reverse().join('')};
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gauge-browser-')),state={link:null};
 const center=new CreditCenter(dir,{home:dir,env:{},browserState:()=>state.link?.state(),browserRefresh:(id,opts)=>state.link.requestRead(id,opts),browserControl:()=>state.link.syncPause()});center.rescan();center.ensureTool('tapnow');
 const link=state.link=new BrowserLink(dir,store,{extensionKey:manifest.key,receive:(r,m)=>center.acceptBrowserReading(r,m),paused:()=>!center.enabled});link.on('unavailable',(id,e)=>center.browserUnavailable(id,e));
 t.after(()=>{state.link.close();for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);});
 const code=JSON.parse(await link.pairingCode()),clientId=crypto.randomUUID();
 const post=async(route,data,options={})=>{const r=await fetch((options.code||code).endpoint+route,{method:'POST',headers:{Authorization:'Bearer '+(options.code||code).token,'Content-Type':'application/json','X-Codex-Gauge':'1',Origin:link.origin,...options.headers},body:typeof data==='string'?data:JSON.stringify({clientId,...data}),signal:AbortSignal.timeout(5000)});return{status:r.status,data:await r.json()};};
 const poll=async(extra={})=>(await post('/v1/poll',{configured:['tapnow'],...extra})).data;
 const queued=async()=>{const promise=link.requestRead('tapnow');promise.catch(()=>{});const p=await poll();return{promise,boot:p.boot,commandId:p.commands[0].id};};
 const reading=async(extra={})=>{const q=await queued();const response=await post('/v1/reading',{boot:q.boot,commandId:q.commandId,provider:'tapnow',marker:'Sample workspace',amount:42,observedAt:Date.now(),...extra});if(response.status===200)await q.promise;return{...response,q};};
 await poll();return{dir,center,link,state,code,clientId,post,poll,queued,reading};
}
test('page parsing accepts explicit complete balances including zero, rejecting missing, shortened and mixed counters',()=>{
 for(const[text,expected]of[['0',0],['12,345.5 Tapies',12345.5],['积分：42',42],['Credits 19',19]])assert.equal(gaugeAmount(text),expected);
 for(const x of [undefined,null,'','—','1.2k','10/100','套餐1000','$9','-1','已用0','1,2','999999999999999'])assert.throws(()=>gaugeAmount(x),/selection_changed/);
});
test('home-page activity requests are rate-limited and respect automatic pause',async t=>{
 const f=await fixture(t);const first=await f.poll({refreshProvider:'tapnow'});assert.equal(first.commands.length,1);assert.equal(first.commands[0].manual,false);
 await f.post('/v1/reading',{boot:first.boot,commandId:first.commands[0].id,provider:'tapnow',marker:'Sample workspace',amount:42,observedAt:Date.now()});
 assert.equal((await f.poll({refreshProvider:'tapnow'})).commands.length,0);
 f.link.providers.tapnow.requestedAt=Date.now()-31000;f.center.setPreferences({enabled:false});assert.equal((await f.poll({refreshProvider:'tapnow'})).commands.length,0);
 assert.equal((await f.post('/v1/poll',{configured:[],refreshProvider:'tapnow'})).status,400);
 assert.equal((await f.post('/v1/poll',{configured:['ideogram'],refreshProvider:'ideogram'})).status,400);
});
test('the full TapNow balance label is accepted without treating rates or allowance counters as balances',()=>{
 assert.equal(gaugeAmount('Tapies 余额：12,345'),12345);
 assert.equal(gaugeAmount('Tapies balance: 0'),0);
 for(const value of ['Tapies 余额：12,345 当前汇率 $1=100 Tapies','Tapies 余额：12/100','Tapies 余额：1.2k','Tapies 总配额：200'])assert.throws(()=>gaugeAmount(value),/selection_changed/);
});
test('browser records remain user-observed and cannot be upgraded to verified identities',()=>{
 const r=browserRecord({provider:'tapnow',marker:'Demo',amount:0,observedAt:Date.now()},'source');assert.equal(r.source,'browser');assert.equal(r.identityVerified,false);assert.equal(cleanRecord({...r,identityVerified:true}).identityVerified,false);
 for(const extra of [{amount:null},{amount:-1},{amount:NaN},{marker:''},{observedAt:Date.now()-31000},{observedAt:Date.now()+10000}])assert.throws(()=>browserRecord({provider:'tapnow',marker:'Demo',amount:1,observedAt:Date.now(),...extra},'source'),/invalid_response/);
});
test('pairing keeps a random key encrypted and out of snapshots, and refuses insecure storage',async t=>{
 const f=await fixture(t);assert.ok(!JSON.stringify(f.link.state()).includes(f.code.token));assert.ok(!fs.readFileSync(path.join(f.dir,'browser-link.json'),'utf8').includes(f.code.token));assert.equal(f.link.origin,'chrome-extension://'+extensionId(manifest.key));
 const bad=new BrowserLink(f.dir,{...store,getSelectedStorageBackend:()=> 'basic_text'},{extensionKey:manifest.key});await assert.rejects(bad.enable(),/credential_storage_failed/);assert.equal(bad.server,null);
});
test('loopback rejects wrong origin, credentials, missing custom header, extra fields and oversized bodies',async t=>{
 const f=await fixture(t);assert.equal((await f.post('/v1/poll',{configured:[]},{headers:{Origin:'https://evil.example'}})).status,403);assert.equal((await f.post('/v1/poll',{configured:[]},{headers:{Authorization:'Bearer wrong'}})).status,401);assert.equal((await f.post('/v1/poll',{configured:[]},{headers:{'X-Codex-Gauge':''}})).status,401);assert.equal((await f.post('/v1/poll',{configured:[],password:'never accepted'})).status,400);assert.equal((await f.post('/v1/poll','x'.repeat(9000))).status,413);
 const forged=await new Promise((resolve,reject)=>{const r=http.request(f.code.endpoint+'/v1/poll',{method:'POST',headers:{Host:'evil.example','Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end('{}');});assert.equal(forged,403);
});
test('a current commanded zero is visible as used up without fabricating account/date certainty',async t=>{
 const f=await fixture(t);const response=await f.reading({amount:0});assert.equal(response.status,200);const state=f.center.state(),r=state.records[0];assert.equal(r.pools[0].amount,0);assert.equal(r.identityVerified,false);assert.equal(creativeSnapshot(state).rows[0].status,'empty');assert.throws(()=>f.center.setRule(r.id+'/effective',{notify:true}),/identity_unverified/);
 f.center.setUserDate({provider:'tapnow',account:'Independent user forecast',label:'Monthly',poolType:'subscription',monthlyDay:17});assert.equal(f.center.userDates[0].recordId,null);
});
test('unsolicited, old-command and replayed observations cannot become fresh balances',async t=>{
 const f=await fixture(t),p=await f.poll(),packet={boot:p.boot,provider:'tapnow',marker:'Demo',amount:8,observedAt:Date.now()};assert.equal((await f.post('/v1/reading',packet)).status,409);
 const q=await f.queued();assert.equal((await f.post('/v1/reading',{...packet,commandId:'old'})).status,409);assert.equal(f.center.records.length,0);const at=Date.now();assert.equal((await f.post('/v1/reading',{...packet,commandId:q.commandId,observedAt:at})).status,200);await q.promise;
 const next=await f.queued();assert.equal((await f.post('/v1/reading',{...packet,commandId:next.commandId,observedAt:at})).status,409);assert.equal(f.center.records[0].fetchedAt,at);
});
test('pause invalidates pending readings; only a newly explicit manual command can read while paused',async t=>{
 const f=await fixture(t),old=await f.queued();f.center.setPreferences({enabled:false});await assert.rejects(old.promise,/browser_offline/);
 assert.equal((await f.post('/v1/reading',{boot:old.boot,commandId:old.commandId,provider:'tapnow',marker:'Demo',amount:9,observedAt:Date.now()})).status,409);assert.equal(f.center.records.length,0);await assert.rejects(f.link.requestRead('tapnow'),/browser_offline/);
 const manual=await f.poll({manualProvider:'tapnow'});assert.equal(manual.paused,true);assert.equal(manual.commands[0].manual,true);assert.equal((await f.post('/v1/reading',{boot:manual.boot,commandId:manual.commands[0].id,provider:'tapnow',marker:'Demo',amount:0,observedAt:Date.now()})).status,200);assert.equal(f.center.records[0].pools[0].amount,0);
});
test('suspend and resume reject the old epoch even for pending manual observations',async t=>{
 const f=await fixture(t),q=await f.queued();f.center.stop();f.link.suspend();await assert.rejects(q.promise,/browser_offline/);f.link.resume();f.center.stopped=false;
 assert.equal((await f.post('/v1/reading',{boot:q.boot,commandId:q.commandId,provider:'tapnow',marker:'Demo',amount:1,observedAt:Date.now()})).status,409);assert.equal(f.center.records.length,0);assert.notEqual((await f.poll()).boot,q.boot);
});
test('closing the dedicated tab immediately invalidates its balance and pending requests on the next close notification',async t=>{
 const f=await fixture(t);await f.reading();const p=await f.queued();await f.poll({configured:[]});await assert.rejects(p.promise,/page_closed/);assert.equal(f.center.records[0].status,'offline');assert.equal(f.center.records[0].pools[0].amount,42);assert.equal(creativeSnapshot(f.center.state()).rows.length,0);
});
test('re-pairing changes key and epoch, rejects the old client, and permits a replacement browser',async t=>{
 const f=await fixture(t);await f.reading();const old=f.link.boot,newCode=JSON.parse(await f.link.resetPairing());assert.notEqual(newCode.token,f.code.token);assert.notEqual(f.link.boot,old);assert.equal(f.center.records[0].status,'offline');assert.equal((await f.post('/v1/poll',{configured:[]})).status,401);
 const clientId=crypto.randomUUID();assert.equal((await f.post('/v1/poll',{clientId,configured:[]},{code:newCode})).status,200);assert.equal((await f.post('/v1/poll',{configured:[]},{code:newCode})).status,403);
});
test('an old authenticated slow-body poll cannot reclaim pairing after reset',async t=>{
 const f=await fixture(t),body=JSON.stringify({clientId:f.clientId,configured:['tapnow']});let request;
 const headersReceived=new Promise(resolve=>f.link.server.once('request',resolve));
 const response=new Promise((resolve,reject)=>{request=http.request(f.code.endpoint+'/v1/poll',{method:'POST',headers:{Authorization:'Bearer '+f.code.token,'Content-Type':'application/json','X-Codex-Gauge':'1',Origin:f.link.origin,'Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});request.on('error',reject);});
 request.write(body.slice(0,1));await headersReceived;const code=JSON.parse(await f.link.resetPairing());request.end(body.slice(1));assert.equal(await response,409);assert.equal(f.link.profile.clientRef,null);
 assert.equal((await f.post('/v1/poll',{clientId:crypto.randomUUID(),configured:[]},{code})).status,200);
});
test('saved page readings reload offline until a new authenticated observation arrives; disabling is transactional',async t=>{
 const f=await fixture(t);await f.reading();const restored=new CreditCenter(f.dir,{home:f.dir,env:{}});assert.equal(restored.records[0].status,'offline');assert.equal(restored.records[0].pools[0].amount,42);
 const save=f.link.save;f.link.save=()=>{throw Error('storage_failed');};assert.throws(()=>f.link.disable(),/storage_failed/);assert.equal(f.link.state().enabled,true);f.link.save=save;f.link.disable();assert.equal(f.link.state().enabled,false);assert.equal(f.center.records[0].status,'offline');
});
test('extension permissions are site-optional, with no cookie, debugger or browsing-history access',()=>{
 assert.deepEqual(manifest.optional_host_permissions.sort(),['https://app.tapnow.ai/*','https://ideogram.ai/*'].sort());assert.deepEqual(manifest.host_permissions,['http://127.0.0.1/*']);for(const p of ['cookies','debugger','history','webRequest','tabs'])assert.ok(!manifest.permissions.includes(p));assert.equal(manifest.externally_connectable,undefined);
 const files=['worker.js','reader.js','popup.js'].map(f=>fs.readFileSync(path.join(__dirname,'../browser-extension',f),'utf8')).join('\n');assert.doesNotMatch(files,/document\.cookie|chrome\.cookies|window\.localStorage|sessionStorage|XMLHttpRequest|webRequest|eval\(/);
});

const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'../browser-extension'),worker=fs.readFileSync(path.join(root,'worker.js'),'utf8'),reader=fs.readFileSync(path.join(root,'reader.js'),'utf8');
const pause=()=>new Promise(r=>setImmediate(r));
function runtime({hold=false,paused=false,manual=false,url='https://app.tapnow.ai/home',failPair=false,unselected=false}={}){
 const local={pair:{version:1,endpoint:'http://127.0.0.1:12345',token:'x'.repeat(43)},clientId:'12345678-1234-4234-8234-123456789abc',selections:{tapnow:{balance:'#balance',marker:'#marker',url:'https://app.tapnow.ai/home'}}},session={owned:{tapnow:{id:99}}},updated=new Set(),calls={reload:[],scripts:[],requests:[]};let alarm,onMessage,onRemove,release,entered;
 const injection=new Promise(r=>entered=r),held=new Promise(r=>release=r),area=data=>({async get(keys){const names=typeof keys==='string'?[keys]:keys;return Object.fromEntries(names.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]));},async set(value){Object.assign(data,value);},async remove(keys){for(const k of keys)delete data[k];}});
 const chrome={i18n:{getUILanguage:()=> 'en'},storage:{local:area(local),session:area(session)},alarms:{create(){},onAlarm:{addListener:f=>alarm=f}},runtime:{id:'sample-extension',onMessage:{addListener:f=>onMessage=f}},tabs:{onUpdated:{addListener:f=>updated.add(f),removeListener:f=>updated.delete(f)},onRemoved:{addListener:f=>onRemove=f},async get(id){assert.equal(id,99);return{id,url};},async reload(id){calls.reload.push(id);queueMicrotask(()=>{for(const f of updated)f(id,{status:'complete'});});}},scripting:{async executeScript(data){calls.scripts.push(data.target.tabId);entered();if(hold)await held;return[{result:{balance:'0',marker:'Sample account'}}];}}};
 if(unselected)local.selections={};
 let context;const sandbox={chrome,crypto:webcrypto,URL,AbortSignal,setTimeout,clearTimeout,queueMicrotask,console,fetch:async(endpoint,options)=>{assert.ok(endpoint.startsWith('http://127.0.0.1:12345/'));assert.equal(options.credentials,'omit');const body=JSON.parse(options.body);calls.requests.push({endpoint,body});if(failPair&&options.headers.Authorization!=='Bearer '+'x'.repeat(43))throw Error('offline');return{ok:true,json:async()=>endpoint.endsWith('/v1/poll')?{boot:'sample-boot',paused,commands:[{provider:'tapnow',id:'command-one',manual}]}:{ok:true}};},importScripts(){vm.runInContext(reader,context);}};context=vm.createContext(sandbox);vm.runInContext(worker,context);
 return{local,session,calls,injection,release,tick:()=>alarm({name:'gauge-poll'}),remove:id=>onRemove(id),send:m=>new Promise(resolve=>onMessage(m,{id:'sample-extension'},resolve))};
}
test('manual reads cannot reload the dedicated tab while a scheduled read is in progress',async()=>{
 const r=runtime({hold:true});r.tick();await r.injection;assert.equal((await r.send({type:'state'})).busy,true);const second=await r.send({type:'read',provider:'tapnow'});assert.equal(second.ok,false);assert.equal(second.error,'busy');assert.deepEqual(r.calls.reload,[99]);r.release();for(let i=0;i<4;i++)await pause();assert.equal(r.calls.requests.filter(x=>x.endpoint.endsWith('/v1/reading')).length,1);assert.equal((await r.send({type:'state'})).busy,false);
});
test('only a dedicated tab at the selected provider path can be reloaded or read',async()=>{
 for(const url of ['https://other.example/','https://app.tapnow.ai/canvas/user-work']){const r=runtime({url});await r.send({type:'read',provider:'tapnow'});assert.equal(r.calls.reload.length,0);assert.equal(r.calls.scripts.length,0);assert.ok(r.calls.requests.some(x=>x.endpoint.endsWith('/v1/failure')));}
});
test('paused automatic commands do not execute while explicitly manual commands remain possible',async()=>{
 const p=runtime({paused:true});p.tick();for(let i=0;i<4;i++)await pause();assert.equal(p.calls.reload.length,0);
 const m=runtime({paused:true,manual:true});m.tick();await m.injection;for(let i=0;i<4;i++)await pause();assert.deepEqual(m.calls.reload,[99]);
});
test('closing unrelated user tabs is ignored; closing an owned tab immediately reports its absence',async()=>{
 const r=runtime();await r.remove(1);assert.equal(r.calls.requests.length,0);await r.remove(99);const poll=r.calls.requests.at(-1);assert.ok(poll.endpoint.endsWith('/v1/poll'));assert.deepEqual(poll.body.configured,[]);
});
test('a failed new pairing preserves the prior working local pairing',async()=>{
 const r=runtime({failPair:true}),old=r.local.pair;const response=await r.send({type:'pair',code:JSON.stringify({...old,token:'y'.repeat(43)})});assert.equal(response.ok,false);assert.equal(r.local.pair.token,old.token);assert.equal(r.local.clientId,'12345678-1234-4234-8234-123456789abc');
});
test('an owned TapNow home page is readable without custom selectors and uses its fixed menu reader',async()=>{
 const r=runtime({unselected:true});await r.send({type:'read',provider:'tapnow'});
 assert.deepEqual(r.calls.requests.find(x=>x.endpoint.endsWith('/v1/poll')).body.configured,['tapnow']);
 assert.deepEqual(r.calls.reload,[99]);assert.deepEqual(r.calls.scripts,[99]);
 const observation=r.calls.requests.find(x=>x.endpoint.endsWith('/v1/reading'));assert.ok(observation);assert.equal(observation.body.amount,0);
 const state=await r.send({type:'state'});assert.equal(state.providers.find(p=>p.id==='tapnow').automatic,true);
});

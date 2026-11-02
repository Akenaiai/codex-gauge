const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const root=path.join(__dirname,'../browser-extension'),worker=fs.readFileSync(path.join(root,'worker.js'),'utf8'),reader=fs.readFileSync(path.join(root,'reader.js'),'utf8');
const pause=()=>new Promise(r=>setImmediate(r));
function runtime({hold=false,paused=false,manual=false,url='https://app.tapnow.ai/home',failPair=false,unselected=false,existingAlarm=true,permitted=true,discarded=false,normalTab=false}={}){
 const local={pair:{version:1,endpoint:'http://127.0.0.1:12345',token:'x'.repeat(43)},clientId:'12345678-1234-4234-8234-123456789abc',selections:{tapnow:{balance:'#balance',marker:'#marker',url:'https://app.tapnow.ai/home'}}},session={owned:{tapnow:{id:99}}},updated=new Set(),calls={reload:[],scripts:[],requests:[]};let alarm,onMessage,onRemove,release,entered;
 let clock=Date.now(),delaySettings=false,releaseSettings;const timers=new Set();const schedule=(fn,ms)=>{const timer={fn,at:clock+ms,cancelled:false};if(ms<=5000)queueMicrotask(()=>{if(!timer.cancelled)fn();});else timers.add(timer);return timer;},unschedule=timer=>{if(timer){timer.cancelled=true;timers.delete(timer);}};
 const injection=new Promise(r=>entered=r),held=new Promise(r=>release=r),area=data=>({async get(keys){const names=typeof keys==='string'?[keys]:keys,value=Object.fromEntries(names.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]]));if(data===local&&delaySettings)return new Promise(resolve=>releaseSettings=()=>{delaySettings=false;resolve(value);});return value;},async set(value){Object.assign(data,value);},async remove(keys){for(const k of keys)delete data[k];}});
 const available=new Map([[99,{id:99,url,status:'complete',discarded}]]);if(normalTab)session.owned={};let onActivate;
 calls.alarms=[];const chrome={permissions:{async contains(){return permitted;}},i18n:{getUILanguage:()=> 'en'},storage:{local:area(local),session:area(session)},alarms:{async get(){return existingAlarm?{name:'gauge-poll',periodInMinutes:0.5}:undefined;},create(name,options){calls.alarms.push({name,options});},onAlarm:{addListener:f=>alarm=f}},runtime:{id:'sample-extension',onMessage:{addListener:f=>onMessage=f}},tabs:{onActivated:{addListener:f=>onActivate=f},onUpdated:{addListener:f=>updated.add(f),removeListener:f=>updated.delete(f)},onRemoved:{addListener:f=>onRemove=f},async query(options){assert.equal(options.url,'https://app.tapnow.ai/*');return [...available.values()];},async get(id){if(!available.has(id))throw Error('closed');return available.get(id);},async reload(id){calls.reload.push(id);queueMicrotask(()=>{for(const f of updated)f(id,{status:'complete'},available.get(id));});}},scripting:{async executeScript(data){if(data.func.name==='gaugeTapNowFinish'){calls.cleanup=(calls.cleanup||0)+1;return[];}calls.scripts.push(data.target.tabId);entered();if(hold)await held;return[{result:{balance:'0',marker:'Sample account'}}];}}};
 if(unselected)local.selections={};
 let context;const sandbox={chrome,crypto:webcrypto,URL,AbortSignal,Date:{now:()=>clock},setTimeout:schedule,clearTimeout:unschedule,queueMicrotask,console,fetch:async(endpoint,options)=>{assert.ok(endpoint.startsWith('http://127.0.0.1:12345/'));assert.equal(options.credentials,'omit');const body=JSON.parse(options.body);calls.requests.push({endpoint,body});if(failPair&&options.headers.Authorization!=='Bearer '+'x'.repeat(43))throw Error('offline');return{ok:true,json:async()=>endpoint.endsWith('/v1/poll')?{boot:'sample-boot',paused,commands:[{provider:'tapnow',id:'command-one',manual}]}:{ok:true}};},importScripts(){vm.runInContext(reader,context);}};context=vm.createContext(sandbox);vm.runInContext(worker,context);
 return{local,session,calls,injection,release,available,activate:()=>onActivate({tabId:99}),tick:()=>alarm({name:'gauge-poll'}),remove:id=>{available.delete(id);return onRemove(id);},delaySettings:()=>{delaySettings=true;},releaseSettings:()=>releaseSettings(),deadlineReading:()=>{const deadline=clock+55000;return context.within(()=>context.send('/v1/reading',{provider:'tapnow',amount:42,marker:'Sample team'},{deadline}),deadline);},advance:ms=>{clock+=ms;for(const t of [...timers])if(t.at<=clock&&!t.cancelled){timers.delete(t);t.fn();}},send:m=>new Promise(resolve=>onMessage(m,{id:'sample-extension'},resolve))};
}
test('manual reads cannot duplicate a scheduled TapNow observation',async()=>{
 const r=runtime({hold:true});r.tick();await r.injection;assert.equal((await r.send({type:'state'})).busy,true);const second=await r.send({type:'read',provider:'tapnow'});assert.equal(second.ok,false);assert.equal(second.error,'busy');assert.deepEqual(r.calls.reload,[]);r.release();for(let i=0;i<4;i++)await pause();assert.equal(r.calls.requests.filter(x=>x.endpoint.endsWith('/v1/reading')).length,1);assert.equal((await r.send({type:'state'})).busy,false);
});
test('TapNow refuses scripts on other origins and working canvas routes',async()=>{
 for(const url of ['https://other.example/','https://app.tapnow.ai/canvas/user-work']){const r=runtime({url});await r.send({type:'read',provider:'tapnow'});assert.equal(r.calls.reload.length,0);assert.equal(r.calls.scripts.length,0);assert.ok(r.calls.requests.some(x=>x.endpoint.endsWith('/v1/failure')));}
});
test('paused automatic commands do not execute while explicitly manual commands remain possible',async()=>{
 const p=runtime({paused:true});p.tick();for(let i=0;i<4;i++)await pause();assert.equal(p.calls.reload.length,0);
 const m=runtime({paused:true,manual:true});m.tick();await m.injection;for(let i=0;i<4;i++)await pause();assert.deepEqual(m.calls.reload,[]);
});
test('closing unrelated tabs preserves availability; closing the last TapNow home reports absence',async()=>{
 const r=runtime();await r.remove(1);assert.deepEqual(r.calls.requests.at(-1).body.configured,['tapnow']);await r.remove(99);const poll=r.calls.requests.at(-1);assert.ok(poll.endpoint.endsWith('/v1/poll'));assert.deepEqual(poll.body.configured,[]);
});
test('a failed new pairing preserves the prior working local pairing',async()=>{
 const r=runtime({failPair:true}),old=r.local.pair;const response=await r.send({type:'pair',code:JSON.stringify({...old,token:'y'.repeat(43)})});assert.equal(response.ok,false);assert.equal(r.local.pair.token,old.token);assert.equal(r.local.clientId,'12345678-1234-4234-8234-123456789abc');
});
test('a TapNow home page is readable without custom selectors and uses its fixed menu reader',async()=>{
 const r=runtime({unselected:true});await r.send({type:'read',provider:'tapnow'});
 assert.deepEqual(r.calls.requests.find(x=>x.endpoint.endsWith('/v1/poll')).body.configured,['tapnow']);
 assert.deepEqual(r.calls.reload,[]);assert.ok(r.calls.scripts.length>0);assert.ok(r.calls.scripts.every(id=>id===99));
 const observation=r.calls.requests.find(x=>x.endpoint.endsWith('/v1/reading'));assert.ok(observation);assert.equal(observation.body.amount,0);
 const state=await r.send({type:'state'});assert.equal(state.providers.find(p=>p.id==='tapnow').automatic,true);
});
test('a stalled page script does not stop heartbeat polling or start duplicate reloads',async()=>{
 const r=runtime({hold:true});r.tick();await r.injection;r.tick();r.tick();for(let i=0;i<4;i++)await pause();
 assert.equal(r.calls.requests.filter(x=>x.endpoint.endsWith('/v1/poll')).length,3);assert.deepEqual(r.calls.reload,[]);assert.equal((await r.send({type:'state'})).busy,true);r.release();
});
test('an expired script releases busy, ignores its late result, and lets a later scheduled read recover',async()=>{
 const r=runtime({hold:true});r.tick();await r.injection;r.advance(55001);for(let i=0;i<6;i++)await pause();
 assert.equal((await r.send({type:'state'})).busy,false);assert.equal(r.calls.requests.filter(x=>x.endpoint.endsWith('/v1/reading')).length,0);
 r.release();for(let i=0;i<4;i++)await pause();assert.equal(r.calls.requests.filter(x=>x.endpoint.endsWith('/v1/reading')).length,0);
 r.tick();for(let i=0;i<8;i++)await pause();assert.equal(r.calls.requests.filter(x=>x.endpoint.endsWith('/v1/reading')).length,1);
});
test('worker wakeups preserve an existing alarm and create only a missing poll alarm',async()=>{
 const existing=runtime();await pause();assert.equal(existing.calls.alarms.length,0);
 const missing=runtime({existingAlarm:false});await pause();assert.equal(missing.calls.alarms.length,1);assert.equal(missing.calls.alarms[0].name,'gauge-poll');
});
test('a delayed settings lookup cannot send a reading after the operation deadline',async()=>{
 const r=runtime();r.delaySettings();const task=r.deadlineReading();task.catch(()=>{});await pause();r.advance(55001);await assert.rejects(task,/timeout/);r.releaseSettings();for(let i=0;i<4;i++)await pause();assert.equal(r.calls.requests.filter(x=>x.endpoint.endsWith('/v1/reading')).length,0);
});
test('a normally opened TapNow home is discovered without an owned tab and never reloaded',async()=>{
 const r=runtime({normalTab:true,unselected:true});await r.send({type:'read',provider:'tapnow'});
 assert.ok(r.calls.requests.some(x=>x.endpoint.endsWith('/v1/reading')));assert.deepEqual(r.calls.reload,[]);assert.equal(r.calls.cleanup,1);assert.deepEqual(r.session.owned,{});
});
test('missing permission, no page and discarded pages never inject scripts or wake a page',async()=>{
 for(const options of [{permitted:false},{discarded:true}]){const r=runtime(options);await r.send({type:'read',provider:'tapnow'});assert.deepEqual(r.calls.requests[0].body.configured,[]);assert.deepEqual(r.calls.scripts,[]);assert.deepEqual(r.calls.reload,[]);}
 const r=runtime({normalTab:true});await r.remove(99);await r.send({type:'read',provider:'tapnow'});assert.deepEqual(r.calls.scripts,[]);assert.deepEqual(r.calls.requests[0].body.configured,[]);
});
test('activation requests an automatic observation, not a manual bypass of pause',async()=>{
 const r=runtime({normalTab:true,paused:true});r.activate();for(let i=0;i<6;i++)await pause();assert.equal(r.calls.requests[0].body.refreshProvider,'tapnow');assert.equal(r.calls.requests[0].body.manualProvider,undefined);assert.deepEqual(r.calls.scripts,[]);
});

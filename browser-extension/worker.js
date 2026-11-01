importScripts('reader.js');
const sites={tapnow:'https://app.tapnow.ai/home',ideogram:'https://ideogram.ai/'};let busy=false;
const zh=()=>chrome.i18n.getUILanguage().startsWith('zh'),message=(c,e)=>zh()?c:e;
async function settings(){return{...(await chrome.storage.local.get(['pair','clientId','selections','lastError']))};}
async function owned(){return(await chrome.storage.session.get('owned')).owned||{};}
function allowed(provider,url){try{const u=new URL(url);return u.protocol==='https:'&&u.origin===new URL(sites[provider]).origin;}catch{return false;}}
function canonical(url){const u=new URL(url);return u.origin+u.pathname;}
function safeHome(provider,url){if(!allowed(provider,url))return false;const u=new URL(url);return!u.search&&!u.hash&&(provider==='tapnow'?u.pathname==='/home':['/','/t/explore','/explore','/home'].includes(u.pathname));}
async function send(route,data,{deadline=Date.now()+15000}={}){const s=await within(settings,deadline);if(!s.pair)throw Error('not_paired');if(Date.now()>=deadline)throw Error('timeout');const r=await within(()=>fetch(s.pair.endpoint+route,{method:'POST',headers:{Authorization:'Bearer '+s.pair.token,'Content-Type':'application/json','X-Codex-Gauge':'1'},body:JSON.stringify({clientId:s.clientId,...data}),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now())))}),deadline);if(!r.ok)throw Error('bridge_unavailable');return within(()=>r.json(),deadline);}
async function poll(manualProvider){const deadline=Date.now()+15000,[s,tabs]=await within(()=>Promise.all([settings(),owned()]),deadline);return send('/v1/poll',{configured:Object.keys(sites).filter(id=>tabs[id]&&(id==='tapnow'||s.selections?.[id])),...(manualProvider?{manualProvider}:{})},{deadline});}
async function fail(provider,error,commandId,boot){const deadline=Date.now()+10000;await send('/v1/failure',{boot,provider,error,commandId},{deadline}).catch(()=>{});}
async function within(operation,deadline){
 const left=deadline-Date.now();if(left<=0)throw Error('timeout');let timer;
 try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),left);})]);}finally{clearTimeout(timer);}
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function setError(error){await within(()=>chrome.storage.local.set({lastError:error}),Date.now()+5000).catch(()=>{});}
async function tapNowValue(target,deadline,reload){
 if(reload)await within(()=>wait(5000),deadline);let anchor=null,previous=null,count=0;
 for(let i=0;i<32;i++){
  const results=await within(()=>chrome.scripting.executeScript({target:{tabId:target.id},func:gaugeTapNowStep,args:[anchor,deadline]}),deadline),value=results[0]?.result;
  if(value?.expired)throw Error('timeout');if(value?.marker){if(anchor&&value.marker!==anchor)throw Error('selection_changed');anchor=value.marker;}
  const next=value?.balance!=null?{balance:value.balance,marker:value.marker}:null;
  if(next&&JSON.stringify(next)===JSON.stringify(previous))count++;else count=0;previous=next;
  if(next&&count>=2)return next;await within(()=>wait(500),deadline);
 }
 throw Error('selection_changed');
}
async function read(provider,commandId,boot,reload=true){
 const deadline=Date.now()+55000;
 try{
  const[tabs,s]=await within(()=>Promise.all([owned(),settings()]),deadline),target=tabs[provider],selection=s.selections?.[provider],automatic=provider==='tapnow';if(!target||!automatic&&!selection)throw Error('page_closed');
  let tab=await within(()=>chrome.tabs.get(target.id),deadline);if(!safeHome(provider,tab.url)||!automatic&&canonical(tab.url)!==selection.url)throw Error(/login|sign.?in|auth/i.test(tab.url)?'login_required':'page_closed');
  if(reload)await within(()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(Error('timeout'));},Math.min(35000,deadline-Date.now()));function listener(id,info){if(id===target.id&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve();}}chrome.tabs.onUpdated.addListener(listener);chrome.tabs.reload(target.id).catch(e=>{clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);reject(e);});}),deadline);
  tab=await within(()=>chrome.tabs.get(target.id),deadline);if(!safeHome(provider,tab.url)||!automatic&&canonical(tab.url)!==selection.url)throw Error(/login|sign.?in|auth/i.test(tab.url)?'login_required':'page_closed');
  const value=automatic?await tapNowValue(target,deadline,reload):(await within(()=>chrome.scripting.executeScript({target:{tabId:target.id},func:gaugeRead,args:[selection,reload,deadline,selection.url]}),deadline))[0]?.result;
  if(value?.expired)throw Error('timeout');const amount=gaugeAmount(value?.balance);
  const after=await within(()=>chrome.tabs.get(target.id),deadline);if(!safeHome(provider,after.url)||!automatic&&canonical(after.url)!==selection.url)throw Error('page_closed');
  await send('/v1/reading',{boot,provider,amount,marker:value.marker,observedAt:Date.now(),commandId},{deadline});await setError(null);
 }catch(e){await fail(provider,['page_closed','login_required'].includes(e.message)?e.message:'selection_changed',commandId,boot);await setError(e.message);}
}
async function tick(){if(busy){await poll().catch(()=>{});return;}busy=true;try{const d=await poll();await Promise.allSettled((d.commands||[]).filter(c=>!d.paused||c.manual).map(c=>read(c.provider,c.id,d.boot,true)));}catch(e){await setError(e.message);}finally{busy=false;}}
chrome.alarms.get('gauge-poll').then(alarm=>{if(!alarm)return chrome.alarms.create('gauge-poll',{periodInMinutes:0.5});}).catch(()=>setError('alarm_unavailable'));chrome.alarms.onAlarm.addListener(a=>{if(a.name==='gauge-poll')tick();});
chrome.tabs.onRemoved.addListener(async id=>{const tabs=await owned();let changed=false;for(const[p,t]of Object.entries(tabs))if(t.id===id){delete tabs[p];changed=true;}if(changed){await chrome.storage.session.set({owned:tabs});await poll().catch(()=>{});}});
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 (async()=>{
  if(m.type==='state'){const s=await settings(),tabs=await owned();return{paired:!!s.pair,busy,lastError:s.lastError||null,providers:Object.keys(sites).map(id=>({id,opened:!!tabs[id],selected:!!s.selections?.[id],automatic:id==='tapnow'}))};}
  if(m.type==='pair'){
   const p=JSON.parse(m.code);if(p.version!==1||Object.keys(p).sort().join(',')!=='endpoint,token,version'||!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(p.endpoint)||!Number.isInteger(Number(new URL(p.endpoint).port))||!/^[A-Za-z0-9_-]{43}$/.test(p.token))throw Error('invalid_pair');
   if(busy)throw Error('busy');const old=await settings();await chrome.storage.local.set({pair:p,clientId:old.clientId||crypto.randomUUID(),lastError:null});try{await poll();}catch(e){if(old.pair)await chrome.storage.local.set({pair:old.pair,clientId:old.clientId});else await chrome.storage.local.remove(['pair','clientId']);throw e;}return{ok:true};
  }
  if(!Object.hasOwn(sites,m.provider))throw Error('invalid_provider');
  if(m.type==='open'){
   const tabs=await owned(),prior=tabs[m.provider];if(prior)try{await chrome.tabs.update(prior.id,{active:true});return{ok:true};}catch{}
   const tab=await chrome.tabs.create({url:sites[m.provider],active:true});tabs[m.provider]={id:tab.id};await chrome.storage.session.set({owned:tabs});return{ok:true};
  }
  if(m.type==='pick'){
   if(busy)throw Error('busy');busy=true;try{
    const deadline=Date.now()+90000,target=(await within(owned,deadline))[m.provider];if(!target)throw Error('page_closed');let tab=await within(()=>chrome.tabs.get(target.id),deadline);if(!safeHome(m.provider,tab.url))throw Error('login_required');
    const expectedURL=canonical(tab.url);await within(()=>chrome.tabs.update(target.id,{active:true}),deadline);const labels={balance:message('① 点击完整的余额数字，Esc 取消','① Click the full credit balance. Esc cancels.'),marker:message('② 点击可见的账户或团队标识，Esc 取消','② Click the visible account or team marker. Esc cancels.')};
    const balance=(await within(()=>chrome.scripting.executeScript({target:{tabId:target.id},func:gaugePick,args:['balance',labels,deadline,expectedURL]}),deadline))[0]?.result;gaugeAmount(balance?.preview);
    const marker=(await within(()=>chrome.scripting.executeScript({target:{tabId:target.id},func:gaugePick,args:['marker',labels,deadline,expectedURL]}),deadline))[0]?.result;if(!marker?.preview?.trim())throw Error('selection_changed');
    tab=await within(()=>chrome.tabs.get(target.id),deadline);if(!safeHome(m.provider,tab.url))throw Error('page_closed');const s=await within(settings,deadline);await within(()=>chrome.storage.local.set({selections:{...(s.selections||{}),[m.provider]:{balance:balance.selector,marker:marker.selector,url:canonical(tab.url)}},lastError:null}),deadline);const d=await poll(m.provider),command=d.commands.find(c=>c.provider===m.provider);if(!command)throw Error('busy');await read(m.provider,command.id,d.boot,false);return{ok:true};
   }finally{busy=false;}
  }
  if(m.type==='read'){if(busy)throw Error('busy');busy=true;try{const d=await poll(m.provider),command=d.commands.find(c=>c.provider===m.provider);if(!command)throw Error('busy');await read(m.provider,command.id,d.boot,true);return{ok:true};}finally{busy=false;}}
  throw Error('invalid_action');
 })().then(respond).catch(e=>{setError(e.message);respond({ok:false,error:e.message});});return true;
});

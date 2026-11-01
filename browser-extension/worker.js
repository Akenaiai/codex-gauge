importScripts('reader.js');
const sites={tapnow:'https://app.tapnow.ai/home',ideogram:'https://ideogram.ai/'};let busy=false;
const zh=()=>chrome.i18n.getUILanguage().startsWith('zh'),message=(c,e)=>zh()?c:e;
async function settings(){return{...(await chrome.storage.local.get(['pair','clientId','selections','lastError']))};}
async function owned(){return(await chrome.storage.session.get('owned')).owned||{};}
function allowed(provider,url){try{const u=new URL(url);return u.protocol==='https:'&&u.origin===new URL(sites[provider]).origin;}catch{return false;}}
function canonical(url){const u=new URL(url);return u.origin+u.pathname;}
function safeHome(provider,url){if(!allowed(provider,url))return false;const u=new URL(url);return!u.search&&!u.hash&&(provider==='tapnow'?u.pathname==='/home':['/','/t/explore','/explore','/home'].includes(u.pathname));}
async function send(route,data){const s=await settings();if(!s.pair)throw Error('not_paired');const r=await fetch(s.pair.endpoint+route,{method:'POST',headers:{Authorization:'Bearer '+s.pair.token,'Content-Type':'application/json','X-Codex-Gauge':'1'},body:JSON.stringify({clientId:s.clientId,...data}),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('bridge_unavailable');return r.json();}
async function poll(manualProvider){const s=await settings(),tabs=await owned();return send('/v1/poll',{configured:Object.keys(sites).filter(id=>tabs[id]&&(id==='tapnow'||s.selections?.[id])),...(manualProvider?{manualProvider}:{})});}
async function fail(provider,error,commandId,boot){await send('/v1/failure',{boot,provider,error,commandId}).catch(()=>{});}
async function read(provider,commandId,boot,reload=true){
 const tabs=await owned(),s=await settings(),target=tabs[provider],selection=s.selections?.[provider],automatic=provider==='tapnow';if(!target||!automatic&&!selection)return fail(provider,'page_closed',commandId,boot);
 try{
  let tab=await chrome.tabs.get(target.id);if(!safeHome(provider,tab.url)||!automatic&&canonical(tab.url)!==selection.url)throw Error(/login|sign.?in|auth/i.test(tab.url)?'login_required':'page_closed');
  if(reload){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(listener);reject(Error('selection_changed'));},45000);function listener(id,info){if(id===target.id&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);resolve();}}chrome.tabs.onUpdated.addListener(listener);chrome.tabs.reload(target.id).catch(e=>{clearTimeout(timer);chrome.tabs.onUpdated.removeListener(listener);reject(e);});});}
  tab=await chrome.tabs.get(target.id);if(!safeHome(provider,tab.url)||!automatic&&canonical(tab.url)!==selection.url)throw Error(/login|sign.?in|auth/i.test(tab.url)?'login_required':'page_closed');
  const results=await chrome.scripting.executeScript({target:{tabId:target.id},func:automatic?gaugeTapNowRead:gaugeRead,args:automatic?[reload]:[selection,reload]});const value=results[0]?.result,amount=gaugeAmount(value?.balance);
  const after=await chrome.tabs.get(target.id);if(!safeHome(provider,after.url)||!automatic&&canonical(after.url)!==selection.url)throw Error('page_closed');
  await send('/v1/reading',{boot,provider,amount,marker:value.marker,observedAt:Date.now(),commandId});await chrome.storage.local.set({lastError:null});
 }catch(e){await fail(provider,['page_closed','login_required'].includes(e.message)?e.message:'selection_changed',commandId,boot);await chrome.storage.local.set({lastError:e.message});}
}
async function tick(){if(busy)return;busy=true;try{const d=await poll();await Promise.allSettled((d.commands||[]).filter(c=>!d.paused||c.manual).map(c=>read(c.provider,c.id,d.boot,true)));}catch(e){await chrome.storage.local.set({lastError:e.message});}finally{busy=false;}}
chrome.alarms.create('gauge-poll',{periodInMinutes:0.5});chrome.alarms.onAlarm.addListener(a=>{if(a.name==='gauge-poll')tick();});
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
    const target=(await owned())[m.provider];if(!target)throw Error('page_closed');let tab=await chrome.tabs.get(target.id);if(!safeHome(m.provider,tab.url))throw Error('login_required');
    await chrome.tabs.update(target.id,{active:true});const labels={balance:message('① 点击完整的余额数字，Esc 取消','① Click the full credit balance. Esc cancels.'),marker:message('② 点击可见的账户或团队标识，Esc 取消','② Click the visible account or team marker. Esc cancels.')};
    const balance=(await chrome.scripting.executeScript({target:{tabId:target.id},func:gaugePick,args:['balance',labels]}))[0]?.result;gaugeAmount(balance?.preview);
    const marker=(await chrome.scripting.executeScript({target:{tabId:target.id},func:gaugePick,args:['marker',labels]}))[0]?.result;if(!marker?.preview?.trim())throw Error('selection_changed');
    tab=await chrome.tabs.get(target.id);if(!safeHome(m.provider,tab.url))throw Error('page_closed');const s=await settings();await chrome.storage.local.set({selections:{...(s.selections||{}),[m.provider]:{balance:balance.selector,marker:marker.selector,url:canonical(tab.url)}},lastError:null});const d=await poll(m.provider),command=d.commands.find(c=>c.provider===m.provider);if(!command)throw Error('busy');await read(m.provider,command.id,d.boot,false);return{ok:true};
   }finally{busy=false;}
  }
  if(m.type==='read'){if(busy)throw Error('busy');busy=true;try{const d=await poll(m.provider),command=d.commands.find(c=>c.provider===m.provider);if(!command)throw Error('busy');await read(m.provider,command.id,d.boot,true);return{ok:true};}finally{busy=false;}}
  throw Error('invalid_action');
 })().then(respond).catch(e=>{chrome.storage.local.set({lastError:e.message});respond({ok:false,error:e.message});});return true;
});

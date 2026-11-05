(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.creativeExpiry=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const DEFAULT_THRESHOLD=100;
  const providers=new Set(['xyq','jimeng','lovart','runway','kling','recraft','ideogram','tapnow','suno','chatcut','adobe','canva','comfy-local','minimax']);
  const isCreative=provider=>providers.has(provider);
  const validThreshold=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12;
  function clean(input={},now=Date.now()){
    const thresholds={},dismissed={};
    for(const [id,value]of Object.entries(input?.thresholds||{}))if(isCreative(id)&&validThreshold(value))thresholds[id]=value;
    for(const [key,until]of Object.entries(input?.dismissed||{}).slice(-500))if(key.length<=500&&Number.isFinite(until)&&until>now)dismissed[key]=until;
    return{thresholds,dismissed};
  }
  const threshold=(provider,preferences={})=>validThreshold(preferences?.thresholds?.[provider])?preferences.thresholds[provider]:DEFAULT_THRESHOLD;
  // A batch is scoped to the account, pool and expiry, never to a provider alone.
  const batchKey=e=>JSON.stringify([e.provider,e.recordId,e.poolId,e.dateOnly?e.onDate:e.at]);
  function allows(event,preferences={},now=Date.now()){
    if(!isCreative(event.provider))return true;
    if(preferences?.dismissed?.[batchKey(event)]>now)return false;
    if(event.unit==='credits'||event.unit==null)return Number.isFinite(event.amount)&&event.amount>threshold(event.provider,preferences);
    return Number.isFinite(event.amount)&&event.amount>0;
  }
  function stage(time){return time?.near?(time.critical?'critical':(time.dateOnly?time.days<=3:time.remaining<=3*86400000)?'soon':'watch'):null;}
  function shouldNotify(event,preferences={},now=Date.now()){
    const expiry=event.kind==='expiry'||event.scheduleKind==='expiry';
    if(!expiry||!isCreative(event.provider))return true;
    return allows(event,preferences,now)&&(event.dateOnly?event.days>=0&&event.days<=3:event.at>now&&event.at-now<=3*86400000);
  }
  return{DEFAULT_THRESHOLD,isCreative,validThreshold,clean,threshold,batchKey,allows,stage,shouldNotify};
});

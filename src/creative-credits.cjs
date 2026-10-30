'use strict';
const {analyze}=require('./ui/credit-overview.js');
const {timing,selectDates,priorityExpiry}=require('./ui/creative-timing.js');
const media={xyq:['image','video'],jimeng:['image','video'],lovart:['image','video'],runway:['image','video'],tapnow:['image','video'],suno:['music'],chatcut:['video'],adobe:['image','video'],canva:['image','video'],'comfy-local':['image','video']};
const download=p=>p.resource==='downloads'||/download|下载/i.test(p.id+' '+p.label+' '+p.labelEn);
function creativePool(provider,p){
  if(p.unit==='cards'||['CNY','USD','tokens'].includes(p.unit)||p.resource==='tools'||download(p))return false;
  if(provider==='minimax')return p.id==='video'&&p.entitlement!=='not_in_plan';
  return !!media[provider]&&!/^window\.|weekly|five_hour|5.hour/i.test(p.id);
}
function creativeSnapshot(state={},now=Date.now()){
  const rows=[];
  for(const tool of state.tools||[]){
    if(!media[tool.id]&&tool.id!=='minimax')continue;
    const records=(tool.records||[]).map(r=>({...r,pools:r.pools.filter(p=>creativePool(tool.id,p))})).filter(r=>r.pools.length);
    const kinds=media[tool.id]||['video'];
    if(tool.id==='minimax'&&!records.length)continue;
    if(!records.length&&!tool.userDates?.length&&!tool.dateObservations?.length&&!tool.connections?.some(c=>c.enabled&&c.evidence!=='cached'&&c.evidence!=='instructions'))continue;
    const allowedDate=e=>{
      if(download({id:e.poolId,label:e.label,labelEn:e.labelEn}))return false;
      if((tool.records||[]).some(r=>r.id===e.recordId))return records.some(r=>r.id===e.recordId&&r.pools.some(p=>p.id===e.poolId));
      return tool.id!=='minimax'||/video|视频/i.test(e.label+' '+e.labelEn);
    };
    // A media entitlement of a coding service is summarized independently.
    const view={...tool,id:tool.id==='minimax'?'creative-minimax':tool.id,records,webDates:(tool.webDates||[]).filter(allowedDate),recordedDates:(tool.recordedDates||[]).filter(allowedDate)};
    const row=analyze(view,state.rules||{},now);
    const dates=row.dates.filter(d=>!d.card),selected=selectDates(dates,now),expiry=priorityExpiry(dates,row.status,now);
    rows.push({id:tool.id,name:tool.name,kinds,status:row.status,amount:row.metric?.amount??null,unit:row.metric?.unit||'credits',label:row.metric?.label||null,labelEn:row.metric?.labelEn||null,
      fetchedAt:row.record?.fetchedAt||null,source:row.record?.source||null,account:row.record?.account||null,accountCount:row.accountCount,
      dates:[...new Set([expiry,selected.expiry,selected.reset,...dates].filter(Boolean))].slice(0,4),expiring:!!expiry,priorityExpiry:expiry,
      expiryNeedsCheck:!!expiry&&(row.status==='unknown'||expiry.stale||['web','user','user_schedule'].includes(expiry.source)||!!expiry.account&&expiry.account!==row.record?.account),
      expiryIsPrimary:!!expiry&&expiry.recordId===row.record?.id&&expiry.poolId===row.metric?.id,criticalExpiry:!!expiry&&timing(expiry,now).critical,querying:tool.querying===true,queryStatus:tool.queryStatus||null,urgent:row.urgent});
  }
  rows.sort((a,b)=>Number(b.expiring)-Number(a.expiring)||(a.expiring&&b.expiring?timing(a.priorityExpiry,now).order-timing(b.priorityExpiry,now).order:0)||({available:0,unknown:1,empty:2}[a.status]-{available:0,unknown:1,empty:2}[b.status])||a.name.localeCompare(b.name));
  return{rows,expiring:rows.filter(r=>r.expiring).length,available:rows.filter(r=>r.status==='available').length,empty:rows.filter(r=>r.status==='empty').length,unknown:rows.filter(r=>r.status==='unknown').length,enabled:state.enabled!==false,busy:rows.some(r=>r.querying)};
}
function creativeQueryTargets(state){const ids=(state.tools||[]).filter(t=>['xyq','jimeng','lovart','suno'].includes(t.id)&&t.queryReady).map(t=>t.id);if((state.tools||[]).some(t=>t.id==='minimax'&&t.records?.some(r=>r.pools.some(p=>creativePool('minimax',p)))))ids.push('relay');return ids;}
module.exports={creativeSnapshot,creativeQueryTargets,creativePool};

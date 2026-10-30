'use strict';
const {analyze}=require('./ui/credit-overview.js');
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
    rows.push({id:tool.id,name:tool.name,kinds,status:row.status,amount:row.metric?.amount??null,unit:row.metric?.unit||'credits',label:row.metric?.label||null,labelEn:row.metric?.labelEn||null,
      fetchedAt:row.record?.fetchedAt||null,source:row.record?.source||null,account:row.record?.account||null,accountCount:row.accountCount,
      dates:row.dates.filter(d=>!d.card).slice(0,4),querying:tool.querying===true,queryStatus:tool.queryStatus||null,urgent:row.urgent});
  }
  rows.sort((a,b)=>({available:0,empty:1,unknown:2}[a.status]-{available:0,empty:1,unknown:2}[b.status])||Number(b.urgent)-Number(a.urgent)||a.name.localeCompare(b.name));
  return{rows,available:rows.filter(r=>r.status==='available').length,empty:rows.filter(r=>r.status==='empty').length,unknown:rows.filter(r=>r.status==='unknown').length,enabled:state.enabled!==false,busy:rows.some(r=>r.querying)};
}
function creativeQueryTargets(state){const ids=(state.tools||[]).filter(t=>['xyq','jimeng','lovart','suno'].includes(t.id)&&t.queryReady).map(t=>t.id);if((state.tools||[]).some(t=>t.id==='minimax'&&t.records?.some(r=>r.pools.some(p=>creativePool('minimax',p)))))ids.push('relay');return ids;}
module.exports={creativeSnapshot,creativeQueryTargets,creativePool};

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.creditOverview=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const DAY=86400000,FRESH=5*60000;
  const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
  const card=p=>p.unit==='cards'||String(p.id).startsWith('card.');
  const toolsPool=p=>p.resource==='tools'||/工具|tool\s*requests|tool\s*quota/i.test(p.label+' '+p.labelEn);
  function effective(r,p,rules){const rule=rules?.[r.id+'/'+p.id]||r.rules?.[r.id+'/'+p.id];return rule?{...p,expiresAt:rule.expiresAt||p.expiresAt,resetsAt:rule.resetsAt||p.resetsAt}:p;}
  function fresh(r,now){return r.status==='ready'&&r.stale!==true&&finite(r.fetchedAt)&&r.fetchedAt<=now&&now-r.fetchedAt<FRESH;}
  function summarizeRecord(r,provider,rules,now){
    const pools=(r.pools||[]).map(p=>effective(r,p,rules));
    const eligible=pools.filter(p=>!card(p)&&!['not_in_plan','unknown'].includes(p.entitlement));
    const model=eligible.filter(p=>p.unit==='percent'&&!toolsPool(p)&&!(provider==='minimax'&&p.id==='video'));
    let metric=null,status='unknown';
    if(model.length){
      const known=model.filter(p=>finite(p.amount));metric=known.slice().sort((a,b)=>a.amount-b.amount)[0]||model[0];
      status=known.some(p=>p.amount===0)?'empty':known.length===model.length?'available':'unknown';
    }else if(!['codex','kimi','minimax','zai'].includes(provider)){
      const balances=eligible.filter(p=>p.unit!=='percent'),known=balances.filter(p=>finite(p.amount));
      const disjointCash=provider==='deepseek'&&balances.length===2&&balances.every(p=>['cny.granted','cny.purchased','usd.granted','usd.purchased'].includes(p.id))&&balances.every(p=>p.unit===balances[0].unit);
      if(disjointCash&&known.length){const active=known.filter(p=>!(p.amount>0&&p.expiresAt&&p.expiresAt<=now));metric={...known[0],amount:active.reduce((sum,p)=>sum+p.amount,0),expiresAt:null,resetsAt:null,label:'可用余额',labelEn:'Available balance',partial:known.length!==balances.length||active.length!==known.length};}
      else metric=known.filter(p=>p.amount>0).sort((a,b)=>['effective','team','monthly_plan'].includes(b.id)-['effective','team','monthly_plan'].includes(a.id))[0]||known[0]||balances[0];
      status=disjointCash?metric?.amount>0?'available':known.some(p=>p.amount>0&&p.expiresAt&&p.expiresAt<=now)?'unknown':balances.length&&known.length===balances.length?'empty':'unknown':known.some(p=>p.amount>0)?'available':balances.length&&known.length===balances.length?'empty':'unknown';
    }
    const elapsedPrimary=metric&&(metric.expiresAt&&metric.expiresAt<=now||metric.unit==='percent'&&model.some(p=>p.resetsAt&&p.resetsAt<=now));
    const isFresh=fresh(r,now);
    if(!isFresh||elapsedPrimary)status='unknown';
    const meter=metric?.unit==='percent'?metric.amount:metric?.id==='monthly_plan'&&finite(metric.amount)&&finite(metric.limit)&&metric.limit>0?Math.min(100,metric.amount/metric.limit*100):null;
    return{record:r,pools,metric,status,fresh:isFresh&&!elapsedPrimary,meter,reason:elapsedPrimary?'elapsed':!isFresh?'stale':status==='unknown'?'missing':null};
  }
  function deadlines(records,rules,now){
    const out=[];
    for(const r of records)for(const original of r.pools||[]){
      const p=effective(r,original,rules);
      if(finite(p.amount)&&p.amount>0&&p.expiresAt>now)out.push({kind:'expiry',at:p.expiresAt,label:p.label,labelEn:p.labelEn,recordId:r.id,poolId:p.id,account:r.account,card:card(p),stale:!fresh(r,now),near:p.expiresAt-now<=7*DAY,dateOnly:false});
      if(card(p)||p.entitlement==='not_in_plan'||toolsPool(p))continue;
      if(p.resetsAt>now)out.push({kind:'reset',at:p.resetsAt,label:p.resetLabel||p.label,labelEn:p.resetLabelEn||p.labelEn,recordId:r.id,poolId:p.id,account:r.account,stale:!fresh(r,now),near:p.resetsAt-now<=2*DAY,dateOnly:false,policy:p.resetSource==='policy'});
      else if(!p.resetsAt&&/^\d{4}-\d{2}-\d{2}$/.test(p.resetDate||'')){
        const today=new Date(now),local=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()),anchor=Date.parse(p.resetDate+'T12:00:00Z');
        if(anchor>=local)out.push({kind:'reset',at:anchor,onDate:p.resetDate,dateOnly:true,label:p.label,labelEn:p.labelEn,recordId:r.id,poolId:p.id,account:r.account,stale:!fresh(r,now),near:anchor-local<=2.5*DAY,policy:true});
      }
    }
    return out.sort((a,b)=>a.at-b.at);
  }
  function analyze(tool,rules={},now=Date.now()){
    const records=(tool.records||[]).filter(r=>r.status!=='account_changed'),summaries=records.map(r=>summarizeRecord(r,tool.id,rules,now));
    const ranked=summaries.slice().sort((a,b)=>({available:0,empty:1,unknown:2}[a.status]-{available:0,empty:1,unknown:2}[b.status])||Number(b.fresh)-Number(a.fresh));
    const selected=ranked[0],status=summaries.some(s=>s.status==='available')?'available':summaries.length&&summaries.every(s=>s.status==='empty')?'empty':'unknown';
    const webDates=[...(tool.webDates||[]),...(tool.recordedDates||[])].filter(d=>['web','user','user_schedule'].includes(d.source)&&['expiry','reset'].includes(d.kind)&&d.days>=-7).map(d=>({...d,near:d.days>=(d.estimated?-1:0)&&d.days<=(d.kind==='expiry'?7:2)&&(d.kind==='reset'||d.amount==null||d.amount>0)}));
    const dates=[...deadlines(records,rules,now),...webDates].sort((a,b)=>a.at-b.at),near=dates.filter(d=>d.near),priority=near.find(d=>d.kind==='expiry')||near[0];
    return{tool,id:tool.id,name:tool.name,status,metric:selected?.metric||null,meter:selected?.meter??null,record:selected?.record||null,reason:selected?.reason??'missing',accountCount:records.length,availableAccounts:summaries.filter(s=>s.status==='available').length,dates,deadline:priority||dates[0]||null,urgent:near.length>0,urgentKind:priority?.kind||null,hasReading:records.length>0};
  }
  function build(state,now=Date.now()){
    const rows=(state.tools||[]).filter(t=>t.records?.length||t.dateObservations?.length||t.userDates?.length||t.adapter&&(t.queryStatus||t.querying)).map(t=>analyze(t,state.rules||{},now));
    rows.sort((a,b)=>Number(b.urgent)-Number(a.urgent)||(a.urgent&&b.urgent?Number(b.urgentKind==='expiry')-Number(a.urgentKind==='expiry')||a.deadline.at-b.deadline.at:0)||({empty:0,available:1,unknown:2}[a.status]-{empty:0,available:1,unknown:2}[b.status])||a.name.localeCompare(b.name));
    return{rows,total:rows.length,available:rows.filter(r=>r.status==='available').length,empty:rows.filter(r=>r.status==='empty').length,unknown:rows.filter(r=>r.status==='unknown').length,urgent:rows.filter(r=>r.urgent).length};
  }
  return{build,analyze,summarizeRecord};
});

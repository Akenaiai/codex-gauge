'use strict';
const {hash}=require('./catalog.cjs');
const DAY=86400000;
const origins={lovart:['https://www.lovart.ai'],xyq:['https://xyq.jianying.com','https://www.xiaoyunque.com'],jimeng:['https://jimeng.jianying.com'],deepseek:['https://platform.deepseek.com']};
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v?v:null;
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=100?v.trim():null;
function cleanObservation(input,now=Date.now()){
  const account=text(input?.account);let url;try{url=new URL(input.sourceUrl);}catch{throw Error('invalid_observation');}
  if(!origins[input.provider]?.includes(url.origin)||url.username||url.password||url.search||url.hash||!account||!Number.isSafeInteger(input.observedAt)||input.observedAt<=0||input.observedAt>now+10000||!Array.isArray(input.items)||!input.items.length||input.items.length>20)throw Error('invalid_observation');
  const ids=new Set();const items=input.items.map(p=>{
    if(!p||!text(p.id)||!/^[a-z0-9_.-]{1,60}$/.test(p.id)||ids.has(p.id)||!['expiry','reset','billing','never','unknown'].includes(p.kind)||!text(p.label)||!text(p.labelEn)||!['never','unknown'].includes(p.kind)&&!date(p.onDate)||p.amount!=null&&(typeof p.amount!=='number'||!Number.isFinite(p.amount)||p.amount<0))throw Error('invalid_observation');
    if(p.timeText!=null&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.timeText))throw Error('invalid_observation');
    ids.add(p.id);return{id:p.id,kind:p.kind,label:p.label,labelEn:p.labelEn,onDate:['never','unknown'].includes(p.kind)?null:p.onDate,timeText:p.timeText||null,ruleDerived:p.ruleDerived===true,amount:p.amount??null,unit:['credits','CNY','USD','requests'].includes(p.unit)?p.unit:'credits'};
  });
  if(typeof input.accountRef!=='string'||!/^[a-f0-9]{20}$/.test(input.accountRef))throw Error('invalid_observation');
  return{id:hash(input.provider+'|'+input.accountRef),provider:input.provider,accountRef:input.accountRef,account,observedAt:input.observedAt,sourceUrl:url.href,items};
}
function cleanObservations(rows,now=Date.now()){const map=new Map();for(const row of Array.isArray(rows)?rows.slice(-100):[])try{const r=cleanObservation(row,now),old=map.get(r.id);if(!old||old.observedAt<=r.observedAt)map.set(r.id,r);}catch{}return[...map.values()];}
function observationEvents(rows,now=Date.now()){
  const today=new Date(now),local=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
  return cleanObservations(rows,now).flatMap(r=>r.items.filter(p=>!['never','unknown'].includes(p.kind)).map(p=>{
    const at=Date.parse(p.onDate+'T12:00:00Z'),days=Math.round((Date.parse(p.onDate+'T00:00:00Z')-local)/DAY);
    return{id:`web:${r.id}/${p.id}/${p.kind}/${p.onDate}`,recordId:'web:'+r.id,provider:r.provider,poolId:p.id,label:p.label,labelEn:p.labelEn,amount:p.amount,unit:p.unit,kind:p.kind,at,onDate:p.onDate,timeText:p.timeText,ruleDerived:p.ruleDerived,dateOnly:true,elapsed:days<0,days,stale:true,source:'web',account:r.account,observedAt:r.observedAt,sourceUrl:r.sourceUrl,notify:true};
  }));
}
function observationAlerts(rows,now=Date.now()){
  return observationEvents(rows,now).filter(e=>e.kind!=='billing'&&e.days>=0&&e.days<=(e.kind==='expiry'?7:2)&&(e.kind==='reset'||e.amount==null||e.amount>0)).map(e=>({...e,kind:'check_schedule',scheduleKind:e.kind,key:'center:web:'+hash(e.id)+':'+(e.days===0?'on-date':e.days<=1?'1d':e.days<=3?'3d':'7d'),expiresAt:e.at+2*DAY}));
}
function observationNotice(alert,providerName,language){
  if(alert.kind!=='check_schedule')return null;
  const en=language==='en',expiry=alert.scheduleKind==='expiry',when=alert.onDate+(alert.timeText?' '+alert.timeText+(en?' (timezone unspecified)':'（时区未说明）'):(en?' (date only)':'（仅有日期）'));
  return{title:en?expiry?'Recorded credit expiry approaching':'Recorded quota renewal approaching':expiry?'网页记录的积分到期日将近':'网页记录的额度恢复日将近',body:en?expiry?`${providerName} · ${alert.account}: the website observation records ${alert.labelEn} expiring on ${when}. Check the current pool balance and validity on the website.`:`${providerName} · ${alert.account}: the recorded renewal date for ${alert.labelEn} is ${when}. Check whether claiming is required and whether credits arrived; a grant is not confirmed.`:expiry?`${providerName} · ${alert.account}：网页记录的${alert.label}到期日为 ${when}。请回网页核实当前分项余额和有效期。`:`${providerName} · ${alert.account}：网页记录的${alert.label}恢复日期为 ${when}。请核实是否需要领取及是否到账，刻度尚未确认恢复。`};
}
module.exports={cleanObservation,cleanObservations,observationEvents,observationAlerts,observationNotice};

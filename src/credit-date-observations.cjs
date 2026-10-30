'use strict';
const {hash}=require('./catalog.cjs');
const DAY=86400000;
const origins={lovart:['https://www.lovart.ai'],xyq:['https://xyq.jianying.com','https://www.xiaoyunque.com'],jimeng:['https://jimeng.jianying.com'],deepseek:['https://platform.deepseek.com']};
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v?v:null;
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=100?v.trim():null;
function validateMonthlyRule(rule){if(rule==null)return null;if(!['expiry','grant'].includes(rule.basis)||!date(rule.anchorDate)||rule.day!=null&&(!Number.isInteger(rule.day)||rule.day<1||rule.day>31))throw Error('invalid_monthly_rule');return{basis:rule.basis,anchorDate:rule.anchorDate,day:rule.day||Number(rule.anchorDate.slice(8)),notify:rule.notify!==false,source:'user'};}
function cleanObservation(input,now=Date.now()){
  const account=text(input?.account);let url;try{url=new URL(input.sourceUrl);}catch{throw Error('invalid_observation');}
  if(!origins[input.provider]?.includes(url.origin)||url.username||url.password||url.search||url.hash||!account||!Number.isSafeInteger(input.observedAt)||input.observedAt<=0||input.observedAt>now+10000||!Array.isArray(input.items)||!input.items.length||input.items.length>20)throw Error('invalid_observation');
  const ids=new Set();const items=input.items.map(p=>{
    if(!p||!text(p.id)||!/^[a-z0-9_.-]{1,60}$/.test(p.id)||ids.has(p.id)||!['expiry','reset','billing','never','unknown'].includes(p.kind)||!text(p.label)||!text(p.labelEn)||!['never','unknown'].includes(p.kind)&&!date(p.onDate)||p.amount!=null&&(typeof p.amount!=='number'||!Number.isFinite(p.amount)||p.amount<0))throw Error('invalid_observation');
    if(p.timeText!=null&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.timeText))throw Error('invalid_observation');
    const grantDate=p.grantDate?date(p.grantDate):null,rule=p.monthlyRule;
    const monthlyRule=rule&&['lovart','xyq','jimeng'].includes(input.provider)&&['monthly','subscription'].includes(p.id)&&p.kind!=='never'?validateMonthlyRule(rule):null;
    ids.add(p.id);return{id:p.id,kind:p.kind,label:p.label,labelEn:p.labelEn,onDate:['never','unknown'].includes(p.kind)?null:p.onDate,timeText:p.timeText||null,ruleDerived:p.ruleDerived===true,grantDate,monthlyRule,amount:p.amount??null,unit:['credits','CNY','USD','requests'].includes(p.unit)?p.unit:'credits'};
  });
  if(typeof input.accountRef!=='string'||!/^[a-f0-9]{20}$/.test(input.accountRef))throw Error('invalid_observation');
  return{id:hash(input.provider+'|'+input.accountRef),provider:input.provider,accountRef:input.accountRef,account,observedAt:input.observedAt,sourceUrl:url.href,items};
}
function cleanObservations(rows,now=Date.now()){const map=new Map();for(const row of Array.isArray(rows)?rows.slice(-100):[])try{const r=cleanObservation(row,now),old=map.get(r.id);if(!old||old.observedAt<=r.observedAt)map.set(r.id,r);}catch{}return[...map.values()];}
function monthAt(onDate,offset,day){const [y,m]=onDate.split('-').map(Number),target=new Date(Date.UTC(y,m-1+offset,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();return `${target.getUTCFullYear()}-${String(target.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;}
const addMonth=(onDate,day)=>monthAt(onDate,1,day);
function forecastDates(rule,now=Date.now()){
  const first=rule.basis==='grant'?addMonth(rule.anchorDate,rule.day):rule.anchorDate,[y,m]=first.split('-').map(Number),d=new Date(now),local=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()),diff=(d.getFullYear()-y)*12+d.getMonth()+1-m,start=Math.max(0,diff-1),dates=[];
  for(let i=start;i<start+5;i++){const candidate=monthAt(first,i,rule.day);if(candidate>=first&&Date.parse(candidate+'T00:00:00Z')>=local-7*DAY)dates.push(candidate);}
  return dates.slice(0,2);
}
function applyMonthlyRules(rows,rules={},now=Date.now()){return cleanObservations(rows,now).map(r=>({...r,items:r.items.map(p=>{const key=r.id+'/'+p.id;if(!Object.hasOwn(rules,key))return p;return{...p,monthlyRule:['lovart','xyq','jimeng'].includes(r.provider)&&['monthly','subscription'].includes(p.id)&&p.kind!=='never'?validateMonthlyRule(rules[key]):null};})}));}
function observationEvents(rows,now=Date.now(),rules={}){
  const today=new Date(now),local=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
  return applyMonthlyRules(rows,rules,now).flatMap(r=>{
    const items=[...r.items.filter(p=>!['never','unknown'].includes(p.kind)),...r.items.filter(p=>p.monthlyRule).flatMap(p=>forecastDates(p.monthlyRule,now).map(onDate=>({...p,id:p.id+'.monthly-forecast',kind:'reset',label:'月度发放 · '+p.label,labelEn:'Monthly grant · '+p.labelEn,amount:null,onDate,timeText:null,estimated:true,ruleDerived:true})))];
    return items.map(p=>{
    const at=Date.parse(p.onDate+'T12:00:00Z'),days=Math.round((Date.parse(p.onDate+'T00:00:00Z')-local)/DAY);
    return{id:`web:${r.id}/${p.id}/${p.kind}/${p.onDate}`,recordId:'web:'+r.id,provider:r.provider,poolId:p.id,label:p.label,labelEn:p.labelEn,amount:p.amount,unit:p.unit,kind:p.kind,at,onDate:p.onDate,timeText:p.timeText,ruleDerived:p.ruleDerived,estimated:p.estimated===true,dateOnly:true,elapsed:days<0,days,stale:true,source:p.estimated?'user_schedule':'web',account:r.account,observedAt:r.observedAt,sourceUrl:r.sourceUrl,notify:p.estimated?p.monthlyRule.notify!==false:true};
    });});
}
function observationAlerts(rows,now=Date.now(),rules={}){
  return observationEvents(rows,now,rules).filter(e=>e.notify&&e.kind!=='billing'&&e.days>=(e.estimated?-7:0)&&e.days<=(e.kind==='expiry'?7:2)&&(e.kind==='reset'||e.amount==null||e.amount>0)).map(e=>({...e,kind:'check_schedule',scheduleKind:e.kind,key:'center:web:'+hash(e.id)+':'+(e.days<0?'overdue':e.days===0?'on-date':e.days<=1?'1d':e.days<=3?'3d':'7d'),expiresAt:e.at+(e.estimated?8:2)*DAY}));
}
function observationNotice(alert,providerName,language){
  if(alert.kind!=='check_schedule')return null;
  const en=language==='en',expiry=alert.scheduleKind==='expiry',when=alert.onDate+(alert.timeText?' '+alert.timeText+(en?' (timezone unspecified)':'（时区未说明）'):(en?' (date only)':'（仅有日期）'));
  if(alert.estimated)return{title:en?alert.days<0?'Expected grant date passed; check quota':alert.days===0?'Expected monthly grant date reached':'Expected monthly grant approaching':alert.days<0?'预计发放日已过，请核实':alert.days===0?'预计月度发放日已到':'预计月度发放日将近',body:en?`${providerName} · ${alert.account}: the monthly same-day rule forecasts a grant on ${alert.onDate}. Check the refreshed balance; a grant has not been confirmed.`:`${providerName} · ${alert.account}：按每月同日规则，预计 ${alert.onDate} 发放本月额度。请查看自动刷新的余额；刻度尚未确认实际到账。`};
  if(alert.source==='user')return{title:en?'User-recorded credit expiry':'本人记录的积分到期日提醒',body:en?`${providerName} · ${alert.account}: your recorded expiry for ${alert.labelEn} is ${when}. Verify the current pool balance and validity.`:`${providerName} · ${alert.account}：你填写的${alert.label}到期日为 ${when}。请核实对应分项当前余额和有效期。`};
  return{title:en?expiry?'Recorded credit expiry approaching':'Recorded quota renewal approaching':expiry?'网页记录的积分到期日将近':'网页记录的额度恢复日将近',body:en?expiry?`${providerName} · ${alert.account}: the website observation records ${alert.labelEn} expiring on ${when}. Check the current pool balance and validity on the website.`:`${providerName} · ${alert.account}: the recorded renewal date for ${alert.labelEn} is ${when}. Check whether claiming is required and whether credits arrived; a grant is not confirmed.`:expiry?`${providerName} · ${alert.account}：网页记录的${alert.label}到期日为 ${when}。请回网页核实当前分项余额和有效期。`:`${providerName} · ${alert.account}：网页记录的${alert.label}恢复日期为 ${when}。请核实是否需要领取及是否到账，刻度尚未确认恢复。`};
}
module.exports={cleanObservation,cleanObservations,observationEvents,observationAlerts,observationNotice,addMonth,forecastDates,applyMonthlyRules,validateMonthlyRule};

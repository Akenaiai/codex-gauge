'use strict';
// User-entered dates never overwrite upstream balances or website evidence.
const {forecastDates}=require('./credit-date-observations.cjs');
const {hash}=require('./catalog.cjs');
const {fresh}=require('./credit-model.cjs');
const DAY=86400000;
function calendarDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2199-12-31'&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value?value:null;}
const label=value=>typeof value==='string'&&value.trim()&&value.trim().length<=80?value.trim():null;
function validateUserDate(input,now=Date.now()){
  if(!input||typeof input.provider!=='string'||!/^[-a-z0-9\u3400-\u9fff._]{1,110}$/.test(input.provider)||input.provider==='codex'||!label(input.account)||!label(input.label)||!['subscription','other','purchased','daily','permanent'].includes(input.poolType))throw Error('invalid_dates');
  const expiryDate=input.expiryDate?calendarDate(input.expiryDate):null;
  if(input.expiryDate&&!expiryDate||input.poolType==='permanent'&&expiryDate)throw Error('invalid_dates');
  const day=input.monthlyDay==null||input.monthlyDay===''?null:input.monthlyDay;
  if(day!=null&&(!Number.isInteger(day)||day<1||day>31||input.poolType!=='subscription'))throw Error('invalid_dates');
  if(!expiryDate&&!day)throw Error('invalid_dates');
  const d=new Date(now),anchorDate=day?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate())).padStart(2,'0')}`:null;
  if(input.recordId!=null&&(typeof input.recordId!=='string'||input.recordId.length>140||typeof input.poolId!=='string'||input.poolId.length>100))throw Error('invalid_dates');
  return{provider:input.provider,account:label(input.account),label:label(input.label),poolType:input.poolType,expiryDate,monthlyDay:day,
    anchorDate:day&&calendarDate(input.anchorDate)||anchorDate,recordId:input.recordId||null,poolId:input.recordId?input.poolId:null,notify:input.notify!==false};
}
function cleanUserDates(rows,now=Date.now()){
  const result=new Map();
  for(const row of Array.isArray(rows)?rows.slice(-250):[])try{
    if(!/^[a-f0-9]{20}$/.test(row.id)||!Number.isSafeInteger(row.updatedAt)||row.updatedAt<=0||row.updatedAt>now+10000)continue;
    result.set(row.id,{...validateUserDate(row,now),id:row.id,updatedAt:row.updatedAt});
  }catch{}
  return[...result.values()];
}
function activeUserDates(rows,records,now=Date.now()){
  return cleanUserDates(rows,now).filter(row=>!row.recordId||records.some(r=>r.id===row.recordId&&r.provider===row.provider&&r.status!=='account_changed'&&r.identityVerified&&r.pools.some(p=>p.id===row.poolId)));
}
function userDateEvents(rows,records=[],now=Date.now()){
  const d=new Date(now),today=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate());
  return activeUserDates(rows,records,now).flatMap(row=>{
    const record=records.find(r=>r.id===row.recordId),pool=record?.pools.find(p=>p.id===row.poolId);
    const dates=[...(row.expiryDate?[{onDate:row.expiryDate,kind:'expiry',estimated:false}]:[]),...(row.monthlyDay?forecastDates({basis:'expiry',anchorDate:row.anchorDate,day:row.monthlyDay},now).map(onDate=>({onDate,kind:'reset',estimated:true})):[])];
    return dates.map(value=>{const days=Math.round((Date.parse(value.onDate+'T00:00:00Z')-today)/DAY);return{
      ...value,id:`user:${row.id}/${row.recordId?hash(row.recordId+'/'+row.poolId):'independent'}/${value.kind}/${value.onDate}`,userDateId:row.id,recordId:row.recordId||'user:'+row.id,poolId:row.poolId||row.id,
      provider:row.provider,label:row.label,labelEn:row.label,account:row.account,amount:value.estimated||!fresh(record,now)?null:pool?.amount??null,unit:pool?.unit||'credits',
      at:Date.parse(value.onDate+'T12:00:00Z'),dateOnly:true,days,elapsed:days<0,stale:true,source:value.estimated?'user_schedule':'user',observedAt:row.updatedAt,notify:row.notify};});
  });
}
function userDateAlerts(rows,records,now=Date.now()){
  return userDateEvents(rows,records,now).filter(e=>e.notify&&e.days>=(e.estimated?-7:0)&&e.days<=(e.kind==='expiry'?7:2)&&(e.kind==='reset'||e.amount==null||e.amount>0)).map(e=>({...e,kind:'check_schedule',scheduleKind:e.kind,
    key:'center:user-date:'+hash(e.id)+':'+(e.days<0?'overdue':e.days===0?'on-date':e.days<=1?'1d':e.days<=3?'3d':'7d'),expiresAt:e.at+(e.estimated?8:2)*DAY}));
}
module.exports={calendarDate,validateUserDate,cleanUserDates,activeUserDates,userDateEvents,userDateAlerts};

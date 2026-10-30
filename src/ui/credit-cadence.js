(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.creditCadence=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function creditType(pool){
    if(!pool||typeof pool!=='object')return null;
    const types=['daily','subscription','monthly','purchased','permanent','other'];
    const type=types.includes(pool.poolType)&&pool.poolType!=='other'?pool.poolType:types.includes(pool.creditCadence)?pool.creditCadence:pool.poolType==='other'?'other':null;
    return type==='monthly'?'subscription':type;
  }
  // Suppression needs daily-pool evidence, never merely an expiry date of today.
  function isDailyCredit(pool={}){
    if(!pool||typeof pool!=='object')return false;
    const type=creditType(pool);
    if(type==='daily')return true;
    if(['subscription','purchased','permanent'].includes(type))return false;
    if(pool.daily===true)return true;
    const id=String(pool.poolId||pool.id||'').toLowerCase(),labels=[pool.label,pool.labelEn].filter(v=>typeof v==='string');
    if(/^(monthly|subscription|purchased|permanent)(?:$|[._:-])/.test(id)||labels.some(v=>/^(?:月度|每月|订阅|充值|永久|monthly\b|subscription\b|purchased\b|permanent\b)/i.test(v.trim())))return false;
    if(labels.some(v=>{const days=v.match(/(?:有效(?:期)?\s*[:：]?\s*|valid(?:\s+for)?\s+)(\d+)\s*(?:天|days?)/i);return days&&Number(days[1])>1;}))return false;
    return /^(?:daily(?:[._:-](?:gift|bonus|free|credits?|claim|allowance))?|(?:gift|bonus|free)[._:-]daily)(?:$|[._:-])/.test(id)||labels.some(v=>/^(?:每日(?:赠送|赠金|免费|领取|积分|额度)|当日(?:赠送|赠金|免费积分)|daily\s+(?:gift|bonus|free|credits?|claim|allowance)\b)/i.test(v.trim()));
  }
  function effectiveType(entry,pool){const own=creditType(entry),bound=creditType(pool);return own&&own!=='other'?own:bound&&bound!=='other'?bound:isDailyCredit(pool)?'daily':own||bound;}
  function suppressExpiry(event){return event?.kind==='expiry'&&isDailyCredit(event);}
  return{creditType,effectiveType,isDailyCredit,suppressExpiry};
});

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.creativeTiming=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const DAY=86400000;
  function timing(date,now=Date.now()){
    if(date?.dateOnly){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date.onDate||''))return null;
      const[y,m,d]=date.onDate.split('-').map(Number),day=Date.UTC(y,m-1,d),clock=new Date(now);
      if(new Date(day).toISOString().slice(0,10)!==date.onDate)return null;
      const days=Math.round((day-Date.UTC(clock.getFullYear(),clock.getMonth(),clock.getDate()))/DAY);
      return{dateOnly:true,days,elapsed:days<0,due:days===0,near:days>=0&&days<=7,critical:days===0,order:new Date(y,m-1,d).getTime()};
    }
    if(!Number.isFinite(date?.at)||date.at<=0||!Number.isFinite(new Date(date.at).getTime()))return null;
    const remaining=date.at-now;
    return{dateOnly:false,remaining,elapsed:remaining<=0,due:remaining<=0,near:remaining>0&&remaining<=7*DAY,critical:remaining>0&&remaining<=DAY,order:date.at};
  }
  function selectDates(dates=[],now=Date.now()){
    const select=kind=>{
      const entries=dates.filter(d=>d.kind===kind&&(kind!=='expiry'||!d.daily&&(d.amount==null||d.amount>0))).map(date=>({date,time:timing(date,now)})).filter(x=>x.time);
      // Retain a recent missed forecast as a verification prompt, never a grant.
      const overdue=kind==='reset'?entries.filter(x=>(x.date.estimated||x.date.policy)&&x.time.elapsed&&(x.time.dateOnly?x.time.days>=-7:x.time.remaining>=-7*DAY)):[];
      if(overdue.length)return overdue.sort((a,b)=>b.time.order-a.time.order)[0].date;
      const upcoming=entries.filter(x=>!x.time.elapsed).sort((a,b)=>a.time.order-b.time.order);
      return(upcoming[0]||entries.sort((a,b)=>b.time.order-a.time.order)[0])?.date||null;
    };
    return{expiry:select('expiry'),reset:select('reset')};
  }
  function priorityExpiry(dates=[],status,now=Date.now()){
    if(status==='empty')return null;
    return dates.filter(d=>d.kind==='expiry'&&!d.daily&&(d.amount==null||d.amount>0)&&timing(d,now)?.near).sort((a,b)=>timing(a,now).order-timing(b,now).order)[0]||null;
  }
  return{timing,selectDates,priorityExpiry};
});

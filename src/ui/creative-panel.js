(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./creative-timing.js'):root.creativeTiming);if(typeof module==='object'&&module.exports)module.exports=api;else root.creativePanel=api;})(typeof window!=='undefined'?window:this,function(clock){
  'use strict';
  function markup({state,t,esc,button,icon,now=Date.now()}){
    const data=state.creative||{rows:[],available:0,empty:0,unknown:0,enabled:true},language=state.settings.language;
    const format=value=>new Intl.NumberFormat(language,{maximumFractionDigits:3}).format(value);
    const when=value=>new Date(value).toLocaleString(language,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
    const kind=value=>({image:t('生图','Image'),video:t('生视频','Video'),music:t('生音乐','Music')}[value]);
    function countdown(d,time){
      const expiry=d.kind==='expiry';
      if(time.elapsed)return expiry?t('到期日已过，待核实','Expiry passed; verify'):t('预计恢复日已过，待核实','Expected renewal passed; verify');
      if(time.dateOnly)return time.days===0?expiry?t('今天到期','Expires today'):t('今天预计恢复','Expected today'):expiry?t(`${time.days} 天后到期`,`Expires in ${time.days}d`):t(`${time.days} 天后预计恢复`,`Expected in ${time.days}d`);
      const minutes=Math.max(1,Math.ceil(time.remaining/60000)),days=Math.floor(minutes/1440),hours=Math.floor(minutes/60)%24,m=minutes%60;
      const duration=days?t(`${days}天${hours}小时`,`${days}d ${hours}h`):hours?t(`${hours}小时${m}分`,`${hours}h ${m}m`):t(`${m}分钟`,`${m}m`);
      return expiry?t(`${duration}后到期`,`Expires in ${duration}`):t(`${duration}后预计恢复`,`Expected in ${duration}`);
    }
    function dateLines(row){
      const selected=clock.selectDates(row.dates,now),dates=[row.priorityExpiry||selected.expiry,selected.reset].filter(Boolean);
      if(!dates.length)return `<div class="creative-date-missing">${t('积分日期未提供','Credit dates not provided')}</div>`;
      return dates.map(d=>{
        const time=clock.timing(d,now),poolName=language==='en'?d.labelEn:d.label,pool=poolName+(d.kind==='expiry'&&d.amount>0?' · '+format(d.amount)+(d.unit==='percent'?'%':d.unit==='credits'?t('积分',' credits'):d.unit||''):'');
        const basis=d.source==='web'?t('网页记录 · 非实时','Web record · Not live'):d.source==='user'?t('本人填写','User entered'):d.estimated?t('按月预计 · 未确认到账','Monthly forecast · Grant unconfirmed'):d.policy?t('依规则预计 · 待核实','Policy forecast · Verify'):d.stale?t('上次读数 · 待刷新','Last reading · Refresh needed'):'';
        const account=d.account&&d.account!==row.account?d.account+' · ':'';
        const precision=time.dateOnly?(d.timeText?t('时区未说明，按日期倒计时','Timezone unspecified; day countdown'):t('仅日期，时刻未提供','Date only; time unspecified')):'';
        const note=[account+basis,precision].filter(Boolean).join(' · '),exact=d.dateOnly?d.onDate+(d.timeText?' '+d.timeText:''):when(d.at),title=[pool,exact,note].filter(Boolean).join(' · ');
        return `<div class="creative-deadline ${d.kind} ${time.elapsed?'is-elapsed':''}" title="${esc(title)}"><div class="creative-deadline-top"><span class="creative-pool">${esc(pool||t('积分','Credits'))}</span><strong class="creative-countdown">${esc(countdown(d,time))}</strong></div>${note?`<div class="creative-date-note">${esc(note)}</div>`:''}</div>`;
      }).join('');
    }
    const rows=data.rows.map(row=>{
      const status=row.expiring?(row.status==='unknown'?t('临期记录 · 待确认','Expiry · Unconfirmed'):row.expiryNeedsCheck?t('临期 · 核实分项','Expiry · Verify pool'):t('临期 · 优先使用','Expiring · Use first')):({available:t('有积分','Available'),empty:t('已用尽','Used up'),unknown:t('待确认','Unconfirmed')})[row.status];
      const unit=row.unit==='percent'?'%':row.unit==='credits'?t('积分','credits'):row.unit==='requests'?t('次','requests'):row.unit;
      const reading=row.fetchedAt?(row.status==='unknown'?t('上次读取 ','Last read '):t('刷新于 ','Read '))+when(row.fetchedAt):row.querying?t('正在查询…','Querying…'):t('尚未读到余额','No balance reading');
      const provenance=row.source==='manual'?t(' · 本人记录',' · Manual'):row.source==='host'?t(' · 查询快照',' · Snapshot'):'';
      const account=row.accountCount>1?t(` · 显示 ${row.account||'未命名账号'}，共${row.accountCount}个账号`,` · Showing ${row.account||'unnamed account'} of ${row.accountCount} accounts`):'';
      return `<article class="creative-row is-${row.status} ${row.expiring?'is-expiring':''} ${row.criticalExpiry?'is-critical':''} ${row.expiryIsPrimary?'expiry-is-primary':''}" data-provider="${esc(row.id)}"><div class="creative-row-top"><div><strong>${esc(row.name)}</strong><span class="creative-kind">${esc(row.kinds.map(kind).join(' / '))}</span></div><span class="creative-status">${status}</span></div><div class="creative-amount">${row.amount==null?'—':format(row.amount)}<small>${row.amount==null?'':esc(unit)}</small></div><div class="creative-read-time">${esc(reading+provenance+account)}</div>${dateLines(row)}</article>`;
    }).join('');
    return `<section class="panel creative-panel"><header class="header"><div class="brand-mark">${icon('flip')}</div><div class="brand">${t('创作积分','Creative credits')}<small>IMAGE · VIDEO · MUSIC</small></div><span class="spacer"></span><button class="flip-switch" data-action="show-codex">${icon('flip')}${t('翻回','Flip back')}</button>${button('close',t('关闭面板','Close panel'),'close')}</header><div class="content creative-content"><div class="creative-summary"><span><strong>${data.available}</strong>${t('有积分','available')}</span><span><strong>${data.empty}</strong>${t('已用尽','used up')}</span><span><strong>${data.unknown}</strong>${t('待确认','unconfirmed')}</span></div>${state.demo?`<p class="notice demo-label">${t('示例数据','Sample data')}</p>`:''}<div class="creative-list">${rows||`<div class="empty"><h1>${t('还没有创作额度读数','No creative quota readings yet')}</h1><p>${t('使用本机已有的生图、生视频或音乐连接；可到额度中心梳理和补充记录。','Use existing image, video or music connections. Discover tools or add readings in the credit center.')}</p></div>`}</div></div><footer class="footer"><button class="text-button" data-action="credit-center">${t('额度中心','Credit center')} ↗</button><span>${data.enabled?t('运行时每5分钟查询','Queries every 5 min while running'):t('自动查询已暂停','Automatic queries paused')}</span><button class="icon-button" data-action="creative-refresh" ${data.busy?'disabled':''} aria-label="${t('刷新创作积分','Refresh creative credits')}">${icon('refresh')}</button></footer></section>`;
  }
  return{markup};
});

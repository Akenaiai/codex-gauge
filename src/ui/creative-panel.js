(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.creativePanel=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function markup({state,t,esc,button,icon}){
    const data=state.creative||{rows:[],available:0,empty:0,unknown:0,enabled:true},language=state.settings.language;
    const format=value=>new Intl.NumberFormat(language,{maximumFractionDigits:3}).format(value);
    const when=value=>new Date(value).toLocaleString(language,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
    const kind=value=>({image:t('生图','Image'),video:t('生视频','Video'),music:t('生音乐','Music')}[value]);
    function dateLine(row){
      const d=row.dates?.find(d=>d.kind==='expiry'&&!d.elapsed)||row.dates?.find(d=>d.kind==='reset'&&!d.elapsed)||row.dates?.[0];
      if(!d)return t('积分日期未提供','Credit dates not provided');
      const label=d.estimated?t('预计发放','Expected grant'):d.kind==='expiry'?t('到期','Expires'):t('重置','Resets');
      const basis=d.source==='user'?t(' · 本人填写',' · User entered'):d.source==='web'?t(' · 网页记录',' · Web record'):d.policy?t(' · 依规则预计',' · Policy forecast'):'';
      const pool=language==='en'?d.labelEn:d.label;
      return `${pool?pool+' · ':''}${label} ${d.dateOnly?d.onDate:when(d.at)}${basis}${d.account&&d.account!==row.account?' · '+d.account:''}${d.elapsed?t(' · 待核实',' · Verify'):''}`;
    }
    const rows=data.rows.map(row=>{
      const status=({available:t('有积分','Available'),empty:t('已用尽','Used up'),unknown:t('待确认','Unconfirmed')})[row.status];
      const unit=row.unit==='percent'?'%':row.unit==='credits'?t('积分','credits'):row.unit==='requests'?t('次','requests'):row.unit;
      const reading=row.fetchedAt?(row.status==='unknown'?t('上次读取 ','Last read '):t('刷新于 ','Read '))+when(row.fetchedAt):row.querying?t('正在查询…','Querying…'):t('尚未读到余额','No balance reading');
      const provenance=row.source==='manual'?t(' · 本人记录',' · Manual'):row.source==='host'?t(' · 查询快照',' · Snapshot'):'';
      const account=row.accountCount>1?t(` · 显示 ${row.account||'未命名账号'}，共${row.accountCount}个账号`,` · Showing ${row.account||'unnamed account'} of ${row.accountCount} accounts`):'';
      return `<article class="creative-row is-${row.status}" data-provider="${esc(row.id)}"><div class="creative-row-top"><div><strong>${esc(row.name)}</strong><span class="creative-kind">${esc(row.kinds.map(kind).join(' / '))}</span></div><span class="creative-status">${status}</span></div><div class="creative-amount">${row.amount==null?'—':format(row.amount)}<small>${row.amount==null?'':esc(unit)}</small></div><div class="creative-read-time">${esc(reading+provenance+account)}</div><div class="creative-date" title="${esc(dateLine(row))}">${esc(dateLine(row))}</div></article>`;
    }).join('');
    return `<section class="panel creative-panel"><header class="header"><div class="brand-mark">${icon('flip')}</div><div class="brand">${t('创作积分','Creative credits')}<small>IMAGE · VIDEO · MUSIC</small></div><span class="spacer"></span><button class="flip-switch" data-action="show-codex">${icon('flip')}${t('翻回','Flip back')}</button>${button('close',t('关闭面板','Close panel'),'close')}</header><div class="content creative-content"><div class="creative-summary"><span><strong>${data.available}</strong>${t('有积分','available')}</span><span><strong>${data.empty}</strong>${t('已用尽','used up')}</span><span><strong>${data.unknown}</strong>${t('待确认','unconfirmed')}</span></div>${state.demo?`<p class="notice demo-label">${t('示例数据','Sample data')}</p>`:''}<div class="creative-list">${rows||`<div class="empty"><h1>${t('还没有创作额度读数','No creative quota readings yet')}</h1><p>${t('使用本机已有的生图、生视频或音乐连接；可到额度中心梳理和补充记录。','Use existing image, video or music connections. Discover tools or add readings in the credit center.')}</p></div>`}</div></div><footer class="footer"><button class="text-button" data-action="credit-center">${t('额度中心','Credit center')} ↗</button><span>${data.enabled?t('运行时每5分钟查询','Queries every 5 min while running'):t('自动查询已暂停','Automatic queries paused')}</span><button class="icon-button" data-action="creative-refresh" ${data.busy?'disabled':''} aria-label="${t('刷新创作积分','Refresh creative credits')}">${icon('refresh')}</button></footer></section>`;
  }
  return{markup};
});

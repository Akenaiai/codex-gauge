/* First-use guidance and local date entry share the production IPC boundary. */
window.creditSetup={create({api,t,esc,changed}){
  let state={tools:[]},opened=false,pending=false;
  const guide=document.createElement('dialog'),editor=document.createElement('dialog');guide.id='setup-dialog';editor.id='date-entry-dialog';
  guide.setAttribute('aria-labelledby','setup-title');editor.setAttribute('aria-labelledby','date-entry-title');document.body.append(guide,editor);
  const errorText=()=>t('保存未完成，请核对日期、账号或本地存储后重试。原记录仍保留。','Could not save. Check dates, account or local storage and retry. Your previous record is preserved.');
  const name=id=>state.tools.find(tool=>tool.id===id)?.name||id;
  const known=tool=>tool.records?.some(r=>!r.stale&&!['manual','host'].includes(r.source));
  function capability(tool){return known(tool)?t('已读到余额','Balance read'):tool.adapter&&tool.queryReady?t('可尝试自动查询','Automatic query available'):tool.adapter?t('需准备原工具连接','Original connection needed'):t('暂需本人记录','Manual reading needed');}
  function guideContent(){
    if(!guide.open||editor.open)return;
    const focus=document.activeElement?.dataset?.setupKey,scroll=guide.querySelector('.setup-tools')?.scrollTop||0;
    const tools=state.tools.slice().sort((a,b)=>Number(!!b.adapter&&!!b.queryReady)-Number(!!a.adapter&&!!a.queryReady)||a.name.localeCompare(b.name));
    const automatic=tools.filter(tool=>tool.adapter&&tool.queryReady).length,read=tools.filter(known).length;
    guide.innerHTML=`<div class="setup-heading"><div><span class="setup-eyebrow">${t('首次使用 · 也可随时重看','FIRST USE · REOPEN ANYTIME')}</span><h2 id="setup-title">${t('先看看，你有哪些额度可用','See what is available on your computer')}</h2></div><button data-setup="language" class="quiet" data-setup-key="language">${document.documentElement.lang==='en'?'中文':'EN'}</button></div><p>${t('无需在刻度登录平台。已有连接负责查余额，缺失的日期可以直接填。','No provider login inside Gauge. Existing connections supply balances; fill in missing dates here.')}</p><div class="setup-counts"><span><strong>${tools.length}</strong>${t('发现工具','Tools found')}</span><span><strong>${automatic}</strong>${t('具备查询入口','Query paths found')}</span><span><strong>${read}</strong>${t('已读到余额','Balances read')}</span></div><div class="setup-tools">${tools.length?tools.map(tool=>`<div class="setup-tool"><div><strong>${esc(tool.name)}</strong><small>${esc([...new Set(tool.connections.map(c=>c.kind.toUpperCase()))].join(' · '))}${tool.connections.every(c=>c.evidence==='cached')?t(' · 仅缓存',' · Cache only'):''}</small></div><div><span class="setup-status ${known(tool)?'available':''}">${capability(tool)}</span><small>${tool.querying?t('正在查询…','Querying…'):tool.userDates?.length?t('已填写日期','Dates saved'):tool.records?.some(r=>r.pools.some(p=>p.expiresAt||p.resetsAt||p.resetDate))?t('有接口日期，详情可查看','Source dates in Details'):t('到期 / 发放日期待补充','Expiry / grant dates can be added')}</small></div><button data-setup="dates" data-provider="${esc(tool.id)}" data-setup-key="date-${esc(tool.id)}" ${tool.id==='codex'?'disabled':''}>${tool.id==='codex'?t('沿用原仪表','Original badge'):t('填写日期','Set dates')}</button></div>`).join(''):`<div class="blank">${t('还没发现本机工具。可先在原工具中配置连接，或进入看板补充本人记录。','No local tools found yet. Configure the original tool, or add a manual reading in the overview.')}</div>`}</div><p class="setup-hint">${t('发现工具不代表已登录。查询失败时回原客户端处理；每月发放日为预计，到时仍需核实到账。休眠或退出后暂停查询。','Discovery does not prove sign-in. Fix failed connections in their original client. Monthly grants are forecasts; verify arrival when due. Queries pause during sleep or after exit.')}</p><div id="setup-error" class="error" role="status"></div><div class="dialog-actions"><button data-setup="done" data-setup-key="later">${t('稍后再看','Later')}</button><button data-setup="rescan" data-setup-key="rescan">${t('重新发现','Rescan')}</button><button data-setup="refresh" data-setup-key="refresh" ${state.busy?'disabled':''}>${state.busy?t('查询中…','Querying…'):t('查询已有连接','Query connections')}</button><button data-setup="done" data-setup-key="done" class="primary">${t('进入看板','Open overview')}</button></div>`;
    guide.querySelector('.setup-tools').scrollTop=scroll;
    if(focus)guide.querySelector(`[data-setup-key="${CSS.escape(focus)}"]`)?.focus();
  }
  function openGuide(){opened=true;if(!guide.open)guide.showModal();guideContent();guide.querySelector('[data-setup-key=done]')?.focus();}
  async function finish(){
    if(pending)return;pending=true;guide.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{const result=await api.action('onboarding-complete');if(result?.ok===false)throw Error();guide.close();}
    catch{guide.close();const note=document.createElement('div');note.className='toast';note.setAttribute('role','status');note.textContent=t('引导状态未保存，本次已跳过。仍可查看看板。','Guide status was not saved. Skipped for this session; the overview remains available.');document.body.append(note);setTimeout(()=>note.remove(),6000);}
    finally{pending=false;changed();}
  }
  guide.addEventListener('cancel',event=>{event.preventDefault();finish();});
  guide.addEventListener('click',async event=>{
    const button=event.target.closest('[data-setup]');if(!button||pending)return;const action=button.dataset.setup;
    if(action==='dates'){const tool=state.tools.find(tool=>tool.id===button.dataset.provider);return openDates(button.dataset.provider,tool?.userDates?.length===1?tool.userDates[0].id:null);}
    if(action==='done')return finish();
    button.disabled=true;
    try{const result=await api.action(action==='language'?'language':action,action==='language'?{language:document.documentElement.lang==='en'?'zh-CN':'en'}:undefined);if(result?.ok===false)throw Error();}
    catch{guide.querySelector('#setup-error').textContent=t('操作未完成，请检查原连接后重试。','Could not complete. Check the original connection and retry.');}
    finally{button.disabled=false;}
  });
  function openDates(provider,id){
    const tool=state.tools.find(tool=>tool.id===provider);if(!tool||provider==='codex')return;
    const old=tool.userDates?.find(row=>row.id===id),targets=[];
    for(const r of tool.records||[])if(r.identityVerified)for(const p of r.pools)if(p.unit!=='cards'&&p.entitlement!=='not_in_plan')targets.push({record:r,pool:p});
    const selected=old?.recordId?targets.findIndex(x=>x.record.id===old.recordId&&x.pool.id===old.poolId):!old&&targets.length===1?0:-1;
    editor.innerHTML=`<form id="date-entry-form"><span class="setup-eyebrow">${esc(tool.name)}</span><h2 id="date-entry-title">${old?t('修改日期与预计发放','Edit dates & expected grants'):t('填写日期与预计发放','Set dates & expected grants')}</h2><p>${t('填写积分本身的日期，会员到期和扣款日请另行留意。只存在本机，自动余额不会被改写。','Enter credit dates. Membership expiry and payment dates are separate. Saved locally; automatic balances stay unchanged.')}</p><label>${t('对应账号与积分池','Account & credit pool')}<select name="target"><option value="">${t('单独记录一个账号，不自动匹配','Record a separate account; no automatic match')}</option>${targets.map((x,index)=>`<option value="${index}" ${selected===index?'selected':''}>${esc(x.record.account||t('当前已核实账号','Verified current account'))} · ${esc(document.documentElement.lang==='en'?x.pool.labelEn:x.pool.label)}</option>`).join('')}</select></label><label>${t('账号或工作区别名','Account or workspace alias')}<input name="account" required maxlength="80" autocomplete="off" value="${esc(old?.account||'')}" placeholder="${t('例如：工作账号','For example: Work account')}"></label><label>${t('积分池名称','Credit pool name')}<input name="label" required maxlength="80" value="${esc(old?.label||'')}" placeholder="${t('例如：订阅积分','For example: Subscription credits')}"></label><label>${t('积分类型','Credit type')}<select name="poolType">${[['other',t('其他 / 尚未确认','Other / unconfirmed')],['subscription',t('按月发放的订阅积分','Monthly subscription credits')],['purchased',t('充值积分','Purchased credits')],['daily',t('每日领取积分','Daily claim credits')]].map(([value,label])=>`<option value="${value}" ${old?.poolType===value?'selected':''}>${label}</option>`).join('')}</select></label><div class="date-entry-grid"><label>${t('积分到期日（可留空）','Credit expiry date (optional)')}<input name="expiryDate" type="date" min="2000-01-01" max="2199-12-31" value="${esc(old?.expiryDate||'')}"></label><label>${t('通常每月几号发放（可留空）','Usual monthly grant day (optional)')}<input name="monthlyDay" type="number" min="1" max="31" step="1" value="${old?.monthlyDay||''}" placeholder="1–31"></label></div><p id="date-type-hint">${t('先选择“按月发放的订阅积分”才可填月度日号。预计不代表到账，短月取月底，之后保留原日号。','Choose monthly subscription credits to set a monthly day. Forecasts do not confirm grants. Short months use their last day, then restore the original day.')}</p><label class="check-label"><input name="notify" type="checkbox" ${old?.notify===false?'':'checked'}>${t('提醒这条日期与预计发放','Remind me about these dates and forecasts')}</label><p id="date-entry-error" class="error" role="status"></p><div class="dialog-actions"><button type="button" data-date-close>${t('取消','Cancel')}</button>${old?`<button type="button" id="date-remove">${t('删除这条日期记录','Delete this date record')}</button>`:''}<button type="submit" class="primary">${t('保存日期','Save dates')}</button></div></form>`;
    const form=editor.querySelector('form'),elements=form.elements;
    function syncType(){elements.monthlyDay.disabled=elements.poolType.value!=='subscription';if(elements.monthlyDay.disabled)elements.monthlyDay.value='';}
    function syncTarget(initial=false){const target=elements.target.value===''?null:targets[Number(elements.target.value)];elements.account.readOnly=!!target;if(target){elements.account.value=target.record.account||t('当前已核实账号','Verified current account');if(!initial||!old?.label)elements.label.value=document.documentElement.lang==='en'?target.pool.labelEn:target.pool.label;}syncType();}
    elements.poolType.onchange=syncType;elements.target.onchange=()=>syncTarget();syncTarget(true);
    editor.querySelector('[data-date-close]').onclick=()=>editor.close();
    let saving=false;
    async function save(remove=false){
      if(saving)return;saving=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{
        const target=elements.target.value===''?null:targets[Number(elements.target.value)];
        const value={id:old?.id,provider,account:elements.account.value,label:elements.label.value,poolType:elements.poolType.value,expiryDate:elements.expiryDate.value||null,
          monthlyDay:elements.monthlyDay.disabled||elements.monthlyDay.value===''?null:Number(elements.monthlyDay.value),recordId:target?.record.id||null,poolId:target?.pool.id||null,notify:elements.notify.checked};
        if(!remove&&!value.expiryDate&&!value.monthlyDay){editor.querySelector('#date-entry-error').textContent=t('请至少填写到期日或每月发放日。','Enter an expiry date or a monthly grant day.');return;}
        const result=await api.action(remove?'remove-user-dates':'user-dates',remove?{id:old.id}:value);if(result?.ok===false)throw Error();editor.close();changed();
      }catch{editor.querySelector('#date-entry-error').textContent=errorText();}
      finally{saving=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }
    form.onsubmit=event=>{event.preventDefault();save();};
    if(old)editor.querySelector('#date-remove').onclick=()=>save(true);
    editor.oncancel=event=>{if(saving)event.preventDefault();};
    editor.onclose=()=>{guideContent();changed();};editor.showModal();
  }
  function datesSection(tool){
    if(tool.id==='codex')return '';
    return `<section class="user-date-section"><div class="user-date-heading"><h3>${t('本人日期与每月预计','Your dates & monthly forecasts')}</h3><button data-action="user-dates" data-provider="${esc(tool.id)}">${t('填写日期','Set dates')}</button></div><p>${t('可直接填写，无需配置文件。日期仅供核实提醒，不会把预计当作到账。','Enter dates here, without configuration files. Dates prompt verification; forecasts never confirm grants.')}</p>${(tool.userDates||[]).map(row=>`<div class="user-date-row"><div><strong>${esc(row.label)}</strong><small>${esc(row.account)} · ${row.recordId?t('绑定已核实账号 / 积分池','Bound to verified account / pool'):t('单独本人记录，未匹配接口账号','Separate user record; not matched to API account')}</small><small>${row.expiryDate?esc(t('到期 ','Expires ')+row.expiryDate):t('到期未填写','No expiry entered')}${row.monthlyDay?' · '+esc(t('预计每月 '+row.monthlyDay+' 日发放','Expected grant on day '+row.monthlyDay)) : ''} · ${row.notify?t('提醒开启','Reminders on'):t('提醒关闭','Reminders off')}</small></div><button data-action="user-dates" data-provider="${esc(tool.id)}" data-id="${row.id}">${t('修改','Edit')}</button></div>`).join('')}</section>`;
  }
  return{update(next){state=next;if(state.onboardingCompleted===false&&!opened)openGuide();else if(guide.open&&!pending)guideContent();},openGuide,openDates,datesSection,get editing(){return editor.open;}};
}};

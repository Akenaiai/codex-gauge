(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const view = query.get('view') || 'preview';
  document.title = view === 'panel' ? 'Codex Gauge · Panel' : 'Codex Gauge';
  const preview = !window.gauge;
  const app = document.getElementById('app');
  let screenName = 'gauge', details = false, newsDetails = false, toast = '', lastRender = '', toastTimer, pointer, suppressClick = false;
  const tabIds = ['codex', 'coding', 'creative'];
  const panelScroll = {};
  const now = Date.now();
  let state = { settings: { language: 'zh-CN', theme: 'dark', topmost: false, notifications: false, autostart: false, resetReminders: true, resetNews: true },
    dark: true, status: 'ready', snapshot: { fiveHour: { remaining: 68, minutes: 300, resetsAt: now + 8640000 },
      weekly: { remaining: 34, minutes: 10080, resetsAt: now + 276480000 }, balance: { amount: 12345.67, available: true, unlimited: false }, credits: [{ key: 'demo', expiresAt: now + 129600000 }], creditCount: 1, fetchedAt: now },
    host: { exists: true, anchored: true, platform: 'win32' }, resetFeed: { status: 'ready', events: [], checkedAt: now, fetchedAt: now }, update: { state: 'idle' }, version: '0.2.1', demo: true };
  const t = (cn, en) => state.settings.language === 'zh-CN' ? cn : en;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
    creative: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m4 18 5-5 4 3 3-5 5 7"/>',
    coding: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    settings: '<path d="M9 2h6l1 3 3 1 3 5-2 2 0 3-4 4-3-1-3 1-4-4v-3l-2-2 3-5 3-1z"/><circle cx="12" cy="12" r="3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    back: '<path d="m14 6-6 6 6 6"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3"/>',
    gauge: '<path d="M4 18a9 9 0 1 1 16 0M12 13l5-6"/><circle cx="12" cy="13" r="1.5"/>',
    ticket: '<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Z"/><path d="M15 7v2m0 2v2m0 2v2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    arrow: '<path d="M6 18 18 6M7 6h11v11"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.gauge}</svg>`;
  const button = (action, label, symbol) => `<button class="icon-button" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon(symbol)}</button>`;
  const pct = w => w && Number.isFinite(w.remaining) ? Math.floor(w.remaining) : '—';
  // Match the displayed whole percentage so a visible 20 or 10 changes immediately.
  const quotaTone = w => !w || !Number.isFinite(w.remaining) || w.remaining < 0 || w.remaining > 100 ? ''
    : Math.floor(w.remaining) <= 10 ? 'quota-critical' : Math.floor(w.remaining) <= 20 ? 'quota-low' : '';
  const quotaColor = (w, normal) => quotaTone(w) === 'quota-critical' ? 'var(--quota-critical)'
    : quotaTone(w) === 'quota-low' ? 'var(--quota-low)' : normal;
  const primary = () => state.snapshot?.fiveHour || state.snapshot?.weekly || state.snapshot?.windows?.[0];
  const stale = () => state.status !== 'ready' || state.snapshot && Date.now() - state.snapshot.fetchedAt > 150000;
  const resetAttention = () => window.resetModel.attention(state.snapshot, state.status === 'ready', state.resetFeed, Date.now());
  const expiringCredit = () => window.resetModel.expiringCredit(state.snapshot, state.status === 'ready', Date.now());
  const pendingAnnouncement = () => state.settings.resetNews && window.resetModel.freshNews(state.resetFeed, Date.now()) &&
    window.resetModel.activeNews(state.resetFeed, Date.now()).some(e => e.status === 'announced' && (!e.until || e.until > Date.now()));
  function duration(delta) {
    const minutes = Math.max(1, Math.ceil(delta / 60000)), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
    if (days) return t(`${days} 天 ${hours % 24} 小时`, `${days}d ${hours % 24}h`);
    return hours ? t(`${hours} 小时 ${minutes % 60} 分钟`, `${hours}h ${minutes % 60}m`) : t(`${minutes} 分钟`, `${minutes}m`);
  }
  const windowLabel = minutes => minutes === 300 ? t('5 小时额度', '5-hour usage') : minutes === 10080 ? t('本周额度', 'Weekly usage') : t(`${minutes} 分钟周期`, `${minutes}-minute window`);
  const eventDate = value => new Date(value).toLocaleString(state.settings.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  function resetPlanning(next, ready, urgent) {
    if (!next) return '';
    return `<div class="reset-planning ${urgent ? 'urgent' : ''}" role="status"><div class="reset-heading">${icon('refresh')}<strong>${t('下次周期重置', 'NEXT SCHEDULED RESET')}</strong><span>${esc(windowLabel(next.minutes))}</span></div>
      <div class="reset-countdown">${next.delta > 0 ? t(`还有 ${duration(next.delta)}`, `In ${duration(next.delta)}`) : t('已到预计时间，等待更新', 'Scheduled time reached; awaiting update')}<span>${t(`剩余 ${Math.floor(next.remaining)}%`, `${Math.floor(next.remaining)}% remaining`)}${!ready ? t(' · 上次读数', ' · last reading') : ''}</span></div>
      ${urgent ? `<p>${t('有待办任务的话，建议在重置前优先用掉这部分额度。', 'Use this quota for pending tasks before it resets.')}</p>` : ''}</div>`;
  }
  function newsContent() {
    const feed = state.resetFeed;
    if (!state.settings.resetNews) return `<div class="reset-news"><div class="news-heading">${t('临时重置与发卡', 'RESET ANNOUNCEMENTS')}</div><p>${t('消息展示已关闭，可在设置中开启。', 'Announcements are disabled. Enable them in settings.')}</p></div>`;
    const fresh = window.resetModel.freshNews(feed, Date.now());
    const events = window.resetModel.activeNews(feed, Date.now());
    const upcoming = fresh && events.some(e => e.status === 'announced' && (!e.until || e.until > Date.now()));
    const upcomingReset = upcoming && events.some(e => e.kindKnown && e.type === 'direct_reset' && e.status === 'announced' && (!e.until || e.until > Date.now()));
    const entries = events.slice(0, newsDetails ? 3 : 1).map(e => {
      const credit = e.type === 'reset_credit';
      const label = e.kindKnown ? (credit ? t('重置卡发放', 'Reset credits') : t('额度重置', 'Usage reset')) : t('重置消息（形式待核对）', 'Reset event (type unspecified)');
      const status = e.status === 'confirmed' ? (e.confirmation === 'source_post' ? t('原帖确认', 'Source confirmed') : e.confirmation === 'receipt_review' ? t('回执整理', 'Receipt review') : t('确认依据待核对', 'Basis unspecified')) : t('预告', 'Announced');
      let timing;
      if (e.status === 'confirmed') timing = t(`最近确认 ${eventDate(e.updatedAt)}`, `Latest confirmation ${eventDate(e.updatedAt)}`);
      else if (!e.until) timing = t('具体时间待定', 'Timing unspecified');
      else if (e.until <= Date.now()) timing = t('预告时间已过，等待确认', 'Announced window elapsed; awaiting confirmation');
      else if (e.precision === 'exact' && !e.timeInferred) timing = t(`预计 ${eventDate(e.until)}，还有 ${duration(e.until - Date.now())}`, `Expected ${eventDate(e.until)}, in ${duration(e.until - Date.now())}`);
      else if (e.precision === 'window' && e.from) timing = t(`预计 ${eventDate(e.from)} 至 ${eventDate(e.until)}`, `Expected between ${eventDate(e.from)} and ${eventDate(e.until)}`);
      else timing = e.timeInferred ? t(`估计时段至 ${eventDate(e.until)}，以原帖为准`, `Estimated window through ${eventDate(e.until)}; check source`) : t(`预告最晚 ${eventDate(e.until)} 前，可能提前`, `Announced by ${eventDate(e.until)}; may happen earlier`);
      const scope = e.scopeKnown ? t(e.scope || '适用范围见原帖', 'Check source for eligible accounts') : t('适用账户范围尚未明确', 'Eligible accounts unspecified');
      return `<div class="news-event"><div class="news-event-title"><strong>${esc(label)}</strong><span>${status}</span></div><p>${esc(timing)}</p><div class="news-source"><span>${esc(scope)}</span><button class="text-button" data-action="reset-news-source" data-event="${esc(e.id)}">${e.sourceUrl ? t('原帖 ↗', 'Source ↗') : t('消息页 ↗', 'Details ↗')}</button></div></div>`;
    }).join('');
    const status = feed?.status === 'disabled' || feed?.status === 'connecting' || !feed ? t('正在读取消息', 'Checking announcements') : !fresh ? t('消息源暂未更新，保留上次消息', 'Source unavailable or stale; showing last information') : upcomingReset ? t('有待执行预告，请先核对用卡时机', 'Upcoming reset; check before using a credit') : upcoming ? t('有待执行的消息预告，详情见原帖', 'Announcement pending; check the source for details') : t('当前没有待执行的重置预告', 'No upcoming reset has been announced');
    return `<section class="reset-news ${upcoming ? 'prominent' : ''}" ${upcoming ? 'role="status"' : ''}><div class="news-heading"><span>${upcoming ? icon('alert') : ''}${upcomingReset ? t('有重置预告', 'UPCOMING RESET') : upcoming ? t('有新预告', 'NEW ANNOUNCEMENT') : t('临时重置与发卡', 'RESET ANNOUNCEMENTS')}</span>${events.length > 1 ? `<button class="text-button" data-action="news-details">${newsDetails ? t('收起', 'Less') : t('更多', 'More')}</button>` : ''}</div><p class="${fresh ? '' : 'news-stale'}">${status}</p>${entries}<div class="news-attribution">${t('AIHOT 整理 · 账户是否生效以实际额度为准', 'Via AIHOT · Account changes require actual usage data')}${feed?.checkedAt ? `<br>${t('来源核对于 ', 'Source checked ')}${esc(eventDate(feed.checkedAt))}` : ''}</div></section>`;
  }
  function point(angle, radius, center = 80) { const a = angle * Math.PI / 180; return [center + radius * Math.cos(a), center + radius * Math.sin(a)]; }
  function arc(radius, value, center = 80) {
    const a = point(135, radius, center), b = point(135 + 270 * Math.max(.0001, Math.min(100, value)) / 100, radius, center);
    return `M${a[0]},${a[1]} A${radius},${radius} 0 ${value > 66.666 ? 1 : 0} 1 ${b[0]},${b[1]}`;
  }
  function dial(w, label, small = false) {
    const value = w?.remaining ?? 0;
    const color = quotaColor(w, small ? 'var(--cool)' : 'var(--accent)');
    let ticks = '';
    for (let i = 0; i <= 40; i++) {
      const a = point(135 + i * 6.75, 70), b = point(135 + i * 6.75, i % 5 === 0 ? 62 : 66);
      ticks += `<path d="M${a}L${b}" stroke="${w && i <= value / 2.5 ? color : 'var(--line)'}" stroke-width="${i % 5 === 0 ? 1.5 : 1}"/>`;
    }
    const a = point(135 + value * 2.7, 54), b = point(135 + value * 2.7, 60);
    return `<div class="dial ${small ? 'small' : ''} ${quotaTone(w)}" role="img" aria-label="${esc(label)} ${pct(w)}%">
      <svg viewBox="0 0 160 145" aria-hidden="true"><path d="${arc(57, 100)}" fill="none" stroke="var(--subtle)" stroke-width="2"/>
      <path d="${arc(57, value)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>${ticks}
      ${w ? `<path d="M${a}L${b}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>` : ''}
      <text class="axis-label" x="38" y="138" text-anchor="middle">0</text><text class="axis-label" x="122" y="138" text-anchor="middle">100</text></svg>
      <div class="dial-value">${pct(w)}<sup>${w ? '%' : ''}</sup></div><div class="dial-label">${esc(label)}</div></div>`;
  }
  function mini() {
    const p = primary(), value = p?.remaining ?? 0, weekly = state.snapshot?.weekly;
    const color = quotaColor(p, 'var(--accent)');
    const expiry = expiringCredit(), reminder = resetAttention() || pendingAnnouncement();
    const reminderLabel = expiry ? (expiry.stale ? t('重置卡即将到期（上次数据），展开查看', 'Reset credit expiring (last reading); open for details') : t('重置卡即将到期，展开查看', 'Reset credit expiring; open for details')) : t('有重置提醒，展开查看', 'Reset reminder; open for details');
    const quotaLabel = quotaTone(p) ? t(`剩余 ${pct(p)}%，${quotaTone(p) === 'quota-critical' ? '额度即将用尽' : '额度偏低'}`, `${pct(p)}% remaining; ${quotaTone(p) === 'quota-critical' ? 'quota nearly depleted' : 'quota low'}`) + (stale() ? t('（上次读数）', ' (last reading)') : '') : '';
    const label = [quotaLabel, expiry || reminder ? reminderLabel : t('查看 Codex 额度', 'View Codex usage')].filter(Boolean).join(' · ');
    const expiring=state.creative?.rows?.filter(r=>r.expiring)||[],creativeLabel=t(`创作积分临期：${expiring.map(r=>r.name).join('、')}，点击查看`,`Creative credits expiring: ${expiring.map(r=>r.name).join(', ')}; view details`);
    return `<div class="micro-wrap"><button class="micro ${quotaTone(p)} ${stale() ? 'stale' : ''} ${expiry ? 'credit-urgent' : reminder ? 'has-reset' : ''}" data-action="toggle" aria-label="${esc(label)}" title="${esc(label + ' · ' + t('悬停查看 · 拖动调整 · 双击归位', 'Hover to view · Drag to move · Double-click to reset'))}">
      <svg viewBox="0 0 46 46" aria-hidden="true"><path d="${arc(19.5, 100, 23)}" fill="none" stroke="var(--line)" stroke-width="1.5"/>
      <path d="${arc(19.5, value, 23)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      <path d="${arc(16, weekly?.remaining ?? 0, 23)}" fill="none" stroke="${quotaColor(weekly, 'var(--cool)')}" stroke-width="1" opacity=".7"/>
      ${[0, 25, 50, 75, 100].map(v => { const a = point(135 + v * 2.7, 20, 23), b = point(135 + v * 2.7, 22, 23); return `<path d="M${a}L${b}" stroke="var(--muted)" stroke-width=".7"/>`; }).join('')}</svg>
      <span class="reading">${pct(p)}</span><span class="unit">${p?.minutes === 10080 ? 'WEEK' : p?.minutes === 300 ? '5H' : p ? `${p.minutes}M` : 'CODEX'}</span>${expiry || reminder ? `<span class="reset-dot ${expiry ? 'credit-dot' : ''}" role="img" aria-label="${esc(reminderLabel)}">!</span>` : ''}${stale() ? '<span class="live-dot"></span>' : ''}</button>${expiring.length?`<button class="creative-dot ${expiring.some(r=>r.criticalExpiry)?'is-critical':''}" data-action="open-creative" aria-label="${esc(creativeLabel)}" title="${esc(creativeLabel)}">${icon('creative')}</button>`:''}</div>`;
  }
  function time(w) {
    if (!w?.resetsAt) return { time: '—', hint: t('重置时间未知', 'Reset time unavailable') };
    const delta = w.resetsAt - Date.now();
    if (delta <= 0) return { time: t('等待更新', 'Awaiting update'), hint: t('已到预计重置时间', 'Scheduled reset reached') };
    const date = new Date(w.resetsAt), locale = state.settings.language;
    const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const days = Math.floor(delta / 86400000), hours = Math.floor(delta % 86400000 / 3600000), minutes = Math.ceil(delta % 3600000 / 60000);
    return { time: w.minutes >= 1440 ? date.toLocaleDateString(locale, { weekday: 'short' }) + ' ' + time : time,
      hint: days > 0 ? t(`${days} 天 ${hours} 小时后重置`, `Resets in ${days}d ${hours}h`) : hours > 0 ? t(`${hours} 小时 ${minutes} 分后重置`, `Resets in ${hours}h ${minutes}m`) : t(`${minutes} 分钟后重置`, `Resets in ${minutes}m`) };
  }
  function creditExpiry(expiresAt) {
    const delta = expiresAt - Date.now();
    if (delta <= 0) return t('最近一张已到期，等待更新', 'Next credit expired; awaiting update');
    if (delta < 3600000) return t('最近一张还有不到 1 小时到期', 'Next expires in less than 1h');
    const totalHours = Math.ceil(delta / 3600000);
    const days = Math.floor(totalHours / 24), hours = totalHours % 24;
    return days > 0 ? t(`最近一张还有约 ${days} 天 ${hours} 小时到期`, `Next expires in ~${days}d ${hours}h`)
      : t(`最近一张还有约 ${hours} 小时到期`, `Next expires in ~${hours}h`);
  }
  function balanceCard(s) {
    const balance = s.balance, amount = balance?.amount;
    const known = Number.isFinite(amount) && amount >= 0;
    const number = balance?.unlimited ? t('不限量', 'Unlimited') : !known ? '—'
      : amount > 0 && amount < 1 ? '<1' : Math.floor(amount).toLocaleString(state.settings.language);
    const lastReading = stale();
    const hint = lastReading ? t('上次读取的余额', 'Last balance reading')
      : !known && !balance?.unlimited ? t('余额暂未读到', 'Balance unavailable')
      : balance?.available === false && amount > 0 ? t('可用情况待刷新确认', 'Availability awaiting refresh')
      : t('用于套餐限额之外的使用', 'For usage beyond plan limits');
    const exact = known ? amount.toLocaleString(state.settings.language, { maximumFractionDigits: 10 }) : number;
    return `<div class="balance-card ${lastReading ? 'balance-stale' : ''}"><div class="balance-info"><h2>${t('额度余额', 'CREDIT BALANCE')}</h2><p>${hint}</p></div><strong class="balance-amount" title="${esc(t('额度余额：', 'Credit balance: ') + exact)}">${esc(number)}</strong></div>`;
  }
  function creditCard(s) {
    const expiry = expiringCredit();
    const lastReading = state.status !== 'ready' || !window.resetModel.freshQuota(s, Date.now());
    const recordedAt = Number.isFinite(s.fetchedAt) ? new Date(s.fetchedAt).toLocaleString(state.settings.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    return `<div class="credit-card ${expiry ? 'expiring' : ''} ${expiry?.critical ? 'critical' : ''}" ${expiry ? 'role="status"' : ''}><span class="ticket-icon">${icon(expiry ? 'alert' : 'ticket')}</span><div class="credit-info">
      ${expiry ? `<div class="expiry-label">${expiry.critical ? t('重置卡即将失效', 'RESET CREDIT EXPIRES SOON') : t('重置卡临期提醒', 'RESET CREDIT EXPIRING')}<span>${expiry.critical ? t('24 小时内', 'WITHIN 24H') : t('48 小时内', 'WITHIN 48H')}</span></div>` : ''}
      ${lastReading ? `<p class="credit-last-reading">${esc(t(`上次数据 · ${recordedAt}，实际可用情况待刷新确认`, `Last reading · ${recordedAt}; availability awaiting refresh`))}</p>` : ''}
      <div class="credit-title"><strong>${s.creditCount ?? '—'}</strong>${t('次重置机会', 'reset credits')}</div>
      <div class="credit-caption">${s.credits.length ? creditExpiry(expiry?.expiresAt || s.credits[0].expiresAt) : s.creditCount == null ? t('接口尚未提供此信息', 'Not provided by the service') : t('仅查看，不自动使用', 'Read-only. Never used automatically.')}</div>
      ${expiry ? `<p class="expiry-guidance">${expiry.stale ? t('上次记录的到期时间仍在倒计时，连接恢复后会重新核对。', 'The last recorded expiry keeps counting down and will be checked when reconnected.') : t('请结合额度重置时间，尽快安排使用。', 'Plan its use soon, taking the usage reset time into account.')}</p>` : ''}</div>
      ${s.credits.length ? `<button class="text-button" data-action="credits">${details ? t('收起', 'Hide') : t('查看', 'Details')}</button>` : ''}</div>
      ${details ? `<div class="credit-list">${s.credits.map((c, i) => `${i + 1}. ${new Date(c.expiresAt).toLocaleString(state.settings.language)} ${t('到期', 'expiry')}`).join('<br>')}</div>` : ''}`;
  }
  function errors() {
    const pair = {
      connecting: ['正在连接本机 Codex', 'Connecting to local Codex'],
      cli_missing: ['未找到 Codex CLI', 'Codex CLI not found'], login_required: ['请先登录 Codex', 'Sign in to Codex first'],
      account_changed: ['账户已切换，正在重新读取', 'Account changed. Refreshing…'],
      no_quota: ['暂时没有可用额度数据', 'Usage data is unavailable'], invalid_quota: ['额度数据暂时无法识别', 'Usage format is unavailable'],
      timeout: ['读取超时，可以重试', 'Reading timed out. Try again'], offline: ['暂时无法连接额度服务', 'Usage service is offline']
    }[state.status] || ['正在读取额度', 'Reading usage'];
    return t(...pair);
  }
  function gaugeContent() {
    const s = state.snapshot;
    if (!s) return `<div class="empty">${icon(state.status === 'connecting' ? 'gauge' : 'alert')}<h1>${errors()}</h1>
      <p>${state.status === 'cli_missing' ? t('请安装官方 Codex CLI 并登录，然后点击重试。自定义安装可设置 CODEX_GAUGE_CLI。', 'Install and sign in to the official Codex CLI, then retry. Custom installs can set CODEX_GAUGE_CLI.') : t('沿用本机 Codex 登录，只读取额度。不会创建对话或自动使用重置卡。', 'Uses your local Codex sign-in. Only reads usage; never creates chats or spends reset credits.')}</p>
      <button class="primary" data-action="refresh">${t('重新读取', 'Try again')}</button></div>${newsContent()}${!state.host.anchored ? `<p class="notice">${t('尚未定位到个人头像。打开 Codex 后会自动跟随，也可以从托盘查看。', 'Profile anchor not found. Open Codex to attach, or use the tray to view usage.')}</p>` : ''}`;
    const five = s.fiveHour, week = s.weekly;
    const first = five || week || s.windows?.[0], second = five ? week : null;
    const firstLabel = first?.minutes === 10080 ? t('本周', 'THIS WEEK') : first?.minutes === 300 ? t('5 小时', '5 HOURS') : t(`${first?.minutes ?? '—'} 分钟`, `${first?.minutes ?? '—'} MIN`);
    const secondLabel = five ? t('本周', 'THIS WEEK') : t('5 小时', '5 HOURS');
    const a = time(first), b = time(second);
    const unknown = !five && !week;
    const now = Date.now(), ready = state.status === 'ready' && window.resetModel.freshQuota(s, now);
    const windows = window.resetModel.resetWindows(s, now);
    const priorityReset = ready && windows.find(window.resetModel.resetStage);
    const planning = resetPlanning(priorityReset || windows.find(w => w.delta > 0) || windows[0], ready, priorityReset);
    const priorityCredit = !!expiringCredit(), priorityNews = pendingAnnouncement();
    return `<div class="eyebrow"><span>${t('剩余额度', 'REMAINING USAGE')}</span><span class="status ${stale() ? 'warn' : ''}"><i></i>${state.demo ? t('示例数据', 'DEMO DATA') : stale() ? t('上次读数', 'LAST READING') : t('已同步', 'LIVE')}</span></div>
      ${priorityCredit ? creditCard(s) : ''}${priorityNews ? newsContent() : ''}${priorityReset ? planning : ''}
      ${unknown ? `<p class="notice">${t('当前账户返回其他周期，请等待适配。', 'This account returns a different usage window.')}</p>` : ''}
      <div class="dials">${dial(first, firstLabel)}${dial(second, secondLabel, true)}</div>
      <div class="resets"><div><div class="reset-time">${a.time}</div><div class="reset-hint">${a.hint}</div></div><div><div class="reset-time">${b.time}</div><div class="reset-hint">${b.hint}</div></div></div>
      ${!priorityReset ? planning : ''}
      ${balanceCard(s)}
      ${!priorityCredit ? creditCard(s) : ''}${!priorityNews ? newsContent() : ''}
      ${stale() ? `<div class="notice warn">${errors()} · ${t('当前为上次成功读取的数据', 'Showing the last successful reading')}</div>` : ''}
      ${state.host.platform === 'darwin' ? `<div class="notice">${t('Mac 预览版：当前为自由悬浮，头像定位尚待 Mac 实机适配。', 'Mac preview: floating mode. Profile anchoring needs on-device adaptation.')}</div>` : ''}`;
  }
  const toggle = (key, label, detail) => `<div class="setting"><div><div class="label">${label}</div><div class="detail">${detail}</div></div><button class="toggle" role="switch" data-setting="${key}" aria-label="${label}" aria-checked="${!!state.settings[key]}"></button></div>`;
  function settingsContent() {
    const s = state.settings;
    return `<h1 class="settings-title">${t('仪表设置', 'Gauge settings')}</h1><p class="settings-sub">${t('按你的工作习惯，安静地待在手边。', 'A quiet companion, set up your way.')}</p>
      <div class="setting"><label class="label" for="theme">${t('外观', 'Appearance')}</label><select id="theme" data-select="theme">${[['system', t('跟随系统', 'System')], ['dark', t('石墨黑', 'Graphite')], ['light', t('瓷白', 'Porcelain')]].map(([v, label]) => `<option value="${v}" ${v === s.theme ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="setting"><label class="label" for="language">${t('语言', 'Language')}</label><select id="language" data-select="language"><option value="zh-CN" ${s.language === 'zh-CN' ? 'selected' : ''}>简体中文</option><option value="en" ${s.language === 'en' ? 'selected' : ''}>English</option></select></div>
      ${toggle('topmost', t('保持置顶', 'Keep on top'), t('Codex 最小化时也能看见', 'Visible while Codex is minimized'))}
      ${toggle('autostart', state.host.platform === 'win32' ? t('随 Codex 启动', 'Start with Codex') : t('开机启动', 'Launch at login'), state.host.platform === 'win32' ? t('打开 Codex 自动运行；后台助手随登录启动', 'Open with Codex; helper starts at sign-in') : t('登录电脑后自动运行', 'Start when you sign in'))}
      ${toggle('notifications', t('Codex 重置卡到期提醒', 'Codex reset credit expiry'), t('到期前 48 / 24 小时，静默通知', 'Silent notices within 48 / 24 hours'))}
      ${toggle('resetReminders', t('Codex 额度重置提醒', 'Codex usage reset reminders'), t('余量 ≥30% 时，周额度提前 24 小时提醒。各周期另有 4、2、1 小时提醒，也通知新预告。', 'At ≥30% remaining, weekly quota gets a 24h reminder. All windows have 4h, 2h and 1h reminders. Also notify for new announcements.'))}
      ${toggle('resetNews', t('临时重置与发卡消息', 'Public reset announcements'), t('匿名读取 AIHOT，每 5 分钟核对；仅程序运行时', 'Read AIHOT anonymously every 5 min while the app is active'))}
      ${toggle('hideCursor', t('隐藏 Cursor', 'Hide Cursor'), t('在编程工具看板中隐藏 Cursor，并暂停读取', 'Hide Cursor in Coding tools and pause its reads'))}
      <div class="settings-actions"><button class="text-button" data-action="reset-position">${t('恢复默认位置', 'Reset position')}</button><button class="text-button" data-action="check-update">${t('检查更新', 'Check for updates')}</button><button class="text-button" data-action="source">GitHub ↗</button></div>
      ${state.update.state !== 'idle' ? `<div class="notice">${updateLabel()}${state.update.state === 'available' ? `<br><button class="text-button" data-action="releases">${t('前往下载更新', 'Download update')} ↗</button>` : ''}</div>` : ''}
      <div class="about">Codex Gauge ${esc(state.version)} · MIT<br>${t('本机只读 · 无分析追踪 · 不发送模型请求', 'Local, read-only · No analytics · No model requests')}<br>${t('第三方工具，与 OpenAI 无隶属关系。', 'Independent tool, not affiliated with OpenAI.')}</div>`;
  }
  function updateLabel() {
    return ({ checking: t('正在检查…', 'Checking…'), current: t('当前已是最新版本', 'You are up to date'), available: t(`发现新版本 ${state.update.version}`, `Version ${state.update.version} is available`),
      failed: t('检查失败，请稍后重试', 'Check failed. Try again later'), unreleased: t('暂时没有已发布的正式版本', 'No stable release is published yet') })[state.update.state] || '';
  }
  function panelMarkup() {
    const tab = state.settings.panelFace || 'codex';
    const titles = { codex: 'Codex', coding: t('编程工具', 'Coding tools'), creative: t('创作积分', 'Creative credits') };
    const symbols = { codex: 'gauge', coding: 'coding', creative: 'creative' };
    const settings = screenName === 'settings';
    const header = `<header class="header"><div class="brand-mark">${icon(symbols[tab])}</div><div class="brand">${t('刻度', 'GAUGE')}<small>CODEX GAUGE</small></div><span class="spacer"></span>
      ${button('credit-center', t('全部 AI 工具额度', 'All AI tool quotas'), 'gauge')}${settings ? button('back', t('返回额度', 'Back to usage'), 'back') : button('settings-page', t('设置', 'Settings'), 'settings')}${button('close', t('关闭面板', 'Close panel'), 'close')}</header>`;
    const tabs = `<div class="panel-tabs" role="tablist" aria-label="${t('额度看板', 'Quota panels')}">${tabIds.map(id => `<button id="tab-${id}" role="tab" type="button" data-action="panel-tab" data-event="${id}" aria-controls="panel-${id}" aria-selected="${!settings && tab === id}" tabindex="${tab === id ? 0 : -1}">${icon(symbols[id])}<span>${titles[id]}</span>${id === 'creative' && state.creative?.expiring ? `<span class="creative-entry-count" aria-label="${t(`${state.creative.expiring} 项临期`, `${state.creative.expiring} expiring`)}">${state.creative.expiring}</span>` : ''}</button>`).join('')}</div>`;
    let body;
    if (!settings && tab === 'creative') body = window.creativePanel.markup({ state, t, esc, icon });
    else if (!settings && tab === 'coding') body = codingMarkup();
    else body = `
      <div class="content">${screenName === 'settings' ? settingsContent() : gaugeContent()}${notificationNotice()}${state.settingsError ? `<p class="notice warn">${t('设置未保存，原有设置文件已保留。', 'Settings were not saved. The existing file is preserved.')}</p>` : ''}${state.startupError ? `<p class="notice warn">${t('自动启动登记失败，请在设置中重试。', 'Automatic startup registration failed. Retry in settings.')}</p>` : ''}</div>
      <footer class="footer"><span class="footer-left">${icon('lock')}<span>${state.demo ? `<span class="demo-label">${t('设计预览 · 示例数据', 'DESIGN PREVIEW · DEMO DATA')}</span>` : state.snapshot ? t('同步于 ', 'Updated ') + new Date(state.snapshot.fetchedAt).toLocaleTimeString(state.settings.language, { hour: '2-digit', minute: '2-digit', hour12: false }) : t('本机只读连接', 'Local read-only connection')}</span></span>${button('refresh', t('刷新额度', 'Refresh usage'), 'refresh')}</footer>
      `;
    return `<section class="panel ${!settings && tab === 'creative' ? 'creative-panel' : ''}" data-section="${settings ? 'settings' : tab}">${header}${tabs}
      ${tabIds.map(id => `<div class="panel-tab-body" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" ${!settings && tab === id ? '' : 'hidden'}>${!settings && tab === id ? body : ''}</div>`).join('')}
      ${settings ? `<div class="panel-tab-body">${body}</div>` : ''}${toast ? `<div class="toast" role="status">${esc(toast)}</div>` : ''}</section>`;
  }
  function codingMarkup() {
    const now = Date.now();
    const data = state.coding || {};
    const cursor = data.cursor || { status: 'idle' };
    const qoder = data.qoder || { status: 'idle' };
    const kilo = data.kilo || { status: 'idle' };
    const devin = data.devin || { status: 'idle' };
    const reading = cursor.reading;
    const date = (value, options) => new Date(value).toLocaleString(state.settings.language, options);
    const updated = value => date(value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const status = {
      idle: t('待读取', 'Waiting to read'), ready: t('客户端读数', 'Desktop reading'),
      closed: t('Cursor 未打开', 'Cursor is closed'),
      usage_hidden: t('当前用量不可见', 'Usage is not visible'),
      multiple: t('检测到多个用量页', 'Multiple usage pages'),
      unsupported: t('仅支持 Windows', 'Windows only'),
      unavailable: t('读取失败', 'Read failed')
    }[cursor.status];
    const instructions = cursor.status === 'multiple' ? t('请只保留一个 Cursor 用量页。', 'Leave only one Cursor usage page open.') :
      cursor.status === 'unsupported' ? t('Cursor 客户端读取目前适用于 Windows。', 'Cursor desktop reading is currently available on Windows.') :
      t('在 Cursor 打开「设置 → Plan & Usage」，看到用量条后回这里刷新。', 'Open Settings → Plan & Usage in Cursor. Once the usage bars appear, refresh here.');
    const labels = {
      empty: t('已用光', 'Used up'), critical: t('余量告急', 'Critically low'),
      low: t('快用完', 'Running low'), stale: t('待刷新', 'Needs refresh'),
      unknown: t('余量未知', 'Usage unknown')
    };
    const counters = { reset: 0, low: 0, empty: 0 };
    const { resetStatus, poolStatus } = window.codingStatus;
    const format = new Intl.NumberFormat(state.settings.language, { maximumFractionDigits: 2 });
    const usd = new Intl.NumberFormat(state.settings.language, { style: 'currency', currency: 'USD' });
    const dollars = amount => amount > 0 && amount < 0.01 ? '<' + usd.format(0.01) : usd.format(amount);
    function resetLine(reset, label, stale) {
      const near = reset?.near && !stale;
      if (near) counters.reset++;
      const caption = reset?.elapsed ? t('重置已过 · 待刷新', 'Reset passed · Refresh') :
        near && reset.kind === 'date' ? t('今天重置', 'Resets today') :
        near ? t(`${duration(reset.time)}后重置`, `Resets in ${duration(reset.time)}`) : t('重置', 'Resets');
      return `<p class="coding-reset ${near ? 'is-near' : ''}">${icon('clock')}<span><b>${esc(caption)}</b><span> · ${esc(label)}</span></span></p>`;
    }
    function meters(pools, fetchedAt, stale, sharedReset = null) {
      return (pools || []).map(p => {
        const reset = p.resetsAt || p.resetDate ? resetStatus({ ...p, fetchedAt }, now) : sharedReset;
        const expiry = p.expiryDate ? resetStatus({ resetDate: p.expiryDate, fetchedAt }, now) : null;
        const level = poolStatus(p.remaining, stale || expiry?.elapsed, reset);
        const label = esc(t(p.label, p.labelEn));
        if (level === 'empty') counters.empty++;
        if (level === 'low' || level === 'critical') counters.low++;
        const creditFormat = p.unit === 'USD' ? dollars : amount => format.format(amount);
        const reading = level === 'unknown' ? '—' : Number.isFinite(p.credits) ? `${creditFormat(p.credits)} / ${creditFormat(p.total)}` :
          p.remaining > 0 && p.remaining < 1 ? '<1%' : `${format.format(p.remaining)}%`;
        return `<div class="coding-meter is-${level}"><div class="coding-meter-head"><span>${label}</span><strong>${esc(reading)} <small>${t('剩余', 'left')}</small></strong></div>
          ${level === 'unknown' ? '' : `<progress max="100" value="${p.remaining}" aria-label="${label}"></progress>`}
          <div class="coding-signals">${level === 'normal' ? '' : `<span class="coding-state">${icon(level === 'stale' ? 'clock' : 'alert')}${labels[level]}</span>`}
          ${p.resetsAt ? resetLine(reset, (p.resetApproximate ? t('约 ', '≈ ') : '') + updated(p.resetsAt), stale) : reset && p.resetDate ? resetLine(reset, p.resetDate, stale) : ''}
          ${expiry ? `<p class="coding-reset">${icon('clock')}<span><b>${expiry.elapsed ? t('有效期已过', 'Expiry passed') : t('有效期至', 'Expires on')}</b><span> · ${esc(p.expiryDate)}</span></span></p>` : ''}</div></div>`;
      }).join('');
    }
    function card({ name, pools, resetDate, fetchedAt, stale, hint, message, balance, organization, balanceLabel, plans }) {
      const sharedReset = resetStatus({ resetDate, fetchedAt }, now);
      let balanceRow = '';
      if (Number.isFinite(balance)) {
        const empty = balance <= 0;
        if (empty && !stale) counters.empty++;
        balanceRow = `<div class="coding-meter is-${stale ? 'stale' : empty ? 'empty' : 'normal'}"><div class="coding-meter-head">
          <span>${esc(balanceLabel || (organization ? t('团队积分余额', 'Team credit balance') : t('个人积分余额', 'Personal credit balance')))}</span>
          <strong>${esc(dollars(balance))}</strong></div>
          ${empty && !stale ? `<div class="coding-signals"><span class="coding-state">${icon('alert')}${labels.empty}</span></div>` : ''}</div>`;
      } else if (balanceLabel) {
        balanceRow = `<div class="coding-meter is-unknown"><div class="coding-meter-head"><span>${esc(balanceLabel)}</span>
          <small>${t('未提供', 'Not reported')}</small></div></div>`;
      }
      const planRows = (plans || []).map(plan => `<section class="coding-subscription"><b>${esc(plan.name)}</b>
        ${meters(plan.pools, fetchedAt, stale) || `<p class="coding-meta">${t('暂未读到套餐额度', 'Plan allowance unavailable')}</p>`}
        ${plan.billingAt ? `<p class="coding-meta">${t('下次账单', 'Next billing')} · ${esc(date(plan.billingAt,
          { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }))}</p>` : ''}
        </section>`).join('');
      return `<article class="creative-row coding-card"><div class="creative-row-top"><div><strong>${esc(name)}</strong></div>
        <span class="creative-status">${esc(hint)}</span></div>${meters(pools, fetchedAt, stale, sharedReset)}${balanceRow}${planRows}
        ${resetDate ? resetLine(sharedReset, resetDate, stale) : ''}
        ${fetchedAt ? `<p class="coding-meta">${t('上次读取', 'Last read')} · ${esc(updated(fetchedAt))}</p>` : ''}
        ${message ? `<p class="coding-meta">${esc(message)}</p>` : ''}</article>`;
    }
    const cursorCard = state.settings.hideCursor ? '' : card({ name: 'Cursor', ...reading, stale: cursor.status !== 'ready',
      hint: data.busy ? t('正在读取…', 'Reading…') : status, message: cursor.status === 'ready' ? '' : instructions });
    const qoderHint = {
      ready: t('客户端读数', 'Desktop reading'), closed: t('Qoder 未打开', 'Qoder is closed'),
      usage_hidden: t('用量面板未打开', 'Usage panel is closed'), multiple: t('检测到多个用量面板', 'Multiple usage panels'),
      empty: t('无可显示的额度', 'No quota to show'), unavailable: t('读取失败', 'Read failed')
    }[qoder.status];
    const qoderMessage = qoder.status === 'multiple' ? t('请只保留一个 Qoder 用量面板。', 'Leave only one Qoder usage panel open.') :
      ['ready', 'empty'].includes(qoder.status) ? '' : t('在 Qoder 左下角打开「查看我的用量」。', 'Open “View my usage” in the bottom-left corner of Qoder.');
    const qoderCard = qoder.reading || !['idle', 'unsupported', 'closed'].includes(qoder.status) ? card({
      name: 'Qoder', ...qoder.reading, stale: qoder.status !== 'ready', message: qoderMessage,
      hint: data.busy ? t('正在读取…', 'Reading…') : qoderHint
    }) : '';
    const kiloCard = ['ready', 'sign_in', 'unavailable'].includes(kilo.status) ? card({
      name: 'Kilo', ...kilo.reading, stale: data.kiloBusy,
      balanceLabel: kilo.status === 'ready' && !Number.isFinite(kilo.reading?.balance) ?
        t('个人积分余额', 'Personal credit balance') : null,
      hint: data.kiloBusy ? t('正在刷新…', 'Refreshing…') : {
        ready: kilo.reading?.plans?.length ? t('官方读数', 'Official reading') : t('官方余额', 'Official balance'),
        sign_in: t('登录失效', 'Sign-in expired'), unavailable: t('读取失败', 'Read failed')
      }[kilo.status],
      message: kilo.status === 'sign_in' ? t('请在 Kilo 重新登录后刷新。', 'Sign in to Kilo again and refresh.') :
        kilo.reading?.subscriptionsUnavailable ? t('部分订阅信息暂时无法读取。', 'Some subscription data is temporarily unavailable.') : ''
    }) : '';
    const devinCard = ['ready', 'sign_in', 'unavailable'].includes(devin.status) ? card({
      name: 'Devin', ...devin.reading, stale: data.devinBusy,
      balanceLabel: devin.reading ? t('额外用量余额', 'Extra usage balance') : null,
      hint: data.devinBusy ? t('正在刷新…', 'Refreshing…') : {
        ready: t('CLI 读数', 'CLI reading'), sign_in: t('CLI 未登录', 'CLI sign-in required'), unavailable: t('读取失败', 'Read failed')
      }[devin.status],
      message: devin.status === 'sign_in' ? t('登录 Devin CLI 后刷新。', 'Sign in to Devin CLI and refresh.') : ''
    }) : '';
    const rows = data.rows || [];
    const otherCards = rows.map(row => card({ ...row,
      hint: row.querying ? t('正在刷新…', 'Refreshing…') : row.stale ? t('待刷新', 'Needs refresh') : t('额度中心', 'Credit center'),
      message: row.stale && !row.querying && row.error ? row.error === 'credential_storage_failed'
        ? t('暂时无法读取已保存的连接凭据。', 'The saved connection credential could not be read.')
        : t('最近一次刷新失败，以上是上次读数。', 'The last refresh failed. Showing the previous reading.') : ''
    })).join('');
    const summary = [
      ['reset', 'clock', t('即将重置', 'Reset soon')],
      ['low', 'alert', t('低余量', 'Low quota')],
      ['empty', 'alert', t('已用光', 'Used up')]
    ].map(([id, symbol, label]) => `<span class="coding-total is-${id} ${counters[id] ? 'has-count' : ''}"><strong>${counters[id]}</strong><span>${icon(symbol)}${label}</span></span>`).join('');
    return `<div class="coding-overview"><div class="coding-summary" aria-label="${t('编程额度状态概览', 'Coding quota summary')}">${summary}</div>
      <p class="coding-key">${t('灰色条表示上次读数，不计入提醒。', 'Gray bars show previous readings and are excluded from alerts.')}</p></div>
      <div class="content coding-content">
      ${state.demo ? `<p class="notice demo-label">${t('示例数据', 'Sample data')}</p>` : ''}
      <div class="creative-list">${cursorCard + qoderCard + devinCard + kiloCard + otherCards || `<p class="notice">${t('暂无可显示的编程额度。', 'No coding quota readings to show.')}</p>`}</div></div>
      <footer class="footer"><button class="text-button" data-action="credit-center">${t('额度中心', 'Credit center')} ↗</button>
        <button class="text-button coding-refresh" data-action="coding-refresh" ${data.busy || data.kiloBusy || data.devinBusy || rows.some(row => row.querying) ? 'disabled' : ''}>${icon('refresh')}${t('刷新编程额度', 'Refresh coding quotas')}</button></footer>`;
  }
  function renderPanel(container = app) {
    const previous = container.querySelector('.panel');
    const active = previous?.contains(document.activeElement) ? document.activeElement : null;
    if (previous) panelScroll[previous.dataset.section] = previous.querySelector('.content')?.scrollTop || 0;
    container.innerHTML = panelMarkup();
    const panel = container.querySelector('.panel');
    if (!panel) return;
    panel.querySelector('.content').scrollTop = panelScroll[panel.dataset.section] || 0;
    if (active) {
      const { action, event, setting, select } = active.dataset;
      const target = action === 'panel-tab' ? panel.querySelector('[role="tab"][tabindex="0"]') :
        [...panel.querySelectorAll('[data-action],[data-setting],[data-select]')].find(node =>
          node.dataset.action === action && node.dataset.event === event && node.dataset.setting === setting && node.dataset.select === select);
      (target || panel.querySelector('[role="tab"][tabindex="0"]'))?.focus({ preventScroll: true });
    }
  }
  function notificationNotice() {
    const d = state.notificationDelivery;
    if (!d) return '';
    const messages = [];
    if (d.failed > d.exhausted) messages.push(t('系统通知发送失败，将在提醒仍有效时有限重试。', 'A system notification failed. Limited retries continue while the reminder is eligible.'));
    if (d.exhausted) messages.push(t('有系统通知连续发送失败，已达到 3 次上限。请检查 Windows 通知设置，并在面板查看提醒。', 'A system notification reached the three-attempt limit. Check Windows notification settings and view reminders in the panel.'));
    if (d.unknown) messages.push(t('有系统通知的送达结果未知，自动重发已暂停。请在面板查看提醒。', 'Delivery of a system notification is unknown. Automatic resend is paused. View reminders in the panel.'));
    if (d.storageError) messages.push(t('通知状态未能保存，请检查本机存储。', 'Notification status could not be saved. Check local storage.'));
    return messages.map(message => `<p class="notice warn" role="status">${message}</p>`).join('');
  }
  function render(force = false) {
    const key = JSON.stringify([state, screenName, details, toast, Math.floor(Date.now() / 60000)]);
    if (key === lastRender && !force) return;
    // Keep a drag's DOM node and pointer capture intact until release.
    if (pointer?.dragging) return;
    lastRender = key;
    document.documentElement.lang = state.settings.language;
    document.body.className = `${preview ? 'preview ' : ''}${state.dark ? '' : 'light'}`;
    if (preview) app.innerHTML = `<div class="preview-intro"><div class="kicker">CODEX GAUGE / 01</div><h1>${t('额度，一眼有数。', 'Your usage, at a glance.')}</h1><p>${t('贴在个人头像上方的一枚小仪表。暖金色记录当前余量，细刻度保留读数的秩序。以下为设计预览，全部为示例数据。', 'A small instrument above your profile. Warm brass for remaining capacity; fine graduations for clarity. Design preview with sample data only.')}</p></div>
      <div class="preview-stage"><div class="preview-rail"><div class="rail-logo">C</div><div class="rail-nav">${icon('gauge')}${icon('ticket')}${icon('settings')}</div><div class="spacer"></div>${mini()}<div class="rail-avatar">AK</div></div><div class="preview-frame">${panelMarkup()}</div><div class="preview-notes"><strong>01 / ${t('常驻', 'AT A GLANCE')}</strong>${t('双弧线、小读数。只占头像上方的一点空间。', 'Two arcs. One reading. A small space above your profile.')}<strong>02 / ${t('展开', 'IN DETAIL')}</strong>${t('双周期仪表、重置时间、重置卡，一层展开。', 'Two usage windows, reset times and credits in one view.')}<div class="preview-buttons"><button data-preview="theme">${t('切换明暗', 'Theme')}</button><button data-preview="language">中 / EN</button><button data-preview="low">${t('低余量', 'Low')}</button><button data-preview="offline">${t('断线状态', 'Offline')}</button><button data-preview="reset">${t('还原', 'Reset')}</button></div></div></div>`;
    else if(view==='badge')app.innerHTML=mini();else renderPanel();
  }
  let reminderDialog;
  function openCreativeSettings(provider){
    const row=state.creative?.rows?.find(r=>r.id===provider);if(!row)return;
    if(!reminderDialog){reminderDialog=document.createElement('dialog');reminderDialog.className='creative-reminder-dialog';document.body.append(reminderDialog);}
    reminderDialog.innerHTML=`<form><h2>${esc(row.name)} · ${t('创作积分提醒','Creative credit reminders')}</h2><p>${t('仅在即将到期的这批积分超过忽略线时提醒。不会改变 Codex 额度或重置卡提醒。','Only highlight an expiring batch above this cutoff. Codex quota and reset credit reminders are separate.')}</p><label>${t('不提醒的积分上限（含）','Ignore credits at or below')}<input name="threshold" type="number" min="0" max="1000000000000" step="any" required value="${row.expiryThreshold??100}"></label><p>${t('默认 100 积分；填 0 表示有积分就提醒。7 天内置顶，3 天内静默通知，最后一天加强标签。每日赠送不提醒。','Default: 100 credits. Use 0 to highlight any positive balance. Sort first within 7 days, send silent notices within 3 days and on the last day. Daily gifts stay silent.')}</p><p class="dialog-error" role="status"></p><div class="dialog-actions"><button type="button" data-cancel>${t('取消','Cancel')}</button><button type="submit">${t('保存','Save')}</button></div></form>`;
    reminderDialog.querySelector('[data-cancel]').onclick=()=>reminderDialog.close();
    reminderDialog.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const form=event.currentTarget,submit=form.querySelector('[type=submit]');submit.disabled=true;
      const result=preview?{ok:false}:await window.gauge.action('creative-expiry-settings',{provider,threshold:Number(form.elements.threshold.value)});
      submit.disabled=false;if(result?.ok){reminderDialog.close();showToast(t('创作积分忽略线已保存','Creative credit cutoff saved'));}else form.querySelector('.dialog-error').textContent=t('未能保存，请重试。','Could not save. Please retry.');
    };reminderDialog.showModal();
  }
  async function action(name, value) {
    if(name==='creative-expiry-settings'){openCreativeSettings(value);return;}
    if(name==='open-creative'){if(!preview)await window.gauge.action('open-creative');return;}
    if(name==='creative-expiry-dismiss'){if(!preview){const result=await window.gauge.action(name,value);if(result?.ok)showToast(t('本批积分已静音','This credit batch is now quiet'));else showToast(t('未能保存，请重试','Could not save. Please retry'));}return;}

    if (name === 'panel-tab') {
      screenName = 'gauge';
      if (preview) {
        state.settings.panelFace = value;
        renderPanel(app.querySelector('.preview-frame'));
      } else {
        const result = await window.gauge.action('panel-face', value);
        if (!result?.ok) showToast(t('切换失败，请重试', 'Could not switch tabs. Please retry'));
      }
      return;
    }
    if (name === 'settings-page' || name === 'back') { screenName = name === 'back' ? 'gauge' : 'settings'; render(true); return; }
    if (name === 'credits') { details = !details; render(true); return; }
    if (name === 'news-details') { newsDetails = !newsDetails; render(true); return; }
    if (preview) {
      if (name === 'settings') { Object.assign(state.settings, value); state.dark = state.settings.theme !== 'light'; render(true); }
      if (name === 'check-update') { state.update = { state: 'current' }; render(true); }
      return;
    }
    const result = await window.gauge.action(name, value);
    if (!result?.ok) showToast(result?.error === 'install_first' ? t('安装打包版本后可启用开机启动', 'Install the packaged app to enable login startup') : t('操作未保存，请重试', 'Change was not saved. Please retry'));
    if (name === 'reset-position') showToast(t('已恢复到默认位置', 'Position reset'));
  }
  function showToast(message) { toast = message; render(true); clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast = ''; render(true); }, 3500); }
  document.addEventListener('click', event => {
    if (suppressClick) { suppressClick = false; return; }
    const target = event.target.closest('[data-action],[data-setting],[data-preview]');
    if (!target) {
      if (!preview && view === 'panel' && !event.target.closest('.panel') && !reminderDialog?.open) action('close');
      return;
    }
    if (target.dataset.setting) action('settings', { [target.dataset.setting]: !state.settings[target.dataset.setting] });
    else if (target.dataset.preview) {
      const name = target.dataset.preview;
      if (name === 'theme') { state.dark = !state.dark; state.settings.theme = state.dark ? 'dark' : 'light'; }
      if (name === 'language') state.settings.language = state.settings.language === 'en' ? 'zh-CN' : 'en';
      if (name === 'low') { state.snapshot.fiveHour.remaining = 7; state.snapshot.weekly.remaining = 19; }
      if (name === 'offline') state.status = 'offline';
      if (name === 'reset') { state.status = 'ready'; state.snapshot.fiveHour.remaining = 68; state.snapshot.weekly.remaining = 34; }
      render(true);
    } else action(target.dataset.action, target.dataset.event);
  });
  document.addEventListener('change', event => { if (event.target.dataset.select) action('settings', { [event.target.dataset.select]: event.target.value }); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !reminderDialog?.open) action('close');
    const tab = event.target.closest('[role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = tabIds.indexOf(tab.dataset.event);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabIds.length - 1 :
      (current + (event.key === 'ArrowLeft' ? -1 : 1) + tabIds.length) % tabIds.length;
    action('panel-tab', tabIds[next]);
  });
  if (!preview) {
    document.body.addEventListener('mouseenter', () => action('enter', view));
    document.body.addEventListener('mouseleave', () => action('leave', view));
    document.addEventListener('contextmenu', event => { event.preventDefault(); if (view === 'badge') action('toggle'); else { screenName = 'settings'; render(true); } });
    if (view === 'badge') {
      document.addEventListener('dblclick', () => action('reset-position'));
      document.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('.creative-dot')) return;
        pointer = { id: event.pointerId, x: event.screenX, y: event.screenY, target: event.target.closest('.micro'), dragging: false };
        pointer.target?.setPointerCapture(event.pointerId);
      });
      document.addEventListener('pointermove', event => {
        if (!pointer || pointer.dragging || Math.hypot(event.screenX - pointer.x, event.screenY - pointer.y) < 4) return;
        pointer.dragging = true; action('drag-start', { dx: event.screenX - pointer.x, dy: event.screenY - pointer.y });
      });
      const release = () => {
        if (pointer?.dragging) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 250); action('drag-end'); }
        // Keep the target between ordinary clicks so native double-click detection works.
        pointer = null;
      };
      document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release);
    }
    window.gauge.onState(next => {
      if (view === 'panel' && next.panelOpen === false && state.panelOpen !== false) {
        screenName = 'gauge';
        for (const key of Object.keys(panelScroll)) delete panelScroll[key];
        reminderDialog?.close();
      }
      state = next;
      render();
    });
    window.gauge.state().then(next => { state = next; render(); });
  }
  render();
  setInterval(() => render(), 15000);
})();

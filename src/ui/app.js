(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const view = query.get('view') || 'preview';
  document.title = view === 'panel' ? 'Codex Gauge · Panel' : 'Codex Gauge';
  const preview = !window.gauge;
  const app = document.getElementById('app');
  let screenName = 'gauge', details = false, toast = '', lastRender = '', toastTimer, pointer, suppressClick = false;
  const now = Date.now();
  let state = { settings: { language: 'zh-CN', theme: 'dark', topmost: false, notifications: false, autostart: false },
    dark: true, status: 'ready', snapshot: { fiveHour: { remaining: 68, minutes: 300, resetsAt: now + 8640000 },
      weekly: { remaining: 34, minutes: 10080, resetsAt: now + 276480000 }, credits: [{ key: 'demo', expiresAt: now + 129600000 }], creditCount: 1, fetchedAt: now },
    host: { exists: true, anchored: true, platform: 'win32' }, update: { state: 'idle' }, version: '0.1.0', demo: true };
  const t = (cn, en) => state.settings.language === 'zh-CN' ? cn : en;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
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
  const primary = () => state.snapshot?.fiveHour || state.snapshot?.weekly || state.snapshot?.windows?.[0];
  const stale = () => state.status !== 'ready' || state.snapshot && Date.now() - state.snapshot.fetchedAt > 150000;
  function point(angle, radius, center = 80) { const a = angle * Math.PI / 180; return [center + radius * Math.cos(a), center + radius * Math.sin(a)]; }
  function arc(radius, value, center = 80) {
    const a = point(135, radius, center), b = point(135 + 270 * Math.max(.0001, Math.min(100, value)) / 100, radius, center);
    return `M${a[0]},${a[1]} A${radius},${radius} 0 ${value > 66.666 ? 1 : 0} 1 ${b[0]},${b[1]}`;
  }
  function dial(w, label, small = false) {
    const value = w?.remaining ?? 0;
    const color = value <= 10 && w ? 'var(--danger)' : small ? 'var(--cool)' : 'var(--accent)';
    let ticks = '';
    for (let i = 0; i <= 40; i++) {
      const a = point(135 + i * 6.75, 70), b = point(135 + i * 6.75, i % 5 === 0 ? 62 : 66);
      ticks += `<path d="M${a}L${b}" stroke="${w && i <= value / 2.5 ? color : 'var(--line)'}" stroke-width="${i % 5 === 0 ? 1.5 : 1}"/>`;
    }
    const a = point(135 + value * 2.7, 54), b = point(135 + value * 2.7, 60);
    return `<div class="dial ${small ? 'small' : ''}" role="img" aria-label="${esc(label)} ${pct(w)}%">
      <svg viewBox="0 0 160 145" aria-hidden="true"><path d="${arc(57, 100)}" fill="none" stroke="var(--subtle)" stroke-width="2"/>
      <path d="${arc(57, value)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>${ticks}
      ${w ? `<path d="M${a}L${b}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>` : ''}
      <text class="axis-label" x="38" y="138" text-anchor="middle">0</text><text class="axis-label" x="122" y="138" text-anchor="middle">100</text></svg>
      <div class="dial-value">${pct(w)}<sup>${w ? '%' : ''}</sup></div><div class="dial-label">${esc(label)}</div></div>`;
  }
  function mini() {
    const p = primary(), value = p?.remaining ?? 0, weekly = state.snapshot?.weekly;
    const color = p && value <= 10 ? 'var(--danger)' : 'var(--accent)';
    return `<button class="micro ${stale() ? 'stale' : ''}" data-action="toggle" aria-label="${esc(t('查看 Codex 额度', 'View Codex usage'))}" title="${esc(t('悬停查看 · 拖动调整 · 双击归位', 'Hover to view · Drag to move · Double-click to reset'))}">
      <svg viewBox="0 0 46 46" aria-hidden="true"><path d="${arc(19.5, 100, 23)}" fill="none" stroke="var(--line)" stroke-width="1.5"/>
      <path d="${arc(19.5, value, 23)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      <path d="${arc(16, weekly?.remaining ?? 0, 23)}" fill="none" stroke="var(--cool)" stroke-width="1" opacity=".7"/>
      ${[0, 25, 50, 75, 100].map(v => { const a = point(135 + v * 2.7, 20, 23), b = point(135 + v * 2.7, 22, 23); return `<path d="M${a}L${b}" stroke="var(--muted)" stroke-width=".7"/>`; }).join('')}</svg>
      <span class="reading">${pct(p)}</span><span class="unit">${p?.minutes === 10080 ? 'WEEK' : p?.minutes === 300 ? '5H' : p ? `${p.minutes}M` : 'CODEX'}</span>${stale() ? '<span class="live-dot"></span>' : ''}</button>`;
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
      <button class="primary" data-action="refresh">${t('重新读取', 'Try again')}</button></div>${!state.host.anchored ? `<p class="notice">${t('尚未定位到个人头像。打开 Codex 后会自动跟随，也可以从托盘查看。', 'Profile anchor not found. Open Codex to attach, or use the tray to view usage.')}</p>` : ''}`;
    const five = s.fiveHour, week = s.weekly;
    const first = five || week || s.windows?.[0], second = five ? week : null;
    const firstLabel = first?.minutes === 10080 ? t('本周', 'THIS WEEK') : first?.minutes === 300 ? t('5 小时', '5 HOURS') : t(`${first?.minutes ?? '—'} 分钟`, `${first?.minutes ?? '—'} MIN`);
    const secondLabel = five ? t('本周', 'THIS WEEK') : t('5 小时', '5 HOURS');
    const a = time(first), b = time(second);
    const closest = Math.min(...[five, week].filter(Boolean).map(w => w.remaining));
    const unknown = !five && !week;
    return `<div class="eyebrow"><span>${t('剩余额度', 'REMAINING USAGE')}</span><span class="status ${stale() ? 'warn' : ''}"><i></i>${state.demo ? t('示例数据', 'DEMO DATA') : stale() ? t('上次读数', 'LAST READING') : t('已同步', 'LIVE')}</span></div>
      ${unknown ? `<p class="notice">${t('当前账户返回其他周期，请等待适配。', 'This account returns a different usage window.')}</p>` : ''}
      <div class="dials">${dial(first, firstLabel)}${dial(second, secondLabel, true)}</div>
      <div class="resets"><div><div class="reset-time">${a.time}</div><div class="reset-hint">${a.hint}</div></div><div><div class="reset-time">${b.time}</div><div class="reset-hint">${b.hint}</div></div></div>
      <div class="readout"><div><h2>${t('可用余量', 'AVAILABLE CAPACITY')}</h2><p>${t('以较少的周期为参考', 'Based on the more limited window')}</p></div><div class="range" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<span class="${i < Math.ceil(closest / 100 * 18) ? 'on' : ''}"></span>`).join('')}</div></div>
      <div class="credit-card"><span class="ticket-icon">${icon('ticket')}</span><div class="credit-info"><div class="credit-title"><strong>${s.creditCount ?? '—'}</strong>${t('次重置机会', 'reset credits')}</div>
      <div class="credit-caption">${s.credits.length ? t(`最近一张约 ${Math.max(0, Math.ceil((s.credits[0].expiresAt - Date.now()) / 3600000))} 小时后到期`, `Next expires in ~${Math.max(0, Math.ceil((s.credits[0].expiresAt - Date.now()) / 3600000))}h`) : s.creditCount == null ? t('接口尚未提供此信息', 'Not provided by the service') : t('仅查看，不自动使用', 'Read-only. Never used automatically.')}</div></div>
      ${s.credits.length ? `<button class="text-button" data-action="credits">${details ? t('收起', 'Hide') : t('查看', 'Details')}</button>` : ''}</div>
      ${details ? `<div class="credit-list">${s.credits.map((c, i) => `${i + 1}. ${new Date(c.expiresAt).toLocaleString(state.settings.language)} ${t('到期', 'expiry')}`).join('<br>')}</div>` : ''}
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
      ${toggle('autostart', t('开机启动', 'Launch at login'), t('登录电脑后自动运行', 'Start when you sign in'))}
      ${toggle('notifications', t('重置卡到期提醒', 'Credit expiry reminders'), t('到期前 48 / 24 小时，静默通知', 'Silent notices within 48 / 24 hours'))}
      <div class="settings-actions"><button class="text-button" data-action="reset-position">${t('恢复默认位置', 'Reset position')}</button><button class="text-button" data-action="check-update">${t('检查更新', 'Check for updates')}</button><button class="text-button" data-action="source">GitHub ↗</button></div>
      ${state.update.state !== 'idle' ? `<div class="notice">${updateLabel()}${state.update.state === 'available' ? `<br><button class="text-button" data-action="releases">${t('前往下载更新', 'Download update')} ↗</button>` : ''}</div>` : ''}
      <div class="about">Codex Gauge ${esc(state.version)} · MIT<br>${t('本机只读 · 无分析追踪 · 不发送模型请求', 'Local, read-only · No analytics · No model requests')}<br>${t('第三方工具，与 OpenAI 无隶属关系。', 'Independent tool, not affiliated with OpenAI.')}</div>`;
  }
  function updateLabel() {
    return ({ checking: t('正在检查…', 'Checking…'), current: t('当前已是最新版本', 'You are up to date'), available: t(`发现新版本 ${state.update.version}`, `Version ${state.update.version} is available`),
      failed: t('检查失败，请稍后重试', 'Check failed. Try again later'), unreleased: t('暂时没有已发布的正式版本', 'No stable release is published yet') })[state.update.state] || '';
  }
  function panelMarkup() {
    return `<section class="panel"><header class="header"><div class="brand-mark">${icon('gauge')}</div><div class="brand">${t('刻度', 'GAUGE')}<small>CODEX GAUGE</small></div><span class="spacer"></span>
      ${screenName === 'settings' ? button('back', t('返回额度', 'Back to usage'), 'back') : button('settings-page', t('设置', 'Settings'), 'settings')}${button('close', t('关闭面板', 'Close panel'), 'close')}</header>
      <div class="content">${screenName === 'settings' ? settingsContent() : gaugeContent()}${state.settingsError ? `<p class="notice warn">${t('设置未保存，原有设置文件已保留。', 'Settings were not saved. The existing file is preserved.')}</p>` : ''}</div>
      <footer class="footer"><span class="footer-left">${icon('lock')}<span>${state.demo ? `<span class="demo-label">${t('设计预览 · 示例数据', 'DESIGN PREVIEW · DEMO DATA')}</span>` : state.snapshot ? t('同步于 ', 'Updated ') + new Date(state.snapshot.fetchedAt).toLocaleTimeString(state.settings.language, { hour: '2-digit', minute: '2-digit', hour12: false }) : t('本机只读连接', 'Local read-only connection')}</span></span>${button('refresh', t('刷新额度', 'Refresh usage'), 'refresh')}</footer>
      ${toast ? `<div class="toast" role="status">${esc(toast)}</div>` : ''}</section>`;
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
    else app.innerHTML = view === 'badge' ? mini() : panelMarkup();
  }
  async function action(name, value) {
    if (name === 'settings-page' || name === 'back') { screenName = name === 'back' ? 'gauge' : 'settings'; render(true); return; }
    if (name === 'credits') { details = !details; render(true); return; }
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
    if (!target) return;
    if (target.dataset.setting) action('settings', { [target.dataset.setting]: !state.settings[target.dataset.setting] });
    else if (target.dataset.preview) {
      const name = target.dataset.preview;
      if (name === 'theme') { state.dark = !state.dark; state.settings.theme = state.dark ? 'dark' : 'light'; }
      if (name === 'language') state.settings.language = state.settings.language === 'en' ? 'zh-CN' : 'en';
      if (name === 'low') { state.snapshot.fiveHour.remaining = 7; state.snapshot.weekly.remaining = 19; }
      if (name === 'offline') state.status = 'offline';
      if (name === 'reset') { state.status = 'ready'; state.snapshot.fiveHour.remaining = 68; state.snapshot.weekly.remaining = 34; }
      render(true);
    } else action(target.dataset.action);
  });
  document.addEventListener('change', event => { if (event.target.dataset.select) action('settings', { [event.target.dataset.select]: event.target.value }); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') action('close'); });
  if (!preview) {
    document.body.addEventListener('mouseenter', () => action('enter', view));
    document.body.addEventListener('mouseleave', () => action('leave', view));
    document.addEventListener('contextmenu', event => { event.preventDefault(); if (view === 'badge') action('toggle'); else { screenName = 'settings'; render(true); } });
    if (view === 'badge') {
      document.addEventListener('dblclick', () => action('reset-position'));
      document.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
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
    window.gauge.onState(next => { state = next; render(); });
    window.gauge.state().then(next => { state = next; render(); });
  }
  render();
  setInterval(() => render(), 15000);
})();

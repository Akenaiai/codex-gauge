'use strict';
const { app, BrowserWindow, ipcMain, screen, nativeTheme, Tray, Menu, nativeImage, Notification, shell, session, powerMonitor } = require('electron');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
const { createStartup } = require('./startup.cjs');
const { QuotaService } = require('./cli.cjs');
const { ResetFeed, PAGE } = require('./reset-feed.cjs');
const { resetAlerts, newsPlan } = require('./reminders.cjs');
const { NotificationDelivery, configureActivation } = require('./notifications.cjs');
const { placeBadge, placePanel, clampRect, creditAlerts } = require('./domain.cjs');
const ROOT = path.resolve(__dirname, '..');
const demo = process.argv.includes('--demo');
if (demo) app.setPath('userData', path.join(app.getPath('temp'), 'codex-gauge-demo'));
app.setName('Codex Gauge');
app.setAppUserModelId('com.aken.codexgauge');
const openNotificationPanel = () => { pinnedPanel = true; openPanel(true, true); panel.focus(); };
const primary = app.requestSingleInstanceLock();
const activation = primary ? configureActivation({ app, Notification, open: openNotificationPanel, platform: demo ? 'preview' : process.platform }) : null;
if (!primary) app.quit();
else app.whenReady().then(start);
let badge, panel, tray, store, quota, resetFeed, observer, watchdog, host = {}, lastHost = 0, pinnedPanel = false, forcedPanel = false;
let hoverTimer, leaveTimer, drag, dragTimer, quitting = false, helperRetries = 0, hostGeneration = 0, hadAnchor = false;
let badgeRaisedAt = 0;
let update = { state: 'idle' }, startup, startupError = false, delivery, reminderTimer;
const zh = () => store.settings.language === 'zh-CN';
const text = (cn, en) => zh() ? cn : en;

function state() {
  return { ...quota.state(), settings: store.settings, dark: store.settings.theme === 'dark' || store.settings.theme === 'system' && nativeTheme.shouldUseDarkColors,
    settingsError: store.error, startupError, notificationDelivery: delivery?.state(), host: { exists: !!host.exists, anchored: !!host.anchored, platform: process.platform },
    resetFeed: resetFeed.state(), update, version: app.getVersion(), demo };
}
function broadcast() { for (const w of [badge, panel]) if (w && !w.isDestroyed()) w.webContents.send('gauge:state', state()); }
function createWindow(width, height, view) {
  const win = new BrowserWindow({ width, height, show: false, frame: false, transparent: true, resizable: false,
    maximizable: false, minimizable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: true,
    title: view === 'badge' ? 'Codex Gauge' : 'Codex Gauge · Panel',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: true, spellcheck: false } });
  win.setMenu(null);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.on('will-attach-webview', e => e.preventDefault());
  win.loadFile(path.join(__dirname, 'ui', 'index.html'), { query: { view } });
  win.on('closed', () => { if (!quitting) app.quit(); });
  return win;
}
function areaFor(point) { return screen.getDisplayNearestPoint(point).workArea; }
function panelBounds() {
  const bounds = badge.getBounds(), area = areaFor(bounds);
  return placePanel(bounds, area, 356, Math.min(650, area.height - 16));
}
function layout() {
  if (!badge || drag) return;
  const settings = store.settings;
  if (settings.topmost && settings.floating) badge.setBounds(clampRect({ ...settings.floating, width: 52, height: 52 }, areaFor(settings.floating)));
  else if (host.anchored) {
    const point = process.platform === 'win32' ? screen.screenToDipPoint({ x: host.x, y: host.y }) : { x: host.x, y: host.y };
    badge.setBounds(placeBadge(point, areaFor(point), settings.offset));
  }
  if (panel.isVisible() && !forcedPanel) panel.setBounds(panelBounds());
}
function updateVisibility() {
  if (quitting) return;
  const visible = demo || host.exists && (store.settings.topmost ? (host.anchored || hadAnchor || store.settings.floating) : host.anchored && !host.minimized && host.foreground);
  if (visible) {
    layout();
    const wasVisible = badge.isVisible();
    if (!wasVisible) badge.showInactive();
    // Windows can leave a visible, topmost-marked badge behind the host.
    // Repair actual order without activating the badge or changing preferences.
    if (!wasVisible || Date.now() - badgeRaisedAt >= 2000) {
      badge.moveTop();
      if (panel.isVisible()) panel.moveTop();
      badgeRaisedAt = Date.now();
    }
  } else { badgeRaisedAt = 0; badge.hide(); if (!forcedPanel) closePanel(); }
  quota.setActive(!!host.exists || forcedPanel || demo);
  resetFeed.setActive(!demo && store.settings.resetNews && (!!host.exists || forcedPanel));
}
function openPanel(activate = false, force = false) {
  clearTimeout(leaveTimer); clearTimeout(hoverTimer); forcedPanel = force || forcedPanel;
  if (force) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const height = Math.min(650, area.height - 16);
    panel.setBounds({ x: area.x + area.width - 380, y: area.y + area.height - height - 12, width: 356, height });
    quota.setActive(true);
    resetFeed.setActive(!demo && store.settings.resetNews);
  } else panel.setBounds(panelBounds());
  if (activate) panel.show(); else panel.showInactive();
  panel.moveTop();
  broadcast();
}
function closePanel() { clearTimeout(leaveTimer); clearTimeout(hoverTimer); pinnedPanel = false; forcedPanel = false; panel?.hide(); }
function save(patch) {
  try { store.save(patch); refreshTray(); broadcast(); layout(); updateVisibility(); return { ok: true }; }
  catch { store.error = true; broadcast(); return { ok: false, error: 'save_failed' }; }
}
function refreshTray() {
  const s = store.settings;
  tray.setToolTip(text('刻度 · Codex 剩余额度', 'Codex Gauge · Remaining usage'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: text('查看额度', 'Open gauge'), click: () => { pinnedPanel = true; openPanel(true, true); } },
    { label: text('保持置顶', 'Keep on top'), type: 'checkbox', checked: s.topmost, click: item => save({ topmost: item.checked }) },
    { label: text('回到头像上方', 'Reset position'), click: () => save({ offset: { x: 0, y: 0 }, floating: null }) },
    { type: 'separator' },
    { label: text('退出刻度', 'Quit Codex Gauge'), click: async () => {
      try { if (store.settings.autostart) await startup.pause(); app.quit(); }
      catch { store.error = true; broadcast(); }
    } }
  ]));
}
function updateDrag() {
  if (!drag) return;
  const p = screen.getCursorScreenPoint();
  badge.setBounds(clampRect({ ...drag.bounds, x: drag.bounds.x + p.x - drag.cursor.x,
    y: drag.bounds.y + p.y - drag.cursor.y }, areaFor(p)));
}
function observe() {
  if (process.platform !== 'win32') { host = { exists: true, anchored: false }; updateVisibility(); return; }
  const generation = ++hostGeneration;
  const executable = path.join(app.isPackaged ? process.resourcesPath : ROOT, app.isPackaged ? 'native' : 'native/bin', 'GaugeHost.exe');
  observer = spawn(executable, [String(process.pid)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = createInterface({ input: observer.stdout });
  lines.on('line', line => {
    if (generation !== hostGeneration) return;
    try {
      host = JSON.parse(line); lastHost = Date.now(); helperRetries = 0;
      if (host.anchored) hadAnchor = true; else if (!host.exists) hadAnchor = false;
      updateVisibility(); broadcast();
    } catch { }
  });
  const failed = () => {
    if (quitting || generation !== hostGeneration) return;
    host = {}; lastHost = 0; updateVisibility(); broadcast();
    if (helperRetries++ < 3) setTimeout(() => { if (!quitting && generation === hostGeneration) observe(); }, 3000);
  };
  observer.once('error', failed); observer.once('exit', failed);
}
async function checkUpdate() {
  if (update.state === 'checking') return;
  update = { state: 'checking' }; broadcast();
  try {
    const response = await fetch('https://api.github.com/repos/Akenaiai/codex-gauge/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Codex-Gauge' }, signal: AbortSignal.timeout(12000) });
    if (response.status === 404) update = { state: 'unreleased' };
    else {
      if (!response.ok) throw new Error();
      const release = await response.json(); const version = String(release.tag_name || '').replace(/^v/, '');
      if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error();
      const a = version.split('.').map(Number), b = app.getVersion().split('.').map(Number);
      const newer = a[0] > b[0] || a[0] === b[0] && (a[1] > b[1] || a[1] === b[1] && a[2] > b[2]);
      update = { state: newer ? 'available' : 'current', version };
    }
  } catch { update = { state: 'failed' }; }
  broadcast();
}
async function action(name, value) {
  switch (name) {
    case 'enter': clearTimeout(leaveTimer); if (value === 'badge' && !drag) hoverTimer = setTimeout(() => openPanel(), 220); break;
    case 'leave': clearTimeout(hoverTimer); if (!pinnedPanel && !forcedPanel && !drag) leaveTimer = setTimeout(closePanel, 450); break;
    case 'toggle': if (panel.isVisible() && pinnedPanel) closePanel(); else { pinnedPanel = true; openPanel(true); } break;
    case 'close': closePanel(); updateVisibility(); break;
    case 'refresh': await Promise.allSettled([quota.refresh(), resetFeed.refresh()]); break;
    case 'reset-news-source': {
      const event = resetFeed.state().events.find(e => e.id === value);
      await shell.openExternal(event?.sourceUrl || PAGE); break;
    }
    case 'settings': {
      if (!value || typeof value !== 'object') return { ok: false };
      const patch = {};
      for (const key of ['theme', 'language', 'topmost', 'notifications', 'resetReminders', 'resetNews']) if (key in value) patch[key] = value[key];
      if ('autostart' in value) {
        if (!app.isPackaged) return { ok: false, error: 'install_first' };
        patch.autostart = value.autostart === true;
      }
      const previousAutostart = store.settings.autostart;
      const result = save(patch);
      if (result.ok && 'autostart' in patch) {
        try { await startup.set(patch.autostart); startupError = false; broadcast(); }
        catch {
          save({ autostart: previousAutostart });
          try { await startup.set(previousAutostart); } catch { }
          startupError = true; broadcast(); return { ok: false, error: 'save_failed' };
        }
      }
      return result;
    }
    case 'reset-position': return save({ offset: { x: 0, y: 0 }, floating: null });
    case 'check-update': await checkUpdate(); break;
    case 'releases': await shell.openExternal('https://github.com/Akenaiai/codex-gauge/releases'); break;
    case 'source': await shell.openExternal('https://github.com/Akenaiai/codex-gauge'); break;
    case 'drag-start': {
      if (drag) break;
      const cursor = screen.getCursorScreenPoint();
      const dx = Number.isFinite(value?.dx) ? Math.max(-2000, Math.min(2000, value.dx)) : 0;
      const dy = Number.isFinite(value?.dy) ? Math.max(-2000, Math.min(2000, value.dy)) : 0;
      drag = { cursor: { x: cursor.x - dx, y: cursor.y - dy }, bounds: badge.getBounds(), offset: store.settings.offset };
      updateDrag(); dragTimer = setInterval(updateDrag, 16); break;
    }
    case 'drag-end': {
      clearInterval(dragTimer);
      if (!drag) break;
      updateDrag();
      const b = badge.getBounds(); const start = drag; drag = null;
      if (store.settings.topmost) save({ floating: { x: b.x, y: b.y } });
      else save({ offset: { x: start.offset.x + b.x - start.bounds.x, y: start.offset.y + b.y - start.bounds.y } });
      break;
    }
    default: return { ok: false };
  }
  return { ok: true };
}
function processResetReminders() {
  if (demo || quitting || !quota.active) return;
  const snapshot = quota.status === 'ready' ? quota.snapshot : null;
  const plan = newsPlan(resetFeed.state(), store.newsSeen, store.ledger, snapshot, Date.now(), store.deliveries);
  const seenChanged = JSON.stringify(plan.seen) !== JSON.stringify(store.newsSeen);
  const alerts = store.settings.resetReminders && Notification.isSupported()
    ? [...resetAlerts(snapshot, quota.accountKey, store.ledger), ...plan.alerts] : [];
  if (!alerts.length && !seenChanged) return;
  const previousSeen = store.newsSeen, added = [];
  store.newsSeen = plan.seen;
  // Persist discovery together with the baseline so a failed first submission is retryable.
  for (const alert of alerts) if (!store.deliveries[alert.key]) {
    store.deliveries[alert.key] = { status: 'queued', attempts: 0, expiresAt: alert.expiresAt, nextAt: 0 };
    added.push(alert.key);
  }
  try { if (seenChanged || added.length) store.save(); } catch {
    store.newsSeen = previousSeen; for (const key of added) delete store.deliveries[key];
    store.error = true; return;
  }
  for (const alert of alerts) {
    let title, body;
    if (alert.event) {
      const e = alert.event, credit = e.type === 'reset_credit';
      title = e.status === 'confirmed' ? text('重置消息有更新', 'Reset announcement updated') : !e.kindKnown ? text('重置消息预告，形式待核对', 'Reset event announced; type unspecified') : text(credit ? '重置卡发放预告' : '额度重置预告', credit ? 'Reset credits announced' : 'Usage reset announced');
      body = text('AIHOT 整理：', 'Via AIHOT: ') + (e.status === 'confirmed'
        ? text(e.confirmation === 'source_post' ? '原帖已有确认，请查看账户实际变化。' : e.confirmation === 'receipt_review' ? '回执整理显示已确认，请核对原帖与账户。' : '消息标为已确认，确认依据仍需核对原帖与账户。', e.confirmation === 'source_post' ? 'A source post confirms the event. Check your account for actual changes.' : e.confirmation === 'receipt_review' ? 'Receipt review indicates confirmation. Check the source and your account.' : 'The event is marked confirmed; verify the basis in the source and your account.')
        : e.until ? text(`预计时间范围至 ${new Date(e.until).toLocaleString('zh-CN')}，具体以原帖为准。`, `Announced window ends ${new Date(e.until).toLocaleString('en')}; check the source for timing.`)
          : text('具体时间尚未明确，可查看原帖。', 'Timing has not been specified. Open the source post.'));
      if (alert.urgent) body += text(' 近期有任务可先安排，使用重置卡前先核对。', ' Plan pending work and check before using a reset credit.');
    } else {
      const label = alert.window === 300 ? text('5 小时额度', '5-hour usage') : alert.window === 10080 ? text('本周额度', 'Weekly usage') : text(`${alert.window} 分钟周期`, `${alert.window}-minute window`);
      title = text('额度即将周期重置', 'Usage window resets soon');
      body = text(`${label}还有约 ${alert.minutes} 分钟重置，剩余 ${alert.remaining}%。可先安排待办任务，使用重置卡前先核对。`, `${label} resets in about ${alert.minutes} minutes; ${alert.remaining}% remains. Plan pending work and check before using a reset credit.`);
    }
    delivery.send(alert, { title, body, silent: true });
  }
}
function processCreditReminders() {
  if (demo || quitting || !quota.active || !store.settings.notifications || quota.status !== 'ready') return;
  for (const alert of creditAlerts(quota.snapshot, quota.accountKey, store.ledger)) {
    delivery.send(alert, { title: text('重置机会即将到期', 'Reset credit expiring'),
      body: text(`有一张重置卡将在约 ${alert.hours} 小时内到期。`, `A reset credit expires in about ${alert.hours} hours.`), silent: true });
  }
}
async function start() {
  store = new Store(app.getPath('userData')); quota = new QuotaService(); resetFeed = new ResetFeed();
  delivery = new NotificationDelivery({ store, Notification, open: openNotificationPanel, changed: () => { if (panel) broadcast(); } });
  startup = createStartup(app, ROOT);
  if (app.isPackaged && !demo && store.settings.autostart) {
    try { await startup.set(true); } catch { startupError = true; }
  }
  if (process.platform === 'darwin' && !store.settings.floating) {
    const area = screen.getPrimaryDisplay().workArea; store.settings.topmost = true;
    store.settings.floating = { x: area.x + area.width - 90, y: area.y + 90 };
  }
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  badge = createWindow(52, 52, 'badge'); panel = createWindow(356, 650, 'panel');
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png')));
  refreshTray(); tray.on('click', () => { pinnedPanel = true; openPanel(true, true); });
  ipcMain.handle('gauge:state', event => { if (![badge.webContents, panel.webContents].includes(event.sender)) throw new Error('Unauthorized'); return state(); });
  ipcMain.handle('gauge:action', (event, name, value) => {
    if (![badge.webContents, panel.webContents].includes(event.sender) || event.senderFrame !== event.sender.mainFrame || typeof name !== 'string') throw new Error('Unauthorized');
    return action(name, value);
  });
  quota.on('state', () => {
    processCreditReminders();
    processResetReminders();
    broadcast();
  });
  resetFeed.on('state', () => { processResetReminders(); broadcast(); });
  nativeTheme.on('updated', broadcast);
  powerMonitor.on('suspend', () => { quota.stop(); resetFeed.stop(); badge.hide(); closePanel(); });
  powerMonitor.on('resume', () => { updateVisibility(); quota.refresh(); });
  screen.on('display-metrics-changed', layout);
  if (demo) {
    quota.setActive = () => {}; quota.refresh = async () => {};
    quota.status = 'ready'; quota.snapshot = require('./ui/demo-data.cjs')();
    host = { exists: true, foreground: true, anchored: true, x: 130, y: 620 };
    badge.once('ready-to-show', updateVisibility);
    panel.once('ready-to-show', () => openPanel(true, true));
    updateVisibility();
  } else {
    observe();
    watchdog = setInterval(() => {
      if (process.platform === 'win32' && lastHost && Date.now() - lastHost > 8000) { observer?.kill(); lastHost = 0; }
      broadcast();
    }, 2000);
  }
  reminderTimer = setInterval(() => { processCreditReminders(); processResetReminders(); }, 30000);
  activation.ready();
  app.on('activate', () => openPanel(true, true));
}
app.on('before-quit', () => { quitting = true; delivery?.stop(); clearInterval(reminderTimer); clearInterval(watchdog); clearInterval(dragTimer); clearTimeout(leaveTimer); clearTimeout(hoverTimer); quota?.stop(); resetFeed?.stop(); observer?.kill(); tray?.destroy(); });
app.on('window-all-closed', () => { if (!quitting) app.quit(); });

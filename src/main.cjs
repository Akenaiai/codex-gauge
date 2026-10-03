'use strict';
const { app, BrowserWindow, ipcMain, screen, nativeTheme, Tray, Menu, nativeImage, Notification, shell, session, powerMonitor } = require('electron');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');
const fs = require('node:fs');
const { Store } = require('./store.cjs');
const { QuotaService } = require('./cli.cjs');
const { placeBadge, placePanel, clampRect, creditAlerts } = require('./domain.cjs');
const ROOT = path.resolve(__dirname, '..');
const demo = process.argv.includes('--demo');
if (demo) app.setPath('userData', path.join(app.getPath('temp'), 'codex-gauge-demo'));
app.setName('Codex Gauge');
app.setAppUserModelId('com.aken.codexgauge');
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(start);
let badge, panel, tray, store, quota, observer, watchdog, host = {}, lastHost = 0, pinnedPanel = false, forcedPanel = false;
let hoverTimer, leaveTimer, drag, dragTimer, quitting = false, helperRetries = 0, hostGeneration = 0, hadAnchor = false;
let update = { state: 'idle' };
const zh = () => store.settings.language === 'zh-CN';
const text = (cn, en) => zh() ? cn : en;

function state() {
  return { ...quota.state(), settings: store.settings, dark: store.settings.theme === 'dark' || store.settings.theme === 'system' && nativeTheme.shouldUseDarkColors,
    settingsError: store.error, host: { exists: !!host.exists, anchored: !!host.anchored, platform: process.platform },
    update, version: app.getVersion(), demo };
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
function layout() {
  if (!badge || drag) return;
  const settings = store.settings;
  if (settings.topmost && settings.floating) badge.setBounds(clampRect({ ...settings.floating, width: 52, height: 52 }, areaFor(settings.floating)));
  else if (host.anchored) {
    const point = process.platform === 'win32' ? screen.screenToDipPoint({ x: host.x, y: host.y }) : { x: host.x, y: host.y };
    badge.setBounds(placeBadge(point, areaFor(point), settings.offset));
  }
  if (panel.isVisible() && !forcedPanel) panel.setBounds(placePanel(badge.getBounds(), areaFor(badge.getBounds())));
}
function updateVisibility() {
  if (quitting) return;
  const visible = demo || host.exists && (store.settings.topmost ? (host.anchored || hadAnchor || store.settings.floating) : host.anchored && !host.minimized && host.foreground);
  if (visible) { layout(); if (!badge.isVisible()) badge.showInactive(); }
  else { badge.hide(); if (!forcedPanel) closePanel(); }
  quota.setActive(!!host.exists || forcedPanel || demo);
}
function openPanel(activate = false, force = false) {
  clearTimeout(leaveTimer); clearTimeout(hoverTimer); forcedPanel = force || forcedPanel;
  if (force) {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    panel.setBounds({ x: area.x + area.width - 380, y: area.y + area.height - 500, width: 356, height: 476 });
    quota.setActive(true);
  } else panel.setBounds(placePanel(badge.getBounds(), areaFor(badge.getBounds())));
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
    { label: text('退出刻度', 'Quit Codex Gauge'), click: () => app.quit() }
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
    case 'refresh': await quota.refresh(); break;
    case 'settings': {
      if (!value || typeof value !== 'object') return { ok: false };
      const patch = {};
      for (const key of ['theme', 'language', 'topmost', 'notifications']) if (key in value) patch[key] = value[key];
      if ('autostart' in value) {
        if (!app.isPackaged) return { ok: false, error: 'install_first' };
        patch.autostart = value.autostart === true;
        try { app.setLoginItemSettings({ openAtLogin: patch.autostart }); } catch { return { ok: false, error: 'save_failed' }; }
      }
      const result = save(patch);
      if (!result.ok && 'autostart' in patch) app.setLoginItemSettings({ openAtLogin: store.settings.autostart });
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
async function start() {
  store = new Store(app.getPath('userData')); quota = new QuotaService();
  if (process.platform === 'darwin' && !store.settings.floating) {
    const area = screen.getPrimaryDisplay().workArea; store.settings.topmost = true;
    store.settings.floating = { x: area.x + area.width - 90, y: area.y + 90 };
  }
  session.defaultSession.setPermissionRequestHandler((_w, _p, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  badge = createWindow(52, 52, 'badge'); panel = createWindow(356, 476, 'panel');
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png')));
  refreshTray(); tray.on('click', () => { pinnedPanel = true; openPanel(true, true); });
  ipcMain.handle('gauge:state', event => { if (![badge.webContents, panel.webContents].includes(event.sender)) throw new Error('Unauthorized'); return state(); });
  ipcMain.handle('gauge:action', (event, name, value) => {
    if (![badge.webContents, panel.webContents].includes(event.sender) || event.senderFrame !== event.sender.mainFrame || typeof name !== 'string') throw new Error('Unauthorized');
    return action(name, value);
  });
  quota.on('state', () => {
    if (!demo && store.settings.notifications && quota.status === 'ready' && Notification.isSupported()) {
      for (const alert of creditAlerts(quota.snapshot, quota.accountKey, store.ledger)) {
        // Persist before sending, so restarting never repeats a successfully recorded reminder.
        store.ledger[alert.key] = alert.expiresAt;
        for (const [key, expiry] of Object.entries(store.ledger)) if (expiry < Date.now()) delete store.ledger[key];
        try { store.save(); new Notification({ title: text('重置机会即将到期', 'Reset credit expiring'),
          body: text(`有一张重置卡将在约 ${alert.hours} 小时内到期。`, `A reset credit expires in about ${alert.hours} hours.`), silent: true }).show(); }
        catch { store.error = true; }
      }
    }
    broadcast();
  });
  nativeTheme.on('updated', broadcast);
  powerMonitor.on('suspend', () => { quota.stop(); badge.hide(); closePanel(); });
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
  app.on('second-instance', () => { pinnedPanel = true; openPanel(true, true); });
  app.on('activate', () => openPanel(true, true));
}
app.on('before-quit', () => { quitting = true; clearInterval(watchdog); clearInterval(dragTimer); clearTimeout(leaveTimer); clearTimeout(hoverTimer); quota?.stop(); observer?.kill(); tray?.destroy(); });
app.on('window-all-closed', () => { if (!quitting) app.quit(); });

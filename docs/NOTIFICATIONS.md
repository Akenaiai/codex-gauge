# Notification repair and Windows acceptance / 通知修复与 Windows 验收

This branch follows the 0.2.1 baseline. It does not change quota data, spend credits or publish a new release.

## Delivery and activation

- Windows registers a stable toast activator CLSID before notifications initialize and uses `Notification.handleActivation` for all clicks, including retained notifications after restart and cold launch. Early activations and second-instance launches wait until the panel exists. The panel is pinned, shown and focused. Non-Windows notifications retain instance click handlers.
- `ledger` still contains only expiry timestamps, preserving existing account/stage deduplication. A new `deliveries` field records `queued`, `sending`, `sent`, `failed` and `unknown`, attempt count and deadlines. Existing preferences and legacy ledger entries stay intact. An old ledger entry cannot reveal whether the pre-fix application actually delivered it; those entries are preserved rather than replayed.
- Discovery and the news baseline are saved together. Submission records intent first. Only the native `show` acknowledgement commits success to `ledger`. Synchronous throws and native `failed` callbacks persist a failure and retry at most twice, after minimum waits of 30 and 120 seconds (three total attempts per event/stage, across restarts). The 30-second local check re-evaluates current opt-outs, host activity, account, stage, source freshness and eligibility. It makes no network or model calls itself; existing service polling remains responsible for freshness.
- Notification objects are held through acknowledgement and interaction. Deterministic 16-character IDs and a fixed group identify retries. In-flight duplicates and late callbacks from a prior failed attempt are ignored. Success is not replayed after a restart.
- After 15 seconds with no acknowledgement, or a restart during `sending`, the outcome is `unknown`. Automatic resend stops because Windows may already have accepted the toast. A later acknowledgement in the same process can still confirm success. A persistence failure before submission prevents a native send; a failure to save success suppresses further sends in memory, and the persisted intent becomes unknown after restart.
- Failed, exhausted, unknown and storage-error states have separate English/Chinese panel notices. An OS `show` acknowledgement is not evidence that a person saw a banner. Focus Assist and notification settings remain OS-controlled.

The implementation follows the pinned Electron 44.5.1 APIs: [global activation](https://github.com/electron/electron/blob/v44.5.1/docs/api/notification.md#notificationhandleactivationcallback-windows) and [stable activator identity](https://github.com/electron/electron/blob/v44.5.1/docs/api/app.md#appsettoastactivatorclsidid-windows). Notifications made before this fix may use an old runtime-generated identity. Their migration is not guaranteed; test retained notifications created by the repaired build separately from old 0.2.1 notifications.

## Automated checks

```powershell
npm test
npm run build:native
npm run smoke
```

`smoke` only reads local account/rate-limit capabilities, reports no account identities or readings, and makes no model requests. Tests use synthetic data and temporary profiles. The tests exercise production reminder functions as well as the delivery state machine, including the news-baseline/first-send storage failure boundary and unchanged 0.2.1 renderer behavior.

## Isolated Windows installation test

Build a separate acceptance-only NSIS application:

```powershell
npm run build:native
node node_modules/electron-builder/cli.js --config scripts/notification-acceptance.build.cjs --win nsis --x64
$qaSetup = Join-Path (Get-Location) '.local/notification-acceptance-build/Codex Gauge Acceptance Setup 0.2.1.exe'
$qaInstall = Join-Path $env:LOCALAPPDATA 'Programs/Codex Gauge Acceptance'
$qaResult = Start-Process -FilePath $qaSetup -ArgumentList '/S', "/D=$qaInstall" -WindowStyle Hidden -Wait -PassThru
if ($qaResult.ExitCode -ne 0) { throw 'Acceptance installer failed' }
$qaExe = Join-Path $qaInstall 'Codex Gauge Acceptance.exe'
Start-Process -FilePath $qaExe -WindowStyle Hidden
$qaRun = Join-Path ([System.IO.Path]::GetTempPath()) 'codex-gauge-notification-acceptance'
Get-Content -LiteralPath (Join-Path $qaRun 'events.jsonl') -Tail 12
```

The acceptance app has its own name, AppID, CLSID, install location, synthetic RPC/feed/host and temporary settings. It exercises the production main, notification delivery and panel code. It blocks real network requests and startup registration. Its installer excludes the production native helpers and startup install/uninstall hooks. Production settings are hashed before/after; `protected_settings.unchanged` must be true. It is an instrumented installed test, not the unchanged production AppID environment. Do not run the Git script alongside the installed acceptance app: Windows must register the installed executable, not `electron.exe`, as the cold-launch target.

Commands below write only the acceptance app's control file. Wait for the matching `command_done` before the next command; inspect any `command_failed` before retrying.

```powershell
function Send-GaugeAcceptance([string]$Name) {
  [System.IO.File]::WriteAllText((Join-Path $qaRun 'command.json'), (@{ name = $Name } | ConvertTo-Json -Compress))
}
Send-GaugeAcceptance 'snapshot'
```

1. Leave the initial `[Gauge acceptance]` notification unclicked. Confirm `native_show`, a `sent` record and one ledger entry. `snapshot` must report only one send, including after repeated 30-second checks.
2. `Send-GaugeAcceptance 'quit'`. Confirm the sender exited and `protected_settings.unchanged=true`. Start the same installed `$qaExe` again. `ready.toastCount=0` proves the same event was not resent. Manually open Windows Notification Center and click the retained test notification. Require `native_activation` / `panel_after_activation`, or `second_instance` / `panel_after_second_instance`, with both `visible=true` and `focused=true`. Record which route was observed and whether the click was human or automated.
3. `Send-GaugeAcceptance 'new'` creates a new synthetic schedule event. Leave its notification unclicked. Quit again, then click that notification while **no acceptance process is running**. Windows must cold-launch the installed executable. Require a new PID, `start.packaged=true`, `native_activation`, focused panel and no duplicate send for the same key.
4. `Send-GaugeAcceptance 'credit'` creates a synthetic expiring credit. Test its click through the same global route. The production expiry branch must not depend on a separate missing instance callback.
5. Quit the acceptance app and preserve logs. Do not clear production notification history or delete user settings. The separate acceptance install can remain available for rechecking; it never enables startup.

To inspect Windows history, run the following with Windows PowerShell 5.1, which provides WinRT projection. This reads only the separate test AppID:

```powershell
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null
$qaHistory = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('com.aken.codexgauge.acceptance')
$qaHistory | Select-Object Tag, Group, ExpirationTime
```

## Production installation handoff

After code review, build the production installer from the fixed branch using the existing `npm run build:win` flow into a new output directory. Save the branch commit, installer hash and ASAR/source hashes. Keep the released 0.2.1 installer available for rollback. Before replacing the daily installation, snapshot both the normal and MSIX-redirected Gauge settings locations and current startup task state, retaining existing files. Do not overwrite them with the acceptance profile. The separate acceptance installer must never be distributed as a normal Gauge release.

For an unchanged production-AppID check, use one production install at a time, keep development/test processes with that AppID closed, and retain a notification created by the fixed build. Test both an ordinary process restart and a full cold launch. Compare preferences before/after; new delivery bookkeeping may change the settings-file hash while preference values remain equal. Observe the next naturally eligible event or use a separately reviewed local instrumentation run with synthetic inputs; record which one was used. Do not spend quota, reset an account, change system time or alter real quota readings to force a notification. The unchanged installed environment remains pending until this evidence exists.

## 中文执行摘要

修复保留现有偏好与旧去重记录。发送意图、系统确认成功、明确失败和结果未知分别落盘；收到 `show` 才写成功，明确失败最多 3 次，重启仍保留次数。没有回执或发送中断时停止自动重发，面板提示查看提醒。Windows 用固定 CLSID 与全局激活回调打开并聚焦面板，覆盖周期、消息和重置卡提醒。

上方命令可交给本地 Codex 直接执行。隔离验收安装使用独立 AppID 与合成输入，不动日常应用配置。必须分开记录：自动化测试通过、真实系统留存、重启后的实际点击、无进程时的冷启动点击、正式 AppID 的原样安装验证。`show` 或模拟点击不能代替真实点击证据。

自然 2h/1h 额度事件、真实补额、真实睡眠/登录和专注模式仍按现场情况验收，不通过额外消耗额度制造事件。旧 0.2.1 通知可能带旧激活身份，不承诺自动迁移。

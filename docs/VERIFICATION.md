# Verification / 验证记录

Version: 0.2.1. Date: 2026-10-22. Platform: Windows x64.

## 0.2.1 visual reminder priority / 提醒视觉优先级

- Fresh pending announcements and imminent scheduled resets render before the dials with a stronger amber surface, border, heading and timing. Expiring available credits render first in red within 48 hours; within 24 hours the label and border become stronger. The small gauge prioritizes the red credit marker over amber reset markers. Historical/stale messages and distant/elapsed credits do not gain urgency styling.
- All 28 automated checks passed, including 48h/24h thresholds, stale/expired exclusions, top-of-panel ordering, single rendering of each card, bilingual urgent labels and small-gauge marker priority.
- Five synthetic Electron captures were checked: urgent Chinese graphite, urgent English porcelain, English at 320px, 36-hour expiry and a normal state. In the narrow urgent state both credit and announcement cards ended above 478px in a 650px panel; no horizontal overflow was found. The normal credit retained its neutral border. No live account data is in the captures or tests.
- This release changes visual priority only. Notification sending, deduplication, historical activation and the known delivery gaps documented below are unchanged.
- 28 项检查通过；中英文深浅色、320px 窄窗口、36 小时临期和普通状态已实看。红色卡片与橙金色消息位于顶部，普通卡片保持原色。本轮不把视觉改进当作通知送达缺口已修复。

## 2026-10-22 Windows notification acceptance / Windows 通知验收

- The 24 existing checks passed again against `e0b12c0`. Four notification-related modules in the installed 0.2.0 ASAR matched the checkout byte for byte.
- An isolated Electron 44.5.1 process exercised the existing main-process reminder, persistence, service and panel code. Synthetic RPC/feed/host inputs replaced external inputs; startup registration and real network requests were blocked. Production settings and account configuration were not changed. This was not a complete test of the installed application's launch/activation environment.
- **Real Windows delivery:** a synthetic scheduled reminder emitted a native `show` event and was independently found in Windows toast history under the application ID. The user confirmed seeing it. A new synthetic announcement was clicked while its sender remained running: the native `click` event fired, the panel became visible and focused, and the user confirmed that it opened. Test notifications had an explicit acceptance-test prefix. Instrumentation retained notification objects for callback logging; object-lifetime behavior in the uninstrumented app remains outside this result.
- **Isolated integration:** repeated event processing did not send another notification; a restarted process loaded the same reminder ledger without sending again. Injected RPC/feed outages retained readings with an offline state, suppressed new reminders and recovered without duplicates. Injected host absence stopped both polls when the panel was closed; manually opening the panel reactivated them. Injected suspend/resume callbacks recovered without duplicates. These results do not establish actual Codex shutdown, network disconnection, sleep or sign-in behavior.
- **Observed gap:** the user clicked an older test notification after its isolated sender restarted and no panel opened. This occurred with a test sender sharing the installed application's AppUserModelID; installed-build cold-start/restart activation still needs an independent test. The code has only instance-level click handling; it does not register the runtime's `Notification.handleActivation` callback for historical activations. The older credit-expiry branch also lacks an instance click handler and was not exercised with a real expiry notification.
- **Fault-injection finding:** the reminder ledger is persisted before sending. A synchronous `show()` failure or an asynchronous native `failed` event leaves that stage deduplicated, so processing the same event does not retry. The asynchronous path has no failure handler or error indication. This is a verified failure-path weakness, not a claim that the OS actually failed delivery during this acceptance run.
- **Still pending:** naturally eligible 2-hour/1-hour quota events, actual replenishment, real Windows sleep/resume and sign-in, focus-assist/banner variations, installed-build historical-notification activation, and Mac acceptance. No quota was deliberately spent or reset. Product runtime code and release binaries were not changed by this acceptance work.
- 中文结论：合成事件经真实 Windows 通道送达已确认；发送进程持续运行时，新通知真实点击打开面板已确认。跨重启去重及断网、关闭宿主、电源回调的隔离验证通过。重启测试发送进程后的旧通知点击未打开面板，正式安装场景仍需独立复验；发送失败后仍被去重、异步失败没有提示的问题经故障注入确认。自然额度事件、真实睡眠/登录、专注模式和 Mac 继续待验，不能合并为全部通过。

## 0.2.0 reset reminders / 额度重置提醒

- Twenty-four automated checks passed: the original twelve plus scheduled reminder stages, restart/account deduplication, low/expired/stale quotas, historical confirmation baselines, changed and new announcements, credit grants, unspecified event kinds/times, expired announcement windows, source staleness, URL filtering, malformed/empty responses, ETags/304 and Retry-After. Chinese and English renderer checks cover countdowns, balances and uncertainty labels.
- Isolated Electron captures used synthetic data at 356 × 650: Chinese graphite, English porcelain and settings. Reset timing, remaining balance, announcement timing and original-post controls were visually checked. The settings view scrolls for all controls. No real quota or announcement data is included in the public source or test fixtures.
- The live recent-announcement schema and source verification time were checked on 2026-10-21. The latest event at that check was an already-confirmed event from 2026-10-20, with unspecified reset kind and audience; no future event was fabricated. The feed is anonymous, uses its recent endpoint and makes no model calls. The old paused chat automation remains paused.
- New usage-reset and public-news toggles default on, independently from the existing credit-expiry toggle. Notifications require the app to be running, Codex or the manual panel to be active, fresh source/account data and Windows notification support. Natural reset delivery, sleep/re-login behavior, OS focus-assist visibility and Mac remain separate field-validation gaps.
- 24 项自动检查通过；中英文 Electron 示例图已实看。消息时间不明、形式不明、过期和断线均明确显示，临时确认不推定个人账户到账。尚未等待自然重置触发通知，不把隔离逻辑检查当作系统通知中心已实际送达。

## 0.1.2 expiry display / 到期显示

- Reset-credit expiry uses days and hours: 84 hours becomes 3d 12h. Sub-day values use hours, sub-hour values say less than one hour, and elapsed deadlines await refreshed data. Both English and Simplified Chinese were checked.
- Twelve existing automated checks passed. Sixteen isolated renderer checks covered long durations, exact days, rounding, sub-day/sub-hour values, elapsed deadlines, missing credits and unavailable metadata. An isolated Electron renderer returned the expected Chinese and English captions with synthetic data.
- 重置卡到期提示改为“还有约 3 天 12 小时”格式；12 项现有检查和 16 项隔离渲染检查通过。临近到期、已到期及信息缺失均覆盖，中英文渲染已核对。真实到期通知及 Mac 验证边界沿用下方记录。

## Verified

- Twelve automated checks (including startup-registration failure preservation and successful migration ordering): account bucket selection, weekly-only and unfamiliar windows, malformed/missing data, credit filtering, account-isolated reminder deduplication, screen-bound placement, settings reload/corrupt-file preservation, account switches during requests and offline fallback.
- Real local Codex app-server connection using read-only account and rate-limit calls. The tested account returned a weekly window and reset-credit metadata; no five-hour window was fabricated.
- Real Windows UI Automation profile-anchor discovery in the running Codex app.
- Native app rendering, opening the settings panel, changing English/Chinese, persistence across application restarts, keep-on-top control, dragging with a saved position and double-click reset.
- Windows NSIS installer and ZIP build; installer completed successfully. The installed application was opened and interacted with, including the corrected double-click reset.
- The 0.1.0 login entry alone did not meet start-with-Codex behavior. On 2026-10-04, the settings file seen by a Codex-launched process resolved into the MSIX package's redirected AppData, while a scheduled task reported the normal-profile file missing.
- The independent native launcher was run by Windows Task Scheduler in the logged-in user session. First-run settings migration succeeded without overwriting an existing normal-profile file; it detected the actual Codex desktop and started Gauge. Process ancestry pointed to the Windows task, not the Codex tool process.
- An intentional termination of the Gauge main process was recovered by the launcher while Codex remained open; the new Gauge process had the launcher as parent. Actual profile-anchor discovery passed.
- The final 0.1.1 installer completed successfully, and installed/ZIP native helpers matched the compiled source outputs by SHA-256. The installed settings panel showed **Start with Codex**; turning it off removed the Windows task, and turning it back on restored a running task. Quota retrieval remained functional. The native anchor probe also passed when executed by a separate Windows task, outside Codex's package environment.
- Browser preview: graphite/porcelain, Chinese/English, low-usage and offline presentations. No browser console errors in the tested flow. Public screenshots contain synthetic data only.
- Public-source file scan: no detected credential literals, personal home paths or private settings. The packaged ASAR contains only application code, original assets and license notices.

## Limits

- The Windows app is not Authenticode-signed. SHA-256 checksums identify release bytes; they are not a digital signature.
- Start-with-Codex recovery and reminder delivery are implemented but a real OS sign-in cycle and a naturally expiring credit have not been tested. Reminder scheduling is covered by isolated logic checks.
- Current host geometry was verified. Every DPI setting, monitor topology, native minimize/restore combination and long sleep/resume session has not been exhaustively tested.
- macOS has not been run or built on a Mac. Its present mode floats independently and does not attach to the profile or observe the host lifecycle.
- Production npm dependency audit reports no findings. The development-only electron-builder download chain reports a high-severity `http-cache-semantics` advisory with seven propagated findings. These packages are not in the application ASAR; the build downloads public runtime artifacts, not authenticated user responses. No claim of a clean full development-dependency audit is made. Reassess when the upstream chain is fixed.
- Update checking is manual and opens the release download page. Automatic installation is not implemented in this version.

中文说明：原版额度读取、头像定位、双语、保存、拖动和归位的验证保留。0.1.1 新增独立 Windows 启动助手，已真实查明 MSIX 设置目录重定向导致的读取差异，验证首次迁移、Windows 后台任务拉起刻度及意外退出后的恢复。12 项自动检查通过。尚未通过重新登录 Windows 或再次更新 Codex 做完整现场验证，也不把配置成功当作这些场景已通过。Mac 尚未实测；安装包未代码签名；构建期依赖告警及其他限制如上。

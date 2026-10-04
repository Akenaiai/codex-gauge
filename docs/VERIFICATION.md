# Verification / 验证记录

Version: 0.1.1. Date: 2026-10-04. Platform: Windows x64.

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

# Verification / 验证记录

Version: 0.1.0. Date: 2026-10-03. Platform: Windows x64.

## Verified

- Ten automated checks: account bucket selection, weekly-only and unfamiliar windows, malformed/missing data, credit filtering, account-isolated reminder deduplication, screen-bound placement, settings reload/corrupt-file preservation, account switches during requests and offline fallback.
- Real local Codex app-server connection using read-only account and rate-limit calls. The tested account returned a weekly window and reset-credit metadata; no five-hour window was fabricated.
- Real Windows UI Automation profile-anchor discovery in the running Codex app.
- Native app rendering, opening the settings panel, changing English/Chinese, persistence across application restarts, keep-on-top control, dragging with a saved position and double-click reset.
- Windows NSIS installer and ZIP build; installer completed successfully. The installed application was opened and interacted with, including the corrected double-click reset.
- Windows login startup: enabled through the installed app's settings UI; the saved setting and the per-user Windows Run entry both matched the installed executable, with no disabled startup override found. A real Windows sign-in cycle remains untested.
- After a Codex update, Gauge was found not running. Relaunching the installed app restored the visible gauge; the profile-anchor probe still passed. The exact cause of process exit was not established, so this is not evidence of a fixed update-lifecycle bug.
- Browser preview: graphite/porcelain, Chinese/English, low-usage and offline presentations. No browser console errors in the tested flow. Public screenshots contain synthetic data only.
- Public-source file scan: no detected credential literals, personal home paths or private settings. The packaged ASAR contains only application code, original assets and license notices.

## Limits

- The Windows app is not Authenticode-signed. SHA-256 checksums identify release bytes; they are not a digital signature.
- Login startup and reminder delivery are implemented but a real OS sign-in cycle and a naturally expiring credit have not been tested. Reminder scheduling is covered by isolated logic checks.
- Current host geometry was verified. Every DPI setting, monitor topology, native minimize/restore combination and long sleep/resume session has not been exhaustively tested.
- macOS has not been run or built on a Mac. Its present mode floats independently and does not attach to the profile or observe the host lifecycle.
- Production npm dependency audit reports no findings. The development-only electron-builder download chain reports a high-severity `http-cache-semantics` advisory with seven propagated findings. These packages are not in the application ASAR; the build downloads public runtime artifacts, not authenticated user responses. No claim of a clean full development-dependency audit is made. Reassess when the upstream chain is fixed.
- Update checking is manual and opens the release download page. Automatic installation is not implemented in this version.

中文说明：已验证真实账户只读读取、实际头像控件定位、原生设置点击、中英文切换及重启保留、拖动保存、双击归位、安装程序和已安装应用。已通过安装版界面启用开机启动，并核对设置文件与 Windows 当前用户启动登记一致，未发现禁用覆盖。Codex 更新后曾发现刻度未运行，重新启动后仪表恢复，头像定位仍通过；尚未查明进程退出原因，不声称修复了更新生命周期问题。截图均为示例数据。未覆盖自然开机登录、真实卡片到期、多屏/缩放全部组合和长时间休眠。Mac 尚未实测；当前仅自由悬浮。安装包没有代码签名。构建依赖存在上述缓存库告警，不在运行包内；不声称全部开发依赖零告警。

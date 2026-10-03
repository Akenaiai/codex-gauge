# Mac handoff / Mac 接续

Windows is the first supported target. The Electron renderer and read-only quota service are platform-neutral; `native/GaugeHost.cs` is Windows-specific.

Mac 接续从本仓库开始，不复制 Windows 用户数据或认证文件。先在 Mac 安装并登录官方 Codex CLI，再 `npm ci && npm start`。当前 main process 在 Mac 使用自由悬浮位置，不冒充头像吸附。

## Remaining checks

1. Run the real read-only smoke test on the Mac account; verify CLI discovery for Apple Silicon and Intel.
2. Run the packaged app and test theme, language, tray/menu bar, saved positions, login startup, screen edges, Retina scaling and sleep/resume.
3. Implement a Mac host observer with a narrow Accessibility permission boundary, if profile anchoring is desired. Get real control names/geometry from the Mac Codex app; never transplant Windows coordinates.
4. Replace the Mac placeholder host lifecycle (`exists: true`) with actual host process/window observation. Until then, the floating gauge remains available independently of Codex's window.
5. Build using `npm run build:mac`; signing/notarization is a separate, currently unconfigured release capability.

Windows artifacts do not validate any Mac behavior. Do not mark Mac complete merely because dependencies install or a DMG builds.

Mac 侧待验：真实额度、Apple Silicon/Intel CLI 路径、菜单栏、明暗和语言、位置恢复、开机启动、Retina、多屏、休眠恢复。若继续做头像吸附，再在 Mac 核对当前控件并申请必要权限。Windows 安装包和 Windows 的测试记录都不代表 Mac 验收。

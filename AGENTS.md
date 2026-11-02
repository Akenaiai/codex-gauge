# Codex Gauge 项目约定

- 当前状态先读 `.agent/CONTINUITY.md`（若存在）、`docs/AI_HANDOFF.md`；跨平台流程读 `docs/CROSS_PLATFORM.md`。真实Git与CI状态优先。
- Mac和Windows共享main、通用业务/界面与版本号；平台差异放原生观察、启动及打包层。不得以旧平台分支整文件覆盖新版业务。
- 从最新main创建短期功能分支。所有PR都必须运行Windows x64 / Mac arm64 Check；`Cross-platform gate`成功只证明自动检查，不替代实机验收。
- 本地验证：`npm ci`、`npm test`；Mac原生自检 `native/bin/GaugeHostMac --self-test`；独立启停场景 `python3 scripts/mac-follow-acceptance.py`。后者不操作真实Codex。
- 构建：Windows `npm run build:win -- --publish never`；Mac `npm run build:mac -- --arm64 --publish never`。共享MCP依赖经prepare-package暂存；verify-package检查桌面/外部资源完整性。新增共享模块时同步更新两处及回归检查。
- main合入、打标签、发布、替换用户安装、改变启动项/权限均遵守当次授权。CI只保存候选，不自动发布。不得为验收主动触发Codex更新。
- 不提交本机配置、凭据、账户快照、`.local/`或私有验收产物。跨设备不复制凭据。保持既有只读额度边界。
- 版本统一升级，已发布版本不覆盖重发；发布门禁与平台支持范围见docs/CROSS_PLATFORM.md。

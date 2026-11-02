# 跨平台整合候选（2026-11-02）

本地分支 `codex/integrate-mac-main-20261102`，以最新 main `2e47865b8c37975af397f6b31a093467c1cf7e07`（0.4.4）为底，整合 PR #3 `07d5cdb43c9387e27a6b09933f9e062d11185739`。共同祖先 `98a438c`；main 独有21次提交、PR独有8次提交。后续按用户“规划并落实统一”的要求，准备提交整合、快进更新PR #3，并运行双平台候选构建；不合入main、不替换现用应用、不正式发布。最终推送及CI状态以PR和本地连续性记录为准。

## 冲突与处理

实际三方合并复现3个冲突文件、7处冲突段；不是草稿状态导致的文本冲突。

| 文件 | 回退风险与处理 |
| --- | --- |
| package.json | 保留0.4.4版本、现有依赖和浏览器扩展；合入Mac原生资源、构建命令和打包前后检查。package-lock.json不变。共享源文件先暂存，避免extraResources排除ASAR中的桌面模块。 |
| src/main.cjs | 同时保留clipboard/systemPreferences、创作积分状态和翻面、浏览器连接及关闭清理、Mac权限/原生观察/手动退出暂停。开发隔离模式不启动浏览器桥接，避免争抢现用端口。 |
| src/ui/app.js | 保留新版创作积分翻面入口、额度中心与Mac权限提示，不整文件覆盖。 |
| 原生模块 | PR的Swift/Node-API/启停助手及Windows原生源码原样保留；更新避让缓存、确认消失再归位算法未重写。 |
| 打包脚本 | 补齐新版MCP依赖credit-user-dates.cjs和ui/credit-cadence.js；检查两平台原生资源、浏览器扩展及桌面依赖。旧PR的资源清单直接套用会导致MCP启动缺模块。 |

主线的额度中心、Runway/Recraft/可灵读取器、创作积分模型、浏览器读取模块和扩展与2e47865保持一致。它们现有的自动化检查随整合完整执行；此前主线三平台真实读取结果属于历史证据，本轮没有重新进行真实账户读取。

## 本轮验证

- `npm ci`：完成，Mac原生编译成功；依赖锁未改。安装报告18项依赖告警（16 moderate / 2 high），未自动升级；不据此宣称发行依赖审计通过。
- `npm test`：227项，225通过、2项Windows专属跳过、0失败。新增MCP暂存资源真实启动、缺件拒绝、Mac权限与创作状态共存检查；退出检查同时断言浏览器连接关闭。
- `native/bin/GaugeHostMac --self-test`：通过；覆盖几何、更新避让、短暂AX失败、确认消失、移动等逻辑，不读取真实应用界面。
- `python3 scripts/mac-follow-acceptance.py`：8项独立夹具应用启停场景通过，包括暂停持久化和新宿主会话恢复；不是新候选的真实Codex启停验收。
- Mac arm64目录应用构建通过。使用本地Electron44.5.1原始ZIP，SHA-256与依赖内校验清单一致；使用现有图标和ad-hoc签名。`codesign --verify --deep --strict`通过；未公证。
- 实际app.asar相对依赖检查、原生文件、MCP与浏览器资源检查通过；包内MCP进程实际回答tools/list；包内Electron加载Node-API模块成功（未调用AX读取）。
- 使用独立开发配置启动Electron成功：0工具、0记录、未启动原生观察器。仅证明隔离启动，不代表视觉/交互/实时读取验收。

构建产物：`dist/mac-arm64/Codex Gauge.app`。本地日志、独立配置和启停报告在`.local/`，不入库。未替换/启动此包读取真实用户账户；现用安装和LaunchAgent保持原状。

## 剩余门禁

本机自动检查通过。新增统一协作规则和双平台候选构建流程；远端结果以PR #3对应最新提交的Checks为准。

1. 本次授权包含落实统一协作，采用保留双方祖先的合并提交更新现有草稿PR #3，不新增竞争整合入口；不直接合入main或发布。
2. 在Windows跑下面的完整检查及安装后实机回归：额度中心、三家创作平台只读连接、浏览器读取、原小仪表定位/置顶/启停。尚未运行本候选的Windows编译/打包或双平台远端CI，Mac上的通过不代替它们。
3. Mac新候选安装后的头像跟随、菜单栏、权限保留、真实Codex启停需回归。PR旧候选已确认的拖动跟随、启停、更新按钮显示期间稳定避让是继承的历史证据。下载/安装状态切换、按钮消失归位、跨屏/休眠、Intel与Mac平台账户连接仍需对应实机验收。不要为验收主动触发Codex更新。
4. 签名、公证、发行依赖评估与正式发布是独立门禁。

Mac复核（开发环境）：

```sh
npm ci
npm test
native/bin/GaugeHostMac --self-test
python3 scripts/mac-follow-acceptance.py
npm run build:mac -- --dir --arm64
node scripts/verify-package.cjs 'dist/mac-arm64/Codex Gauge.app/Contents/Resources' darwin
```

Windows复核（Windows检出该候选后）：

```powershell
npm ci
npm test
npm run build:win
node scripts/verify-package.cjs dist/win-unpacked/resources win32
```

这些命令不主动发布；打包依赖下载及Mac签名环境按目标机实际配置处理。真实平台读取仅使用该设备已有授权，不复制Mac/Windows凭据。

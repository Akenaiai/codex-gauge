# Windows 0.3.4 与 Mac 适配合并候选

2026-10-30；分支 codex/merge-windows-mac-034。基于 origin/main 的 55afebb（0.3.4），将本机基于4a3833f/0.2.3的Mac改动三方合并。冲突集中于 package.json、src/main.cjs、src/ui/app.js，均保留双方功能。随后并入主线98a438c的首次使用与隐私说明更新。集成评审入口为[PR #3](https://github.com/Akenaiai/codex-gauge/pull/3)。

## 合并内容

- 完整保留 Windows 0.3.4 的额度中心、连接与日期依据、月度预计恢复、多账号隔离及MCP/relay资源。
- 保留 Mac 主进程Node-API/Swift头像定位、更新按钮避让、权限入口、16pt单色菜单栏与Retina裁切修复。
- 保留额度中心入口和Mac授权提示；打包同时包含通用MCP资源与Mac原生模块。
- 修复 Mac Claude Desktop 凭据配置路径：使用 Library/Application Support，而Windows继续AppData路径；新增隔离配置回归检查。
- 新增随包分发的GaugeFollowMac助手、Mac启动项管理、失败回退、旧助手迁移和手动退出暂停；当前用户生产安装和启动项未改变。

## 已验证

- npm test：121项，119通过、2跳过，0失败。
- Mac原生编译、自检、Node-API模块装载成功；模块装载检查没有读取真实Codex界面。
- Mac arm64应用构建与深度签名验证通过。
- 实际包包含Mac定位模块、菜单栏资源、额度中心UI及MCP/relay必要文件。
- ASAR文件清单未包含运行设置、凭据或账户JSON及.env文件；此检查不替代正式发行前的完整隐私核验。

## 验证边界与下一步

已在隔离配置目录实际打开合并版额度中心，验证总览、全部工具与语言切换；0工具、0余额、未启动头像观察器，没有读取本机AI配置或查询真实额度。原生助手8项独立应用启停场景通过。当前Mac安装与真实启动项保持原有运行版本。本合并候选通过独立分支和PR评审，合入与正式发布仍需单独验收。

下一门槛：通过集成PR运行新增的Windows/macOS自动检查矩阵并评审；Windows远程设备当前不在线，目标机器桌面行为仍需验收。检查与评审通过后合入main，再分别发布两平台产物。公共隐私核验与正式发布仍是独立门槛。

## 本机安装发现与修复

实际安装合并包时发现：electron-builder会把extraResources直接引用的源文件从ASAR排除，额度中心因此缺少catalog/model/policies/date-observations模块。新增prepare-package钩子先复制伴随资源到独立构建目录，桌面与MCP两份文件均保留；verify-package钩子在签名前检查ASAR相对模块依赖、界面入口和两平台原生伴随文件。旧缺件包被该检查明确拒绝，修正版通过并实际启动、同步额度，原有Mac权限保留。

实机⌘Q还发现默认Mac应用菜单绕过托盘的退出暂停。before-quit现在同步写入宿主会话暂停标记，不取消原生退出；新增菜单/键盘退出、状态不可读和Windows原行为的回归检查。当前124项检查，Mac上122通过/2项Windows专属跳过。安装与启动项的本机恢复材料保留在不入库的.local目录；真实Codex更新控件与完整宿主退出/重开仍需现场验收。

后续两台设备各用功能分支，经PR回到同一主线。通用业务与界面共享，定位、启动和打包保留平台分支。不要互相覆盖整个项目目录。

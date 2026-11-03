# 接入能力与状态（源码预览）

[English](CONNECTION_CAPABILITIES.md) · [额度中心](CREDIT_CENTER.md)

本次为现有适配增加可复用的接入依据；没有替换稳定版 0.4.4 安装包，没有新增向导、原生远程 OAuth 客户端、安装操作或正式更名。

## 后续连接流程的接口

`CreditCenter.state()` 增加：

- `connectionCatalog`：平台说明，包含自动适配及暂不支持的平台。字段包括 `provider`、`route`、`quotaKind`、`os`、`components`、`auth`、`entry`、`sources`、`checkedOn` 和双语 `limits`。`entry: null` 表示没有提供已核实的安装入口。`evidence: adapter_contract` 表示依据现有本地实现，不能冒充公开安装文档已验证。
- `connectionComponents`：组件 ID、双语名称、已核实的官方安装来源及是否随刻度提供。远程 MCP 服务运行在平台端；**当前适配**仍依赖本机 Codex CLI 客户端，不要求另装一个本地平台服务器。
- `tools[].access`（`schemaVersion: 1`）：分别表达发现、组件、授权、查询与读数。原 `adapter` 仍表示有适配，`queryReady` 表示具备尝试现有只读路径的条件，均不证明登录成功或还有余额。

`tools` 仍只包含实际发现和已有记录的工具；空白用户为空列表，不将全部支持平台铺满首页。

`access.components` 保存文件存在性及缺失组件 ID，不运行安装器、不执行任意发现的程序、不导入 Relay 模块、不打开账户页、不解密凭据。文件存在不保证可运行；重新发现或刷新会复查组件和配置，时间在 `checkedAt`。API 仅暴露凭据引用状态；DPAPI 后备需 Windows 和 PowerShell，要求原生执行文件的读取器不会把 shell 包装脚本当可用组件。

`access.authorization.status` 为 `unconfirmed`、`required`、`verified` 或 `identity_unverified`，有读数时保留核对时间。配置、Skill、缓存、宿主连接名称和加密文件都不是已登录证明。网页、Lovart、Suno 等缺少稳定身份的真实读数仍标身份待核实。本人会员或日期填写不证明真实权益（`membershipInputVerifiesQuota: false`），不会生成余额。

`access.query` 提供 `supported`、实际选择的 `route`、`canAttempt`、`status` 和固定错误码。状态包含暂不支持、缺组件、需配置、配置错误、可尝试查询、连接中、查询中、已查询、读数过旧、离线、需登录、账号变化及查询失败，英文值见配套英文文档。可灵只有未配置或已停用会员 MCP 才退回原 CLI；错误地址或多个启用配置为 `configuration_invalid`，不能换账号绕过错误。缓存或 Skill 本身不触发查询。Relay 需要完整配套文件、Python、随包桥接，并满足已启用 Codex Relay 插件、已装对应编程 CLI 或已有 Relay 读数之一；已启用插件可沿现有只读批量查询发现账户，各编程平台的单独刷新也沿同一批量入口。

`access.reading.status` 分为 `none`、`recorded`、`unknown`、`zero`、`available`、`stale`、`account_changed`。本人及宿主记录保留为记录，缺失值保持未知，实查零仍是零。暂时失败保留旧金额和原时间但标旧读数；授权失效或身份变化将旧账号从有效视图与提醒中移出。原记录 ID、日期、规则、偏好与原徽章继续有效；Codex 退出登录后的旧账号退役会在重启前保存。

`gauge_inventory` 从中心已保存状态附加 `access`，并返回 `accessObservedAt`、`accessIsSnapshot: true`。它不扫描、不读凭据、不刷新上游。旧存储返回 `access: null`；消费者须把快照当历史证据，不能当实时授权。刻度启动时重新计算现场状态，不信任持久化的接入判断。

## 适配范围与来源

官方资料核对日期：**2026-11-03**。来源只证明文档所述能力；本机安装、本人授权与查询成功各自需要实际证据。

| 平台 | 当前依赖与额度类型 | 依据及限制 |
|---|---|---|
| Codex | 本机 Codex CLI app-server；编程订阅周期 | [官方协议](https://developers.openai.com/codex/app-server/)；OpenAI API 是另一个暂不支持的余额适配 |
| 小云雀 | 原生 CLI；当前个人或团队有效积分 | [官方 CLI](https://github.com/Pippit-dev/cli) |
| 即梦 / Dreamina | 原生 CLI 账号积分 | [官方安装概述](https://dreamina.capcut.com/tools/dreamina-cli)；地区与账号由原客户端确定 |
| Suno | 原 Codex MCP；歌曲、下载分项 | [官方 MCP FAQ](https://help.suno.com/en/articles/14486145)；账单续费不是积分到账证明 |
| Runway | Codex 与托管会员 MCP；当前团队 | [官方会员 MCP](https://help.runwayml.com/hc/en-us/articles/51931843164691-Connecting-to-Runway-MCP)；Developer API 独立 |
| Recraft | Codex 与托管会员 MCP；当前个人账户 | [官方 MCP](https://www.recraft.ai/docs/mcp-reference/remote-server)；本地 API MCP、未知或团队文本不替代此余额 |
| 可灵 | 原中国站 MCP 经 Codex，否则原中国站 CLI | [官方全球站说明](https://kling.ai/app/mcp/guide)核实个人付费额度范围；**不能据此核实中国站安装入口**，该入口留空，原适配地址不改 |
| Lovart | 原 Codex 命名 MCP；总量，身份待核实 | [官方积分规则](https://www.lovart.ai/statement/lovart-subscribe-faq)；公开安装说明仍未核实 |
| Kimi / MiniMax / Z.AI | 独立 Relay 配套插件、Python、随包桥接；编程订阅 | 现有本地适配契约，不宣称已核实公开 Relay 安装器；MiniMax 视频及本人会员记录独立 |
| DeepSeek / Firecrawl / Tavily | API Key，不依赖 Codex | [DeepSeek 余额](https://api-docs.deepseek.com/api/get-user-balance/)、[Firecrawl 积分](https://docs.firecrawl.dev/api-reference/endpoint/credit-usage)、[Tavily 用量](https://docs.tavily.com/documentation/api-reference/endpoint/usage)；不当作聊天会员 |
| TapNow / Ideogram | 本人安装并配对刻度浏览器组件、已授权可见页面 | [已有网页连接](BROWSER_CONNECTION.zh-CN.md)；MCP 可见不代表已实现余额读取。TapNow 复用已有主页，Ideogram 真实读取待验 |

组件来源：[Python 下载](https://www.python.org/downloads/)、[Microsoft PowerShell 安装说明](https://learn.microsoft.com/powershell/scripting/install/installing-powershell)。本次没有安装第三方组件或替用户完成账号授权。

## 验证边界

`tests/connection-capabilities.test.cjs` 覆盖空白用户、缓存及 Skill、缺组件、包装脚本、真实配置与宿主目录的区别、存在 CLI 但可灵 MCP 错误或歧义、加密引用、网页配置与离线、未知与零、旧读数、授权失效、账号切换及快照兼容。网络与授权案例使用合成输入。Windows 实际运行、界面检查及只读现场观察在本机任务回执单独记录。`os` 表达已实现分支，不是 Mac 实机验收；本项不声称新平台登录成功、干净实体电脑安装通过或未来新向导全流程已通过。

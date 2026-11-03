# Security / 安全

Gauge loads bundled local UI with a restrictive Content Security Policy, sandboxed renderers, no Node integration and a narrow validated IPC interface. Navigation, new web windows and renderer permission requests are denied. It never reads `auth.json` itself or requests a model response. Codex CLI manages its own existing login and may communicate with OpenAI as part of normal account access.

The Windows observer reads only local process/window geometry and the profile control. App-server stderr is discarded; server error details and account records are not logged. Updates are checked only after a user action, against this repository's fixed GitHub URL.

Report a suspected vulnerability privately to 934026@qq.com. Include a minimal reproduction with synthetic data. Never include login tokens, cookies or personal conversations in a public issue.

## Credit-center data / 额度中心数据

No Gauge account or provider login inside Gauge is required. The optional browser component may require normal provider sign-in in your own browser. Inventory reads known current-user client configurations, tool installation evidence, matching API environment variables and optional private imports. Supported queries use fixed adapters. The scanner does not execute arbitrary MCP commands or inspect browser cookies or chat archives. See the [source and connection table](docs/GETTING_STARTED.md#3-which-local-connections-are-read).

Existing CLI/MCP authentication stays with those clients. Supported API adapters can read the matching enabled MCP environment, current-process environment, current-user Windows DPAPI files, or an explicitly supplied API key. The optional Connect dialog receives the key temporarily, verifies a read-only provider request and stores it with local system encryption; it does not collect passwords or verification codes. API authentication goes to the corresponding provider. Keys do not enter persisted balance records, inventory or logs. A local process running as the same user is not an isolation boundary against other software with that user's privileges.

Balances, account labels, private date observations and reminder receipts remain in the application's per-user data directory. They are not included in the repository or release packages. Never distribute your data directory or private import files. Before attaching diagnostics to an issue, replace personal content with synthetic examples and review the entire attachment. The [v0.3.4 distribution audit](docs/PRIVACY_VERIFICATION.md) records its checked scope and limits, not a guarantee about all future builds or third-party clients.

界面只加载本地资源，使用隔离和受限接口。Codex CLI 沿用原有登录，可能按正常账户访问流程连接 OpenAI；刻度不自行读取 Codex 的 `auth.json`、不调用模型、不记录原始账户消息。

额度中心不需要刻度账号或在刻度里登录平台，可选网页组件可能需要在自己的浏览器里登录原平台，不读取浏览器 Cookie 和聊天档案。它读取当前用户的常见客户端配置与工具安装线索，已支持的 API 查询可读取对应的已有凭据。可选“连接查询”会临时接收本人输入的 Key，验证只读请求后用本机系统加密保存，不收集密码、验证码；认证请求发往对应平台，Key 不进入余额记录、目录和日志。同一用户权限下运行的其他软件不受刻度本地加密构成的独立隔离保护。

个人余额、账号别名、私人日期和提醒回执只保存在当前用户数据目录，不随源码或安装包分发。不要分享整个数据目录、私人导入文件或未脱敏的诊断附件。日期的来源、实查和预计边界见[首次使用教程](docs/GETTING_STARTED.zh-CN.md#4-哪些日期是实查哪些是预计)。安全问题请联系 934026@qq.com，使用示例数据复现，不在公开 Issue 上传凭据或私人对话。

## Optional browser component / 可选浏览器组件

See the [permission and storage details](docs/BROWSER_CONNECTION.md#what-is-read-and-stored). The component is off by default, uses separate optional site grants for TapNow and Ideogram, reads only fixed visible TapNow balance/team fields or user-selected Ideogram fields and reuses permitted existing TapNow home tabs without reloading or waking discarded tabs; only Ideogram refreshes its own dedicated tab. It has no cookie, debugger, history or request-interception permissions. Local pairing uses an encrypted key, a pinned extension origin, fixed authenticated messages and per-command freshness checks. Page observations always remain account-unverified. Re-pairing revokes the previous key.

组件默认关闭，只读 TapNow 固定可见余额 / 团队字段，或 Ideogram 本人点选位置，TapNow复用获准的已有主页且不刷新、不唤醒休眠页；Ideogram仅刷新自己的专用页；网站权限分开授权，不申请 Cookie、调试器、历史或请求拦截权限。本机连接使用加密密钥、固定扩展来源及带时效的固定认证消息；重新配对会使旧密钥失效。网页余额始终保留账号待核实标记。[详细说明](docs/BROWSER_CONNECTION.zh-CN.md#会读取和保存什么)。

## Independent official MCP authorization / 独立官方 MCP 授权

Runway/Recraft source readers use fixed official HTTPS origins, protected-resource/issuer metadata, public-client registration and PKCE S256 with a per-attempt state and random loopback callback path. Only the system browser opens the official authorization page; Gauge neither collects platform passwords nor imports other clients’ OAuth tokens. Native grants and refresh tokens stay in the main process and OS-encrypted `credit-oauth.json`; basic-text storage is rejected. Callback host/path/state/issuer and duplicate fields are checked. Cancellation, timeout, suspend and quit invalidate pending commits. Center-save failure restores the prior grant and records; refresh and disconnect use epochs to reject late commits. Only `whoami` (Runway) or `get_user` (Recraft) can be called; tool arguments are fixed empty objects. Provider scopes can be broader, including generation, and are disclosed before consent. Local disconnect removes Gauge’s grant, not the provider’s server-side consent.

源码中的 Runway/Recraft 独立授权只经固定官方 HTTPS 服务和系统浏览器，采用 PKCE S256、随机 state/回调路径、精确回调核对；OAuth 凭据仅留主进程与本机系统加密文件。取消、超时、休眠与退出阻止旧响应提交；中心保存失败回退原授权与记录。仅允许固定账户工具及空参数。平台可能授予包含生成的较宽权限，连接前明示；刻度不会调用生成。本机断开不等于撤销平台端同意。MiniMax 使用本人提供的国际站 Subscription Key 仅读通用订阅周期，普通按量 Key 与视频权益独立；密钥输入沿原临时密码表单，成功验证后系统加密，不进入状态/余额记录或日志。

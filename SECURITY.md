# Security / 安全

Gauge loads bundled local UI with a restrictive Content Security Policy, sandboxed renderers, no Node integration and a narrow validated IPC interface. Navigation, new web windows and renderer permission requests are denied. It never reads `auth.json` itself or requests a model response. Codex CLI manages its own existing login and may communicate with OpenAI as part of normal account access.

The Windows observer reads only local process/window geometry and the profile control. App-server stderr is discarded; server error details and account records are not logged. Updates are checked only after a user action, against this repository's fixed GitHub URL.

Report a suspected vulnerability privately to 934026@qq.com. Include a minimal reproduction with synthetic data. Never include login tokens, cookies or personal conversations in a public issue.

## Credit-center data / 额度中心数据

No Gauge account or additional provider browser login is required. Inventory reads known current-user client configurations, tool installation evidence, matching API environment variables and optional private imports. Supported queries use fixed adapters. The scanner does not execute arbitrary MCP commands or inspect browser cookies or chat archives. See the [source and connection table](docs/GETTING_STARTED.md#3-which-local-connections-are-read).

Existing CLI/MCP authentication stays with those clients. Supported API adapters can read the matching enabled MCP environment, current-process environment, current-user Windows DPAPI files, or an explicitly supplied API key. The optional Connect dialog receives the key temporarily, verifies a read-only provider request and stores it with local system encryption; it does not collect passwords or verification codes. API authentication goes to the corresponding provider. Keys do not enter persisted balance records, inventory or logs. A local process running as the same user is not an isolation boundary against other software with that user's privileges.

Balances, account labels, private date observations and reminder receipts remain in the application's per-user data directory. They are not included in the repository or release packages. Never distribute your data directory or private import files. Before attaching diagnostics to an issue, replace personal content with synthetic examples and review the entire attachment. The [v0.3.4 distribution audit](docs/PRIVACY_VERIFICATION.md) records its checked scope and limits, not a guarantee about all future builds or third-party clients.

界面只加载本地资源，使用隔离和受限接口。Codex CLI 沿用原有登录，可能按正常账户访问流程连接 OpenAI；刻度不自行读取 Codex 的 `auth.json`、不调用模型、不记录原始账户消息。

额度中心不需要刻度账号或平台网页登录，不读取浏览器 Cookie 和聊天档案。它读取当前用户的常见客户端配置与工具安装线索，已支持的 API 查询可读取对应的已有凭据。可选“连接查询”会临时接收本人输入的 Key，验证只读请求后用本机系统加密保存，不收集密码、验证码；认证请求发往对应平台，Key 不进入余额记录、目录和日志。同一用户权限下运行的其他软件不受刻度本地加密构成的独立隔离保护。

个人余额、账号别名、私人日期和提醒回执只保存在当前用户数据目录，不随源码或安装包分发。不要分享整个数据目录、私人导入文件或未脱敏的诊断附件。日期的来源、实查和预计边界见[首次使用教程](docs/GETTING_STARTED.zh-CN.md#4-哪些日期是实查哪些是预计)。安全问题请联系 934026@qq.com，使用示例数据复现，不在公开 Issue 上传凭据或私人对话。

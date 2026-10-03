# Security / 安全

Gauge loads bundled local UI with a restrictive Content Security Policy, sandboxed renderers, no Node integration and a narrow validated IPC interface. Navigation, new web windows and renderer permission requests are denied. It never reads `auth.json` itself or requests a model response. Codex CLI manages its own existing login and may communicate with OpenAI as part of normal account access.

The Windows observer reads only local process/window geometry and the profile control. App-server stderr is discarded; server error details and account records are not logged. Updates are checked only after a user action, against this repository's fixed GitHub URL.

Report a suspected vulnerability privately to 934026@qq.com. Include a minimal reproduction with synthetic data. Never include login tokens, cookies or personal conversations in a public issue.

界面只加载本地资源，使用隔离和受限接口。Codex CLI 沿用原有登录，可能按正常账户访问流程连接 OpenAI；刻度不直接读取认证文件、不调用模型、不记录原始账户消息。安全问题请联系 934026@qq.com，使用示例数据复现，不在公开 Issue 上传凭据或私人对话。

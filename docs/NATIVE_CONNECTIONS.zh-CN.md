# 独立连接（源码预览）

[English](NATIVE_CONNECTIONS.md) · [首次连接](NEW_USER_CONNECTIONS.zh-CN.md) · [能力目录](CONNECTION_CAPABILITIES.zh-CN.md)

以下能力已在源码实现，稳定版 0.4.4 安装包保持原样。没有新增运行时依赖包、本地服务器安装、定时任务或模型请求。

| 平台 | 独立路径 | 范围与待验 |
|---|---|---|
| Runway | 官方远程 MCP，刻度自己的浏览器 OAuth | 当前团队订阅/购买积分；新授权与真实余额待验 |
| Recraft | 官方远程 MCP，刻度自己的浏览器 OAuth | 明确处于活动状态的个人账户；拒绝团队/未知格式；新授权与真实余额待验 |
| MiniMax 国际站 | 本人提供 Subscription Key，官方额度 API | 只读明确的通用订阅剩余百分比；真实 Key 验证待验 |
| DeepSeek / Firecrawl / Tavily | 原有直接 API 读取 | 本来就不依赖 Codex/Relay/Python，本次沿用 |

## 连接和管理

在 **添加 / 管理平台** 关注 Runway 或 Recraft，继续连接并点击 **在官方页面连接**。系统浏览器打开平台官方页面，由本人确认账号与权限，再回刻度查看查询结果。平台可能授予包含生成的较宽权限，连接前有说明；刻度只发送固定账户/额度查询。可以在刻度取消，或在官方页面拒绝，本机三分钟后超时。单纯关闭引导不会取消浏览器中的待授权，可重开引导取消或等待超时；休眠和退出会取消。

**重新授权 / 切换账号** 会重新确认。在新账号读取与本地保存成功前保留原授权。账号/团队变化会将旧读数退役，并停止其绑定提醒；不同来源/账号的记录引用保持分开，不把 Codex 的日期悄悄迁入新授权。Recraft 当前只接受官方明确的个人账户摘要，不自动选择或替换团队。

**断开本机连接** 移除刻度授权并退役有效读数，不等于撤销平台端同意，后者在平台官方账户页管理。重开/重启不会自动切回原 Codex 账号；本人点击 **改用原 Codex 连接** 才恢复兼容路径，并需重新查询。不会覆盖原 Codex 配置或授权。

MiniMax 选择 **连接 Subscription Key**，填写自己的 **国际站 Subscription Key**，沿用原临时密码输入与本机系统加密存储。仅调用 `GET https://www.minimax.io/v1/token_plan/remains`，接受 `general` 明确返回的剩余百分比，包含真实零。百分比缺失、模型歧义、Key 类型错误、响应未知或失败都不当零；不会调用模型，不推断地区、按量余额或视频权益。**改用原 Relay 连接** 是明确的来源切换。直接查询设置后优先使用该来源，密钥移除/失败/重启不恢复另一 Relay 身份；独立本人记录保留。

也支持当前进程或对应已启用 MCP 环境中明确配置的 `MINIMAX_SUBSCRIPTION_KEY`。不导入 MiniMax Code 私有会话，也不从通用 Anthropic 客户端字段搬运密钥。Key 更新产生新来源绑定，不继承旧账号日期。Key 指纹不证明账号/团队，记录保留 `identityVerified: false`。

## 实现与存储

`native-mcp.cjs` 使用固定官方资源/issuer 来源、受保护资源元数据、动态公开客户端注册、PKCE S256、resource 参数和随机 state/回调路径，仅监听临时 `127.0.0.1` 端口。精确核对 Host、路径、state、重复字段与返回的 issuer；拒绝跳转到其他服务。元数据必须声明 S256 与公开客户端认证。本实现针对已核对的 Runway/Recraft 同源 issuer，不接受任意服务 URL。

Streamable HTTP 支持 JSON 与有大小限制的 SSE，核对响应和会话 ID，协商支持的 MCP 版本。工具仅为 Runway `whoami` 或 Recraft `get_user`，空参数连续读取两次核对身份；不执行远端要求调用的工具。请求和响应有时间/大小限制。刷新令牌系统加密后原子更新，授权失效需重新授权，权限不足明确报告；重复 401 不自动开浏览器或切账号。

授权仅在用户数据目录的 `credit-oauth.json` 保存为密文，已从 Git 排除。OAuth token、code、授权/回调 URL、verifier 与客户端注册材料不进入 renderer 状态、余额记录、MCP 快照或日志。本人输入的 API/Subscription Key 沿原密码表单短暂接收，成功后清空，不通过状态回传。Windows 使用 Electron 系统加密；macOS 使用可用的系统后端，拒绝不可用或明文后端。保存连接标记不是有效登录证明。

中心保存失败会同时回退授权与记录；取消/断开使用代次隔离迟到响应。休眠/停止会取消待授权，停止时不能静默接受新授权。复用原五分钟刷新，没有新监控。

## 保留依赖及原因

Suno 官方远程地址已核实，但本环境未验证其独立授权发现，保留已工作的 Codex 读取；Lovart 独立公开安装契约未核实；可灵保留中国站 MCP/CLI，不替换全球站身份。Kimi 与 Z.AI 本项没有已验证的独立官方额度/认证契约，不能搬用客户端私有令牌，继续原 Relay/Python。TapNow/Ideogram 当前会员 MCP 没有已实现的余额方法，保留浏览器组件；不声称全覆盖。

## 验证和剩余动作

**2026-11-03** 已实查 Runway/Recraft 的公开资源元数据、授权服务元数据和公开客户端注册，在打开授权页前停止。这是真实公开协议回执，不是登录或余额实测。独立合成测试覆盖拒绝/取消/超时、非法回调/错误服务、权限不足、刷新失效、加密、换账号、旧账号保存失败回退、休眠/迟到响应、重启及 MiniMax 来源隔离。Windows Electron 检查使用生产 renderer/preload、真实中心/独立客户端/回调/系统加密与合成上游，用户目录和 PATH 为空；合成余额不进入日常资料。

**2026-11-03 后续验收**：Runway/Recraft 的独立官方授权与真实额度读取已在 Windows 通过，包括从 0.4.4 实际升级到 0.4.5-preview.2 前后的主动刷新；设置、历史记录 ID、日期规则和浏览器配对均保留。随后使用用户明确授权复用的已有 Key，完成 MiniMax 国际站 Subscription Key 的官方订阅实查、本机加密保存、主动刷新、重启及再次直连刷新。原凭据配置、历史记录和日期定义保留；该读数绑定 Key，不代表已核验个人或团队身份（`identityVerified: false`）。未扩展自动凭据发现范围；原 Relay 保留为显式后备路径。另一台干净实体电脑与 Mac 实机仍未验。详见[预览版本证据](releases/0.4.5-preview.2.md)。

来源核对日期 **2026-11-03**：[Runway 会员 MCP](https://help.runwayml.com/hc/en-us/articles/51931843164691-Connecting-to-Runway-MCP)、[Recraft 远程 MCP](https://www.recraft.ai/docs/mcp-reference/remote-server)、[MiniMax 官方订阅额度接口](https://platform.minimax.io/subscribe/token-plan)、[Suno MCP FAQ](https://help.suno.com/en/articles/14486145)、[MCP 授权规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)。

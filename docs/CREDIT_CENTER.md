# Credit center / 额度中心

Gauge 0.3 keeps the existing Codex badge and adds a resizable desktop credit center. Open it from the tray's **Credit center · All AI tools** entry or the gauge panel's **All AI tool quotas** button. `Codex Gauge.exe --credit-center` opens it directly.

## Inventory and evidence

The scanner reads MCP/plugin section metadata from known Codex, Claude Code/Desktop, Cursor, Gemini CLI, Qwen Code, OpenCode and Windsurf configuration files. It checks known CLI names on PATH, provider-specific Skill installation evidence and Codex's plugin cache. It never launches arbitrary discovered MCP commands, reads chat archives, or treats every cached plugin as enabled. A source configuration may be obsolete; the inventory is not proof that a connection is authenticated. Aliases collapse into one provider row; balances remain separate by hashed source/account/workspace and pool.

Host-managed connectors can be listed in a local `credit-host-tools.json` array of `{ "name": "provider", "kind": "plugin" }` entries. This is host-supplied inventory, not a cloud connector discovery API. No whole-disk discovery is claimed. Tools installed in custom locations, other host profiles, browser-only services and remote devices may need a manual entry.

## Queries

| Provider | Read path | Limits |
|---|---|---|
| Codex | Existing local app-server | Original badge and reminder settings remain authoritative |
| Pippit / 小云雀 | Native `status`, `get-credit-balance`, `status` | Account/team checked around the read; this CLI response provides no expiry schedule |
| Dreamina / 即梦 | Native `user_credit` | Uses response account identity; no expiry schedule in this response |
| Lovart | Existing Codex OAuth through app-server, allowlisted `get_credits` | Ephemeral context only, no model turn or persistent chat; account identity and expiry are not returned |
| Kimi, MiniMax, ZCode | Installed Agent Relay quota implementation via a narrow Python bridge | Requires the separate companion and Python; before/after account or credential-source fingerprints prevent cross-account reuse |
| DeepSeek | Official `GET /user/balance` | Granted and purchased balances are separate; no inferred expiration |
| Firecrawl | Official `GET /v2/team/credit-usage` | Billing-period end is not asserted to be expiry or renewal |
| Other connectors | Timestamped host snapshots or manual readings | Explicitly not autonomous live queries |

API credentials are taken from `FIRECRAWL_API_KEY` or `DEEPSEEK_API_KEY`. On Windows, existing current-user DPAPI files at `~/.codex/private/credentials/<provider>-api-key.dpapi` can be used by the corresponding adapter. No key is entered into the renderer, copied into Gauge data, or logged. DPAPI decryption and the authenticated HTTP request stay in the PowerShell child; only a fingerprint and balance response return. No purchase, generation, account switch, card redemption or model request is performed.

The Agent Relay bridge is optional. It queries existing logins; it does not start Relay's task scheduler or dispatch work. ZCode uses a conservative whole-credential-source fingerprint: token rotation can create a new source and suppress a renewal notification rather than risk carrying another account's dates forward. An unverified source cannot inherit account-specific reminder rules. A package update can change the companion interface; failed reads stay failed, never zero.

Lovart reuses Codex's existing authenticated MCP connection through the locally installed app-server protocol. The app creates only an ephemeral context and invokes the fixed `get_credits` tool; it never starts a model turn. Other configured MCPs and plugins are disabled inside that context, with the user's actual configuration unchanged. Because this response does not identify the Lovart account, it cannot inherit account-specific date rules or assert renewal; use a separately named manual account reading for user-confirmed dates. Current official protocol reference: [Codex app-server](https://learn.chatgpt.com/docs/app-server).

## Dates, reminders and freshness

- Automatic queries run every five minutes while Gauge is running and **Query while Gauge runs** is enabled. Individual reads have bounded timeouts and do not overlap for the same source. Pausing or sleeping invalidates in-flight results; resume starts a fresh observation. Manual refresh remains available when background queries are disabled.
- Expiry, renewal and billing boundaries are separate. Unknown fields stay unknown. A failed query retains the prior timestamped reading and reports its state. Host snapshots and manually entered balances are always distinguished from automatic readings.
- Positive, fresh balances with a known expiry can remind at 7/3/1 days. A user-confirmed expiry on an older manual/host reading can still remind, explicitly asking the user to verify the current balance.
- Known percentage quotas with at least 30% left can remind before the next reset at two hours and one hour. Confirmed renewal requires the same bound identity, a crossed upstream cycle, an advanced next cycle and recovered quota. A larger balance by itself is not renewal proof.
- A manually recorded renewal date reaching its time produces a **check and verify** reminder; it never claims the credits arrived. Dates are one-off confirmations, not guessed recurring subscription rules.
- Original Codex card/reset reminder preferences stay in the original gauge. The center links back to them rather than offering an ineffective second switch. New multi-provider reminder preferences are separate.
- Delivery reuses Gauge's acknowledgement-based deduplication and bounded retries. A native send is not proof of a natural notification being seen by the user. Current known Windows notification activation opens the original gauge panel; its credit-center button opens the full center. Exact historical click-to-provider routing is not implemented.
- Queries stop when the application exits, the computer sleeps or powers off. Existing **Follow Codex** startup behavior is preserved; this is not an overnight or cloud monitor. Open Gauge to resume checks. Mac behavior requires separate device testing.

## Local files and read-only MCP

The app's current-user data directory stores `credit-center.json` (inventory, readings, dates, preferences and notice receipts), optional `credit-host-tools.json`, and optional `credit-imports.json`. None belongs in Git or public screenshots. The old `settings.json` stays separate. Malformed center storage is preserved and shown as a storage error; it cannot replace the original badge's settings.

`credit-imports.json` contains a `records` array. Each record declares `provider`, an opaque `scope`, `source: "host"`, `identityVerified`, `fetchedAt` in epoch milliseconds, and `pools`. A pool has a unique lowercase `id`, a bilingual label, a numeric `amount` or null, `unit` (`credits`, `percent`, `CNY`, `USD`, `requests` or `tokens`), and optional epoch-millisecond `expiresAt`, `resetsAt`, `periodStart`, `periodEnd`. Imports are validated and never refreshed just by rereading their file. Only submit results from actual authorized queries.

`node scripts/gauge-mcp.cjs --data-dir=<Gauge data directory>` serves `gauge_inventory`, `gauge_balances` and `gauge_events` over stdio. Windows distributions include the same sidecar under `resources/mcp/scripts/gauge-mcp.cjs`; Node.js is required. These are local snapshot reads with timestamps, not upstream refreshes, spending tools or a general filesystem interface. The data directory can differ under Windows app virtualization: select the directory used by the actual running Gauge instance. No global MCP configuration is changed automatically.

Sources checked 2026-10-30: [Pippit CLI](https://github.com/Pippit-dev/cli), [DeepSeek balance API](https://api-docs.deepseek.com/api/get-user-balance/), [Firecrawl credit usage](https://docs.firecrawl.dev/api-reference/endpoint/credit-usage).

## 中文说明

0.3 在保留 Codex 小仪表的基础上，新增可调整大小的额度中心。托盘“额度中心 · 全部 AI 工具”或小面板的入口可以打开。

目录梳理覆盖本机常见客户端的 MCP/插件配置、已知 CLI、相关 Skill 与插件缓存。配置、安装、已连通和可查额度分别表达；缓存不代表启用。自定义位置、其他用户配置、纯网页服务和远端设备不保证自动发现，可补充本人记录。

小云雀、即梦走原生 CLI；Kimi、MiniMax、ZCode 复用已安装 Agent Relay 的只读查询，并核对前后身份或凭据来源指纹；DeepSeek 和 Firecrawl 使用官方余额接口。Lovart 沿用 Codex 已登录的 MCP，通过临时、不留存的内部上下文仅调用固定余额工具，不创建模型回合、不提取凭据；其他 MCP/插件只在该临时上下文停用，实际配置不变。Lovart 接口未返回账号身份和到期日期，不继承账号级日期规则。其他宿主托管连接可导入带时间的快照，明确区别于自动刷新。工具不会自动生成、充值、切换账号、使用重置卡或消耗模型额度。

各账号、工作区和积分池独立记录。到期、恢复和账期结束分开显示，缺失日期保持未知。自动查询每五分钟执行，失败保留上次读数；关闭自动查询后仍能手动刷新。来源核实的到期提醒在7/3/1天触发，周期额度可在重置前2小时和1小时提醒。恢复通知须有同一来源身份、跨过周期、进入新周期与额度恢复的实际证据；余额增加本身不算恢复。本人记录的恢复时间到了，只提醒查询核实，不宣称已到账。

原 Codex 提醒继续由原仪表设置控制。新平台提醒有独立开关，复用既有通知确认、去重和有限重试机制。已有 Windows 历史通知点击入口打开原仪表，可再进入额度中心；暂未实现旧通知精确跳转到某个平台。程序退出、电脑休眠或关机期间停止查询，重新运行后补查；原“随 Codex 启动”行为保留，不新增云端或跨夜监控。

个人余额、工具清单与日期保存在本机用户数据目录，和旧 settings.json 分开；损坏文件保留并提示。API Key 从现有环境变量或本机当前用户 DPAPI 加密文件读取，密钥不进入界面、日志或刻度数据。只读 MCP 入口提供同一份本地快照，不自动更改全局 Codex 配置。源码与安装包不包含本人账号、积分和私人配置。

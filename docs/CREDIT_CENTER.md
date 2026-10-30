# Credit center / 额度中心

For installation and first use, start with the [English tutorial](GETTING_STARTED.md). This page describes adapters, private imports and integration details. 首次安装和使用请先看[中文教程](GETTING_STARTED.zh-CN.md)，本页为适配、私人导入及集成说明。

## 0.3.8: Daily expiry suppression / 每日赠送到期静音

Same-day daily gifts remain balances and date facts, but do not produce expiry notifications or priority/countdowns in compact overviews. Explicit `poolType` / `creditCadence` is normalized before persistence and propagated into events. `daily` denotes the daily same-day gift bucket; `monthly` normalizes to `subscription`. Explicit subscription/purchased/permanent metadata and stated multi-day validity prevent legacy daily-name misclassification. The current date alone is never sufficient for suppression.

Unclassified user dates bound to a verified pool inherit that pool's type. The editor preselects known cadence and explains disabled daily expiry reminders; Calendar and MCP keep factual events with `daily: true`, `notify: false`. Explicit renewal reminders remain independent. The packaged MCP sidecar includes the shared cadence helper, so standalone reads preserve the same semantics. Historical dates and reminder receipts are not removed.

中文：每日赠送、当天清零的类型不作到期提醒或临期排序，余额及日期不删。类型在清洗、绑定日期、界面和只读MCP中统一传播；月度、购买积分今天到期仍提醒。明确非每日类型、多日有效期优先，不靠“今天”判断。默认未分类的已核实绑定日期继承真实池类型，界面解释每日到期静音；恢复提醒独立保留。

## 0.3.7: Expiry priority / 临期优先

The creative preview uses a seven-day expiry threshold, independent of renewal proximity. Eligible positive/unknown expiry pools sort first by deadline; confirmed empty tools remain gray at the end. Stale or independent observations retain verification wording, not a current-availability claim. Primary amount highlighting requires both record ID and pool ID to match; a bonus expiry shows that pool and amount separately.

The shared timing model preserves precision: exact epoch timestamps use minute-level countdowns, while `dateOnly` uses local calendar-day differences and never the internal ordering anchor as a provider instant. Expiry and renewal are selected independently, so both can be displayed even when many earlier expiry entries exist. Recent overdue forecasts remain bounded verification prompts. Absolute dates/source/account remain available in tooltips. Manual overrides annotate each date kind separately; a user expiry cannot relabel the upstream renewal or discard the exact time in the full center. Countdown repainting uses the existing UI clock and does not introduce upstream polling.

中文：背面按7天内到期置顶并标红，恢复临近不当作到期，用尽置灰排后。到期和预计恢复分别选择、同时倒计时；准确时间按分钟，只有日期按日历天，不使用内部排序锚点编造时刻。过日预计仍需核实。主金额标红须同时匹配所示记录和积分池，部分赠金不代表全额到期；手填到期 / 恢复各自标注来源，原精确日期不丢失。倒计时不新增上游查询。

## 0.3.6: Creative flip face and Suno / 创作翻面与 Suno

The expanded badge panel flips between the original Codex view and **Creative credits**. The latter filters to known image/video/music providers and explicit media-only entitlements. Coding windows, search quotas, cash balances, reset cards and downloads are excluded. Each row preserves its own reading timestamp and uncertainty; neither separate accounts nor generation/download pools are summed. Dates must belong to retained media pools; independent dates on a mixed coding/video provider require an explicit video label. Sub-pool dates name that pool. The 52-pixel badge behavior is preserved. `panelFace` is a validated local preference, and the hidden face is inert for keyboard/accessibility navigation. Reduced motion disables rotation.

Suno automatically queries the existing enabled MCP server named `suno`, using only its actual `account-me` / `account-usage` tool names through the same isolated ephemeral app-server path as Lovart. It checks the public handle before/after usage, hashes it into source scope and suppresses old sources after changes. No stable unique account ID is supplied, so `identityVerified` remains false: account-specific confirmed date overrides and recovered-grant notifications cannot be inherited. Separately named user dates remain available. Missing song credits are a failed/unknown response, never zero. Download credits have `resource: downloads`; generation has `resource: music`. `renews_on` is retained only as `periodEnd` (billing), with no invented reset or expiry. There is no generation, library access, model turn or browser login.

中文：原小仪表展开后可翻到创作积分背面，只显示生图、生视频、生音乐及明确的媒体权益，编程和下载等其他额度不参与。日期沿用原归属和来源，分项到期明确标池；不同账号及下载 / 生成积分不相加。翻面选择保存在本机，键盘不会进入隐藏一面，减少动态效果时取消旋转。Suno复用已有名为`suno`的MCP连接，固定只读调用并核对前后公开标识；缺少稳定ID时不继承确认日期或到账证明。会员续期只作账期，缺失积分日期可从软件填写独立本人预计，无需登录。

## 0.3.5: In-app guidance and user dates / 软件内引导与日期填写

The skippable first-use guide distinguishes discovered inventory, supported query paths and successful current readings. It can be reopened from **Quick start**. Installations with an older settings/center file skip automatic onboarding; an explicitly incomplete new-user guide stays pending across restarts. A failed completion save never blocks the overview for the current session.

**Set dates** in the guide or tool Details creates a local user date entry without any import file. Choose a verified account/pool, or name a separate account if identity is unavailable. A one-time expiry stays distinct from a recurring monthly forecast. Monthly grant days require an explicitly selected subscription type. Purchased/daily/permanent pools do not acquire monthly forecasts. Known purchased/permanent balance pools reject such a binding. Dates never overwrite the upstream record, infer an account match or confirm a grant.

`credit-center.json` stores `userDates` separately from legacy `dateObservations` and `monthlySchedules`, plus `onboardingCompleted`. Entries contain an opaque ID, provider, account alias, pool label/type, optional bound record/pool IDs, an optional `expiryDate`, optional `monthlyDay`/calendar anchor, update time and reminder preference. Binding requires a currently verified matching account and pool; inactive or changed accounts suppress its events and reminders. Independent named entries remain explicitly independent. Event/receipt scopes include the binding, so changing accounts or pools cannot swallow a new reminder. Dates are local-calendar verification prompts, not an exact provider timestamp. Read-only MCP emits `source: user` or `user_schedule`, `dateOnly: true`, and `at: null`.

中文：首次引导分清“已发现、具备查询入口、已读到余额”，可跳过或重看，旧安装不自动弹出。引导和详情的“填写日期”无需配置文件；可选择已核实账号 / 积分池，或单独填写账号别名。到期日是一次本人记录，每月发放日是明确标注的订阅预计，不修改自动余额、不确认到账。按账户绑定的日期在换号后暂停事件与提醒，切换绑定分别去重；独立记录保持独立。记录支持编辑、删除和单独提醒，保存失败保留旧值。新字段只写当前用户本机数据目录，不进入源码或发布包。

## 0.3.1 additions / 新增接入与日期依据

Tavily uses `GET https://api.tavily.com/usage` and shows the remaining **account plan** quota, distinct from pay-as-you-go charges. Existing credentials may be read from the matching enabled provider's MCP environment in Codex, Cursor, Claude Code/Desktop, Gemini or Qwen configuration; disabled entries do not automatically become enabled. Credentials never enter inventory or renderer state.

The **Connect** dialog for Firecrawl, Tavily and DeepSeek verifies the official read-only endpoint before storing one current credential per provider with system encryption. Unavailable encryption and Linux basic-text storage are rejected. A later request using an old key cannot replace the newly verified account. If persistence fails, the previous encrypted credential and account view are restored, or an explicit partial-save error is shown if rollback itself fails. Matching a host snapshot is optional and explicit; unrelated workspaces remain visible. No account is created, key generated, permission enlarged or subscription changed by this dialog.

Monthly renewal policy can supplement API observations without pretending to be account-grant evidence. Firecrawl's positive plan allowance and a monthly-length billing period identify its expected plan reset; annual-length periods are not assigned an invented monthly date. Its aggregate remaining balance still has no inferred expiry, because purchases and rollovers can follow other rules. A cycle inferred from policy emits a verification reminder rather than confirmed renewal.

Tavily's official FAQ specifies the first day of the month without an exact time or timezone. `resetDate`/`dateOnly` preserve that precision. Calendar ordering uses an internal anchor, omitted as a timestamp from date-only MCP events. A local-calendar reminder asks for verification; it does not assert that the provider reset at local midnight. Official-rule panels include the reviewed source and review date; missing account-specific grant/billing dates remain unknown.

中文：Tavily 从官方用量接口读取套餐余量，可沿用已启用客户端的对应 MCP 凭据。新增平台连接入口先验证只读查询，再用系统加密保存；每个平台保持一个当前凭据，旧请求不能覆盖新连接，失败可回滚。替换快照须选择已确认同账号/工作区的那条，其他账号不被隐藏。

Firecrawl 的月度账期和官方规则用于展示套餐积分的“预计重置”，不把合计余额判为全部到期，也不把余额增加判为套餐到账。Tavily 每月1日按日期展示，具体时刻与时区未知时保持未知。各平台规则与来源可在卡片中展开查看。

Sources reviewed 2026-10-30: [Tavily usage](https://docs.tavily.com/documentation/api-reference/endpoint/usage), [Tavily reset FAQ](https://docs.tavily.com/faq/faq), [Firecrawl billing](https://docs.firecrawl.dev/billing), [Lovart credit expiry](https://www.lovart.ai/statement/lovart-subscribe-faq), [Pippit plans](https://xyq.jianying.com/pricing), [Dreamina plans](https://jimeng.jianying.com/), [Runway credits](https://help.runwayml.com/hc/en-us/articles/15124877443219-How-do-credits-work), [Exa billing](https://exa.ai/docs/admin/billing).

Gauge 0.3 keeps the existing Codex badge and adds a resizable desktop credit center. Open it from the tray's **Credit center · All AI tools** entry or the gauge panel's **All AI tool quotas** button. `Codex Gauge.exe --credit-center` opens it directly.

## Inventory and evidence

The scanner reads MCP/plugin section metadata from known Codex, Claude Code/Desktop, Cursor, Gemini CLI, Qwen Code, OpenCode and Windsurf configuration files. It checks known CLI names on PATH, provider-specific Skill installation evidence and Codex's plugin cache. It never launches arbitrary discovered MCP commands, reads chat archives, or treats every cached plugin as enabled. A source configuration may be obsolete; the inventory is not proof that a connection is authenticated. Aliases collapse into one provider row; balances remain separate by hashed source/account/workspace and pool.

Host-managed connectors can be listed in a local `credit-host-tools.json` array of `{ "name": "provider", "kind": "plugin" }` entries. This is host-supplied inventory, not a cloud connector discovery API. No whole-disk discovery is claimed. Tools installed in custom locations, other host profiles, browser-only services and remote devices may need a manual entry.

## Quota overview

The home view contains one row per queried tool, with four clickable status filters. **Available**, **Used up**, and **Unconfirmed** describe the reading; **Expiring / resetting** overlaps those states and identifies expiry within seven days or reset within two days. Expiries sort before resets. Unread, failed, stale, or elapsed-window readings cannot be treated as current zero balances or confirmed availability.

The displayed percentage is the tightest coding-model window, excluding separate tool/video entitlements and reset credits. DeepSeek's known disjoint grant and purchased cash pools can be combined within one currency/account; other pools and accounts are never arbitrarily summed. The shown account is identified when several exist, and each deadline keeps its account. Reset-credit expiry is explicitly named and does not describe the model percentage. Exact dates are available on hover and in Details; date-only schedules never acquire an invented time.

**Details** preserves every pool, read timestamp, source, official rule and existing connection/date controls. **All tools** retains the full inventory. Query, reminder, manual reading and rescan controls are under Settings, including in narrow windows. The original Codex badge opens separately.

## Queries

| Provider | Read path | Limits |
|---|---|---|
| Codex | Existing local app-server | Original badge and reminder settings remain authoritative |
| Pippit / 小云雀 | Native `status`, `get-credit-balance`, `status` | Account/team checked around the read; this CLI response provides no expiry schedule |
| Dreamina / 即梦 | Native `user_credit` | Uses response account identity; no expiry schedule in this response |
| Lovart | Existing Codex OAuth through app-server, allowlisted `get_credits` | Ephemeral context only, no model turn or persistent chat; account identity and expiry are not returned |
| Suno | Existing enabled `suno` MCP, `account-me` / `account-usage` / `account-me` | Song and download credits separated; public handle checked but stable identity unverified; subscription renewal is billing only |
| Kimi, MiniMax, ZCode | Installed Agent Relay quota implementation via a narrow Python bridge | Requires the separate companion and Python; before/after account or credential-source fingerprints prevent cross-account reuse |
| DeepSeek | Official `GET /user/balance` | Granted and purchased balances are separate; no inferred expiration |
| Firecrawl | Official `GET /v2/team/credit-usage` | Billing-period end is not asserted to be expiry or renewal |
| Tavily | Official `GET /usage` | Plan allowance is separate from pay-as-you-go; first-of-month renewal is policy-derived, with no invented time/timezone |
| Other connectors | Timestamped host snapshots or manual readings | Explicitly not autonomous live queries |

API credentials may be taken from existing matching MCP configuration, provider environment variables or the app's optional encrypted API connection. On Windows, Firecrawl and DeepSeek queries can also use existing current-user DPAPI files at `~/.codex/private/credentials/<provider>-api-key.dpapi`; Tavily does not support this fallback. Automatic queries do not send keys to renderer state, balance records or logs. The optional connection dialog temporarily accepts the user's API key in a masked field and passes it to the main process for verification/encryption; it clears the field afterward. For the DPAPI fallback, decryption and the authenticated request stay in the PowerShell child. No provider password, verification code or browser cookie is collected, and no purchase, generation, account switch, card redemption or model request is performed.

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

### Monthly grant forecasts without another login

Gauge does not introduce a provider browser-login flow or read browser cookies. Existing CLI/MCP authentication stays with those clients. A named website observation can provide an anchor for a user-configured monthly rule; the anchor remains a historical observation. In 0.3.4 this control is available only for eligible monthly/subscription website observations for Lovart, Pippit and Dreamina. New installations have none. Create one through the private-file import below; there is no general graphical website-record creation form. In Details, **Set monthly grant day** / **Edit** selects either a known grant date or an expiry date, the usual day of the month, and reminder preferences. Other existing pools can use **Set dates** for a one-time confirmed date.

Grant-date rules start in the next month; expiry-date rules can forecast the grant on that same date. Short months use the last available day while preserving the original day for later months. Forecasts advance by calendar, retain a recent overdue verification entry for at most seven days, and never inherit an expiry's clock text or claim that credits arrived. They use `source: "user_schedule"`, `estimated: true`, `dateOnly: true`; MCP returns `at: null` and no grant time.

Rules are stored locally as `monthlySchedules`, keyed by observation and pool ID. A disabled rule overrides imported anchor metadata and survives restart. Rules for another account are independent; permanent, purchased and daily pools cannot acquire this monthly rule. Balances continue to refresh through the existing sources. A larger total alone is still not proof of a monthly grant. Reminders distinguish approaching, due and bounded overdue dates, with stable deduplication receipts.

### Account-page date observations

Some balance sources return only a total. The center can import a one-time website check from a private `credit-date-observations.json` file in its actual user-data directory. Each `observations` entry identifies a provider, a display-only `account`, an independent opaque 20-hex `accountRef`, `observedAt` in epoch milliseconds, an allowlisted vendor `sourceUrl` without credentials/query/fragment, and `items`. Do not put this file in the repository or a package.

Items have a unique `id`, bilingual `label`/`labelEn`, optional nonnegative `amount` and `unit`, and `kind`: `expiry`, `reset`, `billing`, `never`, or `unknown`. Dated items use `onDate: "YYYY-MM-DD"`. Optional `timeText: "HH:mm"` preserves website clock text **without assuming a timezone or creating an exact instant**. `ruleDerived: true` marks dates inferred from an explicit official rule. Conditions such as signing in to claim a daily gift must remain in both labels. Recurrence requires an explicit monthly rule; a one-time observation alone does not create one.

The same account reference replaces its prior observation at an equal or later `observedAt`; correcting a transcription does not require falsifying the observation time. Different account references remain distinct even when display names match. Imports supplement the overview/calendar and a separate Details section. They never enter a live record's pools, change its availability, sum its balance, or confirm that the web and API accounts match. Refreshing an API does not update these website observations.

Website reminders are verification prompts for the named account. Expiry and renewal have different wording, and the due-date receipt is separate from advance notices. Zero-balance expiry does not create use-priority styling; zero-balance renewal can still prompt a due-date check. Billing/membership dates do not become credit expiry or renewal. `gauge_events` exposes observed dates with `source: "web"`, `dateOnly: true`, and `at: null`; clock text and unknown-timezone precision remain explicit.

The app's current-user data directory stores `credit-center.json` (inventory, readings, dates, preferences and notice receipts), optional `credit-host-tools.json`, and optional `credit-imports.json`. None belongs in Git or public screenshots. The old `settings.json` stays separate. Malformed center storage is preserved and shown as a storage error; it cannot replace the original badge's settings.

`credit-imports.json` contains a `records` array. Each record declares `provider`, an opaque `scope`, `source: "host"`, `identityVerified`, `fetchedAt` in epoch milliseconds, and `pools`. A pool has a unique lowercase `id`, a bilingual label, a numeric `amount` or null, `unit` (`credits`, `percent`, `CNY`, `USD`, `requests` or `tokens`), and optional epoch-millisecond `expiresAt`, `resetsAt`, `periodStart`, `periodEnd`. Imports are validated and never refreshed just by rereading their file. Only submit results from actual authorized queries.

`node scripts/gauge-mcp.cjs --data-dir=<Gauge data directory>` serves `gauge_inventory`, `gauge_balances` and `gauge_events` over stdio. Windows distributions include the same sidecar under `resources/mcp/scripts/gauge-mcp.cjs`; Node.js is required. These are local snapshot reads with timestamps, not upstream refreshes, spending tools or a general filesystem interface. The data directory can differ under Windows app virtualization: select the directory used by the actual running Gauge instance. No global MCP configuration is changed automatically.

Sources checked 2026-10-30: [Pippit CLI](https://github.com/Pippit-dev/cli), [DeepSeek balance API](https://api-docs.deepseek.com/api/get-user-balance/), [Firecrawl credit usage](https://docs.firecrawl.dev/api-reference/endpoint/credit-usage).

## 中文说明

0.3 在保留 Codex 小仪表的基础上，新增可调整大小的额度中心。托盘“额度中心 · 全部 AI 工具”或小面板的入口可以打开。

0.3.2 首页改为一行一个已查询工具，顶部筛选“有额度、已用尽、待确认”，以及与它们可重叠的“临期 / 快重置”（7天内到期、2天内重置）。到期优先，重置其次。每行突出余量与文字状态；具体时间可悬停或进入详情查看，只有日期时不补造时刻。重置卡到期明确标注，不等于模型额度到期。多个账号不相加，日期保留对应账号；DeepSeek 同币种、同账号内明确分开的赠送与充值余额可合计。失联、过旧或已过窗口的读数标待确认。

“详情”保留全部分项、来源、日期与连接入口，“全部工具”保留完整目录。查询、提醒、补充记录和重新梳理工具收进设置，窄窗仍可打开。原 Codex 小仪表独立保留。

目录梳理覆盖本机常见客户端的 MCP/插件配置、已知 CLI、相关 Skill 与插件缓存。配置、安装、已连通和可查额度分别表达；缓存不代表启用。自定义位置、其他用户配置、纯网页服务和远端设备不保证自动发现，可补充本人记录。

小云雀、即梦走原生 CLI；Kimi、MiniMax、ZCode 复用已安装 Agent Relay 的只读查询，并核对前后身份或凭据来源指纹；DeepSeek 和 Firecrawl 使用官方余额接口。Lovart 沿用 Codex 已登录的 MCP，通过临时、不留存的内部上下文仅调用固定余额工具，不创建模型回合、不提取凭据；其他 MCP/插件只在该临时上下文停用，实际配置不变。Lovart 接口未返回账号身份和到期日期，不继承账号级日期规则。其他宿主托管连接可导入带时间的快照，明确区别于自动刷新。工具不会自动生成、充值、切换账号、使用重置卡或消耗模型额度。

各账号、工作区和积分池独立记录。到期、恢复和账期结束分开显示，缺失日期保持未知。自动查询每五分钟执行，失败保留上次读数；关闭自动查询后仍能手动刷新。来源核实的到期提醒在7/3/1天触发，周期额度可在重置前2小时和1小时提醒。恢复通知须有同一来源身份、跨过周期、进入新周期与额度恢复的实际证据；余额增加本身不算恢复。本人记录的恢复时间到了，只提醒查询核实，不宣称已到账。

原 Codex 提醒继续由原仪表设置控制。新平台提醒有独立开关，复用既有通知确认、去重和有限重试机制。已有 Windows 历史通知点击入口打开原仪表，可再进入额度中心；暂未实现旧通知精确跳转到某个平台。程序退出、电脑休眠或关机期间停止查询，重新运行后补查；原“随 Codex 启动”行为保留，不新增云端或跨夜监控。

个人余额、工具清单与日期保存在本机用户数据目录，和旧 settings.json 分开；损坏文件保留并提示。凭据优先沿用已配置的对应连接；可选 API 连接仅接受本人主动填入的 Key，验证后系统加密保存，输入框随后清空。自动查询不把 Key 发送到界面状态、余额记录或日志，也不收集平台密码、验证码和浏览器 Cookie。只读 MCP 提供本地快照，不自动更改全局 Codex 配置。源码与安装包不包含本人账号、积分和私人配置。

0.3.4 不新增平台网页登录，原有客户端自行管理其登录。月度同日预计入口目前仅对 Lovart、小云雀、即梦合格的月度 / 订阅网页日期记录显示，新安装默认没有记录，需通过下述私人文件导入；当前没有通用图形化网页记录创建入口。其他已有积分池可以先用“补充日期”保存一次确认。月度预计从上次发放日推下月同日，或把失效日作为当期预计发放日；短月取月底，后月恢复原日号。规则按账户与积分池分别保留，支持关闭和独立提醒开关；预计不会继承失效钟表时刻，也不会把余额增加直接认成到账。预计项在 MCP 中为 source=user_schedule、estimated=true、at=null。

0.3.3 可通过用户数据目录的私人 `credit-date-observations.json` 导入一次网页核对。独立账户引用、名称、记录时间、分项和官方网页来源保留；到期、恢复、会员/账单、永久有效、日期未展示分别记录。只有日期就保持日期；页面有钟表时间但没说时区时保留原文，不编造精确时间。依规则推导及需登录领取的条件要注明，不从一次记录自动生成永久循环计划。

网页记录不并入自动查询账户的余额，也不确认两种来源是同一账号；自动刷新不会更新它。日历和主行明确标注网页账户与非实时，详情可打开原网页核实。网页提醒只要求核对对应账户的分项有效期或是否到账，不宣称已恢复；提醒开关沿用原额度中心。DeepSeek 充值余额按官方帮助标永久有效，赠金到期与固定恢复时间仍以实际提供为准。

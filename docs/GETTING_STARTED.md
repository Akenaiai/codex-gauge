# Getting started with Codex Gauge

[简体中文](GETTING_STARTED.zh-CN.md) · [Home](../README.md) · [Download](https://github.com/Akenaiai/codex-gauge/releases/latest)

For Windows 0.3.4. Gauge keeps the original Codex badge and adds an AI credit center. **No Gauge account or additional provider sign-in inside Gauge is required.** Queries use connections on your own computer. If a tool is not signed in, sign in through its original client or CLI, or skip it for now.

## 1. Install and open

1. On the release page, expand **Assets** and download `Codex.Gauge.Setup.0.3.4.exe`. For an installation-free launch, download `Codex.Gauge-0.3.4-win.zip`, extract the entire archive and run `Codex Gauge.exe`. Later releases may have different version numbers. GitHub's **Source code** ZIP requires a development environment.
2. Windows 10/11 x64 is required. The distribution includes its desktop runtime; Node.js is not needed. Optional Agent Relay queries require that separate tool and Python.
3. The app is currently unsigned. In PowerShell, run `Get-FileHash -Algorithm SHA256 -LiteralPath 'full path to the download'` and compare it with `SHA256SUMS.txt` from the same release. Matching hashes verify file consistency, not a code signature. Do not disable Windows protections.
4. Launch Gauge. Open **Credit center · All AI tools** from its notification-area icon, which may be under hidden icons. The Codex gauge panel also has a credit-center button.

The original badge needs the Codex desktop app and an installed, signed-in [official Codex CLI](https://github.com/openai/codex). The official tool manages sign-in; no extra Codex API key is required. Open Codex for profile anchoring, or use the tray if the badge is absent. Mac support is an untested source-only floating preview, without a verified Mac installer.

## 2. Make your first check

1. Open **All tools** and inspect discovery evidence: CLI, MCP configuration, plugin, or installation cache only. Discovery does not prove authentication or a supported balance endpoint.
2. For a supported tool, open **View / Details → Refresh** and check its account, source and read time. See the connection table below if something is missing. Tools without an adapter can use **Add reading**, which stays labeled as a manual record.
3. Return to **Overview** and use its four filters.

| Filter | Meaning |
| --- | --- |
| Available | A current valid reading shows available quota; keep provider units and accounts separate |
| Used up | A current valid reading confirms exhaustion; unknown data is never zero |
| Expiring / resetting | Expiry within seven days or reset within two days; can overlap the other states; reset-credit expiry is separately named |
| Unconfirmed | Unread, failed, stale or elapsed-window data needs a fresh check |

Open **Details → Dates & source** for all pools and timestamps, or **Calendar** for dates. Different accounts are not automatically combined. A website record is not automatically identified as the API account. New installations contain no developer account, balances or date rules. Without a supported local source, the list may be empty. Screenshots use synthetic data.

## 3. Which local connections are read

A CLI is a command-line tool, MCP exposes tools to an AI client, and a plugin extends a client. One provider may have several connection types; multiple entries do not imply multiple credit allowances.

Discovery uses the **system-user environment running Gauge**: known client configurations, known tool locations and current-process environment variables. It does not scan the whole disk or proactively search other system users, computers or all cloud accounts. Custom locations, browser-only services and host-managed OAuth connections may not be discoverable or reusable.

| Local source | Purpose |
| --- | --- |
| Common Codex, Claude Code / Desktop, Cursor, Gemini CLI, Qwen Code, OpenCode and Windsurf configurations | MCP / plugin names and enabled-state metadata; discovery does not prove authentication or query support |
| PATH and common user tool directories | Locate known CLIs; never run arbitrary discovered MCP startup commands |
| `~/.codex/skills`, `~/.agents/skills`, Codex plugin cache | Related installation evidence; a cached plugin is not necessarily enabled or connected |
| Matching API environment variables and matching enabled MCP configurations | Credentials for supported API adapters; OpenCode / Windsurf currently supply inventory metadata only, not API keys |
| Optional current-user encrypted credentials and private imports | Your own saved API connections, host snapshots or date records; these are not shipped in the distribution |

Supported automatic balance reads are listed below. Other discovered tools remain inventoried without a promise of automatic queries.

| Tool | Connection required | Date limits |
| --- | --- | --- |
| Codex | Signed-in official CLI; local read-only app-server | Only windows, reset times and card dates actually returned |
| Pippit / 小云雀, Dreamina / 即梦 | Their installed, signed-in native CLIs | Current balance responses omit credit expiry and grant dates |
| Lovart | Existing working Lovart MCP connection in Codex | Fixed balance tool only; current response omits account identity and dates |
| Kimi, MiniMax, ZCode | Separately installed Agent Relay, Python and the corresponding existing connections | Dates depend on returned data; Gauge does not install the companion or dispatch tasks |
| Firecrawl, Tavily, DeepSeek | Matching API credentials | Returned dates and policy-derived dates stay distinct; a balance may have no expiry |

Firecrawl, Tavily and DeepSeek can reuse `FIRECRAWL_API_KEY`, `TAVILY_API_KEY` and `DEEPSEEK_API_KEY` in the current process, or the matching enabled MCP entry in Codex / Cursor / Claude / Gemini / Qwen configuration. On Windows, Firecrawl and DeepSeek queries also support current-user `~/.codex/private/credentials/<provider>-api-key.dpapi` files. These are optional paths, not files you must create.

Without an existing API connection, you may choose **Details → Connect** and enter your own API key. Gauge verifies a read-only request and saves it with local system encryption. This is not a provider account login; it does not create a key, buy a plan or expand permissions. You can leave it unconfigured. Never post keys, cookies, configuration files or real account screenshots in public issues.

## 4. Understand observed and estimated dates

**Check the source and observation time for each date. A successful balance refresh does not refresh a website date record.**

| Source / label | What it establishes | How it updates |
| --- | --- | --- |
| Date in an automatic query | The account date returned by the last API/CLI read; future renewal still needs verification | Reread through supported queries; failed reads retain an explicitly old reading |
| Web account, Checked, Not live | A historical observation from an actual account-page check; it may have changed | User verifies in their own browser and updates a private import; Gauge does not sign in or scrape it |
| Official rule / Based on official rules | Validity or an expected renewal derived from a published rule, not grant confirmation | Details links the source and review date; rules are not a live policy service |
| User confirmed | A one-time date entered and checked by the user | Edit with Set dates; reaching it prompts verification |
| Monthly same-day forecast; grant unconfirmed | A user-configured expected monthly grant day | Advances with the calendar; editable and disableable; never confirms arrival |
| Dates not provided / Date not shown | The source lacks enough information | Stays unknown; membership or billing dates cannot substitute |

A date-only observation never gains an invented clock time. Unspecified timezones remain unspecified. **Credit expiry, quota reset, membership expiry and billing boundaries are different events.** Missing expiry does not mean permanent validity; that label requires explicit supporting information.

### Set a monthly grant forecast

In 0.3.4, the control appears only for eligible monthly / subscription **website date records** for Pippit, Dreamina and Lovart: **Details → Recorded dates & expected grants → Set monthly grant day / Edit**. New installations do not include these private records, so the button may be absent. Creating a record currently requires an [advanced private-file import](CREDIT_CENTER.md#account-page-date-observations); there is no general graphical website-record creation form. For ordinary use, **Set dates** on an existing pool can save a one-time confirmed date.

With an eligible record, choose the last grant or expiry date and confirm the usual day of the month. A grant on the 12th forecasts the 12th next month. An expiry date can anchor that same day's next expected grant. The 31st uses the last day in short months and returns to the 31st later. These examples are not preloaded account records.

Use this only for a subscription that actually grants monthly credits. Permanent funds, purchases and daily claims do not receive monthly rules. Forecasts never inherit an expiry's clock time or treat a larger total as a confirmed grant. The original date record remains historical.

## 5. Queries and reminders

In **Query & reminder settings**, enable **Query while running** and **Expiry & renewal reminders**. Automatic center queries run every five minutes; manual refresh is also available. The original Codex badge normally polls every minute and retains its own reminder settings.

Supported known expiries can remind at seven, three and one day. Eligible quota windows can remind two hours and one hour before reset. Monthly forecasts prompt verification before, on and for a bounded period after the date; **a date reaching its deadline never means credits arrived**. Reminders are deduplicated by source, account and stage. Delivery also depends on Windows notification settings.

Queries pause when Gauge exits or the computer sleeps or powers off. Launching again checks current data, without guaranteeing a replay of every missed notice. The installed Windows app can enable **Start with Codex** in the original badge settings; it defaults off for new users and can be disabled to remove its current-user task. There is no cloud or overnight monitoring service.

## 6. Troubleshooting

| Situation | Action |
| --- | --- |
| Sign-in required | Sign in through the original official client / CLI, then refresh in Gauge; no password or verification code is needed inside Gauge |
| Only installation cache appears | Check whether the host enables that connection and whether Gauge has an adapter |
| A new connection is missing | Use Rescan tools in Query & reminder settings; restart Gauge after environment-variable changes |
| Lovart has a balance but no dates | Its current MCP response lacks dates and account identity; independently verify website records |
| API refreshed but website date stayed unchanged | Expected: the website record retains its last observation |
| Renewal date passed but balance did not change | Check forecast / rule labels, refresh the source and verify claim conditions or provider delays |
| Failed or stale query | The last reading remains unconfirmed; check the network and original connection, then retry; failure never becomes zero |

## Local data and open-source scope

Settings, inventory, balances, private dates and reminder receipts stay in Gauge's per-user data directory, normally `%APPDATA%/Codex Gauge` on Windows. App virtualization can change the actual location. Optional keys use system-encrypted `credit-secrets.json`; ordinary balance records contain no keys. Do not share the entire directory or bundle it with the portable ZIP.

Gauge does not read browser cookies or chat archives, offer provider browser sign-in, generate work, spend credits, top up, redeem cards or request model responses. Supported CLI / MCP queries use the clients' existing authentication; API queries authenticate directly to the provider. The original badge can also contact the anonymous AIHOT announcement feed; manual update checks contact GitHub. There is no Gauge account server or telemetry. See [Data and limitations](../README.md#data-and-limitations), [Security](../SECURITY.md) and the [distribution privacy verification](PRIVACY_VERIFICATION.md). MIT covers the project code; third-party tools, services and data retain their own terms.

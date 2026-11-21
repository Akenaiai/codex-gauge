# Getting started with Codex Gauge

[简体中文](GETTING_STARTED.zh-CN.md) · [Home](../README.md) · [Download](https://github.com/Akenaiai/codex-gauge/releases/latest)

For Windows 0.4.6. TapNow uses existing home tabs on demand; Ideogram remains without live provider validation. Gauge keeps the original Codex badge and adds an AI credit center. **No Gauge account or additional provider sign-in inside Gauge is required.** Queries use connections on your own computer. Runway/Recraft can open official-browser authorization from Gauge, and MiniMax international accepts a Subscription Key. Other tools use the original client or CLI indicated by their connection guide; you may also skip them.

## First connections

Windows 0.4.6 includes a resumable platform chooser, per-platform setup instructions, optional membership notes and hide/restore controls. Current measured quotas appear automatically; explicit hiding is retained. See [First connections](NEW_USER_CONNECTIONS.md). The stable 0.4.6 download includes this flow.

## 1. Install and open

1. On the release page, expand **Assets** and download `Codex.Gauge.Setup.0.4.6.exe`. For an installation-free launch, download `Codex.Gauge-0.4.6-win.zip`, extract the entire archive and run `Codex Gauge.exe`. Later releases may have different version numbers. GitHub's **Source code** ZIP requires a development environment.
2. Windows 10/11 x64 is required. The distribution includes its desktop runtime; Node.js is not needed. Optional Agent Relay queries require that separate tool and Python.
3. The app is currently unsigned. In PowerShell, run `Get-FileHash -Algorithm SHA256 -LiteralPath 'full path to the download'` and compare it with `SHA256SUMS.txt` from the same release. Matching hashes verify file consistency, not a code signature. Do not disable Windows protections.
4. Launch Gauge. Open **Credit center · All AI tools** from its notification-area icon, which may be under hidden icons. The Codex gauge panel also has a credit-center button.

The original badge needs the Codex desktop app and an installed, signed-in [official Codex CLI](https://github.com/openai/codex). The official tool manages sign-in; no extra Codex API key is required. Open Codex for profile anchoring, or use the tray if the badge is absent. Mac support is an untested source-only floating preview, without a verified Mac installer.

## 2. Make your first check

1. On the first launch, the guide shows discovered tools, query paths and balances already read. You can skip it or reopen **Quick start** in the header. Upgrades do not automatically show it. Open **All tools** and inspect discovery evidence: CLI, MCP configuration, plugin, or installation cache only. Discovery does not prove authentication or a supported balance endpoint.
2. For a supported tool, open **View / Details → Refresh** and check its account, source and read time. See the connection table below if something is missing. Tools without an adapter can use **Add reading**, which stays labeled as a manual record.
3. Return to **Overview** and use its four filters.

| Filter | Meaning |
| --- | --- |
| Available | A current valid reading shows available quota; keep provider units and accounts separate |
| Used up | A current valid reading confirms exhaustion; unknown data is never zero |
| Expiring / resetting | Expiry within seven days or reset within two days; can overlap the other states; reset-credit expiry is separately named |
| Unconfirmed | Unread, failed, stale or elapsed-window data needs a fresh check |

Open **Details → Dates & source** for all pools and timestamps, or **Calendar** for dates. Different accounts are not automatically combined. A website record is not automatically identified as the API account. New installations contain no developer account, balances or date rules. Without a supported local source, the list may be empty. Screenshots use synthetic data.

### Switch between quota panels

In the tabbed panel, hover over the badge to open **Codex**, then use the **Coding tools** and **Creative credits** tabs to switch. On Windows, click outside the panel to dismiss it, including after pinning it with a badge click. Reopening starts on Codex. Creative refresh queries media sources only. Use the credit center for full details and date editing.

For Cursor on Windows, open **Settings → Plan & Usage** in the running Cursor desktop app. Keep that view open while selecting **Coding tools** or refreshing the Cursor card. The preview recognizes the **Cursor Models** and **Other Models** usage bars and the reset date when shown. It reads those fields locally through Windows accessibility, using the session already open in Cursor. If the view is unavailable, the last reading is marked as such for the current Gauge session. Other coding tools appear when the credit center has a supported plan percentage for them.

**Hide Cursor** in Gauge settings hides its card in Coding tools and pauses Cursor reads. Turn it off to show the card again.

In Windows 0.4.8, open **View my usage** at the bottom left of Qoder and leave the usage panel open. In Gauge, select **Coding tools**. The Qoder card reads the displayed credit buckets through Windows accessibility and shows each supported bucket's remaining and total credits. Renewal and expiry dates are shown when present. Refresh in Qoder to request fresh figures from Qoder. Gauge can reread the displayed figures with **Refresh coding quotas**.

Windows 0.4.8 also reads the Devin CLI bundled with Devin Desktop. Sign in to the CLI once with `devin auth login`, then open **Coding tools**. Gauge runs the CLI's read-only `/usage` command in an isolated session to show daily or weekly quota, reset times and any reported extra usage balance. Resets shown by the CLI as a countdown are labeled approximate. The account values stay in memory and Gauge uses the CLI's own sign-in. The panel refreshes about once a minute while open.

In **Coding tools**, Kilo shows the current Kilo Gateway credit balance in USD. For personal accounts it also detects active Kilo Pass and marketplace subscriptions. Kilo Pass shows the remaining allowance for the current cycle (including the reported bonus allowance) and the next billing time when supplied. Marketplace plans show each supported usage window's remaining percentage and reset time when supplied. With a team selected, Gauge reads the team wallet. Gauge uses the existing local Kilo login, so the Kilo window can stay closed. The tab refreshes about once a minute while open, and **Refresh coding quotas** queries immediately. Gauge keeps readings in memory and does not copy the login.

The Coding tools panel keeps the colored alert key above the scrolling list. Above 10% through 20% is amber, above 0% through 10% is red, and a confirmed 0% has a solid red label. Blue reset labels appear within two hours when a time is known, or on the displayed day for a date-only reset. Low and reset labels can appear together. Old readings are gray and do not count as current alerts. **Refresh coding quotas** retries Cursor, Qoder, and supported connected coding tools.

Expiries within seven days move first in red; within 24 hours, or due today with date-only precision, the border is stronger. Used-up tools are gray at the end. Expiry and expected-renewal countdowns appear together. A date-only record uses days/today, with no invented clock time; hover for the full date and source. Reached forecasts require verification. A bonus expiry names its own amount; it does not mean the total balance expires. Stale/unmatched dates stay unconfirmed.

Daily gifts that clear the same day stay in your balance and factual date records, but receive no expiry notification, red priority or compact expiry countdown. This does not silence all dates that happen to fall today: subscription/purchased-credit expiries still remind. In Set dates, choose **Daily gifts (expire the same day)** only for that daily bucket; the form explains muted expiry alerts.

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
| Suno | Existing enabled `suno` MCP connection in Codex | Generation and download credits are separate; subscription renewal is billing only; no stable account ID |
| Kimi, MiniMax | Separately installed Agent Relay, Python and the corresponding existing connections | Dates depend on returned data; Gauge does not install the companion or dispatch tasks |
| ZCode / BigModel China | Personal Coding Plan API key entered in Gauge and encrypted after verification | Reported quota windows and reset times |
| Firecrawl, Tavily, DeepSeek | Matching API credentials | Returned dates and policy-derived dates stay distinct; a balance may have no expiry |

Runway, Kling and Recraft use their official member MCPs in Codex. If already configured and authorized, Gauge reuses them. Otherwise configure the original Codex client and complete the provider's normal browser authorization once:

```sh
codex mcp add runway --url https://mcp.runwayml.com/mcp
codex mcp add kling --url https://klingai.com/mcp
codex mcp add recraft --url https://mcp.recraft.ai/mcp
```

Use your existing member account and choose the intended workspace. If an entry already exists, use `codex mcp login <name>` to renew it rather than replacing it. Gauge adds no login screen and copies no session; it calls only account/balance tools. The official consent page lists the provider's OAuth scopes. Developer/API-credit servers have a separate balance and are not substituted for member credits. Recraft currently supports the explicitly active personal-account summary; unknown/team formats remain unconfirmed. Kling can still reuse its original CLI when no MCP is configured, but a failed MCP is never replaced with a different CLI account. [Connection details](releases/0.3.13.md).

Membership-sheet grant days can be entered as independent monthly forecasts even before a balance is connected. Keep conflicting dates for review and preserve existing rules. A monthly allowance is not a remaining balance, and a formula-based membership end date is not a verified credit expiry.

Firecrawl, Tavily and DeepSeek can reuse `FIRECRAWL_API_KEY`, `TAVILY_API_KEY` and `DEEPSEEK_API_KEY` in the current process, or the matching enabled MCP entry in Codex / Cursor / Claude / Gemini / Qwen configuration. On Windows, Firecrawl and DeepSeek queries also support current-user `~/.codex/private/credentials/<provider>-api-key.dpapi` files. These are optional paths, not files you must create.

Without an existing API connection, you may choose **Details → Connect** and enter your own API key. Gauge verifies a read-only request and saves it with local system encryption. This is not a provider account login; it does not create a key, buy a plan or expand permissions. You can leave it unconfigured. Never post keys, cookies, configuration files or real account screenshots in public issues.

### Optional TapNow / Ideogram browser connection

The November 16 source update adds TapNow’s official free MCP balance query through an existing Codex connection, with the optional page reader below as fallback; 0.4.7 installer users retain the page-only flow. Ideogram still uses its page reader. Version 0.4.4 includes an optional browser component: **All tools → View → Connect page balance**. Load it in Chrome/Edge and pair locally. TapNow uses normally opened home tabs without reloading or keeping them awake; close them after use. It reads the fixed balance and current-team fields; Ideogram needs a visible full balance and persistent account/team marker selected. Ideogram retains its dedicated-tab flow. Historical readings remain in the center after closing. The component is off by default, adds no sign-in inside Gauge and does not copy cookies or sessions. Page readings do not verify account identity or refresh dates. See the [complete setup and privacy details](BROWSER_CONNECTION.md).

## 4. Understand observed and estimated dates

**Check the source and observation time for each date. A successful balance refresh does not refresh a website date record.**

| Source / label | What it establishes | How it updates |
| --- | --- | --- |
| Date in an automatic query | The account date returned by the last API/CLI read; future renewal still needs verification | Reread through supported queries; failed reads retain an explicitly old reading |
| Web account, Checked, Not live | A historical observation from an actual account-page check; it may have changed | User verifies in their own browser and updates a private import; the optional balance reader does not refresh historical dates |
| Official rule / Based on official rules | Validity or an expected renewal derived from a published rule, not grant confirmation | Details links the source and review date; rules are not a live policy service |
| User confirmed | A one-time date entered and checked by the user | Edit with Set dates; reaching it prompts verification |
| Monthly same-day forecast; grant unconfirmed | A user-configured expected monthly grant day | Advances with the calendar; editable and disableable; never confirms arrival |
| Dates not provided / Date not shown | The source lacks enough information | Stays unknown; membership or billing dates cannot substitute |

A date-only observation never gains an invented clock time. Unspecified timezones remain unspecified. **Credit expiry, quota reset, membership expiry and billing boundaries are different events.** Missing expiry does not mean permanent validity; that label requires explicit supporting information.

### Set a monthly grant forecast

In the guide, click **Set dates** next to a tool. Later, use **Details → Your dates & monthly forecasts → Set dates**. This works for discovered non-Codex tools, including tools without an automatic balance query. No configuration file or website-record import is required. Codex keeps its original badge date settings.

1. Select a verified account and pool if available. Otherwise choose a separate record and enter an account/workspace alias and pool name. An unverified MCP account is never automatically matched.
2. Enter the credit expiry date, a monthly grant day, or both. Only choose **Monthly subscription credits** if that pool actually grants monthly. Purchases and daily claims do not get monthly forecasts.
3. Save. The overview, Details and Calendar show the dates as user-entered or expected. For example, day 12 forecasts the 12th each month. Day 31 uses the last day in short months, then returns to 31. A forecast never confirms arrival or changes the balance.
4. Reopen **Edit** to change dates or the reminder switch. **Delete this date record** removes the saved dates and their forecast. Original automatic balances and historical website observations remain separate.

Bound dates stop following a source after its verified account changes. Separately named entries stay independent and ask you to verify that named account. A one-time expiry does not silently become a recurring expiry. Saved website observations from older versions still work through their legacy controls; [private-file imports](CREDIT_CENTER.md#account-page-date-observations) are optional advanced integration.

## 5. Queries and reminders

In **Query & reminder settings**, enable **Query while running** and **Expiry & renewal reminders**. Automatic center queries run every five minutes; manual refresh is also available. The original Codex badge normally polls every minute and retains its own reminder settings.

Supported known expiries can remind at seven, three and one day. Codex weekly reminders start 24 hours before reset at 30% or more remaining. All Codex windows also have 4h, 2h and 1h stages. Monthly forecasts prompt verification before, on and for a bounded period after the date; **a date reaching its deadline never means credits arrived**. Reminders are deduplicated by source, account and stage. Delivery also depends on Windows notification settings.

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

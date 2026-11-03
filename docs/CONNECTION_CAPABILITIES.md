# Connection capabilities (source preview)

[简体中文](CONNECTION_CAPABILITIES.zh-CN.md) · [Credit center](CREDIT_CENTER.md)

This source change adds connection evidence for the existing adapters. It does not replace the stable 0.4.4 installer or add a new setup wizard, native remote OAuth client, installation action or product rename.

## Contract for the next setup flow

`CreditCenter.state()` now includes:

- `tools`: only discovered tools and existing user records. A blank user has an empty list; the supported-provider list never populates the home view.
- `connectionCatalog`: descriptive platform profiles, including unsupported providers. Each has `provider`, `route`, `quotaKind`, `os`, `components`, `auth`, `entry`, `sources`, `checkedOn`, and bilingual `limits`. `entry: null` means no verified installation entry is provided. Some profiles use `evidence: adapter_contract` for locally implemented behavior rather than verified public installation documentation.
- `connectionComponents`: component IDs, bilingual names, official installation references where verified, and whether Gauge bundles the component. A remote MCP service runs at the provider; the **current adapter** still requires a local Codex CLI client. Installing a local provider MCP server is not required for those hosted services.
- `tools[].access` (`schemaVersion: 1`): independent discovery, component, authorization, query and reading evidence. Existing `adapter` and `queryReady` fields remain compatible: they mean an implemented adapter and permission to **attempt** its existing read path, respectively. They do not prove authentication or a remaining balance.

`access.components` records file-presence checks and missing component IDs. It does not execute installers, test arbitrary binaries, import Relay modules, open account pages or decrypt credentials. A present executable can still fail at runtime. Rescan and refresh recheck components/configuration; `access.components.checkedAt` preserves the observation time. API credentials are reported only as references. DPAPI fallback requires Windows and PowerShell; a shell wrapper is insufficient for readers that require a native executable.

`access.authorization.status` is `unconfirmed`, `required`, `verified` or `identity_unverified`, with a reading timestamp when available. Configuration, a Skill, a cache, a host connector name and an encrypted credential file never establish a working login. A fresh read without stable identity (including browser readings, Lovart and Suno) remains `identity_unverified`. User membership/date input is never entitlement evidence (`membershipInputVerifiesQuota: false`); no membership-derived balance is generated.

`access.query` contains `supported`, selected `route`, `canAttempt`, `status` and a fixed error code. Statuses include `unsupported`, `component_missing`, `connection_required`, `configuration_invalid`, `query_available`, `connecting`, `querying`, `ready`, `stale`, `offline`, `login_required`, `account_changed`, `query_failed`. `configuration_invalid` blocks an unsafe fallback: Kling uses its CLI only when the supported member MCP is absent/disabled; an incorrect endpoint or ambiguous enabled MCP entries continue to fail through the existing adapter. Cached plugins and Skills alone do not trigger queries. Relay needs complete companion files, Python and the bundled bridge, plus an enabled Codex Relay plugin, installed coding CLI or a prior Relay reading. The enabled plugin can discover accounts through its existing read-only batch query; user-selected coding rows refresh through that same batch.

`access.reading.status` is `none`, `recorded`, `unknown`, `zero`, `available`, `stale` or `account_changed`. Manual/host records stay `recorded`. Missing values stay unknown. Fresh known zero is zero. Failures retain the prior amount and timestamp as stale; expired authorization or identity changes retire the old account from active views and reminders. Existing stored record IDs, dates, policies, preferences and original badge behavior remain authoritative. Codex logout retirement is now persisted before restart.

`gauge_inventory` exposes additive `access` snapshots from the saved center state, with `accessObservedAt` and `accessIsSnapshot: true`. It never rescans, checks credentials or refreshes upstream. An older stored file returns `access: null`; clients must treat all snapshots as historical evidence rather than live authorization. Gauge recalculates live access instead of trusting these persisted fields on startup.

## Adapter scope and sources

Official references reviewed on **2026-11-03**. URLs describe provider capabilities; an installed client, user consent and successful read are separate evidence.

| Providers | Current dependency and quota scope | Reference / remaining limit |
|---|---|---|
| Codex | Local Codex CLI app-server; coding subscription windows | [App-server](https://developers.openai.com/codex/app-server/); OpenAI API balance remains a separate unsupported adapter |
| Pippit | Native CLI; current personal/team effective credits | [Official CLI](https://github.com/Pippit-dev/cli) |
| Dreamina | Native CLI account credits | [Official install overview](https://dreamina.capcut.com/tools/dreamina-cli); regional availability belongs to the original client |
| Suno | Existing Codex MCP; song/download pools | [Official MCP FAQ](https://help.suno.com/en/articles/14486145); billing renewal is not a credit grant |
| Runway | Codex + hosted member MCP; current team | [Official member MCP](https://help.runwayml.com/hc/en-us/articles/51931843164691-Connecting-to-Runway-MCP); Developer API credits are separate |
| Recraft | Codex + hosted member MCP; active personal account | [Official MCP](https://www.recraft.ai/docs/mcp-reference/remote-server); local API-unit MCPs and unknown/team formats are not substituted |
| Kling | Existing China MCP via Codex, otherwise existing China CLI | [Official global guide](https://kling.ai/app/mcp/guide) verifies personal paid-credit scope, **not** the China installation entry; China entry left null, implemented endpoint unchanged |
| Lovart | Existing named Codex MCP; aggregate credits, unverified identity | [Official credit policy](https://www.lovart.ai/statement/lovart-subscribe-faq); public installation instructions remain unverified |
| Kimi / MiniMax / Z.AI | Separate Relay companion + Python + bundled bridge; coding subscription | Existing local adapter contract; no public Relay installer is asserted. MiniMax video entitlement and manual membership records are separate |
| DeepSeek / Firecrawl / Tavily | API key, no Codex dependency | [DeepSeek balance](https://api-docs.deepseek.com/api/get-user-balance/), [Firecrawl credits](https://docs.firecrawl.dev/api-reference/endpoint/credit-usage), [Tavily usage](https://docs.tavily.com/documentation/api-reference/endpoint/usage); API balances are not chat memberships |
| TapNow / Ideogram | User-installed paired Gauge browser extension and authorized visible page | Existing [browser connection](BROWSER_CONNECTION.md); MCP visibility does not establish an implemented balance method. TapNow uses existing home tabs; Ideogram live validation remains pending |

Python and PowerShell references: [Python downloads](https://www.python.org/downloads/), [Microsoft installation guidance](https://learn.microsoft.com/powershell/scripting/install/installing-powershell). No third-party component or account authorization is performed by this change.

## Verification boundary

`tests/connection-capabilities.test.cjs` covers blank users, cache/Skill-only discovery, missing components, wrapper/native distinction, real configuration vs host inventory, incorrect/ambiguous Kling MCP with a present CLI, encrypted references, browser setup/offline states, unknown/zero/stale readings, expired authorization, account switching and snapshot compatibility. Network and authentication fixtures are synthetic. Windows runtime/UI checks and read-only observations are recorded separately in the local task receipt. `os` describes implemented branches, not Mac hardware acceptance. This step does not claim new provider logins, installation on a clean physical computer or end-to-end verification of the future setup flow.

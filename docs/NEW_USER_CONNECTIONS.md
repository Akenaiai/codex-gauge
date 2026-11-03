# First connections (source preview)

[简体中文](NEW_USER_CONNECTIONS.zh-CN.md) · [Capabilities and sources](CONNECTION_CAPABILITIES.md) · [Stable installer guide](GETTING_STARTED.md)

This flow is available in the current source. The stable 0.4.4 installer has not been replaced by this intermediate change.

1. A new installation opens the credit center and platform chooser. Existing installations keep their previous view without a forced welcome screen. **Add / manage platforms** opens the same manager later.
2. Current measured quotas enter the overview automatically, including verified zero balances. Cache, Skills, configuration alone, failed queries and unknown amounts cannot auto-add a platform. You can also follow a platform before connecting it; its row stays unconfirmed.
3. Choose **Continue to connections**. Select a platform to see its current status, missing components, verified source instructions and a read-only query button. Detected components need no reinstallation. Install components yourself, complete provider authorization in the original client or official page, and choose **Ready; rescan**. The app does not run installers or approve OAuth.
4. Membership notes are optional: **Skip / unsure**, **Free account**, **Paid subscription** or **API account**. Choices save locally as user input, never as verified entitlements. **Open overview** works with every field skipped. Credit dates remain in platform details and retain their existing account bindings and reminders.

**Continue later** or Escape closes the guide and retains unfinished progress. Reopening before completion, or restarting the app, resumes the saved step and selected platform. After completion the manager opens on the chooser. There is no requirement to connect or purchase anything before entering the overview.

## Manage and restore

Use the chooser checkboxes or **Details → Hide from overview**. Hiding retains accounts, credentials, dates, reminders and existing refresh settings. Explicit hiding survives successful new reads, rescans and restarts. Restore the checkbox in **Add / manage platforms**. The manager separates its supported catalog, locally discovered tools and followed platforms; it does not put the entire catalog on the personal home view. Old discovered tools remain available without turning old cache-only inventory into new overview rows.

## Current dependencies

- Codex quota uses the original badge and local Codex CLI account. ChatGPT coding subscription and OpenAI API billing are separate.
- Suno, Runway, Recraft and existing Lovart paths still require local Codex CLI. Their hosted MCP services run at the provider. The guide shows manual Codex setup commands for the verified Suno, Runway and Recraft endpoints. Existing connection names/configuration should be preserved. Login happens through the original client.
- Kling retains its existing China MCP or CLI path. A verified public China installer is unavailable; the guide does not invent one or substitute the global endpoint.
- Kimi, MiniMax and Z.AI coding readers still require the separate Agent Relay companion, Python and Gauge's bundled bridge. A public Relay installer is unverified. Coding quota does not establish video, general API or membership entitlement.
- DeepSeek, Firecrawl and Tavily use existing API keys through the original encrypted connection form. Free API accounts can work with supported readers; chat membership is separate. No Codex/Relay/Python requirement for these normal API paths.
- TapNow and Ideogram use the existing optional browser-component instructions. Users install, pair and grant site access themselves. Page readings keep unverified account identity; Ideogram live reading remains unvalidated.

The capability catalog lists the exact sources and limits checked on **2026-11-03**. Codex manual commands were also checked against its [official CLI reference](https://developers.openai.com/codex/cli/reference/). Missing components, sign-in needed, unknown amounts, verified zero, offline and old failed readings remain distinct. A self-entered membership never creates a balance or confirms a grant.

## Local data and validation

`credit-center.json` retains its existing version and fields. Additive `connectionPreferences` stores flow position and per-platform choices. `tools[].followed` controls visibility; `userFollowed` separately identifies explicit choices, so legacy visibility does not create empty overview rows. Automatic successful readings remember visibility with `userChoice: false`; explicit checkbox changes use `true`. No credentials are stored in these preferences. Hiding is a view preference and leaves reminders and background queries unchanged.

Tests cover blank profiles, interruption/restart, automatic successful/zero reads, explicit hide/restore, old cache-only inventories, unchanged record references and badge settings, invalid input and failed-save rollback. Windows Electron checks use the production renderer/preload with an isolated real center and synthetic upstream responses; they exercise actions rather than relying on screenshots. Live provider login, an end-to-end new physical-machine install and Mac validation remain separate work. This change does not provide native independent remote OAuth connections or a stable installer release.

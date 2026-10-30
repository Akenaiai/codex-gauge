# Multi-provider credit center / 多平台额度中心

User authorization, 2026-10-30: upgrade the existing Gauge, retain its Codex badge, inventory local AI tools before connecting balances, expiration and renewal reminders. Work in the original repository; do not create a second product.

## Delivery

- Preserve the existing badge, account isolation, reset cards, preferences and notification delivery.
- Add a resizable desktop center with inventory, balances, upcoming events, search and filters, and per-account rules.
- Discover configured MCP servers, plugins, known CLI installations and Skill evidence. Installation/configuration is not proof of authentication or balance support. Deduplicate aliases and show evidence/coverage.
- Adapters query read-only endpoints; native CLI commands run without a shell. No generation, recharge, account switching or automatic spending.
- Track independent accounts/workspaces and credit pools. Expiry, next renewal and billing-period end are different fields. Unknown stays unknown; failed queries preserve timestamped previous values.
- Allow user-confirmed schedules where upstream omits dates; verify renewal against subsequent data. Imported host-plugin snapshots are explicitly timestamped and never presented as an autonomous connection.
- Retain data outside source control. No credentials, personal inventory or actual balances in public examples or release assets.
- Extend bilingual documentation, meaningful tests and actual Electron interaction checks. Build and inspect the Windows artifact; publish only within this project's existing public scope. Keep untested natural notification and Mac behavior explicit.

## Order

1. Discovery and a private coverage receipt.
2. Common account/pool model, read-only adapters, persistent state and reminders.
3. Center UI and integration with the badge/tray.
4. Read-only MCP access to the same local snapshot.
5. Regression/security checks, native UI validation, Windows package, remote checks and handoff.

## Rollback

Starting commit: `4a3833f537ba2357cc0f9623b0d6e8a65c247e9a` (0.2.3). Existing working tree was clean. Changes isolated on `codex/multi-provider-credits`. Existing settings migration must preserve all old keys; the credit center uses separate files. Previous signed-off installer stays available.

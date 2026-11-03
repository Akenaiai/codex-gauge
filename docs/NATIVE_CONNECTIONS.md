# Independent connections (source preview)

[简体中文](NATIVE_CONNECTIONS.zh-CN.md) · [First connections](NEW_USER_CONNECTIONS.md) · [Capabilities](CONNECTION_CAPABILITIES.md)

These readers are implemented in source. The stable 0.4.4 installer is unchanged. They add no runtime package, local server installation, scheduled job or model request.

| Platform | Independent route | Scope and remaining validation |
|---|---|---|
| Runway | Official remote MCP, Gauge-owned browser OAuth | Current team subscription/purchased credits; new user consent and live quota read pending |
| Recraft | Official remote MCP, Gauge-owned browser OAuth | Explicitly active personal account; team/unknown responses rejected; new user consent and live quota read pending |
| MiniMax international | User-supplied Subscription Key, official quota API | Explicit general subscription remaining percentages only; real key verification pending |
| DeepSeek / Firecrawl / Tavily | Existing direct API readers | Already independent; unchanged by this work |

## Connect and manage

Follow Runway or Recraft in **Add / manage platforms**, continue to connections, and choose **Connect on official page**. Confirm the account and requested permissions yourself in the system browser. Return to Gauge for the query result. The provider may grant broader access including generation; Gauge only sends the allowlisted account/credit requests. An authorization can be cancelled in Gauge or declined on the official page, and expires locally after three minutes. Merely closing the guide does not cancel the pending browser attempt; reopen it to cancel, or let it expire. Suspend and quit cancel it.

**Reauthorize / switch account** starts a separate confirmation. The prior grant remains until the new account read and local commit succeed. An account/team change retires the old reading and suppresses its bound reminders. Source/account IDs remain distinct: dates are not silently migrated between Codex and Gauge authorizations. Recraft currently requires the official personal-account summary; it does not select or substitute a team account.

**Disconnect locally** removes the Gauge grant and retires its active readings. It does not revoke consent at the provider; manage that on the provider's official account page. Reopening/restarting never silently falls back to a Codex account. **Use original Codex connection** explicitly opts back into the retained compatibility route and requires a new read there. No existing Codex configuration or grant is overwritten.

MiniMax users select **Connect Subscription Key** and enter their existing **international Subscription Key**. This reuses the existing temporary password-input form and OS-encrypted credential store. It calls `GET https://www.minimax.io/v1/token_plan/remains`; `general` remaining percentages are accepted, including zero. Missing percentages, ambiguous models, wrong key types, unsupported shapes and errors do not become zero. No model call is made. Region, pay-as-you-go balance and video entitlement are not inferred. **Use original Relay connection** explicitly returns to that source. Direct queries take precedence after setup; key removal/failure/restart cannot reactivate a Relay identity. Independent manual records remain.

An explicitly supplied `MINIMAX_SUBSCRIPTION_KEY` in the process environment or the matching enabled MCP environment is also supported. Gauge does not import a MiniMax Code private session or copy the key from a generic Anthropic client field. A rotated key creates a new source binding and does not inherit account-bound dates. Key-bound records remain `identityVerified: false`; a key fingerprint is not a verified account/team identity.

## Implementation and storage

`native-mcp.cjs` uses fixed official resource/issuer origins, protected-resource metadata, dynamic public-client registration, PKCE S256, resource indicators and a random state/callback path. It binds only to an ephemeral `127.0.0.1` port. Host/path/state, duplicate authorization fields and a supplied issuer are checked. Redirects to other services are refused. Metadata must advertise S256 and public-client authentication. This implementation supports the verified same-origin issuers for Runway/Recraft rather than accepting arbitrary server URLs.

Streamable HTTP supports JSON and bounded SSE responses, verifies response IDs/session IDs and negotiates supported MCP versions. The only tool calls are Runway `whoami` or Recraft `get_user`, twice with empty arguments to check identity around the read. It never executes a tool requested by the remote server. Network requests and response bodies have time/size limits. Refresh rotates the encrypted token atomically; invalid grants require reauthorization, insufficient scope is reported, and repeated 401 cannot start an automatic browser authorization or switch identity.

Gauge stores opaque encrypted grants in per-user `credit-oauth.json`, excluded from Git. Tokens, codes, callback/authorization URLs, verifiers and client registration material never enter renderer state, credit records, MCP snapshots or logs. The user explicitly supplied API/Subscription Key is temporarily present in its original password form, then cleared after success; it is never returned in state. Windows uses Electron system encryption; macOS uses the corresponding OS backend when available. Unavailable/basic-text storage is rejected. Saved connection flags are not proof of a valid login.

The center and grant commit roll back together on center-save failure. Disconnect/cancel epochs reject late replies. Suspend/stop cancels pending authorization, and the connected handler cannot silently accept a grant while stopped. The existing five-minute credit refresh is reused; there is no new monitor.

## Retained dependencies

Suno's official remote endpoint is documented, but independent authorization discovery could not be verified from this environment; the working Codex reader remains. Lovart's public independent setup contract remains unverified. Kling keeps its existing China MCP/CLI paths: global and China endpoints/identities are not interchanged. Kimi and Z.AI keep Relay/Python because this change has no verified independent official quota/authentication contract and does not reuse private client tokens. TapNow/Ideogram retain their browser component because their current member MCPs have no implemented balance method. No claimed universal replacement is made.

## Evidence and outstanding actions

On **2026-11-03**, live Runway/Recraft protected-resource metadata, authorization-server metadata and public-client registration were verified, stopping before opening authorization. These are real public protocol receipts, not authenticated quota reads. The native test suite separately covers OAuth denial/cancel/timeout, invalid callbacks/servers, insufficient scope, refresh invalidation, encrypted storage, account switching, save rollback with an existing account, suspend/late replies, restart and MiniMax source selection. Windows Electron checks exercise the production renderer/preload, real center/native client/loopback callbacks and OS encryption with synthetic upstream responses and an empty home/PATH. Their synthetic quotas never enter the daily profile.

Still required: a user confirms each new Runway/Recraft official authorization, or enters the intended MiniMax international Subscription Key, followed by a successful real quota query. Mac code support is not Mac hardware verification. A clean physical-machine installer and old-install upgrade belong to the subsequent delivery check; no installer or daily installation is replaced here.

Sources checked **2026-11-03**: [Runway member MCP](https://help.runwayml.com/hc/en-us/articles/51931843164691-Connecting-to-Runway-MCP), [Recraft remote MCP](https://www.recraft.ai/docs/mcp-reference/remote-server), [MiniMax official subscription usage endpoint](https://platform.minimax.io/subscribe/token-plan), [Suno MCP FAQ](https://help.suno.com/en/articles/14486145), [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).

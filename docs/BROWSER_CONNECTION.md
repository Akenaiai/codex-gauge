# Optional page-balance connection

[简体中文](BROWSER_CONNECTION.zh-CN.md) · [First use](GETTING_STARTED.md)

Version 0.4.3 supports TapNow and Ideogram through an optional Chrome/Edge component, off by default. The TapNow MCP catalog checked on November 2, 2026 exposes no balance query. Authorizing MCP alone does not supply credits. [Official connector documentation](https://docs.tapnow.ai/en/docs/mcp/add-a-custom-connector).

## Connect your own browser

1. Open **All tools → TapNow / Ideogram → View → Connect page balance** in Gauge.
2. Open the component folder and load it unpacked in Chrome/Edge extensions. This is not a store listing. After updating Gauge, reload the existing extension once; pairing and site grants remain intact.
3. Use **Enable & copy pairing code**, then paste it into the Gauge browser extension. Keep this private local connection key to yourself.
4. Select a provider and use the open button to grant that site access. Sign in through the provider’s normal website; Gauge adds no login form.
5. **TapNow:** use your normally opened, signed-in home page. No dedicated or permanently open tab is needed. The component briefly opens the fixed account menu, samples the balance and team marker, and restores the menu. User interaction takes priority: it aborts that observation and leaves a menu the user took over open. **Ideogram:** keep using a component-created dedicated tab and select the full balance plus a persistent account/team marker. Escape cancels selection.
6. Successful observations show the amount, observation time and **Page reading · Account unverified**. A valid zero is used up; an unavailable value is never converted into zero.

## On-demand reads and recovery

- Opening or returning to the TapNow home page requests an automatic read, with activity requests limited to one per 30 seconds. Pausing automatic queries also pauses these requests. Five-minute sampling remains while an eligible home tab is open.
- TapNow never reloads a page, opens a background tab, keeps a page alive or wakes a discarded tab. Discovery is limited to the permitted TapNow origin.
- Only the normal `https://app.tapnow.ai/home` page is supported. Canvas, login, query-string and fragment routes are excluded; working canvases are never redirected.
- Close the page or browser when done. The credit center retains the last amount and time as unconfirmed. The compact creative back still shows only current readings. Your next home visit resumes reads without re-pairing.
- With multiple home tabs, the active one is preferred, followed by recent use; only one is sampled. Team changes invalidate unstable observations. A subsequent stable observation is still account-unverified.
- **Read now** remains available during an automatic-query pause. Sleep suspends reads. Sign-out or changed layouts remain unconfirmed. Observation time describes the page reading, not a confirmed server refresh.
- Ideogram retains its dedicated-tab reload flow. Reopen that dedicated tab after a browser restart; selected positions remain local.

No TapNow desktop-client balance source or MCP balance adapter is connected. Any future MCP adapter needs verified read-only semantics, response fields and account scope; new tools are never executed by guessing their names. This change creates no background monitoring task.

## What is read and stored

- Permissions remain alarms, local extension storage, scripting and the localhost bridge, with separate optional site grants. No new all-sites, cookies, history, debugger or request-interception permission.
- Only fixed visible TapNow balance/team fields or selected visible Ideogram balance/account fields are read. No passwords, site storage, hidden state or copied login sessions.
- The extension stores its local pairing key and selections. Gauge encrypts its pairing key and stores observations under the current user. The fixed-message local bridge exposes no arbitrary URL or script execution.
- Re-pairing revokes the old key; disabling closes the listener. Removing the extension does not delete historical observations.
- Page readings do not authenticate ownership, extract dates or confirm grants, and cannot inherit verified-account dates.

Validation: version 0.4.2 has earlier Windows live balance and twenty-minute background evidence. Version 0.4.3 has isolated regression checks for ordinary-tab discovery, closed/discarded tabs, no reloads, activity throttling, menu restoration and pause. Its new flow still needs real-browser validation after loading the new component; earlier evidence does not prove the new flow. Ideogram and Mac remain without field validation.

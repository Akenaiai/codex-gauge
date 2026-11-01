# Optional page-balance connection

[简体中文](BROWSER_CONNECTION.zh-CN.md) · [First use](GETTING_STARTED.md)

Version 0.4.2 supports TapNow and Ideogram. This is an optional Chrome/Edge component, off by default. These providers' official member MCP catalogs were checked on November 1, 2026 and did not expose a balance query. Authorizing their MCP alone therefore does not make balances available in Gauge.

## Connect your own browser

1. In Gauge, open **All tools → TapNow (or Ideogram) → View → Connect page balance**.
2. Click **Open component folder**, then **Chrome extensions** or **Edge extensions**. In the browser's extension manager, enable **Developer mode**, choose **Load unpacked**, and select that folder. This is a locally loaded component, not a browser-store listing. Keep the folder in place. After upgrading Gauge, reload the component from the extension manager.
3. In Gauge, click **Enable & copy pairing code**. Open the Gauge extension icon, paste the code and click **Connect to local Gauge**. Treat this code as a private local connection key; do not send it to anyone.
4. Select the provider and click **Open dedicated tab**. The browser asks permission for that provider only. Sign in through the provider's normal browser page if needed. Gauge has no account-login form.
5. **TapNow:** sign in on the dedicated home page. The component opens its fixed account menu and reads the balance row plus the visible current-team marker automatically. No point selection is needed. If the team changes during a read, that observation is discarded. It does not read the other account-menu fields. **Ideogram:** make a complete balance and persistent account/team marker visible, then use **Select balance and account marker** and click both positions in order. Escape cancels selection; prices, abbreviations such as `1.2k` and combined `10 / 100` values are unsupported.
6. Return to Gauge. A successful reading shows its amount, reading time and **Page reading · Account unverified**. A valid zero is kept as used up. Unsupported or missing readings stay unconfirmed.

The account/team marker helps detect a changed selection or account. It does not authenticate the account. If the site does not keep both positions visible, automatic reading cannot be completed; keep using the credit center's independent personal records. Browser observations cannot be bound to verified account dates or confirm that credits have arrived.

## Refresh and recovery

While Gauge is running and automatic queries are enabled, it requests a reading every five minutes. The component polls the local bridge, reloads only its own dedicated tab and reads the fixed TapNow fields or selected Ideogram fields. Keep that tab on the supported home page and keep the browser running. It never refreshes unrelated working tabs. A closed tab, lost sign-in, changed page layout or failed read makes the balance unconfirmed; it does not turn an unknown balance into zero.

**Read now** is a manual check, including when automatic queries are paused. Sleep suspends reads. After restarting the browser or reloading the component, use **Open dedicated tab** again; Ideogram selectors remain local. After restarting Gauge, old page readings start offline until a fresh observation arrives. Check any account/team change yourself. TapNow reads the current team in a subsequent stable observation; Ideogram positions may need selecting again. Neither authenticates account ownership.

Use **Re-pair** in Gauge to revoke an old component connection and generate a new code, or **Turn off page link** to stop the listener. Removing the browser component does not delete Gauge's historical records. Windows is the tested desktop environment; Mac browser integration has not been field-tested.

## What is read and stored

- Browser permissions: alarms, local extension storage, scripting and the local `127.0.0.1` bridge. TapNow and Ideogram access is optional and requested separately. There are no cookie, debugger, browsing-history or web-request interception permissions.
- Page access: only the fixed TapNow balance/current-team fields or user-selected visible Ideogram balance and account/team marker on the dedicated supported page. Inputs, editable fields and hidden page state are not read. No passwords, cookies, site storage or authentication sessions are copied to Gauge.
- The component saves its pairing key and Ideogram DOM positions locally. Gauge stores an encrypted pairing key and per-user balance observations, including the page's account/team marker. The local bridge is off until enabled, accepts a pinned extension origin and authenticated fixed read messages, and does not expose a general script or URL execution interface.
- Gauge sends no page balances or account markers to a Gauge server. Normal page reloads still contact the provider and may be visible to it. Site permission grants page access to the component; review the open-source code and grant only sites you intend to connect.

The reader and bridge have automated and isolated native-app checks. A live provider connection additionally needs your own browser installation, site permission, visible fields and successful reading; those steps are not proven by the automated fixtures. Expiry and monthly grant dates keep their existing source labels. This component reads balances only and does not extract page dates or create date rules.

Windows field check: a real TapNow browser balance reached the installed app and matched its creative back. A bounded observation also confirmed a subsequent automatic reading across a full five-minute window without an agent-triggered manual refresh. Account verification, date extraction, live Ideogram reading and Mac support are not established by this check.

Version 0.4.2 background follow-up: a 20-minute Windows run completed 4 automatic readings without browser automation or agent-triggered manual refresh; all sampled heartbeats stayed connected. Sampling runs in the extension worker, page steps are synchronous, and read/picker operations enforce deadlines and their expected home page. A timeout stays unconfirmed and can retry on a later automatic cycle. This is field evidence for this Windows setup, not universal browser or account verification.

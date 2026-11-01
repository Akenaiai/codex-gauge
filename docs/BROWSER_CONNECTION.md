# Optional page-balance connection

[简体中文](BROWSER_CONNECTION.zh-CN.md) · [First use](GETTING_STARTED.md)

Available from 0.4.0 for TapNow and Ideogram. This is an optional Chrome/Edge component, off by default. These providers' official member MCP catalogs were checked on November 1, 2026 and did not expose a balance query. Authorizing their MCP alone therefore does not make balances available in Gauge.

## Connect your own browser

1. In Gauge, open **All tools → TapNow (or Ideogram) → View → Connect page balance**.
2. Click **Open component folder**, then **Chrome extensions** or **Edge extensions**. In the browser's extension manager, enable **Developer mode**, choose **Load unpacked**, and select that folder. This is a locally loaded component, not a browser-store listing. Keep the folder in place. After upgrading Gauge, reload the component from the extension manager.
3. In Gauge, click **Enable & copy pairing code**. Open the Gauge extension icon, paste the code and click **Connect to local Gauge**. Treat this code as a private local connection key; do not send it to anyone.
4. Select the provider and click **Open dedicated tab**. The browser asks permission for that provider only. Sign in through the provider's normal browser page if needed. Gauge has no account-login form.
5. On the provider's normal home page, make the complete numeric balance and a persistent account/team marker visible. In the extension, click **Select balance and account marker**, then click those two positions in order. Escape cancels selection. A price, abbreviation such as `1.2k`, or a combined `10 / 100` value is not a supported balance. Choose a full, single number.
6. Return to Gauge. A successful reading shows its amount, reading time and **Page reading · Account unverified**. A valid zero is kept as used up. Unsupported or missing readings stay unconfirmed.

The account/team marker helps detect a changed selection or account. It does not authenticate the account. If the site does not keep both positions visible, automatic reading cannot be completed; keep using the credit center's independent personal records. Browser observations cannot be bound to verified account dates or confirm that credits have arrived.

## Refresh and recovery

While Gauge is running and automatic queries are enabled, it requests a reading every five minutes. The component polls the local bridge, reloads only its own dedicated tab and reads the selected visible fields. Keep that tab on the supported home page and keep the browser running. It never refreshes unrelated working tabs. A closed tab, lost sign-in, changed page layout or failed read makes the balance unconfirmed; it does not turn an unknown balance into zero.

**Read now** is a manual check, including when automatic queries are paused. Sleep suspends reads. After restarting the browser, use **Open dedicated tab** again; saved selectors remain local. After restarting Gauge, old page readings start offline until a fresh observation arrives. If account/team changes, select the positions again and check the account yourself.

Use **Re-pair** in Gauge to revoke an old component connection and generate a new code, or **Turn off page link** to stop the listener. Removing the browser component does not delete Gauge's historical records. Windows is the tested desktop environment; Mac browser integration has not been field-tested.

## What is read and stored

- Browser permissions: alarms, local extension storage, scripting and the local `127.0.0.1` bridge. TapNow and Ideogram access is optional and requested separately. There are no cookie, debugger, browsing-history or web-request interception permissions.
- Page access: only the user-selected visible balance and account/team marker on the dedicated supported page. Inputs, editable fields and hidden page state are not read. No passwords, cookies, site storage or authentication sessions are copied to Gauge.
- The component saves its pairing key, selected DOM positions and account marker locally. Gauge stores an encrypted pairing key and per-user balance observations. The local bridge is off until enabled, accepts a pinned extension origin and authenticated fixed read messages, and does not expose a general script or URL execution interface.
- Gauge sends no page balances or account markers to a Gauge server. Normal page reloads still contact the provider and may be visible to it. Site permission grants page access to the component; review the open-source code and grant only sites you intend to connect.

The reader and bridge have automated and isolated native-app checks. A live provider connection additionally needs your own browser installation, site permission, visible fields and successful reading; those steps are not proven by the automated fixtures. Expiry and monthly grant dates keep their existing source labels. This component reads balances only and does not extract page dates or create date rules.

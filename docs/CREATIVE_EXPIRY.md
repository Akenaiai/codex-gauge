# Creative credit expiry reminders

[简体中文](CREATIVE_EXPIRY.zh-CN.md)

Available in Windows 0.4.7. See the [release notes](releases/0.4.7.md) for verification scope and remaining field checks.

The creative face highlights non-daily credit batches expiring within seven days, ordered by the nearest deadline. It checks the amount in the expiring pool, never the account total. Batches of **100 credits or less** keep ordinary balance/date text without an expiry badge, priority sorting or expiry notifications.

Use **Reminder settings** on a creative platform card to set that platform's inclusive cutoff. The default is 100; 0 permits any positive credit balance. Cutoffs persist across restarts and do not affect other platforms or Codex. They apply to credit units; percentages and request counts retain their own units and are not treated as credits. Unknown expiring amounts remain ordinary date information.

| Time remaining | Eligible batch behavior |
| --- | --- |
| More than 7 days | Ordinary balance and date |
| Within 7 days | Amber label, sorted first, no system notification yet |
| Within 3 days | Amber emphasis and one silent notification |
| Within 24 hours | Red expiry label and one final silent notification |
| At or below the cutoff | Ordinary text; no expiry emphasis or notifications |

Date-only records retain day precision: the final notice is on the recorded date, without inventing an exact expiry time or timezone. Website/user records still request verification. Existing account, freshness, notification opt-outs and daily-gift suppression remain applicable. Restarts do not reset notification receipts.

**Dismiss this batch** removes that batch's expiry emphasis and future notices across restarts. It is scoped to the account, pool and expiry date. Other pools and subsequent batches remain eligible. Balances and dates remain visible, and Codex reminders remain independent.

The small Codex gauge keeps its quota reading and reset marker. A separate image icon identifies creative expiry and opens the creative face directly. The flip button shows the number of expiring creative platforms. Notifications name their source; creative expiry uses its own notification group and click destination. Ordinary reopening still starts on Codex.

Settings and dismissal receipts stay in the existing local credit-center store. No new service, provider sign-in, generation request or telemetry is introduced. Automated and isolated Windows checks do not establish natural future notification delivery or Mac behavior.

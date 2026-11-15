# Helios Email rollout

## Staging

1. Use an isolated Supabase project and a matching app deployment. Apply the Email migration after the existing Helios migrations. Confirm the private bucket and confirm Email is unavailable to all users in its initial state.
2. Set the existing server-side Supabase service role and cron secret. Set EMAIL_STORAGE_LIMIT_BYTES to the agreed project share of the organization’s Storage allowance. The daily maintenance job checks the total bytes recorded in this project’s Storage metadata and emits a warning at 70%. Route that warning to the operator and verify receipt in staging. Review organization-wide Storage and egress in the Supabase Usage dashboard as well.
3. Create synthetic staging accounts with completed profile and employee setup. Use five accounts to verify a sender, a To recipient, two isolated Bcc recipients, and an unrelated account. From the SQL Editor, insert the approved staging profile UUIDs into email_private.pilot_users and set email_private.settings.mode to pilot. Verify an eligible sender cannot address non-pilot or inactive accounts.
4. Validate Inbox, Sent, Drafts, Archive, and Trash, including refresh recovery, cross-tab autosave conflicts, pagination, search, independent archive and restore, read and unread changes, and flat replies. Confirm the badge sequence 0 → 1 → 2 → 1 → 0, 99+, the exact accessible count, reconnect, mobile drawer, collapsed sidebar, keyboard navigation, and account switching. Check private Realtime delivery across two browser sessions and verify a second account’s topic is inaccessible.
5. Upload valid files and verify the actual response headers, the one-minute link expiry, and denial after removing mailbox access. Check SVG, file bytes that disagree with the extension, an oversized file, and the three-file cap. Forward an attachment, purge all copies of the original, then check the forwarded copy can still download. Exercise failed storage deletion and confirm a later cron run retries it. On a Vercel preview, invoke the staging cron route with the staging bearer secret because scheduled invocations target production deployments.

## Pilot and capacity

Record the actual Supabase tier, organization allowance and usage for Storage and monthly egress, and current database disk usage. Record pilot roster size and expected messages per sender per week. Estimate peak attachment growth as users × messages per user per week × 9,000,000 bytes. Estimate download egress from expected downloads per attachment and add normal API and Realtime traffic. Record the resulting headroom before setting mode to pilot in production.

Review only aggregate data during the pilot. Count successful sends from email_private.sends. Use the Vercel Email send outcome and maintenance logs for failure rates and cleanup health. Spot-check the UI count against email_private.entries filtered to each test account's unread Inbox. Record Storage growth and project it over 52 weeks. Widen to all only when staging has passed, send and badge behavior is confirmed, and projected total Storage remains below 50% of the applicable allowance.

## Rollback

Set email_private.settings.mode to off. Refresh the dashboard to verify Email is hidden. Verify the page, direct API and RPC calls, old attachment URLs, and new Realtime subscriptions deny access. The maintenance job pauses retention while Email is off. Restore the previous mode after resolving the issue and check that the same drafts, messages, flags, and files are accessible again.

# Audit hardening rollout

## Follow-up repairs for existing deployments

After hardening, apply `20261101_board_creation.sql` and then `20261101_personalization_repair.sql`. The board repair replaces the recursive deployed SELECT-policy variant and supports INSERT RETURNING. The personalization repair adds missing `cards.cover_color` and `board_favorites` objects without replacing task records or replaying historical storage policies. It reinstalls user-private favorite policies, grants only SELECT/INSERT/DELETE to authenticated clients, removes inherited client TRUNCATE privileges, and requests a PostgREST schema-cache reload. Both follow-ups can be repeated safely, but normal migration tracking should still record their application.

Deploy the matching application update with these repairs. Favorite creation now uses ON CONFLICT DO NOTHING (`ignoreDuplicates`) so repeated requests need no UPDATE privilege. Verify status moves and covers from Board/Table view, persisted favorites after refresh, sidebar/List board creation, and first/subsequent task creation from Table view.

This is an operator procedure for a future staging/production rollout. Local tests do not apply SQL to a live project.

## Prepare

1. Take a restorable database backup and inspect the actual Supabase migration history, table/column privileges, RLS policies, storage bucket visibility and Realtime publication. Manual changes may differ from Git.
2. Rehearse against a staging copy. For a fresh project apply all migration files in filename order; `00001` now defines an owner-only access helper and `00003` expands it after team tables exist. Existing environments do not rerun those historical files; the new hardening migration replaces the final helper itself.
3. Inspect `profiles.anthropic_api_key` as a privileged operator. The migration preserves values and removes client access. Determine whether actual keys were exposed and rotate them with their provider if needed. Never copy values into logs or reports.
4. Review the hardening preflight: cards must belong to the same board as their column, and card/label links must stay within one board. If the migration reports inconsistent counts, roll back the aborted transaction, inspect the intended relationships and explicitly repair them before retrying. No automatic deletion or reassignment is performed.
5. Configure server-only service-role, email and cron credentials and the Supabase callback allowlist. Keep real secrets out of source control.

## Apply and switch the application

Pause writes or use a brief maintenance window. This change intentionally revokes insecure direct team/member/invite/column-delete/AI-usage privileges; old clients that still write those tables cannot safely overlap with the new permissions.

Apply `supabase/migrations/20261101_audit_hardening.sql` as one transaction, then deploy the application from this branch. The script commits only after constraints, policies, grants and functions are installed. A failed preflight or SQL error must leave the transaction rolled back. Migration history should mark the file applied only after success. Do not blindly rerun an already-successful migration: normal migration tracking owns exactly-once application.

The application now uses `create_team`, `invite_team_member`, `accept_team_invite`, `move_card(uuid,uuid,integer,jsonb)`, `delete_board_column`, `conversation_summaries`, `reserve_ai_usage` and `notification_recipient_allowed`. Check PostgREST schema-cache refresh after installing functions/constraints. Existing foreign-key relationship names are preserved, with one relationship per nested cards/labels pair.

The migration explicitly makes attachments/chat-files buckets private and publishes conversation membership updates. Existing chat object paths do not need a destructive backfill: valid legacy own-project signed URLs are converted and re-signed lazily by the message read route.

## Verify before reopening writes

- In two unrelated accounts, confirm private boards, labels, attachments, signed file refresh and chats cannot be read or modified by outsiders, including direct Supabase requests.
- Confirm legitimate owner/member flows: team creation, invited-email acceptance, expired-invite resend, chat creation, read receipts, comment edit/delete and card assignment notifications.
- Test the real nested PostgREST board and card responses; embedded PostgreSQL tests verify the schema but do not run PostgREST itself.
- Move cards within/across columns, under filters, and with metadata changes. Refresh the page and check ordering. Inject a rejected write. Complete a recurring card through drag and the details dialog.
- Delete a populated column; verify all cards survive in deterministic order. Reject deletion of the final column.
- Test OAuth from a fresh browser, confirmation-required signup, expired recovery and password update.
- Send an email using the verified sender. Run cron with its bearer secret; invalid secrets, opted-out users, outsiders and completed cards must receive no reminders. Check failures and UTC day boundaries.
- Verify concurrent quota reservations with multiple real connections; direct client writes to metering must fail. A failed provider attempt still consumes one slot.

## Recovery

### Chat reliability follow-up

Apply `20261101_chat_reliability.sql` before deploying the matching chat application. It is transactional and repeatable, replaces only reaction policies, adds private typing authorization on Supabase's existing `realtime.messages` table, and installs the monotonic `mark_conversation_read` RPC. It does not delete messages, reactions, memberships, or attachment records. Request a PostgREST schema refresh after applying the function.

Verify reaction INSERT/DELETE ownership with isolated accounts, private Presence joins, successful reads, retained drafts/files on rejected requests, reconnect recovery, and synchronized unread indicators. Refresh open clients onto the new application version. A code rollback can retain these compatible database changes; do not reinstate the old insecure reaction policy. Historical clients' bodyless read requests remain supported.

Do not restore the old permissive policies to recover an application error. Keep writes paused and roll forward with a compatibility fix using the hardened RPCs. An older app version will need those RPC call sites backported before it can run against the new permissions.

If the migration fails, its transaction should roll back without data loss. If a complete database restore becomes necessary, use the verified backup under operator control and keep public access disabled until hardened policies and any required secret rotations are restored. A restore discards writes made after the backup; that destructive step needs a separate explicit decision. No unsafe automatic down migration is supplied.

# Service Desk

Each existing team has a private desk at `/dashboard/service-desk`. No setup or ticket migration is required. Members submit IT issues, access requests, tool/purchase approvals or technical requests. Owners/admins manage the queue and designate current teammates as support agents under **Manage support**.

Requesters see their own tickets. Support sees the team queue. A named approver sees assigned tickets but not the queue. All participants must remain team members. Comments are shared with all authorized participants; there are no internal-only notes.

Tickets progress from Submitted through Triage, In Progress, Resolved and Closed. Waiting requires a reason/note. Requesters may cancel open tickets, close resolved tickets or reopen resolved/closed tickets with a reason. Cancellation is terminal in v1. Support must return started work to triage before material amendments. No automatic closure, email, timed reminders or SLA escalation is enabled.

Access and purchase requests require one current approver different from requester and fulfillment assignee. Support selects the approver. Approval permits work; it does not fulfill or close the ticket. Changes requested/rejection require a reason and return to triage. Material edits, attachments and reopening supersede prior approval. Fulfillment requires a current support assignee and valid approval when required.

Files use a private 10 MB bucket with the same unrestricted MIME policy as existing board attachments. Downloads are forced attachments through authenticated, non-cacheable server routes. Browser clients have no storage SELECT policy and cannot mint signed URLs. The existing `SUPABASE_SERVICE_ROLE_KEY` is required only for the server-side byte read after user-authorized metadata lookup. Never expose that key to clients.

Linked board tasks require same-team board association and the support actor's board access. Viewing the ticket grants no board access. Task and ticket status do not synchronize. My Work has separate ticket counts; the notification bell combines authorized board and ticket alerts. Ticket email delivery is intentionally absent.

## Deployment and recovery

1. Run tests, lint, typecheck and build. Locally, the pre-existing shared node_modules junction may require `npm run build -- --webpack`; CI installs ordinary local dependencies and uses the default build.
2. Run `node scripts/verify-service-desk-concurrency.mjs` with PostgreSQL 17 available (`POSTGRES_BIN` may override its directory). It creates an isolated local fixture cluster and retains proof under the sibling `service-desk-qa` folder.
3. Capture existing record counts/fingerprints, then apply `20261102_z_service_desk.sql` transactionally before deploying application code. It is additive and replay-safe. Do not rerun unrelated historical migrations in production.
4. Deploy the application and check Service Desk intake, a separate approver session, notification links, uploads/downloads, mobile and keyboard flows using isolated team/ticket data.
5. If application rollback is necessary, restore the previous application deployment while retaining all `desk_*` tables, history and private storage. Ticket producers run only during explicit operations; there is no ticket scheduler to disable. Do not drop ticket data or restore the entire database.

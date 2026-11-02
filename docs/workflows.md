# Approvals and reliable notifications

Approvals are opt-in per task and configured by the board owner. The assignee or owner submits a revision to one independent reviewer. Approval unlocks completion; it does not move the card. Changes requested require a note, disabling approval requires a reason, and all transitions retain history. Repeat operation IDs are idempotent; stale revisions return HTTP 409.

Database guards cover direct writes, transactional moves, related deliverable content, attachment objects and column changes. Material changes invalidate review; unchanged custom-field upserts and administrative date/priority/label edits preserve it. Completed approval-required work must be reopened before material edits. Recurrence copies configuration while starting a new unapproved/unblocked cycle. Needs Attention includes pending reviews for the current reviewer, with full filtered counts/pagination.

Notifications originate in the source transaction. Canonical event keys deduplicate recipients and legacy helpers. Notification reads and email dispatch recheck current access. The bell refetches authoritative unread counts on realtime/reconnect/focus and only marks read after successful writes. Mutation conflicts display the server's approval/reopening explanation while retaining drafts.

Board owners enable scheduled reminders/escalation and choose a board timezone. Existing boards start disabled/UTC. A Monday deadline is overdue Tuesday and escalates Wednesday; review deadlines retain their request timezone. Current calendar phase is rechecked before mail dispatch, preventing a stale “due today” message after midnight. Scheduled generation runs in PostgreSQL independently of an open dashboard or application/email availability.

## Delivery semantics

Email requires both RESEND_API_KEY and a verified RESEND_FROM, recipient opt-in and current source eligibility. Missing configuration is recorded as disabled, never sent. Leases recover after crashes, provider payloads/keys remain immutable, and attempt budgets start only when dispatch is authorized—not when unused work is claimed. Retries use bounded backoff and stop after six attempts. Outcomes distinguish provider acceptance, definitive rejection, transient failure and uncertain acknowledgment. Uncertain work beyond 23 hours requires inspection rather than a blind resend outside the provider deduplication window. Provider acceptance is not inbox-delivery certification.

The fixed-purpose public maintenance endpoint accepts no target data and returns no private metadata. A service-only 60-second gate, per-delivery leases, 25-row batches, a 20-second worker budget and per-provider timeouts limit work. The original daily cron retains its bearer-secret check and delegates the same durable path. Owner delivery health is scoped to owned boards; only definitive eligible transient failures can be retried manually.

## Release and recovery

1. Apply the three `20261102_workflow_01/02/03` migrations in order, preferably as one transaction. They are additive and repeatable. Preserve task fingerprints and rehearse replay/rollback before production.
2. Deploy the matching application. `workflow_runtime.producers_enabled` initially remains false for compatibility sequencing. Existing task approval requirements and board schedules remain off.
3. Apply `docs/deployment/workflow-scheduler.sql` only after deployment is ready. It creates separate five-minute DB-generation and HTTP-delivery jobs and activates producers. Verify both actual cron runs and the HTTP response without exposing secrets. Existing audio maintenance is unaffected.
4. Verify isolated two-account approval transitions, reviewer-only attention, completion guards, notification read handling, health, scheduler behavior, keyboard and mobile layouts. Verify real email only with a verified sender and user-owned QA recipients.

For rollback, stop the new scheduled jobs and redeploy compatible application code while retaining history/schema. Keep producers active while an old binary could still send direct emails: the compatibility trigger rejects redundant old inserts before their direct send. Do not automatically drop tables or restore the whole database. Record actual rollout proof and remaining limitations separately.

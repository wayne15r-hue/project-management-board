# Approvals, reliable notifications and escalation

## Intent and selected approach

Build features 2 and 3 as one release: an operations team submits work to one named reviewer, receives a decision and can reliably find overdue work without manual chasing.

The user selected mandatory approval before completion, one reviewer per request and escalation to the board owner after one overdue day. Advisory approval and multiple-reviewer approval are excluded. My architecture recommendation is transactional database events plus a durable email queue; continuing best-effort sends would leave successful task updates without reliable alerts.

## Approval experience

- Approval is opt-in per task. Existing tasks remain ordinary tasks. Only the board owner can enable/disable the requirement or change its configured reviewer; these changes enter history. Disabling requires a reason and closes a pending request visibly.
- A reviewer must have current board access and be different from both the requester and task assignee. A task with no eligible reviewer cannot be submitted. Task assignees and the board owner can request, withdraw or resubmit review; any other member retains existing editing permissions.
- The shared task editor displays Not requested, Pending review, Changes requested or Approved, the reviewer, review deadline and chronological request/decision history. Decision buttons are available only to the current reviewer. Request changes requires a reason; an approval note is optional. Notes are limited to 2,000 characters.
- Approval unlocks completion; it does not move the task automatically. Every path into a completed column is checked in the database, including direct writes, drag/drop and Table/editor moves. Retain the existing completion convention (Done/Completed or terminal column on boards with at least two columns).
- Reject column additions/renames/reorders/deletions that would implicitly complete or reopen approval-required tasks; explain that affected tasks must be explicitly handled first. Do not silently apply a bulk approval transition. Column edits/reorders affecting these boards must be atomic, including their API path, so rejected changes cannot leave a partly updated workflow.
- Requests bind to a revision. Changes to task title, description, assignee, subtasks, attachment references or custom values invalidate pending/approved review. Changing a referenced custom-field definition also invalidates affected reviews because it changes the interpretation of reviewed values. Comments, priority, dates, recurrence, blocked state/reason, labels, cover colour and ordering do not invalidate review. Reopening a completed task requires a fresh approval cycle. This deliberately separates deliverable changes from routine administrative edits.
- Material edits to an already completed approval-required task require reopening it first. Return a clear conflict rather than silently moving it or retaining stale approval. Losing reviewer access prevents decisions; the owner can choose an eligible replacement and request again.
- Concurrent/duplicate requests and decisions are transactionally serialized. Retrying the same completed operation does not duplicate history or notifications; stale revisions and conflicting decisions return a conflict.
- A review deadline is required when submitting, defaults to tomorrow in the board timezone and can be edited before submission. Store the request's timezone with its deadline; later board-timezone changes affect future requests, not that agreed deadline. Changing a pending request's deadline requires withdrawing/resubmitting, preserving the history.

## My Work integration

- Needs Attention also includes open pending requests assigned to the viewer as reviewer, even when they are neither assignee nor board owner. Keep existing overdue/blocked inclusion rules and deduplicate task rows.
- Add a Pending My Review count and a reviewer/status badge. My Work remains the viewer's assignments. Extend existing search, board filters, full-result counts and 50-item pagination; keep the existing due-date ordering.
- Show request/decision actions in the shared editor so Board, Table and My Work agree. Preserve drafts and account-switch protections introduced in feature 1.

## Notifications and escalation

- Persist in-app alerts and delivery work in the same database transaction as their source event. Cover existing assignment/comment/mention notifications plus review requests, approval, changes requested, withdrawal and material-change invalidation. Preserve existing recipient behavior, with one alert per recipient per source event; mentions take precedence over generic comment alerts.
- Suppress human self-notifications. Re-check board access when creating alerts, reading them and attempting email delivery. Revoked access must remove private alerts from lists/counts and prevent further delivery.
- Board owners can enable scheduled reminders/escalation and select a board timezone. Existing boards start with scheduling disabled and UTC; enabling offers the owner's browser timezone explicitly. Approvals work without enabling scheduling.
- When scheduling is enabled, notify the current task assignee on its due day and once when overdue; notify the reviewer for review deadlines. Each phase is emitted once per current due-date/assignment/request version. Enabling can include existing outstanding work, with deduplication and no repeated daily flood.
- Escalate unfinished work or unanswered review to the board owner after one full overdue calendar day in the board timezone: a Monday deadline is overdue Tuesday and escalates Wednesday at local midnight. No task deadline means no task-deadline escalation; pending reviews have their own required deadline. Completed, withdrawn, superseded or resolved work is excluded.
- Use a scheduled worker at least every five minutes, independently of an open dashboard. Lease work for safe concurrent processing; recover expired leases, retry transient errors with capped backoff and retain exhausted/permanent failures for inspection. Revalidate current state before emitting scheduled alerts and before email delivery.
- Replace the old direct daily email-reminder implementation with the same durable maintenance path and event keys. Old and new timer entrypoints must not send separate reminder emails during rollout.
- In-app delivery remains available without email. Email requires a verified configured sender and recipient opt-in. Record disabled/unconfigured delivery honestly; never label it sent. Use stable provider idempotency keys and immutable payloads. Ambiguous delivery beyond the provider's deduplication window requires inspection rather than blind resend. Provider acceptance is distinct from inbox delivery.
- Repair the bell's read-error handling, duplicate/unread races, reconnect/focus refresh and account cleanup. Expose retryable loading errors. Keep existing deep links and allow marking individual/all alerts read only after successful writes.
- Provide owner-visible delivery health for that owner's boards: queue/failure counts and safe manual retry for eligible failures, without exposing recipient emails, credentials or another board's information.

## Data and ownership

Use additive schema for approval requests/history, task revisions, board scheduling settings, event/delivery deduplication and worker leases. Authenticated clients cannot directly forge approvals, history, delivery results or worker ownership. Use locked RPCs for approval transitions and the existing signed-in/RLS boundary for reads. All privileged helpers use fixed search paths and restricted execute grants.

Database triggers enforce completion/revision rules and atomically produce events. Keep old application clients compatible during deployment and deduplicate legacy notification inserts rather than sending duplicate alerts. Recurring copies retain the approval requirement/configured reviewer but start unapproved, unblocked and with no pending request, decision or delivery history.

No new chat platform, email provider, native push, multi-step approver chain, business-hours calendar or general workflow-automation builder. Those are separate features.

## Verification and rollout

Test authorized/unauthorized review, self-review rejection, approval gate through every write path, column shape changes, material invalidation, access revocation, stale and simultaneous decisions, recurring copies and legacy clients. Exercise >1,000 tasks, review-only attention inclusion, local midnight/DST, repeated scheduler runs, worker crashes, lease expiry, disabled email, preference/access changes, permanent/transient provider failure and ambiguous acknowledgements. Verify bell counts/read failures and session/draft cleanup.

Run the full suite, lint, typecheck and production build; obtain independent review. Rehearse transactional migration replay/rollback and preserve original task fingerprints. Apply additive schema before deploying dependent code; activate new producers and scheduler in a controlled sequence without legacy duplicate sends. Verify the actual scheduled job, then run isolated two-account browser QA including mobile and keyboard. Email QA is limited to user-owned test recipients when a verified sender is available; otherwise document that limitation while completing in-app delivery.

Rollback the application while retaining compatible additive schema and stopping new scheduled work; never discard task/approval history or automatically restore a whole database. Record deployment, scheduler proof, data preservation and remaining limits in the rollout report.

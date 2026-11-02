# Approvals and Reliable Notifications Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. The design is approved; do not ask for approval again.

**Goal:** Ship approval-gated completion with durable notifications, overdue escalation and owner delivery health.
**Architecture:** Transactional PostgreSQL approval transitions/revisions and notification producers; RLS reads, locked service-only delivery leases, existing Resend email transport, React UI in shared task editor/My Work/bell/board header.
**Tech Stack:** Existing Next.js 16, React 19, Supabase/PostgreSQL, Resend, Vitest/PGlite. No new dependencies.
**Spec:** `docs/superpowers/specs/2026-11-02-approvals-notifications-design.md` (read fully).

## Global constraints
- One reviewer, excluding requester/current assignee; owner-only approval configuration; assignee/owner submission/withdrawal; only current eligible reviewer decides.
- Existing tasks ordinary; scheduling disabled and UTC on existing boards. Owner opt-in offers browser timezone. Monday due => Tuesday overdue => Wednesday escalation.
- Revision invalidates on title/description/assignee/subtasks/attachment refs/custom values or referenced custom definitions; not administrative date/priority/label/block/cover/order changes. Completed required task needs explicit reopening before material edit.
- No privileged-state direct writes by authenticated clients. Mutations lock board before card/request; access checked after locks. Current access must protect notifications/counts/email, too.
- Require local date review deadline, frozen request timezone, default tomorrow. No auto-completion; preserve recurrence configuration but reset approval/block state.
- Keep original user data read-only in QA; use isolated two-account records. Rollout additive migration before application, then enable runtime producers and scheduler.

## Shared contracts

### Approval (Task 1 owns)
- Migrations: `20261102_workflow_02_approvals.sql` (after notification core, before maintenance).
- Tables: `card_approval_settings` (card_id, required, reviewer_id, revision, approved_revision, completion checkpoint), `approval_requests` (id, card_id, revision, requester_id, reviewer_id, review_due_date, review_timezone, status, decision_note, requested_at, decided_at), durable `approval_history`.
- Statuses exposed to UI: `not_requested | pending | changes_requested | approved`. Historical requests also have withdrawn/superseded.
- `GET /api/cards/[cardId]/approval` -> `ApprovalDetails` from `src/types/approvals.ts`: `{required,reviewer_id,revision,status,can_configure,can_request,can_decide,current_request,history,eligible_reviewers,timezone,current_user_id}`. Public reviewer profile fields only. History entries `{id,action,note,created_at,actor_name}`; current_request includes requester/reviewer IDs and name, revision, deadline/timezone, status.
- `POST /api/cards/[cardId]/approval` -> refreshed ApprovalDetails. Body `{action,operationId,expectedRevision,...}` with actions configure (`required,reviewerId,reason?`), request (`reviewDueDate`), approve/request_changes (`requestId,note?`), withdraw (`requestId,note?`). `operationId` UUID deduplicates retries; mismatch/stale revision 409, unauthorized 403, validation 400.
- SQL `get_card_approval(p_card_id uuid)` and `transition_card_approval(p_card_id uuid,p_action text,p_payload jsonb)` implement reads/mutations.
- Extend My Work scalar RPC/response with `counts.pendingMyReview`, `item.approval_status` and `item.pending_my_review`; include pending review-only tasks in attention while preserving assignment-only mine/search/pagination/order. These extra response fields may be optional in legacy TS fixtures.

### Notification core/worker (Task 2 owns)
- Migrations `20261102_workflow_01_notifications.sql` and `20261102_workflow_03_maintenance.sql`; core must precede approval, maintenance may reference approval tables.
- Core creates `board_workflow_settings` with board_id/timezone/scheduling_enabled and service-only runtime activation flag initially false; event keys on notifications and durable service-only deliveries/leases.
- SQL internal producer: `workflow_emit(p_event_key text,p_type text,p_card_id uuid,p_actor_id uuid,p_recipients uuid[],p_title text,p_body text default null,p_metadata jsonb default '{}') returns void`. Service/trigger-only execute. Rechecks actor/recipient board access and suppresses human actor's own alert. Transactional notification + email work; canonical unique event key per recipient. Legacy inserts/helpers must deduplicate against same source.
- New notification types: `review_requested, review_approved, review_changes_requested, review_withdrawn, review_invalidated, due_today, overdue, escalation` alongside assignment/comment/mention.
- Approval producer recipients: request -> reviewer; approval/changes -> requester+current assignee; withdrawal -> reviewer; invalidation -> former requester+reviewer. Deduplicate recipients and suppress actor. Metadata includes request_id/revision so scheduler/delivery can discard stale jobs. Source keys include approval operation/request UUIDs.
- `GET /api/boards/[boardId]/workflow` owner-only -> `{settings:{scheduling_enabled,timezone},health:{pending,failed,disabled,needsReview,accepted}}`.
- `POST /api/boards/[boardId]/workflow` owner-only actions `save` (`scheduling_enabled,timezone`) or `retry_failed` (safe eligible retries only). Returns same shape. Define service-only worker RPCs internally and export typed worker at `src/lib/workflows/maintenance.ts`.
- `POST /api/notifications/maintenance` fixed purpose/no target parameters, generic ok response, bounded by DB leases; invoke from independent pg_cron/pg_net job every <=5 minutes. DB scheduled generation must work even if app/email unavailable. Existing bearer-auth daily cron delegates same path/event keys; no separate direct reminder emails.
- Durable attempt/backoff/lease records; stable frozen provider payload and idempotency key; stop ambiguous resends beyond provider dedup window. Config-disabled/opted-out/access-revoked never marked sent. Health accepted means provider acceptance, not inbox delivery.
- Existing `createNotification` remains compatibility adapter to durable RPC (no direct provider send). SQL card-assignment and comment/mention producers must capture originating writes, not depend on app helper reaching them.

## Task 1: Approval persistence and routes
- [ ] Write failing database/route tests for owner configuration, self-review rejection, authorized decisions/retries/stale revisions, completion through direct/move/column paths, content vs admin invalidation, related writes, access revocation, history and recurrence.
- [ ] Implement approval migration, typed API, atomic column editing path and recurrence config reset. Completion checks must not depend on UI controls or spoofable client flags.
- [ ] Extend My Work query/types and test review-only inclusion, dedup/full counts with >1,000 rows.
- [ ] Run focused tests and lint/typecheck; report owned files/commits. Coordinate notification migration prerequisites without editing Task 2 files.

## Task 2: Reliable producers, scheduler and delivery
- [ ] Write failing tests for transaction rollback/dedup, legacy helper overlap, assignment/comment/mention recipients, revoked reads/counts/access, schedule day boundaries/DST and repeated runs.
- [ ] Implement core/maintenance migrations, owner settings/health APIs, typed bounded worker and transport, compatibility helper, old-cron delegation.
- [ ] Test expired leases/crashes, transient/permanent errors, retry safety, immutable payload/idempotency, disabled sender/preferences, stale workflow jobs and >1,000-task generation.
- [ ] Run focused tests and lint/typecheck; document runtime activation/scheduler SQL/rollback. No live email to non-QA accounts.

## Task 3: Product UI
- [ ] Write failing UI tests for approval configuration/request/decision/errors/draft retention, pending-review count/badges and owner settings/health; bell failed-read and duplicate/account boundaries.
- [ ] Add `ApprovalPanel` inside shared editor, refresh dependent board/My Work queries after successful transitions. Keep existing drafts and editor lifetime guards. API errors show useful server messages; reuse operation UUID when retrying uncertain response.
- [ ] Add owner workflow settings/health dialog to board header; implement frozen-date timezone display and browser-zone offer when enabling scheduling.
- [ ] Repair bell around server-authoritative refetches on realtime/focus/reconnect; don't increment duplicate counters optimistically or mark read after failed writes.
- [ ] Run focused UI tests, lint and typecheck, commit owned files.

## Task 4: Review and release
- [ ] Inspect every agent result; full suite/lint/types/build/diff, independent whole-diff review and regression fixes.
- [ ] Migration rollback/replay and preservation proof; deploy reviewed changes through GitHub/Vercel, activate runtime/scheduler only after compatibility checks.
- [ ] Isolated primary/peer browser QA including reviewer-only attention, approved completion, changes/resubmission/content invalidation, reliable bell, owner settings and mobile/keyboard. Verify actual scheduler job and final original-card fingerprint.
- [ ] Record rollout and remaining email/device/load limits. Stop at approved features; don't begin reusable workflows/automation builder.

## Review focus
Column-derived implicit completion; lock ordering and read-after-lock authorization; stale external delivery after access/revision changes; source/legacy dedup across deployment; queued mutation/cache results after account switch.

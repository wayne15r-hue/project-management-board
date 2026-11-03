# LeaveDesk Implementation Plan

> **For agentic workers:** Implement against the approved spec; use test-first database and route checks and independently review the integrated branch.

**Goal:** Deliver the approved LeaveDesk release in Helios.
**Architecture:** Additive PostgreSQL tables and authenticated transactional RPCs own permissions, snapshots and the balance ledger. Next.js routes validate inputs and delegate to RPCs; client views use the existing authenticated dashboard and private download pattern.
**Tech Stack:** Existing Next.js 16, React 19, Supabase, Zod, Vitest/PGlite.
**Spec:** `docs/leave-desk-spec.md` (user approved 2026-11-03).

## Global constraints
- Preserve existing work and historical leave records; rollback application code without dropping leave tables.
- No self-approval, invented allowances, payroll effects or medical information in coworker views/notifications.
- Active-account checks, current manager authorization and revision/idempotency checks apply to every mutation.
- Lock employee_runtime before leave writes so employee/manager/admin changes serialize with leave decisions.
- January/April periods; calendar snapshots; half-day overlap protection; 10 MB PDF/JPEG/PNG private attachments.

## Review focus
- Manager reassignment and takeover revoke old access immediately, including storage.
- Concurrent reservations, stale approvals and retries cannot double deduct.
- Account deletion preserves history without adding Auth deletion blockers.
- Department calendar returns only dates and “On leave”; pending entries are private.
- Settings changes do not rewrite existing day allocations or balances.

## RPC and HTTP contract
All RPCs return JSONB. API data is returned unchanged; errors use SQLSTATE mapping. UUIDs are strings; dates are ISO calendar dates; durations are numeric days (0.5/1).
- `leave_context()` => `{userId,admin:boolean,manager:boolean,employees:[{id,name,department_id}],departments:[{id,name}],types,policies,calendars,assignment}`. Settings data only to admins; ordinary users receive assigned policy/calendar plus enabled types.
- `leave_list(p_view text)` => request array. Views mine/approvals.
- `leave_detail(p_request uuid)` => `{request,days,comments,files,history}` with current private authorization.
- `leave_submit(p_payload jsonb,p_key uuid)` => request. Payload `{type_id,start_date,end_date,half:'full'|'first'|'second',reason,past_explanation,handover,backup_id}`. Half applies only to single-day requests.
- `leave_action(p_request uuid,p_revision integer,p_action text,p_payload jsonb,p_key uuid)` => request. Actions approve/decline/changes/withdraw/resubmit/cancel/accept_cancel/reject_cancel/takeover/comment; payload `{reason}`. Resubmit creates a fresh snapshot from optional request fields in payload; requires balance reservation anew.
- `leave_calendar(p_start date,p_end date,p_department uuid default null)` => `{events:[{id,user_id,name,start_date,end_date,status,label}],holidays:[{date,name,kind,source,review_status}],warnings:[]}`. Range <= 93 days.
- `leave_balances(p_user uuid default null)` => array `{type_id,type_name,period_start,allowance,adjustments,used,booked,pending,remaining}`.
- `leave_insights()` => `{balances,people_away,overlaps,pending_count,average_wait_days,monthly:[{month,days}],unresolved_ncns}` authorized employee/direct-report scope, admins all.
- `leave_settings(p_kind text,p_payload jsonb,p_key uuid)` => saved item. Kinds type/policy/calendar/assignment/adjustment/holiday/department. Policy `{id?,name,year_start:1|4,allowances:[{type_id,days,paid,tracked}]}`; calendar `{id?,name,timezone,weekdays:number[]}` ISO 1=Mon..7=Sun; assignment `{user_id,policy_id,calendar_id,opening_balances:[{type_id,period_start,days}],reason}`; adjustment `{user_id,type_id,period_start,days,reason}`; holiday `{calendar_id?,date,name,kind:'company'|'india_central'|'india_regional'|'india_restricted'|'us_federal',source,review_status}`; department `{department_id,minimum_available}`.
- `leave_incidents()` => incident array; `leave_incident(p_payload jsonb,p_key uuid)` => incident. Payload `{id?,user_id?,date?,expected_period?,action:'record'|'explain'|'confirm'|'correct'|'dismiss'|'convert',reason,request_id?,revision?}`. Convert links an approved request covering the incident date; no extra deduction.
- `leave_register_file(p_request uuid,p_payload jsonb)` => file. Payload `{id,name,path,mime,size}`. Private storage bucket `leave-files`, path `<request UUID>/<file UUID>`. Tables `leave_files` columns `id,request_id,name,path,mime,size`. DB authorizes metadata/storage and restricts updates/deletes. Downloads proxy authenticated Storage download, never persistent signed links.
- Notifications table `leave_notifications`: `id,request_id,recipient_id,actor_id,type,title,body,read_at,created_at`. RLS hides messages when private access is revoked. `leave_mark_notifications_read(p_id uuid default null)` marks own visible leave messages.

HTTP GET `/api/leave-desk/{context,requests,calendar,balances,insights,incidents}`; requests query `view`; calendar query start/end/department; balances query user. POST `/requests` `{...payload,key}`; POST `/requests/[id]/actions` `{revision,action,payload,key}`; GET `/requests/[id]`; POST `/settings` `{kind,payload,key}`; POST `/incidents` `{payload,key}`. Files POST `/requests/[id]/files` multipart file and GET `/requests/[id]/files/[fileId]`.

## Tasks
- [x] Database: add migration and behavior tests covering permissions, ledger transitions, dates, NCNS, snapshots, replay and storage privacy.
- [x] Server: validate typed contracts, implement authenticated routes and private attachment transport, route tests.
- [x] Interface: Overview, calendar month/week/filter, My Leave/detail/actions, approvals, insights, settings and NCNS; sidebar/My Work links.
- [x] Integration: leave notifications in bell/read endpoints; reviewed holiday references for 2026/2027 with source metadata; no entitlements seeded. Maharashtra 2027 remains pending an official source.
- [x] Verification: full tests, lint/typecheck/build, independent review, desktop/mobile verification, preservation-aware rollout preparation. Live integration remains a deployment gate.
- [ ] Release: report deployment state and any remaining acceptance limits accurately. No real policy activation or fabricated employee assignments.

## Execution ledger
- 2026-11-03: Approved specification copied unchanged. Existing isolated helios-admin worktree was clean; new branch codex/leave-desk uses latest locally verified account lifecycle/date fix and rollout docs. No real policy assignments will be generated.
- Fetched current origin/main (6cf4486), moved changes onto codex/leave-desk-v1 based directly on that release; no unrelated commits included.
- RPC additions settled during implementation: approvals view includes authorized historical requests (UI defaults pending); context includes admin holidays/assignments; detail includes permission-filtered task_warnings; balances include tracked and read-only current-period allowance projection after an earlier confirmed opening. No read-side grants or automatic initial opening balances.
- Files persist SHA256 and recover interrupted registration only after fresh authorization and server byte comparison. Unresolved client operation keys survive remounts using actor/endpoint/body-digest scoped session storage; reasons are not stored there.
- Final local validation: 493 tests/80 files, lint, typecheck, webpack production build and compiled proxy check passed. Seven independent native PostgreSQL concurrency checks and four release-preservation checks passed. Independent review fixes rechecked clean. Desktop and actual 390x844 preview checked with fictional fixtures; viewport reset.
- Production read-only preflight: leave tables absent, 51 cards and 11 historical profiles present. Provider DDL event triggers inspected; no production migration or employee assignment performed.

# Helios account management implementation plan

**Goal:** Implement the approved account lifecycle, offboarding preservation and optional employee directory fields.
**Architecture:** Status and operation tables owned by PostgreSQL, privileged Auth/Storage calls only in a bounded server worker, current Admin Team authorization checked both before request and before execution. Historical profiles retain anonymized IDs after Auth deletion. Existing APIs remain compatible.
**Spec:** User-approved plan in this chat, 2026-11-03.

## Global constraints
- All central admins manage ordinary accounts; only owner deactivates/deletes admin or former-admin accounts. Owner and self cannot be deactivated/deleted.
- No real users reset/deleted during QA. No password/token/recovery-link persistence or logging.
- Transfer only to existing active eligible members. Private work remains private. Deletion blocked when no successor is eligible.
- Directory fields optional/admin-managed and independent of user-completed setup.
- Preserve shared work/files/history and exact public maintenance wakeups. Deactivated JWTs must not bypass database or RPC permissions.
- Existing approved publication destination: public wayne15r-hue/project-management-board, main -> Vercel production. Prior worktrees preserved.

## Ownership and contracts
Shared TypeScript interfaces: `src/types/accounts.ts` (controller-owned).

### Task 1: Database authority and preservation
Own migration `supabase/migrations/20261103_z_account_management.sql` and database tests. Add account status, directory, durable operations, audit, profile Auth association, inactive-account authorization across DB/storage/realtime and callable RPCs, eligible transfer preview/execution, delete guard/finalization and provider worker leases.

Authenticated RPCs:
- `account_is_active()` -> boolean (own status, also middleware).
- `account_directory(p_filters jsonb)` -> AccountDirectory.
- `account_save_directory(p_user uuid,p_fields jsonb)` -> DirectoryFields.
- `account_deletion_preview(p_target uuid)` -> DeletionPreview.
- `account_request_action(p_target uuid,p_action text,p_operation uuid,p_payload jsonb)` -> AccountOperation.
- `account_audit(p_query text,p_page integer)` -> AccountAuditPage.
- `account_own_directory()` -> DirectoryFields.

Service-only worker RPCs:
- `account_claim_operations()` -> AccountOperation[] with lease_token (at most 5).
- `account_validate_operation(p_id uuid,p_lease uuid)` -> boolean; fresh actor/target checks; cancel unauthorized operations.
- `account_prepare_delete(p_id uuid,p_lease uuid)` -> `{targetId,avatarPaths:[{bucket,path}]}`; validate snapshot/transfers, transfer shared Storage metadata ownership without changing paths, preserve history. Auth-delete trigger atomically anonymizes profile/deletes employment data and sets deleted state. Before-delete guard requires authorized valid deletion operation and protects owner.
- `account_finish_operation(p_id uuid,p_lease uuid,p_outcome text,p_error text)` -> void; outcomes succeeded/retry/failed/ambiguous; release lease and bounded retries. Deletion cannot be marked succeeded while Auth exists or media cleanup remains. Failed deletion remains inactive/retryable.

Status action payload `{expectedRevision}`; deletion payload `{expectedRevision,confirmationEmail,transfers:{[requirementKey]:uuid|null}}`. Password reset cooldown 60 seconds per target, no automatic replay after ambiguous email request. Deactivation commits inactive state and removes central admin membership/queues call cleanup immediately. Reactivation leaves status inactive until Auth unban succeeded, then activates, never automatically regranting admin membership.

### Task 2: Server and provider operations (controller)
Own `src/lib/accounts/`, `src/app/api/admin/accounts/`, `src/app/api/admin/audit/`, `src/app/api/admin/employees/[userId]/directory/`, `src/app/api/accounts/maintenance/`, recovery callback support, middleware integration and server tests. Extend GET admin employees to account_directory; preserve PATCH employment endpoint.
- POST `/api/admin/accounts/[userId]/reset-password`: `{operationId}`.
- PATCH `/api/admin/accounts/[userId]/status`: `{operationId,action:deactivate|reactivate,expectedRevision}`.
- GET `/api/admin/accounts/[userId]/deletion-preview`.
- POST `/api/admin/accounts/[userId]/delete`: `{operationId,expectedRevision,confirmationEmail,transfers}`.
- PATCH `/api/admin/employees/[userId]/directory`: DirectoryFields.
- GET `/api/admin/audit?q=&page=`.
- POST `/api/accounts/maintenance`: fixed-purpose, request-independent, service-only queue drain; exact proxy exception.
- Worker resolves Auth email from getUserById; resets through Supabase email service, bans/unbans Auth accounts, revokes refresh sessions, drains existing media cleanup and removes personal avatar files via Storage API before Auth deletion. A dedicated implicit-recovery landing route must support recipient browsers without the initiating PKCE verifier.

### Task 3: Admin UI (delegated)
Own existing employee-admin component and new UI files, Settings directory display and UI tests. Consume the above endpoints/types. Account cards/details show metadata, filters, reset/status operations and latest outcome; delete wizard shows requirements, eligible candidates, blocker reasons and typed-email confirmation. New optional directory fields editable even before employee completes original setup. Audit tab paginated/searchable. No private work-content preview, passwords, or reset links shown. Owner-only admin-membership controls remain.

### Task 4: Verification and rollout
Baseline and final full suite, lint, typecheck, build and compiled proxy check; independent per-task and whole-change review; real PostgreSQL concurrency/failure proof; preservation-checked transactional migration then app deployment and scheduler; isolated live provider/email QA only. Keep additive data on application rollback; no full database restore.

## Preflight interface/conflict scan
| Pair/task | Shared interface or constraint | Resolution |
|---|---|---|
| DB/server | RPC names, payloads, operation lease | Exact names/types above; communicate any necessary amendment before editing consumers. |
| DB/UI | AccountDirectory/preview/fields | Shared types; directory fields independent of initial setup. |
| Server/UI | Endpoint payloads and outcome | Exact routes above; report provider acceptance rather than email delivery. |
| DB | Removal vs shared history/Auth FKs | Anonymized profile identity; nullable Auth association; Auth delete guarded and atomic DB finalization. |
| Server | Immediate deactivation vs provider failure | DB deny first; durable Auth/media cleanup; never reactivate until unban succeeds. |
| UI | Admin peer removal vs owner-only delegation | Destructive actions on admins/former admins owner-only; owner/self protected. |

## Progress
- Base origin/main a73da4e; existing isolated worktree helios-admin on new branch codex/account-lifecycle.
- Database, server endpoints, worker, Admin controls, directory, audit and recovery landing implemented.
- Verified 431 tests across 73 files, lint, typecheck, webpack production build, and compiled proxy registration.
- Real PostgreSQL: six independent-connection checks passed (revocation, duplicate submission, exclusive leases, fencing, Auth finalization, replay preservation).
- Independent review found unstarted reset lease loss and inactive-recipient email leakage. Both fixed with regressions; employee IDs and deactivation-first deletion also tightened.
- Ruling: claim one operation per invocation, with a 10-second service-only maintenance gate and explicit provider-attempt marking. This prevents unstarted resets being lost at HTTP deadlines; scheduler runs every minute.
- Ruling: remove employment values from employee audit snapshots during deletion, retaining actor, subject, action and timestamps.
- Production migration/deployment and isolated live QA pending. No real accounts reset/deleted during QA.

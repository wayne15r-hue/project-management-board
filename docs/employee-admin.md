# Employee administration

Central Admin Team membership is independent of project teams and does not confer board, chat, or Service Desk access. The owner alone manages delegated admins. All central admins manage departments and completed employee records.

Every account completes `/employee-setup` once, including existing accounts. Department, job title and an explicit reporting-manager choice are required. Users may select **No reporting manager**. After submission, Settings displays the details read-only; admins edit them through `/dashboard/admin`. Admins cannot submit initial setup on another user's behalf.

Initial departments: Administration, Operations, IT, HR, Finance, Sales, Marketing. Archival prevents new assignments; existing assignments remain readable and editable. At least one department stays active. Self-reporting and reporting cycles are rejected.

## Interfaces

- `GET /api/employee/setup`: own employment record, departments, own admin role and selected manager identity.
- `POST /api/employee/setup`: `{userId, departmentId, jobTitle, managerId}`; `managerId` must explicitly be a UUID or `null`. `userId` must match the verified request identity. Duplicate submissions return 409.
- `GET /api/employee/managers?q=`: up to 25 identities with only ID, name and email.
- `GET /api/admin/employees?q=&page=`: admin-only directory, 25 per page.
- `PATCH /api/admin/employees`: `{userId, departmentId, jobTitle, managerId}`, admin-only edits to completed records.
- `POST /api/admin/departments`: `{id, name, archived}`; `id:null` creates a department.
- `GET /api/admin/members`: current Admin Team.
- `POST /api/admin/members`: `{userId, enabled}`, owner only.

All protected writes execute through authenticated database RPCs. Direct browser writes to employment tables, admin membership, runtime serialization state and audit history are denied. A singleton-row update serializes membership, department and reporting-graph writes, forcing stale repeatable-read writers to abort. Caller permissions are checked after serialization. Unexpected server errors return a generic error.

## Rollout and recovery

1. Apply only `20261103_employee_admin.sql` in a transaction. It is additive and replay-safe, including renamed seed departments.
2. In the same transaction, verify exactly one confirmed `auth.users` account matches `omkar.bahirat1@proton.me`; pass its UUID to `employee_bootstrap_owner`. Do not derive membership from `profiles.email` or signup metadata. This function is deployment/service-role only and logs the bootstrap.
3. Compare counts and full-row fingerprints of all pre-existing public tables before committing. Deploy application only after successful migration/bootstrap.
4. Verify owner membership, signed-in setup, ordinary/admin permissions, and preserved work records. Do not invent real employees' organizational details for testing. Use disposable fixtures and transactional rollback for privileged SQL checks.
5. On application rollback retain the additive schema, employee records and audit trail. Do not restore the entire database or delete employment history.

Local multi-connection proof: `node scripts/verify-employee-concurrency.mjs` (PostgreSQL 17; `PG_BIN` may override the binary directory). Run from repository root; output is placed in sibling `admin-qa`. Automated tests use the existing PGlite fixture.

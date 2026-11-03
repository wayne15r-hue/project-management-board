# LeaveDesk rollout and recovery

This is a prepared operator procedure. Generation and local verification do not deploy the application, write production data, activate policies or assign employees.

## Verified preparation — 3 November 2026

- Branch `codex/leave-desk-v1`, based on current main `6cf4486`.
- 493 tests across 80 files passed, including 25 LeaveDesk database tests; lint and typecheck passed. The production webpack build and compiled authentication-proxy registration check passed. Local Turbopack cannot resolve the existing node_modules junction outside this worktree; CI uses a normal install and the default build.
- Seven independent native PostgreSQL concurrency checks passed: overspending, duplicate submissions, opposing decisions, repeated approvals, manager reassignment, stale repeatable-read reviewers, and migration replay preserving work/history.
- Four native PostgreSQL release checks passed, including forced preservation failure rolling back, clean reference-only seeding, reference replay and refusal to overwrite an existing bucket.
- Independent review findings were fixed and verified: nullable manager authorization, real Storage folder semantics, historical NCNS conversion, holiday correction, retry identity across remounts, orphan attachment recovery, distinct people-away totals, and personal calendar filtering.
- Actual components were checked with fictional read-only fixtures at desktop and 390×844. Page width stayed within the viewport; month/week calendar uses its own horizontal scroll. Accessible labels, keyboard tab movement and retained error input were exercised. This is fixture UI evidence, not live production QA.
- Production read-only preflight found no LeaveDesk tables, 51 cards and 11 historical profiles. Provider DDL event-trigger definitions were inspected; no production writes, real policies or employee assignments were made. Live integration remains pending.
- The generated wrapper/manifest and local logs live in sibling `admin-qa`; screenshots/fixture assets live in sibling `leave-qa`. Regenerate the wrapper after any migration edit.

## Release preparation

Run `node scripts/leave-build-reference-seed.mjs --check`, then `node scripts/leave-prepare-release.mjs` from `helios-admin`. The latter discovers the dated LeaveDesk migration files in filename order and writes `../admin-qa/leave-production-release.sql` and a SHA256 manifest. It does not read environment files or connect to a database. Do not use whitespace-compacted SQL: function bodies, strings and comments must retain their exact contents.

The wrapper follows the existing employee/account release approach but fingerprints all existing public and account-private table rows, Auth users, Storage objects and Storage buckets. It locks these tables inside one transaction, applies the additive migrations, and verifies every original row count and complete-row fingerprint before committing. The one permitted existing-table addition is the new private `leave-files` bucket; its preexistence aborts first-rollout preparation at execution time so an upgrade cannot silently rewrite it. Existing leave tables on a repeated application are also fingerprinted and cannot change silently. Any timeout, SQL error or preservation mismatch aborts the transaction. This protects row data; inspect grants, RLS, triggers and existing function definitions separately because fingerprints do not certify schema compatibility. Large installations may need a reviewed scalable fingerprint strategy and a longer maintenance window.

Read-only tooling inspection on 2026-11-03 found Node available and local PGlite database test infrastructure. No `psql` or Supabase CLI command was found on PATH. The sibling `admin-qa` holds local preview/release artifacts; it is not proof that a production migration has run. No credentials were inspected or printed.

The existing concurrency harness also identifies PostgreSQL 17 binaries at `C:/Program Files/PostgreSQL/17/bin`. `node scripts/leave-verify-release.mjs` uses those binaries (or `PG_BIN`) with a disposable localhost cluster on port 55449. It verifies a deliberately injected unrelated card write aborts and rolls back the schema/bucket, verifies the clean release preserves fixture data, checks reference seeding is idempotent and confirms first-rollout replay is refused. All four gates passed on 2026-11-03; evidence is in `../admin-qa/leave-release-proof.json`. Regenerate and rerun after any migration changes. This fixture proof is independent of live deployment validation.

## Operator sequence

1. Verify a restorable backup and current migration history. Confirm employee administration and account lifecycle migrations are present. Rehearse on a staging copy with the actual deployment roles, storage provider and PostgREST.
2. Review the exact generated SQL and manifest. Run repository tests, lint, typecheck and build, plus the focused concurrency and privacy checks. Preserve their outputs with the release record.
3. Pause writes for a short maintenance window. Apply the generated SQL as a privileged operator with stop-on-error enabled. Record the two migrations in migration history only after successful commit; do not replay older migrations.
4. Deploy matching application code. Confirm schema cache refresh, private bucket configuration, authorized RPC execution and application API behavior. Confirm no calendars, assignments, opening balances or allowances were created for real employees by the migration.
5. Use isolated employee, manager, independent admin and unrelated coworker fixtures for the live checks below. Configure real calendars, policy starts and admin-confirmed opening balances only after those checks pass. Existing employees must not receive a fresh full-year grant by assumption.

## Remaining live validation gate

- Verify concurrent submissions reserve once, stale/replayed decisions do not double deduct, insufficient balances and overlaps fail, and accepted cancellations restore the correct periods.
- Verify current manager reassignment immediately removes the former manager's request/comment/file/notification access. Test independent fallback/takeover, no self-review and no eligible reviewer hold behavior.
- Test first/second half, working-week differences, January/April and cross-year boundaries, timezone midnight, past explanations, calendar/policy changes preserving request snapshots, and calendar reference overlays leaving deductions unchanged.
- Confirm coworker calendar responses contain only “On leave” and dates; pending requests, reasons, files, NCNS and notification bodies remain private through direct API/RPC/storage calls. Test deactivation/deletion preserves history and revokes access.
- Exercise private PDF/JPEG/PNG uploads and downloads including 10 MB limit, unauthorized paths, malformed types, rejected uploads and no persistent public links.
- Verify NCNS correction, dismissal, explanation and linking conversion preserve audit history without duplicate deductions. Check insight totals, approval wait times and authorized scope.
- Check month/week navigation, department filters, forms, request actions, notifications and My Work on desktop/mobile and keyboard. Coverage warnings describe scheduled availability only.
- Compare post-rollout preservation output and retain results. Local tests alone do not prove these live integration outcomes.

## Recovery

If the SQL transaction fails, roll it back and inspect the cause before retrying; do not mark migrations applied. If application behavior fails after a successful migration, roll application code back and retain all LeaveDesk tables, ledger, requests, audit history and private files. Suspend new leave submissions until a forward fix is ready; use the existing independent administrative process for urgent requests. Do not drop tables, erase reservations, change approved allocations, make the bucket public or restore permissive grants as a recovery shortcut. Database restoration discards later writes and requires a separate explicit operator decision and verified backup.

## Holiday source review

The versioned artifact `docs/leave-desk-holiday-references.json` records jurisdiction, year, source, review date/status and caveats. `scripts/leave-build-reference-seed.mjs` generates the additive reference migration and checks reproducibility. Every seeded row has `calendar_id = NULL` and a reference kind; only an explicit admin-entered company holiday on an assigned working calendar may change deductions.

- 2026 Delhi central/restricted: [CAG official list](https://cag.gov.in/en/pages/single/page-defence-new-delhi-holidaylist). The central Muharram row says July 26/Friday, which is internally inconsistent. The seeded June 26/Friday is corroborated by [IIRS/ISRO](https://www.iirs.gov.in/holidaycalender) and [URSC/ISRO](https://www.ursc.gov.in/holidays.jsp), and the artifact records this correction.
- 2027 Delhi central/restricted: [DoPT OM, 16 July 2026, Annexures I and II](https://master-dopt.digifootprint.gov.in/static/uploads/2026/08/2ffd159748162a48c025f7e6ca5807d5.pdf), cross-checked against the [official PFRDA order](https://pfrda.org.in/documents/33652/0/list_holidays_2027.pdf). These are Delhi reference lists; state and regional choices differ. Moon-sighting amendments may change published dates.
- 2026 regional starter: Maharashtra's 24 listed holidays from [MMRDA](https://www.mmrda.maharashtra.gov.in/en/public-holidays), checked against the [state Gazette notification](https://maharashtra.gov.in/site/Upload/pdf/Public-Holiday-2026.pdf). Regional labels retain Maharashtra in their names. No bank-only account-closing day is imported. This starter is not all-India regional coverage.
- 2027 Maharashtra: `pending_official_source`, with no guessed dates. The [Finance Department “2026-27” page](https://finance.maharashtra.gov.in/en/notice/maharashtra-holidays/) ends on January 1, 2027 and does not establish a complete 2027 list. Admins must review/import the actual regional notification when available. Full reviewed 2027 regional coverage therefore remains an acceptance gap.
- US: [OPM 2026 and 2027 observed schedules](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/). The overlay also includes December 31, 2027 from OPM's 2028 schedule because New Year's Day 2028 is observed in the following calendar year window. OPM dates describe the standard Monday–Friday federal schedule; adoption by this company is a separate decision.

“Reviewed” means source comparison for the stated jurisdiction, not an entitlement decision or company adoption. The migration seeds no assumed statutory allowances, regional guesses, policy assignments or company days off.

# Audit fixes implementation plan

> **For agentic workers:** Use the parallel-agent workflow for independent areas, then integrate and verify the complete branch.

**Goal:** Resolve the 28 findings in ../audit/PROJECT_AUDIT.md without accessing or changing production data.

**Architecture:** Keep the existing Next.js/Supabase application. Enforce authorization and atomic destructive operations in PostgreSQL, validate at HTTP boundaries, and make client mutations surface errors and persist deterministic state. Add focused executable regression tests and document deployment prerequisites.

**Tech stack:** Next.js, React, Supabase/PostgreSQL, TypeScript, Vitest and disposable PGlite tests.

**Spec:** The 28 findings, recommended fixes and acceptance checks in the general audit, approved by the user's instruction to fix them as recommended.

## Constraints

- Use the existing isolated local clone on codex/audit-fixes. Do not deploy, merge, apply live migrations or rotate actual secrets in this stage.
- Preserve existing records. Prepare additive hardening migrations; detect inconsistent legacy data and fail with actionable diagnostics rather than deleting it.
- Keep authorized membership workflows working. Test outsider, member and owner boundaries through direct database access.
- Never store fresh expiring URLs as permanent attachment identifiers. Maintain compatibility with legacy links where possible.
- Preserve the existing visual design. Fix behavior rather than redesigning the product.

## Review focus

- Direct Supabase requests must enforce the same permissions as HTTP requests.
- Failed move/delete operations must preserve records and truthful UI state.
- Newly created teams/chats must bootstrap safely without broad client write permissions.
- Legacy attachment data and invalid cross-board rows must have an explicit migration path.
- URL state, OAuth/recovery and cron requests must use distinct appropriate authentication paths.

## Task 1 — Database authorization and atomic operations (01–03, 05–10, 15, 23, 28)

Files: supabase/migrations, tests/database, team API routes and column deletion route.

- [x] Convert audit database examples to failing authorization/transaction tests; run against existing policies.
- [x] Repair fresh-install forward references and add hardening migrations for policies, ownership, integrity, metering and read receipts.
- [x] Add authorized atomic team create/invite/accept and column deletion RPCs; integrate corresponding routes.
- [x] Verify fresh chain and outsider/member/owner operations, failures and retries. Document deployment/data preflight and safe rollback constraints.

## Task 2 — Board state and export behavior (12, 19–22, 26)

Files: board components, table view, board page, board-filters and export route; tests/board.

- [x] Add failing regression tests for stale drag persistence/cancel/errors, invalid URL state, sorting, failed saves and CSV formulas.
- [x] Persist immutable final move state through the card PATCH path, maintain full-board order under filters, and propagate mutation errors.
- [x] Validate/synchronize URL state and open authorized notification target cards. Apply table sorts globally and handle missing-date ties.
- [x] Neutralize spreadsheet formulas in CSV exports.
- [x] Verify focused regressions and nearest lint/type gates.

## Task 3 — Auth, chat and delivery (11, 14, 16–18, 24, 27)

Files: auth pages/callback, Supabase middleware, chat/conversation routes and components, email/cron and avatar configuration; tests/auth-chat.

- [x] Add failing regression tests for callback/cron routing, email rejection, expired-link refresh, pagination and recovery/signup handling.
- [x] Repair authentication flow, cron authentication/selection/preferences and structured delivery errors.
- [x] Store stable chat object paths, sign on read with membership protection, and implement older history loading.
- [x] Implement confirmation-aware signup and password recovery; align avatar size limits.
- [x] Verify focused regressions and nearest lint/type gates.

## Task 4 — Notification boundaries, dependencies and quality (04, 13, 25)

Files: notifications/comments/cards APIs, package manifests, tests/configuration, CI, README and .env.example.

- [x] Add failing tests preventing private notifications to outsiders and mismatched attachment deletion.
- [x] Enforce recipient access at notification boundaries and scope application mutations.
- [x] Upgrade affected runtime packages; remove unused production CLI/SDK dependencies; verify registry results without blind major downgrades.
- [x] Resolve existing lint failures and add reproducible setup, migrations, test commands and CI with dummy build configuration.
- [x] Run all regression tests, lint, typecheck, production build and dependency audit; review diff independently and address findings.
- [x] Deliver changes and per-finding status with remaining live deployment/configuration requirements explicitly distinguished.

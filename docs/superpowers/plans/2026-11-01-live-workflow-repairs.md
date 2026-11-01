# Live workflow repairs implementation plan

> Execute inline with superpowers:executing-plans. The user requested fixing the live QA findings; deployment and live regression checks are in scope.

**Goal:** Make the failed board/task workflows from the live QA report work and persist after refresh.

**Architecture:** Keep existing Next.js components and Supabase endpoints. Add a narrowly scoped, repeatable migration for missing personalization objects. Reuse the authenticated card-creation endpoint from Table view.

**Tech stack:** Next.js 16.4.3, React 19, Supabase PostgreSQL, Vitest/PGlite.

**Spec:** `../QA-live-app-2026-11-01.md` in the parent workspace, and the user's “fix it” request.

## Constraints and review focus

- Preserve existing boards/tasks, owner/team access, quota controls, and prior changes from this chat.
- Do not rerun the broad historical personalization migration against production storage policies.
- Favorites must remain private to their user; new tables must not inherit client TRUNCATE rights.
- Closing a URL-requested dialog must consume only `new`, preserving other parameters.
- Creation must remain reachable in empty/filtered boards and dashboard List view.
- A rejected create keeps input for retry; rejected favorite writes revert their optimistic state.

## Tasks

- [x] Add a PGlite regression reproducing missing `cover_color`/favorites; prove failure, add `20261101_personalization_repair.sql`, prove moves and private/idempotent favorites succeed without losing records.
- [x] Add BoardList regressions for `?new=true`, close/back/reopen, List creation, filtered Grid creation, and failed favorites. Prove failures, implement query-driven opening and stable creation access, and surface rejected writes.
- [x] Add Table regressions for first/subsequent creation, explicit column choice, failure/retry, and board breadcrumb. Prove failures, implement inline creation through the existing endpoint and pass board context.
- [x] Run complete tests, lint, type checking, build, and review the whole change before integration.
- [ ] Apply only the tested additive schema repair, integrate source through a reviewable PR, wait for production deployment, and repeat live QA cases using the retained QA board.

## Execution notes

- Existing working branch contains only this chat's earlier fixes. A dedicated `codex/live-workflow-repairs` branch preserves those changes for integration.
- Ruling: use the existing report as the design/spec. The requested behavior is explicit; no new product design or additional confirmation is needed.
- Ruling: the earlier approved board-policy migration and AI default/test changes stay included so the repository matches the live repairs from this chat.
- Verification: 151 tests passed, lint passed, type checking and production build passed. Initial type checking caught browser-style `exact` options in new Testing Library queries; corrected those test-only options and reran type checking/build successfully. Whole-change independent review found no blocking issues.
- Minor review note: rapid repeated favorites can still race as in the previous implementation. Per-board request serialization is outside the reproduced QA failures; failed writes now visibly revert instead of pretending to persist.

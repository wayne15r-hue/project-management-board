# Helios employee administration implementation plan

**Goal:** Implement the user-approved central Admin Team and one-time employee setup.
**Architecture:** Dedicated RLS-protected employment tables and transactional RPCs; authenticated Next.js handlers and existing UI primitives. No expansion of work-content permissions.
**Spec:** The approved plan in this chat, 2026-11-03.

## Constraints and review focus
- Bootstrap only the confirmed auth account omkar.bahirat1@proton.me by UUID; owner cannot be removed in-app.
- Only owner manages central admins. All employment writes are RPC-only, with current authorization checked inside a serialized transaction.
- Protect concurrent first submissions, reporting cycles, department archival and admin revocation.
- Preserve invitation destinations, account recovery, ordinary profile settings, and existing work records.

## Tasks
1. Database authority: write failing database tests; add replay-safe migration, RLS, serialized RPCs, verified service-role bootstrap and change log; run tests.
2. Server interfaces and routing: test input validation and setup redirects; add typed endpoints and server guards; verify unauthorized and incomplete-account cases.
3. UI: add employee form, read-only Settings section and Admin page with people, departments and owner-only Admin Team management; verify accessible desktop/mobile interactions.
4. Verify and release: full tests, lint, typecheck, webpack build; independent whole-diff review; transactional production migration/bootstrap with preservation proof; push, CI, merge/deploy; isolated production QA.

## Execution record
- Base: origin/main bb87c0c, including Service Desk. Isolated branch codex/employee-admin in sibling helios-admin.
- Native managed-worktree creation rejected the nested repository path; used ordinary Git worktree inside the authorized workspace.

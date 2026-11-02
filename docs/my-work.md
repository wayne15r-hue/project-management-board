# My Work and Needs Attention

`/dashboard/my-work` keeps All Boards as the login destination. My Work shows open assignments; Needs Attention shows overdue/blocked assignments plus overdue/blocked cards on boards the viewer owns. Existing board access policies apply to rows, counts, board options and editor writes.

## Query and date contract

Authenticated `GET /api/my-work?tab=mine|attention&board=<optional uuid>&search=<title>&timezone=<IANA zone>&page=1` returns 50 items and full filtered counts. Filtering/counting/paging happen inside the security-invoker `my_work` RPC, avoiding the REST row limit. Search is a literal case-insensitive title substring. Sort: due timestamp ascending/null last, high/medium/low, UUID. Tabs/filters reset paging. Counts include all matching pages; a card can contribute to both Overdue and Blocked.

The browser supplies its timezone; invalid/missing zones use UTC. Past local calendar dates are overdue, today is Due Today, all future dates are Upcoming. Completion follows the reminder convention: trimmed case-insensitive Done/Completed, or final column when at least two columns exist (position/UUID deterministic). Existing dashboard/reminder calculations are unchanged.

Blocked writes require a trimmed 1–500 character reason. Unblocking clears it. A database trigger enforces this even for direct client writes and records blocked/reason-change/unblocked activity in the same transaction. Combined moves use the existing transactional RPC. Recurring copies explicitly start unblocked. Existing clients need not send new fields.

## Deployment

1. Review `supabase/migrations/20261102_my_work.sql`, run the full suite, lint, typecheck and build. Rehearse with the disposable PostgreSQL tests, including injected failure rollback/replay.
2. Record production cards/boards/columns counts and a fingerprint of existing card fields. Preflight on 2 Nov 2026: 36 cards, 15 boards, 59 columns; card fingerprint `01f775eddcf3871b50e0878cc3f74940`; blocked columns absent.
3. Apply only the new migration as one transaction before deploying dependent code. It adds fields/triggers and replaces the move RPC with compatible defaults; requests a PostgREST schema refresh. Verify unchanged counts/fingerprint, all existing tasks unblocked, expected RPC grants and new columns.
4. Deploy reviewed branch through the normal GitHub/Vercel process. Verify production commit/checks.
5. Use isolated QA boards/tasks and two user-owned accounts. Verify assignments, owned-board attention, search/filtering, local-day buckets, completed exclusion, block/edit/unblock history, refresh persistence, editor links, keyboard operation and narrow viewport. Existing tasks stay read-only.

## Recovery

A failed migration rolls back completely. For an application regression, redeploy the preceding application commit and retain the additive migration: legacy requests continue to work. Do not drop the fields or restore a full database automatically; those actions could discard new blocked history or intervening user work. No destructive down migration is included.

## Boundaries

Pending approvals, escalation and automation are deferred. Lists refresh after successful edits, on focus/visibility restoration and at 60-second intervals while visible. User identity scopes query caches; account changes unmount private UI and cancel/remove those requests/results. Database access is rechecked on each request. The feature does not provide immediate cross-tab revocation of data already displayed; subsequent refreshes remove inaccessible results.

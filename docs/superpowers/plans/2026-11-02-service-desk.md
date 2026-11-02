# Internal Service Desk implementation

Approved spec: user-supplied Internal Service Desk plan in this chat, 2026-11-02.

1. Database authority: team-scoped private tickets, agents, revision-bound approvals, transitions, idempotent operations, audit, notifications, private storage. Prove with database permission/lifecycle/replay tests.
2. Authenticated APIs: list/count/filter/pagination, team context/agents, creation, details/actions, uploads and authorized download proxy. Validate HTTP inputs and error contracts.
3. Responsive UI: sidebar, requests/queue/reviews, request forms and detail/actions/history/files/settings; separate My Work blocks and merged notification bell.
4. Verification: regression/lint/typecheck/build, independent review, database concurrency/replay/rollback and preservation evidence, isolated browser QA; schema before application rollout.

Rulings/defaults: existing linked worktree reused on codex/service-desk from origin/main. Private storage inherits existing 10 MB/no MIME restriction but forces attachment downloads; downloads are authenticated proxies so membership revocation is effective immediately. No email or timed ticket reminders. Comments are shared with all authorized ticket participants. Attachments are material request content and invalidate approval. Fulfillment requires a current support assignee. Reopening returns to triage and invalidates prior approval. No destructive ticket deletion.

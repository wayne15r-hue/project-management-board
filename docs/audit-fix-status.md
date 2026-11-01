# Audit fix status

All 28 findings have implementation changes in this branch. This is not a claim that the live deployment is repaired: no production SQL or application deployment has been performed.

| ID | Priority | Finding | Implementation |
|---|---|---|---|
| 01 | Critical | Private attachments and labels are accessible across accounts | Board/card membership policies for labels, metadata and storage; explicit private buckets; scoped attachment deletion. |
| 02 | Critical | Users can join private chats and grant themselves admin rights | Server-managed chat membership/admin fields; read-state-only client updates. |
| 03 | High | Legacy API-key column is readable by every signed-in user | Column privileges hide preserved legacy secrets; application selects safe fields explicitly. |
| 04 | High | Locked dependencies include critical security advisories | Next.js 16.4.3 and compatible dependency updates; unused SDK/CLI removed; production audit zero. Development-only minimatch advisories remain. |
| 05 | High | Board collaborators can take ownership | Ownership-change trigger blocks takeover through direct updates. |
| 06 | High | Deleting a column can delete its cards when relocation fails | Transactional delete_board_column RPC with rollback tests and preserved destination ordering. |
| 07 | High | Cards can reference columns belonging to another board | Composite board/column and card/label foreign keys, preserving existing relationship names. |
| 08 | High | Team permissions recurse and team creation cannot bootstrap | Nonrecursive team helpers and atomic team bootstrap. |
| 09 | High | The migration chain fails on a fresh database | Fresh helper order corrected and actual migration chain tested. |
| 10 | High | Invitation authorization and acceptance lifecycle are incomplete | Admin-authorized invite creation and auth-email-bound atomic/idempotent acceptance with expiry/resend handling. |
| 11 | High | Google sign-in callback is redirected before session exchange | Exact callback exemption, internal destinations and session-preserving routing. |
| 12 | High | Kanban drag operations persist stale state and skip business logic | Immutable canonical moves/cancellation; atomic move+metadata RPC, checked persistence, activity and recurrence route integration. |
| 13 | High | Mentions can disclose private card content to nonmembers | Fail-closed actor/recipient/card access boundary for notifications and current-recipient checks for reminders. |
| 14 | Medium | Scheduled reminders are blocked and ignore notification preferences | Bearer-authenticated cron path, nonempty secret, opt-outs/completion exclusion, UTC pagination and provider idempotency. |
| 15 | Medium | Comment editing and deletion have no database permission | Author/current-board-access update/delete policies, only changes column editable. |
| 16 | Medium | Email provider rejections are treated as successful sends | Provider error checking, verified sender configuration, truthful send counts and invite share-link fallback. |
| 17 | Medium | Chat attachments stop working after seven days | Stable chat object paths and authorized signing on read, including safe legacy conversion. |
| 18 | Medium | Chat history older than 50 messages is inaccessible in the UI | Cursor history pagination, scroll preservation and database summaries/unread counts. |
| 19 | Medium | The card editor can display Saved after a failed write | Propagated failures, error/retry status, retained drafts and checked optimistic deletion. |
| 20 | Medium | Notification and email links do not open their target card | Authorized target-card lookup/dialog for all views, preserving unrelated query parameters. |
| 21 | Medium | Malformed filter URLs crash the board | Bounded URL schemas and navigation synchronization. |
| 22 | Medium | Table sorting is not global and missing dates break tie sorts | Global table sorting and explicit missing-date ties. |
| 23 | Medium | Users can reset their own AI usage quota | Read-only client metering and atomic service-only quota reservations across all provider paths. |
| 24 | Medium | Signup confirmation and password recovery are incomplete | Confirmation-aware signup and password recovery/update pages with safe redirects. |
| 25 | Medium | Quality gates and reproducible setup are missing | Focused PostgreSQL, route and UI regressions; lint fixes, CI, README and environment template. |
| 26 | Medium | CSV export does not neutralize spreadsheet formulas | Spreadsheet formula literal policy applied by CSV exporter. |
| 27 | Low | Avatar upload advertises 3 MB but storage allows only 2 MB | Consistent 2 MB allowed-image limits in settings/API/storage. |
| 28 | Low | Live read receipts lack the required Realtime publication | Conversation membership Realtime publication plus access controls. |

## Evidence and remaining rollout work

The suite exercises isolated PostgreSQL policies/functions, actual route handlers with controlled service boundaries, and React components. It includes failing-write rollback, outsider/member/owner boundaries, malformed URL state, combined move failures, chat history and auth lifecycle cases. Final local verification: 135 tests passed across 21 files; lint passed with zero errors and warnings; TypeScript passed; Next.js 16.4.3 production build passed using dummy public Supabase values. Production npm audit reported zero vulnerabilities. Independent review identified two integration defects (cron recipient access and partial combined moves); both were fixed and re-reviewed with regression proof.

Production dependency audit: zero reported vulnerabilities after upgrades. Full audit still reports 16 moderate development-only ESLint/minimatch findings, requiring upstream-compatible lint-stack updates; npm's proposed obsolete-version downgrades were intentionally rejected. No high or critical advisories remain in either audit.

Before release, follow [database rollout](database-rollout.md) and [setup](../README.md). Verify live schema/grants, PostgREST response relationships, two real accounts, provider credentials/callback settings, true concurrent connections, Realtime delivery and real emails in staging. Inspect/rotate any actual legacy keys without logging them. Already-issued signed file URLs survive until their expiry.

The reminder system uses UTC and Done/Completed names and terminal-column completion semantics (boards with at least two columns); idempotency uses the provider's 24-hour window, not a permanent outbox. Google Fonts must be reachable during build.

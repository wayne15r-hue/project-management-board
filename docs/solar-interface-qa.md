# Helios Solar interface and identity controls — local delivery

Implemented on `codex/helios-solar-identity`, based on `d2d9bb8`, following the user's 4 November 2026 approval of the design and mockups. Production deployment, production migration and email activation were not performed.

## Delivered

- Shared ivory/amber and navy/cream themes, accessible focus and touch controls, reduced motion and robust sans-serif fallback. Existing Light/Dark/System preference storage is retained. Reviewed boards, My Work, Service Desk, LeaveDesk, Settings, employee administration and shared dialogs through actual client components.
- Two-step email/password login with local email-format validation, Change email, password visibility, password-manager fields and existing safe redirect/recovery/conditional Google behavior.
- Refined chat list/composer, Solar avatars and gallery, speaking/mute indicators and existing presentation focus. Conversation history/details/deletion and authorized participant moderation are in More menus. Board-conversation deletion is retained. Device/sharing options are in a keyboard-accessible popover; healthy calls do not show Enable sound or Reconnect. Stop sharing stays outside the minimized gallery.
- Four bundled, original six-second tunes: Dawn Chimes, Warm Keys, Soft Marimba, Orbit Bells. Recipient Settings provides Preview/Stop, volume and Silent. Preferences are scoped to signed-in user and browser. Incoming playback has priority over previews. Browser Web Locks prevent duplicate ringing across tabs and release on terminal state/unmount. Known 401/403 loss clears call data immediately; stalled polling also suppresses ringing. No tone enters LiveKit media tracks.
- First/optional last names on signup and one-time setup, preserving existing nonempty full_name values exactly. Settings names are read-only. Central owner/admin corrections use an authenticated API and database authorization, are audited, invalidate identity-bearing client queries and refresh server views. Existing account-deletion anonymization also clears structured names and name-correction audit payloads.

## Verification

| Gate | Status | Evidence and limits |
|---|---|---|
| Baseline | Passed | 517 tests / 84 files before implementation. |
| Final behavioral suite | Passed | **541 tests / 88 files**; logs under `.superpowers/sdd/helios-solar-identity/`. |
| Lint and TypeScript | Passed | `npm run lint`, `npm run typecheck`. |
| Production webpack build | Passed | `npm run build -- --webpack`, using CI-equivalent nonsecret public placeholders. No production configuration loaded. |
| Compiled authentication/setup proxy | Passed | `node scripts/verify-proxy-build.mjs`; the build registers the proxy. Name gates also have request-level regressions. |
| Built Next.js route/login smoke | Passed | On loopback with placeholder configuration: login/signup 200, private dashboard/name setup redirect to login with destination preserved, identity APIs reject anonymous requests with 401, ringtone asset 200. Actual built mobile two-step login preserves the typed password and has no overflow/runtime errors. |
| Default Turbopack build | Failed locally | Worker exits before its local connection starts while processing existing `landing/solar.css`; reproduced with complete CI-equivalent placeholder environment and outside the sandbox. Webpack succeeds. Do not claim default-builder/CI success. |
| Identity migration preservation/replay | Passed | PGlite upgrade/replay plus disposable native PostgreSQL comparisons preserved rows across **73 existing tables**, excluding only the two additive profile columns. Existing display names were not rewritten. |
| Identity concurrency | Passed | Independent native PostgreSQL sessions: exactly one initial-name winner; admin revocation rejects a waiting correction. Direct writes still fail after deliberately broadening column grants in the disposable DB. |
| Deletion compatibility | Passed | Existing authorized-deletion test now initializes structured names, then verifies Deleted user, cleared first/last names, cleared correction payloads and retained work. |
| Responsive layouts | Passed locally | Nine screens × two themes × 360/390/768/1024/1440 pixels = **90 checks**, no horizontal overflow. Actual client components, fictional fixtures. |
| Accessibility | Passed automated scans | **36 axe WCAG A/AA scans**, mobile and desktop in both themes; zero violations. Manual screen-reader behavior remains untested. |
| Keyboard / mobile navigation | Passed locally | Real menus: Escape/focus return; call device popover; mobile conversation list/back; minimize/expand. |
| 200% / reduced motion | Passed equivalent layout | All nine screens checked at 720px, equivalent layout viewport to 1440px at 200%; reduced-motion preference enabled. Physical-device/browser-chrome zoom behavior is not certified by this equivalence. |
| Ringtone files and playback | Passed locally | Four WAVs decode/play/stop in Chrome; saved tune/volume survives reload; Silent keeps invitation without creating audio. No subjective listening claim. |
| Two-tab ownership | Passed in real Chrome tabs | One loop owner; Accept stops/releases; waiting tab acquires; Decline stops. Incoming ringing cannot be preempted by Settings preview. |
| External requests/devices during fixture preview | Passed isolation | No external requests in browser evidence. Microphone/camera/screen capture are disabled; LiveKit is replaced only in the explicitly separate fixture harness. |
| Independent review | Addressed | Three important findings fixed with RED→GREEN regressions: board administrative action visibility, immediate known-authorization-loss cleanup and preview/ringing arbitration. Fallback playback state also corrected with a regression. |

Evidence: [browser layout/accessibility proof](../../output/helios-solar-implementation/browser-proof.json), [browser interactions](../../output/helios-solar-implementation/browser-interactions.json), [PostgreSQL proof](../../output/helios-solar-implementation/migration-concurrency-proof.json), [built application smoke](../../output/helios-solar-implementation/production-local-smoke.json). Screenshots and logs are in the same sibling output directory and the ignored task ledger directory.

## Historical QA reconciliation and remaining prerequisites

Historical rollout records are evidence of their release points, not proof of this undeployed branch. Local frontend fixtures do not close live authentication or binary-storage checks.

| Historical gap | Current classification | Evidence or prerequisite |
|---|---|---|
| Service Desk had not been migrated/deployed in its initial implementation note | Superseded historical prerequisite | Later Service Desk rollout records describe a merged/migrated release. Its final requester/support/approver browser acceptance and private binary transport are still **awaiting an authorized migrated test environment and isolated accounts**. |
| Approvals / notification requester-reviewer flow and mobile layout | Previously passed for released version; current local regressions passed | Later workflow rollout records show browser requester/reviewer and notification deep-link checks. This branch's 541-test suite includes workflow/database regressions; new end-to-end browser sessions against a migrated backend remain **awaiting that environment**, rather than treated as newly passed. |
| LeaveDesk live QA awaiting migration in initial implementation note | Superseded in part | Later LeaveDesk rollout records include nine rollback-only live database gates and actual 390px calendar. They did not use real file bytes or separate employee/manager browser sessions. |
| LeaveDesk private upload/download and current-manager revocation | Database/route regressions passed; binary browser transport awaiting prerequisite | Requires a migrated test backend with private Storage, separate authorized identities and synthetic file fixtures. No production file was uploaded here. |
| Account administration true mobile viewport | Passed local fixture layout; live acceptance remains open | Real components now checked at 360/390 px and admin correction form exercised with fixture transport. This does not certify production provider operations. |
| Account recovery / password email | Automated routes and account lifecycle passed; inbox awaiting prerequisite | Requires isolated account/recovery email access. No email was sent. |
| In-app notifications versus outbound email | Preserve historical distinction | Workflow rollout reports in-app delivery/scheduling checks. Email activation remains outside scope; historical missing sender configuration was not changed or rechecked against production. |
| Old chat account-switch / unread / reaction reliability findings | Covered by current automated regressions; historical live observations retained | Current suite includes session-boundary, history/recovery/reliability and authorization tests. Historical normal-order success does not certify controlled races or physical-device behavior. |
| Physical audio/video, separate networks and mobile background behavior | Awaiting assisted session | Requires physical devices/accounts/networks; not substituted by room mocks or file playback. |
| Concurrent presentations, six-person performance, readability, subjective listening and tab-audio isolation | Awaiting assisted session | Requires real media capture and participants. Existing production feature-flag activation does not close these checks. |
| Maharashtra 2027 regional holidays | Awaiting official source | Historical LeaveDesk reference-source gap remains; this interface change adds no guessed holidays. |

## Migration and rollback

Apply `supabase/migrations/20261104_solar_identity.sql` only in an explicitly authorized environment before deploying the dependent application. It adds nullable columns, narrow authenticated functions and a write guard; it makes no bulk identity update and drops no data. A failed SQL transaction rolls back atomically. Replay is tested. Old clients' full_name-only signup metadata remains supported.

For an application rollback, retain the additive columns, names, audit history and compatible deletion function. Older Settings clients will receive a denied self-rename; do not broaden grants to hide that denial. Restoring self-rename would be a separate security-policy rollback, requiring explicit approval. Never restore a whole database or drop identity/account history. Native test clusters were stopped and retained only as disposable local evidence.

## Running the local preview

From the feature checkout, run `node scripts/solar-preview.mjs` and open `http://127.0.0.1:4320`. It imports real components with clearly labeled fictional API fixtures. It is an interaction/layout preview, not an authenticated Supabase environment. Settings offers tune auditions and a simulated incoming call; account corrections affect only in-memory fixture data. No accounts, messages, live calls, emails, devices or production data are accessed.

With the application configured against a separately authorized migrated development backend, the ordinary Next.js application can be started with `npm run dev -- --webpack`. The preview does not alter its auth or media implementation.

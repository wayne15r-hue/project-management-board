# Helios Solar Interface and Identity Controls Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline implementation after the visual-review checkpoint. Steps use checkboxes for tracking.

**Goal:** Apply the approved Solar interface and identity rules, with four selectable free incoming-call tunes.

**Architecture:** Retain Next.js, Supabase and LiveKit. Keep identity authority in database transactions; keep ringtone playback in the persistent call provider, independent of microphone/presentation media. Reuse existing components, theme preferences, authorization and account-session boundaries.

**Tech stack:** Existing React 19, Next.js 16, Tailwind, Lucide, Supabase SQL/RPC, LiveKit, Vitest/PGlite and browser verification.

**Spec:** `../specs/2026-11-04-helios-solar-identity.md`. Source supplied by the user in Downloads. Implementation paths are relative to this repository. Base inspected at `d2d9bb8`; implementation is on `codex/helios-solar-identity`.

**Delivery status:** Implemented locally after user approval of mockups on 4 November 2026. See `../../solar-interface-qa.md` for evidence, historical QA reconciliation, builder limitations and prerequisite-dependent checks. No production actions performed.

## Global constraints

- Preserve existing nonempty display names exactly; never infer structured names by splitting them.
- First name required, surname optional; support Unicode names.
- Owner and central administrators alone may correct names; board/chat admin status confers no authority.
- Preserve theme choice, private data access, auth redirects/recovery, message reliability and media-session continuity.
- Keep Stop sharing available while minimized. Show contextual recovery controls only when applicable.
- Ringtones play on the receiving user's speaker output only, never in published LiveKit tracks.
- Production deployment, production migration and email-service activation remain outside scope.
- Read repository AGENTS.md and the relevant installed Next.js guides before product changes.

## Review focus

1. Legacy accounts with an existing name but no structured names must retain the exact visible name.
2. Two concurrent one-time name submissions must produce one atomic success, with no rename bypass.
3. OAuth metadata refreshes and direct database writes must not overwrite protected identities.
4. Ringtone ownership, account switching and stale polling must not produce duplicate or orphaned audio.
5. Mobile/keyboard navigation and minimizing must not remount the active LiveKit session or hide Stop sharing.

## Stage 1: Visual review and tune auditions

- [x] Build standalone login, chat, call and Settings mockups in light/dark with responsive/mobile layouts and More menus.
- [x] Generate four original six-second WAV tune candidates, regeneration source and provenance/use terms.
- [x] Implement preview-only tune selection, volume, playback, looping and accept/decline cleanup with fictional data.
- [x] Run 40 layout checks at 360/390/768/1024/1440 px, eight axe scans, 200% CSS zoom overflow checks, keyboard/mobile controls and four audio-decode/playback checks. Evidence: `verification.json`.
- [x] User approved proceeding after the mockups/tunes were delivered. Subjective listening is not independently certified.

The preview implements local simulated controls only. It does not prove product identity enforcement, account-scoped preferences, multi-tab ownership or actual media-session behavior. Camera-on appearance is represented by a state toggle; no camera is accessed. Device and sharing menus show proposed placement, not real selectors.

## Stage 2: Shared Solar styling and two-step login

**Modify:** `src/app/globals.css`, `src/components/shared/`, `src/components/ui/`, `src/components/auth/auth-branding-panel.tsx`, `src/app/(auth)/login/page.tsx` and the existing auth layout. Retain `src/app/(auth)/redirect.ts` as the redirect validator.

- [x] Pin login regression cases: step one accepts a syntactically valid unknown email without an account lookup; invalid email stays on step one; Change email restores its value; password visibility preserves the typed password and autocomplete; sign-in/OAuth preserve safe redirect and recovery behavior.
- [x] Run the focused tests and record failures before implementation.
- [x] Implement a client-only step state around existing auth calls; preserve configured Google gating, paste and password-manager support. Reuse existing BrandLogo.
- [x] Apply reviewed light/dark tokens and shared spacing/focus/menu styles. Inspect dashboard, boards, My Work, Service Desk, LeaveDesk, employee administration, Settings and dialogs; remove redundancy only where no useful workflow information is lost.
- [x] Run focused auth/component tests, typecheck and lint; inspect representative screens at specified widths before proceeding.

## Stage 3: Chat, persistent calls and ringtone lifecycle

**Modify:** `src/components/chat/{chat-shell,conversation-list,message-thread,message-input}.tsx`, `src/components/calls/{call-provider,call-room,video-preview}.tsx`, existing `audio-room.tsx`, and `src/components/settings/settings-form.tsx`.

**Create:** `src/lib/calls/ringtones.ts` (fixed catalog, validation, account-scoped preference serialization), `src/components/calls/use-incoming-ringtone.ts` (single-player lifetime and cross-tab lease), `src/components/settings/ringtone-settings.tsx`, and `public/audio/ringtones/*.wav` copied from the reviewed candidates with provenance.

**Interfaces:** `RingtoneId = 'dawn-chimes' | 'warm-keys' | 'soft-marimba' | 'orbit-bells' | 'silent'`; `RingtonePreference = { tune: RingtoneId; volume: number }` where volume is 0–100. `useIncomingRingtone({userId, incomingCallId, eligible, preference})` returns `{blocked: boolean, enableSound: () => Promise<void>}`. A null call ID or false eligibility stops and releases ownership. Do not tie real ringing to the Settings component lifetime.

- [x] Pin regression tests for no incoming invitation/no sound, all four selections, Silent/zero volume, invalid stored settings, exactly one active preview, blocked/rejected play recovery and cleanup after every terminal invitation state.
- [x] Test account A to B switching and sign-out, duplicate tabs, lease expiry/closure and stale-status shutdown. Verify that a recipient already in a joined call does not get full ringing; no autoplay loops retry without a user gesture.
- [x] Pin call controls, mobile conversation-list/back behavior, keyboard menus and live-session identity across navigation/minimize/expand. Check capture cancellation and sharing indicators without changing the existing authorization rules.
- [x] Run focused failures, implement catalog/player/settings, then integrate once at CallProvider's persistent lifetime. Save preferences by user ID, listen for changes, clamp volume, and retain invitation visuals when sound cannot play.
- [x] Implement the reviewed gallery, speaking/mute indicators, presentation area and More menus. Read actual connection/playback state for Enable sound/Reconnect. Keep Stop sharing visible in minimized presentation state.
- [x] Rerun focused `tests/auth-chat/` and new ringtone tests, lint and typecheck. Browser-test tune loading, control states and zero unintended device access.

## Stage 4: Initial name setup and administrator corrections

**Create:** `supabase/migrations/20261104_solar_identity.sql`, `src/lib/profile/name.ts`, `src/app/api/profile/name/route.ts`, `src/app/api/admin/employees/[userId]/name/route.ts`, and a shared name form.

**Modify:** signup/setup routes and forms, setup gating/proxy helpers, `src/components/settings/settings-form.tsx`, employee administration/details and the existing account-deletion SQL function through an additive migration. Use the actual current deletion function from `supabase/migrations/20261103_z_account_management.sql`; never patch only its old source file.

**Contracts:** Initial authenticated POST accepts `{firstName: string, lastName?: string}` and atomically initializes only an eligible nameless account. Admin PATCH takes the same shape and target path ID; authority is checked in the database. Responses: 401 unauthenticated, 403 unauthorized correction, 409 already initialized/raced, 400 invalid names. Reuse existing employee error mapping and current account authority.

- [x] Pin PGlite/database tests for first/optional last Unicode names, existing display-name preservation, same-account setup races, completed employee setup with missing name, direct Supabase write denial, Auth metadata attempts, board/chat admin rejection and successful audited central-admin/owner correction.
- [x] Pin deletion tests: retain required anonymized full_name while clearing structured names; prevent audit payloads from reintroducing names through deletion views. Verify standard avatar/notification updates still work.
- [x] Run focused tests to establish failures. Implement nullable additive structured columns, validated transactional initial/admin functions, authenticated execution and trigger/privilege enforcement. Preserve existing nonempty full_name values byte-for-byte.
- [x] Wire signup and one-time setup without making employee setup completion a bypass. Make Settings name read-only; add authorized admin correction with audit/identity refresh through existing query refresh patterns.
- [x] Rehearse migration upgrade, replay and rollback/preservation locally using existing database harness. Snapshot existing rows and confirm only intended additions/authorized fields change. No production database access.

## Stage 5: Integrated verification and local handoff

- [x] Reconcile historical rollout gaps individually as passed, failed or awaiting a named prerequisite, citing new evidence only where actually reproduced.
- [x] Run suite, lint/typecheck, builders, compiled-proxy and migration gates. 541 tests/88 files passed; webpack production build passed. Default Turbopack failed at local worker startup, explicitly recorded in QA report.
- [x] Browser-check login and all reviewed application areas in both themes at 360/390/768/1024/1440 px, 200% zoom, reduced motion, keyboard menus and accessibility scans.
- [x] Complete available local automated/fixture checks and classify missing prerequisites in the QA report. Real separate-identity workflows/private binary transport/recovery inbox checks await an authorized migrated test environment; these are not claimed passed.
- [x] Keep physical-device/network calls, concurrent presentations, six-person performance, subjective listening, tab-audio isolation and inbox-dependent checks open for the later assisted session.
- [x] Deliver local product preview, migration preservation/rollback evidence, verification logs and reconciled QA report. Stop before production actions.

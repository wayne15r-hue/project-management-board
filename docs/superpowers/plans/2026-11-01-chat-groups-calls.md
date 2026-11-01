# Chat, Groups, and Calls Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the audited chat defects, complete group management, then add one-to-one audio and group audio in that order.

**Architecture:** Keep the existing Next.js/Supabase application. Enforce membership and ownership in database policies/RPCs, with small route handlers and existing React chat components. Use a media service for audio, with server-issued room-scoped tokens after membership checks.

**Tech Stack:** Next.js 16.4.3, React 19, Supabase PostgreSQL/Realtime, Vitest/PGlite; LiveKit proposed pending provider preference.

**Spec:** The audited behaviors and recommended sequence approved by the user; detailed evidence is in `../Chat-audit-and-calls-readiness-2026-11-01.md` relative to the repository root.

## Global Constraints

- Preserve existing chats and unrelated board/task behavior. All live writes for verification use the two user-owned accounts and QA data.
- Keep secrets server-side. No paid service signup or credential creation without the user completing required setup.
- Work on `codex/chat-groups-calls`, preserving the previous repair branch and commit.
- Regression tests must fail for the reproduced behavior before implementation, then pass. Run focused tests, full suite, typecheck, lint, build, and review before release.
- Ship and verify each stage before advancing. Calls must not be represented as live-tested until two-account media tests actually pass.

## Review Focus

- Removed members cannot read, react, manage a group, join presence, or obtain call access.
- Failed HTTP requests and network failures retain text and files; late responses cannot change another conversation.
- Own realtime echoes do not invert reaction state; reconnects cannot silently lose history.
- Read state changes only for visible messages and clears both navigation and conversation unread indicators.
- Concurrent group admin changes preserve a final administrator; call joins and hangups are idempotent and authorized.

## Task 1: Chat reliability

**Files:** `src/components/chat/{message-input,message-thread,chat-shell}.tsx`, `tests/auth-chat/reliability.test.tsx`.

- [ ] Turn the isolated HTTP failure/reaction diagnostics into failing regression assertions for retained drafts/files and idempotent reactions.
- [ ] Add failed network, successful send, late-response, and read-update tests; implement at the owning layer.
- [ ] Refresh list unread state on successful reads and membership updates. Handle hidden/scrolled-away reads and reconnect recovery.
- [ ] Run focused component/history tests and the full suite.

## Task 2: Chat authorization and session safety

**Files:** a new additive migration, database authorization tests, typing subscriptions, dashboard auth boundary.

- [ ] Prove outsiders cannot insert reactions and members cannot delete another user's reaction; replace the broad policy with separate ownership/membership policies.
- [ ] Enforce private typing channels with conversation-membership policies on `realtime.messages`; test policies with a disposable realtime schema fixture.
- [ ] Add group input validation at API/RPC boundaries. Clear stale identity and conversation state on account changes.
- [ ] Run database/component tests and integration gates, review, apply migration, and verify the chat release with QA accounts.

## Task 3: Group management

**Files:** group management RPC migration; conversation routes; `group-details-dialog.tsx`; new-conversation dialog; chat types and focused route/database/component tests.

- [ ] Test admin rename/add/remove/promote/demote, ordinary-member leave, outsider denial, final-admin protection, invalid IDs/names/member bounds, and concurrent changes.
- [ ] Add a named-group option for two-person QA groups as well as larger groups; validate names and member counts in server and database.
- [ ] Expose members/roles and separate Leave from Delete; update both accounts through realtime without stale access.
- [ ] Run gates, review, release, then verify a QA group using only the user-owned accounts.

## Task 4: One-to-one audio

**Files:** call schema/RPCs, call routes/token service, chat call controls and incoming-call UI, focused lifecycle/token/component tests.

- [ ] Test caller/recipient membership, ringing/accept/decline/cancel/busy/ended states, stale calls, and idempotency.
- [ ] Add audio-only transport with server-scoped participant tokens, mute/device/permission/reconnect states, and call history.
- [ ] Validate service configuration without exposing secrets; complete user-owned provider setup if needed.
- [ ] Run all gates, review, release, and verify with both accounts and explicit microphone access.

## Task 5: Group audio

**Files:** extend authorized call joins and existing audio UI, with participant roster and moderation tests.

- [ ] Test member-only joining, removal during a call, participant leave, final hangup, and admin moderation.
- [ ] Add group join/leave, participant list and active-speaker state using the same media service.
- [ ] Run gates, review, release, and perform the available live group checks. Flag any checks requiring a third account/device as unverified.

## Progress

- Setup: clean baseline at `21f8971`; new branch created. Existing audit reproductions and live evidence retained outside the repository.
- Provider: user selected LiveKit. Video/screen sharing and optional extra chat features are later scope, not part of this audio sequence.
- Chat stage: 168 tests pass, lint/typecheck pass, production Webpack build passes with the same synthetic public settings used by CI. Default local Turbopack fails to launch its CSS worker; Linux CI will verify the normal build.
- Chat review: two Important races reproduced RED then fixed GREEN: recovery checkpoint must not advance on individual sends/events, and reaction toggles are serialized per message/emoji. Read receipts wait for contiguous recovery. No known blocking review finding remains for this stage.
- Implementation proceeds in the approved order. Releases require their corresponding database migration and browser QA; local checks alone are not production verification.

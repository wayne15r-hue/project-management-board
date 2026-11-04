# Video calls and screen sharing implementation plan

Approved specification: `../specs/2026-11-04-video-sharing.md`.

Architecture: retain the database call lifecycle and dashboard provider; extend source-specific token grants and mount one persistent media room with separate gallery, presentation and preview views. No new service or recording.

## Tasks

- [x] 1. Add compatible initial-mode migration, API mode validation, readiness and source grants. Prove defaults, immutable initial mode, membership and flags with route/JWT and database tests.
- [x] 2. Add media controller and track views with explicit device requests, concurrent presentations, optional tab audio and stale-capture cleanup. Test actual lifecycle effects through SDK/browser boundaries.
- [x] 3. Integrate preview, camera entry, history and expanded/compact window without remounting media. Test entry/cancel and navigation/minimize behavior.
- [ ] 4. Run full suite, lint, typecheck and build; fresh review; document rollout and unavailable manual checks. Keep capability flags off pending physical-device and listening checks.

## Constraints and review focus

Preserve existing permission rechecks, short-lived identities, cleanup, moderation, tab ownership and audio clients. Microphone/camera start off. Screen capture must begin from the user gesture, stop late results, never silently resume after terminal disconnect, and keep tab audio off by default. Viewers retain individual presentation focus. Verify minimize does not unmount the room. Do not claim subjective quality from automated tests.

## Progress

Started from origin/main d303430 in isolated `helios-video`, branch `codex/video-screen-sharing`. Native worktree tool rejected nested repository path; used git worktree within authorized workspace. Reused installed dependencies.

Focused API/database gate: 24/24. Media/controller tests: 12/12. Preview/provider tests: 10/10 after review fixes. Full suite after review fixes: 512/512 across 82 files. Additional upgrade/replay preservation test: 1/1. Lint, typecheck, production webpack build and compiled-proxy verification passed. Build used CI public placeholder settings; sandbox font/output access required normal-permission execution.

Independent final review: two Important findings (stale preview preferences on generic retry; preview cleanup on status loss), both reproduced and fixed. No Critical or deferred Minor findings. Physical/browser media quality remains a live release gate.


# Video calls and screen sharing

The existing LiveKit room and authenticated call lifecycle now support camera video and concurrent presentations. The camera entry opens a preview with both devices off. Audio calls can enable cameras or sharing later. The dashboard provider retains one media room when navigating or minimizing; a compact sharing banner always offers Stop sharing.

`POST /api/calls` accepts optional `mode: "audio" | "video"` (default audio). History returns `initialMode`, describing how the call began. The additive migration preserves the legacy `audio_call_start(uuid,boolean)` signature and adds a required three-argument overload. Joining an existing call preserves its initial mode.

`VIDEO_CALLS_ENABLED=false` and `SCREEN_SHARING_ENABLED=false` are server-only, off by default, and require existing audio configuration and `AUDIO_CALLS_ENABLED`. Group publication additionally requires `GROUP_AUDIO_ENABLED`. Tokens grant only enabled microphone/camera/screen sources, disable data and administration, expire after 120 seconds and retain the post-signing access check. Existing revocation and maintenance are unchanged.

## Capture and playback

Screen capture starts synchronously from Share screen; cancellation leaves the call intact. Each participant can publish one screen and all participants can present concurrently. The first presentation stays focused until it ends or the viewer selects another. Local camera preview alone is mirrored; remote video and screen content preserve aspect ratio.

Tab audio defaults off. It is requested only when the browser advertises both own-audio restriction and suppressed local playback. Returned audio is published only when the video surface is a browser tab and both isolation settings are confirmed. Otherwise the screen continues with an audio-unavailable message. The picker requests exclusion of this tab, whole-system audio and surface switching. Audio support is intentionally conservative; hints alone do not prove isolation. Each remote audio track has one playback element, and video elements are muted.

Capture lifetime is owned separately from React/SDK recovery. Leave, unmount and terminal disconnect synchronously stop tracks, and late permission/publication results are stopped. SDK recovery retains existing tracks. New sessions start with devices off unless the user just enabled them in that session's preview. Status loss closes preview and discards its device choices; retry never reuses old preview choices. Device switching reacquires the chosen input under the same lifetime owner.

## Release sequence

1. Run full tests, lint, typecheck, production build and compiled-proxy check.
2. Apply `supabase/migrations/20261104_video_screen_sharing.sql` in a preservation-checked transaction. Compare existing table fingerprints ignoring only the added `audio_calls.initial_mode`, ensure all historical calls default to audio, verify existing function permissions and record the exact migration stem in the migration registry.
3. Deploy matching code with both new flags false. Verify authenticated readiness is false, anonymous routes remain 401, old audio calls/history work and the cleanup worker/outbox is healthy.
4. In an isolated preview/staging environment with flags enabled, perform direct calls on two physical devices/networks; a three-person group with simultaneous presentations; six-person performance; actual readable picture and subjective listening; tab-audio isolation, device changes, browser Stop Sharing, navigation/minimize, takeover, permission revocation, logout/removal during pending capture and network recovery. Desktop Chromium is the primary publication target. Record Firefox, Safari and mobile viewing/camera results separately.
5. Enable production video only after those live gates, then screen sharing. Verify error rates and revocation backlog after each step.

Rollback: disable new flags, end affected rooms and drain revocations before reverting application code. Keep the additive column, overload and metadata history; no data/schema contraction is needed. Flags alone do not revoke already issued tokens or stop existing media.

## Evidence status

Automated coverage includes API validation/JWT source gating, membership and lifecycle regressions, legacy mode defaults, preview denial/cancellation, stale permissions/publications, browser Stop Sharing, concurrent presentation focus, single audio attachment and persistent connection across compact/expanded rendering. Independent review identified preview cleanup and retry preference reuse; regression tests reproduce both and the implementation fixes them.

Physical devices/networks, three/six-person calls, actual picture/text readability, subjective listening, tab-audio isolation, Safari/Firefox and mobile hardware are not certified by these automated tests. Keep production capabilities disabled until these checks are performed.

Reference: [LiveKit screen sharing](https://docs.livekit.io/transport/media/screenshare/) and [browser capture requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).

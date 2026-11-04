# Helios video calls and screen sharing

## Summary

Extend the existing LiveKit calls with **direct and group video**, **multiple simultaneous screen shares**, and **optional browser-tab audio**.

Keep the existing call lifecycle, conversation permissions, history and moderation. Add a separate video-call button and an expandable in-app call window that minimizes while users navigate Helios.

## User experience

- **Chat controls:** retain the phone button and add a camera button. Either entry joins an existing conversation call rather than creating a parallel call.
- **Video preview:** before starting or accepting a video call, show camera preview, camera selection and microphone controls. Both devices start off; users explicitly enable them. Offer “Join without camera.”
- **During calls:** microphone, camera, device selection, share screen, stop sharing, leave and existing group moderation controls. Audio calls can enable cameras or screen sharing without restarting.
- **Gallery:** show participant names, camera-off placeholders, microphone state, active speakers and connection status. Mirror only the local camera preview.
- **Screen focus:** display the first shared screen prominently, with participant thumbnails and a selector for other presentations. Each viewer controls their own focus; later shares do not override it.
- **Window behavior:** expanded view for video/presentations; compact panel with essential controls and a visible sharing indicator. Minimizing, expanding and dashboard navigation must retain the same media connection.
- **Mobile:** responsive video and presentation viewing, camera switching where supported, and screen-sharing controls only when the browser supports capture.

## Media behavior and permissions

- Reuse the existing room, authenticated token route, participant identities and membership checks. Camera use never grants additional conversation access.
- Allow microphone, camera, screen video and optional screen audio through explicit LiveKit publication grants. Keep arbitrary data publication and room-administration grants disabled.
- All joined participants may share simultaneously, with one active screen share per participant. No presenter approval or forced takeover in v1.
- Start browser capture directly from the Share button. Browser selection cancellation leaves the call unchanged. Screen-sharing permission must be requested for each new capture. [Browser requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).
- “Include tab audio” defaults off. Request browser-tab audio only; do not promise whole-system audio. If no audio track is returned, continue screen sharing and clearly show that audio is unavailable.
- Exclude the current call tab from the picker where supported. Prevent duplicate playback and verify that shared audio does not recapture call audio; unsupported combinations fall back to screen-only sharing. [LiveKit sharing documentation](https://docs.livekit.io/transport/media/screenshare/).
- Track browser-level Stop Sharing, device removal and permission revocation so controls reflect actual publication state.
- Stop capture and detach media elements on leave, removal, account deactivation, logout, explicit tab takeover and terminal disconnection. Also stop late-arriving captures if the user leaves while a permission prompt is open.
- Preserve enabled tracks during a successful SDK reconnect. After a terminal disconnect or new media session, reset microphone/camera off and require a fresh screen-sharing action.
- Keep audio usable when camera capture fails. Handle denied permissions, missing/busy devices, blocked playback and unsupported capture with actionable inline messages.

## Implementation and compatibility

- Replace the audio-only presentation component with a shared call-room controller and media views. Manage camera and screen tracks separately, with one audio playback path per remote audio track.
- Enable adaptive subscriptions, camera simulcast and Dynacast. Target 720p/30 fps cameras and 1080p/15 fps screen sharing, allowing browser/device fallback. Preserve screen aspect ratio and text readability. [LiveKit room options](https://docs.livekit.io/reference/client-sdk-js/interfaces/RoomOptions.html).
- Extend `POST /api/calls` with optional `mode: "audio" | "video"`, defaulting to audio for existing clients. Store this as the call’s initial mode; existing records default to audio.
- Add `initialMode` to call responses/history and `videoReady`/`screenShareReady` capability fields to call status. History describes how the call started, rather than recording every camera toggle.
- Add `VIDEO_CALLS_ENABLED` and `SCREEN_SHARING_ENABLED`, both off initially. They require existing audio configuration; group use also requires the existing group flag.
- Keep short-lived tokens, post-signing authorization rechecks, one active call per conversation, one call per user, explicit tab ownership and durable revocation cleanup.
- Preserve current database/RPC names where practical. Use an additive migration for initial call mode and maintain compatibility with existing audio callers.
- Retain metadata-only history. Recording, transcription, meeting links, scheduling, backgrounds, remote computer control and new participant limits are outside this release.

## Verification and rollout

- **Regression:** audio start/accept/decline/cancel, busy/missed outcomes, history, devices, group leave/removal, tab takeover and cleanup.
- **Authorization:** invited/nonmember/removed/inactive users cannot publish or obtain tokens; feature flags constrain grants; forged request fields cannot widen access.
- **Media:** preview cancellation, join without camera, camera switching, camera plus screen, multiple presenters, optional tab audio, browser Stop Sharing, and clean track shutdown.
- **Lifecycle:** navigation/minimize without reconnecting, network recovery, terminal disconnect, stale async permission results and logout/removal during capture.
- **Live checks:** direct calls on two physical devices/networks, a three-person group with concurrent presentations, and a six-person performance check. Verify actual picture, readable screen content and audio manually; track-publication tests alone do not establish media quality.
- Prioritize desktop Chromium for screen publication; check Firefox/Safari capability-dependent behavior and mobile camera/viewing. Record unavailable browser/device checks explicitly.
- Run focused media/API/database tests, existing regression tests, lint, typecheck and production build.
- Deploy with flags off, verify migration preservation and cleanup health, then enable video followed by screen sharing after live checks. Monitor connection failures, publication errors and cleanup backlog.
- For rollback, disable new capabilities, end affected active rooms and drain revocations before reverting application code. Retain call history and additive schema.

**Defaults:** reuse LiveKit Cloud and current credentials; no new media service or recording storage. Incoming calls continue to require an open signed-in dashboard.

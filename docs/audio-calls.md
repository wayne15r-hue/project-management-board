# Audio calling

Direct and group audio use Supabase for membership, call state and history, and LiveKit Cloud for microphone audio. Optional camera and screen capabilities are described in [Video calls and screen sharing](video-screen-sharing.md) and default off. Recording, transcription and data publication remain disabled.

## Deployment sequence

1. Apply `supabase/migrations/20261102_audio_calls.sql`. It is transactional and repeatable, adds call tables/RPCs, and preserves existing conversations/messages.
2. Deploy the call routes and interface with both feature flags disabled.
3. Run `supabase/operations/enable_audio_maintenance.sql` on Supabase. It enables `pg_cron` and `pg_net`, triggers cleanup immediately after outbox inserts, and retries once per minute without an open dashboard. HTTP requests contain no credentials or user metadata. The fixed public maintenance endpoint accepts no target parameters and returns only success/failure; privileged work is selected from the server's outbox. A database lease serializes bounded cleanup batches.
4. Verify a scheduled run and its successful HTTP response in `cron.job_run_details` and `net._http_response`. Verify the outbox is empty. Keep calls disabled until this passes.
5. Set `AUDIO_CALLS_ENABLED=true` in Vercel and redeploy. Verify direct ringing, accept/decline/cancel, mute/device controls, hangup/history and two independent account sessions.
6. Set `GROUP_AUDIO_ENABLED=true` and redeploy after direct audio verification. Verify group joining/leaving, participant roster, active speakers, final hangup and admin removal. Three-person/multi-device tests require those independent sessions; two browsers on one computer do not certify them.

Server-only credentials: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and the existing `SUPABASE_SERVICE_ROLE_KEY`. None uses a `NEXT_PUBLIC_` prefix. The URL must use LiveKit Cloud, because Cloud's explicit token revocation is part of the access design.

## Authorization and lifecycle

- Database functions recheck current membership, serialize conflicting joins, keep one live call per conversation and prevent a user joining two calls.
- Direct calls support ringing, accept, decline, cancel, missed, busy and ended outcomes. Unanswered group invitations do not make someone busy. Ringing expires after 45 seconds; a joined participant expires after 60 seconds without a heartbeat.
- Only an explicit start, accept or takeover connects media in a dashboard tab. Opening or duplicating a dashboard tab never takes over automatically. Only the owning tab sends heartbeats. A deliberate takeover disconnects the previous same-identity media connection.
- Tokens last 120 seconds, permit microphone publication/subscription only, use an opaque room and per-join media identity, and include no name/email. Token authorization is checked again after signing. An invited recipient cannot get a token before accepting.
- Leaving, group removal, moderation, hangup and conversation deletion enqueue durable media cleanup. Membership mutations attempt cleanup synchronously. Cleanup explicitly revokes tokens (cutoff current time + 5 seconds) before deleting ended rooms. Rejoining uses a fresh media identity, so a previous session stays revoked. Network failures remain queued for independent retries; access revocation is a distributed operation and may be delayed during a provider/network failure.
- Group admins can remove participants or end the call. Other members can leave independently. Removed participants cannot rejoin that call or obtain another token.

## Recovery and limitations

Calls connect muted. Unmute is the explicit microphone request. The interface reports denied/missing devices, offers microphone/speaker selection where supported, reconnects the SDK, and disconnects on component unmount. It stops local audio after prolonged inability to refresh authoritative call state.

History records metadata and outcomes, not audio. Incoming calls appear while the signed-in dashboard is open. There is no background/mobile push or ringing while the app is closed. Device/network-specific audio quality and real listening require live verification.

Disable the feature flags to stop new UI calls/token issuance. Active media must also be ended and its outbox drained. To remove only the scheduled worker, run `select cron.unschedule('helios-audio-maintenance');` after all calls have ended. Do not remove tables to disable the feature.

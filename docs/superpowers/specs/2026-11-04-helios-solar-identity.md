# Helios Solar Interface and Identity Controls

> Status: The user approved this plan on 4 November 2026 and requested 3–4 free selectable incoming-call tunes. This copy incorporates four tunes. Approval covers the supplied scope; the user subsequently approved implementation of the visual mockups. No production deployment, migration, or email activation is authorized here.


## Summary

Extend Cosmic Solar throughout the app, simplify chat and calls, introduce the screenshot-inspired two-step login, and restrict display-name changes to central admins and the owner.

Start with visual mockups for review. Historical baseline from the supplied plan: **517 tests passing across 84 files**; rerun against the implementation branch before relying on this count.

## Interface design

- Preserve light, dark and system preferences. Use midnight navy, amber and cream in dark mode; ivory, white and amber in light mode.
- Reuse the Helios logo, existing components and Lucide icons. Standardize spacing, typography, buttons, menus, focus states and subtle motion.
- Review dashboard, boards, My Work, Service Desk, LeaveDesk, employee administration, Settings and shared dialogs. Remove redundant headings, repeated explanations and duplicate actions while preserving useful workflow information.
- Respect reduced motion, keyboard navigation, readable contrast and mobile touch targets.

**Login**
- Desktop: spacious split composition with Helios branding and introduction on the left, form on the right. Stack naturally on mobile.
- Step one collects email and offers Next; it validates format without checking account existence.
- Step two shows the selected email, Change email, password, **Show password**, recovery and Sign in.
- Preserve password-manager support, paste, configured Google sign-in and existing redirect/recovery behavior.

**Chat**
- Refine conversation selection, avatars, message grouping, timestamps, attachments, unread states and the composer.
- Keep audio/video actions accessible; move history and secondary conversation actions into More.
- Retain the mobile conversation-list/back flow and message reliability behavior.

**Calls**
- Create a Solar participant gallery with initials when cameras are off, clear speaking/mute indicators and a focused presentation area.
- Keep microphone, camera, screen sharing and Leave visible when available. Put device selection and sharing options in More; place authorized moderation actions in participant menus.
- Show Enable sound only when playback is blocked and Reconnect only when disconnected. Replace repeated healthy-status text with one concise connection indicator.
- Keep Stop sharing accessible when minimized. Preserve the same media session during navigation, minimizing and expanding.

## Incoming-call tune selection — added 4 November 2026

- Offer four original, bundled instrumental tunes: **Dawn Chimes**, **Warm Keys**, **Soft Marimba**, and **Orbit Bells**. No paid license, streaming service, or third-party recordings are required.
- Add an incoming-call tune picker in Settings with individual Preview/Stop buttons, a volume control, and Silent. Default proposal: Dawn Chimes at 45% volume.
- The recipient selects what plays locally when receiving either an audio or video call. The caller does not select it, and the ringtone must never enter microphone or screen-share tracks.
- Save the preference per signed-in user in this browser. Keep it independent of administrative name restrictions. Clear playback on account changes; do not inherit another account's selection. Account-wide synchronization is not part of this first version.
- One ringtone may play at a time. Stop immediately on accept, decline, caller cancellation, expiry, an ended invitation, lost authorization, stale call-status detection, unmount, or sign-out. Suppress full ringing while the user is already in a call.
- Starting a second preview stops the first. Leaving Settings stops its preview. Minimize/navigation must not restart or duplicate actual incoming-call playback.
- Deduplicate ringing across tabs with a scoped browser ownership lease; handle lease expiry, takeover, and tab closure. If cross-tab ownership is unavailable, preserve the visual invitation and offer explicit sound activation rather than duplicate ringing.
- Respect browser autoplay restrictions. Keep the visual incoming-call UI usable without sound; expose Enable sound only after a blocked playback attempt and never request microphone access to enable a ringtone.
- Check preference validation, playback failures, volume, Silent, loop boundaries, lifecycle cleanup, tab ownership, account switching and autoplay recovery. Subjective listening remains a user review item.
## Display-name permissions

- Add structured first/last names while retaining `full_name` for existing consumers.
- New signup and one-time name setup derive the display name from those fields. Default: first name required, surname optional to accommodate single names; support Unicode names.
- Preserve existing nonempty display names exactly; do not automatically split or rewrite them.
- Existing nameless accounts complete name setup once, including accounts that already completed employee setup.
- Settings shows the name as read-only with a short explanation that an administrator can correct it.
- Add authenticated `POST /api/profile/name` for atomic initial setup and admin-only `PATCH /api/admin/employees/[userId]/name` for corrections.
- Enforce restrictions in the database, including direct Supabase writes and attempts through Auth metadata. Board and chat administrators receive no identity-management authority.
- Audit admin corrections, refresh affected identity views, and preserve account-deletion anonymization while clearing structured names.

## Verification

- Reconcile historical QA checklists against newer evidence; track each genuine gap as passed, failed or awaiting a prerequisite.
- Add regression tests for two-step login, password visibility, redirects, one-time setup races, unauthorized renaming, admin corrections and deletion compatibility.
- Test contextual call controls, keyboard menus, device changes, capture cancellation, sharing indicators and session persistence.
- Run the full suite, lint, typecheck, production build, compiled-proxy checks and migration replay/preservation checks.
- Inspect light/dark layouts at 360, 390, 768, 1024 and 1440 pixels, plus 200% zoom, reduced motion and accessibility checks.
- Complete available browser checks for requester/approver workflows, private attachment upload/download and access revocation, LeaveDesk file transport, account recovery and mobile administration.
- Keep physical-device/network calls, concurrent presentations, six-person performance, subjective listening, tab-audio isolation and inbox-dependent verification open for the later assisted session. Automated substitutes do not close these checks.

## Delivery sequence and defaults

1. Produce desktop/mobile mockups of login, chat and calls, showing both themes and the More menus; review these before product-code changes.
2. Implement shared styling, login, chat/calls and identity enforcement in separately verifiable stages.
3. Deliver a working local preview, migration evidence and the reconciled QA report.

Reuse the existing Next.js, Supabase and LiveKit architecture. Production deployment, production migration and email-service activation are outside this implementation plan.

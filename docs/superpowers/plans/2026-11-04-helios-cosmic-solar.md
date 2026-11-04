# Helios Cosmic Solar implementation plan

Approved spec: `../specs/2026-11-04-helios-cosmic-solar.md` (user approved, then supplied the corrected file).

Goal: Rebrand visible ProjectBoard surfaces as Helios and replace the public homepage with an accessible Cosmic Solar product introduction.

Architecture: Server-rendered marketing content, CSS-scoped navy/amber tokens, a small progressive-enhancement client layer for six sample tabs, and a native mobile disclosure. Shared brand constants and SVG logo; preserve all technical names, storage keys, routes, authentication, dashboard layout and themes. No database changes or new dependencies.

## Tasks

- [x] 1. Add meaningful showcase keyboard/navigation and server-rendered content tests; observe failures. Build six deterministic, explicitly labeled fictional previews, server content and local styles. Verify keyboard wrapping, Home/End, focus, no sample mutation or media access, no-JS content and CTA routes.
- [x] 2. Centralize name/mark; replace auth, onboarding, invite, email and sign-out branding. Add favicon and social image using installed Next metadata conventions. Preserve auth behavior and global theme configuration. Check email escaping and existing regressions.
- [x] 3. Run complete tests, lint, typecheck, production build. Inspect homepage at 360/768/1024/1440, 200% zoom, reduced motion and no JavaScript; inspect auth and social artwork. Review entire diff and address material findings.
- [ ] 4. Prepare reviewable release. Verify feature deployment and media verification gate before publishing. Do not claim physical-device media checks from automated evidence.

## Review focus

- Keyboard and touch navigation, narrow-screen text wrapping, focus visibility.
- Existing saved theme survives marketing navigation and auth pages.
- SSR core content and CTAs remain visible without scripts or animation.
- Fictional previews never call private APIs or capture devices; restricted leave information excluded.
- Branding does not alter identifiers, application routes, permissions, email delivery configuration or existing workflow behavior.

## Execution ledger

Baseline: source `8e1ae91` matches merged PR #16; isolated checkout `helios-cosmic-solar`, branch `codex/helios-cosmic-solar`.

Ruling: preserve approved Cosmic Solar colors, typography and restrained motion over generic skill suggestions, which were off-direction. Skill Next.js/server-rendering and accessibility guidance applies.

Release gate: local production activation record says video/screen sharing enabled, but physical-device, picture/readability and tab-audio checks remain unverified. Build and validate the rebrand; publishing depends on resolving this approved release dependency.

Validation: 517 tests across 84 files pass; lint, typecheck, default Turbopack production build and compiled proxy verification pass. Focused keyboard, SSR/no-JS and sample-isolation tests passed RED to GREEN. Social artwork access test reproduced 307 then passed with exact public paths.

Browser verification: 360/768/1024/1440 px and 720 px layout viewport (1440 at 200% equivalent), all six tabs without horizontal overflow; axe WCAG A/AA checks returned zero violations. Reduced-motion enabled; no-JS shows six sample panels and CTAs; saved light theme retained; no external requests or runtime errors. Light/dark/mobile auth and social artwork visually inspected. Manual screen-reader behavior is not certified.

Final independent review: no Critical or Important findings. Minor deferred: a signed-in inactive account is redirected from social artwork by the existing account-status guard; anonymous crawlers and visitors receive the public artwork. Retained account-status enforcement for this release.

Release authorization update: user explicitly chose “Waive the dependency and publish” after being told that physical-device media checks remain unverified. Publish the rebrand following CI; do not imply media-quality certification.

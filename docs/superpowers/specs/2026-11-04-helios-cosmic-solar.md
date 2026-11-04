# Helios rebrand and Cosmic Solar landing page

## 1. Direction and scope

Reposition ProjectBoard as **Helios: a workspace for projects, people and daily operations**, giving project teams and operations teams equal emphasis.

Use the requested [UI/UX Pro Max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) for design guidance, adapted to the selected **Cosmic Solar** direction.

Redesign the public homepage and update visible branding across authentication, onboarding, invitations, emails, browser metadata and icons. Preserve the dashboard’s existing layout, saved theme and workflows.

**Release dependency:** publish this redesign only after LeaveDesk and video/screen sharing are implemented, deployed and verified. Their final descriptions and previews must match the delivered features.

## 2. Visual identity and UI

| Element | Design |
|---|---|
| Brand mark | Custom SVG combining an abstract **H**, a solar disc and restrained rays; recognizable at favicon size |
| Background | Midnight navy `#080D19` |
| Panels | Raised navy `#111A2B`, subtle borders and soft shadows |
| Primary text | Warm white `#F4F1E8` |
| Secondary text | Cool gray `#AAB4C5` |
| Primary action | Amber `#FFB547` with dark navy text |
| Typography | Space Grotesk for marketing headings and wordmark; existing Inter for body text and application UI |
| Decoration | Solar halo behind the hero preview, sparse static stars and occasional orbital lines |
| Motion | Brief orbital introduction, restrained section reveals and approximately 200 ms interaction transitions |

Use solid, readable product panels. Reserve glass effects for the navigation and small decorative layers. Keep glow away from body text.

The landing page deliberately uses the dark Cosmic Solar palette regardless of the saved application theme. Scope its colors locally; do not change the global theme or stored preference. Authentication pages retain their existing theme while receiving the new branding.

Avoid WebGL, scroll hijacking, continuous particle animation and new animation libraries. Reduced-motion users receive the complete static design.

## 3. Page structure and content

**Navigation**

Helios logo, Product, How it works, FAQ, Sign in and Create account. Use a keyboard-accessible mobile menu. Product links lead to public previews rather than protected dashboard routes.

**Hero**

- Headline: **“Bring your team’s work into focus.”**
- Supporting copy: “Plan projects, manage approvals and requests, track leave, and collaborate in one connected workspace.”
- Primary CTA: **Create account** → `/signup`.
- Secondary CTA: **Explore Helios** → interactive showcase.
- Place a substantial product preview beneath the headline, framed by a restrained solar halo.

**Interactive product showcase**

Provide six accessible tabs using realistic fictional data, visibly labeled **“Sample workspace.”**

| Tab | Demonstration |
|---|---|
| Work | Boards, alternate views, assignments and My Work |
| Approvals | Pending reviews, comments, blocked work and decision history |
| Service Desk | Request intake, triage, assignment and approval gates |
| LeaveDesk | Working calendar, holidays, leave balances and manager reviews |
| Chat & Calls | Conversations, participant tiles, video and shared-screen layout |
| People | Employee records, departments, reporting managers and administration |

Tab changes demonstrate navigation only. Sample controls must not imply that a real approval, leave request or call occurred. Do not request camera/microphone access or connect to production APIs.

Use the delivered application’s visual language and permissions in each example. LeaveDesk examples must not expose medical details or NCNS records in ordinary coworker views.

**Feature chapters**

Replace the generic feature grid with six concise chapters matching the showcase. Explain the user benefit, then show the relevant interface.

Include AI task creation, extraction, writing assistance and summaries alongside the workflows they support. Present permissions, notifications and audit history as supporting capabilities rather than separate headline products.

**How it works**

1. Create an account and complete employee setup.
2. Organize work and bring teammates into the appropriate teams.
3. Manage delivery, requests, availability and collaboration.

Avoid promising automatic email invitation delivery or setup timing.

**Permissions and control**

Explain team access, independent approvals, private attachments and accountable changes in plain language. Avoid unsupported compliance or security certifications.

**FAQ, closing CTA and footer**

Cover project versus operations use, onboarding, availability of AI/calls, department visibility and account access. Repeat Create account and Sign in.

Include only working anchors and verified destinations, including the project’s GitHub repository. Omit unimplemented resource, social and legal links.

**Remove existing unsupported content**

Remove placeholder customer logos, testimonials, “500+ teams,” competitor comparisons, unlimited/free promises and the misleading Watch demo button. Do not replace them with invented adoption statistics.

## 4. Implementation and branding

- Rebuild the landing component around server-rendered content and a small client-side showcase/menu layer. Core content and CTAs remain visible without animation or JavaScript.
- Centralize the Helios name and reusable logo variants. Update auth branding, onboarding, invitation screens, email headers/subjects, sign-out text, page titles, descriptions, favicon and social-preview artwork.
- Use landing-scoped design tokens; preserve application colors, URLs, database names, package identifiers and existing local-storage keys.
- Retain authenticated homepage redirects and existing signup/login behavior.
- Reserve preview dimensions to prevent layout shifts. Optimize imagery and lazy-load below-fold assets. Use the repository’s installed Next.js guidance for fonts, images and metadata.
- Keep previews deterministic and separate from private application data. Introduce no database migration, analytics integration, pricing system or new product workflow.

## 5. Verification and release

- Verify LeaveDesk and video/screen-sharing deployment before finalizing their marketing copy and sample screens.
- Test navigation, signup/login destinations, mobile menu, showcase keyboard controls, focus visibility and reduced-motion behavior.
- Review at 360, 768, 1024 and 1440 px widths, plus 200% zoom: readable text, usable controls and no horizontal overflow.
- Check WCAG AA contrast, 44 px touch targets, semantic headings, useful alt text and visible content when JavaScript is unavailable.
- Verify previews contain no real employee information, customer data, secrets or unintended API/media requests.
- Confirm all user-visible ProjectBoard branding is replaced while technical identifiers remain stable.
- Run relevant regression tests, lint, typecheck and production build; inspect the rendered homepage, authentication screens and social preview.
- Deploy and smoke-test public navigation and authenticated redirects. Rollback restores the previous application/assets without altering user data.

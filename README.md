# Project Management Board

Next.js 16, React 19 and Supabase application for boards, tasks, teams and chat.

## Local setup

Use Node.js 24 or later (CI uses Node 24).

1. Run `npm ci --ignore-scripts`.
2. Copy `.env.example` to `.env.local` and supply your Supabase public URL/anon key and server-only service-role key. Set `NEXT_PUBLIC_APP_URL` to the actual site URL when deploying.
3. Provision a Supabase project and apply the SQL files in `supabase/migrations` in filename order. For an existing project, inspect migration history first and apply only missing migrations. See [database rollout](docs/database-rollout.md) before the audit hardening migration.
4. In Supabase Auth, configure the site URL and allow `${APP_URL}/callback` as a redirect URL. Google OAuth requires its provider configuration in Supabase; `NEXT_PUBLIC_GOOGLE_CLIENT_ID` controls the button visibility, not the provider credentials.
5. Enable/disable email confirmation deliberately. Confirmation and recovery emails must return to `/callback` with an internal `next` path (`/update-password` for recovery). Customize Supabase email templates/provider settings if your project uses a different confirmation flow.
6. Run `npm run dev`, then open http://localhost:3000.

The service-role key is used only on the server for notifications, storage provisioning and atomic AI quota reservations. Never expose it as a `NEXT_PUBLIC_` variable. Profile queries deliberately list allowed public fields; the legacy `anthropic_api_key` column is retained but is inaccessible to clients.

## Optional services

- **Email:** configure `RESEND_API_KEY`, a verified `RESEND_FROM` sender and `NEXT_PUBLIC_APP_URL`. An invitation that is created but not emailed returns its shareable link; failed sends are never counted as delivered. Provider acceptance is not an inbox-delivery guarantee.
- **AI:** configure `GROQ_API_KEY`, `AI_ENABLED=true` and optionally `AI_MODEL`. All provider paths, including the connection test, reserve one of 50 attempts per user per UTC day before contacting the provider. Failed provider attempts still consume a slot to prevent retries from bypassing the cap. Clients can read their usage but cannot change it.
- **Reminders:** configure a nonempty `CRON_SECRET` on Vercel. `vercel.json` schedules the reminder route at 08:00 UTC daily. The endpoint authenticates its bearer secret independently of browser sessions. Reminder dates use UTC; email opt-outs, columns named Done/Completed, and the final column on boards with at least two columns are excluded. A provider idempotency key per card/user/UTC date prevents duplicate delivery within Resend's idempotency window; this is not a permanent delivery ledger.
- **Storage:** migrations create public avatars (2 MB), private card attachments (10 MB) and private chat files (5 MB), with ownership/membership policies. New chat messages persist object paths in `file_url`; the server signs authorized reads for one hour. Old own-project signed links are converted lazily on reads. Malformed or external legacy links fail closed. Already-issued signed URLs remain usable until their expiry.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

Tests run against disposable PGlite PostgreSQL and controlled route/UI boundaries. They require no live Supabase credentials, email delivery or AI calls. The fresh-migration test runs the actual SQL chain including Realtime publication DDL against Supabase-like auth/storage fixtures. It does not replace a staging test against the project's actual grants, installed extensions and schema history.

Build requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; nonfunctional placeholder values suffice only for compilation checks. The Google Inter font is fetched at build time, so the build environment needs network access to Google Fonts. Production must use real values. CI uses dummy public configuration and never uses service credentials.

`.github/workflows/checks.yml` runs tests, lint, type checking, build and the production dependency audit. The patched Next.js and lockfile remove the audited runtime advisories. Development-only ESLint dependencies still inherit minimatch advisories in versions below 11; audit them separately and do not apply npm's proposed downgrades to obsolete ESLint/Next configs. These glob patterns come from repository-controlled lint configuration and are not served by the application.

## Maintenance

See [audit fix status](docs/audit-fix-status.md) for the finding-to-fix mapping and verification limits. The hardening migration must be applied before deploying the new API routes, because moves, teams, invitations, summaries, notifications and quota reservations use its functions. No production migration or deployment is performed by the local test suite.

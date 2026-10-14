# Roadmap

Status of the beta and what comes next, in order. Each phase is shipped to `main`
before the next one starts (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Phase 0 — Pilot foundation ✅ (v0.2.0)

- Secure access rules (RLS), private file storage, automated access-rule test
- Sign up / sign in, email confirmation (with resend), **password reset**, change password, edit name
- Organisations, gigs, crew by email (pending invites claimed on sign-up)
- Asset upload with versioning by type + name, delete; feed posts with delete; remove / leave crew
- Error boundary, toasts instead of alerts, central logger, friendly error messages
- Security headers (CSP, frame, referrer), noindex for the beta, accessibility fixes (zoom, labels, focus)
- Lint + unit tests + CI on every PR; Supabase keep-alive so the free project doesn't pause

## Phase 1 — Must-haves before inviting external companies ✅ (v0.3.0)

- Privacy notice and beta terms (`/privacy`, `/terms`), linked from sign-up. **Get them reviewed before a public launch.**
- Export my data (JSON) and delete my account (with the files of organisations only you belong to)
- Organisation members: invite colleagues by email, change roles (admin / member / viewer), remove, leave,
  delete organisation; every organisation keeps at least one admin
- Invitation emails for gigs and organisations (`send-invite` Edge Function → Supabase invite email → `/welcome`)
- Optional error monitoring (Sentry, enabled by `VITE_SENTRY_DSN`; privacy-scrubbed)
- Daily encrypted database backups (GitHub Actions, needs two secrets: see `docs/BACKUPS.md`)
- Dashboard: upcoming / past / archived filters and search
- Self-hosted font (no Google Fonts requests), branded auth email templates and a deliverability guide (`docs/EMAIL.md`)

Still to do by you (settings, not code): custom domain + email DNS (SPF/DKIM/DMARC), turn off click tracking
in the SMTP provider, paste email templates, add backup secrets, set `VITE_CONTACT_EMAIL`.

## Phase 2 — Product depth

- Realtime feed and crew list (Supabase Realtime) instead of manual refresh
- Asset version history (view and restore older versions), in-app PDF/image preview
- Call sheet: per-gig schedule + crew calls, export to PDF / share link
- Calendar view of gigs; crew availability
- Notifications (email digest first, then web push), including "you were added to a gig"
- Automated backup of uploaded files
- Activity log per gig (who uploaded / changed what)
- Installable PWA (manifest + icons) for on-site phone use
- Portuguese / English UI (i18n)
- Refactor inline styles into shared components / design tokens; end-to-end tests (Playwright) in CI

## Phase 3 — Scale and integrations

- Offline mode for venues with no signal (cached gig + documents)
- Magic-link / passwordless login for crew
- Rentman integration (import gigs and crew)
- Leaked-password protection and MFA (needs Supabase Pro)
- Usage analytics for the pilot (privacy-friendly)

## Known limitations (beta)

- Backups cover the database, not uploaded files.
- Existing users added to a gig aren't emailed (they see it on their dashboard). Notifications are Phase 2.
- Supabase free plan: pauses after 7 days idle (the keep-alive workflow prevents this); no leaked-password check.

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

## Phase 2a — Day-to-day production tools ✅ (v0.4.0)

- **Schedule** tab per gig (load-in, soundcheck, doors, show…), editable by PMs and organisation admins
- **Call sheet** page (`/gig/:id/callsheet`): schedule by day plus crew with call times and phones. Print or save as PDF.
- **Activity** tab: uploads, new versions, crew and schedule changes, status changes (written by database triggers)
- **Live updates**: new feed posts and changes by others appear without refreshing (Supabase Realtime)
- **File version history** with in-app preview for PDFs and images, and download of any version
- **Calendar view** on the dashboard (dots + day list on phones)
- **Installable app** (PWA manifest and icons): "Add to Home Screen" on iOS and Android
- Optional phone number on your profile (Account), shown to people you work with

## Phase 2b — Team experience ✅ (v0.5.0)

- **Notifications** (bell, live): added to a gig or organisation, new file or version, important updates,
  schedule changes (grouped), call-time changes, gig status or dates/venue changes
- **Português / English**: everything translated, including the legal pages; switch on the sign-in page or in Account
  (saved to your profile); dates are formatted in the chosen language
- **Crew availability**: mark dates you can't work (private); managers see clash warnings when inviting and on the
  crew list. Other companies' gigs appear only as "busy".
- **Gig page refactor**: `GigPage.jsx` went from about 1,250 lines to about 150; each tab is a component in `src/components/gig/`
- **Browser tests** (Playwright) in CI for public pages, routing, language switch and installability
- **Backups of uploaded files** (optional `SUPABASE_SERVICE_ROLE_KEY` secret)
- Fix: re-inviting someone already on a gig now updates their call time and role

## Phase 3 — Next

| Item | Notes |
|---|---|
| ✅ Email notifications | Daily summary of unread notifications through Brevo, in each person's language; opt-out in Account (0.6.0; switch on per docs/EMAIL.md) |
| ✅ Signed-in browser tests | "AVX test" Supabase project + `e2e-auth` CI job: sign-up, org, gig, schedule, offline, notifications, account deletion (0.6.0; switch on per docs/TESTING.md) |
| ✅ Offline mode | App shell cached by a service worker; dashboard, gig and call sheet show their last saved copy; files can be kept offline (0.6.0) |
| ✅ Magic-link sign-in | Passwordless option alongside email + password (0.6.0) |
| MFA + leaked-password protection | Needs Supabase Pro |
| Usage analytics for the pilot | Privacy-friendly, cookie-free |
| Signed-in tests for uploads and invites by email | Extend `e2e/auth/` once the basics are stable |

**Later, not now:** Rentman integration (import gigs and crew).

## Known limitations (beta)

- The email summary goes out once a day, not instantly.
- Offline mode is read-only: uploads, posts and edits need a connection.
- Supabase free plan: pauses after 7 days idle (the keep-alive workflow prevents this); no leaked-password check.

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

## Phase 1 — Must-haves before inviting external companies

| Item | Why | Effort |
|---|---|---|
| Privacy notice + terms page, cookie-free statement | GDPR: you're storing other companies' staff data (EU) | S |
| Delete my account + export my data | GDPR rights to erasure and access. DB is already prepared (user references become NULL) | M — needs a Supabase Edge Function (service role) |
| Organisation members: invite colleagues, change roles, remove | Today only the org creator is a member; a rental company has several PMs | M — `invite_to_org` RPC + UI, mirrors `invite_to_gig` |
| Invite emails | Today the PM shares the link manually | M — Edge Function + Resend (same SMTP account as Auth) |
| Error monitoring (Sentry free tier) | Know about crashes before pilots tell you | S — hook already in `src/lib/logger.js` |
| Backups | Free plan has no downloadable backups | S — scheduled GitHub Action `pg_dump` to a private location |
| Custom domain (e.g. `avx.lumenandpixel.com`) | Trust, and email deliverability (SPF/DKIM) | S — DNS only |
| Archive / filter gigs (upcoming / past / archived) | Dashboard gets long quickly | S |

## Phase 2 — Product depth

- Realtime feed and crew list (Supabase Realtime) instead of manual refresh
- Asset version history (view and restore older versions), in-app PDF/image preview
- Call sheet: per-gig schedule + crew calls, export to PDF / share link
- Calendar view of gigs; crew availability
- Notifications (email digest first, then web push)
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

- No invite emails yet — share `https://avx-beta.vercel.app/auth` with new crew yourself.
- Only the person who created an organisation is a member of it.
- Supabase free plan: no backups, pauses after 7 days idle (the keep-alive workflow prevents this).

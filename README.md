# AVX — AV Production Copilot (beta)

One place for an AV production's gigs, crew, documents and updates.
Built with React + Vite, Supabase (database, auth, file storage) and hosted on Vercel.

- **Live:** https://avx-beta.vercel.app
- **Set up your own copy:** [SETUP.md](SETUP.md)
- **What's next:** [ROADMAP.md](ROADMAP.md)
- **How we work on the repo:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Release notes:** [CHANGELOG.md](CHANGELOG.md)
- **Email setup / spam:** [docs/EMAIL.md](docs/EMAIL.md) · **Backups:** [docs/BACKUPS.md](docs/BACKUPS.md) · **Testing:** [docs/TESTING.md](docs/TESTING.md) · **Quotes:** [docs/QUOTES.md](docs/QUOTES.md) · **Usage counts:** [docs/USAGE.md](docs/USAGE.md) · **Two-step sign-in:** [docs/SECURITY.md](docs/SECURITY.md) · **Navigation & roles:** [docs/NAVIGATION.md](docs/NAVIGATION.md)
- **Waiting on you:** [docs/PENDING.md](docs/PENDING.md) · **Help & inclusion plan:** [docs/HELP.md](docs/HELP.md) · **Switching from other tools:** [docs/SWITCHING.md](docs/SWITCHING.md) · **Public site, pricing and help (plan):** [docs/PUBLIC_SITE.md](docs/PUBLIC_SITE.md)

## Quick start

```bash
cp .env.example .env   # fill in your Supabase URL + anon key
npm install
npm run dev            # http://localhost:5173
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run lint` | ESLint (bans `console.*` outside the logger and `alert()`) |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Production build into `dist/` |
| `npm run test:e2e` | Browser tests (Playwright) against the built app — run `npm run build` first. Signed-in tests: see docs/TESTING.md |
| `npm run check` | Lint + unit tests + build — run before opening a PR |

## Project layout

```
src/
  App.jsx                routes, error boundary, providers
  i18n/                  t(), language detection, en.js + pt.js dictionaries
  config.js              app constants + optional VITE_CONTACT_EMAIL / VITE_SENTRY_DSN
  components/            ErrorBoundary, AccountModal, OrgMembersModal, GigCalendar,
                         NotificationBell, AvailabilitySection
    ui.jsx               shared Modal + style tokens (use for new components)
    gig/                 GigHeader + one component per tab, modals, shared parts
  lib/
    supabase.js          Supabase client (reads VITE_ env vars)
    AuthContext.jsx      session, profile, password-recovery state
    ToastContext.jsx     in-app notifications (use instead of alert)
    logger.js            the only place that writes to the console
    monitoring.js        optional Sentry (loaded only when a DSN is set)
    invites.js           calls the send-invite Edge Function
    files.js, gigs.js,   pure helpers (unit tested)
    schedule.js, versions.js, activity.js, calendar.js, notifications.js
    storage.js           bulk file removal
  pages/                 Auth, ResetPassword, Welcome, Dashboard, Gig, CallSheet, Legal (privacy/terms)
supabase/
  migrations/            database schema + access rules, applied in filename order
  functions/send-invite  Edge Function: add by email + send invitation
  templates/             branded auth email templates (paste into Supabase)
  tests/rls_smoke.sql    access-rule test (always rolls back)
e2e/                     Playwright browser tests (e2e/auth/: signed-in, test project only)
scripts/                 backup-storage.mjs (used by the backup workflow)
.github/workflows/       CI (lint, unit, build, e2e), keep-alive, encrypted backups, daily email summary
docs/                    EMAIL.md, BACKUPS.md, TESTING.md, QUOTES.md
```

## How access works

A person has no global role: they have a role in each organisation and on each gig, and can be
admin in one company and crew in another. The workspace switcher next to the logo shows which applies
(see [docs/NAVIGATION.md](docs/NAVIGATION.md)).

Everything is enforced in the database with Row Level Security, not in the UI:

| Who | Can |
|---|---|
| Organisation admin | Everything in the organisation: members, roles, gigs, quotes, company details and branding, deleting gigs or the organisation |
| Organisation member | See all the organisation's gigs, create gigs, upload files, build, version and send quotes |
| Organisation viewer | See the organisation's gigs (no quotes or prices) |
| Gig PM | Edit the gig, its schedule and positions to fill, add/remove crew, upload/delete files (the gig's creator can also delete it) |
| Gig crew / viewer | See the gig, its files and feed; post updates |
| A client with a quote link | See that one quote and accept or decline it, while the link is valid |
| Anyone else | Nothing |

Files live in a private bucket under `<gig-id>/…` and are opened with short-lived signed URLs.

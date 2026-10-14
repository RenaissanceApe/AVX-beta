# AVX — AV Production Copilot (beta)

One place for an AV production's gigs, crew, documents and updates.
Built with React + Vite, Supabase (database, auth, file storage) and hosted on Vercel.

- **Live:** https://avx-beta.vercel.app
- **Set up your own copy:** [SETUP.md](SETUP.md)
- **What's next:** [ROADMAP.md](ROADMAP.md)
- **How we work on the repo:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Release notes:** [CHANGELOG.md](CHANGELOG.md)
- **Email setup / spam:** [docs/EMAIL.md](docs/EMAIL.md) · **Backups:** [docs/BACKUPS.md](docs/BACKUPS.md)

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
| `npm run check` | Lint + tests + build — run before opening a PR |

## Project layout

```
src/
  App.jsx                routes, error boundary, providers
  config.js              app constants + optional VITE_CONTACT_EMAIL / VITE_SENTRY_DSN
  components/            ErrorBoundary, AccountModal, OrgMembersModal, GigCalendar
    ui.jsx               shared Modal + style tokens (use for new components)
    gig/                 ScheduleTab, ActivityTab, AssetVersionsModal
  lib/
    supabase.js          Supabase client (reads VITE_ env vars)
    AuthContext.jsx      session, profile, password-recovery state
    ToastContext.jsx     in-app notifications (use instead of alert)
    logger.js            the only place that writes to the console
    monitoring.js        optional Sentry (loaded only when a DSN is set)
    invites.js           calls the send-invite Edge Function
    files.js, gigs.js,   pure helpers (unit tested)
    schedule.js, versions.js, activity.js, calendar.js
    storage.js           bulk file removal
  pages/                 Auth, ResetPassword, Welcome, Dashboard, Gig, CallSheet, Legal (privacy/terms)
supabase/
  migrations/            database schema + access rules, applied in filename order
  functions/send-invite  Edge Function: add by email + send invitation
  templates/             branded auth email templates (paste into Supabase)
  tests/rls_smoke.sql    access-rule test (always rolls back)
.github/workflows/       CI, Supabase keep-alive, encrypted database backup
docs/                    EMAIL.md, BACKUPS.md
```

## How access works

Everything is enforced in the database with Row Level Security, not in the UI:

| Who | Can |
|---|---|
| Organisation admin | Everything in the organisation: members, roles, gigs, deleting it |
| Organisation member | See all the organisation's gigs, create gigs, upload files |
| Gig PM | Edit the gig, add/remove crew, upload/delete files |
| Gig crew / viewer | See the gig, its files and feed; post updates |
| Anyone else | Nothing |

Files live in a private bucket under `<gig-id>/…` and are opened with short-lived signed URLs.

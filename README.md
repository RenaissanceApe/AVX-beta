# AVX — AV Production Copilot (beta)

One place for an AV production's gigs, crew, documents and updates.
Built with React + Vite, Supabase (database, auth, file storage) and hosted on Vercel.

- **Live:** https://avx-beta.vercel.app
- **Set up your own copy:** [SETUP.md](SETUP.md)
- **What's next:** [ROADMAP.md](ROADMAP.md)
- **How we work on the repo:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Release notes:** [CHANGELOG.md](CHANGELOG.md)

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
  components/            shared UI (ErrorBoundary, AccountModal)
  lib/
    supabase.js          Supabase client (reads VITE_ env vars)
    AuthContext.jsx      session, profile, password-recovery state
    ToastContext.jsx     in-app notifications (use instead of alert)
    logger.js            the only place that writes to the console
    files.js             upload helpers (unit tested)
  pages/                 AuthPage, ResetPasswordPage, Dashboard, GigPage
supabase/
  migrations/            database schema + access rules, applied in filename order
  tests/rls_smoke.sql    access-rule test (always rolls back)
.github/workflows/       CI (lint/test/build) and Supabase keep-alive
```

## How access works

Everything is enforced in the database with Row Level Security, not in the UI:

| Who | Can |
|---|---|
| Organisation admin | Everything in the organisation's gigs |
| Organisation member | See all the organisation's gigs, create gigs, upload files |
| Gig PM | Edit the gig, add/remove crew, upload/delete files |
| Gig crew / viewer | See the gig, its files and feed; post updates |
| Anyone else | Nothing |

Files live in a private bucket under `<gig-id>/…` and are opened with short-lived signed URLs.

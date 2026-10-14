# Contributing

## Branches and pull requests

- `main` is what's live: every merge to `main` deploys https://avx-beta.vercel.app via Vercel.
- Work on **one short-lived branch at a time**, open a PR, and merge it into `main` when CI is green.
  Vercel builds a preview URL for every PR — check it before merging.
- Merge with **squash**; the branch is deleted automatically after merge.
  Don't start a second branch for something that depends on unmerged work — finish and merge first.
- Unfinished ideas go in [ROADMAP.md](ROADMAP.md), not in long-lived branches.

## Before opening a PR

```bash
npm run check   # lint + unit tests + build
```

If you changed the database, also run `supabase/tests/rls_smoke.sql` in the Supabase SQL editor
and confirm it ends with `ALL CHECKS PASSED`.

## Database changes

- Every change is a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`.
  Never edit a migration that has already been applied — add a new one.
- Every table has Row Level Security enabled. Access checks go through the helpers in the
  `private` schema (`can_access_gig`, `can_manage_gig`, …) so policies never query their own table.
- Apply the migration to Supabase, then commit the same file.

## Logging hygiene

- Don't use `console.*` directly (lint enforces this). Use `logger` from `src/lib/logger.js`:
  `debug`/`info` only appear in development; `warn`/`error` always.
- Log ids and step names, never emails, passwords, tokens, file contents or signed URLs.
- Show users `userMessage(error)` via `useToast().notify(...)` — never raw stack traces or `alert()`.

## Secrets

- `.env` only contains the Supabase URL and the **public** anon key (safe in a browser app;
  security comes from the database rules). Never commit the `service_role` key or SMTP passwords —
  those belong in Supabase / Vercel settings.

## Releases

- Bump `version` in `package.json` and add a section to [CHANGELOG.md](CHANGELOG.md) in the PR that ships it.

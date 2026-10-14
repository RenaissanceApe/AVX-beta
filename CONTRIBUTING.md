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

If you changed screens or routes, also run `npm run build && npm run test:e2e` (CI runs it on every PR).

If you changed the database, also run `supabase/tests/rls_smoke.sql` in the Supabase SQL editor
and confirm it ends with `ALL CHECKS PASSED`. Supabase's security advisor lists our API functions
(`invite_to_gig`, `crew_conflicts`, …) as "SECURITY DEFINER callable by signed-in users". That is
intended: each one checks permissions itself. Anything else it reports needs fixing.

## Database changes

- Every change is a new file in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`.
  Prefer `create or replace` / `if not exists` over `drop`, so migrations can be applied without manual confirmation.
  Never edit a migration that has already been applied — add a new one.
- Every table has Row Level Security enabled. Access checks go through the helpers in the
  `private` schema (`can_access_gig`, `can_manage_gig`, …) so policies never query their own table.
- Apply the migration to Supabase, then commit the same file.
- Edge Functions live in `supabase/functions/<name>/index.ts`; deploy, then commit the same code.
  They must check permissions through the database (call the RPC as the user) before using the service role,
  and log ids and step names only. Never log emails or tokens.

## Text and languages

- Never hard-code user-facing text. Add a key to **both** `src/i18n/en.js` and `src/i18n/pt.js` and use
  `t('key', { vars })` (`useI18n()` in components so they re-render on language change).
- Plurals: add `key.one` / `key.other` and pass `{ count }`. Dates: `fmt(date, pattern)` and `ago(date)`.
- `npm test` fails if the two dictionaries differ or if code uses a key that doesn't exist.

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

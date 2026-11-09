# env: Stop tracking `.env` (#125)

## Changelog
#### For developers
- `.env` is no longer in the repository and is listed in `.gitignore`. A fresh clone starts from
  `.env.example` (`cp .env.example .env`) and points it at the **test** Supabase project for local
  work and e2e. Production builds take `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
  Vercel's Environment Variables. The old file stays in git history; the anon key is public by
  design, so nothing needs rotating.

## Roadmap
Nothing to mark: a small fix from issue #125, not a ROADMAP step.

## Pending: test lines (section 2)
- Before `test` goes to `main`: in Vercel → Settings → Environment Variables, check that
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for **Production** and **Preview**.
- After the merge to `main`: open the live app and sign in (it reaches Supabase).
- Workflows that used to read the committed `.env` (backup, digest, key-numbers, keepalive): see
  the PR's "Needs your decision"; after the merge, run each once by hand (Actions → Run workflow)
  and check it still reaches Supabase.

## Pending: new questions (section 3)
- The four scheduled workflows above read the production URL from the committed `.env`. They need
  another source (proposed: repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`). Waiting
  on the Dispatcher/owner; see the PR.

## Session prompt
none (issue #125)

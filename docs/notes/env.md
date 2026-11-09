# env: Stop tracking `.env` (#125)

## Changelog
#### For developers
- `.env` is no longer in the repository and is listed in `.gitignore`. A fresh clone starts from
  `.env.example` (`cp .env.example .env`) and points it at the **test** Supabase project for local
  work and e2e. Production builds take `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
  Vercel's Environment Variables. The old file stays in git history; the anon key is public by
  design, so nothing needs rotating.
- The backup, digest, key-numbers and keep-alive workflows take the production Supabase URL (and,
  for keep-alive, the anon key) from the repository variables `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` instead of the committed `.env`. If one is missing, the run fails and says
  which.

## Roadmap
Nothing to mark: a small fix from issue #125, not a ROADMAP step.

## Pending: test lines (section 2)
- Before `test` goes to `main`: in Vercel → Settings → Environment Variables, check that
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set for **Production** and **Preview**.
- After the merge to `main`: open the live app and sign in (it reaches Supabase).
- Before `test` goes to `main`: in GitHub → Settings → Secrets and variables → Actions →
  **Variables**, create `SUPABASE_URL` (the production project's URL, Supabase → Project Settings →
  API) and `SUPABASE_ANON_KEY` (the production project's anon public key, same page).
- After the merge: run Supabase keep-alive, Database backup, and the digest and key-numbers
  workflows (with "dry run" ticked) once by hand (Actions → Run workflow); each should be green.

## Pending: new questions (section 3)
- None. (The workflow change was agreed with the Dispatcher; the owner only creates the two
  repository variables above.)

## Session prompt
none (issue #125)

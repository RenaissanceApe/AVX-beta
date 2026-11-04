# QA bot

A bot that checks each change before and after it goes live, so you don't have to test every PR by
hand. **Status: planned** (decided 2026-11-02). It is built in four sessions, QA1–QA4
([ROADMAP.md](../ROADMAP.md), prompts in [SESSION_PROMPTS.md](SESSION_PROMPTS.md)). When a step is
built, its part of this plan is replaced by a "How it works" section.

## Why

AVX has about 48 screens, 9 Edge Functions and 57 database access-rule tests. On a normal day 3–5
PRs merge, and each merge goes live straight away. The automatic browser tests cover sign-up,
sign-in, organisations, gigs, quotes and invites. Inventory, messaging, the crew network, tasks,
field tools and import have none. The 57 SQL tests only run when someone pastes them into the SQL
editor. The manual list in [PENDING.md](PENDING.md) section 2 runs once, at the end of the build.

## Decisions (2026-11-02)

- The AI tester runs on each PR **before** merge. A short fixed check runs on the live app **after**
  each merge.
- On the live app: that light check after each deploy, plus **one real sign-up a day**. Every QA
  account carries a **tag** so your numbers ignore it.
- Email inbox: **Mailosaur**.
- AI runs are paid with a separate Claude API key that has a monthly limit (recommended; confirmed
  in QA3).

## The three parts

| Part | What it is | When it runs |
|---|---|---|
| Fixed tests (no AI) | Playwright browser tests and the 57 SQL access-rule tests, on the test project | every push to a PR |
| AI tester | Claude Code in GitHub Actions, following `.claude/skills/qa/SKILL.md`, with two browsers (admin and crew) and the Mailosaur inbox, on the test project | when a PR is opened or marked ready, and when you add the `qa` label |
| Live checks | fixed browser tests against avx-beta.vercel.app, with the live QA account | after each merge, once the deploy is live; a real sign-up once a day |

A .md file of rules alone can't start itself, keep passwords safe, reset test data or give the same
answer twice; that's why the rules (the skill) sit inside workflows, accounts and scripts. Each
check the AI confirms is also written as a fixed test, so later PRs get it without AI cost. The
same skill works in any build session as `/qa`, so a session can check its own work first.

### 1. Fixed tests on every PR

- `check`, `e2e` and `e2e-auth` stay as they are.
- New `sql-tests` job in `.github/workflows/ci.yml`: runs every `supabase/tests/*.sql` against the
  test project with psql (install step from `backup.yml`). Each file is one block that ends by raising
  `ALL … CHECKS PASSED` as an error, which also undoes everything it did; a file passes only if that
  message appears and no `CHECK FAILED` does. Same "refuse production" guard as `e2e-auth`; on when
  the repo variable `SQL_TESTS_ENABLED` is `true`.
- Three of these files contain `delete` statements inside their self-undoing blocks. They run only on
  the test project and never through the Supabase connector.

### 2. AI tester before merge

**Runs** when a PR is opened or marked ready (not drafts; fork PRs get no secrets, so never), or when
you add the `qa` label to re-run after fixes. Not on every push. A repo variable can make it
label-only.

**Steps**
1. Build the PR against the test project and serve it on the runner, as `e2e-auth` does (Vercel
   previews may point at the live database, so they aren't used).
2. `scripts/qa/seed.mjs`: make sure the test QA accounts (QA admin, QA crew) exist; create a fresh
   "AVX QA run <id>" company with realistic data (reusing `scripts/help-screens/sample-data.mjs`
   where it fits).
3. `scripts/qa/sign-in.mjs`: sign both in and save their sessions; the AI never sees a password.
4. `scripts/qa/context.mjs` → `qa-run/context.md`: the PR title and "How to test" section, the
   changed files mapped to areas through `qa/areas.md` (with their connected areas), the new
   CHANGELOG section, new T-lines in PENDING.md section 2, migrations and Edge Functions in the PR.
5. `anthropics/claude-code-action@v1` with `prompt: /qa`; `--mcp-config qa/mcp.json` (two
   Playwright MCP browsers, `admin` and `crew`, headless, local app and test project only);
   `--allowedTools` limited to those browsers, reading files, writing `qa-run/**`,
   `node scripts/qa/inbox.mjs …` and `npx playwright test …`; a turn cap and a 30-minute timeout.
   The model and turn cap come from repo variables (no model names in code). If PRs are opened by
   the Claude app, the workflow lists it in `allowed_bots`.
6. A separate job with write permission posts `qa-run/report.md` as one PR comment (updated on
   re-runs) and removes the run's company through the app.

**What the skill tells the AI**
- Read `context.md`, the area doc's "How … works" section and the PR's T-line; write a plan of 5–15
  checks: the PR's own steps, empty states and errors, crew vs admin and two people interacting,
  emails, both languages at 320 and 390 px, and 2–3 checks in connected areas.
- Run them; read emails with `inbox.mjs`; note console errors and failed requests.
- Report each check as passed, failed or unclear, in plain language, with exact steps and a
  screenshot.
- Draft a fixed Playwright test for each confirmed check, run it twice, attach it for the session to
  commit.
- Rules: test project only, inside its own QA company; remove things through the app; never print
  passwords, email links or tokens; a migration or Edge Function from the PR missing on the test
  project is reported as such, not as a bug; security problems only in `qa-run/security.md`.

If the session that built the PR watches it, it gets the QA comment as a PR event and can fix the
problems on the same PR. Add the `qa` label to re-run.

### 3. Live checks after merge and daily

- `vite.config.js` writes `version.json` (version and commit) into each build; `vercel.json` marks it
  no-cache.
- **After each merge** (push to `main`): wait until avx-beta.vercel.app serves the merged commit (up
  to about 10 minutes), then `e2e/live/after-deploy.spec.js`: the live QA account signs in with its
  password and a two-step code; opens the main screens in English and Portuguese at desktop and
  phone width; fails on JavaScript errors or failed requests; makes one small change inside its
  "AVX QA" organisation and undoes it; checks a QA public quote link and the calendar feed.
- **Daily**, `e2e/live/daily-signup.spec.js`: first remove, through the app, any leftover account
  from the past week's failed runs (addresses include the date, passwords come from a secret); sign
  up with a new tagged address through the normal form; check the confirmation email; create an
  organisation; check the sign-in-link and password-reset emails; delete the account through the
  app.
- **On failure:** one comment on the merged PR (with how to roll back in Vercel) and one `qa-bot` +
  `needs-triage` issue per failing check, updated rather than duplicated. Nothing is uploaded from
  live runs.
- Environment `live-check`, usable from `main` only; only the live QA account's own login, no
  service-role key or database URL.

## QA accounts and the QA tag

| Account | Where | Kept? |
|---|---|---|
| QA admin, QA crew | test project | kept; a fresh QA company each run |
| `e2e-…` throwaway accounts | test project | deleted by the run; QA1's cleanup also clears old leftovers (F8, D21) |
| Live QA account, two-step sign-in on, in "AVX QA" | live app | kept; no admin rights anywhere; never publishes a crew profile or job post |
| Daily sign-up | live app | deleted by the same run |

**How the tag works**
- Every QA address is at your Mailosaur inbox's own domain. Only you control it, so no customer can
  be tagged by accident or on purpose.
- The database tags an account with such an address the moment it's created (daily sign-ups
  included). Organisations created by a tagged account count as QA.
- The tag changes nothing the account can see or do. It only affects your numbers: usage counts
  aren't recorded for tagged accounts (the bot's browsers also send the "do not track" signal
  `src/lib/usage.js` respects); new summary views give companies, people, gigs, quotes and recent
  sign-ins without QA; one view lists the QA accounts that exist now. Future reports (K1, the
  platform-dashboard idea) use the same check.
- Names start with "AVX QA" so you can spot them in Supabase; the name isn't what's checked.

**Migration outline** (QA2; asks for your yes before it's applied)
```
private.qa_settings   one row: email_domain, set once per project in the SQL editor (kept out of the public repo)
private.qa_accounts   user_id → auth.users (on delete cascade), tagged_at
new trigger on auth.users (after insert): tag when the address ends with '@' || email_domain
                      (separate from handle_new_user, which stays untouched)
one-time backfill     tag existing accounts at that domain
private.is_qa_user(uid), private.is_qa_org(org_id)   (organisation QA when created_by is QA)
public.track_usage    return early for QA accounts; the rest unchanged
views                 private.platform_summary, private.people_summary (no QA); private.qa_summary
test                  supabase/tests/qa_accounts.sql → "ALL QA CHECKS PASSED"
```
Same private-schema pattern as `private.usage_daily`: the app's API can't read or change it.

## Safety (the repo is public)

1. The AI never touches the live app or its database; only the fixed live checks do, with the live
   QA account's own login.
2. Secrets live in two GitHub environments: `test-project` and `live-check` (`main` only).
3. Logs are public: helpers never print passwords, email links or tokens. Screenshots and traces come
   only from the test project.
4. Security findings are never written publicly: the PR gets a "don't merge: security finding"
   notice; details go in an encrypted artifact, opened like a backup (gpg, as in `backup.yml`,
   passphrase `QA_REPORT_PASSPHRASE`).
5. The AI job can't push, merge or comment; it writes files, and a separate fixed job posts them.

## Cost

- AI tester: per run, capped by a turn limit and a 30-minute timeout. Measured during QA3's trial
  and written here before it's left on.
- Mailosaur: from about $20 a month billed yearly; 14-day free trial. If QA1–QA3 take longer than
  the trial, the paid plan is needed from QA2 or QA3.
- GitHub Actions: free for public repositories.

## Build order and when you step in

| Step | What gets built | What you do |
|---|---|---|
| QA1 Foundations | inbox and two-step-code helpers, shared test helpers, QA accounts and seed/cleanup on the test project, SQL tests in CI, a "How to test" section in the PR template | Setup A (about 20 min), before or during the session |
| QA2 Live checks + QA tag | migration and its test, `version.json`, live tests and workflow, usage docs | Setup B (about 30 min), when the session asks |
| QA3 AI tester | skill, area map, browser config, scripts, workflow; trial on 3–5 PRs plus one with a planted bug | Setup C (about 10 min), then read the bot's comments on the trial PRs |
| QA4 Catch-up (repeats) | each run turns the next area of PENDING.md section 2 into fixed tests: inventory and scanning (fake camera feed), messaging, crew network, tasks and business, field tools, import | nothing new; merge its PR |

Each session ends with a PR you merge. QA2 comes before QA3 because it's small and protects every
merge straight away; QA3 needs only QA1. Outside pieces that need your yes in their session:
Mailosaur (QA1), `anthropics/claude-code-action@v1` and `@playwright/mcp` pinned to one version
(QA3). The helpers need no new npm packages.

### Setup A (QA1)

1. **Mailosaur.** Open the trial account. In the dashboard, note the inbox's **ID** (the short code
   in its domain, `xxxxx.mailosaur.net`), the **API key** and the inbox's **SMTP settings** (host,
   port, username, password). Keep them in your password manager, never in chat.
2. **Test project emails to Mailosaur.** Supabase → the **test** project (`idvebeadnrxudfgortzg`) →
   Authentication → Emails → SMTP Settings → custom SMTP on → Mailosaur's host, port, username and
   password; sender any address at your Mailosaur domain, sender name `AVX test` → Save. Every
   email the test project sends then lands in Mailosaur and never reaches a real person.
3. **Two keys from the test project.** Still in the test project: **Connect** → **Session pooler**
   → copy the connection string and put the test database password in place of `[YOUR-PASSWORD]`;
   Project Settings → API Keys → copy the `service_role` key.
4. **GitHub.** Repo → Settings → Environments → New environment `test-project` → Add environment
   secret for each: `MAILOSAUR_API_KEY`, `MAILOSAUR_SERVER_ID` (the inbox ID),
   `TEST_SUPABASE_DB_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY`. Don't set `SQL_TESTS_ENABLED` yet; the
   session tells you when, after a first run.

### Setup B (QA2)

1. Say yes to the migration (shown in plain words first).
2. Run the one-line query the session gives you in each project's SQL editor (test, then live) to
   set the QA email domain.
3. Create the live QA account by hand, with the session's guide: sign up on the live app with the
   address it gives you; click the confirmation link in Mailosaur; create "AVX QA" with one gig and
   one quote; turn on two-step sign-in and copy its secret code.
4. GitHub → Settings → Environments → New environment `live-check` → Deployment branches: "Selected
   branches", add `main` → secrets `LIVE_QA_PASSWORD`, `LIVE_QA_TOTP_SECRET`, `MAILOSAUR_API_KEY`,
   `MAILOSAUR_SERVER_ID`, and two long random strings `QA_DAILY_SECRET` and `QA_REPORT_PASSPHRASE`
   (keep both in your password manager too).

### Setup C (QA3)

1. platform.claude.com → create an API key `avx-qa` and set a monthly spending limit (start around
   $30–50). GitHub → Settings → Secrets and variables → Actions → New repository secret
   `ANTHROPIC_API_KEY`.
2. Same page, **Variables** tab: `QA_MODEL` and `QA_MAX_TURNS`, with the values the session gives.
3. Say yes to the two outside pieces.
4. On the next 3–5 PRs, read the bot's comment and say whether it's useful or noisy.

## What stays manual

Scanning with a real phone camera (T5), push notifications on a locked phone (T16), whether report
numbers look right (T10), whether the Portuguese reads naturally (the bot only flags English left on
Portuguese screens), cross-hire with a second real company (T9).

## Checks for each step

- **QA1:** `sql-tests` shows a result for each of the 57 files and a broken check on a scratch branch
  turns it red (files failing because their migration isn't on test are listed for you); the inbox
  helper gets a password-reset email from the test project within a minute; `npm run check` and the
  signed-in tests still pass.
- **QA2:** `qa_accounts.sql` passes on test; after merging, the live check runs once the deploy is
  live and passes; a manual daily run signs up, gets the email and deletes the account;
  `private.platform_summary` shows the same numbers as before; `private.qa_summary` shows only the
  live QA account.
- **QA3:** on a scratch PR with two planted bugs (an English label on a Portuguese screen; a button
  that does nothing for crew) the bot reports both with steps; a clean PR passes; time and cost per
  run recorded here.

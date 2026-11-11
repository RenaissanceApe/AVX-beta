# Testing

| What | Command | Runs in CI |
|---|---|---|
| Lint + unit tests + build | `npm run check` | always (`check` job) |
| Browser smoke tests (no account needed) | `npm run build && npm run test:e2e` | always (`e2e` job) |
| Signed-in journeys (test project) | see below | when `E2E_AUTH_ENABLED` is `true` (`e2e-auth` job) |
| Live check of the production app (read-only) | the **Live check** workflow, started by hand (below) | never on PRs |
| Accessibility (axe) | part of both browser test runs (`e2e/a11y.spec.js`, and `expectAccessible` in the signed-in journey) | always |
| Help content (both languages, every id used exists, guides line up with their screenshots) | part of `npm test` (`src/help/help.test.js`) | always |
| Guide screenshots (sample data, phone, both languages) | `npm run help:screens`, then commit `public/help/shots/` | when a screen a guide shows changes |

## The test project

Signed-in tests create real users, organisations and gigs, so they run against a **separate
Supabase project, "AVX test"** (`idvebeadnrxudfgortzg`), never the production one. The CI job
refuses to start if it's pointed at production.

Each run signs up brand-new users (`e2e-…@example.com`), creates an organisation and a gig,
adds a schedule item, builds a quote, checks the offline copy, uploads a file and a new version of
it, adds an existing user to the gig and checks the notification, invites an address that has no
account yet and checks it joins the gig on sign-up, then deletes every account it created (which
deletes their organisation and gig too).

### One-time setup

1. **Database.** In the test project → SQL editor, run these two files (they're safe to re-run):
   - `supabase/migrations/20261015000001_invite_claims_and_account_deletion.sql`
   - `supabase/migrations/20261018000000_email_digest.sql`

   (All the other migrations are already applied. Those two contain `DELETE` statements inside
   functions, which the automated tool can't run without your confirmation.)
2. **Auth settings** (test project → Authentication):
   - *Sign In / Providers → Email*: turn **off "Confirm email"**, so test users can sign in straight away
   - *URL Configuration*: Site URL `http://localhost:4173`; add `http://localhost:4173/**` to Redirect URLs
   - leave SMTP on Supabase's built-in sender; the tests never send email (example.com addresses
     aren't invited by email because they already have accounts)
3. **GitHub** → repo → Settings → Secrets and variables → Actions → **Variables** tab → add:
   | Name | Value |
   |---|---|
   | `TEST_SUPABASE_URL` | `https://idvebeadnrxudfgortzg.supabase.co` |
   | `TEST_SUPABASE_ANON_KEY` | the test project's anon key (Project Settings → API; it's public, like the production one) |
   | `E2E_AUTH_ENABLED` | `true` |

   The keep-alive workflow also pings the test project once `TEST_SUPABASE_URL` is set.

### Running locally

```bash
export VITE_SUPABASE_URL=https://idvebeadnrxudfgortzg.supabase.co
export VITE_SUPABASE_ANON_KEY=<test project anon key>
npm run build            # the build bakes in the test project's URL
E2E_AUTH=1 npm run test:e2e
npm run build            # rebuild without the exports before deploying anything
```

Every account a run creates is `e2e-<role>-<run>@example.com` (`e2e/auth/accounts.js`). In CI the
run tag is the GitHub run (`E2E_RUN`), and the step "Sweep this run's test accounts" runs after the
tests, even when one failed, and deletes exactly that run's accounts the way a person deletes their
own (Settings → Your data): their organisations and gig files go too. It only signs in to that
run's addresses, so it never touches anything else, and it refuses the production project.

To sweep by hand (a run interrupted locally, or accounts a worker made with the tag `<step>`):

```bash
export VITE_SUPABASE_URL=https://idvebeadnrxudfgortzg.supabase.co
export VITE_SUPABASE_ANON_KEY=<test project anon key>
npm run e2e:sweep -- <tag>        # e.g. gh42513535881-1, or K4
```

Locally, set `E2E_RUN=<your tag>` before `npm run test:e2e` so you know which tag to sweep. An
account the sweep can't delete (it says which) can be removed in the test project → Authentication
→ Users.

### Database access rules

`supabase/tests/rls_smoke.sql`, `supabase/tests/quotes_rls.sql`, `supabase/tests/phase4b_rls.sql`,
`supabase/tests/phase4c_rls.sql`, `supabase/tests/mfa_rls.sql`, `supabase/tests/usage.sql`,
`supabase/tests/my_gig_companies.sql`, `supabase/tests/reservations_people.sql`, `supabase/tests/inventory.sql`, `supabase/tests/equipment_availability.sql`, `supabase/tests/warehouse.sql`, `supabase/tests/kits.sql`, `supabase/tests/maintenance.sql`, `supabase/tests/subrentals.sql`, `supabase/tests/network.sql`, `supabase/tests/messaging.sql`, `supabase/tests/messaging_m2.sql`, `supabase/tests/messaging_m3.sql`, `supabase/tests/messaging_m4.sql`, `supabase/tests/messaging_m4b.sql`, `supabase/tests/push.sql`, `supabase/tests/messaging_m6a.sql`, `supabase/tests/messaging_m6b.sql` and `supabase/tests/account_deletion.sql`
check the access rules directly in SQL. Paste each into the **test project's** SQL editor; each runs inside a transaction that is rolled
back and ends with `ALL … CHECKS PASSED`.

## Live check

A read-only check of the **live** app (https://avx-beta.vercel.app) after a release. The Dispatcher
starts it once the release is merged: GitHub → Actions → **Live check** → *Run workflow* (the
`base_url` box defaults to production). It never runs on pull requests or pushes, and
`playwright.config.js` ignores `e2e/live/`, so PR CI never picks it up.

**What it checks** (`e2e/live/`, `playwright.live.config.js`), with two dedicated accounts of the
company **AVX TEST CO.** on production:

- **Manager** (admin): signs in through the real form, finds the company in its own list of
  organisations, then opens the company home, quotes, contacts, crew, jobs, hours, appointments,
  leave, expenses, invoices, reports, tasks, inventory, Messages, Settings and My work. Each must
  draw with no error message, no crash and no 5xx answer from Supabase or Vercel.
- **Crew** (viewer): My work, My hours, My appointments, My profile and Tasks render; the company's
  reports, invoices, expenses, crew search and everyone's hours show their "only admins and members"
  message; with the crew's own session, the company's crew rates read as empty, reading
  `profiles.phone` is refused (column grants, 0.82.3) and `my_profile()` returns only their own row.
- **Accessibility:** the same axe check as the PR tests on a few of those screens.
- Each test signs out at the end.

**Read-only.** Every test routes the browser through a guard (`e2e/live/guard.js`) that aborts any
request that would write before it leaves the browser: changes to database tables, database
functions that can write (the public functions marked volatile), file uploads, Edge Functions
(except the invoicing programs list), and auth calls other than signing in and out. The test then
fails, naming the request by method and path. One write the app makes by itself is blocked without
failing: Expenses adding its starter categories the first time it opens (listed in the test's notes).
The tests never click anything that saves, sends, invites, deletes or creates.

**Secrets** (Settings → Secrets and variables → Actions → Secrets): `LIVE_MANAGER_EMAIL`,
`LIVE_CREW_EMAIL` and `LIVE_PASSWORD` (the same password for both). A missing one fails the run
instead of skipping it. `LIVE_ORG_NAME` (optional) changes the company name looked for. The output
names roles, screens and request paths only, never emails, tokens or phone numbers; the traces
uploaded on a failure (kept 7 days) hold the pages as the accounts saw them.

**Trying it without production:** build against the test project, make two accounts there (a manager
whose company is named `AVX TEST CO.`, and a crew member invited to it as a viewer), then run
`LIVE_BASE_URL=http://localhost:4173 LIVE_MANAGER_EMAIL=… LIVE_CREW_EMAIL=… LIVE_PASSWORD=… npx playwright test -c playwright.live.config.js`
(a local address starts the preview itself). The workflow refuses localhost and the test project.

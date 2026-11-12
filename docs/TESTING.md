# Testing

| What | Command | Runs in CI |
|---|---|---|
| Lint + unit tests + build | `npm run check` | always (`check` job) |
| Browser smoke tests (no account needed) | `npm run build && npm run test:e2e` | always (`e2e` job) |
| Signed-in smoke tests (test project, `@smoke`) | see below | on PRs when `E2E_AUTH_ENABLED` is `true` (`e2e-auth` job) |
| Every signed-in test (test project, all tags) | see "Automated test suite" | every night (**E2E nightly** workflow) |
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

## Automated test suite

The owner's manual test list (docs/PENDING.md section 2, T1–T187) is being turned into signed-in
Playwright tests, one spec file per feature area (`e2e/auth/<area>.spec.js`), so only what needs a
person or a real device is left to try by hand. Which T-line belongs to which area:
`docs/notes/AT-map.md` (until the release folds it in).

### When it runs

- **Pull requests** (`e2e-auth` job in `ci.yml`): only the tests tagged `@smoke`, about 2 minutes of
  tests: three steps of the journey (the form sign-up with an organisation and a gig, adding crew to
  the gig, and the form sign-in that deletes the account), one import check, the broken-session
  check, and exactly one path per area file. Everything else (the reports, the five wrong
  passwords, the rest of the journey and the import) runs every night. A new area file tags one
  test `@smoke`, no more: several PRs run against the same test project at once, and a long smoke
  run made them slow each other down until reports hit the database's 8 s limit (#194).
  Only two tests go through the sign-in form; every other test signs in once through the API and
  reuses that session (`pageAs`, `signInPage`). When the test project still answers 429 (its
  sign-in limit), or a sign-up through the API gets no answer or a 5xx, the helpers wait 2, 4, 8
  (and 16) s and try again; only those are retried, never a failed test. Checks in signed-in runs
  wait 10 s (not Playwright's 5): a save on the shared database may take up to its 8 s limit and
  still succeed. The job has no Playwright retries, so a real failure stays red.
- **Every night** (`.github/workflows/e2e-nightly.yml`): every signed-in test, at 03:07 UTC (03:07 in
  Lisbon in winter, 04:07 in summer), split in 4 shards, two running at a time (four at once
  overloaded the test project until its database restarted, #239), one test at a time inside each. Each shard tags its accounts `gh<run>-<attempt>-s<shard>` and sweeps them afterwards,
  even when a test failed. A failed night opens one issue, **"Nightly e2e tests failing"** (label
  `needs-triage`), listing the failing tests with a link to the run and its traces (kept 7 days), or
  adds a comment to that issue if it's still open. Close it when the nights pass again. Started by
  hand: Actions → **E2E nightly** → *Run workflow*. It never overlaps itself.
- The live check of production (`e2e/live/`) is separate and in neither.

### Running it locally

```bash
export VITE_SUPABASE_URL=https://idvebeadnrxudfgortzg.supabase.co
export VITE_SUPABASE_ANON_KEY=<test project anon key>
npm run build
export E2E_AUTH=1 E2E_RUN=me1                      # your own tag, to sweep afterwards
npx playwright test --grep @smoke                  # what a PR runs
npx playwright test gigs.spec.js                   # one area
npx playwright test --grep @gigs                   # the same, by its tag
npx playwright test --shard=1/4                    # one shard of the nightly run
npm run e2e:sweep -- me1                           # remove every account the run made
npm run e2e:sweep -- me1-gigs                      # …or only one area's
```

### The pieces (`e2e/auth/`)

| File | What it gives |
|---|---|
| `fixtures.js` | `test` with ready-made people, each a page **already signed in** (English, closed after the test): `adminWithOrg`, `member`, `viewer`, `crewOnGig` (on the gig, not in the organisation), `secondCompany` (the admin of another, unrelated company). Each gives `{ page, account, org, world }` (`crewOnGig` also `gig`). |
| `setup.js` | Makes the data through the database API with the public key and each account's own sign-in, the same calls as the app, so the access rules apply (no service role anywhere): `createAccount`, `journeyAccount` (the older journeys' accounts, one sign-in per account), `signInPage` (signs the test's own `page` in with that session), `addOrg`, `addToOrg`, `addGig`, `addToGig`, `addItem`, `addClient`, `addQuote` (priced with the app's own quote maths), `pageAs` (a page signed in as any account). `world` (one per area) makes the shared organisation, gig and people once and reuses them. |
| `accounts.js` | Run tag, password, `ROLES` and `AREAS`. Area accounts are `e2e-<role>-<run>-<area>@example.com`. A new role or area must be added here, or the sweep won't find it (the set-up refuses unknown ones). |
| `helpers.js` | `english`, `signUp`, `signIn` (through the form), `expectAccessible` (axe; serious or critical fails), `reportLoaded` (pass what the view shows once loaded: the wait then can't pass before the view starts loading), `changePeriod`, `deleteAccount`, `waitForServiceWorker` (bounded, one reload; #206). |
| `stubs.js` | Stand-ins for outside calls: `stubTownSearch` / `stubTownSearchDown` (geocode → LocationIQ) and `stubCompanyCheck` (vies-check → VIES). They answer the browser only; the database doesn't change. |
| `files.js` | `readZip` + `zipText` (zip exports, with fflate), `readPdfText` (unpdf), `parseIcs` (calendar files and feeds), `totpCode` (the current two-step code for a secret, with otpauth). |
| `testSupport.js` | The test-only database functions (below): `makeAvxAdmin`, `expire`, `runRecurringExpenses`, `runOverdueInvoiceReminders`, `runHeldInviteReminders`, `runMaintenanceReminders`, `emailSummaryCandidates`. |
| `e2e/fixtures/` | Sample files, made-up data: an xlsx, a Windows-1252 CSV, a Rentman-style CSV, a contacts CSV (its README says how to add one). |

Each signed-in run starts a list, `.e2e-accounts/<run>.txt` (not committed; `global-setup.js`), and
the set-up writes each account it makes into it (the older journeys' accounts too); the sweep tries
exactly those, and an account the busy database couldn't delete (statement timeout) is tried again
on a later pass, 20 s on. Without that list (a run from another
machine) it tries every role in every area, which is slow: the test project limits sign-ins, so it
waits a minute whenever it reaches the limit. `scripts/e2e-sweep.test.js` checks which addresses it
tries.

### test_support (test project only)

Some checks need what a person can't do from the app during a run: become an AVX admin, make
something expire now, or run a daily job (recurring expenses, overdue-invoice reminders,
held-invitation reminders, inspection reminders, the morning email summary's list) for one
organisation now. `supabase/tests/support/test_support.sql` adds these as functions in a schema
`test_support`. They refuse anyone whose email isn't `e2e-…@example.com`, and only touch rows of such
accounts, or of organisations where the caller is admin and **every** member is a test account.

**Installing it (owner, once, on the TEST project only; never production):** SQL editor → paste
`supabase/tests/support/test_support.sql` → Run; then Project Settings → Data API → *Exposed schemas*
→ add `test_support` → Save; then run `supabase/tests/test_support_check.sql`, which must end with
`ALL TEST SUPPORT CHECKS PASSED`. Until then, the tests that need it skip with "test_support not
installed". Run the file again whenever it changes (it's safe to re-run). Its daily jobs are copies
of the real ones limited to one organisation: when a real job changes, change its copy too.

### Writing an area spec (template)

One file per area, `e2e/auth/<area>.spec.js`, with the area in `AREAS` (`accounts.js`). It gets its
own organisation and accounts, so it never depends on another file or on the order files run in.
Tag every test with the area; exactly **one** test (the most important path, quick) also gets
`@smoke`. Above each test, say which T-lines of docs/PENDING.md it covers (`// covers: T12, T13`), so
the owner can strike them from the manual list. Translations and screens are checked in English
unless the test is about Portuguese.

```js
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'

test.use({ area: 'gigs' })

// covers: T3, T8
test('the admin adds a schedule item and the crew see it', { tag: ['@smoke', '@gigs'] }, async ({ adminWithOrg, crewOnGig }) => {
  const { page } = adminWithOrg
  const gig = crewOnGig.gig
  await page.goto(gig.path)
  // … click through what the T-line describes …
  await expectAccessible(page)
  await crewOnGig.page.goto(gig.path)
  // … and check what the other person sees
})

// covers: T23
test('a viewer can\'t change the gig', { tag: '@gigs' }, async ({ viewer, world }) => {
  const gig = await world.gig()
  await viewer.page.goto(gig.path)
  // …
})
```

Data a test only needs to exist (an item, a quote, a client) comes from `setup.js`, not from the
forms; click through the forms only for what the test is checking. A test that needs test_support
calls its helper, which skips the test while test_support isn't installed. `e2e/auth/foundation.spec.js`
is a worked example of each fixture.

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
- **Crew** (viewer): the crew account **must be a Viewer** of the company (Members → its role), or
  not a member at all. If it is a Member or Admin, the check stops with "the crew test account is a
  Member/Admin of the company; make it a Viewer", because those roles may open the screens below.
  My work, My hours, My appointments, My profile and Tasks render; the company's
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

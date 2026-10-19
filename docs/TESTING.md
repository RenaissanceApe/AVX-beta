# Testing

| What | Command | Runs in CI |
|---|---|---|
| Lint + unit tests + build | `npm run check` | always (`check` job) |
| Browser smoke tests (no account needed) | `npm run build && npm run test:e2e` | always (`e2e` job) |
| Signed-in journeys (test project) | see below | when `E2E_AUTH_ENABLED` is `true` (`e2e-auth` job) |

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
   | `TEST_SUPABASE_ANON_KEY` | the test project's anon key (Project Settings → API; it's public, like the production one in `.env`) |
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

If a run is interrupted, leftover `e2e-…@example.com` users can be removed in the test project →
Authentication → Users.

### Database access rules

`supabase/tests/rls_smoke.sql`, `supabase/tests/quotes_rls.sql`, `supabase/tests/phase4b_rls.sql`,
`supabase/tests/phase4c_rls.sql`, `supabase/tests/mfa_rls.sql`, `supabase/tests/usage.sql`,
`supabase/tests/my_gig_companies.sql`, `supabase/tests/reservations_people.sql`, `supabase/tests/inventory.sql`, `supabase/tests/equipment_availability.sql`, `supabase/tests/warehouse.sql`, `supabase/tests/kits.sql`, `supabase/tests/maintenance.sql`, `supabase/tests/subrentals.sql`, `supabase/tests/network.sql`, `supabase/tests/messaging.sql` and `supabase/tests/messaging_m2.sql`
check the access rules directly in SQL. Paste each into the **test project's** SQL editor; each runs inside a transaction that is rolled
back and ends with `ALL … CHECKS PASSED`.

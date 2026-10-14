# AVX Beta — Setup Guide

## What this is
A fully functional web app — real auth, real database, real file uploads.
Built on React + Supabase. Takes ~15 minutes to have running live.

---

## Step 1 — Create a free Supabase project

1. Go to https://supabase.com and sign up (free)
2. Click **New Project**
3. Name it `avx-beta`, choose a region close to Portugal (e.g. West EU)
4. Save your database password somewhere safe
5. Wait ~2 minutes for the project to provision

---

## Step 2 — Run the database schema

In your Supabase dashboard, go to **SQL Editor → New query** and run these two files, in order:

1. `supabase/migrations/20260926000000_initial_schema.sql` — tables
2. `supabase/migrations/20260926000001_pilot_hardening.sql` — access rules, triggers, crew invites and the private `gig-assets` storage bucket with its policies
3. `supabase/migrations/20261014000000_data_integrity.sql` — foreign keys and length limits
4. `supabase/migrations/20261015000000_org_members_and_accounts.sql` — organisation members and invites
5. `supabase/migrations/20261015000001_invite_claims_and_account_deletion.sql` — invite claiming at sign-up, account deletion
6. `supabase/migrations/20261016000000_schedule_activity_realtime.sql` — schedule, activity log, phone numbers, realtime

(Run every file in `supabase/migrations/` in filename order — new ones get added over time.)
The second file creates the storage bucket and its policies too, so there is no manual Storage step.

To check the access rules, run `supabase/tests/rls_smoke.sql`; it should end with `ALL CHECKS PASSED`.

---

## Step 3 — Configure Auth URLs (required)

In Supabase → **Authentication → URL Configuration**:
- **Site URL**: your live URL, e.g. `https://avx-beta.vercel.app`
- **Redirect URLs**: add `https://avx-beta.vercel.app/**` (and `http://localhost:5173/**` for local dev)

Without this, confirmation and password-reset emails link to `localhost` and don't work.

Recommended while you're in Auth settings:
- **Emails → SMTP Settings**: connect a real sender (Resend, Postmark, Brevo). Supabase's built-in email is rate-limited to a few messages per hour and is meant for testing only.
- **Providers → Email → Password security**: set the minimum length to 8 (matches the app). Leaked-password protection needs a paid plan.

---

## Step 3b — Edge Function and emails

- Deploy the invite function: `supabase functions deploy send-invite` (Supabase CLI), or paste
  `supabase/functions/send-invite/index.ts` into Supabase → Edge Functions. Keep "Verify JWT" on.
- Follow [docs/EMAIL.md](docs/EMAIL.md): custom SMTP, sender domain DNS, no click tracking, and the email templates.
- Optional: [docs/BACKUPS.md](docs/BACKUPS.md) for daily encrypted backups.

---

## Step 4 — Get your API credentials

In Supabase dashboard → **Settings → API**:
- Copy **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
- Copy **anon public** key (long string starting with `eyJ...`)

---

## Step 5 — Configure the app

Copy `.env.example` to `.env` in the root of this project and fill in:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJyour-anon-key-here
VITE_CONTACT_EMAIL=privacy@your-domain.com   # shown on /privacy and /terms
VITE_SENTRY_DSN=                              # optional error monitoring
```

Add the same variables in Vercel → Project → Settings → Environment Variables.

---

## Step 6 — Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 — that's AVX running locally.

---

## Step 7 — Deploy (optional, to share with rental companies)

The easiest free option is **Vercel**:

1. Push this folder to a GitHub repo
2. Go to https://vercel.com → New Project → import your repo
3. Add the two environment variables from Step 5
4. Click Deploy

You'll get a live URL like `avx-beta.vercel.app` to share with your first 10 companies.

Alternatives: Netlify, Cloudflare Pages — all work identically.

---

## What works, and what's next

See [ROADMAP.md](ROADMAP.md) for what's in the beta, known limitations and the phased plan.

---

## Questions?
Ricardo Bedulho · Lumen and Pixel, Lda.

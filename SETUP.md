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

The second file creates the storage bucket and its policies too, so there is no manual Storage step.

---

## Step 3 — Configure Auth URLs (required)

In Supabase → **Authentication → URL Configuration**:
- **Site URL**: your live URL, e.g. `https://avx-beta.vercel.app`
- **Redirect URLs**: add `https://avx-beta.vercel.app/**` (and `http://localhost:5173/**` for local dev)

Without this, confirmation and password-reset emails link to `localhost` and don't work.

Recommended while you're in Auth settings:
- **Emails → SMTP Settings**: connect a real sender (Resend, Postmark, Brevo). Supabase's built-in email is rate-limited to a few messages per hour and is meant for testing only.
- **Providers → Email → Password security**: enable leaked-password protection and a minimum length of 8.

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
```

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

## What works in this beta

- ✅ Sign up / sign in (email + password)
- ✅ Create organisations (your rental company)
- ✅ Create gigs with name, venue, dates, status, description
- ✅ Upload assets (patch lists, plots, schedules, riders, documents, images)
- ✅ Automatic asset versioning — uploading a new patch list supersedes the old one
- ✅ Crew assignment with function title and call time (add by email; pending invites claimed on sign-up)
- ✅ Password reset
- ✅ Gig feed — post updates, mark as important
- ✅ Overview dashboard per gig

## What's not in this beta (coming in MVP proper)

- Invite emails (adding crew works: existing users are added at once, new people are added automatically when they sign up with the invited email — you share the link yourself)
- Push notifications
- Offline mode
- Rentman integration

---

## Questions?
Ricardo Bedulho · Lumen and Pixel, Lda.

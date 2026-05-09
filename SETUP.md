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

1. In your Supabase dashboard, go to **SQL Editor → New query**
2. Open `src/lib/supabase.js` in this project
3. Copy the entire SQL block inside the `/* ... */` comment
4. Paste it into the SQL editor and click **Run**

---

## Step 3 — Create the file storage bucket

1. In Supabase dashboard, go to **Storage**
2. Click **New bucket**
3. Name it exactly: `gig-assets`
4. Keep it **private** (not public)
5. Click **Create bucket**

Then set the storage policy — in **Storage → Policies**, add a policy for `gig-assets`:
- Operation: ALL
- Target roles: authenticated
- Policy: `(auth.uid() IS NOT NULL)`

---

## Step 4 — Get your API credentials

In Supabase dashboard → **Settings → API**:
- Copy **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
- Copy **anon public** key (long string starting with `eyJ...`)

---

## Step 5 — Configure the app

Create a `.env` file in the root of this project:

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
- ✅ Crew assignment with function title and call time
- ✅ Gig feed — post updates, mark as important
- ✅ Overview dashboard per gig

## What's not in this beta (coming in MVP proper)

- Magic link / passwordless join for crew
- Push notifications
- Offline mode
- Rentman integration
- Email invites (invite flow shows the UX but needs a backend email service like Resend)

---

## Questions?
Ricardo Bedulho · Lumen and Pixel, Lda.

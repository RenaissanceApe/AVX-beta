# Waiting on you

Everything since the inventory build started (0.13.0, PR #14) that needs a decision, a setting
or a test from you. Checked against the live database and GitHub on 2026-10-19. Tick items off
here (or tell Claude) so this list stays true.

**What the live database says today:** 1 organisation, 3 people, 3 gigs, 1 quote. The catalogue,
locations, stock, gig equipment and messages are all **empty**, no notification has ever been
created, and nobody has turned on two-step sign-in. So inventory, warehouse scanning, kits,
maintenance, subrentals, reports, the network picker and messaging have **never been used with
real data**. They pass their automated checks, but none of it has been tried by a person.

Already done (no action): company details with NIF, address and default terms; Brevo secrets and
the domain authenticated in Brevo (SPF, DKIM, DMARC); daily database backups (running); daily
email summary (running, nothing to send yet).

**How this list is used (agreed 2026-10-19):** the tests in section 2 are run **once, at the end of
the build**, not after each PR. Each new phase adds its lines to section 2, so the list is complete
when building finishes.

## 1. Foundations: without these the new features can't be used

| # | What | Where | Why |
|---|---|---|---|
| F1 | **Load your catalogue.** Inventory → Catalogue → Import: paste rows from a spreadsheet (name; category; code; quantity; price; location). Do 10–20 items first, then the rest | App | Everything in inventory (availability, packing lists, scanning, kits, reports) starts from items |
| F2 | **Create your locations**: the warehouse, each van | Inventory → Locations | Stock has to sit somewhere |
| F3 | **Set prep and return days** (both are 0 now). E.g. 1 day before and 1 after each gig | Organisation settings | Otherwise gear is "free" on the day before a gig, when it's actually being prepped |
| F4 | **Add serial-numbered units** for gear you track one by one (speakers, desks, projectors) and **print QR labels** | Item page → Add units; Inventory → QR labels | Scanning out/in only works with labels |
| F5 | **Turn on two-step sign-in** for your own admin account | Tap your initials (top right) → Account → "Two-step sign-in" → **Turn on**; scan the QR code with an authenticator app and type the 6-digit code | Recommended for admins; nobody has it on yet |
| F7 | Optional: **click tracking off** in Brevo, and a custom domain for the app itself (now avx-beta.vercel.app) | Brevo settings; Vercel → Domains | The "not secure" link warning; a nicer address |
| F8 | **Switch on the signed-in browser tests.** The SQL part is already done. Left: (a) Supabase "AVX test" → Authentication → Sign In / Providers → Email: turn off **Confirm email**; URL Configuration: Site URL `http://localhost:4173` and redirect URL `http://localhost:4173/**`. (b) GitHub repo → Settings → Secrets and variables → Actions → **Variables** tab → add `TEST_SUPABASE_URL` = `https://idvebeadnrxudfgortzg.supabase.co`, `TEST_SUPABASE_ANON_KEY` = the test project's anon key (Project Settings → API), `E2E_AUTH_ENABLED` = `true` | Supabase test project; GitHub settings | They've been **skipped on every PR** so far, so sign-up, invites and uploads aren't tested automatically |
| F9 | Optional: `SUPABASE_SERVICE_ROLE_KEY` GitHub secret to back up uploaded files, not just the database ([BACKUPS.md](BACKUPS.md)) | GitHub → Secrets | Files aren't in the backup today |

## 2. Final test list (run once, at the end of the build)

Use your second email address as a crew member. Each line is a few minutes. New phases add lines here.

| # | Try | Built in |
|---|---|---|
| T1 | Invite the second account to a gig; check the invite email, the bell, and the next morning's email summary | 2b, 3 |
| T2 | **Messages:** send a direct message both ways, chat in a gig's Chat tab, reply to a message, mute, change the gig's venue and see it posted in the chat | M1 (0.21.0) |
| T3 | **Double booking:** put the second account on two overlapping gigs; use "Ask availability" and answer it from the other account | 5a |
| T4 | **Equipment on a gig:** plan gear, go past what you own, see the ⚠, try "Subrent N" and an alternative | I2, I4, I6 |
| T5 | **Scanning on an iPhone and an Android phone:** open Scan out / in, allow the camera, scan a printed label, scan a return as damaged | I3 |
| T6 | **Report damage from site** with a photo, as the crew account; check the repair appears under Maintenance | I5 |
| T7 | **Quote → gig:** add catalogue items to a quote, run Availability, accept it from the client link, fill the gig from it | I2, 4c |
| T8 | **Your network:** after the second account has shared a gig with you, find them by name in Invite crew | 5c |
| T9 | **Cross-hire:** only if a second company joins: link codes and send a hire request | I6 |
| T10 | **Reports** after a few gigs with gear: do the numbers look right to you? | I7 |
| T11 | **Delete a test gig** (two-step warning) to confirm deletion still works with equipment and messages attached | 4b |
| T12 | **Messages M2:** in a gig chat attach a photo and a PDF, share a schedule item, @mention the second account (and, as manager, @crew), react, edit a message and look at its earlier version, remove one, copy a message link and open it | M2 (0.22.0) |
| T13 | **Messages M3:** as admin, create an organisation channel ("Everyone", then "Only admins write"); send an announcement and confirm it from the second account; pin a message; open a department chip in a gig's Chat (as crew you only see your own function); search for a word; save a message and find it under Saved | M3 (0.23.0) |
| T14 | **Messages M4a:** ask the second account if they're available (Crew → a clash → Ask) and answer from their Messages; send a crew call for a position to the second account and accept it there (they join the gig); open the call sheet and "Send to the crew", then confirm from the second account; add two schedule items and see one note in the gig's chat; open "Team conversation" on an item, a repair and a subrental | M4a (0.24.0) |
| T15 | **Messages M4b:** send a quote to your own second email and write from the quote's page (signed out, or in a private window); answer from the quote's Summary tab; make a supplier link on a subrental, open it in a private window, write, and answer from the subrental; make a new link and check the old one stops working | M4b (0.25.0) |
| T16 | **Messages M5a:** on your phone (iPhone: add AVX to the home screen first) turn on Account → Notifications on this device and "Send a test"; lock the phone and send it a message from the second account; tap the notification. Then turn on airplane mode, write a message, turn it off and see it sent | M5a (0.26.0) |
| T17 | **Messages M6a:** from the second account, report a message of yours in a gig's chat; as the gig's manager, open the notification and choose Keep it, then report another and Remove it (the second account sees "Removed by a moderator" and a notification). In a direct conversation, block the second account and check neither of you can write; unblock from Account | M6a (0.27.0) |
| T18 | **Messages M6b:** run `supabase/migrations/20261108000001_message_retention_delete.sql` by hand in the SQL editor (test, then production). As admin open the organisation's settings: check the usage line; choose "For 2 years" and read the warning (cancel or confirm); download all messages and open the file | M6b (0.28.0) |

## 3. Decisions still open

Each has a default already built; nothing is blocked. Say "keep" or "change".

| # | Question | Built today | Since |
|---|---|---|---|
| D1 | Should a **freelance PM** (not in your organisation) count as a "manager" in the network picker? | No: they count as crew and only find people who chose "also other crew" | 5c |
| D2 | Should organisation **members** who aren't on a gig be able to **post in its chat**? | No: they can read; crew, PMs and admins post | M1 |
| D3 | Can organisation admins **and members** plan equipment on **any** gig of the organisation? | Yes (the warehouse people) | I2 |
| D4 | Text the database writes itself ("Damaged on return", "Failed inspection (PAT)") is in **English** only | English | I5 |
| D5 | Writing off a **bulk** item doesn't remove it from stock; you remove the quantity yourself | Manual | I5 |
| D6 | A subrental counts as stock only for dates it covers **completely** | Full cover only | I6 |
| D7 | A supplier linked to another AVX company shows as "on AVX", not that company's name | Hidden | I6 |
| D8 | A **case can't go inside another case**; lowering a quantity doesn't remove the accessories it added | As described | I4 |
| D9 | Lines typed by hand in a quote (not from the catalogue) **aren't checked for availability** | Skipped, and the check says how many | I2 |
| D10 | Organisation **time zone**: everything is read as Lisbon time; needed once a company abroad joins (the job board is international) | Lisbon only | 5a |
| D11 | **Phone app** (wrapper around this app vs. the installed web app) | Planned for the end of the build, after T5 shows how scanning behaves | I3 |

## 4. Before a public launch (already in the roadmap)

- Vercel Pro ($20/month): the free plan doesn't allow commercial use. Deferred while the beta runs.
- Full terms of use, then a legal review of the privacy notice and terms.
- Supabase Pro (daily backups you can restore, leaked-password check) once real companies use it.

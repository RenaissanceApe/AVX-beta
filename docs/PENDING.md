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
| T19 | **Help H1:** on your phone tap a few ⓘ (organisation settings, a quote, an item) and the ? next to page titles; open Help from More, search a word, tap a dotted word in the booking window. Review the Portuguese wording of the glossary (`src/help/pt.js`) | H1 (0.29.0) |
| T20 | **Help H2a:** on your phone open Help and read two crew guides and two production-manager guides; on a gig tap ? and open a guide there (then go back). Review the Portuguese wording of the guides (`guides` in `src/help/pt.js`) and say if any picture shows the wrong thing | H2a (0.30.0) |
| T21 | **Help H2b:** open Help and read a few warehouse, office and admin guides (on a computer too); check the pictures show the right screens. Review the Portuguese wording of the new guides (`guides` in `src/help/pt.js`) | H2b (0.31.0) |
| T22 | **Help H3:** on your phone open Account → Appearance: try Light outside in daylight, High contrast, Extra large text, Comfortable mode and the easy-to-read font; walk through a gig, Messages and a quote in each. Say if anything is hard to read or out of place (and whether you like the new navy and lime) | H3 (0.32.0) |
| T23 | **Help H4:** make a new crew-only account (invite a second email to a gig): its home should be the simple one with the next gig and call time; tap Call sheet, Chat and Report damage. In Account → Appearance switch Simple mode Off and On. As admin of a new organisation, follow the first-steps card to the end. Open an empty gig's tabs and an empty catalogue: each should say what to do | H4 (0.33.0) |
| T24 | **Help H5a:** on an Android phone and an iPhone open a gig's Scan out / in → **Scan mode**: scan a few labels and listen (one high beep = fine, two = warning, low buzz = problem); feel the vibration (Android); try the torch (Android) and "Say it aloud". On the call sheet try **Large print** (also printed) and **Read aloud** (is the Portuguese voice European?). Remove a schedule item and an equipment line and press **Undo**; remove one and wait: it's gone after 8 seconds | H5a (0.34.0) |
| T25 | **Help H5b:** on a gig with equipment open Scan out / in: choose **Prepped** and scan a few labels, then **Out (loaded)**; press **Undo** on one scan and check the count drops. Look at the bars on the gig's Equipment tab and the Step column on the packing list. In the organisation's settings untick "On site" and check it disappears from the scan screen | H5b (0.35.0) |
| T26 | **Field tools F1a:** on a gig open **Tools** → "Add a tool" → Input list; add a few channels (one with 48V, one linked to a mic from the catalogue), move one with the arrows, tick two as checked, print it. Press "Add mics and DIs to equipment" and look at the Equipment tab. Open the gig as the second (crew) account: the Tools tab shows the list read-only. Check **Updates** shows the posts and the history. In organisation settings untick Input list | F1a (0.36.0) |
| T27 | **Field tools F1b:** on a computer, add a **Stage plot** to a gig, set the stage size, add a drum kit, two vocal mics, a bass amp and two wedges; drag them into place, name the mics, rotate the wedges. Press "Send to the input list" and check the new channels. On your phone, open the plot as crew and print it from the computer. Is the library missing anything you use often? | F1b (0.37.0) |
| T28 | **Field tools F2:** on a gig with an input list add **Patch**: add SB1 (16 inputs, split) and SB2 (8); choose a few sockets, then "Fill the free sockets"; print it. Add **DMX patch**: add 8 spots (14 channels) and 4 LED pars (7) on universe 1, edit one address to overlap and see the warning, print it. Are the names and columns what your crew expects? | F2 (0.38.0) |
| T29 | **Field tools F3:** on a gig with a DMX patch add **Light plot**: add a truss and a pipe, drag them into place, give each a phase. Select the truss → "Add fixtures here" (6 spots); hang the other fixtures from "not on the plot"; drag one fixture to the other bar. Set the supply (e.g. three phase, 32 A) and check the power per phase; print it. Are the symbols, names and power figures what your lighting crew expects? | F3 (0.39.0) |
| T30 | **Field tools F4:** add the **Sound system calculator** to a gig: add two mains, subs and two delays, then FOH and the back of the room. Put a delay 30 m out (front/back −30) and check its delay (about 100 ms + the Haas offset). Change the temperature and see the delays change; type an extra delay on a tower until the back of the room says "echo". Do the figures match what your system tech would set? Print it | F4 (0.40.0) |
| T31 | **Import wizard (S1a):** first run `supabase/migrations/20261117000001_import_undo.sql` by hand (after the other migrations) in the SQL editor (test project, then production) and `supabase/tests/import_undo.sql` on test. Then in Inventory → Import, using an export from the mock Rentman account (or any spreadsheet): import the warehouses as Locations, the equipment list as Equipment (check the guessed columns, save the matching as a preset), then serial numbers as Units. Import the same file again and see it match instead of doubling. Undo one import, and try to undo one whose equipment is already on a gig. Are the column guesses and messages clear? | S1a (0.41.0) |
| T32 | **Import S1b:** export a sheet from Excel as **.xlsx** (not CSV) and import it: the columns should be read as in the CSV. Then import **kit contents** (one row per part: the case or set, what goes in it, how many), check a case's contents on its item page, import the same file with one quantity changed, and undo that import. Note: the undo file to run by hand is now `20261117000001_import_undo.sql` (renamed again in S2) | S1b (0.42.0) |
| T33 | **Contacts (S2):** after the hand-run file (T31), also run `supabase/tests/contacts_import.sql` on test. Open Quotes → **Contacts**. If you have quotes, press "Add them to contacts" and check the clients it made. Add a client by hand, then on a draft quote pick it under "Client from contacts" and see the details fill in; type a new client on another quote and "Save to contacts". Import the clients (and suppliers) from the mock Rentman account's contacts export: are the Dutch headings guessed, the address put together, and a second import matched instead of doubled? Open a client to see their quotes; archive one. Is the Portuguese wording right? | S2 (0.43.0) |
| T34 | **Crew import (S3a):** as an admin, open Members → "Import your crew from a file" and import the crew list from the mock Rentman account (or a spreadsheet with e-mails, names, functions and a role column). Check that **nobody got an e-mail**. In Members, the "not invited yet" list: change a role, discard one person, then send the rest (use addresses you can read). Do the invitations arrive, and do people with an AVX account join at once? Import the same file again: nothing doubles. Is the Portuguese wording right? | S3a (0.44.0) |
| T35 | **Jobs and quotes (S3b):** from the mock Rentman account, export the upcoming projects, their planned equipment and a few open quotes (or make spreadsheets like them). In Inventory → Import: Upcoming jobs (check that past and cancelled ones are left out and statuses are right), then Equipment on jobs (check a gig's Equipment tab: the gear is booked, clashes show), then Open quotes (open one: lines, sections, prices, client). Import the jobs file again after changing a date: the gig changes, nothing doubles. Is the Portuguese wording right? | S3b (0.45.0) |
| T36 | **New versions without the Vercel page:** after the next merge, open the app from the address you normally use (or the installed app), switch to another app and back: it should reload into the new version by itself. Always use `avx-beta.vercel.app`, not a link with extra words in it (those are fixed snapshots of one version) | 0.45.0 |

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

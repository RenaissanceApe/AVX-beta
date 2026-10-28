# Changelog

## 0.63.0 — Limits on emails and push notifications

### Added
- **Send limits.** AVX now caps how many emails and push notifications it sends, so a fault in
  a screen or someone misusing an account can't flood Brevo and get the sending domain blocked:
  - **Invite emails:** 40 an hour and 150 a day per person, 300 a day per organisation, and at
    most 3 a day to the same address (inviting the same person again no longer emails them
    every time).
  - **Quote emails:** 20 an hour and 60 a day per person, 100 a day per organisation, and 5 a day
    to the same address.
  - **Email summary:** at most one per person every 20 hours, and 2,000 per run.
  - **Push notifications:** 60 an hour per person; test notifications 5 an hour.
  - **All emails together:** 250 a day, under Brevo's free plan (300 a day). Raise it after
    upgrading Brevo (see docs/PENDING.md).
- Over a limit, the invite is still saved and the quote link is still made; the app says the
  email wasn't sent and suggests sharing the link instead (EN, PT).
- Database checks for the limits (`supabase/tests/send_limits.sql`).

## 0.62.1 — Privacy and security check before more users

### Added
- **Data map** (docs/DATA_MAP.md): what personal data AVX keeps, where, who sees it, why and for how
  long, with the open items.
- **Security review** (docs/SECURITY_REVIEW.md): a whole-app pass against the OWASP Top 10. Nothing
  exploitable found; what's left is listed.
- **Browser tests for sign-in going wrong** (`e2e/auth/failures.spec.js`): wrong passwords five
  times, unknown emails, password reset and sign-in links for unknown emails, a short password and
  a malformed email at sign-up, and a broken session. They check that nothing reveals whether an
  email has an account.

### Changed
- **Privacy notice** (EN, PT): now covers tasks, repairs and inspections, organisations' own fields
  and two-step sign-in; dated 28 October 2026.
- Sign-in errors are announced by screen readers.
- Updated `ws`, `@remix-run/router` and `fflate` for security advisories (none was reachable in AVX).

### Connected to earlier features
- Sign-in and two-step sign-in, the crew network, tasks (T1, T2), maintenance, custom fields (S2)
  and the organisation export (S5), as described in the privacy notice and data map.

## 0.62.0 — Your own fields on gigs, clients, suppliers and items

### Added
- **Custom fields** (Organisation settings → "Custom fields", admins): add your own fields to gigs,
  clients, suppliers or catalogue items, such as "PO number", "Venue capacity" or "Insurance checked".
  - Six kinds: text, number, date, yes / no, choice from a list (one option per line) and link.
  - Up to 40 per kind of record. Rename, edit the choices or reorder with the arrows at any time; a
    field's kind can't change.
  - Removing a field (it asks first) hides it everywhere. Values already filled in are kept and still
    come out in the export.
- **In the forms:** the new-gig and edit-gig forms, the client and supplier forms and the catalogue
  item form show the fields after the built-in ones. The database checks every value against its
  field (a number is a number, a choice is one of the list, a link starts with http(s)://).
- **On the pages:** a gig's overview shows the filled-in fields under "More details"; a catalogue
  item's page lists them with its other details. Clients and suppliers show them in their form.
- **Search:** the gigs search also finds text and numbers in a gig's fields.
- **Export:** the organisation export has one column per field, named after it, in the gigs, clients,
  suppliers and items files.
- Help: guide "Add your own fields", with a picture.

### Connected to earlier features
- Gig statuses and types (S1, 0.61.0): the fields sit next to them in the gig forms and in the same
  organisation settings.
- The organisation export (S5): extra columns per field.
- Contacts (clients and suppliers), the inventory catalogue and the gigs list search.
- Not yet: the file imports (S3) don't map columns to custom fields.

## 0.61.0 — Your own gig statuses and gig types

### Added
- **Gig statuses** per organisation (Organisation settings → "Gig statuses and types", admins):
  your own names and colours ("Option", "Pencilled", "Invoiced"…).
  - Each one means one of AVX's five (draft, confirmed, active, done, archived), which still decide
    what is upcoming, past or archived.
  - "Start with a common set" adds six to rename; reorder with the arrows; remove (it asks first).
  - Changing what a status means moves its gigs; removing it keeps its gigs where they were.
- **Gig types** ("Festival", "Corporate", "Theatre"…) with colours, managed the same way.
- **On gigs:** the new-gig and edit forms offer your statuses (or the five built-in ones when you
  have none) and the gig types. The gig header and the gigs list show them in their colours; a new
  gig starts on your first status meaning "confirmed".
- **Gigs list and calendar:** filter by status and by gig type, also in My work across companies.
- **Export:** the organisation export's gigs file has two new columns, the status name and the gig
  type.
- Help: guide "Use your own gig statuses and types", with a picture; the "gig status" term mentions
  them.

### Connected to earlier features
- The five built-in statuses (lists, archiving, past/upcoming, notifications, activity log) are
  unchanged and kept in step by the database.
- Import of upcoming jobs (S3b, 0.45.0): imported gigs get the organisation's status matching what they were
  imported as.
- The organisation export (S5) and the offline copy of the gigs list.

## 0.60.0 — Truss load tables; LumiStage and StageKit compared

### Added
- **Truss load tables** (`src/data/truss/`, docs/TRUSS_DATA.md): 39 tables of allowable loads, copied
  from the manufacturers' own documents, for the rigging tools (RG2).
  - **Fantek:** EC30, EC40, EC29p, EC76.
  - **Global Truss:** F34, F34P, F34PL, F44, F44P, F43, F54, F14, F23, F24.
  - **Prolyte:** H30V, X30V, H40V, the triangle, rectangle and ladder types, S36, S52, S66 and
    B100RV.
  - **Per table:** UDL and point loads per span, with deflections, the manufacturer's conditions,
    and the source document with its address, edition and checksum.
  - **Checks run on every table:**
    - kg against lbs and mm against inches;
    - a second copy of the table where one exists (Prolyte's 2022 data sheets, Global Truss's
      black-finish pages, Fantek's certificates);
    - plausibility rules: no missing spans, loads falling and deflections rising with span, and
      beam-theory ratios at long spans.
  - **Status:** none can be used until a second person has compared it with its source. Four are
    blocked on questions to the manufacturers.
- `scripts/truss-data/`: downloads the documents and rebuilds the data byte for byte.
- `src/lib/trussTables.js` with tests: the plausibility rules fail the tests if a value is edited
  into an impossible state or a table is marked usable without a named checker.

### Docs
- **docs/COMPETITOR_RESEARCH.md:** LumiStage (3D stage planning on Windows) and StageKit (a free
  band rider tool) compared from their own sites.
- **docs/TOOLS_PLAN.md:**
  - a generator suggestion in P1;
  - MVR export;
  - overloaded positions coloured, in RG;
  - in the rider page: start from the line-up, plus a readiness check;
  - proposed, to confirm: venue pages.
- **docs/PENDING.md:** D12–D14.

### Connected to earlier features
- None in the app yet: the light plot's weights per position (RG1) and the rigging tools (RG2) will
  read these tables.

## 0.59.0 — Tasks (T2): organisation tasks, checklist templates, repairs

### Added
- **Organisation → Tasks** (`/org/:id/tasks`): the organisation's own tasks (office, warehouse,
  repairs) and those on its gigs that you can see, in one list.
  - Admins and members add tasks for anyone in the organisation, edit and remove them (removing
    asks first).
  - Filters: Mine, Open, Organisation, On gigs.
  - Gig tasks link to their gig and are edited there; they can be ticked here.
  - The list updates live and can be read offline.
  - Viewers of the organisation can read the list.
- **Checklist templates** (Organisation → Tasks → Checklist templates): a name, a checklist of up
  to 50 items and notes.
  - When starting a task, on a gig or for the organisation, "Start from a template" fills in the
    checklist (added after any lines already typed), and the title and notes if they're empty.
  - Changing or removing a template doesn't change tasks already made from it.
- **Repairs as tasks:** in Inventory → Maintenance, an open repair has "Make a task". It creates a
  task on the organisation with the item, unit and problem, ready to give to someone. A repair
  has at most one task at a time.
- **On-site mode:** your open tasks on the gig, most urgent first, with a button to the gig's
  Tasks tab, and a Tasks tile.
- Help: guide "Organisation tasks and checklist templates", with a picture. The On-site mode
  picture is updated.

### Connected to earlier features
- Tasks T1 (0.58.0): the same lists, task form and notifications. Someone given an organisation
  task gets "… gave you a task: …", opening My tasks.
- Inventory maintenance (I5): repairs.
- On-site mode (0.57.0): the tasks card and tile, also from the gig's offline copy.
- The organisation menu has a new Tasks item.

## 0.58.0 — Tasks (T1)

### Added
- **Tasks** on every gig, in a new **Tasks** tab: who does what by when.
  - Production managers add a task with a title, who it's for (anyone on the gig), a due date,
    notes and a short checklist (one item per line, up to 50), and can edit or remove it (it asks
    first).
  - Anyone who writes on the gig, and the person the task is for, ticks it done and ticks its
    checklist. Others only see it.
  - Overdue, due today and due within three days are marked; "Mine" and "Open only" filters.
  - Live for everyone on the gig, and readable offline from the last copy.
- **My tasks** (My work → My tasks, `/tasks`): every task given to you, on any gig, most urgent
  first, with a link to its gig.
- **Rehearsal notes → tasks:** in a rehearsal session, a production manager turns a note into a
  task in one tap, with the note's cue, text and the same person. A note becomes at most one task.
- **Notifications:** "… gave you a task on …" in the app, by push and in the e-mail summary,
  opening the gig's Tasks tab. Sent even when the organisation is muted, since it's addressed to
  you.
- Help: guide "Give out tasks on a gig", with a picture.

### Fixed
- The gig page had a second "main" area inside the app's own, which confused screen readers.

### Connected to earlier features
- Rehearsal notes (R1, 0.54.0): the "Make a task" button on each note, and the task shows it came
  from a note.
- Notifications, push (M5a) and the e-mail summary: new `task_assigned` kind.
- Gig members and functions: who a task can be for. The gig's offline copy and the help guides.
- Organisation tasks, checklist templates, tasks in On-site mode and inventory repairs as tasks
  come in T2.

### Docs
- `docs/TOOLS_PLAN.md`: the acoustic simulator in levels of detail (A4–A6) is confirmed, after the
  three simpler sound stages; build order step 5 split into T1 (built) and T2.

## 0.57.0 — On-site mode

### Added
- **On-site mode** on every gig: on the gig's days it opens on what's needed there and then, in
  big buttons:
  - your call time and function, today's schedule with what's on now and next;
  - the call sheet, rehearsal notes, walking the rig (with a DMX patch), the input list (when the
    gig uses it), scanning equipment (for those who may), files, chat, and the crew with their
    phones.
- It switches on by itself on gig days (on by default) and can be switched on or off by hand on
  each gig; a switch by hand lasts for that day. The first time it comes on by itself, a note says
  why and links to the setting: **Settings → Language and appearance → "Switch to On-site mode on
  gig days"**, kept on each device.
- Help: guide "Use On-site mode on the day", with a picture.

### Connected to earlier features
- Uses the gig's offline copy, the call sheet (with its large print), the rehearsal companion (R1),
  the walk-through (D1), the input list (F1) and equipment scanning (I3). The Tools tab's "On site"
  and "Plan" groups (0.54.0) stay as they are.

### Docs
- `docs/TOOLS_PLAN.md`: truss data from Fantek, Global Truss and Prolyte first (Q3); a proposed
  acoustic simulator that grows with the project's detail, stages A4–A6 (Q5, to be confirmed).

## 0.56.0 — DMX calculator and dipswitches (D1)

### Added
- **Pocket tools** (My work → Pocket tools, `/tools`): calculators for any venue, with or without a
  gig in AVX, that work offline. First, the **DMX calculator**:
  - **Address ↔ dipswitches**: type an address to see which switches go ON, drawn like the
    fixture's own switches, or tap switches to read the address they set. The layout follows the
    fixture's label: 9 or 10 switches (the 10th a function switch), switch 1 worth 1 or 256, ON up
    or down, switch 1 on the left or the right. Kept on the device.
  - **Address a row of fixtures**: a count of the same fixture from a start address; every
    fixture's channels and switches, moving to the next universe instead of straddling two.
  - **Universe ↔ absolute channel**, with universes counted from 1 or from 0 (Art-Net).
  - **Values**: percent ↔ 0–255, 16-bit ↔ coarse/fine, hex.
- **DMX patch**: a "Dipswitches" switch shows each fixture's switches next to its address, and
  **Walk the rig** steps through the fixtures one at a time, grouped by position, with big
  switches and "Next fixture". Offline from the patch's saved copy.
- Help: guide "Set a fixture's DMX address with its dipswitches", with pictures.

### Connected to earlier features
- The walk-through and the dipswitch column read the gig's DMX patch (F2); positions come from the
  light plot (F3).

## 0.55.0 — Rehearsal companion R2: camera and LTC sync

### Added
- **Sync the rehearsal clock from a camera** ("From camera"): point the phone at a timecode display
  (an LTC reader, console or monitor) with the digits inside the box. The digits are read on the
  phone a few times a second; a reading is offered only when two of them move on with the clock,
  and it keeps counting so you can compare it with the display before using it. "Type it" falls
  back to typing.
- **Sync from LTC** ("From LTC"): the SMPTE timecode signal is decoded live from the microphone or a
  line input, with a level meter, the frame rate it measured, and a warning when the LTC's frame
  rate or drop-frame doesn't match the session.
- A note under the clock when a camera or LTC sync is more than 20 minutes old, as those clocks
  drift.

### Changed
- The shared clock is more exact: the phone sends the server time of its reading (within 5
  seconds), so network delay is no longer added to every sync, nudge or setting.
- Privacy notice: the camera and microphone are read on the device; no picture or sound is sent or
  kept.

### Connected to earlier features
- Both syncs set the session's clock type ("Camera sync", "LTC"), shown in the session line and the
  report header.

## 0.54.0 — Rehearsal companion R1

### Added
- **Rehearsal notes** (gig → Tools → On site): a shared, time-stamped notebook for rehearsals.
  - A session per run, with a frame rate (23.976 to 30, drop-frame at 29.97) and a clock that
    everyone on the gig shares: time of day or a stopwatch. Anyone writing on the gig can run,
    pause, nudge (±1 frame, ±1 second) or set it to the show's timecode, and every phone follows.
  - **Mark** takes the time at the tap; then the note gets a department (preset from your function
    on the gig), priority (note, fix, urgent), cue or song, text (typed, quick words or dictated),
    an optional photo and who it's for.
  - Notes appear for everyone as they're written; filter by department, "Mine" or "Open", and tick
    them done. Open notes from earlier runs show under the next session.
  - Report per department (print or PDF), CSV, and a JSON file with timecodes and frames for other
    show software (the start of the cueing app bridge).
  - Written without a connection, notes stay on the phone and are sent later (photos need a
    connection).
  - Crew and PMs write; viewers read. Removing a note or a session only marks it.
- Help: guide "Take notes during a rehearsal" and the glossary word "timecode".

### Changed
- The gig's Tools tab has two groups: **On site** (rehearsal notes, on every gig) and **Plan** (the
  tools the gig uses). The tab is now shown to everyone on the gig.

### Connected to earlier features
- Departments come from each person's function on the gig; notes can be assigned to anyone on it.
- Reports open from the tool and print like the other sheets.

### Docs
- `docs/TOOLS_PLAN.md`: decisions on On-site mode, the cueing app and rigger sign-off; build order
  by dependencies, with what each step must connect to.

## 0.53.0 — Crew network N5: alerts and saved searches

### Added
- **Job alerts**: when a company posts a job that fits your crew profile (one of your functions,
  within how far you travel; the same rule as "For you" on the job board), you get a notification
  in the app, by push and in the e-mail summary. On by default; switch it off on your crew profile
  ("Tell me about new jobs that fit me"). At most 10 a day; never for the company's own people,
  people already on the gig, or across a block. The alert names the company, never the gig.
- **Saved searches** in Find crew: save the current filters under a name (up to 30 per
  organisation), run one with a tap, switch its alert on or off, or remove it. With the alert on,
  whoever saved it hears when a crew profile that fits is switched on (at most 5 a day per search),
  and the notification opens Find crew with that search.

### Changed
- The e-mail summary's footer points to Settings → Notifications.
- Privacy notice: alerts and saved searches.

## 0.52.0 — Settings page

### Changed
- **Your settings are a page now** (`/settings`), no longer one long dialog. The avatar (and More →
  Account on phones) opens it. Sections: Profile, Sign-in and security, Availability,
  Notifications, Language and appearance, Privacy and blocking, Calendar feed, Your data, and AVX
  reviews for AVX admins.
- On wide screens the sections are listed on the left and the chosen one is shown on the right; on
  phones the list comes first and each section opens on its own, with a way back. Each section has
  its own address (`/settings/notifications`…), so links from the first-steps checklist, the menu
  and the help guides open the right one. Old `?panel=account` links still work.
- Help guides and their screenshots now point to the sections.

### Docs
- `docs/COMPETITOR_RESEARCH.md` (Rentman, Crewbooking and the rider apps compared, 29 features
  ranked) and `docs/TOOLS_PLAN.md` (rehearsal companion, DMX calculator, power, rigging and sound
  tools, and where prep and on-site tools live), merged with 0.51.0.

## 0.51.0 — Crew network N4: trust

### Added
- **Verified companies** (organisation settings → Verification, admins): in the EU, check the
  VAT number with the EU's VIES service (the new `vies-check` function); a valid number verifies
  the company at once and the name VIES holds shows next to the badge on its job posts. Outside the
  EU, or when VIES can't confirm, ask AVX for a manual check. Verified companies have no limit of
  3 open job posts.
- **Certificates you can trust**: certificates now have an id. A company that has had the person on
  one of its gigs can confirm a certificate (Find crew and Job posts → Applicants); the person can
  upload a proof (photo or PDF, only AVX sees it) for AVX to check. Profiles show "proof checked by
  AVX", "confirmed by …" or "self-declared". Editing a certificate's name or expiry drops its marks.
- **Report** a crew profile (Find crew) or a job post (Jobs): it disappears for the reporter at
  once, the reporter can also block the person, and AVX reviews it. Three people reporting hide a
  profile, or pause an organisation's posting, until reviewed. Notices on the profile page and on
  Job posts say so.
- **Contact settings** on the crew profile: "Any company that finds you" or "Only companies I've
  worked with"; Find crew shows it, and contact from others is refused.
- In a direct conversation between strangers (no shared gig or organisation), files can be sent
  only once the other person has written.
- **AVX reviews** (`/admin/trust`, from Account for AVX admins with two-step sign-in): manual
  company checks, certificate proofs and reports to decide; verifications to revoke; suspensions
  to undo.
- Help: "Show your certificates are real, and choose who can contact you" and "Verify your
  company". The privacy page describes all of it.

### Fixed
- An organisation admin could mark their own organisation verified by editing it directly (the N3
  column had no guard; nobody had). `verified_at`, `verified_name`, `verified_method` and
  `posting_suspended_at` are now set only by the database's own functions.

### Database
- Migration `20261125000000_crew_trust.sql` (no manual steps): `private.avx_admins`,
  `org_verifications`, `certificate_confirmations`, `certificate_proofs` (+ private bucket
  `certificate-proofs`), `network_reports`; `crew_profiles.contact_from` and `suspended_at`;
  `start_vies_check()`, `record_vies_result()` (service role only), `request_manual_verification()`,
  `decide_verification()`, `revoke_verification()`, `confirm_certificate()`,
  `submit_certificate_proof()`, `review_certificate_proof()`, `report_network()`,
  `decide_network_report()`, `lift_suspension()`, `trust_queue()`, `trust_queue_count()`,
  `am_avx_admin()`; new versions of `search_crew`, `contact_crew`, `publish_job`, `list_jobs`,
  `job_applicants`, `can_see_crew_profile` and the message guard. Tests:
  `supabase/tests/crew_trust.sql`.
- Edge Function `vies-check` (JWT verification on).

## 0.50.0 — Crew network N3: the job board

### Added
- **Post a job** (a gig's Crew tab, or Organisation → Job posts): title or one of the gig's crew
  positions, function, how many, dates (the gig's), town, languages, a certificate, a description,
  and pay: "ask for their day rate" or a stated fee (fixed or a range, per day, job or hour, in a
  chosen currency). Posting needs two-step sign-in switched on; organisations not verified yet can
  have 3 open posts. The post shows the organisation's name, never the gig's name or client.
- **Jobs** (My work → Jobs), for freelancers with their crew profile on: "For you" (their
  functions within their travel range), "All open jobs", and "My applications". **Apply** with a
  message, the day rate when asked (it goes only to that company), and a tick that they're free.
- Applications start a conversation with the person who posted, and notify them and the
  organisation's admins. **Job posts → Applicants** shows each applicant's crew profile, message and
  rate: shortlist, decline (a polite note goes in the messages) or **offer the place** (a crew call;
  accepting adds them to the gig, marks the application accepted and fills the post when every
  place is taken). Posts can be closed, marked filled or reopened, and close on their last day.
- Notifications (in the app, by push and in the e-mail summary) for a new application and a
  declined one. Help: "Find work on the job board" and "Post a job and choose who to take".
  The privacy page describes the job board.

### Database
- Migration `20261124000000_job_board.sql` (no manual steps): `job_posts`, `job_applications`,
  `organisations.verified_at` (set in N4), `publish_job()`, `close_job()`, `list_jobs()`,
  `apply_job()`, `withdraw_application()`, `answer_application()`, `my_job_applications()`,
  `job_applicants()`. Checks in `supabase/tests/job_board.sql`.
- `send-push` and `send-digest` redeployed with the new notification wording.

## 0.49.0 — Crew network N2: crew search

### Added
- **Find crew** (Organisation menu, and "Find crew" on a gig's Crew tab), for admins and members:
  search the freelancers who switched on their crew profile and let companies (or crew) see it, by
  function, name or words, language, certificate (still valid on the dates), distance from a town
  or the gig's venue, and dates. Results show how far away they are, whether they're free on the
  dates (never which gigs), and how often they've worked for you. People who travel further than
  the distance searched are included when they say they go that far.
- From a result, **Ask if free** (an availability question, as from the gig) or **Offer a place**
  (a crew call for one): it arrives in their messages, and the two can write to each other from
  then on. Contact details stay private until they join the gig.
- Limits against misuse: 200 searches and 25 new people contacted per organisation per day.
- Help: "Find crew you haven't worked with yet". The privacy page describes the search.

### Changed
- The town search is shared by the crew profile and Find crew; in Portuguese its button now says
  "Localizar", so it isn't confused with "Procurar".

### Database
- Migration `20261123000000_crew_search.sql` (no manual steps): `search_crew()`, `contact_crew()`,
  `crew_contacts`, `crew_search_log`; people a company contacted can message each other.
  Checks in `supabase/tests/crew_search.sql`.

## 0.48.0 — Crew network N1: crew profiles

### Added
- **Crew profile** (Account → "Open your crew profile", `/me/profile`): what you do (a shared list
  of functions plus your own), your town, how far you travel, languages, years of experience,
  certificates (self-declared, with an expiry date), a short text and up to three links. It's **off
  until you switch it on**, and you choose who sees it, at any time: **companies only** (admins and
  members of AVX organisations) or **companies and crew** (also other people on AVX). Never the
  public web; people you've blocked never see it. No rates. A preview shows what others see;
  "Remove my crew profile" clears it.
- Your town is found by name (OpenStreetMap, through the new `geocode` function, for signed-in
  people only) and kept to about 1 km.
- The plan for the crew network and job board, with the decisions taken: `docs/CREW_NETWORK.md`.
- Help: "Get found for work with your crew profile". The privacy page describes the profile.

### Fixed
- The calendar link (S4) now asks for two-step sign-in like everything else, for people who use it.

### Database
- Migration `20261122000000_crew_profiles.sql` (no manual steps): `crew_profiles`,
  `crew_profile()`, `clear_crew_profile()`. Checks in `supabase/tests/crew_profiles.sql`.
- New Edge Function `geocode` (Verify JWT **on**), sharing `_shared/places.ts`.

## 0.47.0 — Switching S5: organisation export

### Added
- **Download everything**: organisation settings → "Your organisation's data" (admins) gives one
  zip with a CSV file per kind of record: the organisation's details, members, crew waiting to be
  invited, locations, equipment, stock per location, units, kit contents, stock movements,
  clients, suppliers, gigs, their equipment, crew, schedule and files list, quotes and their lines,
  subrentals and their lines, repairs and inspections, plus the messages (`messages.json`) and a
  README. Names are used instead of internal numbers, and the files are numbered in the order
  another tool would need them.
- The files import straight back into AVX: their headings are the words the import wizard
  recognises (equipment, units, kit contents, contacts, gigs, gig equipment, quote lines).
- Help: "Download all your organisation's data". The privacy page says what admins can download.

### Changed
- The import wizard recognises "gig" and "gig ref" as the gig columns of a gig equipment file.

### Database
- Migration `20261121000000_org_export.sql` (no manual steps): `export_org_part()`, admins only,
  with two-step sign-in; reads only. Checks in `supabase/tests/org_export.sql`.

## 0.46.0 — Switching S4: Rentman exports, the switching checklist and the calendar feed

### Added
- **Rentman exports** are recognised: their own column names (`rental_sales`, `current_quantity`,
  `email_1`, `visit_street`, `planperiod_start`, `firstname`…, from the mock Rentman account) are
  matched automatically for equipment, units, contacts, crew and jobs, and the wizard says
  "Recognised as a Rentman export". Rentman's values are read too ("Track stock", "Exclude from
  stock tracking", date-times), the address is put together from street, number, postcode and
  city, and crew marked inactive aren't invited.
- When equipment has quantities but no location column, the wizard asks which location the stock
  is in.
- **Switching checklist** on the Import page: the steps in order (locations → equipment → units →
  kits → clients → suppliers → crew → jobs → their equipment → quotes), each ticked with what's
  already in AVX; tap one to choose it.
- **Calendar feed**: in the account panel, "Your gigs in your phone's calendar" gives a private
  link to subscribe to in Apple, Google or Outlook calendar. Each gig shows its dates (or your own
  booking times), venue, role and call time, and updates by itself; drafts show as tentative.
  "New link" replaces it if it was shared by mistake.
- Help: "See your gigs in your phone's calendar". The privacy page mentions the feed.

### Changed
- A column called just "unit" is no longer taken as what a price is charged per (Rentman's "unit"
  is a counting unit like "Piece"), and "type" no longer as rental/sale (Rentman's is item/set/case).

### Database
- Migration `20261120000000_calendar_feed.sql` (no manual steps): `calendar_feeds`,
  `calendar_feed()`. Checks in `supabase/tests/calendar_feed.sql`.
- New Edge Function `calendar-feed` (Verify JWT **off**), sharing `_shared/ics.ts`.

## 0.45.0 — Switching S3b: upcoming jobs, their equipment and open quotes

### Added
- Three more kinds in the import wizard (admins and members):
  - **Upcoming jobs** → gigs with name, dates, venue and status ("Bevestigd" → confirmed,
    "Optie" → draft…); the client and notes go in the gig's description. Past and cancelled jobs
    are left out (they stay in the old tool's export). The importer becomes the gigs' manager.
  - **Equipment on jobs** → planned equipment on each gig (by job number or name, item by code or
    name), which books the gear for the gig's dates.
  - **Open quotes** → draft quotes, one per quote number, with their lines grouped by section;
    lines from the catalogue keep their item and price, and a client whose name is in Contacts is
    linked.
- Gigs and quotes keep the old tool's number, so importing again updates them instead of
  doubling; a quote already sent is left as it is.
- The wizard's first step groups the kinds: inventory, contacts, people and work.
- Help: the "Bring over your upcoming jobs and open quotes" guide.

### Fixed
- An installed app (or a tab left open) now looks for a new version each time it comes back to
  the screen and reloads into it, instead of only when it's started.

### Database
- Migration `20261119000000_import_jobs.sql` (no manual steps): `import_ref` on gigs and quotes,
  `import_jobs`. Checks in `supabase/tests/import_jobs.sql`.

## 0.44.0 — Switching S3a: crew as held invitations

### Added
- **Crew import**: in the import wizard (admins only) or from Members → "Import your crew from a
  file", one row per person with e-mail, name (or first and last name), phone, functions and
  role. Roles are read in English, Dutch and Portuguese ("Freelancer" → viewer, "Medewerker" →
  member…); viewer if the file doesn't say.
- Imported people are **held**: nobody is e-mailed. In Members, a "not invited yet" list lets an
  admin check each role, select people and **send** the invitations (through the normal
  invitation, one at a time; one that fails stays held), or **discard** them.
- Re-importing updates the held ones instead of doubling; people already in the organisation or
  already invited are left out with a note.
- Help: the "Bring your crew over from another tool" guide. The privacy page mentions the details
  kept for held invitations.

### Changed
- The Members dialog scrolls when it's taller than the screen.

### Database
- Migration `20261118000000_held_invites.sql` (no manual steps): `held_invites` (never removed:
  sent or discarded instead), `import_crew`. Checks in `supabase/tests/held_invites.sql`.

## 0.43.0 — Switching S2: contacts

### Added
- **Contacts** (Quotes menu, `/org/:id/contacts`): a directory of **clients** and **suppliers**
  with search, archiving and a dialog per contact (company or name, contact person, e-mail,
  phone, tax number, address, notes). A client shows the quotes made for them.
- On a quote, **"Client from contacts"** fills in the client's details; a client typed by hand
  can be kept with **"Save to contacts"**. The new-quote form can pick a client too. A quote
  keeps its own copy of the details, so changing a contact doesn't change a quote already sent.
- **"Add them to contacts"** turns the clients typed on existing quotes into contacts (one per
  company, or per name when there's no company) and links those quotes.
- The import wizard imports **clients and suppliers** (CSV or Excel), matched by tax number, then
  by name (an e-mail address tells apart two of the same name). The address can come whole or as
  street, postcode, city and country. Headings are guessed in English, Dutch and Portuguese.
- Suppliers have an address and a tax number.
- The privacy page says what Contacts keeps about clients and suppliers.
- Help: the "Keep your clients and suppliers in Contacts" guide, a Contacts page note, the
  "Client" term and a hint on the quote's client picker.

### Changed
- The undo migration to run by hand is renamed again, to `20261117000001_import_undo.sql`, and
  now also switches on the contacts import (it replaces the import tables' checks, which needs a
  person to confirm) and undoes contacts imports. It still hadn't been run anywhere. Until it
  runs, importing contacts says so; adding them by hand works.

### Database
- Migration `20261117000000_contacts.sql` (no manual steps): `clients`, `quotes.client_id`,
  suppliers' `address` and `tax_id`, `clients_from_quotes`, contacts in `run_import`. Checks in
  `supabase/tests/contacts.sql`; after the hand-run file, `supabase/tests/contacts_import.sql`.

## 0.42.0 — Switching S1b: Excel files and kit contents

### Added
- The import wizard reads **Excel files (.xlsx)** directly (the first sheet), as well as CSV.
- **Kit contents** import: what goes in each set or case and the accessories that come with an
  item, one row per part, by code or name, with quantities. A kit becomes a set or a case as
  needed; importing again updates quantities. Column names are guessed in English, Dutch and
  Portuguese, and the matching can be saved as a preset.
- Undo also removes kit parts an import added and puts back changed quantities.

### Changed
- The undo migration to run by hand is renamed `20261116000001_import_undo.sql` (it now runs after
  the kits migration). It had not been run yet; nothing else changes for it.
- The import guide covers Excel and kits.

### Database
- Migration `20261116000000_import_kits.sql` (no manual steps): `subject` on import batches and
  presets, `import_part_changes`, kits in `run_import`. Checks in `supabase/tests/import_kits.sql`.

## 0.41.0 — Switching S1a: the import wizard

### Added
- **Import** in Inventory, a wizard for bringing in **locations, equipment and units** (serial
  numbers) from a CSV file or rows pasted from a spreadsheet: choose → match columns → check →
  import → report.
- Columns are guessed from English, Dutch (Rentman) and Portuguese headings; the matching can be
  saved as a preset for the next file. Prices, numbers and dates are read whichever way they are
  written; problems are shown per row before importing.
- The check shows what is new, what matches what is already in AVX, and what will be skipped.
  Importing the same file again updates instead of doubling. Units keep their old barcodes.
- A report of skipped rows and notes, downloadable as CSV.
- **Earlier imports**, each with **Undo** (with a warning and confirmation): removes what it
  added and puts back what it changed, unless something already uses it.

### Changed
- The old paste-only import in the catalogue is replaced by the wizard; the guide "Import your
  equipment" is rewritten for it.

### Database
- Migration `20261115000000_import_wizard.sql` (no manual steps): `import_batches`,
  `import_changes`, `import_presets`, `run_import`. Checks in `supabase/tests/import_wizard.sql`.
- Migration `20261115000001_import_undo.sql` (**run by hand**: it removes records): `undo_import`.
  Checks in `supabase/tests/import_undo.sql`.

## 0.40.0 — Field tools F4: sound system calculator

### Added
- **Sound system calculator** in a gig's Tools: the PA's mains, subs, delays and fills, and the
  listening positions (FOH first). It estimates each source's delay (delays and fills follow
  their nearest main plus a Haas offset; subs are lined up with the mains at FOH), the level at
  each position, whether a delay arrives too early or as an echo, and how wide each box covers.
  Temperature changes the speed of sound. Everything is clearly labelled as an estimate.
- A plan of the system (stage, boxes with their angles, listening positions)
- Print page `/gig/:id/system`; offline copies; read-only for crew
- Guide "Work out the PA delays"; glossary words Haas effect and SPL

### Changed
- The calculator is on by default; organisations that never changed their tools get it too.
  All four field tools (F1–F4) are now built; switching (S1) comes next.

### Database
- Migration `20261114000000_system_calc.sql` (no manual steps): `gig_show.system` and the new
  default tools. Checks in `supabase/tests/system_calc.sql`.

## 0.39.0 — Field tools F3: light plot

### Added
- **Light plot** in a gig's Tools: trusses, pipes, ladders and floor positions drawn over the
  stage, with the DMX patch's fixtures hanging on them (spaced evenly, or dragged into place;
  dropped near a position, a fixture hangs on it). Each fixture shows its symbol and
  universe/address. Positions have a length, trim height and phase.
- "Add fixtures here" on a position (adds them to the DMX patch on free addresses); fixtures
  not on the plot can be hung from a list
- **Power estimate**: watts, amps and weight per position and per phase against the supply
  (single or three phase), with warnings above 80% and 100%. Power and weight come from the
  catalogue item when not typed.
- Print page `/gig/:id/lights` with a legend; offline copies; read-only for crew
- Guide "Draw the light plot"; glossary words truss and power phase

### Fixed
- Stage plot: Enter or Space on a thing in the drawing now selects it (keyboard users)
- Help screenshot of the stage plot drawing showed the Print button instead of the drawing

### Changed
- The light plot is on by default; organisations that never changed their tools get it too

### Database
- Migration `20261113000000_light_plot.sql` (no manual steps): `gig_show.lighting`;
  `gig_fixtures.plot_x`, `plot_y`, `symbol`, `power_w`, `weight_kg`; power and weight from the
  catalogue; new default tools. Checks in `supabase/tests/light_plot.sql`.

## 0.38.0 — Field tools F2: patch and DMX patch

### Added
- **Patch** in a gig's Tools: the stage boxes (name, number of inputs, split to monitors), socket
  by socket, with the input line in each. Choose the line for a socket, or "Fill the free
  sockets" in channel order. Two lines in one socket are flagged. The socket is the input
  line's "Stage box", so the input list and the patch always match.
- **DMX patch**: every fixture with its universe, address, channels, mode and position. "Add
  fixtures" adds several of a type, each on the next free address; overlaps are flagged;
  "Readdress in order" repacks a universe. Linked fixtures can be added to the equipment.
- Print pages for both (`/gig/:id/patch`, `/gig/:id/dmx`), offline copies, read-only for crew
- Guides "Patch the stage boxes" and "Make the DMX patch"; glossary words DMX universe, DMX
  address and split

### Changed
- The new tools are on by default; organisations that never changed their tools get them too
- Organisation decision recorded: all field tools (F1–F4) come before switching (S1)

### Database
- Migration `20261112000000_patch_dmx.sql` (no manual steps): `gig_show.audio`, `gig_fixtures`,
  new default tools. Checks in `supabase/tests/patch_dmx.sql`.

## 0.37.0 — Field tools F1b: stage plot

### Added
- **Stage plot** in a gig's Tools: the stage from above (audience at the bottom, 1 m grid) with
  its width and depth, and a library of things to place: drum kit, vocal mic, amps, keyboard,
  acoustic guitar, DI, monitor wedge, musician, riser, power drop, text. Drag them, or select one
  and use the arrow keys or buttons; rotate, name and remove them (with Undo).
- **Send to the input list**: the drums, mics, amps, keys and DIs on the plot become channels on
  the input list (only the new ones, numbered after the last)
- Things linked to the catalogue can be added to the gig's **equipment**
- An "On stage" list under the drawing, a **print** page (landscape) and an offline copy; crew
  read it on their phone
- Guide "Draw the stage plot" and the glossary word "Stage plot"

### Database
- Migration `20261111000000_stage_plot.sql` (no manual steps): `gig_plot_items`. Checks in
  `supabase/tests/stage_plot.sql`.

## 0.36.0 — Field tools F1a: Tools tab and input list

### Added
- **Tools tab** on every gig (docs/FIELD_TOOLS.md): only the tools the gig uses, plus "Add a tool"
  for its production managers and the organisation's admins and members. Crew see the tab once
  the gig uses a tool, and read it on their phone, also offline.
- **Input list**: one line per mixer channel with the source, mic or DI, stand, 48V, stage box
  and notes. Reorder with the arrows (channels renumber), tick lines as they're checked on site,
  print it, and link mics and DIs to the catalogue so "Add mics and DIs to equipment" plans
  them on the gig. Removing a line has Undo.
- **Organisation settings → Field tools**: choose the tools the company uses
- Guide "Make the input list"; glossary words input list, 48V, stage box, line check, field tools

### Changed
- **Feed** and **Activity** are now one **Updates** tab (Posts / History), so the gig keeps eight
  tabs. Old links still open the right half.

### Database
- Migration `20261110000000_field_tools.sql` (no manual steps): `organisations.field_tools`,
  `gig_tools`, `gig_show` (the shared show model), `gig_inputs` and `order_inputs`. Checks in
  `supabase/tests/field_tools.sql`.

## 0.35.0 — Help H5b: equipment steps and undoing a scan

### Added
- **Equipment steps** on a gig: prepped → out (loaded) → on site → loaded back → back in →
  checked in. Pick the step at the top of "Scan out / in" (and in scan mode) and scan; a case
  brings what's packed in it. Out and back in are the scans out and in, as before; the other
  steps only record where the gear is.
- The gig's **Equipment tab** shows a bar per step ("66 of 69 out"), and the **packing list** has a
  Step column with how far each line has got
- **Organisation settings → Equipment steps**: an admin unticks the steps the company doesn't
  use (out and back in are always on)
- **Undo a scan**: each scan in the list (and the last one in scan mode) has an Undo button.
  Units go back to where they were, and the counts drop. It works for your own scans for 15
  minutes, while nothing else has happened to those units; a damaged return (which opened a
  repair) is changed under Maintenance instead.
- Guide "Follow equipment step by step" and the glossary word "Equipment steps"

### Database
- Migration `20261109000000_equipment_steps.sql` (no manual steps): scans grouped in batches,
  each unit's state before a scan kept for undo, undone scans no longer counted, the
  `gig_steps` log with `step_scan`, `undo_scan` and `gig_step_summary`, and
  `organisations.equipment_steps`. Checks in `supabase/tests/equipment_steps.sql`.

## 0.34.0 — Help H5a: field kit

### Added
- **Scan mode** (Scan out / in → Scan mode): the whole screen for scanning in the van or the
  dark, with gloves on. Big out/in switch, the camera, the last scan in large type, the count,
  and big buttons for the quantity and "damaged" where a thumb reaches. The phone's back button
  closes it.
- **Sounds and vibration on every scan**: one high beep when it's fine, two beeps for a warning,
  a low buzz for a problem (sound can be turned off; it's remembered on the device)
- **Torch** button on the camera, where the phone allows it (Android; not iPhones yet)
- **Read aloud** with the phone's own voice: the call sheet (your call first), your next gig on
  the simple home, any chat message (message menu), and, when turned on in scan mode, each scan
- **Large print** call sheet (prints large too); on by default for people who chose a larger text
  size. Your own line is marked in yellow, and phone numbers can be tapped to call.
- **Undo** instead of "are you sure?" when removing a schedule item, an equipment line, a crew
  position, a kit part or alternative, or your own chat message: it disappears at once, and is
  only deleted when the 8-second Undo runs out (or when you leave the page)

### Changed
- The green Print and Accept buttons on printable pages are darker, so white text on them is
  easier to read (WCAG contrast)
- Warehouse and crew guides cover scan mode, large print and read aloud

## 0.33.1 — Tabs scroll sideways only

### Fixed
- On phones, the gig's tabs (and other sideways-scrolling strips) could also be dragged up and
  down, hiding them behind the page for a moment; they now only scroll sideways

## 0.33.0 — Help H4: first steps and simple mode

### Added
- **Simple mode**: crew who only work on gigs (not in an organisation) see their **next gig** first,
  big, with the call time and four big buttons: call sheet, chat, open the gig, report damage.
  Gigs show fewer tabs. Anyone can turn it on or off in Account → Appearance.
- **First steps** on the home page for new admins (company details, equipment, team, first gig)
  and new crew (name and phone, AVX on the phone, notifications), each with its guide
- **Empty screens explain themselves**: what goes there, a button for the first thing to do and
  the guide

### Changed
- Crew guides describe the simple home

## 0.32.0 — Help H3: themes, text size and comfort

### Added
- **Account → Appearance** (saved on each device):
  - **theme**: dark, **light** (for sunlight), **high contrast**, or like the device;
  - **text size**: normal, large or extra large; the whole layout grows with it;
  - **comfortable mode**: bigger buttons and boxes, at least 44 px to tap;
  - **easy-to-read font** (Atkinson Hyperlegible).
- Guide "Make AVX easier to read"

### Changed
- **New look** from the Lumen and Pixel palette: navy background and the brand's lime green;
  new fonts (Nunito, and Space Mono for codes and numbers)
- Every colour now comes from the theme, and the tests check that all text stays readable in
  every theme
- On phones, the menu cards show their icon in the section's colour

## 0.31.0 — Help H2b: guides for the warehouse, office and admins

### Added
- **18 more guides** in Portuguese and English, with pictures of each screen:
  - for the warehouse: import the catalogue; locations; units and QR labels; scan out to a gig;
    check equipment back in; repairs and inspections; subrentals; inventory reports;
  - for the office and sales: company details; the price list; build a quote in phases;
    versions; send a quote; from accepted quote to gig;
  - for admins: members and roles; muting; deleting safely; downloading your data.
- Help and the ? panel group the guides by who they're for (five groups)

### Plans
- **Field tools** (docs/FIELD_TOOLS.md): a Tools tab on each gig for stage plots, input lists,
  patches, light plots and a sound system calculator that share their data
- **Equipment steps** with H5 (prepped → loaded → on site → returned)
- Fonts decided for H3: Nunito and Space Mono, with Atkinson Hyperlegible as the readable option

## 0.30.0 — Help H2a: how-to guides for crew and production managers

### Added
- **Guides**, step by step with a picture of each screen and the button to tap outlined, in
  Portuguese and English:
  - for crew: accept an invitation and set a password; install AVX on your phone; find your call
    time and the call sheet; mark the dates you can't work; answer an availability question;
    chat with the team; report damaged equipment; use AVX without signal;
  - for production managers: create a gig; invite crew; build the schedule; prepare and send the
    call sheet; avoid double bookings; plan the equipment.
  Each guide ends with common mistakes and the words it uses (linked to the glossary)
- **Help** now lists the guides by role above the glossary, and each guide has its own link
- The **?** next to a page title lists that page's guides and opens them right there, without
  leaving the page
- The pictures are made from the real screens with sample data by `npm run help:screens`, so they
  can be refreshed whenever a screen changes

### Fixed
- On a phone, the "Add schedule item" and "New gig" forms no longer run off the side of the screen
- The "New gig" form's labels are linked to their fields (screen readers now name them)
- The email example in the invite form is in Portuguese when AVX is

## 0.29.0 — Help H1: glossary, hints and accessibility checks

### Added
- **Help → Glossary**: 64 words used in AVX and in event work, in plain language, with an example
  and where each appears; searchable, in Portuguese and English, readable before signing in. In
  the top bar on computers (?) and under More on phones
- **ⓘ next to fields** people get wrong (prep and return days, stock tracking, kit type, minimum
  stock, depreciation, unit status, VAT, discount, factor, validity, call time, gig status, roles,
  who can find you, two-step sign-in, mark as lost, cross-hire code…): tap it for a short
  explanation with an example
- **? next to page titles**: what the page is for and the words used on it, in a side panel
- Words with a dotted underline show their meaning when tapped (first in the booking window)
- **Accessibility checks** in the automatic browser tests: serious problems for screen readers or
  keyboards now stop a release

### Changed
- Grey small text is lighter and easier to read (it was too faint for low vision and sunlight),
  and some blue, pink and purple labels are lighter too
- The logo, account and company buttons are named by what they show, for voice control

## 0.28.0 — Messaging M6b: how long messages are kept, export and usage

### Added
- **Organisation settings → Messages** (admins):
  - how much the organisation's conversations are used (messages, people writing, files);
  - **how long to keep messages**: for ever (the default), 90 days, 6 months, 1 year or 2 years.
    Older messages and their files are deleted every night. A shorter period shows what goes
    tonight and asks you to type the organisation's name. Direct conversations are never deleted;
  - **download all messages** of the organisation's conversations as a file
- Privacy notice (EN/PT): how long organisation conversations are kept, and the download

## 0.27.2 — iPhone home-screen app: top bar under the status bar

### Fixed
- Opened from the iPhone home screen, the top bar sat under the clock and battery. The app now
  keeps clear of the status bar (and of the notch when the phone is sideways) on every screen,
  with the app's colour behind the clock; windows such as Account open below it too

## 0.27.1 — Notifications panel on phones

### Fixed
- On phones, the notifications panel opened partly off the left edge of the screen; it now
  always fits the screen

## 0.27.0 — Messaging M6a: reports, moderators and blocking

### Added
- **Report a message:** message menu → Report, with a reason. The gig's managers or the
  organisation's admins are told (never who reported it) and choose Remove or Keep it, right under
  the message. Reports from direct conversations go to the AVX team
- **Remove as moderator:** whoever runs a gig's or organisation's conversation can remove any
  message in it; it shows "Removed by a moderator" and the author is told
- **Block a person:** in a direct conversation. Neither of you can write there, and their
  mentions don't notify you; work questions (availability, crew calls) still arrive. Unblock in the
  conversation or in Account → People you blocked
- **Rate limits** against spam: at most 20 messages a minute per person
- Privacy notice (EN/PT): reports and blocks

## 0.26.0 — Messaging M5a: push notifications and offline messages

### Added
- **Notifications on your phone or computer:** turn them on in Account → Notifications on this
  device. Messages, mentions, crew calls and the rest arrive like any app's notifications, in your
  language; tapping one opens it in AVX. On iPhone, add AVX to the home screen first. "Send a
  test" checks it works. A busy conversation shows one notification, not one per message
- **Write without a connection:** a message you write offline waits on your phone ("Waiting for a
  connection") and is sent by itself when the connection comes back. You can cancel it while it
  waits. Files need a connection
- Privacy notice (EN/PT): notifications on your devices and the push services that carry them;
  messages waiting to be sent are kept on the device

### Changed
- The email summary and push notifications share their wording (no change to the emails)

## 0.25.0 — Messaging M4b: clients and suppliers

### Added
- **Talk to your client on the quote:** the quote's page (the link you sent) now has a
  conversation under the quote. The client writes with their name, no account needed, even after
  the quote expired. You answer from the quote's Summary tab or from Messages
- **Talk to your supplier on a subrental:** make a link for the supplier in the subrental window.
  They see what you're hiring (items, quantities and dates, no prices) and can write to you. A new
  link turns the old one off; you can turn it off at any time
- The supplier conversation is separate from your team's own conversation about the subrental
- Notifications and the email summary for messages from clients and suppliers (they come through
  even when the organisation is muted)
- Privacy notice (EN/PT): messages from clients and suppliers

### Fixed
- Deleting an equipment item, a repair, a subrental or a quote left its conversations behind; now
  they're deleted with it
- Uploading a file again right after the first upload could save it as a separate file instead of
  version 2 (the list on screen hadn't caught up yet); found by the signed-in browser tests

### Planning
- Public site, pricing and help: a plan for the end of the build ([docs/PUBLIC_SITE.md](docs/PUBLIC_SITE.md))

## 0.24.0 — Messaging M4a: messages connected to gigs and equipment

### Added
- **Availability questions in messages:** the question arrives in your direct conversation with
  the person asking, with Available / Not available buttons; the answer is posted under it
- **Crew calls:** offer a place on a gig to several people at once from the Crew tab (or from an
  open position). They accept or decline in the message; the first to accept join the gig with
  that function and the call closes when it's full. Managers see who answered
- **Send the call sheet to the crew:** posts it in the gig's chat as an announcement everyone
  confirms
- **Schedule changes** are noted in the gig's chat (gathered when you make several in a row)
- **Team conversations** on equipment items, repairs and subrentals, for the organisation's admins
  and members; they show in Messages with a link back
- Notifications and the email summary: crew calls and their answers (crew calls come through
  even when the organisation is muted)
- Account export includes the crew calls you received and your answers
- Privacy notice (EN/PT): questions and crew calls in messages, schedule notes, team conversations

### Fixed
- Signing in sometimes opened My work instead of your organisation (the start page was chosen
  before your organisations had loaded); found by the signed-in browser tests, which now run
- Offline, the app sat on a spinner for about 7 seconds before showing saved copies (the database
  library retries failed requests); with no connection it now gives up at once
- **Deleting your account failed if you were on a gig** (the gig's activity log tried to name
  you after your account was already gone). Fixed in the database on both projects

## 0.23.0 — Messaging M3: channels, pins, announcements, search

### Added
- **Organisation channels:** admins create them from Messages (+) for everyone, admins and
  members, or admins only, and can make them "only admins write" or archive them
- **Department channels** in a gig's Chat: one per function (Sound, Light…) and one for the
  managers, seen only by those people and the gig's managers
- **Pin** messages; a bar above the conversation lists them
- **Announcements:** whoever runs a channel can send a message that everyone must confirm
  ("I've read this"); they see who has and hasn't confirmed. Everyone is notified, even in muted
  channels, in the app and in the email summary
- **Search** your messages, and **save** messages for later (only you see them)
- Account export includes saved messages and the announcements you confirmed
- Privacy notice (EN/PT): channels, announcements, saved messages and search

### Fixed
- Two-step sign-in: the authenticator entry is now named "AVX" and points to the AVX icon, for
  apps that show icons from the link (FreeOTP, 2FAS, Ente Auth…). Authy and Google Authenticator
  use their own icon lists, so they still show a generic icon

## 0.22.0 — Messaging M2: files, cards, mentions, reactions, edits

### Added
- **Files in messages:** attach up to 10 files (50 MB each) with the paperclip, by pasting or by
  dropping them on the box; pictures show as previews, other files download
- **Share a card:** a gig, schedule item, file, quote or equipment item, shown as a card that opens
  it. People who can't open it see only that it's there
- **@mentions** in gig chats: type @ to pick someone on the gig; the gig's managers can also
  mention @everyone, @crew, @managers or a function such as @Sound. Mentions notify (bell and email
  summary) and are highlighted for the person mentioned
- **Reactions** (👍 ❤️ 😂 😮 🙏 ✅ 👀), **edit** your messages (earlier versions stay visible),
  **remove** them (cleared for everyone, a marker stays), and **copy a link** to a message
- Your data export now includes your messages' files, cards and edit state
- Privacy notice (EN/PT): message files, edits and removal

### Fixed
- The chat message for changed gig dates showed the range one day short

## 0.21.1 — Fixes and plans

### Fixed
- Account → Unavailable dates: on iPhones the two date fields overlapped. They now share the
  row and have visible "From" / "To" labels. Date and time fields everywhere can no longer
  overflow their column or collapse when empty on iOS

### Docs
- `docs/PENDING.md`: everything waiting on a decision, setting or test since the inventory build
- `docs/HELP.md`: plan for a glossary, field hints, guides and other inclusive features (H1–H6)
- `docs/SWITCHING.md`: plan for importing from Rentman and other tools (S1–S5)

## 0.21.0 — Messaging M1: direct and gig conversations

### Added
- **Messages** (top bar): your direct conversations and gig channels, newest first, with unread
  counts; open one to read and reply. Side by side on wide screens, one at a time on phones
- **Chat tab on every gig**: everyone on the gig talks in one place; status, date and venue
  changes show up in it. Viewers can read but not post. The Feed stays for official updates
- Replies to a message, links made clickable, earlier messages loaded on demand, live delivery
- **Message** buttons next to crew on a gig and organisation members. You can message people you
  share a gig or organisation with
- Mute a conversation; no read receipts
- Notifications for direct messages and replies to you, grouped per conversation, also in the
  email summary (which now also covers damage reports, inspections and hire requests)
- Your sent messages are included in the account data export
- Privacy notice (EN/PT): who sees messages, no read receipts

## 0.20.0 — Your network

### Added
- **Your network** in the invite dialogs (gig crew and organisation members): search people
  you've already shared a gig or organisation with, see the functions they had on those gigs,
  how many gigs together and whether they're booked on the gig's dates, and add them in one go,
  without needing their email. Nobody can browse everyone on AVX
- **Account → Who can find you by name**: managers and admins only (default) or also other crew
- Privacy notice (EN/PT): what this search shows and the setting

## 0.19.0 — Inventory I7: reports

### Added
- **Inventory → Reports** for the last 90 days, 12 months or this year: use, gigs, last used,
  revenue from accepted quotes, revenue against purchase cost, repairs and what was charged back,
  losses at replacement value, subrental spend and book value per item, with totals
- Items not used in the period, with their book value
- CSV download of the report

## 0.18.0 — Inventory I6: subrental and cross-hire

### Added
- **Inventory → Subrentals**: suppliers, and gear hired in for a period or a gig, with lines, costs,
  reference and status
- Confirmed subrentals count as available stock for the dates they cover, so a gig's shortage clears
- **Subrent N** on short lines in a gig's Equipment tab, filled in with the gig's dates and the item
- **Cross-hire between companies on AVX**: share your cross-hire code; companies that link it can
  send you hire requests, which you confirm or decline with a note and a price. Both sides are
  notified, and they only see your organisation's name and what was asked

## 0.17.0 — Inventory I5: maintenance

### Added
- **Report damage** on a gig's Equipment tab, for everyone on the gig: the item or unit code, what's
  wrong and a photo from the phone. The organisation's admins are notified
- **Inventory → Maintenance**: open and recently closed repairs, and inspections due. Repairs have
  a status, repairer (in house or outside), cost, charge to the client, expected return and outcome
- Units under repair aren't available for gigs until repaired; written-off units are retired; bulk
  quantities under repair count against availability
- Returns scanned in as damaged open a repair
- **Inspections**: set a kind and interval per item (e.g. PAT test every 12 months), record passes
  and fails (a fail opens a repair), see what's due or overdue
- A daily reminder notifies admins of inspections coming due
- Item page: repairs and inspections for that item

## 0.16.0 — Inventory I4: kits

### Added
- **Sets**: catalogue items with no stock of their own that stand for a group of items. Adding a
  set to a gig (or filling a gig from a quote that has one) plans its contents; sets can hold sets
- **Cases**: stock items with fixed contents. Planning a case plans its contents; each case unit
  records which units are packed in it, and scanning the case out or in moves them and its bulk
  contents too
- **Accessories**: items that come along automatically when another is planned, per item
- **Alternatives**: when a gig line is short, the Equipment tab offers a free alternative and moves
  the shortfall across in one click
- Item page: Contents, Accessories and Alternatives panels; units show which case they're in
- The equipment picker shows what each item brings and how many sets are free

### Fixed
- Filling a gig from a quote no longer fails when the quote has catalogue items that aren't
  stock-tracked (they're left out of the equipment list)

## 0.15.0 — Inventory I3: warehouse

### Added
- **Packing list** for every gig (Equipment tab → Packing list): printable, by category, with
  packing notes, tick boxes and what has gone out and come back
- **Scan out / in** (Equipment tab): scan QR labels with the phone camera, a hardware scanner or by
  typing the code. Units are tracked one by one, bulk items by quantity; returns can be marked
  damaged, which sends the unit to repair
- Warnings for more than planned, a unit already out on another gig, more back than went out and
  lost units turning up; nothing is blocked
- Planned / out / back on each line of the Equipment tab; units still out after the gig can be
  marked lost in one go
- Item page: shows which gig a unit is out on

### Changed
- The site may use the camera (for scanning only)

## 0.14.0 — Inventory I2: availability

### Added
- **Equipment** tab on every gig: everyone on the gig sees the list; the gig's managers and the
  organisation's admins and members add gear from the catalogue, with how many are free on the
  gig's dates, and change quantities or give a line its own dates. Shortages are flagged, never
  blocked. Planners see total weight and power
- Equipment on gigs is booked in the reservations engine, for the gig's days plus the
  organisation's prep and return days (new in Organisation settings). Draft gigs hold gear,
  archived gigs free it, date changes move it
- Availability counts the busiest moment in a period, so bookings on different days don't add up;
  units in repair don't count as available
- Quotes: lines added from the price list remember their catalogue item; **Availability** in the
  quote editor checks them for the quote's dates; filling a gig from its quote now adds the
  equipment too (the most used in any one phase)
- Item page: upcoming bookings and a six-week availability strip

### Changed
- The "fill gig from quote" dialog lists equipment alongside schedule and positions

## 0.13.0 — Inventory I1: catalogue and stock

### Added
- Inventory menu for admins and members: Catalogue, Locations, Stock movements and QR labels
- The price list becomes the catalogue: rental and sale items can be counted in bulk or tracked by
  serial number, with a code, brand, model, weight, power, size, replacement value, minimum stock
  and packing note; low stock is flagged
- Locations (warehouses, vehicles, sites), archived instead of deleted
- Bulk stock through a ledger that can't be edited: add, move, remove (sold, lost, retired) and
  count (records the correction). You can't take out more than a location holds
- Serial-numbered units with QR code, status (available, in repair, lost, retired), purchase details
  and book value; every move and status change is logged automatically
- Paste import from a spreadsheet (creates items and adds stock)
- Printable A4 QR label sheets; scanning a label with any phone camera opens the item or unit
  (`/scan/<code>`)
- docs: decisions for the "your network" picker (after inventory) and the crew network / job board
  (after messaging) recorded in the roadmap

### Changed
- Archived catalogue items no longer appear in the price list or the quote picker
- Disabled buttons look disabled everywhere

## 0.12.0 — Phase 5a: people, bookings and clashes

### Added
- A reservations engine: one table records who (later: what equipment, vehicle or room) is taken
  for which time range, kept in step by the database (docs/RESERVATIONS.md)
- Booking times per crew member ("Set times" in the Crew tab); without them a person is booked for
  the gig's whole days, so short jobs on the same day no longer clash
- Double-booking warnings: ⚠ next to anyone booked elsewhere at the same time, with advice to talk
  to them first; the same warning while inviting by email; a warning in the new/edit gig form when
  the dates overlap your own bookings. Nothing is blocked. Other companies' gigs still show only as
  "another gig"
- Ask availability: managers send a question, the person answers Available / Not available with a
  note from My work, and both sides are notified (in the app and the email summary)
- My work marks gigs that overlap another booking or your unavailable dates ("Double booking" on the
  card, amber outline in the calendar)
- Unread updates per workspace in the switcher; mute an organisation from the Organisations page
  (no badge and no email summary for it; questions addressed to you still arrive)
- Organisation admins can add someone from a gig's crew to the organisation in one click
- Plans: docs/INVENTORY.md (inventory phases I1–I7) and docs/MESSAGING.md (messaging M1–M6)

### Changed
- Viewers can no longer create gigs (enforced by the database)
- Notifications about a gig always carry its organisation
- My work shows a gig once even if you hold two roles on it, with both functions

## 0.11.0 — Phase 4d: navigation and workspaces

### Added
- App shell on every signed-in screen: the logo always goes home; notifications and account in the
  top bar; section menus (Gigs, Quotes, Organisation) open dark frosted card panels on desktop, with
  a side list for smaller items; on phones a bottom tab bar plus a "More" sheet
- Workspace switcher next to the logo: **My work** (every gig you're on, at any company, with the
  company and your role on each) or one of your organisations, with your role there. Menus follow
  the role; AVX reopens the workspace you used last
- Organisations page (`/orgs`): your organisations with your role in each, the companies you work
  for as crew, and creating a new one
- Addresses for everything the menus link to (`/me`, `/org/:id`, quotes tabs, members, settings,
  new gig, account), so links, the back button and bookmarks work
- The gig page shows which company it belongs to and your role there

### Changed
- `/dashboard` now opens your current workspace; gigs shared with you moved into My work
- The gig page's back button returns to where you came from
- Viewers are no longer offered "New gig" in the menus

## 0.10.0 — Phase 3 leftovers and the quote PDF

### Added
- Quote PDF: emails to clients carry a PDF of the quote (same version as the link) as an attachment;
  "Download PDF" on the print preview and on the client's page. Made in the browser, never stored.
- Two-step sign-in (Account → Two-step sign-in): codes from an authenticator app. Once on, the database
  itself refuses a session that hasn't given the code (tables, files and the app's functions), so the
  password alone isn't enough even outside the app.
- Anonymous usage counts for the pilot: how often each screen and a few actions are used per day, with
  no user id, IP, device or cookie; skipped when the browser sends Do Not Track / Global Privacy Control
  (docs/USAGE.md)
- Signed-in browser tests for uploading a file and a new version, and for inviting someone by email
  before they have an account

### Changed
- Privacy notice names Brevo as the email provider and describes usage counts and quote recipients
- The client's quote page offers "PDF" and "Print" separately

## 0.9.0 — Phase 4c: quote versions, sending to clients, quote → gig

### Added
- Quote versions: save the quote as a numbered version with a note, view or print any version, and
  restore one (the current state is saved as a version first, so nothing is lost)
- Send to client: creates a private link to an online copy of the quote (valid 30 days) and emails it
  through Brevo when an address is given; otherwise copy the link yourself. Sending again replaces the
  previous link; links can be turned off. Each send is saved as a version.
- Public quote page (`/q/…`, no account needed) in the quote's language, printable, with Accept /
  Decline (name and optional message). The answer sets the quote's status and notifies the sender, the
  quote's author and the organisation's admins (in the app and in the daily email).
- Fill a gig from its quote: schedule items from the phase dates (one per day) and crew positions from
  the crew lines, shown first so you can untick or adjust them
- "Positions to fill" in the gig's Crew tab: roles with how many people are needed, how many are
  filled (crew and invites with that function), and a quick invite for the role

### Changed
- The printed quote fits phone screens (smaller type, wrapping, scrolls sideways when needed)

## 0.8.0 — Phase 4b: branded quotes, price list, safe deletion

### Added
- Delete a gig (Edit gig → Danger zone) or an organisation (dashboard → ⚙ settings → Danger zone),
  admins/creators only, behind a two-step confirmation: a list of everything that will be destroyed
  with counts and an "I understand" tick, then typing the name, with the button locked for 5 seconds.
  Crew and members get a notification (and the daily email) when it happens.
- Organisation settings (rename) for admins; deletion moved out of the Members window
- Quote branding: header image repeated on every printed page, accent colour, number prefix and
  "next number" to continue an existing numbering
- Quote fields for project manager and payment method; optional start/end times per phase, printed
  as an agenda
- Printed quote redesigned (Inter + Space Mono): client, title, project details, agenda, sections with
  section totals, totals by type, final discount, VAT, numbered conditions, contact footer
- Price list per organisation: add/edit items, paste-import from a spreadsheet, and "From price list"
  in every quote section

## 0.7.0 — Phase 4: quotes

### Added
- Quotes for organisation admins and members: phases as tabs (own dates, discount, optional),
  sections and priced lines (rental, sale, crew, transport, other, comment), live totals by phase,
  by type, with discount and VAT
- Templates: save a whole quote or one phase, start a quote from a template or add one as a block
- Printable quote / PDF in Portuguese or English with company details and terms; optional
  "no prices per line" layout
- Company details and quote defaults per organisation (admins)
- Create a gig from a quote, or link a quote to an existing gig
- Access-rule test for quotes (`supabase/tests/quotes_rls.sql`), unit tests for the quote maths,
  signed-in browser test for building and printing a quote

## 0.6.0 — Phase 3: out in the field

### Added
- Offline mode: the app opens without signal; dashboard, gig pages and call sheets show the last saved
  copy with a banner; files can be kept offline one by one or all at once. Saved data is cleared on sign-out.
- Magic-link sign-in ("Email me a sign-in link"), with a bilingual email template
- Daily email summary of unread notifications (Brevo), in each person's language, with an Account opt-out
- Signed-in browser tests against a separate Supabase test project (`e2e-auth` CI job, off until enabled)

### Changed
- Projects without email confirmation sign the new user straight in after sign-up
- Keep-alive also pings the test project when configured

## 0.5.0 — Phase 2b: team experience

### Added
- In-app notifications with a live bell (gig/org invites, new files and versions, important posts, schedule,
  call-time, status and date changes)
- Portuguese / English interface, including legal pages; language saved to your profile
- Crew availability (private unavailable dates) with clash warnings for managers
- "Coming up" schedule card on the gig overview
- Playwright browser tests in CI; optional backup of uploaded files

### Changed
- Gig page split into tab components (`src/components/gig/`) using the shared UI module

### Fixed
- Re-inviting someone already on a gig silently did nothing; it now updates their call time and role
- Feed post headers wrap properly on narrow screens

## 0.4.0 — Phase 2a: day-to-day production tools

### Added
- Gig schedule tab and printable call sheet (schedule + crew calls + phones)
- Activity log per gig, written by database triggers
- Live updates for the feed and for changes made by other people
- File version history with PDF/image preview and per-version download
- Dashboard calendar view
- Installable PWA (manifest, icons, iOS home-screen support)
- Optional phone number in Account

### Changed
- Gig tabs scroll horizontally on small screens
- New shared UI module (`src/components/ui.jsx`) for new components

## 0.3.0 — Phase 1: ready for pilot companies

### Added
- Organisation members: invite by email, roles, remove, leave, delete organisation (last admin is protected)
- Invitation emails for gigs and organisations, and a `/welcome` page to set name + password
- Account: export my data, delete my account
- Privacy notice and beta terms, linked from sign-up
- Dashboard filters (upcoming / past / archived / all) and search
- Optional Sentry error monitoring; daily encrypted database backups workflow
- Branded auth email templates and email deliverability guide

### Changed
- DM Sans font is now self-hosted (no requests to Google)
- Clearer message when choosing your current password as the new one

## 0.2.0 — Pilot foundation

### Added
- Password reset ("Forgot password?"), resend confirmation email, change password and name from the Account panel
- Crew by email: existing users are added at once; pending invites are claimed automatically on sign-up
- "Shared with you" gigs on the dashboard for crew outside the organisation
- Delete assets, delete feed posts, remove crew / leave a gig
- Upload hint showing when a file will become a new version
- Error boundary, toast notifications, central logger, friendly error messages
- Security headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy), favicon, robots noindex
- ESLint, Vitest unit tests, GitHub Actions CI, Supabase keep-alive workflow
- `supabase/migrations/` and an access-rule smoke test

### Fixed
- Access rules: recursion errors, users able to join any organisation, crew seeing other gigs' files
- Creating an organisation failed; storage bucket was public
- A new upload replaced any asset of the same type (now only same type + same name)
- Empty dates broke gig create/edit; errors were silent
- Debug output shown when opening files; pinch-zoom disabled on mobile

### Changed
- Minimum password length 8; file uploads limited to 50 MB with a clear message

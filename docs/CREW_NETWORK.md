# Crew network and job board (Phase 7)

Status: **N1–N5 built** (crew profiles 0.48.0, crew search 0.49.0, job board 0.50.0, trust 0.51.0, alerts and saved searches 0.53.0). The crew network is complete. Decisions taken 2026-10-21 (below).

The aim: a production company that needs a lighting tech in Porto next Saturday can find one, and
a freelancer can find work, without leaving AVX and without anyone's details being exposed to
people they didn't choose. It builds on what exists:

- **Your network** (5c): find people you've already worked with; each person chooses who can find
  them (managers only, or also other crew). Emails are never shown.
- **Availability** (5a): unavailable dates, clashes with booked gigs, "ask availability".
- **Crew calls** (M4a): offer places on a gig to chosen people; accepting adds them to the gig.
- **Messaging, reporting and blocking** (M1–M6a): conversations, reports to moderators, blocks,
  rate limits.

## What changes for whom

| Who | Today | With the network |
|---|---|---|
| Freelancer | Found only by companies they've worked with | Can switch on a **public crew profile** (off by default) and is then findable by any AVX company searching for their function, region and dates. Sees **open positions** that match them and applies |
| Company (admin, member) | Invites people by e-mail or from its network | Searches the **crew pool** (opted-in profiles only) and **posts open positions** for a gig; applications arrive as conversations with the availability already checked |
| Everyone else | — | Nothing changes. Nobody is listed unless they choose it |

## Design

### Crew profile (opt-in)

- Off by default. Switched on in Account → "Crew profile". The person chooses who sees it, and
  can change it at any time: **companies only** (signed-in admins and members of AVX
  organisations; the default) or **companies and crew** (also other people on AVX, e.g. a
  freelance PM building a team). Never the public web.
- Fields: display name, photo (the account's), **functions** (from a shared list: sound engineer,
  lighting op, rigger, stagehand, video tech, backline, PM…, plus free text), **base location**
  (city + country) and **how far they travel** (km or "anywhere in country / EU / worldwide"),
  **languages**, **certificates** (e.g. IPAF, rigging, first aid, with an expiry date; an
  uploaded proof stays private until verified), years of experience, a short bio, links (website,
  showreel).
- **No rates on the profile.** A day rate is given only in an application, to that company.
- Calendar: busy dates come from AVX gigs and unavailable dates; the profile shows only
  "available / busy" for the dates searched, never which gigs.
- Pausing the profile hides it at once; deleting the account deletes it.

### Crew search (companies)

- From a gig ("Find crew") or Organisation → Crew pool: filter by function, dates (available on
  all of them), distance from the gig's venue or a city, languages, certificates. Results show
  the profile, "worked with you N times" if so, and availability for the dates.
- Actions: **Ask availability** (5a) or **Offer a place** (a crew call, M4a) straight from the
  result. Both arrive as a direct conversation, as today. The freelancer's e-mail is never shown;
  it is shared only once they accept a place on a gig.
- Limits against scraping: results paged, a daily cap of profile views and first contacts per
  organisation, rate limits as in M6a.

### Job board (open positions)

- From a gig's crew positions (4c), an admin or member can **publish a position** to the board:
  function, dates, region (from the venue), languages, required certificates, a description, and
  how pay is handled ("send your day rate" or a stated fee/range, the company's choice).
- Freelancers with a profile see matching positions on their home page and in a Jobs page;
  optional notifications for new matches (in-app, push, e-mail summary).
- **Apply**: a short message, their day rate (if asked), availability confirmed for the dates.
  The application opens a conversation with the posting company, where the rate stays private
  to the two sides. The company shortlists, declines (with a polite default message) or offers
  the place (a crew call), which adds them to the gig when accepted.
- Positions close when filled, at the gig's start, or by hand.

### Trust and safety

- Who can post: organisations only (not individual accounts), and only once they have
  **two-step sign-in on for admins** and at least one real gig.
- **Verified companies** (company tax number checked against the EU VIES service, or a manual
  check) get a badge; unverified ones can post but are capped (e.g. 3 open positions).
- **Verified certificates**: a company that has worked with someone can confirm a certificate,
  or an AVX admin checks the uploaded proof. Until then it shows as "self-declared".
- Reports and blocks extend to profiles and positions (M6a): reporting a position or profile
  hides it from the reporter at once and queues it for review; repeat reports suspend posting.
- Contact rate limits (first messages per day), no attachments in a first message from a
  stranger, and a freelancer can switch off contact from companies they haven't worked with.
- Everything is logged for moderation; nothing is sold or shown outside AVX.

### International from the start

- Profile country, travel range in km or by area, languages from ISO lists, currencies on
  rates and fees, dates shown in each viewer's time zone, the shared function list translated.
- No country-specific employment logic (contracts, invoices, tax) in this phase: AVX connects
  people; the agreement is between them.

### Privacy and terms

- Privacy notice: a full section (what the profile holds, who sees it, how search works,
  certificates and proofs, what's kept after a profile is paused or deleted, rates only in
  applications). Terms: rules for posting and applying, no discrimination in positions,
  moderation and suspension. Both drafted in N1 and reviewed with the full terms before launch.

## Stages

| Stage | What | Size |
|---|---|---|
| **N1 · Crew profiles** | Opt-in profile (functions, base and travel range, languages, certificates self-declared, bio, links), pause/delete, privacy section, help guide | 1 PR |
| **N2 · Crew search** | Search by function, dates, distance, languages, certificates; availability for the dates; ask availability / offer a place from a result; view and contact limits | 1 PR |
| **N3 · Job board** | Publish a gig position, matching positions for freelancers, apply (message, rate, availability), applications as conversations, shortlist/decline/offer, close | 1–2 PRs |
| **N4 · Trust** | Verified companies (VIES or manual), certificate confirmation and proofs, reports and blocks on profiles and positions, posting caps, contact settings | 1 PR |
| **N5 · Notifications and polish** | Match alerts (in-app, push, summary e-mail), saved searches, phone layout pass, screenshots | 1 PR |

## Decided (2026-10-21)

| # | Question | Decision |
|---|---|---|
| N-D1 | Who can see a crew profile? | **Each person chooses, and can change it at any time:** companies only (admins and members of AVX organisations; the default) or companies and crew (also other signed-in people). Never the public web |
| N-D2 | Distance: how to place people and venues? | City + country typed by the person, turned into coordinates once (OpenStreetMap's free geocoding, through an AVX function so the person's address isn't sent from their browser); search by km from the venue. Coordinates are kept rounded to about 1 km |
| N-D3 | Who can post positions? | Organisations whose admins use two-step sign-in; unverified ones capped at 3 open positions |
| N-D4 | Verification of companies | EU VIES tax-number check where possible, otherwise a manual check by AVX |
| N-D5 | Pay on a position | The company chooses: "send your day rate" or a stated fee/range (default, not asked) |

## How N1 works (0.48.0)

| Piece | How it works |
|---|---|
| Where | Account → "Open your crew profile" → `/me/profile` |
| Data | `crew_profiles`, one row per person (only they read and write it): on/off, who sees it (`companies` / `crew`), headline, functions (keys from `FUNCTIONS` in `src/lib/crewProfile.js`, translated as `crewFn.*`) and other functions, bio, town (`base_place`, country, coordinates to 2 decimals), travel (25–500 km, country, Europe, world), languages (ISO codes, named by the browser in the reader's language), years, up to 3 links (web addresses only), up to 20 certificates (name, issuer, valid until; self-declared). It can only be switched on with a function and a town. "Remove" clears the row |
| Seeing it | `crew_profile(user)` returns a profile only when it's on, the viewer is on the side the person chose (`private.is_company_side` for companies) and neither has blocked the other; coordinates are never returned. The search that uses it is N2 |
| Town | The `geocode` Edge Function (Verify JWT on, and it checks for a signed-in person) asks OpenStreetMap's Nominatim for the typed name with an identifying User-Agent, at most once a second, and returns up to 6 towns with coordinates rounded to about 1 km (`_shared/places.ts`, tested in `src/lib/crewProfile.test.js`) |
| Two-step sign-in | The table has the `mfa_required` rule and both functions call `require_mfa()`, like everything else. The same migration adds them to the calendar link, which had missed them in S4 |

Checks: `supabase/tests/crew_profiles.sql`; the lists and checks in `src/lib/crewProfile.test.js`.

## How N2 works (0.49.0)

| Piece | How it works |
|---|---|
| Where | Organisation menu → Find crew (`/org/:id/crew`), and "Find crew" on a gig's Crew tab (`?gig=…`, which picks the gig: its dates are searched and its venue is offered as the place). Admins and members only |
| Search | `search_crew()` returns 20 at a time (and the total) of the switched-on profiles the caller may see (`can_see_crew_profile`: the person's choice and blocks). Filters: one function, words (name, headline, other functions, bio), a language spoken, a certificate still valid on the last date, a place with a distance, dates and "only free". Distance is great-circle km between rounded coordinates; someone further than the distance is still listed when their own travel range covers it (km, their country, Europe, world). Free/busy: a gig they're on (not archived) or unavailable dates overlapping the dates; which gig is never shown. Order: free first, nearest, worked with you most, recently updated |
| Contact | `contact_crew(gig, person, kind)` from a gig the caller manages: `availability` adds an availability question (5a), `offer` a crew call for one (M4a, accepting adds them to the gig). The first contact is kept in `crew_contacts` (company, who, when, gig), and `can_message` lets the two write to each other from then on. Refused for someone who blocked the caller (or was blocked), whose profile is off, who's already on the gig, or who was already asked about it |
| Limits | 200 searches a day per organisation (`crew_search_log`) and 25 new people contacted a day per organisation; both answer "try again tomorrow" |
| Two-step sign-in | Both tables have the `mfa_required` rule and both functions call `require_mfa()` |

Checks: `supabase/tests/crew_search.sql`; the filters in `src/lib/crewSearch.test.js`.

## How N3 works (0.50.0)

| Piece | How it works |
|---|---|
| Posting | Crew tab → "Post a job", or Organisation → Job posts → "Post a job" (choose the gig). `publish_job(gig, job)`: the caller manages the gig and is an admin or member; **two-step sign-in must be switched on** (a verified factor); an organisation without `verified_at` can have 3 open posts. Dates default to the gig's; the town comes from the shared town finder (coordinates rounded). The post never carries the gig's name or client |
| Seeing posts | `list_jobs(all)`: only for people whose crew profile is on. Default: posts for their functions (or with no function) within their travel range from their base (km, country, Europe, world); "all" shows every open post. Open = status open and the last day not passed. Blocks hide posts both ways. The organisation reads its own posts through the table |
| Applying | `apply_job(post, message, rate)`: needs the profile on, not already on the gig, not blocked, and the day rate when the post asks for it. One application per post; 20 a day per person. It posts a "job_application" message in a direct conversation with whoever posted (rate included, for the two of them) and notifies that person and the organisation's admins (`job_application`). `can_message` lets applicant and poster write to each other |
| Answering | `job_applicants(post)` (the organisation) returns each application with the applicant's crew profile if it's on. `answer_application(id, shortlist / decline / offer)`: decline posts a "job_declined" message with an optional note and notifies the applicant (`job_declined`); offer sends a crew call for one (M4a). Joining the gig (a trigger on `gig_members`) marks the application accepted, and the post filled when the accepted count reaches its quantity. `withdraw_application` for the applicant; `close_job` to close, fill or reopen |
| Notifications | In the app, by push and in the e-mail summary (`_shared/notification-text.ts`): both kinds count as a direct question, so they still show when the organisation is muted |

Checks: `supabase/tests/job_board.sql`; the form and pay wording in `src/lib/jobs.test.js`.

## How N4 works (0.51.0)

| Piece | How it works |
|---|---|
| AVX admins | `private.avx_admins` (no one reads it through the API). Added by hand in each project's SQL editor: `insert into private.avx_admins (user_id) select id from auth.users where lower(email) = lower('…') on conflict do nothing;`. Their functions need two-step sign-in switched on and used (`require_avx_admin`). Account shows them "AVX reviews" (`/admin/trust`) with the count waiting (`trust_queue_count`) |
| Verified companies | Organisation settings → Verification (admins). EU: the `vies-check` Edge Function calls `start_vies_check` as the admin (cleans the number, 5 a day), asks VIES's REST API, and records the answer with the service role (`record_vies_result`, which no person can run). Valid → `organisations.verified_at`, `verified_method = 'vies'`, `verified_name` (the name VIES holds, shown as "Registered as" on job posts). Otherwise `request_manual_verification(note)` queues a manual check; AVX admins `decide_verification` or `revoke_verification`. History in `org_verifications`. A trigger keeps `verified_*` and `posting_suspended_at` out of the organisation's own reach (it was open in N3; nothing had used it) |
| Certificates | The profile trigger gives each certificate an id and works out its marks on every save: `confirmed_by` (from `certificate_confirmations`) and `verified` / `proof_pending` (from `certificate_proofs`), each only while the certificate's name and expiry match what was confirmed or checked. `confirm_certificate(org, person, cert)`: an admin or member of an organisation that has had the person on a gig (or as a member). Proofs: the file goes to the private bucket `certificate-proofs` (`<user>/<certificate>/<file>`, read by the person and AVX admins only), then `submit_certificate_proof`; AVX admins `review_certificate_proof` |
| Reports | `report_network('profile' | 'job', id, reason, note)`, 20 a day, once per thing. The reporter stops seeing it at once (`can_see_crew_profile`, `list_jobs`). Three different people reporting a profile set `crew_profiles.suspended_at` (hidden from everyone); three reporting an organisation's posts set `organisations.posting_suspended_at` (posts hidden, `publish_job` refused). `decide_network_report(remove)`: keep lifts the pause; remove closes the post or keeps the profile hidden. `lift_suspension` undoes either |
| Contact settings | `crew_profiles.contact_from`: `any` or `known`. `contact_crew` refuses someone set to `known` unless the organisation has worked with them or they can already write to each other; `search_crew` returns it so the buttons give way to a note |
| Files from strangers | The message guard refuses files in a direct conversation when the two share no gig or organisation and the other person hasn't written in it yet |

Checks: `supabase/tests/crew_trust.sql`; `src/lib/trust.test.js` (VAT numbers, VIES answers, certificate marks).

## How N5 works (0.53.0)

| Piece | How it works |
|---|---|
| Job alerts | `crew_profiles.job_alerts` (default on). The `job_posts_alert` trigger (after insert) adds a `job_match` notification for each switched-on, unsuspended profile that fits (`private.job_fits_profile`: function and travel range, as `list_jobs` "For you"), leaving out the organisation's members, people on the gig, the poster, and blocks either way; at most 10 a day per person. Details: post id, title, organisation name, place, dates (no gig name). Push and the e-mail summary word it from `_shared/notification-text.ts`; it links to `/jobs` |
| Saved searches | `crew_saved_searches` (org, name 1–80, filters jsonb ≤ 4 kB, alert, `removed_at`). Admins and members (`can_quote`) read and save; only name, filters, alert and `removed_at` can change; removing only marks it (removed ones can't be brought back). 30 per organisation. The app saves the Find crew filters `fn`, `text`, `language`, `certificate`, `place`, `km` (`toSaved` / `fromSaved` in `src/lib/crewSearch.js`) |
| Search alerts | The `crew_profiles_alert` trigger runs when a profile becomes switched on (or is shown again after a pause), not on edits. For each saved search with the alert on whose saver is still an admin or member, may see the profile (`can_see_crew_profile`) and whose filters it fits (`private.profile_fits_search`: function, language, a valid certificate, words, place within the search distance or the person's own range), a `crew_match` notification goes to the saver (at most 5 a day per search). It opens `/org/:org/crew?search=<id>`, which runs that search |

Checks: `supabase/tests/crew_alerts.sql`; `src/lib/crewSearch.test.js` (saved filters).


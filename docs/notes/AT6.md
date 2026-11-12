# AT6: Automated tests, crew marketplace (profile, Find crew, job board, trust, alerts)

## Changelog
### Added
- **Automated tests for the crew marketplace (AT6).** 14 signed-in browser tests in
  `e2e/auth/marketplace.spec.js` (tag `@marketplace`) now check most of T40–T43 and T45, and the
  marketplace parts of T68, on the test project every night; the smoke test (Find crew lists a
  switched-on freelancer with the distance and "free", and "Ask if free" reaches them) runs on every
  pull request. One test (AVX reviews) waits for test_support to be installed.

## Roadmap
Automated tests: AT6 (crew marketplace) built: `e2e/auth/marketplace.spec.js`.

## T-lines automated (test names in `e2e/auth/marketplace.spec.js`)
| T-line | What the tests check | Tests |
|---|---|---|
| T40 | Settings → "Open your crew profile"; tick Rigger and Stagehand, type the town and Find (stand-in), choose Lisboa, add Portuguese and a certificate (IPAF 3a, issuer, valid until), switch it on: the preview shows the name, functions, town, language and certificate (self-declared); Save → "Saved. Your profile is on."; "Companies and crew" saved; "Remove my crew profile" asks first, then everything is cleared and off; the page in Portuguese (heading, status, preview) passes the accessibility check | `crew profile: functions, town, language and certificate, …`; `crew profile in Portuguese` |
| T41 | Gig's Crew tab → ⋯ → Find crew (picks the gig), function, the freelancer's name, Near → Lisboa → Search: listed with "… km away" and "Free on these dates"; "Ask if free" → the question is in the freelancer's messages; "Offer a place" → they accept in Messages and are on the gig; switched off, the same search finds 0 | `Find crew lists a switched-on profile …` (**@smoke**); `Find crew → "Offer a place": …` |
| T42 | A company with two-step sign-in (switched on through the API) posts from Crew tab → ⋯ → Post a job (function, town, "Ask for their day rate"); the freelancer sees it under Jobs → For you (company and town, not the gig's name), applies with a message, a rate and "I'm free on …"; the company gets the notification and the message; Job posts → Applicants shows the rate and message; "Offer the place"; the freelancer accepts the crew call; the post is "Filled"; a fourth open post on an unverified organisation is refused with its message | `job board: a company with two-step sign-in posts, …`; `an organisation that isn't verified can't have a fourth open post` |
| T43 | (1) Settings → Verification, Portugal and a NIF, Check with VIES (stand-in): "Verified. …"; a number VIES rejects: the "isn't a valid VAT number" alert. (3) A company that had the freelancer on a gig presses "Confirm" under their certificate in Find crew: "confirmed by <organisation>", also on the freelancer's own profile. (4) The freelancer reports a job post: it's gone from For you and All open jobs, also after a reload. (5) "Only companies I've worked with": another company sees the profile with "Only takes contact from companies they've worked with" and no Ask/Offer buttons, and the database refuses `contact_crew`. (2) + deciding the report: an AVX admin approves a certificate proof (the profile then says "proof checked by AVX") and removes a reported post in AVX reviews — **skips until test_support is installed** | `verification: …`; `a company that had the freelancer on a gig confirms …`; `a freelancer reports a job post …`; `"Only companies I've worked with": …`; `AVX reviews: …` |
| T45 | "Tell me about new jobs that fit me" is ticked by default; a post that fits notifies the freelancer ("New job for you: … at <organisation>", not the gig's name) and opens Jobs; unticked and saved, the next post makes no notification; Find crew → "Save this search" with the alert on; the freelancer switching on gives the company "… matches your saved search “…”", which opens Find crew with that search (1 person found); removing it asks first ("Remove the saved search …? Its alerts stop.") | `job alerts: …`; `saved search: …` |
| T68 (AT7's leftovers) | Find crew → "Offer a place": the fee fills from the rate card (Rigger 190 × 2 days, "The rate card suggests", total €380.00); the freelancer's notification shows "· fee €380.00"; accepting makes it "Agreed: €190.00 …" under Labour cost and "Your fee for this gig" for them. Post a job: choosing the function fills the pay from the day rate ("Filled in from your rate card …"), typing your own amount keeps it. Job posts → Applicants → "Offer the place": a window with the fee from the rate they sent ("From the day rate they sent (€210.00) …", 2 days), editable (220 → total €440.00); accepted, Labour cost says "Agreed: €220.00". Quote: a crew line "Rigger" shows "Rate card cost €380.00 · margin €120.00 (24%)", the Summary has "Crew margin"; the printed quote has neither | `Find crew → "Offer a place": …`; `job board: …`; `a quote's crew line shows the rate card cost and margin, …` |

Accessibility (axe) runs on: Find crew (results, offer window, saved search form), the crew profile
(English and Portuguese), Post a job, Jobs and the Apply window, Job posts with applicants and the
offer window, Verification, the report window, the notifications, AVX reviews (once installed).

## T-lines (parts) left manual, and why
- **All of them, Portuguese wording:** a person reading the wording is still needed; only the crew
  profile is opened in Portuguese (and checked for accessibility).
- **T40, T41, T42, T45:** the real town search (LocationIQ) is never called: the tests use the
  stand-in, so "Search by LocationIQ.com" and real places are by hand.
- **T41:** "Busy on some of these dates" and the order of results are not checked.
- **T42:** switching two-step sign-in on through Account (the tests switch it on through the API);
  the push notification.
- **T43 (1):** a real VIES answer, and the organisation actually becoming verified (the badge on
  job posts, "Registered as …", more than 3 open posts): the stand-in answers the browser only and
  the database is only marked verified by the function's service role.
- **T43 (2), deciding a report:** written (`AVX reviews: …`) but skipped until test_support is
  installed on the test project (it needs `make_me_avx_admin`). Opening the proof file (a signed
  link in a new tab) is not checked even then.
- **T45:** the push notification (a real device); the tests switch the profile on and off through
  the API rather than the page (the page's switch is covered by T40).
- **T68:** "using their own rate if they have one" (a per-person rate) in Find crew; the PDF and the
  client's link of the quote (only the printed page is checked).

## Bugs found
- None in the app.

## Needs your decision
- **Two-step sign-in on test accounts.** Posting jobs needs it, so the file switches it on for its
  two company accounts through the API and off again in `afterAll`, because the sweep signs in with
  a password only and `delete_my_account` needs the second step when a factor is on. If a run is
  killed before `afterAll` (e.g. a crashed worker or a cancelled job), those two accounts keep the
  factor and the sweep can't delete them: they then need removing by hand (test project →
  Authentication → Users). The secret is kept in `.e2e-accounts/<run>-<role>-marketplace.totp` (not
  committed) so a restarted worker can still sign in at the second step. A sturdier option for
  later: teach `scripts/e2e-sweep.mjs` to use that file.
- **While probing two-step sign-in by hand**, the hand-made account `e2e-worker-at6@example.com`
  got a factor whose secret was lost; I marked that one factor `unverified` on the TEST project
  with the Supabase connector (an update, no delete) so the sweep could remove the account, which
  it then did.

## Pending: test lines (section 2)
- **AT6:** after test_support is installed (AT0), Actions → E2E nightly: `AVX reviews: an AVX admin
  approves a certificate proof and decides a reported post` passes instead of being skipped. If it
  fails then, it's the test's first real run: check the AVX reviews selectors before suspecting
  the app.

## Pending: new questions (section 3)
- None.

## Session prompt
None: the Automated tests set was given by the Dispatcher.

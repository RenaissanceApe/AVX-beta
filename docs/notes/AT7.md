# AT7: Automated tests, hours, leave, expenses, crew rates and fees

## Changelog
### Added
- **Automated tests for hours, leave, expenses, crew rates and fees (AT7).** 15 signed-in browser
  tests in `e2e/auth/hours.spec.js` (tag `@hours`) now check most of T55, T68–T71 and T85 on the
  test project every night; the smoke test (crew log hours, the admin sends them back, then
  approves them) runs on every pull request.

## Roadmap
Automated tests: AT7 (hours, leave, expenses, crew rates and fees) built: `e2e/auth/hours.spec.js`.

## T-lines automated (test names in `e2e/auth/hours.spec.js`)
| T-line | What the tests check | Tests |
|---|---|---|
| T55 | Settings → Crew rates: add a function rate (200/day) and weekend factor 1,25; the gig's Labour cost shows "From the rate card" with 2 weekend days and €500; the pencil sets a fixed €450 fee ("Agreed"), then "Use the rate card instead"; crew see only "Your fee for this gig" and no labour cost; the export has the rates, factors and fees files | `crew rates: a function rate gives the labour cost, …`; `the organisation export has …` |
| T68 | Crew call: typing the function fills the fee from the rate card; changing it and "Use the rate card's fee" puts it back | `crew call: the fee fills in from the rate card and can be put back` |
| T69 | Crew → Log hours (break, travel, km) → Waiting; admin sends back with a note, crew see the note, change it and it waits again; admin approves, and nobody can change it after; crew never see anyone else's hours or the labour cost; My hours and Organisation → Hours list them; the export has hours and holidays | `crew log hours, the admin sends them back and approves them` (**@smoke**); `crew never see anyone else's hours or cost; …`; `the organisation export has …` |
| T70 | Member asks for a holiday week (5 working days, "an admin approves it"); admin refuses one with a note and approves another; the member sees both, and the used days go up by the approved day; a sick day counts at once and the admins are told; a colleague sees it only as "Away", without the note; another company reads none of it; the export has the leave files; the Leave screen in Portuguese passes the accessibility check | `leave: a member asks, …`; `leave: a sick day counts at once …`; `leave in Portuguese`; `the organisation export has …` |
| T71 | Member: Categories tab hidden, "Add expense" with total 123 and VAT 23 % gives 100 + 23; a viewer has no Expenses menu and the page says it isn't for them; crew claim on the gig → PM sends back with a note → crew send again → PM approves; a monthly cost from the 1st of last month makes two drafts, this month's shown "To confirm"; the next morning's job makes nothing new (needs test_support); the export has the three expense files | `expenses: a member adds one …`; `expenses: crew claim on a gig, …`; `expenses: a monthly cost from last month makes two drafts to confirm`; `expenses: the morning job makes no new draft before the next date`; `the organisation export has …` |
| T85 | Expenses → Crew to pay lists a finished gig's agreed fee; labour panel → Mark paid (amount 300) → "Paid on …", one expense linked to the fee, the row leaves Crew to pay; crew are told without the amount; crew see "Paid on …", Mark received, then Not received; My numbers shows the tiles; a member who manages no gig sees Crew to pay empty | `crew numbers: the admin marks a finished gig's fee paid, …`; `crew to pay: a member who manages no gig sees an empty list` |

## T-lines (parts) left manual, and why
- **T55, T68–T71, T85, Portuguese wording:** a person reading the wording is still needed; the tests
  only check the Leave screen in Portuguese for accessibility.
- **T68:** sending a crew call to someone, their message and notification, accepting it, "Agreed"
  under Labour cost, job posts' pay, Find crew → "Offer a place", Job posts → Applicants → "Offer the
  place", and the quote's "Rate card cost … · margin" / Summary "Crew margin" (and that the printed
  quote, PDF and client link don't show them). Not automated in this step: each needs a second
  company's crew profile, a job post with applicants and a marketplace flow (AT6's area) — candidates
  for a follow-up.
- **T69:** turning Wi-Fi off ("Not sent yet" then sent when it's back) needs a real device; On-site
  mode "Clock in / Clock out" on a gig day; the bell; the calendar feed (needs the Edge Function on
  the test project); the CSV downloads; the night window, km rate and holiday split in the cost.
- **T70:** the 25-day allowance and per-person Edit (23 + 2 carried, Monday–Thursday, 9 h); a gig on
  an approved holiday showing "Not available" and Find crew "free only"; logging hours on approved
  leave and the half-day exception; removing approved leave (×); My work → Availability; the calendar
  feed; the notifications' wording.
- **T71:** a receipt photo from the phone (a real camera); "Mark paid without Paid by"; the VAT
  recovery tick in Categories; subrental and repair links and "already has one"; the labour panel's
  receipt button; Inventory → Bought with the supplier's invoice; Contacts → Suppliers' spend;
  "add the paid date as the member" under To reimburse; the accountant CSV in a spreadsheet.
- **T85:** My numbers → picking a year and a company, the Year statement (CSV, Print), the Overview
  tile "Crew fees to pay" going down.

## Bugs found
- **#209 (should fix):** the notification bell shows "9+" from ten unread notifications, but its
  accessible name is "10 unread notifications", so axe reports `label-content-name-mismatch`
  (serious). Documented by `the bell with ten unread notifications is accessible` with `test.fail()`
  (the browser gets ten stand-in notifications). To keep the other tests about their own screens,
  each test first marks its people's notifications read (`readBell`), as a person would.

## Pending: test lines (section 2)
- **AT7:** after test_support is installed (AT0), Actions → E2E nightly: `expenses: the morning job
  makes no new draft before the next date` passes instead of being skipped. When #209 is fixed, the
  bell test turns red ("expected to fail but passed"): remove its `test.fail()` line.

## Pending: new questions (section 3)
- None.

## Session prompt
None: the Automated tests set was given by the Dispatcher.

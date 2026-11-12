# AT8: Automated tests, reports and gig finance

## Changelog
### Added
- **Automated tests for reports and gig finance (AT8).** 10 signed-in browser tests in
  `e2e/auth/reports.spec.js` (tag `@reports`) now check most of T61, T74, T82, T83, T84 and T161 on
  the test project every night. Each test makes its own small organisation with known amounts and
  checks the exact numbers the reports and the gig's finance panel show. The smoke test (Reports →
  Overview's key numbers) runs on every pull request.

## Roadmap
Automated tests: AT8 (reports and gig finance) built: `e2e/auth/reports.spec.js`.

## T-lines automated (test names in `e2e/auth/reports.spec.js`)
| T-line | What the tests check | Tests |
|---|---|---|
| T61 | 1005 catalogue items plus one more at the end of the alphabet: all 1005 are listed in Inventory, the last one shows its stock (7), and search finds both the 1005th and the last item | `more than 1000 catalogue items all show in Inventory, with their stock` |
| T74 | On a gig with an accepted quote (€1,000), a confirmed subrental (€200), a repair (€50), an expense (€100) and crew (agreed fee, €280 approved; another only on the rate card, €150; the PM without a rate): revenue, labour, subrentals, repairs, other costs, total cost €780 and margin €220 (22%), "1 accepted quote", "Planned €450.00, actual €280.00 · €150.00 from the rate card (estimate) · 1 person without a rate", "Part of this is an estimate". "Add expense" (€30) updates the panel; an expense linked to the subrental (€180) replaces its €200. Completed: "Save as agreed fees" → "1 fee saved", the estimate note goes, and a rate-card change afterwards leaves the margin at €210. The organisation export's `gig_finance` rows (the call the download makes) have the same numbers. A member sees the same numbers and "Add expense" but no save button; a viewer and crew see no panel; the gig card in the list shows "Margin 22% · est.". Reports → Gig margins for the gig's day: margin, revenue, total cost and negative-margin tiles, the gig's row in the details, and the CSV (one row with the same numbers). The panel in Portuguese | `gig finance: the numbers, …`; `a member sees the same gig finance …`; `Reports → Gig margins: …`; `gig finance in Portuguese` |
| T82 | Inventory → Reports opens Reports → Equipment. A set (€300) of 1 speaker (€100) and 2 amps (€50) shares its revenue €150/€150; a hand-typed €100 line shows "Not linked to an item: 25% (€100.00)" with revenue €400 in all; a unit lost with €100 paid out on €400 shows €300 under Losses, and €0 once it's found again. The speaker's Numbers card: €150 so far, 13% of its €1,200 paid back. Inventory → Subrentals: "Buy instead? … (hired in once)" opens Buy or hire in with the amp picked and its €40 hire-in | `Reports → Equipment: a set's revenue lands on its contents, …` |
| T83 | Demand (next 30 days): 2 truss owned, two gigs want 2 each for 3 days → 1 item over stock, 3 days over stock and 3 still short; a confirmed subrental of 2 for the first day → 2 still short, 1 hire-in. Suppliers: a request then confirmed → requests 1, confirmed 1, waiting 0, spend €25 and a time to answer. Damage and loss by gig: the €60 repair under its gig and client. The three K6 tiles on Reports → Overview (items short 1, units in repair 0, inspections overdue 0), and "Items short" opens the demand view. A member sees the same counts; a viewer has no Reports link and the page says Reports are for admins and members | `Reports → Warehouse → Demand: …` |
| T84 | Crew on two gigs the same day: "Double booking" in their gig list; cancelling one removes it, and the cancelled gig leaves the organisation's upcoming list. Activity: 3 gigs, 1 cancelled. The four K7 tiles on Overview link to their views (and "Overdue tasks" opens the tasks view). People as the admin: 6 crew days (the cancelled gig's day not counted), 8 h approved, per-person rows; the person's page opens from the table. As a member: the same totals, "Figures per person are shown to admins only.", and the person page says only admins see it | `Reports → Operations: per-person rows for the admin, …` |
| T161 | Reports → Overview and the organisation's Home: revenue this month €1,000.00, "Same days last year: €500.00", gross margin this year 90%, operating result this year €900.00; the Home tile opens Reports → Money for this year | `Reports → Overview shows this month's revenue, …` (**@smoke**); `the organisation's Home shows the same key numbers as Reports → Overview` |

## T-lines (parts) left manual, and why
- **T61:** the rest of the line (Home with over 1000 gigs and its counts and calendar, Quotes and
  the price list when adding a line, the quote editor, Contacts → Clients' "N quotes" and banner,
  and the stock flows: a purchase, transfer and sale of a bulk item, moving or repairing a unit,
  refusing to sell more than there is). Only the catalogue is tested with 1000+ rows; making 1000+
  gigs or quotes each night would slow the shared test project. The stock flows are clicked
  through by AT4 (inventory).
- **T74:** the organisation export *download* itself (the zip) is AT12's (settings); this file
  checks the rows the download is built from. "Overview has the two new tiles": the step-10 margin
  tiles were replaced by K2's four (src/lib/analytics/tiles.js); those are checked under T161.
  Whether the Portuguese wording reads well needs a person.
- **T82:** judging whether the numbers "look right" on real data; the payback view; the "next
  bookings" list on the Numbers card; the old "Use and value" table (journey.spec.js opens it).
- **T83:** "Idle (sell?)" needs gear with no confirmed booking for 12 months (a backdated unit is
  possible but the 12-month window makes the test slow to set up and brittle; candidate for later).
  Sending a hire request through the supplier's own AVX account; a unit marked lost after going out
  showing on that gig; Dispatch (scan out, undo a scan) needs the scanner flow; the tiles on Home.
- **T84:** the gig's wrap-up (hours, money, damage and not-back items after a scan-in, notes as PM,
  print); the calendar feed (needs `calendar-feed` on the test project); opening a person's page
  from the Crew tab; the Staffing and Tasks views' numbers; the per-month view over 12 months.
- **T161:** "the same values as the previous version": the test checks the values against amounts
  it seeded instead of against an older build.

## Bugs found
- None. (One test assumption was wrong, not the app: the gig's creator is its PM, so they count
  as crew days on the Operations report.)

## Slowest report calls seen
On the test project, run locally twice (10 tests, about 1 min 50 s each run): every report view
loaded in a few seconds; the slowest tests were the gig-finance ones (15–20 s, most of it set-up
and four panel reloads) and Warehouse / Operations (about 17 s, several views each). No view came
near reportLoaded's 45 s wait and none showed "couldn't be loaded".

## Pending: test lines (section 2)
- **AT8:** none (no test here needs test_support).

## Pending: new questions (section 3)
- None.

## Session prompt
None: the Automated tests set was given by the Dispatcher.

# Dashboards, analytics and reports

The numbers side of AVX: dashboards, analytics and reports for organisations and for crew. They are
built as the **K** steps ("key numbers"), in the order [ROADMAP.md](../ROADMAP.md) gives them, each
in its own session with its prompt in [SESSION_PROMPTS.md](SESSION_PROMPTS.md). The expenses step
they need (9b) is specified in [BUSINESS.md](BUSINESS.md).

**Status (2026-11-08): K0 built (0.64.0), K1 built (0.69.0), K2 built (0.75.0), K3 built (0.76.0), K4–K9 built (0.77.0); the rest planned.** When a K step is built, its section below is
replaced by "How K… works", in the same shape as BUSINESS.md, so the next session can connect to it
without reading its code first.

## Decided (2026-11-02)

| Question | Answer |
|---|---|
| Areas | Financial, logistics and operational, plus the extra areas suggested below (sales and clients, spending, people, safety, sustainability) |
| Place in the build | After the money loop: K0 (capture) first, K1 just before step 10, K2–K9 as one block after step 12 |
| Company costs (PENDING D24) | **Full expense tracking** (step 9b). Views open simple, with details on demand |
| Crew income (PENDING D25) | Crew numbers count **AVX work only** (K8). Work outside AVX (K12) and gear that crew own and hire out to organisations (K13) come after the launch |

## Principles

1. **Capture before you report.** A report can only look back as far as its data, so the small
   capture step (K0) goes first, months before the dashboards.
2. **One meaning per number.** The definitions below are agreed with the owner in K1. Each rule
   lives in one SQL function, with a JS twin where the browser needs it, both checked against the
   same fixtures.
3. **Counted in the database.** Report functions run with the reader's rights (`security
   invoker`, like `client_quote_counts`), so the table rules decide what is counted; money
   functions also check `private.can_see_finance(org)` (made in step 9b). The browser formats, it
   doesn't add up raw rows (the API returns at most 1000 rows per request).
4. **Each cost counted once.** Subrentals, repairs, crew fees and stock purchases are *planned*
   amounts; an expense linked to one of them is the *actual* amount. Capital purchases are spread
   as depreciation, never counted as the month's cost.
5. **Estimates are marked.** A figure that uses a fallback (the rate card instead of an agreed fee,
   the newest sent quote instead of an accepted one, replacement value instead of purchase cost)
   says so, and the report shows how much of the total is estimated.
6. **Simple first, details on demand.** Every view opens with a few totals and one chart; "Show
   details" adds the breakdowns, columns and links. The choice is remembered on the device.
7. **Periods, currency, VAT.** Months in the organisation's time zone (`organisations.time_zone`);
   one currency per total (other currencies listed apart, never added); amounts excl. VAT unless a
   cash figure says "with VAT".
8. **Same parts everywhere.** One report shell, plain-SVG charts each with a table to read instead
   (axe-clean, never colour alone), CSV, print. A new package only after a proposal and a yes.
9. **Every later step adds its own numbers** (its "Connect"), e.g. vehicles (step 23) add vehicle
   use.
10. Database test files avoid `delete` statements, so they can run through the Supabase connector.

## Definitions (agreed with the owner in K1, 2026-11-05)

| Number | Definition |
|---|---|
| **Revenue (net)** | Priced lines of accepted quotes: line total × (1 − phase discount) × (1 − quote discount). Optional phases and comments left out. Excl. VAT, per currency. May differ by a cent from the quote's total (rounding) |
| **Report date** | Everything that belongs to a gig is dated by the gig's start date, so a gig's margin is never split across months (a tour from March to May counts in March). Each revenue line also carries its phase's start date, so dating by phase later (D42) is a change of rule, not of data. A quote with no gig: its first phase date, else its issue date. Expenses: their date (capital ones spread over their months). Sales figures use the sent and decided dates; cash figures use invoice, due and payment dates |
| **Gig revenue** | All accepted quotes linked to the gig, after line, phase and quote discounts. None accepted: the newest sent quote, marked estimate. Draft quotes never count, not even as an estimate |
| **Labour cost** | Approved hours × agreed fee or rate (actual) → agreed fee → rate card (estimate). Fixed fees ignore hours |
| **Direct costs** | Labour; confirmed or returned subrentals (the supplier's price, else the lines); repairs on the gig not charged to the client; gig expenses (kind "direct"); cost of goods sold (sale lines × the item's cost price); transport (after step 23). A linked expense replaces the planned amount |
| **Gross margin** | Revenue − direct costs; margin % = gross margin ÷ revenue |
| **Operating result** | Gross margin − overhead expenses − depreciation (equipment and capital expenses) |
| **Equipment profit** | Item revenue − depreciation in the period − repairs not charged − inspections − hire-in for the item − losses at replacement value |
| **Payback** | Revenue since purchase ÷ purchase cost; the date it reached 1 |
| **Equipment use** | As I7: booked unit-days on confirmed gigs (prep and return days included) ÷ owned unit-days, up to today. "Last 90 days" means the 90 days up to today |
| **Staff utilisation** | Booked working days ÷ (working days − leave − public holidays) |
| **Win rate** | Accepted ÷ (accepted + declined), decided in the period, by count and by value. Quotes past their validity with no answer are "expired" and stay out of the rate |
| **Crew day** | A calendar day someone is booked on a gig (their booking, else the gig's dates) |
| **Periods** | Calendar months in the organisation's time zone; weeks start on Monday. This month, last month, this quarter, this year, last 12 months (this month and the 11 before it, whole months) or custom. Compared with the previous period of the same length or the same period last year; a period not yet over is compared day for day (1–5 November with 1–5 October), and the report says so |
| **Who sees what** | Money only where `can_see_finance` allows (D23). Per-person money (one person's hours and cost) admins only by default. Crew only ever see their own rows; viewers see no numbers. So the Reports area and the Home strip, even their tiles without money, are for admins and members only |

## Starting point (what exists, 2026-11-02)

| What | Where | What it means for reports |
|---|---|---|
| Serial units have purchase date, cost and write-off period; I7 shows revenue ÷ cost | `stock_units`, `public.equipment_report` (K1) | Equipment profit is half possible today |
| Bulk, untracked and sale items have no cost; stock sales have no price; inspections have no cost | `price_items`, `stock_movements`, `inspections` | K0 adds them |
| Quotes record no sent, accepted or declined dates (only the client link's answer time) and no lost reason | `quotes`, `quote_shares` | K0 adds them |
| Gigs have no client of their own (only through a linked quote) | `gigs` | K0 adds `gigs.client_id` |
| Revenue is worked out three ways: I7 (line, phase and quote discounts, dated by issue date), the labour panel (crew lines before the phase discount, one quote only), `quoteTotals().byKind` (gross) | `reports.js`, `crewRates.js`, `quotes.js` | K1 makes one rule |
| Inventory → Reports asks for up to 20,000 rows per list, but the API returns at most 1000, so big organisations get figures that are too low | `ReportsTab.jsx` | K1 moves it to the database |
| `organisations.time_zone` exists (Lisbon by default); since U1 admins set it and bookings, leave, the calendar feed and the email summary read it too | `20261024000000_reservations_people.sql` | Reports use the column from day one |
| Crew certificates carry an expiry date; inspections have due dates | `crew_profiles`, `20261029000000_maintenance.sql` | A safety report is possible (K10) |
| No chart package; Home is a gig list; the only report is I7 | `package.json`, `Dashboard.jsx` | K1 builds the parts and the Reports area |
| Help screenshots answer database functions from `data.rpc` | `scripts/help-screens/sample-data.mjs` | Report screens are easy to screenshot |
| Switching leaves out past jobs and imports quotes as drafts | [SWITCHING.md](SWITCHING.md) S3b | History import: D26, planned as IM4 (SWITCHING.md, "Import overhaul") |

## Steps and build order

| Id | What | Needs | When |
|---|---|---|---|
| **K0** | Capture for reports (built, 0.64.0) | quotes, inventory | Done |
| **9b** | Expenses (spec in BUSINESS.md) | 9, contacts, subrentals, repairs | After 9 |
| **K1** | Reports engine and the Reports area | K0, 9b | After 9b, before step 10 (its first user) |
| **K2** | Money: results and margins | K1, 9b, 10 | After 12 |
| **K3** | Money: cash, spending and forecast | K2, 11, 12 | After K2 |
| **K4** | Sales and clients | K0, K1, 10 | After K3 |
| **K5** | Equipment money | K0, K1 | After K4 |
| **K6** | Warehouse and upkeep | K5 | After K5 |
| **K7** | Operations and people | K1, 8, 9 | After K6 |
| **K8** | Crew numbers | K1, 7b, 8, 9b | After K7 |
| **K9** | Report extras (optional) | K2–K8 | After K8 |
| **K10** | Safety and compliance (suggested, D27) | I5, 16, 19, 20, K1 | After step 20 |
| **K11** | Sustainability (suggested, D28) | 8, 15, 23, K1 | After step 23 |
| **K12** | Crew: all income | K8, 9b | After the launch |
| **K13** | Crew-owned gear for hire | I6, K8, 12 | After the launch |

Order: **K0** → 7b → 8 → 9 → **9b** → **K1** → 10 → 11 → 12 → **K2 → K3 → K4 → K5 → K6 → K7 → K8 →
(K9)** → 13 … 20 → **(K10)** → 21 … 23 → **(K11)** → 25 … 30 → end of the build → after the launch:
**K12, K13**. Step 24 is covered by K1–K8.

Why this order: capture starts now; the engine lands just before its first user (step 10); the
dashboards are built once, on the whole money loop, so none has to be rebuilt when invoices and
payments arrive.

## Areas and where they're covered

| Area | For | Steps |
|---|---|---|
| Money: results, margins, operating result | Organisations | K2 |
| Money: cash, spending, forecast, budgets | Organisations | 9b, K3 |
| Sales and clients | Organisations | K4 |
| Equipment money | Organisations | K5 |
| Logistics: warehouse, upkeep, suppliers, vehicles | Organisations | K6, step 23 (vehicle use) |
| Operations and people | Organisations | K7 |
| Crew work and earnings | Crew | K8; all income K12 |
| Safety and compliance (suggested) | Organisations | K10 |
| Sustainability (suggested) | Organisations and their clients | K11 |
| One gig: finance panel, wrap-up page, safety pack | The gig's managers | 10, K7, K10 |
| Cards on an item, a client, a person | Organisations | K5, K4, K7 |
| After the launch, ideas only (D29) | Everyone | Market insights, client feedback, platform dashboard, expense automation |

## Conflicts with other steps, and how they're handled

| Step | Conflict | How it's handled |
|---|---|---|
| **10** gig finance | Planned its own "other costs" table and an organisation list that K2 would repeat | Other costs are expenses linked to the gig (9b). The list is a report on K1's parts. One `gig_finance(org, from, until)` feeds the panel, the list and K2. Revenue is every accepted quote of the gig. On completion, rate-card labour can be saved as agreed fees |
| **24** reports | Covered by K1–K8 | Row kept (step numbers are fixed) and marked covered; vehicle use moves to step 23 |
| **I7** (built) | Browser maths, the 1000-row limit, dated by issue date | K1 moves it to `equipment_report()`; K5 extends it; Inventory → Reports opens Reports → Equipment (one screen, two ways in) |
| **7**, **7b** labour and crew margin | Revenue worked out differently from I7 | K1 switches the labour panel to the rule; 7b's crew margin uses the same helper |
| **8** time registration | Costs from rates that later change would rewrite history | Each approved day stores its hours split and its cost at approval |
| **9** leave | Utilisation needs a working week | A working week per staff member (default Monday to Friday) |
| **11**, **12** invoices and payments | VAT per line changes the quote maths; cash needs dates | The SQL and JS twins change together and rerun their fixtures. Issue, due and payment dates are kept. Payments received (12) and expenses paid (9b) stay separate and are named apart |
| Subrentals, repairs, crew fees, stock purchases | Counted twice once expenses exist | Links in 9b: the linked expense is the actual amount |
| **K8** fee paid | The same payment recorded twice (fee and expense) | Marking a fee paid creates its linked expense; the person sees only "paid on" for their own fee, through a function |
| **23** vehicles | Transport cost unknown | Running cost per km and per day, km per trip; expenses link to a vehicle |
| **26** client portal | Needs the client's balance | Reuses K3's function |
| **27** freelancer side | The same monthly summary as K8 | K8 builds it; step 27 reuses it |
| **28** public API | Report endpoints | Only if asked in that step |
| Certified invoicing, the accountant | Expenses look like bookkeeping | AVX is a management view and a clean file for the accountant; it doesn't keep official accounts or produce SAF-T |
| **U1** time zone | Month boundaries | Reports read `organisations.time_zone` now; U1 adds a check |
| **U3**, DATA_MAP.md | Receipts and per-person reports are personal data | 9b and K7 add rows to the data map; per-person money admins only by default |
| **P3** plans | Reports may become a paid feature | The Reports area sits behind one helper, easy to limit by plan |
| Quotes in another currency | Totals would mix currencies | Totals per currency, never added |

## What else has to be built

| Gap | Needed for | Built in |
|---|---|---|
| Quote sent and decided dates, lost reason (with a backfill from client links) | Win rate per period, time to decision, why quotes are lost | K0 |
| A client on each gig (backfill from quotes, picker, jobs import) | Gigs, margin and wrap-ups per client; the client portal later | K0 |
| Cost price and write-off period on items; cost on purchases and price on sales of stock; inspection cost | Profit of bulk and untracked items, cost of goods sold, book value, upkeep cost | K0 |
| A unit's sale value when sold or written off (built); history import (D26, planned as IM4) | Lifetime profit; year-on-year for companies that switch | K0; history import later |
| Expenses: categories with a kind, receipts, recurring costs, links, write-off months for capital, `can_see_finance` | Overheads, spending, actual costs, money going out | 9b |
| One revenue rule in SQL and JS, shared fixtures | Every money figure agreeing everywhere | K1 |
| Confirm costs when a gig is completed; approved hours and cost kept as they were | Past margins that don't change | 10, 8 |
| A working week per staff member | Utilisation | 9 |
| A set's revenue shared out to its contents; the share of revenue not linked to an item | Honest profit per item | K5 |
| Fee paid (as a linked expense) with a notification, and "received" | Unpaid fees for crew; crew to pay for organisations | K8 |
| Vehicle running costs, km per trip, a vehicle link on expenses | Transport cost and margin | 23 |
| Certificates needed per function | Safety warnings | K10 |
| Emission factors with their source and version | Sustainability estimates | K11 |
| Sample answers for each new report function | Help screenshots | Every K step |

## How it fits together

```
 data: gigs, quotes, fees, hours, leave, expenses, stock, bookings, scans, repairs, invoices…
   │   table rules (RLS) decide who reads what
   ▼
 report functions in SQL (security invoker; money ones check can_see_finance)
   │   one rule each; the revenue rule has a JS twin, both checked on the same fixtures
   ▼
 report parts: period and filter bar, table, CSV, print, SVG charts, simple / details
   │
   ├──► Reports area: /org/:orgId/reports?tab=overview|money|sales|equipment|warehouse|operations…
   ├──► Overview tiles (src/lib/analytics/tiles.js), the key-numbers strip on Home
   ├──► cards: gig finance panel, item, client, person; gig wrap-up and safety pages
   └──► My work → My numbers (crew: only their own rows)
```

Function and file names in this document are suggestions; the session that builds them may choose
better ones and records them in its "How … works" section.

## Every K step

- Follows CLAUDE.md "A session, start to finish" and asks its prompt's questions first.
- Uses K1's parts (no chart code of its own), adds its tab to the Reports area and its tiles to
  the Overview.
- Database: report functions `security invoker`; money ones check `can_see_finance`; a test file
  in `supabase/tests/` with fixtures and who-may-call checks (admin, member, viewer, crew, another
  organisation, two-step), with no `delete` statements.
- Screens: `<EmptyState>` when there's nothing to count, estimates marked, EN and PT, 320 and 390
  px, axe clean.
- Help: page note, terms, a guide with screenshots; sample answers for the new functions in
  `scripts/help-screens/sample-data.mjs`.
- Usage counts for its tabs (`view:reports:<tab>`, `csv:reports:<tab>`).
- Docs: its section here becomes "How K… works"; the ROADMAP row is marked built; a test line in
  PENDING.md section 2 and its open questions in section 3.

## How K0 works (built in 0.64.0)

Fields only, so history starts now; no report screens. Migrations `20261210000000_report_capture.sql`
(fields, triggers, backfill, export), `20261210000001_import_gig_client.sql` (jobs import) and
`20261210000002_import_item_cost.sql` (equipment import); checks in
`supabase/tests/report_capture.sql` (no delete statements). Amounts are excl. VAT. Every new
column sits on a table only admins and members (`can_quote`) can read, except `gigs.client_id`,
which crew can read as an id (they still can't open client records).

**Quotes.** `sent_at`, `decided_at`, `lost_reason`, `lost_note`. One trigger,
`private.quotes_report_dates()` (before insert or update on `quotes`), writes the dates on every
status change, so the editor, send-quote and quote-public are all covered:

| Change | sent_at | decided_at | lost_reason / lost_note |
|---|---|---|---|
| Leaves draft for the first time (to sent, accepted or declined, also on insert) | now | — | — |
| Becomes accepted or declined | kept (set now if it never left draft) | now | — |
| Goes back to draft or sent | kept, never cleared | cleared | cleared |
| Declined through the client link | | now | an empty `lost_note` gets the client's note from the link |

Dates sent by the app are ignored. `lost_reason` is one of `price`, `competitor`, `cancelled`,
`unavailable`, `scope`, `other` (`LOST_REASONS` in `src/lib/quotes.js`, same list in the
`quotes_lost_check` constraint); it is kept only while the quote is declined. Marking a quote
Declined in the editor opens `LostReasonModal` (optional; "Skip" leaves it empty); a button next
to the status shows the reason and reopens it.

**Gigs.** `gigs.client_id` → `clients`. `private.gigs_client_check()` refuses a client of another
organisation, and refuses anyone who isn't an admin or member (`can_quote`) setting or changing
it (database jobs with no signed-in user may). Set by: the new and edit gig forms
(`GigClientField`, hidden for people who can't read clients; the edit form only sends it when it
changed), "Create gig" in the quote editor (copies the quote's client), and the jobs import
(a client column whose name matches a client in Contacts; the name still goes in the description
too).

**Equipment costs.**
- `price_items.cost_price` (usual purchase cost per unit) and `price_items.depreciation_months`
  (default write-off for its units and bulk purchases; **empty means 60**, as for units). Item
  form; "Add units" starts from both.
- `stock_movements.unit_cost`: cost each on `purchase` rows, price each on `sale` rows; any other
  kind is refused (`stock_movements_unit_cost_check`). Add stock → Purchase starts from the item's
  cost price; Remove → Sold starts empty. Movements are never edited. The equipment import's
  opening quantity gets the cost price. Unit purchase rows written by the database have no
  `unit_cost`: use `stock_units.purchase_cost`.
- `inspections.cost` (optional) in Record inspection.
- `stock_units.disposal_value` and `disposed_on`: when a unit is set to lost or retired, the unit
  form asks for its sale price or payout; `disposed_on` defaults to that day (organisation's time
  zone). Both are cleared when the unit comes back (`private.stock_units_disposal()`).

**Backfill** (`private.report_capture_backfill(org)`, run once for everyone; approximate):
`sent_at` from the first client link, else `updated_at` for quotes not in draft; `decided_at`
from the matching link answer, else `updated_at`; `lost_note` from a declined link's note. A
gig's client from its accepted quote, else its newest quote with a client. Units already lost or
retired get `disposed_on` from that movement. The tables' own triggers are paused while it runs,
so it doesn't count as an edit (no new quote version, activity or notification).

**Imports.** The equipment import guesses "Cost price" (also cost, purchase price, kostprijs,
inkoopprijs, preço de custo…) and "Depreciation months" (write-off, afschrijving, amortização…).
History import (past jobs, decided quotes with their dates) is planned as **IM4** of the import overhaul (D26, [SWITCHING.md](SWITCHING.md)).

**Export.** A wrapper as in `20261203000001` (`export_org_part_pre_k0` holds the previous one):
items get `cost_price`, `depreciation_months`; units `disposal_value`, `disposed_on`; movements
`unit_cost`; gigs' `client` comes from `client_id` first; quotes `sent_at`, `decided_at`,
`lost_reason`, `lost_note`; inspections `cost`.

**For K1 and later:** win rate and time to decision read `sent_at` / `decided_at` (older ones
are approximate); cost of goods sold uses a sale row's quantity × the item's `cost_price`
(the row's `unit_cost` is the sale price); bulk depreciation uses purchase rows' `unit_cost` over
the item's `depreciation_months` (60 if empty).

## How K1 works (built in 0.69.0)

The reports engine and the Reports area. Migration `20261220000000_reports_k1.sql` (functions
and one view, no tables); checks in `supabase/tests/reports_k1.sql` (no delete statements).

| Piece | How it works |
|---|---|
| The revenue rule | `private.report_quote_lines` (a view, `security_invoker`): one row per priced line of every quote the reader may see, net after the line, phase and quote discounts, rounded to the cent; optional phases and comments left out; numbers read as `normalizeBody` reads them (a number or text such as "2,5"; qty and factor default to 1). A view rather than a function per quote: Postgres plans it once with the outer query (a function per quote took seconds on 5,000 quotes). `public.report_revenue_lines(org, from, until)` returns the accepted quotes' lines whose **report date** (gig start date, else first dated non-optional phase, else issue date) is in `[from, until)`, with quote, line, phase, kind, item, description, amount, currency, report date, **phase start** (for a later rule that dates by phase, D42), gig (name, type, status, own status) and client (directory name, else the typed company or name). The JS twin is `src/lib/analytics/revenue.js` (`reportRevenueLines`, `quoteReportDate`, `gigRevenue`, `groupRevenue`, `filterRevenueLines`). Since step 11 (0.72) the view and the JS rows also carry each line's `vat_rate` (its own, else the quote's); amounts are unchanged and the shared fixtures check the rates too. Invoiced, paid and due amounts per quote, gig or client: `public.invoice_summary` (docs/BUSINESS.md, "How invoices work") |
| Shared fixtures | `src/lib/analytics/fixtures.json`: gigs either side of a month boundary, a gig without a date, every discount, a comma number, optional phases, comments, a 100 % line discount, sent, draft and declined quotes, two currencies. `revenue.test.js` and `reports_k1.sql` check the same expected numbers; the SQL file holds a verbatim copy between `$fixtures$` markers and a Vitest test keeps the copy equal. Change both twins and both files together |
| Who may | Every function calls `private.require_finance(org)`: `can_see_finance` (admins and members) and the second sign-in step when the person has one; otherwise `42501`. Viewers, crew, other organisations and anonymous calls are refused. All run as the reader (`security invoker`), so the table rules decide what is counted. `set jit = off` on the three public functions (the planner can't tell how many lines a body has) |
| Periods | `src/lib/analytics/periods.js`: this month, last month, this quarter, this year, last 12 months (this month and the 11 before), custom; today in `organisations.time_zone` (`todayIn`; `private.org_today(org, at)` in SQL). A period is two dates, `until` exclusive, with `asOf` (today + 1 while it runs). Comparison: the previous period of the same length or the same period last year; a period not yet over is compared day for day and the bar says so. `monthsOf` for monthly bars |
| `equipment_report(org, from, until, currency = 'EUR')` | I7 in the database, the same columns as before (item, owned, use, gigs, last used, revenue, revenue ÷ cost, repairs, repair cost, charged, lost, lost value, hired in, book value, cost, not used). Days from midnight in the organisation's time zone, use up to today. Revenue comes from `report_revenue_lines` (dated by the rule, one currency). Inventory → Reports reads it 1000 rows at a time (`selectAll`), so big organisations get every item |
| `report_overview(org, at = now())` | The four first tiles in one call: gigs starting this month (and how many confirmed, active or completed), confirmed revenue in the next 30 days (accepted quotes whose report date is from today to today + 29, per currency), quotes waiting (sent, still valid: count and value per currency) and equipment use over the 90 days up to today (owned-weighted). `at` lets the test fix the clock |
| Report parts | `src/components/reports/`: `ReportParts.jsx` (period and comparison bar, filter bar for gig status, type and client, group-by, sortable table with `aria-sort`, CSV through `reportCsv`, print with the menus hidden, "Show details" remembered per report on the device), `Charts.jsx` (number tile with change, bar, stacked bar, line, sparkline; plain SVG, each with an accessible name and "Show as a table"; series have a shape and a legend label as well as a colour from the theme; the change has an arrow and a sign), `src/lib/analytics/charts.js` (nice scales, positions, series colours) |
| Reports area | `pages/ReportsPage.jsx` at `/org/:orgId/reports?tab=overview|revenue`, its own menu section (Reports → Overview, Revenue) for admins and members. **Overview**: the tiles of `src/lib/analytics/tiles.js` (`OVERVIEW_TILES`; later steps add theirs), each a link to where the number comes from. **Revenue**: net revenue, accepted quotes and gigs with their change; one chart (by month, or by kind for one month); "Show details" adds the filters, the kind-by-month stacked bar and the table grouped by kind, client, gig, gig type or month, with CSV and print. Money is per currency: tiles and charts show the biggest one, the others are listed under the total. Add a tab by adding it to `REPORT_TABS` |
| Home | `KeyNumbersStrip` on the organisation's Home: the same tiles, compact, for admins and members, hidden in simple mode, folded or not (remembered on the device), with a link to all reports |
| Labour cost panel | `quoteCrewRevenue` uses `gigRevenue`: crew lines of every accepted quote of the gig, after phase discounts; with none accepted, the newest sent quote marked "estimate"; drafts never count; euros only, as the rest of the panel |
| Usage counts | `view:reports:<tab>` when a tab opens, `csv:reports:<tab>` on each CSV |
| Help | Page note `org-reports`; terms net revenue, estimate, comparison period, utilisation; guide `office-reports` with four pictures (sample answers for the three functions in `scripts/help-screens/sample-data.mjs`) |
| Tests | `reports_k1.sql` (fixtures, who may call each function, Lisbon and New York month boundaries, the equipment report, each function under a second on 5,000 quotes made inside the rolled-back test: about 0.1 s each on a local Postgres 16); Vitest for periods, comparisons, chart scales, tiles, the revenue twin and filters; the signed-in e2e journey opens Home's key numbers and both tabs with axe |

**For K2 and later:** read money through `report_revenue_lines` (or the view, for quotes that
aren't accepted), never by adding up quote bodies in the browser; add a tab to `REPORT_TABS` and
tiles to `OVERVIEW_TILES`; use the report parts and charts; check `private.require_finance`.

## How K2 works (built in 0.75.0)

Results and margins for the whole company. Migration `20261225000000_finance_results.sql`
(functions and one view, no tables); checks in `supabase/tests/finance_results.sql` (no delete
statements). Decided with the owner on 2026-11-06: a gig with several production managers is shared
equally between them; Results count accepted quotes only (as the Revenue tab); the four K2 tiles
replace step 10's two monthly margin tiles. Defaults to confirm: PENDING D49.

| Piece | How it works |
|---|---|
| `finance_results(org, from, until, group_by)` | One row per group and currency (never added across currencies). `group_by`: `total`, `month`, `quarter`, `year`, `gig`, `gig_type`, `status` (`base:<status>` or `own:<id>`), `client` (client id, else `name:<typed name>`), `kind`, `pm`. Rows with an empty `group_key` hold what has no such group (not on a gig, no client, overheads and depreciation for `kind`), so every grouping adds up to the total (checked in the test). Runs as the reader, calls `private.require_finance`; `jit = off`, `plan_cache_mode = force_custom_plan`. The browser passes `asOf` as `until`, so a period not yet over counts up to today |
| Revenue | `report_revenue_lines` (accepted quotes only), by line kind: `revenue_rental`, `_sale`, `_crew`, `_transport`, `_other`; dated as K1 dates it (gig start date; no gig: first phase date, else issue date) |
| Direct costs | From `gig_finance` for the gigs starting in the period (euros): `labour` (and `labour_estimated`, `labour_planned`, `labour_actual`), `subrentals`, `repairs` (not charged to the client), `gig_expenses` (step 10's other costs; a gig's costs in other currencies land here in their currency). `cogs`: each accepted sale line's quantity (the view `private.report_quote_lines` gained `qty`) × the item's `cost_price`, in euros; `cogs_missing` counts sale lines whose item has no cost price. `other_direct`: confirmed expenses of kind direct (or no category) not on a gig, or linked to a stock purchase, on their date; and confirmed or returned subrentals with no gig and no linked expense, on their start date |
| Overheads | Confirmed expenses of kind `overhead` or `tax_other` not on a gig, on their date; `overheads_by_category` = `[{category_id, name, starter_key, amount}]`, biggest first |
| Depreciation | `private.depreciation_lines(org, from, until)` (runs as the reader, finance check): per month and currency, an equal share each month from the month it starts, prorated by the days of each month inside the period. Units: `purchase_cost` (else the item's `cost_price`, counted in `depreciation_estimated`) over the unit's months, else the item's, else 60, from `purchase_date` (else when added), stopping after the month of `disposed_on`. Bulk purchases: `unit_cost × quantity` over the item's months (60 if empty), from the movement's date. Capital expenses: their cost over the category's `spread_months` (60 if empty), from their date. A unit or bulk purchase with a confirmed expense linked counts once, through the expense |
| Results | `direct_costs`, `gross_margin`, `margin_pct` (when there is revenue), `operating_result` = gross margin − overheads − depreciation, `estimated` = rate-card labour + estimated depreciation |
| Labour | `private.gig_labour_hours(org, gigs)` (security definer, finance check, totals per gig only): planned days (booked days, as the labour panel), planned hours (an hourly agreed fee's quantity, else days × `crew_rate_factors.overtime_after_hours`, 10 when not set), actual hours (the `worked` hours of approved days). In `days_planned`, `hours_planned`, `hours_actual` |
| Gig counts | On the euro rows: `gigs`, `gigs_negative` (a quote and a negative step 10 margin), `gigs_without_accepted` (costs but no accepted quote: their costs count, their revenue doesn't) |
| PM grouping | Each gig's members with role `pm` share it equally (`1 / number of PMs`); `group_label` is their name |
| Overview tiles | `report_overview` gained `revenue_this_month` and `revenue_month_last_year` (per currency, the 1st up to today and the same days a year earlier), `margin_pct_year` (euros), `operating_result_year` (per currency) and `negative_margin_year`, this year up to today (step 10's function renamed `private.report_overview_pre_k2` and wrapped; its keys stay). `OVERVIEW_TILES`: `revenueThisMonth` (with "Same days last year"), `marginPctYear`, `operatingResultYear`, `negativeMarginYear`; step 10's `marginThisMonth` and `negativeMargin` left the tiles (Gig margins still has them) |
| Screen | `components/reports/MoneyReport.jsx`, tab `money` of `REPORT_TABS`, menu Reports → Money. Views (`?view=`): **Results** (tiles with the comparison, operating result by month, or the steps from revenue to result for one month; the statement, with "Show details" adding revenue by kind, each direct cost, overheads by category linked to Expenses and the comparison column; what is estimated, in words), **Margins** (`?by=` gig type, status, client, kind, PM, month, quarter; chart, table, CSV; "Margin per gig" opens Gig margins), **Labour** (`?by=` gig or month: hours planned and approved, labour planned, actual and counted). A currency picker when there is more than one (labour is euros). Helpers in `src/lib/analytics/money.js` (unit tested); the browser only picks and labels rows |
| Connected | Gig finance panel: "Company results" link. Overview and Home: the four tiles. Expenses: `?month=YYYY-MM&category=<id>` opens a month filtered to a category (the report's links). Gig cards: unchanged; their margin is `gig_finance`'s, the same per-gig number the report builds on |
| Help | Terms gross margin, operating result, cost of goods sold (depreciation already existed); ⓘ `money-report`; guide `office-money` with four pictures (`money-results`, `money-details`, `money-margins`, `money-labour`) and the refreshed Overview picture; the screenshot script's mocks can now answer by the call's arguments |
| Tests | `finance_results.sql`: every figure on its own fixtures (two currencies apart, a gig across two months, a quote with no gig, a capital expense spread over its months, a unit and a subrental each paid by an expense counted once, estimate flags, cost of goods sold with a missing cost price, each grouping adding up to the total, the overview tiles, who may call each function, 300 gigs under a second); Vitest for the helpers and tiles; the signed-in e2e journey opens the three views with axe |

**For K3 and later:** read results through `finance_results` (or `private.depreciation_lines` for
depreciation alone), never by adding up rows in the browser; add groupings to its `group_by` list
and the test's "adds up to the total" loop together.

## How K3 works (built in 0.76.0)

Cash, spending and forecast for the whole company. Migration `20261226000000_finance_cash.sql`
(functions and one table, `finance_targets`); checks in `supabase/tests/finance_cash.sql` (no delete
statements). Decided with the owner on 2026-11-07: **budgets and targets yes** (a monthly budget per
expense category and a monthly revenue target); the forecast keeps waiting quotes **apart**, the win
rate beside them and never multiplied in; the cash position looks **3 months** ahead
(`MONTHS_AHEAD` in `src/lib/analytics/cash.js`). Defaults to confirm: PENDING D50.

| Piece | How it works |
|---|---|
| `private.open_invoices(org, today)` | Each issued invoice (not credit notes, not removed): total, issued credit notes against it, payments, `left_to_pay` (never below zero) and `days_overdue` (past the due date by the organisation's own date, `private.org_today`). Runs as the reader, so it only ever shows what RLS lets through |
| `private.recurring_ahead(org, until)` | Each live recurring cost's dates from its next undrafted one (the same date rule as `private.add_periods`) up to `until`, skipping any date that already has an expense (draft, confirmed or a removed draft). So a recurring cost counts **once per date**: as its draft, or as a date still to come |
| `cash_report(org, from, until, months_ahead, at)` | Long rows `(section, month, group_key, label, currency, amount, items)`, **with VAT**. In the period, by month: `invoiced` (issued invoices by issue date; `group_key` `deposit` for deposit invoices), `credited` (issued credit notes), `received` (payments by date, part payments too), `paid_out` (confirmed expenses by paid date). As of today: `overdue` by age (`0_30`, `31_60`, `61_90`, `90_plus`); `expected_in` per month ahead by due date (`overdue` ones in this month, else `due`); `expected_out` per month ahead: `unpaid` confirmed expenses, approved `claims` to reimburse, `recurring` (drafts not confirmed + dates to come), late ones in this month; `recurring` per cost (`group_key` its id, `label` its description); `position` = expected in − expected out per month and currency. `p_at` fixes the clock for the tests |
| `spending(org, from, until, group_by)` | Confirmed expenses dated in the period at their **cost** (the 9b VAT rule, `private.expense_costs`), with `total` (with VAT) and `items`. Capital purchases count in full here (Results spread them). `group_by`: `total`, `category` (with `starter_key`), `kind`, `supplier` (id, else `name:<typed name>`), `gig`, `month`; an empty `group_key` holds what has no such group, so every grouping adds up to the total (checked). The screen calls it twice for the comparison period |
| `client_balance(org, client, at)` | Per client (id, else `name:<typed name>`) and currency, every issued invoice: invoiced, deposits, credited, paid, balance (left to pay), overdue, oldest open due date, open invoices. **The client portal (step 26) shows a client's balance from this function** (`p_client`), through a security-definer wrapper that checks the portal token |
| `revenue_forecast(org, months, at)` | From this month: `confirmed` (accepted revenue by the K1 rule, from today on), `waiting` and `waiting_quotes` (sent quotes still valid, a past date counted in this month), and `win_rate_count` / `win_rate_value` (last 12 months by decided date, accepted ÷ (accepted + declined)) |
| `finance_targets` and `target_progress(org, from, until)` | `finance_targets`: `kind` budget (with an expense category of the organisation) or revenue (none), `amount` per month, `currency` (the form uses EUR), removed by marking; one live per category/kind and currency. Admins and members read and write (`can_see_finance`, two-step sign-in). `target_progress`: each live target × the months of the period (part months by days) against the category's spending (cost) or accepted revenue (`finance_results`) |
| Overview tiles | `report_overview` gained `overdue_now` and `overdue_count`, `cash_in_30` (left on invoices due today to 30 days ahead, overdue ones not included), `expenses_due_14` (unpaid confirmed expenses and approved claims due within 14 days, late ones included) and `revenue_next_3m` (accepted revenue from today to three months ahead); the K2 function was renamed `private.report_overview_pre_k3` and wrapped. `OVERVIEW_TILES`: `overdueNow`, `cashIn30`, `expensesDue14`, `revenueNext3m`. The crew-fees-to-pay tile comes with K8 |
| Screen | `components/reports/CashReport.jsx`, views `cash`, `spending`, `forecast` of Reports → Money (`MONEY_VIEWS`). **Cash**: tiles (overdue now, expected in and out over 3 months, received and paid out in the period), the cash position chart, overdue by age (link to the unpaid invoices), cash in and out per month, recurring costs coming up, balance per client; "Show details" adds the months ahead line by line, the monthly table and more balance columns. **Spending** (`?by=` category, supplier, gig, month): total against the comparison, chart, the five biggest changes; details: the full table. **Forecast**: confirmed, waiting with the win rate beside, chart by month; **Budgets and targets** with progress (in words as well as the bar) and a form to add one. Helpers in `src/lib/analytics/cash.js` (unit tested on the same fixture as the database test) |
| Connected | Invoices: "Overdue by age and the cash position" under the totals. Expenses → Unpaid and due: a link to the cash position. Contacts: clients link to Cash (who owes what), suppliers to Spending by supplier this year. Overview and Home: the four tiles (overdue now opens unpaid invoices, expenses due opens Expenses → Unpaid). Payments count through `invoice_payments` |
| Help | Terms cash position, overdue by age, win rate, budget and target; ⓘ `cash-report`, `spending-report`, `forecast-report`, `finance-targets`; guide `office-cash` with four pictures (`money-cash`, `money-cash-details`, `money-spending`, `money-forecast`) and the refreshed Overview and Home pictures |
| Tests | `finance_cash.sql`: a part payment, a removed payment, a credit note, a deposit, a draft invoice, another currency; overdue by the organisation's date (23:30 and 00:30 in Lisbon); every section and the position by hand; a recurring cost counted once per date (a draft with the counter behind, a removed draft not made again, a removed cost never projected, six and four months ahead); claims waiting not counted; spending adding up for every grouping; budgets (unique, another organisation's category refused, prorated, removed by marking); the tiles; who may call each function (admin and member yes; viewer, crew, another organisation, anonymous, the second sign-in step not done: no). Vitest for the helpers and tiles; the signed-in e2e journey opens the three views with axe |

**For K4 and later:** read cash through `cash_report` and `client_balance`, spending through
`spending`; K8 added crew fees to pay as another `expected_out` part (`crew`).

## How K4 works (built in this feature set)

Sales and clients. Migration `20261227000000_sales_clients.sql` (functions only, no tables); checks
in `supabase/tests/sales_clients.sql` (no delete statements). Decided with the owner on 2026-11-08:
a quote needs a **follow-up after 7 days** with no answer (`FOLLOW_UP_DAYS` in
`src/lib/analytics/sales.js`); the win rate **per person** is for admins and members (both see money,
D23); the win rate can be grouped by a **custom field of kind "choice"**.

| Piece | How it works |
|---|---|
| `private.sales_quotes(org)` | One row per quote that left draft: value (the K1 revenue rule, `private.report_quote_lines`), gross (`private.sales_quote_gross`: priced lines before line, phase and quote discounts, optional phases and comments left out), client key (the gig's client first, then the quote's, as `finance_results`; only a client of this organisation; else `name:<typed company or name>`), author (`created_by`), sent and decided dates in the organisation's time zone, lost reason, and the custom values of its gig and client. Runs as the reader, finance check |
| `sales_waiting(org, days = 7, at)` | Each quote with status Sent: value, days waiting, days left, `opened` (any of its client links viewed), `expiring` (valid until today to 7 days ahead), `expired` (past its validity), `follow_up` (sent `days` or more days ago and still valid). The JS twin of `follow_up` is `needsFollowUp` |
| `sales_win_rate(org, from, until, group_by)` | Quotes accepted or declined with a decided date in the period, per group and currency: decided, accepted, declined, values, win rate by count and by value, median days from sent to decided, average quote value, gross and discount of the accepted ones. Quotes still sent (expired ones too) are never in it. `group_by`: `total`, `month`, `quarter`, `gig_type`, `client`, `author`, `lost_reason`, `field:<id>` (a live "choice" field on gigs or clients of this organisation; others are refused). An empty `group_key` holds what has no such group, so every grouping adds up to the total (checked) |
| `sales_clients(org, from, until, client, at)` | Per client and currency: revenue and gross margin (`finance_results` by client), gigs starting in the period and the average gig, quotes sent, decided and won (by count over every currency, by value in the row's currency), first gig, last gig up to today, next gig, `is_new` (first gig in the period) and `is_returning` (a gig in the period and one before). Gigs in draft (and `cancelled`, once K7 adds it) are left out. Counts and gig dates are the same on every row of a client; `client_key` '' holds revenue with no client. `p_client` gives one client (the Contacts card) |
| `report_overview_k4(org, at)` | The K4 tiles, next to `report_overview` (not a wrapper): `follow_up` {count, totals}, `win_rate_90` {decided, by_count, by_value, currency} (decided in the 90 days up to today), `top_client_year` {key, name, currency, amount, share}. `useOverview` calls every tile's `source` (`OVERVIEW_SOURCES` in `tiles.js`) and merges the answers |
| Screen | `components/reports/SalesReport.jsx`, tab `sales` of `REPORT_TABS`, menu Reports → Sales. Views (`?view=`): **Waiting** (as of today: tiles, value by age, the follow-up list linking each quote and the quote list's filter; details: every waiting quote with sent date, validity and author; a note on expired quotes), **Win rate** (`?by=` month, quarter, gig type, client, made by, lost reason or a choice field; tiles with the comparison: win rate by count and by value, median time to decide, average quote, discounts given; chart and table; lost reasons), **Clients** (tiles: what the top 5 bring, clients with gigs, new, returning; top 10 chart; table with revenue, margin, gigs, average gig; details: quotes, win rate, first, last and next gig). Currency picker when there's more than one; counts add up across currencies, money never. Helpers in `src/lib/analytics/sales.js` (unit tested on the same quotes as the database test) |
| Connected | Quotes list: a "To follow up" filter (`?status=follow_up`, client side with `needsFollowUp`, by the organisation's date). Contacts: a numbers card on each client (`ClientNumbers`, last 12 months; hidden for anyone the database refuses) linking to Reports → Sales. Overview and Home: three tiles (`followUp` opens the quote list's filter, `winRate90`, `topClientYear`); K1's "Quotes waiting" tile now opens Reports → Sales |
| Help | Terms follow-up, time to decide, discounts given, new and returning clients (win rate already existed); ⓘ `sales-report`, `client-numbers`; guide `office-sales` with four pictures (`sales-waiting`, `sales-winrate`, `sales-clients`, `client-numbers`) and the refreshed Home picture |
| Tests | `sales_clients.sql`: expired quotes out of the win rate and the follow-ups, a quote with no client (in the empty group, never a client row), another organisation's client and quote never counted, a typed client, Lisbon month boundary on the decided date, gross leaving out optional phases and comments, every grouping adding up, a text field and another organisation's field refused, the tiles, who may call each function (admin and member yes; viewer, crew, another organisation, anonymous, second sign-in step not done: no). Vitest for the helpers and tiles; the signed-in e2e journey opens the three views with axe |

**For K5 and later:** read quotes for sales through `private.sales_quotes` (one client rule, one
value rule); add tiles through a function of your own and a `source` on the tile.

## How K5 works (built in 0.77.0)

Equipment money. Migration `20261228000000_equipment_money.sql` (functions only, no tables);
checks in `supabase/tests/equipment_money.sql` (no delete statements). Decided with the owner on
2026-11-08: a set's revenue is shared out to its contents by their **day prices**; the default
write-off period is **60 months**; profit carries **no share of labour**. Defaults D42, D44, D49,
D50 kept. Costs are in euros, as in K2; another currency shows its revenue only.

| Piece | How it works |
|---|---|
| `private.set_shares(org)` | Each set's share per content item: quantity × the content's price ÷ the set's total (contents with no price at all share by quantity); sets inside sets followed through (10 levels); a set inside a set with no contents keeps its share; a set with no contents keeps its own revenue |
| `private.equipment_revenue(org, from, until)` | Rental lines of accepted quotes (`report_revenue_lines`, the K1 rule and dating), sets shared out by `set_shares`; lines with no catalogue item have an empty `item_id` ("not linked to an item") |
| `private.equipment_units`, `equipment_bulk_moves` | When each unit was owned (purchase date, else when added, until the day it was lost or retired; a unit found again has no end) and each bulk movement that changes what is owned (+ purchase, found, count up; − sale, lost, retire, count down), in the organisation's time zone |
| `private.equipment_depreciation(org, from, until)` | The K2 straight-line rule per unit and bulk purchase (`unit_id` empty): purchase cost, else the item's cost price (estimated); the unit's months, else the item's, else 60; an equal share each month, prorated by the days inside the period; stops after the month a unit was lost or retired. Unlike `depreciation_lines` it counts a unit also when an expense is linked (the item's cost either way) |
| `private.equipment_hire_lines(org, from, until)` | Each subrental line's cost: confirmed or returned subrentals (or any with a confirmed expense), dated by the gig's start date else their own; the linked expense (euros), else the supplier's price, else the lines, shared over the lines by line cost, else by quantity |
| `equipment_money(org, from, until, currency)` | One row per stock item (or any item with a figure) plus a row with an empty `item_id` for lines typed by hand, so the rows add up to the equipment revenue: `revenue`, `revenue_sets`, `depreciation` (+ `_estimated`), `repairs` (not charged; a linked expense replaces the cost; dated when opened), `inspections` (cost, by date), `hire_in`, `losses` (lost units at replacement value less the payout, by the day lost; bulk lost − found × replacement value, as I7), `profit`; coverage `owned`, `units`, `units_with_cost`, `has_cost` (cost price, else every live unit has a purchase cost, else a bulk purchase with a cost) |
| `equipment_unit_money(org, from, until, item)` | Per unit: revenue = its item's × the unit's owned days ÷ all owned unit-days (units and bulk), its own depreciation, repairs, inspections and loss. Hire-in stays on the item |
| `equipment_payback(org, item, at)` | `level` item: every unit's cost and bulk purchase against revenue since the first purchase; `level` unit: each day's revenue shared equally between what was owned that day, from purchase until lost or retired. `paid_back_on` = the report date the running revenue reached the cost; else `expected_on` at the pace of the last 12 months (or since purchase), none for a unit already gone; `pace_month` |
| `equipment_buy_or_hire(org, at)` | Items hired in over the 12 months up to today: `hire_ins`, `peak` (most in one subrental), `spend`, `unit_price` (cost price, else replacement value, `price_source`), `cost_to_buy` = price × peak, `months_to_pay_back` = cost ÷ (spend ÷ 12) |
| `item_money_card(item, at)` | JSON for the item page: `lifetime_revenue` per currency (up to today), `payback` (the item row), `use_12m` (as I7: booked unit-days ÷ owned unit-days), `next_bookings` (3) and `upcoming` |
| `report_overview_k5(org, at)` | Its own function beside `report_overview`: `best_earner_year` and `worst_earner_year` (item, profit; the worst only with two items or more), `hire_in_year` (euros), this year up to today. `useOverview` calls `report_overview` plus every function a tile names as `source` in `OVERVIEW_TILES` and merges the answers; only `report_overview` failing hides the tiles |
| Screen | `components/reports/EquipmentReport.jsx`, tab `equipment` of `REPORT_TABS` (menu Reports → Equipment; Inventory → Reports redirects here). Views (`?view=`): **Profit** (default; period and comparison, this year by default; tiles profit, revenue with the not-linked share, costs, losses; chart of the best and worst items or categories; "Show details" groups by item, category or unit (`?by=`); purchase-cost card), **Payback** (per item; details per unit), **Buy or hire in** (`?item=` picks one, as the subrental links do), **Purchase costs** (coverage with the items to fill in), **Use and value** (I7's table, `inventory/ReportsTab.jsx`). Helpers `src/lib/analytics/equipment.js` (unit tested) |
| Connected | Item page: `ItemMoneyCard` (hidden for anyone who can't see money). Subrentals tab: "Buy instead?" for items hired in over 12 months. Overview and Home: tiles `bestEarnerYear`, `worstEarnerYear`, `hireInYear`; `equipmentUse90` now opens "Use and value". Menu: Reports → Equipment; Inventory → Reports points there |
| Help | Terms equipment profit, payback, buy or keep hiring in; ⓘ `equipment-coverage`, `equipment-buy`, `item-money`; guide `warehouse-equipment-money` with five pictures (`equip-profit`, `equip-details`, `equip-payback`, `equip-buy`, `item-money`) |
| Tests | `equipment_money.sql`: a set (2 moving heads + 10 cables, shared 2/3 and 1/3), serial units (one bought mid-period, one lost with a payout, one lost and found again, one with no purchase cost), a bulk item lost and found, one hire-in covering two items, a hire-in paid by an expense, a line typed by hand; profit per item and unit, payback (paid back, expected, a lost unit), buy or hire, the item card, the tiles, who may call each function, 2,000 quotes in under 2 s (1.4 s on the test project). Vitest for the helpers and tiles; the signed-in e2e journey opens three views with axe |

**For K6 and later:** read equipment figures through these functions (hire-in cost per line
through `private.equipment_hire_lines`, units' owned periods through `private.equipment_units`),
never by adding up rows in the browser.

## How K6 works (built in the "Money reports" set)

Warehouse and upkeep. Migration `20261231000000_warehouse_numbers.sql` (two columns, a trigger and
functions; only adds); checks in `supabase/tests/warehouse_numbers.sql` (no destructive statements).
Decided with the owner on 2026-11-08: **"prepped" = scanned out**; the **idle period is 12 months**.
Defaults D42, D44, D49, D50 kept. Cancelled gigs (K7) hold no equipment and are left out of demand
and dispatch.

| Piece | How it works |
|---|---|
| Who may | `private.require_ops` (K7): the organisation's admins and members, second sign-in step when set up. Security definer, like K7's reports. Money (book value, spend, repair and loss costs) only where `private.can_see_finance`, else `null` and the screen hides those columns |
| Request times | `subrentals.requested_at` (set when the status becomes `requested`) and `decided_at` (when a request goes from requested to confirmed or declined: the supplier's `answered_at`, else now). Written only by the trigger `subrentals_times` (after `subrentals_before`); nothing is backfilled: older requests use `created_at` and `answered_at` |
| `private.warehouse_demand_rows(org, from, until)` | Per stock item (rental or sale, tracked, not a set: a set on a gig becomes its contents): **booked** = equipment reservations not cancelled (holds included, as the availability check; their periods include prep and return days); **owned on a day** = units owned that day (K5's `private.equipment_units`: purchase date, else added, until lost or retired) + the bulk ledger up to that day (`private.equipment_bulk_moves`); units in repair still count; **hired in** at a moment = confirmed or returned subrental lines covering it (not on a cancelled gig). Each day's busiest moment is found at the starts of the bookings running that day. Returns the peak (booked, when, owned then, hired then, short then), `days_over` (booked > owned), `days_short` (booked > owned + hired), `max_short`, `first_short` |
| `warehouse_demand(org, from, until, at)` | jsonb `{ today, from, until, money, items }`: those rows for every stock item owned or booked, plus `owned` now, `hire_ins` / `hired_units` (subrentals with the item overlapping the period), `last_confirmed`, `idle` (owned now, no confirmed booking from 12 months ago onwards; future bookings count) and `book_value` (live units' cost less K5 depreciation so far, plus bulk purchases' cost less theirs for the share still owned; `book_value_estimated` when a unit uses the item's cost price). At most 400 days |
| `warehouse_suppliers(org, from, until, at)` | Requests (not drafts) dated like hire-in (gig start, else their start): per supplier and in total, requests, confirmed (with returned), declined, waiting, cancelled, answered and the median time to answer (answer − sent); `spend` from K5's `private.equipment_hire_lines` (euros) |
| `warehouse_damage(org, from, until, at)` | Repairs reported in the period: count, units, open, done, written off, median and average days to repair (done ones), cost (a confirmed linked expense in euros replaces it, as K5), charged back (cost of "charge client" repairs), invoiced; per item, per gig (with client) and per client. Losses: units lost in the period on the gig they last went out to with no later return (undone scans left out), bulk lost − found; value = replacement value, else cost, less any payout. Inspections from `private.maintenance_due_all` (never inspected = due today): overdue (before today), due now, due in 30 days, never; done, failed and cost in the period; per item |
| `warehouse_dispatch(org, from, until, at)` | Gigs starting in the period (not cancelled) with gear planned or scanned: planned, out, back, `short_out` (planned − out per item), `missing` (out − back per item; totals count ended gigs), first out scan and `lead_days` (start date − its day; negative = after the start), lead buckets; scans per day (not undone, not on cancelled gigs) and the busiest day |
| `report_overview_k6(org, at)` | K6's own tile function: `items_short_30` (items with a day still short from today to 29 days ahead), `units_in_repair` (`stock_totals.in_repair`), `inspections_overdue`, `never_inspected`. `OVERVIEW_TILES`: `itemsShort30` (opens Demand for the next 30 days), `unitsInRepair` (Inventory → Maintenance), `inspectionsOverdue` (Damage and loss). The morning reminders still notify due inspections; K6 sends nothing |
| Screen | `components/reports/WarehouseReport.jsx`, tab `warehouse` of `REPORT_TABS` (menu Reports → Warehouse). Views `?view=demand|suppliers|damage|dispatch`, this month by default; "Show details" adds the tables: Demand's filter `?show=short|idle|all`, Damage's grouping `?by=item|gig|client`, losses and inspections due, Dispatch per gig and the lead-time chart. CSV and print. Helpers `src/lib/analytics/warehouse.js` (unit tested) |
| Connected | Inventory → Maintenance: "Repair and inspection numbers"; Inventory → Subrentals: "Supplier numbers"; dispatch page: "Dispatch numbers" (admins and members); Overview and Home: the three tiles; Demand's hire-in count opens Reports → Equipment → Buy or hire in for the item |
| Help | Terms demand against stock, idle stock; ⓘ `warehouse-report`; guide `warehouse-numbers` with four pictures (`wh-demand`, `wh-suppliers`, `wh-damage`, `wh-dispatch`) and the refreshed Overview picture |
| Tests | `warehouse_numbers.sql`: past stock from the ledger (10 mics, 4 lost mid-month), a subrental covering part of a booking (days over 4, still short 3), a cancelled gig's booking and scan left out, idle items with book value (units and bulk), supplier answers (24 h and 6 h → median 15) and spend, repairs per gig and client, a unit lost after its return scan was undone, inspections overdue and never done, dispatch per gig with an undone scan left out, the tiles, who may call each function (admin, member; viewer, another organisation, anonymous refused), a too-long period, the request-time trigger. Vitest for the helpers and tiles; the signed-in e2e journey opens the four views with axe |

**For later steps:** demand against stock is `private.warehouse_demand_rows`; read hire-in cost
through K5's `private.equipment_hire_lines`.

## How K7 works (built with the "Money reports" set)

Operations and people. Migrations `20261229000000_gig_cancelled_status.sql` (part 1, **applied by
hand**: it replaces two check constraints) and `20261229000001_reports_k7.sql` (functions, one
column); checks in `supabase/tests/reports_k7.sql` (no delete statements). Decided with the owner on
2026-11-08: **per-person figures for admins only**; the wrap-up shows planned against actual hours
and costs (money only for those who see it), damage, losses and missing items, open tasks and notes;
**yes to a "cancelled" gig status**. Defaults D42, D44, D49, D50 kept.

| Piece | How it works |
|---|---|
| Cancelled status | A sixth built-in status, `cancelled` (`gigs.status`, `gig_statuses.base_status`; part 1). A cancelled gig behaves like an archived one: `private.gig_reservation_status` gives `cancelled` (no crew or equipment held), `person_conflicts` and `crew_busy` leave it out, the calendar feed skips it, the gigs list puts it with the archived ones, Home, the calendar, Find crew, job posts and subrentals leave it out. The suggested own status "Cancelled" now stands for it. Reports count it as a cancellation and nothing else (no crew days, positions or tasks) |
| Who may | `private.require_ops(org)`: the organisation's admins and members (`is_staff`), with the second sign-in step when set up. `private.require_ops_admin(org)`: admins only, for per-person figures. The functions run as their owner (`security definer`, like `private.gig_labour`) because hours and fees are readable only by a gig's managers; they check who asks first, and members get totals only (`persons` and `by_person` come back `null`) |
| Crew days | `private.ops_crew_days(org, from, until)`: one row per gig, person and day inside the period, from the person's booking, else the gig's dates (as `gig_labour_hours`); viewers aren't booked; cancelled gigs don't count; staff = the organisation's admins and members |
| `ops_activity(org, from, until)` | Gigs per month by start date, by built-in status, own status and type; gig days per month (each day of a gig inside the period); the 10 busiest days (gigs running, crew booked; not cancelled); booking lead time (created → start, gigs starting in the period, not draft or cancelled) as a median and four buckets; cancelled gigs in the period |
| `ops_people(org, from, until)` | Totals: crew days (staff, freelance), people, hours planned (an hourly fee's quantity for its share of days in the period, else days × `overtime_after_hours`, 10 when not set), hours approved and their split (overtime, night, weekend, holiday) by work date, hours waiting (`private.entry_hours`: end − start − break, past midnight when the end is earlier), days waiting, time to approve (entered → approved, average). Admins: one row per person, plus staff with nothing booked, with booked working days (crew days on their working weekdays, not a national or organisation holiday, not on approved leave), `staff_utilisation`'s working and available days and leave per type, utilisation, and `leave_balances` for the year the period ends in. At most 400 days (the leave functions' limit) |
| `ops_staffing(org, from, until)` | Gigs starting in the period (not cancelled): positions needed (titles compared ignoring case and spaces), filled (people on the gig with that function, at most the quantity), open, per gig; time to fill from `gig_activity` (`member_added` with the position's function, after the position was added): count, median, average hours; crew calls sent in the period with answers (accepted, declined, none yet, full) and the median time to answer; job posts made in the period (open, filled, closed, applications, accepted) |
| `ops_tasks(org, from, until)` | The organisation's own tasks and its gigs' tasks (not removed, not on cancelled gigs): open and overdue as of today (organisation's date), done in the period, on time (done on or before the due date) and late; per gig for admins and members, per person for admins |
| `private.person_labour(org, gigs)` | `private.gig_labour`'s rule per person instead of per gig (the test checks they add up to the same planned and counted labour), with each person's days, planned, approved and waiting hours and the split |
| `ops_person(org, user, from, until)` | Admins only. The gigs starting in the period that the person was on (dated like the money reports), each with days, hours and cost (actual, else agreed fee, else rate card marked estimate), totals, first and last gig, and for staff `leave_balances` and utilisation. Someone who is neither a member nor ever on the organisation's gigs: `P0002` |
| `gig_wrapup(gig)` | The gig's managers (`can_manage_gig`) and the organisation's admins and members; crew and viewers refused. Hours per gig (planned days and hours, approved, waiting, returned days, split) and, for managers and admins, per person; `gig_finance`'s row for those who see money; damaged returns and not-back counts from `gig_dispatch` (undone scans left out), units marked lost after going out and never scanned back, repairs on the gig (staff only; cost only with money), open tasks, and `gigs.wrapup_notes` (up to 4000 characters, written by whoever may edit the gig) |
| Overview tiles | `report_overview_k7(org)` (K7's own function; `report_overview` unchanged): crew days this month, open positions on gigs starting today to 13 days ahead, overdue tasks, days and hours waiting for approval. `useOverview` merges it in as `k7`; the four tiles in `OVERVIEW_TILES` (`crewDaysMonth`, `openPositions14`, `overdueTasks`, `hoursWaiting`) hide themselves when it didn't load (`hide`) |
| Screens | Reports → **Operations** (`components/reports/OperationsReport.jsx`, tab `operations`, menu Reports → Operations), views `?view=activity|people|staffing|tasks`. The whole period counts, days still to come included (bookings and positions are planned ahead); activity and people compare with the previous period or last year in full. "Show details" adds: activity by type (`?by=type`), gig days, lead time and busiest days; the per-person table (admins); positions per gig, crew-call answers and job posts; tasks per gig and per person (admins). CSV and print. Helpers in `src/lib/analytics/ops.js` (unit tested). **Gig wrap-up** at `/gig/:id/wrapup` (`pages/GigWrapupPage.jsx`), printable. **Person page** at `/org/:orgId/people/:userId` (`pages/PersonPage.jsx`), admins only, this year by default |
| Connected | Gig page: once the gig has ended, its managers and the organisation's admins and members see "Open the wrap-up" (`GigWrapupLink`). Crew tab: admins get a link to each person's page. Organisation → Tasks: a link to Reports → Operations → Tasks. Overview and Home: the four tiles. DATA_MAP.md: a row for per-person reports. Reports → Operations → People links each name to the person page |
| Help | Terms crew day, staff utilisation, time to fill, gig wrap-up; ⓘ `operations-report`; page notes `gig-wrapup`, `org-person`; guide `pm-operations` with four new pictures (`ops-activity`, `ops-people`, `ops-staffing`, `gig-wrapup`) and the refreshed Overview picture; the gig-status help mentions Cancelled |
| Tests | `reports_k7.sql`: the cancelled status (no reservation, not busy, not a clash, an own status may stand for it), each view's numbers on hand-worked fixtures (a national holiday, a day of leave, an hourly fee, a booking shorter than the gig, a position split over two rows, an undone return scan), per-person labour adding up to `gig_labour`, who may call each function (admin and member; members get no per-person rows and no person page; viewer, crew, another organisation, anonymous: no; the second sign-in step), who may write the notes. Vitest for the helpers, tiles, nav, gigs list; the signed-in e2e journey opens the four views with axe |

**For K8 and later:** per-person labour is `private.person_labour`; crew days are
`private.ops_crew_days`; add per-person figures behind `private.require_ops_admin`.

## How K8 works (built in the "Money reports" set)

Crew numbers in My work, fee paid, crew to pay and the year statement. Migration
`20261230000000_crew_numbers.sql` (one table, functions and a trigger); checks in
`supabase/tests/crew_numbers.sql` (no destructive statements). Decided with the owner on 2026-11-08:
crew **may mark a fee received**; the year statement is **one row per month with totals, then each
gig**. AVX work only (D25); only the person's own rows; companies show only their name.

| Piece | How it works |
|---|---|
| `private.my_gig_rows(user)` | One row per gig the person is on (draft and cancelled gigs left out): company name only, dates, role, function, **days** (their booking, else the gig's dates, as `private.gig_labour_hours`), the agreed fee, **hours approved** (`split.worked`) and **waiting** (submitted days' start–end minus break), **overtime** (`split.overtime`), approved cost, **km and travel minutes** (submitted and approved days), **earned** (approved days' stored cost plus a fixed fee once; with no approved days, the agreed fee once the gig is over), **upcoming** (the agreed fee of a gig not over), **paid on** (the live confirmed expense linked to the fee) and **received at**. "Over" is by the gig's organisation's date. Never callable directly |
| `my_gig_numbers(from, until, gig)` | The caller's own rows (security definer on `auth.uid()`, two-step sign-in rule), by the gig's start date (the K1 report date). `MyFee` reads one gig's paid on / received through it, never the organisation's expenses |
| `my_monthly_summary(from, until, org)` | Per company and month (gig start date): gigs, days, hours approved and waiting, overtime, earned, paid (earned of gigs marked paid), km, travel minutes and **reimbursements** (approved claims, by claim date). **Step 27's "recibo verde" summary reuses this function** |
| `my_crew_activity(from, until)` | Job posts applied to (shortlisted or further, offered, accepted), crew calls answered (accepted or declined) and accepted, and **reimbursements owed** (approved claims with no paid date, per currency) |
| Fee paid | `mark_crew_fee_paid(gig, user, paid_on, how, amount_net, vat_rate, description)`: those who see money (`require_finance`: admins and members, two-step sign-in) mark an agreed fee paid. The live expense linked to the fee (9b) gets the date (a draft is confirmed); with none, one is recorded (confirmed, EUR, the starter "freelance crew" category when there is one, amount and VAT from the form, the fee total by default). An empty date takes the paid date off (the expense stays). A future date (beyond tomorrow) is refused |
| Notification | Trigger `expenses_fee_paid` on `expenses`: whenever a crew fee's expense becomes confirmed with a paid date (labour panel, Crew to pay or Expenses), the person gets `fee_paid` with the gig and the date only, never the amount. Direct (shown when the organisation is muted); opens the gig's Crew tab. Push and email texts in `_shared/notification-text.ts` |
| Received | `crew_fee_received` (gig, person, `received_at`; empty after unmarking, the row stays). Written only by `mark_fee_received(gig, received)`, by the person on the gig, once the fee is marked paid. Read by the person and the gig's managers (`can_manage_gig`) |
| Crew to pay | `private.crew_to_pay_rows`: agreed fees on gigs that are over (organisation's date), not draft or cancelled, without a confirmed paid linked expense. Amount: the linked expense's total with VAT, else the agreed fee (`estimated`). `crew_to_pay(org)`: admins get every row, members only the gigs they manage (per-person money, Definitions) |
| K3's tile | `report_overview_k8(org)`: `crew_to_pay` per currency, `crew_to_pay_count`, `crew_to_pay_estimated`, for everyone who sees money (totals only). `OVERVIEW_TILES` entry `crewToPay` has `source: 'report_overview_k8'`; `useOverview` (K5's change) calls `report_overview` plus each tile's `source` and merges the answers, so later steps add a tile without touching `report_overview` |
| Screens | **My work**: `MyNumbersStrip` (earned this month, not yet paid, booked days in the next 30 days; shown in simple mode too, hidden until a gig has a fee or earnings). **My numbers** `/me/numbers?year=&org=` (`pages/MyNumbersPage.jsx`, menu My work → My numbers): tiles, earned by month, per company, busiest months, functions, job posts and crew calls, reimbursements owed, each gig with paid on / received. **Year statement** `/me/numbers/statement?year=&org=` (`pages/YearStatementPage.jsx`): twelve months with totals, then each gig; CSV and print. **Labour panel**: "Mark paid" per agreed fee for those who see money (`PaidModal`), "Paid on … · received". **MyFee**: "Paid on …", "Mark received" / "Not received". **Expenses → Crew to pay** (`components/expenses/CrewToPay.jsx`) |
| Helpers | `src/lib/analytics/crewNumbers.js` (`crewTotals`, `notYetPaid`, `myWorkTiles`, `byCompany`, `byMonth`, `busiestMonths`, `functionsWorked`, `yearStatement`, `summaryCompanies`), unit tested on the database test's gigs |
| Help | Terms fee paid, year statement; ⓘ `crew-to-pay`, `fee-paid`, `reimbursements-owed`; pages `my-numbers`, `my-statement`; guide `crew-numbers` with four pictures (`my-numbers-tiles`, `my-numbers`, `fee-paid`, `year-statement`) |
| Tests | `finance_cash.sql` (K8 block): a fee with no invoice counts once as crew, its invoice moves it to unpaid (the position unchanged), another organisation's fee never appears. `crew_numbers.sql`: each person sees only their own gigs, fee, hours and received mark; earned, upcoming, hours waiting, overtime, km; the period and one-gig filters; crew to pay for admins, members (none unless they manage the gig) and the tile's totals; fee paid records the expense once, with VAT, refuses a missing fee and a future date, and notifies without the amount; paid through Expenses notifies too; received only after paid, only by the person, read by the company that owns the gig and nobody else; unpaying brings the fee back; reimbursements; the monthly summary; outsiders and anonymous calls refused. Vitest for the helpers and the tile |

**Cash (D50 h):** migration `20261230000001_crew_fees_cash.sql` renames K3's `cash_report` to
`private.cash_report_pre_k8` and wraps it (same signature and rights): fees to pay with **no invoice
yet** join `expected_out` as `group_key` `crew` in this month, at the agreed fee
(`private.crew_fees_unbilled`, totals per currency after the finance check), and the month's
`position` drops by the same amount. A fee whose invoice is recorded already counts as `unpaid`
through its expense, so nothing is counted twice (checked in `finance_cash.sql`, K8 block).

## How K9 works (built in the "Money reports" set)

Report extras; the owner picked all four. Migration `20270101000000_report_extras.sql`; checks in
`supabase/tests/report_extras.sql` (no delete statements). Two Edge Functions: `send-key-numbers`
and `report-link-public` (JWT verification off for both).

| Piece | How it works |
|---|---|
| Counting without a reader | The weekly email and the accountant link have no signed-in reader, so their functions check the person first (an admin who opted in; the admin who made the link and still is one), then run the existing report functions **as that person** (`private.report_as` sets the request's claims, `private.report_unswap` puts the old ones back before returning). Same rules, same `require_finance`, no second copy of any number. Only service-role functions do this; `private.report_claims_swap` can't be called by users. The second sign-in step can't be asked for here (see PENDING) |
| `private.key_numbers(org, at)` | The Overview's numbers in one object: `report_overview` and `report_overview_k4`…`k8` merged, as `useOverview` merges them in the browser |
| Weekly key numbers | `profiles.weekly_numbers` (off by default), shown in Settings → Notifications to people who administer an organisation. `public.weekly_numbers_recipients()` (admins who opted in, once per organisation, not muted ones), `public.weekly_key_numbers(org, user, at)` (null unless still an admin who opted in), `public.claim_weekly_numbers(user, org, week)` (once per person, organisation and Monday-week, in `report_email_log`, and under `send_settings.daily_email_cap` counted together with `send_log`). `send-key-numbers` sends one email per admin and organisation through Brevo (same secrets as the daily summary), text in `_shared/key-numbers-email.ts` (EN/PT, Vitest in `src/lib/keyNumbersEmail.test.js`): twelve numbers, money per currency, each line a link to its report. `?dry=1` counts only. GitHub workflow `key-numbers.yml`, Mondays 07:41 UTC |
| Saved views | `report_views` (org, user, name, tab, query string without the tab, pinned, removed_at): only its owner reads or changes it, and only while `can_see_finance`; 50 live views per person and organisation; removed by marking. `src/lib/analytics/reportViews.js` (`viewQuery`, `viewHref`, CRUD). "Save this view" on every report tab; Reports → Overview shows the pinned ones as links and "Manage" lists all to pin, unpin or remove (`components/reports/SavedViews.jsx`). A view opens as a plain link, so ReportsPage's `setParam` (#115) wasn't touched |
| Monthly management pack | `src/lib/analytics/managementPack.js`: for a whole month already over, reads the Overview sources, `finance_results` (the month and the month before), `sales_win_rate`, `sales_clients` (top five by revenue) and `equipment_money` (five best and three worst earners), lays them out as tables (`packSections`, tested) and draws the PDF with jsPDF + autotable in the browser (`pdfSafe` for the built-in fonts). On Reports → Overview; usage count `pdf:reports:pack` |
| Accountant link | `report_links` (org, SHA-256 `token_hash`, label, period of at most two years, `expires_at` 1–180 days, `revoked_at`, views). Admins see their organisation's links (never the hash) and make or revoke them through `public.create_report_link` (returns the token once; 20 live links per organisation) and `public.revoke_report_link`. `public.report_link_view(hash, at)` (service role only) returns null for unknown, revoked or expired links and when the maker is no longer an admin; otherwise `finance_results` by month and in total, invoiced / credited / received / paid out by month (`cash_report`) and spending by category, counted as the maker, and counts the view. `report-link-public` hashes the token and answers `not_found` for all failures alike. Page `/r/:token` (`pages/ReportLinkPage.jsx`, no sign-in, `noindex` and `no-referrer`): a table per currency, every month of the period, estimates starred, print |
| Help | Terms saved view, management pack, accountant link, weekly key numbers; ⓘ hints on the three Overview sections; guide `office-report-extras` with six pictures (sample answers in `scripts/help-screens/sample-data.mjs`, Edge Function answers under `functions`) |
| Tests | `report_extras.sql` (recipients, opt-in, muted, claims put back, once a week, who may call; saved views per person, viewers refused; links: hash only, admins only, valid shows the period, unknown, expired (by clock and by date), revoked and former-admin links show nothing); Vitest for views, links, the pack and the email; e2e: the journey saves, opens and removes a view and checks the Overview sections and the setting; axe on `/r/<unknown>` |

## K10 · Safety and compliance (suggested, D27)

Needs: I5, 16, 19, 20, K1. Built only if the owner says yes.

- **Gear**: inspections due, overdue and failed; units booked on upcoming gigs whose inspection
  will be overdue by then, with a ⚠ on the gig's Equipment tab (never a block).
- **People**: crew on upcoming gigs whose certificates (from the profiles they share) expire
  before the gig; the certificates each function needs.
- **Gigs**: rigging sign-offs missing or pending, on-site power checklists not done, documents not
  signed, damage reported on site.
- A printable **safety pack** per gig for venues and clients, which says that rigging and power
  results are aids a competent person must check.

## K11 · Sustainability (suggested, D28)

Needs: 8, 15, 23, K1. Built only if the owner says yes.

- Transport km per trip and vehicle (with its fuel type), crew travel km, tonne-km of gear moved;
  the power plan's estimated energy per gig, from the grid or a generator.
- Estimated emissions from a named, dated set of published emission factors (stored with their
  source and version), per gig and per period.
- A per-gig summary for clients and festivals, labelled as an estimate with its method.

## After the launch

### K12 · Crew: all income

Needs: K8, 9b.

- Work outside AVX, private to the person: company, dates, fee, km, notes; counted in My numbers
  and the year statement, marked as typed by them.
- The person's own business costs (fuel, gear, training, insurance) with receipts, reusing 9b's
  receipt handling in a personal space.
- A year statement covering everything; a mileage log; amounts kept per currency.
- Labelled as a summary, not tax advice. Starts from what freelancers asked for during the beta.

### K13 · Crew-owned gear for hire

Needs: I6, K8, 12.

- Proposed approach: a freelancer who owns gear runs it as a one-person organisation (possible
  today), so the catalogue, units, availability, QR labels, cross-hire code and hire requests (I6)
  work unchanged, and companies hire the gear as a subrental.
- New: an "I own gear" setup from the crew profile that links the person's organisation to their
  profile; "gear and operator" in crew calls and job posts; optionally gear shown on the profile and
  in Find crew; the hire income in the person's numbers next to their fees.
- Ask then: showing gear on profiles and in Find crew; who sees hire prices; damage terms (repairs
  charged to the hirer, step 12).

### Ideas, only if the owner says yes (D29)

- **Market insights**: typical rates and demand per function and region, from job posts and agreed
  fees, anonymised and shown only when enough people are in a group. Needs a legal check (data
  protection, and competition rules on sharing prices between companies).
- **Client feedback**: a short rating after each gig through the client link, giving satisfaction
  per client and gig type.
- **Platform dashboard** for AVX's owner: organisations, active people, feature use (from the
  usage counts), and trials and billing after P3–P4.
- **Expense automation**: reading receipt photos, matching bank statement files to expenses and
  payments (the AT e-Fatura purchase-invoices file is asked in 9b).

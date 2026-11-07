# Dashboards, analytics and reports

The numbers side of AVX: dashboards, analytics and reports for organisations and for crew. They are
built as the **K** steps ("key numbers"), in the order [ROADMAP.md](../ROADMAP.md) gives them, each
in its own session with its prompt in [SESSION_PROMPTS.md](SESSION_PROMPTS.md). The expenses step
they need (9b) is specified in [BUSINESS.md](BUSINESS.md).

**Status (2026-11-06): K0 built (0.64.0), K1 built (0.69.0), K2 built (0.75.0); the rest planned.** When a K step is built, its section below is
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
| `organisations.time_zone` exists (Lisbon by default), though most code still reads Lisbon (U1) | `20261024000000_reservations_people.sql` | Reports use the column from day one |
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

## K3 · Money: cash, spending and forecast

Needs: K2, 11, 12.

- **Cash in**: invoiced and paid per month (with VAT, labelled), overdue invoices by age (0–30,
  31–60, 61–90, over 90 days), expected cash in by due date, balance per client, deposits, credit
  notes.
- **Cash out**: expenses paid per month, unpaid expenses by due date, recurring costs coming up,
  crew fees to pay (filled by K8).
- **Cash position**: money expected in minus money expected out, per month ahead.
- **Spending**: by category, supplier, gig and month; the biggest changes against the comparison.
- **Forecast**: confirmed revenue of upcoming gigs per month; quotes waiting for an answer shown
  apart, with the win rate beside them.
- Budgets per expense category and a revenue target, if wanted.
- The client portal (step 26) shows the client's balance from this step's function.
- Tiles: overdue now, cash expected in 30 days, unpaid expenses due in 14 days, confirmed revenue
  in the next 3 months.
- Ask: budgets and targets; weighting the forecast by the win rate; how many months ahead.

## K4 · Sales and clients

Needs: K0, K1, 10.

- **Waiting for an answer**: quotes by age and status (sent, opened by the client, expiring soon)
  with their value; a follow-up list (sent more than N days ago, no answer).
- **Win rate** by count and value per period, gig type, client and quote author; time from sent to
  decision (median); lost reasons; average quote value; discounts given (gross against net).
- **Clients**: revenue, margin, gigs, quotes, win rate, first, last and next gig, average gig
  value; new and returning clients; what the top 5 clients bring. A numbers card on the client in
  Contacts.
- Tiles: quotes waiting (value), win rate over 90 days, top client this year.
- Ask: N days for follow-ups; win rate per person for members too, or admins only; grouping by a
  custom field of kind "choice".

## K5 · Equipment money

Needs: K0, K1. Inventory → Reports opens Reports → Equipment.

- **Profit** per item, category and unit: revenue (a set has no stock, so its revenue is shared out
  to its contents by their day prices; lines typed by hand show as "not linked to an item: N%")
  minus depreciation in the period (straight line, as I7; bulk purchases from their date with the
  item's write-off period), repairs not charged, inspections, hire-in for the item and losses at
  replacement value.
- **Payback** per unit and item: revenue since purchase against purchase cost, the date it paid for
  itself, or when it will at the current pace.
- **Buy or keep hiring in**: hire-in spend over 12 months against the cost to buy (cost price, else
  replacement value) and the months to pay back.
- **Coverage**: how many units and items have a purchase cost, with a link to fill the gaps.
- A numbers card on the item page: lifetime revenue, payback, use over 12 months, next bookings.
- Tiles: best and worst earners this year, hire-in spend this year.
- Ask: how a set's revenue is shared; the default write-off period; a share of labour (default no).

## K6 · Warehouse and upkeep

Needs: K5.

- **Demand against stock**: the busiest moment booked against what was owned then (from the
  ledger and unit history), days short, how often it was hired in; idle stock and "sell?"
  candidates (no confirmed booking in 12 months, with book value).
- **Suppliers**: hire-in spend per supplier, requests confirmed or declined, time to answer.
- **Damage and loss**: repairs per item, gig and client; time from reported to repaired; cost and
  what was charged back; losses per gig and client; inspections due, overdue and their cost.
- **Dispatch**: per gig, scanned out against planned and back against out, still missing; scans per
  day (warehouse workload); how many days before the gig gear left.
- Tiles: items short in the next 30 days, units in repair, inspections overdue.
- Ask: which dispatch steps count as "prepped"; the idle period.

## K7 · Operations and people

Needs: K1, 8, 9.

- **Activity**: gigs and gig days per month by status and type; the busiest days; how far ahead
  gigs are booked.
- **People**: crew days and hours per person (staff and freelancers); overtime, night, weekend and
  holiday hours; planned against approved hours; how long approvals take; staff utilisation; leave
  taken and left; the share of crew days done by freelancers.
- **Staffing**: positions filled and open by gig date; time to fill (from the activity log);
  crew-call answers and time to answer; job posts (applications, filled).
- **Tasks**: open, overdue and done on time, per person and per gig.
- **Gig wrap-up**: a printable page per gig after it ends: planned against actual hours and costs
  (money only for those who see it), damage, losses and missing items, open tasks and notes.
- A person page for admins: their days, hours and cost with the organisation (a DATA_MAP.md row).
- Tiles: crew days this month, open positions in the next 14 days, overdue tasks, hours waiting for
  approval.
- Built in step 9: `staff_utilisation(org, from, to)` gives each member of staff's working days, leave
  per type, days and hours available and approved hours logged (docs/BUSINESS.md, "How leave
  requests work").
- Ask: per-person figures for admins only or members too; the wrap-up page; a "cancelled" status.

## K8 · Crew numbers

Needs: K1, 7b, 8, 9b. AVX work only (D25).

- **My numbers** in My work: gigs, days and hours (approved and waiting), overtime, per company and
  month; earnings from agreed fees and approved hours × fee; upcoming booked earnings; travel km and
  time; busiest months; functions worked; job applications (shortlisted, accepted); crew calls
  answered.
- **Fee paid**: the gig's managers mark a fee paid in the labour panel, which records the linked
  expense (9b) and notifies the person; the person sees only "paid on" for their own fees (through
  a function, never the organisation's expenses) and can mark it received. Organisations get a
  "crew to pay" list and K3's tile.
- Reimbursements owed to the person, if expense claims were built in 9b.
- **Year statement** per company (fees, hours, km) as CSV and a printable page; step 27 reuses the
  same monthly summary for the "recibo verde".
- Only the person's own rows; companies show only their name (`my_gig_companies`).
- Tiles on My work: earned this month, not yet paid, next booked days.
- Ask: may crew mark "received"; the year statement's layout.

## K9 · Report extras (optional)

Needs: K2–K8. Only what the owner picks: a weekly key-numbers email to admins (opt-in, through the
email summary and Brevo); saved views pinned to the Overview; a monthly management pack as a PDF
(jsPDF); a read-only link for the accountant (token, expiry, revocable, like quote links).

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

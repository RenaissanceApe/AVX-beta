# Dashboards, analytics and reports

The numbers side of AVX: dashboards, analytics and reports for organisations and for crew. They are
built as the **K** steps ("key numbers"), in the order [ROADMAP.md](../ROADMAP.md) gives them, each
in its own session with its prompt in [SESSION_PROMPTS.md](SESSION_PROMPTS.md). The expenses step
they need (9b) is specified in [BUSINESS.md](BUSINESS.md).

**Status (2026-11-02): K0 built (0.64.0); the rest planned.** When a K step is built, its section below is
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

## Definitions (proposed; agreed with the owner in K1)

| Number | Definition |
|---|---|
| **Revenue (net)** | Priced lines of accepted quotes: line total × (1 − phase discount) × (1 − quote discount). Optional phases and comments left out. Excl. VAT, per currency. May differ by a cent from the quote's total (rounding) |
| **Report date** | Everything that belongs to a gig is dated by the gig's start date, so a gig's margin is never split across months. A quote with no gig: its first phase date, else its issue date. Expenses: their date (capital ones spread over their months). Sales figures use the sent and decided dates; cash figures use invoice, due and payment dates |
| **Gig revenue** | All accepted quotes linked to the gig. None accepted: the newest sent quote, marked estimate |
| **Labour cost** | Approved hours × agreed fee or rate (actual) → agreed fee → rate card (estimate). Fixed fees ignore hours |
| **Direct costs** | Labour; confirmed or returned subrentals (the supplier's price, else the lines); repairs on the gig not charged to the client; gig expenses (kind "direct"); cost of goods sold (sale lines × the item's cost price); transport (after step 23). A linked expense replaces the planned amount |
| **Gross margin** | Revenue − direct costs; margin % = gross margin ÷ revenue |
| **Operating result** | Gross margin − overhead expenses − depreciation (equipment and capital expenses) |
| **Equipment profit** | Item revenue − depreciation in the period − repairs not charged − inspections − hire-in for the item − losses at replacement value |
| **Payback** | Revenue since purchase ÷ purchase cost; the date it reached 1 |
| **Equipment use** | As I7: booked unit-days on confirmed gigs (prep and return days included) ÷ owned unit-days, up to today |
| **Staff utilisation** | Booked working days ÷ (working days − leave − public holidays) |
| **Win rate** | Accepted ÷ (accepted + declined), decided in the period, by count and by value. Quotes past their validity with no answer are "expired" and stay out of the rate |
| **Crew day** | A calendar day someone is booked on a gig (their booking, else the gig's dates) |
| **Periods** | Calendar months in the organisation's time zone; weeks start on Monday; compared with the previous period of the same length or the same period last year |
| **Who sees what** | Money only where `can_see_finance` allows (D23). Per-person money (one person's hours and cost) admins only by default. Crew only ever see their own rows; viewers see no numbers |

## Starting point (what exists, 2026-11-02)

| What | Where | What it means for reports |
|---|---|---|
| Serial units have purchase date, cost and write-off period; I7 shows revenue ÷ cost | `stock_units`, `src/lib/reports.js` | Equipment profit is half possible today |
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

## K1 · Reports engine and the Reports area

Needs: K0, 9b. Just before step 10, its first user.

- The definitions above, walked through with the owner and changed where they say.
- **The revenue rule, twice**: `public.report_revenue_lines(org, from, until)` and
  `src/lib/analytics/revenue.js`: one row per priced line of accepted quotes with its kind, item,
  quote, gig, client, gig type and status, currency and report date. Shared fixtures
  (`src/lib/analytics/fixtures.json`) checked by Vitest and by `supabase/tests/reports_k1.sql`.
- **Periods**: this month, last month, this quarter, this year, last 12 months, custom; the
  comparison; the organisation's time zone (`src/lib/analytics/periods.js`).
- **Report parts** (`src/components/reports/`): period and filter bar (status, type, client),
  group-by, sortable table, CSV (`reportCsv`), print, SVG charts (number tile with change, bar,
  stacked bar, line, sparkline) with a table alternative; simple first, details on demand.
- **Reports area**: `/org/:orgId/reports?tab=…`, in the menu for those allowed; an Overview tab
  with a tile list later steps add to (first tiles: gigs this month, confirmed revenue in the next
  30 days, value of quotes waiting for an answer, equipment use over 90 days); a key-numbers strip
  on the organisation's Home (not in simple mode, can be folded).
- **I7 in the database**: `public.equipment_report(org, from, until)`, the same columns, dated by
  the rule, without the 1000-row limit; Inventory → Reports reads it.
- The labour cost panel's revenue follows the rule (all accepted quotes, after phase discounts).
- Each function answers in under a second on 5,000 quotes made inside a rolled-back test.
- Ask: the first tiles; Reports as its own menu section or under Organisation.

## K2 · Money: results and margins

Needs: K1, 9b, 10 (and 8 for actual labour).

- **Results** per month, quarter or year, with the comparison: revenue by line kind; direct costs
  (labour, subrentals, repairs not charged, gig expenses, cost of goods sold); gross margin in money
  and %; overheads by category and depreciation → operating result; the estimated share of each.
- **Margin** by gig (step 10's list), gig type, status, client, line kind and production manager.
- **Labour**: planned against actual, per gig and per period, in hours and money.
- One function, `public.finance_results(org, from, until, group_by)`, on `gig_finance`,
  `report_revenue_lines` and the expenses.
- Tiles: revenue this month against last year, margin % this year, operating result this year,
  gigs with a negative margin.
- Ask: do repairs not charged count against the gig; production manager grouping; the tiles.

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

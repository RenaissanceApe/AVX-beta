# Session prompts

One prompt per remaining feature session, in [ROADMAP.md](../ROADMAP.md) order. To build the next
step:

1. Make sure the previous step's PR is merged.
2. Open a **new** Claude Code session on this repository.
3. Paste the prompt below, as it is.

Each session follows CLAUDE.md ("A session, start to finish"), so the prompts don't repeat it: it
branches from `main`, asks you its questions, outlines the migration and waits for your yes, builds,
connects, documents and opens a PR. **It never merges**; you do. Then the next prompt.

Every prompt ends with the same two lines on purpose: they keep a session from drifting into the
next step.

**When a step's plan changes** (a new decision, a question answered), edit its prompt here and its
plan in the doc it names, in the same commit.

**Once a prompt has been used, its section is removed** (CLAUDE.md, "A session, start to finish",
step 6), so this file only holds prompts still to run. The ROADMAP's "Built" table records what
they built.

Steps 1–10 (0.54–0.71), K0 (0.64) and K1 (0.69) are built, and their prompts (S01–S04, K1) removed. Sessions
S05–S31 are the build order, with steps 19b and 20b (S15b, S16b) and the dashboards and analytics pack (K1–K11, [ANALYTICS.md](ANALYTICS.md)) slotted in where
ROADMAP.md places them; U1–U6 are small upkeep sessions to run in any gap; QA1–QA4 build the QA bot ([QA.md](QA.md)) in any gap; IM1–IM4 overhaul the import wizard ([SWITCHING.md](SWITCHING.md)) in any gap; P1–P5 close the build;
K12–K13 come after the launch.

---

## S05 · Step 11: invoices

```
Build ROADMAP step 11: invoices. Read the ROADMAP row, docs/BUSINESS.md "Planned → 11",
docs/QUOTES.md, src/lib/quotes.js and the contacts page.

Important: in Portugal legal invoices must come from certified software (AT). AVX prepares the
invoice and hands it to a certified program; it never issues a legal invoice itself.

Ask me first, before any design:
1. Which certified program do I use (InvoiceXpress, Moloni, Vendus, TOConline, other)?
2. Start with a file export that any program can import, or that program's API?

Scope:
- VAT per line on quotes (today one rate per quote), with old quotes migrated to their single rate.
  Change report_revenue_lines and src/lib/analytics/revenue.js (K1) with it and rerun their shared
  fixtures: net revenue must not change.
- An invoice draft from an accepted quote: all of it, chosen phases, or a deposit %. Client from
  contacts.
- Status: draft → sent to the certified program → issued (store its number and a link to the PDF)
  → paid / overdue.
- Credit notes against an issued invoice. Overdue reminders (notification, optional email through
  Brevo).
- Invoices in the organisation export.

Connect: quotes (invoiced amount on the quote), contacts, client guest threads, gig finance
(step 10: invoiced vs paid), reports (K3 reads the issue, due and paid dates).

Done when: database tests (only admins and members, numbering can't be edited by hand); unit
tests for VAT per line and deposit maths; help guide; PR open. If the API route is chosen, list
the secrets I must add and never ask me to paste keys.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S06 · Step 12: damage charged to the client, payments

```
Build ROADMAP step 12: repairs charged to the client and payments. Read the ROADMAP row,
docs/BUSINESS.md "Planned → 12" and the invoices section written by step 11.

Scope:
- Repairs with charge_client become lines to add to the gig's next invoice draft (once).
- Record payments against invoices (date, amount, method, note); partial payments; the invoice
  turns paid when covered.
- Optionally a payment link on invoices.

Ask me before building: payment links now or later; if now, which provider (Stripe, or Portuguese
methods first: MB Way and Multibanco references through easypay or ifthenpay)?

Connect: repairs, invoices, gig finance, client portal later (step 26), reports (K3: paid per
month, overdue).

Done when: database tests; help guide; PR open; any provider secret listed for me to add.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K2 · Money: results and margins

```
Build ROADMAP step K2: money, results and margins. Read the ROADMAP row, docs/ANALYTICS.md
("Definitions", "K2"), "How K1 works", "How expenses work" (9b), the gig finance section step 10
wrote in docs/BUSINESS.md (gig_finance) and how step 8 stores approved hours.

Scope (Reports → Money), simple first with details on demand:
- Results per month, quarter or year, with the comparison: revenue by line kind (rental, sale,
  crew, transport, other); direct costs: labour (approved hours, else agreed fee, else rate card,
  marked estimate), subrentals, repairs not charged to the client, gig expenses, cost of goods
  sold (sale lines × the item's cost price); gross margin in money and %; then overheads
  (overhead expenses by category) and depreciation (equipment and capital expenses) → operating
  result; the estimated share of each.
- Margin by gig (step 10's list), by gig type, status, client, line kind and production manager.
- Planned against actual labour, per gig and per period, in hours and money.
- Tiles: revenue this month against last year, margin % this year, operating result this year,
  gigs with a negative margin.
- One function, public.finance_results(org, from, until, group_by), built on gig_finance,
  report_revenue_lines and the expenses; the browser only formats.

Ask me before building: production manager grouping (first PM, or shared between PMs?); the
tiles. (Repairs not charged to the client count against the gig: decided in step 10.)

Connect: gig finance panel (link to the report), Overview, gig cards (the margin hint built in
step 10), expenses (a category's total opens its list).

Done when: database tests for every figure on fixtures (two currencies kept apart, a gig across
two months, a quote with no gig, a capital expense spread over its months, a cost linked to an
expense counted once, estimate flags, who may call it); unit tests; help guide "office-money"
with screenshots; 320/390 px EN/PT; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K3 · Money: cash, spending and forecast

```
Build ROADMAP step K3: money, cash, spending and forecast. Read the ROADMAP row,
docs/ANALYTICS.md ("Definitions", "Decided", "K3"), "How K2 works", "How expenses work" (9b),
and how steps 11 and 12 built invoices, credit notes and payments (docs/BUSINESS.md).

Scope (Reports → Money), simple first with details on demand:
- Cash in: invoiced and paid per month (with VAT, labelled), overdue invoices by age (0–30, 31–60,
  61–90, over 90 days), expected cash in by due date, balance per client, deposits, credit notes.
- Cash out: expenses paid per month, unpaid expenses by due date, recurring costs coming up; crew
  fees to pay once K8 marks them (leave the tile for K8).
- Cash position: money expected in minus money expected out, per month ahead.
- Spending: by category, supplier, gig and month; the biggest changes against the comparison
  period.
- Forecast: confirmed revenue of upcoming gigs per month; quotes waiting for an answer shown apart,
  with the win rate beside them (not multiplied in unless I say so).
- Budgets and targets, if I want them: a monthly budget per expense category and a revenue target,
  with progress tiles.
- Tiles: overdue now, cash expected in 30 days, unpaid expenses due in 14 days, confirmed revenue
  in the next 3 months.

Ask me before building: budgets and targets yes or no; weight the forecast by win rate?; how many
months ahead for the cash position.

Connect: invoices (overdue list), payments, expenses, Contacts (client balance, supplier spend),
Overview; the client portal (step 26) shows the client's balance from this function (name it in
docs/BUSINESS.md "Planned → 26").

Done when: database tests (partial payments, credit notes, overdue by the organisation's date,
recurring costs counted once, only those who see money can call it); help guide "office-cash";
PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K4 · Sales and clients

```
Build ROADMAP step K4: sales and clients. Read the ROADMAP row, docs/ANALYTICS.md
("Definitions", "K4"), "How K0 works" (quote dates, lost reasons, client on gigs),
docs/QUOTES.md (statuses, client links) and the Contacts page.

Scope (Reports → Sales, and Contacts), simple first with details on demand:
- Quotes waiting for an answer by age and status (sent, opened by the client, expiring soon) with
  their value; a follow-up list (sent more than N days ago, no answer).
- Win rate by number and by value per period (by decision date), per gig type, per client and per
  person who made the quote; time from sent to decision (median); lost reasons; average quote
  value; discounts given (gross against net).
- Clients: revenue, margin, gigs, quotes, win rate, first, last and next gig, average gig value;
  new and returning clients per period; what the top 5 clients bring.
- A numbers card on a client in Contacts.
- Tiles: quotes waiting (value), win rate over 90 days, top client this year.

Ask me before building: N days for follow-ups; win rate per person for members too, or admins
only?; group by a custom field of kind "choice" (e.g. sales channel)?

Connect: Quotes list (follow-up filter), Contacts, Overview.

Done when: database tests (expired quotes kept out of the win rate, quotes with no client,
another organisation's clients never counted, who may call); help guide "office-sales"; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K5 · Equipment money

```
Build ROADMAP step K5: equipment money. Read the ROADMAP row, docs/ANALYTICS.md ("Definitions",
"K5"), docs/INVENTORY.md (I4 kits, I5, I6, I7) and "How K1 works" (equipment_report).

Scope (Reports → Equipment; Inventory → Reports opens it, one screen):
- Profit per item, category and unit in a period: revenue (the rule; a set's revenue shared out to
  its contents by their day prices; lines typed by hand shown as "not linked to an item: N%")
  minus depreciation in the period, repairs not charged, inspections, hire-in for that item and
  losses at replacement value.
- Payback per unit and item: revenue since purchase against purchase cost, the date it paid for
  itself, or when it will at the current pace.
- Buy or keep hiring in: per item, hire-in spend over 12 months against the cost to buy (cost
  price, else replacement value) and the months to pay back.
- Coverage: how many units and items have a purchase cost, with a link to fill the gaps.
- A numbers card on the item page: lifetime revenue, payback, use over 12 months, next bookings.
- Tiles: best and worst earners this year, hire-in spend this year.

Ask me before building: how a set's revenue is shared (day price, my default, or replacement
value); the default depreciation months; should profit carry a share of labour (default no)?

Connect: Inventory → Reports, item page, subrentals ("buy instead?" links to the hire-ins),
Overview.

Done when: database tests on fixtures (sets, bulk and serial items, a unit bought mid-period, a lost
unit found again, one hire-in covering two items); help guide "warehouse-equipment-money" with
screenshots; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K6 · Warehouse and upkeep

```
Build ROADMAP step K6: warehouse and upkeep numbers. Read the ROADMAP row, docs/ANALYTICS.md
("K6"), docs/INVENTORY.md (I2, I3, I5, I6) and docs/RESERVATIONS.md.

Scope (Reports → Warehouse):
- Demand against stock per item: the busiest moment booked against what you owned then, days
  short, how often it was hired in; idle stock and "sell?" candidates (no confirmed booking in 12
  months, with book value).
- Suppliers: hire-in spend per supplier, requests confirmed or declined, time to answer.
- Damage and loss: repairs per item and per gig and client, time from reported to repaired, cost
  and how much was charged back; losses per gig and client; inspections due, overdue, and cost.
- Dispatch: per gig, scanned out against planned and back against out, still missing; scans per
  day (warehouse workload); how many days before the gig gear left.
- Tiles: items short in the next 30 days, units in repair, inspections overdue.

Ask me before building: which dispatch steps count as "prepped"; the idle period.

Connect: maintenance, subrentals, dispatch page, Overview; the morning reminders already notify
overdue inspections (don't duplicate).

Done when: database tests (past stock from the ledger, a subrental covering part of a period, an
undone scan left out); help guide "warehouse-numbers"; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K7 · Operations and people

```
Build ROADMAP step K7: operations and people. Read the ROADMAP row, docs/ANALYTICS.md ("K7"),
docs/BUSINESS.md (how time registration, leave and tasks work), docs/DATA_MAP.md and the gig
activity log (gig_activity).

Scope (Reports → Operations):
- Activity: gigs and gig days per month by status and type; the busiest days; how far ahead gigs
  are booked.
- People: crew days and hours per person (staff and freelancers); overtime, night, weekend and
  holiday hours; planned against approved hours; how long approvals take; staff utilisation
  (booked working days against working days after leave and holidays); leave taken and left; the
  share of crew days done by freelancers.
- Staffing: positions filled and open by gig date; time to fill (from the activity log); crew-call
  answers (accepted, declined, none) and time to answer; job posts (applications, filled).
- Tasks: open, overdue and done on time, per person and per gig.
- Gig wrap-up: a printable page per gig after it ends: planned against actual hours and costs
  (money only for those who see it), damage, losses and missing items, open tasks and notes.
- A person page for admins: their days, hours and cost with the organisation.
- Tiles: crew days this month, open positions in the next 14 days, overdue tasks, hours waiting
  for approval.

Ask me before building: per-person figures for admins only (my default) or members too; what the
wrap-up page shows; a "cancelled" status so cancellations can be counted?

Connect: Crew tab, tasks, gig page (wrap-up link once the gig has ended), Overview, DATA_MAP.md.

Done when: database tests (crew and viewers can't call it; per-person data only for whom I chose);
help guide "pm-operations"; a DATA_MAP.md row for per-person reports; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K8 · Crew numbers

```
Build ROADMAP step K8: crew numbers in My work. Read the ROADMAP row, docs/ANALYTICS.md ("K8",
"Decided"), docs/NAVIGATION.md (My work), docs/BUSINESS.md (crew rates, time registration,
expenses, the step 27 plan) and src/components/gig/LabourCost.jsx (LabourCost and MyFee).

Scope:
- My numbers (My work): gigs, days and hours (approved and waiting), overtime, per company and
  month; earnings from agreed fees and approved hours × fee; upcoming booked earnings; travel km
  and time; busiest months; functions worked; job posts applied to (shortlisted, accepted); crew
  calls answered.
- Fee paid: marking a person's fee paid in the labour panel records an expense linked to that fee
  (step 9b) with its date, and the person is notified; the person sees only "paid on <date>" for
  their own fees (through a function, never the organisation's expenses) and can mark it
  received. The organisation gets a "crew to pay" list and K3's tile.
- Reimbursements owed to the person, if expense claims were built in 9b.
- Year statement per company: fees, hours and km for a year, as CSV and a printable page, for the
  tax return. The same monthly summary is what step 27 uses for the "recibo verde".
- Tiles on My work: earned this month, not yet paid, next booked days.

Already decided: AVX work only (D25: work outside AVX comes after the launch, K12); only the
person's own rows; companies show only their name (my_gig_companies); nothing about other crew.

Ask me before building: may crew mark "received"?; the year statement's layout.

Connect: My work, labour cost panel (paid), My fee, K3's crew-to-pay tile; step 27 reuses the
monthly summary (name its function in docs/BUSINESS.md "Planned → 27").

Done when: database tests (a person never sees another's fee or hours; a company sees only its own
paid marks); unit tests; help guide "crew-numbers" with screenshots for Carla; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K9 · Report extras (optional)

```
Build ROADMAP step K9: report extras, only those I pick. Read the ROADMAP row,
docs/ANALYTICS.md ("K9"), docs/EMAIL.md and, for the accountant link, how quote links work
(token hashing, supabase/functions/quote-public).

Ask me first which of these to build:
- a weekly key-numbers email to admins (opt-in), through the email summary and Brevo;
- saved views (a report with its filters) per person, pinned to the Overview;
- a monthly management pack as a PDF (overview, money, sales, equipment), with jsPDF;
- a read-only link for the accountant (token, expiry, revocable).

Connect: email summary, Overview, notification settings.

Done when: tests for what is built (the link: expired and revoked show nothing, and a security
review section); help; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S07 · Step 13: A1 speaker library

```
Build ROADMAP step 13: A1, the speaker library. Read the ROADMAP row, docs/TOOLS_PLAN.md §6 (A1),
docs/FIELD_TOOLS.md (F4), src/lib/systemCalc.js and src/components/tools/SystemCalcTool.jsx, and
the catalogue item fields (docs/INVENTORY.md I1).

Scope:
- Catalogue items get speaker specs: sensitivity, max SPL, nominal dispersion H×V, frequency
  range, impedance, weight, amplifier channels per cabinet, power draw.
- Rigging data for RG3: centre of gravity, pickup points, the manufacturer's bumper/frame limits.
- Presets for common models, typed from the manufacturers' datasheets with the source noted.
- Import presets in the import wizard.

Already decided: data only from manufacturers' datasheets; never derived.

Ask me before building: which brands and models to preset first (the ones I own or rent most)?

Connect: the F4 sound system calculator uses the specs (sensitivity, max SPL, dispersion) instead
of typed numbers; later P1 (power) and RG3 (arrays) read the same fields; the import wizard (new
fields guessed, and a FIXES entry for any new reason a row can be refused, IM1).

Done when: unit tests; help hints on the new fields; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S08 · Step 14: MVR/GDTF import and MVR export

```
Build ROADMAP step 14: MVR and GDTF for the light plot and DMX patch. Read the ROADMAP row,
docs/FIELD_TOOLS.md (F2 DMX patch, F3 light plot), src/lib/lightPlot.js and the import wizard
(docs/SWITCHING.md).

Scope:
- Import an MVR file (Vectorworks, grandMA, Capture…): fixtures with type, mode, footprint,
  position and DMX address into the gig's light plot and DMX patch, matched to catalogue items
  where possible (ask the user to match the rest).
- GDTF fixture types: weight, power, modes and footprints into the catalogue item.
- Export the gig's light plot and patch as MVR.
- Parse in the browser (fflate is already a dependency); no new package without my yes.

Ask me before building: which programs do I or my clients use, and can I share a sample MVR file
to test with?

Connect: catalogue (weights and power for P1 and RG1), light plot, DMX patch, gig equipment; the
import fix panel (IM1) for fixtures that need matching to catalogue items.

Done when: unit tests with a small sample MVR/GDTF; the round trip (import → export → import) keeps
fixtures and addresses; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S09 · Step 15a: P1 power distribution

```
Build ROADMAP step 15, first part: P1 power distribution. Read the ROADMAP row and
docs/TOOLS_PLAN.md §4 (P1, and the LumiStage comparison), then src/lib/lightPlot.js (power
estimate today), and the speaker specs from A1 and the fixture data from step 14.

Scope (TOOLS_PLAN §4 P1):
- Electrical fields on catalogue items (watts max and typical, power factor, inrush, connectors;
  for distros: inputs and outputs with connector, phase, breaker, RCD), also in import presets.
- A power tool on the gig:
  - the supply (generator or venue: voltage, phases, amps per phase), distros and outputs;
  - loads assigned from the light plot, DMX patch, sound system and the gig's equipment;
  - current per phase and per output, neutral current, breaker headroom (warn at 80 %), phase
    balance;
  - a generator size suggestion with a margin;
  - loads typed by hand with watts and phase (catering, bars, site office), so the whole supply is
    planned (TOOLS_PLAN "Decided (2026-11-03)");
  - a status per distro and load: connected, partly, not connected (words and icons, not colour
    alone);
  - a printable report labelled as an estimate for a qualified electrician.

Ask me before building: supply defaults for Portugal (230/400 V, 50 Hz), and which connectors
and distros I own.

Connect: light plot power estimate (now from the tool), gig files (the report), On-site mode
(read-only view), the import wizard (electrical columns guessed; FIXES entries for new reasons, IM1).

Done when: unit tests for the electrical maths (single and three phase, unbalanced neutral); help
guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S10 · Step 15b: P2 cables

```
Build ROADMAP step 15, second part: P2 cables. Read docs/TOOLS_PLAN.md §4 (P2) and how P1 was
built (its "How … works" section).

Scope:
- Cable runs between distros and loads: length, cross-section, type, how it's laid.
- Voltage drop (warn above 3–5 %) and current capacity.
- A cable list (power, DMX, speaker, signal) added to the gig's equipment.
- An automatic phase-balancing suggestion, and a second choice that fills each output up to a
  reserve (e.g. 80 % of the breaker); every suggestion shown before it is applied.
- Inrush groups that flag where many fixtures power on at once.

Ask me before building: the cable types and lengths I stock (so the list maps to catalogue items).

Connect: gig equipment and packing list, power report, labels (U5: distro and cable labels).

Done when: unit tests for voltage drop and capacity; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S11 · Step 16: e-signature

```
Build ROADMAP step 16: e-signature. Read the ROADMAP row and docs/BUSINESS.md "Planned → 16", then
how quotes are accepted today (quote-public function, docs/QUOTES.md) and the warehouse packing
list (docs/INVENTORY.md I3).

Scope:
- A signature pad (finger or mouse), stored privately as an image with signer name, time and the
  SHA-256 of the document signed.
- A signed PDF kept with the record.
- Used for:
  - quote acceptance (optional drawn signature next to the typed name);
  - delivery notes / packing slips on site (the client signs on the phone);
  - later crew contracts (step 27) and the rigger's sign-off (RG4).
- A plain electronic signature, not qualified; the terms will say so.

Ask me before building: is a drawn signature enough for my clients, or do some need a qualified
signature (Chave Móvel Digital / Cartão de Cidadão)? If so, that becomes a later integration.

Connect: quotes, packing lists, gig files (signed PDFs), privacy notice and data map (signatures
are personal data).

Done when: database tests; signatures can't be changed after signing; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S12 · Step 17a: RG1 weights, points and hoists

```
Build ROADMAP step 17, first part: RG1. Read the ROADMAP row, docs/TOOLS_PLAN.md §5 ("What it
must respect", RG1, "Prompting from other tools", Decided Q3 and Q4), src/lib/lightPlot.js
(weights per position) and docs/PENDING.md D15 (hoist brand).

Scope:
- A rigging tool on the gig:
  - truss lines with their load: fixtures from the light plot, truss self-weight, cable allowance
    per metre, motors, accessories, a dynamic/safety allowance;
  - hang points along each line;
  - reactions per hoist for a continuous beam on 2+ supports, with uneven loads and cantilevers (a
    small structural solver, unit tested against hand calculations);
  - a hoist WLL check by class (D8, D8+, C1), including whether the class may hang over people.
- Hoist models: the 0.5, 1 and 2 t models of the brand I confirm in D15, from the manufacturer's
  data sheets with the source noted; anyone can add another from its data plate.
- Every result labelled as an aid that a competent rigger must check.

Already decided: WLL only as the manufacturer states it, never derived; sign-off comes in RG4.

Ask me before building: D15 if still open; the default cable allowance and dynamic factor.

Connect: light plot ("Rigging: not checked" on positions with weights, coloured when overloaded),
Tools tab suggestion when hoists are on the gig.

Done when: solver unit tests (simply supported, continuous, cantilever, point and distributed
loads); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S13 · Step 17b: RG2 truss tables, bridles, hardware

```
Build ROADMAP step 17, second part: RG2. Read docs/TOOLS_PLAN.md §5 (RG2, Decided Q3),
docs/TRUSS_DATA.md, src/lib/trussTables.js, src/data/truss/ and docs/PENDING.md D12–D13.

Scope:
- Truss types from the manufacturers' load tables:
  - a pass/fail per span for UDL, CPL, TPL, QPL and deflection, using only tables whose status is
    "checked";
  - each report shows which table and edition it used.
- A review screen where a second person checks a table row by row against its source document and
  marks it checked (name, date); blocked tables stay unusable.
- A bridle calculator (two legs to a pick point): leg lengths, angles, tension per leg, a warning
  above 120°, horizontal force on the beams. Also as a pocket tool (My work → Tools).
- A rigging hardware list: shackles, slings, steels and spansets with their WLL.

Ask me before building: should checks be stored in the database (per organisation, or by AVX for
everyone) or stay in the repo's JSON as now? Any answers from the manufacturers (D13)?

Connect: RG1 lines (truss type per line), pocket tools, gig equipment (hardware).

Done when: unit tests for bridle maths and table look-ups (interpolation never extrapolates past
the table); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S14 · Step 18: RG3 line arrays

```
Build ROADMAP step 18: RG3 line arrays. Read docs/TOOLS_PLAN.md §5 (RG3), the A1 speaker data
(rigging fields), src/lib/systemCalc.js (F4) and how RG1 was built.

Scope:
- An array as a number of elements with splay angles (from the system calculator).
- Outputs:
  - total weight;
  - front and rear point loads and pull-back;
  - bumper position and tilt;
  - pass/fail against the manufacturer's bumper limits;
  - a side-view drawing.
- The limits always come from the manufacturer's data; where a manufacturer's own tool exists, the
  report says that tool decides.

Ask me before building: which arrays to support first (the models from A1).

Connect: sound system calculator, RG1 points (the array hangs from them), gig equipment.

Done when: unit tests against a manufacturer's published example; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S15 · Step 19: RG4 rigging plot, report and sign-off

```
Build ROADMAP step 19: RG4. Read docs/TOOLS_PLAN.md "Decided" (Q4, rigger sign-off) and §5 (RG4),
how RG1–RG3 and e-signature (step 16) were built, and the job board (docs/CREW_NETWORK.md N3).

Scope:
- A top view with points, hoists, bridles and truss lines.
- A per-point table: load, hoist, class, WLL, % used. Totals per beam or roof zone against the
  venue's capacities.
- The rigging report as print/PDF with its assumptions and sources.
- Catalogue lines (hoists, truss, shackles, steels) offered to the gig's equipment.
- "Checked by" sign-off (Q4, decided):
  - a named rigger, their certificate from their crew profile, the date, signed with step 16;
  - until signed, the plot and report carry a visible warning;
  - with no rigger, suggest a job post for a certified rigger, prefilled;
  - if every warning is dismissed, show the liability disclaimer.
- Engineer's pack (D33): one download with every input (positions, weights, points, hoists, truss
  types and the table edition used, bridles), the results and the plot, so a certified engineer
  can check it without re-entering anything; "Send to an engineer" shares it through a
  supplier-style link.
- Measured loads (TOOLS_PLAN "Decided (2026-11-03)"): the rigger types the load-cell reading per
  point on site and sees it next to the planned load, with a warning above the hoist's WLL or more
  than a set percentage over the plan.

Connect: gig files (the report and the pack), On-site mode (read-only plot, measured loads), job
board prefill, the QR on prints (U6), the terms (disclaimer wording to review).

Done when: database tests for sign-off (who can sign, can't edit after); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S15b · Step 19b: TradeShowLoads export

```
Build ROADMAP step 19b: TradeShowLoads export (docs/PENDING.md D34). Read docs/TOOLS_PLAN.md
"Decided (2026-11-03)" and how RG4 was built.

First: find out whether the .tsle file format is published or openly documented. If it isn't,
stop, tell me what you found and who to ask, and build nothing.

Scope (only if the format is open):
- Export the rigging plan's hang points as a .tsle file: fair, hall, booth and company typed in;
  each point with its name, position and load from RG4.
- The export uses the same checked numbers as the report and carries the same "aid, to be checked"
  wording.

Connect: rigging report, gig files.

Done when: unit tests that the file matches the format's examples; help entry; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S16 · Step 20: RG5 suggestions, P3 one-line and on-site power

```
Build ROADMAP step 20: RG5 and P3. Read docs/TOOLS_PLAN.md §4 (P3) and §5 (RG5), and how RG4 and
P1–P2 were built.

Scope:
- RG5: when a rigging check fails, suggest fixes (move a point, add a point, a bigger hoist, a
  stronger truss type, spread a bridle), each re-checked before it's shown.
- P3:
  - a one-line diagram of the power tree, with the data chain (which fixture feeds which, through
    which splitter or node) from the DMX patch;
  - a move-loads grid for on-site changes (outputs down the side, loads across, tap to move, phase
    totals update at once);
  - views per area and per department;
  - an on-site checklist of what plugs into what, ticked off on the phone, offline.

Connect: On-site mode (both checklists), rigging and power reports.

Done when: unit tests (every suggestion passes the same checks); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S16b · Step 20b: work areas

```
Build ROADMAP step 20b: work areas (docs/PENDING.md D35). Read docs/TOOLS_PLAN.md "Decided
(2026-11-03)", docs/BUSINESS.md (tasks T1–T2), how On-site mode, the light plot positions, P3 and
RG4 were built, and how U5 (labels) and U6 (QR on prints) work.

Scope:
- A work area on a gig groups light-plot positions, power and rigging items and gig equipment
  (a truss, FOH, a tower, stage left).
- Each area is a task: people, an estimated build time, build instructions, notes; status
  upcoming, active, done.
- A printed sheet per area with what goes there, who builds it and a QR that opens the area.
- Progress per area and for the whole gig in On-site mode, offline like the other checklists.

Ask me before building: how areas are made (by hand, or suggested from positions), and the
migration outline.

Connect: tasks, light plot, power and rigging plots, On-site mode, labels (area on case labels),
prints, the activity feed.

Done when: database tests for who can see and change areas; help guide and screenshots; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K10 · Safety and compliance (only if D27 is yes)

```
Build ROADMAP step K10: safety and compliance. Check docs/PENDING.md D27 first: if I haven't said
yes, stop and ask me. Read the ROADMAP row, docs/ANALYTICS.md ("K10"), docs/INVENTORY.md I5
(inspections), docs/CREW_NETWORK.md N4 (certificates), and how RG4's sign-off, P3's on-site power
checklist and e-signature were built (docs/TOOLS_PLAN.md §4–5, docs/BUSINESS.md 16).

Scope (Reports → Safety):
- Gear: inspections due, overdue and failed; units booked on upcoming gigs whose inspection will
  be overdue by then (and a ⚠ on the gig's Equipment tab, never a block).
- People: crew on upcoming gigs whose certificates (from the profiles they share) expire before
  the gig; the certificates each function needs, as I set them.
- Gigs: rigging sign-offs missing or pending, on-site power checklists not done, documents not
  signed (crew contracts, delivery notes), damage reported on site.
- A printable safety pack per gig: inspection dates of the gear going, rigging sign-off, power
  checklist, crew certificates.
- Tiles: booked gear with an overdue inspection, unsigned rigging in the next 7 days.

Already decided: rigging and power results are aids that a competent person must check; the pack
says so.

Ask me before building: which certificates each function needs; who sees crew certificates in the
pack (the gig's managers only?).

Connect: Equipment tab (⚠), maintenance, crew profiles, rigging report, power checklist, gig files
(the pack can be saved there), Overview.

Done when: database tests (certificates only from profiles the organisation may see; crew don't see
others' certificates); help guide "pm-safety"; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S17 · Step 21: A2 coverage map, A3 prediction and measurement files

```
Build ROADMAP step 21: A2 and A3. Read docs/TOOLS_PLAN.md §6 (A2, A3 and why we don't copy EASE),
the A1 data and src/lib/systemCalc.js.

Scope:
- A2: a plan view of the venue with SPL estimates from point sources with nominal dispersion
  (inverse square, air absorption per band) for fills, delays and small systems. Labelled
  "estimate, not a simulation"; line arrays shown only as aim lines and splays.
- A3:
  - attach prediction files (EASE, ArrayCalc, Soundvision) and measurement files (Smaart/SysTune,
    EQ) to the gig's system, versioned, with notes;
  - a "system tuning sheet" print: delays, EQ, gains and splays as built.

Connect: gig files, sound system calculator.

Done when: unit tests for the SPL maths; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S18 · Step 21b, part 1: A4 3D venue

```
Build ROADMAP step 21b, A4 part 1: the 3D venue. Read docs/TOOLS_PLAN.md §6 "Our own simulator"
(levels L0–L3, A4) and how RG1, RG3 and A2 were built.

Scope:
- A simple 3D venue: audience planes and walls, drawn in AVX or traced over an imported plan.
- The rigging points from RG and the arrays from RG3 placed in it.
- Saved per gig.
- No sound computation yet.

Ask me before building: is a 3D library (e.g. three.js) acceptable as a new dependency? Propose it
and wait for my yes.

Connect: rigging plot (points), arrays, A2 map (same venue).

Done when: unit tests for the geometry; works on a laptop and is viewable on a phone; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S19 · Step 21b, part 2: A4 direct-field engine (L1)

```
Build ROADMAP step 21b, A4 part 2: the L1 direct-field engine. Read docs/TOOLS_PLAN.md §6 (L1, what
makes it hard) and how the 3D venue was built.

Scope:
- A coherent direct-field engine in a background worker (bands 63 Hz–16 kHz): each element
  modelled from its physical size, added with distance, delay and level.
- SPL and frequency-response maps on the audience planes; sub arrays and cardioid subs.
- Every result labelled L1 (±3–6 dB, worst at high frequencies), with what it ignores.

Done when:
- unit tests against analytic cases (a single piston, two sources' interference);
- a short validation note comparing a known system with a manufacturer's tool, published with the
  results;
- PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S20 · Step 21b, part 3: A5 measured directivity (L2)

```
Build ROADMAP step 21b, A5: measured directivity. Read docs/TOOLS_PLAN.md §6 (L2, GLL is closed)
and how the L1 engine was built.

Ask me first: which manufacturers publish directivity data in an open format or would give
permission, and whether I've asked any.

Scope:
- Import open directivity data (balloons per 1/3 octave, ideally with phase) per cabinet where
  allowed; the engine uses it.
- A validation report against reference systems; results labelled L2.

Done when: unit tests for the import and interpolation; validation report in docs; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S20b · Step 21b, part 4: A6 room estimate (L3)

```
Build ROADMAP step 21b, A6: the room estimate. Read docs/TOOLS_PLAN.md §6 (L3).

Scope:
- Surface materials on the 3D venue.
- RT60 (Sabine and Eyring), critical distance and an STI estimate per area, shown as a room summary
  beside the direct-field map.
- Labelled as a statistical estimate. Never ray tracing.

Done when: unit tests against textbook examples; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S21 · Step 22: shareable rider / advance page

```
Build ROADMAP step 22: the shareable rider / advance page. Read docs/BUSINESS.md "Planned → 22",
docs/FIELD_TOOLS.md, and how quote links work (token hashing, supabase/functions/quote-public).

Scope:
- A public, read-only, printable link per gig: a random token (only its hash stored), expiry,
  revocable.
- It shows what the PM chooses: stage plot, input list, patch, power and rigging summaries,
  schedule, contacts.
- From StageKit:
  - start the input list, mixes and stage plot from the line-up (band members and their
    instruments);
  - a readiness check before sending (missing inputs, no power plan, unsigned rigging…).

Connect: field tools, power and rigging reports, gig files, messaging (send the link).

Done when: database or function tests (expired and revoked links show nothing); security review of
the public endpoint; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S22 · Step 22b: venue pages (only if D14 is yes)

```
Build ROADMAP step 22b: venue pages. Check docs/PENDING.md D14 first: if I haven't said yes, stop
and ask me. Read docs/TOOLS_PLAN.md "Proposed, to confirm".

Ask me before building:
- private to each organisation, or shared between organisations (then: who may edit, and how
  wrong data gets corrected)?

Scope:
- One page per venue: stage size, capacity, installed equipment, rigging points and limits, power
  supply, documents, contacts by role, access hours, photos.
- A gig at the venue fills its address, call sheet, power supply (P1) and rigging points (RG1)
  from it.

Connect: gigs, call sheet, power tool, rigging tool, rider page.

Done when: database tests for the chosen sharing model; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S23 · Step 23: vehicles and transport, appointments

```
Build ROADMAP step 23: vehicles, transport and appointments. Read docs/BUSINESS.md "Planned → 23"
and docs/RESERVATIONS.md (the reservations engine was built for this).

Scope:
- Vehicles as bookable resources: plate, capacity (kg, m³), licence needed.
- Trips on a gig: out and back, vehicle, driver, times.
- The packing list split per vehicle, with weight against capacity, and a suggestion that splits it
  across the chosen vehicles by weight and volume (cases kept whole), which the planner can change.
- Clashes when a vehicle or driver is double-booked.
- Appointments: non-gig calendar items (site visit, meeting, warehouse day) with people, shown in
  calendars, clashes and the calendar feed.
- Costs: running cost per km and per day on each vehicle, and km on each trip, so transport cost
  goes into gig_finance (step 10); expenses (9b) can link to a vehicle (fuel, tolls, repairs).
- A vehicle-use report in the Reports area with the K1 parts (trips, km, days used, load against
  capacity): the vehicle part of the old step 24.

Ask me before building: my vehicles and whether drivers need a licence category check.

Connect: packing lists, scanning out per vehicle, calendars, calendar feed, time registration
(driving hours), gig finance, expenses, Reports.

Done when: database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K11 · Sustainability report (only if D28 is yes)

```
Build ROADMAP step K11: the sustainability report. Check docs/PENDING.md D28 first: if I haven't
said yes, stop and ask me. Read the ROADMAP row, docs/ANALYTICS.md ("K11"), and how time
registration (km), P1 power and vehicles and trips were built (docs/BUSINESS.md 8 and 23,
docs/TOOLS_PLAN.md §4).

Scope (Reports → Sustainability, and per gig):
- Transport: km per trip and vehicle (with its fuel type), crew travel km, tonne-km of gear moved.
- Energy: the power plan's estimated kWh per gig, from the grid or a generator.
- Estimated emissions from a named, dated set of published emission factors (stored with their
  source and version, editable per vehicle), per gig and per period.
- A per-gig summary for clients and festivals (printable), labelled as an estimate with its method.

Ask me before building: which emission-factor source (e.g. Portugal's APA, the EU's EEA or the UK's
DESNZ factors); whether clients have asked for it, and in what format.

Connect: trips, power plan, gig files, Reports.

Done when: unit tests against the source's worked examples; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S24 · Step 24: reports (covered by the K steps)

```
Step 24 is covered by the dashboards and analytics pack: K1–K8 (docs/ANALYTICS.md) and step 23's
vehicle-use report. There is nothing to build here: if one of its reports is still missing, add it
to the K step it belongs to.
```

## S25 · Step 25: gig templates

```
Build ROADMAP step 25: gig templates. Read docs/BUSINESS.md "Planned → 25" and the "How … works"
sections of everything a gig holds (tasks, statuses, custom fields, field tools, equipment).

Scope:
- Save a gig as a template, or start a new gig from one.
- What a template holds:
  - schedule (relative days and times), positions, equipment, tool data (plots, patches);
  - tasks, custom fields, status and type.
- Dates shift to the new gig's start.

Connect: every gig feature listed; the new-gig form.

Done when: unit tests for date shifting; database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S26 · Step 26: client portal, online booking requests

```
Build ROADMAP step 26: the client portal and online booking requests. Read docs/BUSINESS.md
"Planned → 26", how quote links and guest threads work (docs/QUOTES.md, docs/MESSAGING.md M4b),
and how invoices were built.

Scope:
- Portal: one link per client (token) with their quotes, invoices, shared documents and
  conversations.
- Booking requests: a public form per organisation for dry hire. The visitor picks catalogue items
  and dates and sees indicative availability; sending creates a draft quote and a notification.
  Spam protection.

Ask me before building: which items may be offered publicly, and should prices show?

Connect: quotes, invoices, guest threads, availability, contacts, the client's balance (K3).

Done when: security review of both public surfaces; database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S27 · Step 26b: M5b email replies

```
Build ROADMAP step 26b: M5b, email replies. Read docs/MESSAGING.md (M5b, M4b) and docs/EMAIL.md.

Ask me first: inbound email needs a receiving address on my domain (Brevo inbound parsing or
another service); have I set it up?

Scope:
- Reply by email to the summary and land in the conversation.
- Email clients and suppliers when someone answers them, with a reply-to that threads back.

Connect: email summary, guest threads, notifications.

Done when: the inbound function checks signatures and rate-limits; tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S28 · Step 27: freelancer side

```
Build ROADMAP step 27: contracts, freelancer invoicing and work history. Read docs/BUSINESS.md
"Planned → 27", docs/CREW_NETWORK.md, and how crew calls, time registration and e-signature were
built.

Scope:
- Contracts generated from an accepted crew call or job offer (dates, fee, terms), signed by both
  (step 16).
- Freelancer invoicing: a monthly summary of approved hours and fees per company, for issuing a
  "recibo verde" on the AT portal (AVX never issues it).
- Work history on crew profiles: gigs done on AVX, shown only with the company's permission.
- Freelancer invoicing and the work-history counts reuse K8's monthly summary (docs/ANALYTICS.md
  "How K8 works").

Ask me before building: a Portuguese "prestação de serviços" template to start from, and whether
a lawyer should review it.

Connect: crew calls, job board, crew profiles, time registration.

Done when: database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S29 · Step 28: public API and webhooks

```
Build ROADMAP step 28: the public API and webhooks. Read docs/BUSINESS.md "Planned → 28",
docs/SECURITY_REVIEW.md and the edge functions' permission pattern (CLAUDE.md Database).

Scope:
- API tokens per organisation with scopes (hashed, revocable, last used).
- Read endpoints: gigs, schedule, crew, equipment. Write: availability.
- Webhooks on gig, quote and crew changes, with signed payloads and retries.
- Rate limits and an audit log.
- Public documentation of the API.

Ask me before building: the first integration I want (accounting sync, payroll export, the
cueing app, an MCP server)? It decides which endpoints come first. Should the report functions
(K1–K8) get read-only endpoints?

Connect: settings (token management), the data map (who receives data), the security review.

Done when: tests for scopes and rate limits; a security review section added; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S30 · Step 29: R3 cueing-app bridge

```
Build ROADMAP step 29: R3. Read docs/TOOLS_PLAN.md §2 (R3, Decided Q2), "How R1 works" and the
public API from step 28.

Scope:
- Cue labels from a cue list.
- The JSON export/import shared with the standalone cueing app (format avx-rehearsal, version
  bump).
- Markers export for editing and DAW tools.
- The live link through the API ("Sign in with AVX").

Ask me before building: the cueing app's current state and what it needs first.

Connect: rehearsal companion, tasks, API.

Done when: unit tests for the formats; PR open; the cueing app's own roadmap started in a doc if I
ask.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S31 · Step 30: rental network, RFID

```
Build ROADMAP step 30: the rental network between AVX companies. Read docs/BUSINESS.md
"Planned → 30" and docs/INVENTORY.md I6 (cross-hire codes).

Scope:
- Companies that opt in see each other's available stock (prices only if shared).
- A subrental request in two clicks.
- RFID only if I have a hardware partner; otherwise leave it planned.

Ask me before building: opt-in per item or per category; who sees what.

Connect: subrentals, availability, crew network trust (verified companies only?).

Done when: database tests for visibility; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

---

## Upkeep sessions (any time, small)

### U1 · Organisation time zone

```
Upkeep U1: an organisation time zone (docs/PENDING.md D10). Today everything is read as Lisbon
time. Grep for 'Europe/Lisbon' and time_zone in src/ and supabase/.

Scope:
- Make organisations.time_zone a real setting in organisation settings.
- Use it everywhere gig days, bookings, clashes, the calendar feed, the email summary and
  reminders are computed.
- Keep Lisbon as the default.
- Report periods (K1) already read organisations.time_zone: add a check with a non-Lisbon
  organisation.

Ask me before building: confirm the migration outline.

Done when: unit and database tests with a non-Lisbon organisation (e.g. Europe/London,
America/New_York); PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### U2 · Dependency upgrades

```
Upkeep U2: upgrade React Router 6 → 7 and Vite and Vitest to current versions
(docs/SECURITY_REVIEW.md, A06). Propose the exact versions and wait for my yes.

Scope:
- Follow each project's migration guide.
- Change only what the upgrade needs.
- Run npm audit before and after.

Done when: npm run check and the e2e tests pass; npm audit shows no advisories in shipped
packages; SECURITY_REVIEW.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### U3 · Data map open items

```
Upkeep U3: the open items in docs/DATA_MAP.md.

Scope:
- A nightly clean-up that keeps crew_search_log for 30 days and read notifications for 12 months.
  Deletion runs from a hand-run or scheduled function, never through the connector (CLAUDE.md).
- A time limit or reminder for held invitations that were never sent.
- Update DATA_MAP.md and the privacy notice.

Ask me before building: the retention periods, and approve the migration outline. Rewriting the
privacy notice needs my yes too.

Done when: tests; DATA_MAP.md open items updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### U4 · Truss tables

```
Upkeep U4: truss tables (docs/PENDING.md D12, D13; docs/TRUSS_DATA.md).

Ask me for:
- which tables I have checked against their source documents, and what differed;
- any replies from Fantek or Global Truss.

Scope:
- Mark the checked tables as checked (my name, the date).
- Correct or unblock tables from the manufacturers' answers.
- Rebuild with scripts/truss-data/ so the data stays reproducible.

Done when: src/lib/trussTables.test.js passes; TRUSS_DATA.md and PENDING.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### U5 · Label templates

```
Upkeep U5: label templates (docs/PENDING.md D31). Read docs/TOOLS_PLAN.md "Decided (2026-11-03)"
(label sizes), docs/INVENTORY.md (QR labels), src/pages/LabelsPage.jsx and the label sizes in
src/lib/inventory.js.

Scope:
- Three sizes, not tied to any printer brand:
  - small 50 × 25 mm (roll 50 × 25 mm; A4 sheet 52.5 × 29.7 mm, 40 per sheet);
  - medium 100 × 50 mm (roll 100 × 50 mm; A4 sheet 105 × 57 mm, 10 per sheet);
  - large A6 / 4 × 6 in (roll 102 × 152 mm; A4 sheet 105 × 148 mm, 4 per sheet).
  Each layout fits inside both its roll and its sheet size.
- Three ways to print each: a roll (one label per page), pre-cut A4 sheets, or plain A4 / US
  Letter with cut lines. The two sheet layouts in use today are replaced.
- What goes on a label, per size, from a short list: name, code, QR, organisation, gig, case
  contents, a department colour band with its name printed (never colour alone). Saved per
  organisation as templates.
- Labels for items, units and cases now; distros and cables once P1–P2 exist.

Ask me before building: the default fields per size, and the migration outline if templates are
stored in the database.

Done when: unit tests for the layout maths (how many fit, margins, roll pages); a print check at
each size in both languages; help guide and screenshots updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### U6 · A QR and print date on every print

```
Upkeep U6: a QR and print date on every print (docs/PENDING.md D32). Grep for the print routes
in src/App.jsx (/gig/:id/inputs, /plot, /patch, /dmx, /lights, /system, the call sheet).

Scope:
- A small QR in a corner of every print that opens the same page live in AVX, with "Printed
  <date, time>" beside it.
- Opening the link needs the same access as the page; no public links.
- One shared print-footer component, so later prints (power plan, rigging report, work areas)
  get it by using it.

Done when: unit test for the link builder; e2e check that each print shows the QR; help entry;
PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

---

## QA bot (any time, in order)

Plan and setup steps: [QA.md](QA.md). Each prompt tells you which setup to do first.

### QA1 · Foundations

```
QA bot step QA1: foundations (docs/QA.md, "Fixed tests on every PR" and "QA accounts and the QA
tag"; my setup is "Setup A"). Read docs/QA.md and docs/TESTING.md.

Scope:
- e2e/helpers/app.js: move the shared helpers out of e2e/auth/journey.spec.js (sign up, sign in,
  English, accessibility check, delete account); add an init script that sends the "do not track"
  signal src/lib/usage.js respects.
- e2e/helpers/inbox.js (Mailosaur API with fetch: new address, wait for an email, return its links
  without printing them) and e2e/helpers/totp.js (two-step codes with Node's crypto).
- scripts/qa/seed.mjs and scripts/qa/cleanup.mjs on the test project: the QA admin and QA crew
  accounts, a fresh "AVX QA run <id>" company with realistic data, removal through the app; cleanup
  also clears old e2e-… leftovers (PENDING F8, D21).
- scripts/qa/run-sql-tests.sh and a sql-tests job in .github/workflows/ci.yml (psql 17 as in
  backup.yml, refuse production, on when SQL_TESTS_ENABLED is 'true', environment test-project).
- .github/pull_request_template.md with a "How to test" section; one line in CLAUDE.md step 5 to fill
  it.

Ask me before building: confirm Mailosaur as a new outside service; check Setup A is done and tell
me exactly what's missing.

Done when: the inbox helper receives a password-reset email from the test project; sql-tests runs
all 57 files (list any that fail because their migration isn't on test); npm run check and the
signed-in tests pass; TESTING.md and QA.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### QA2 · Live checks and the QA tag

```
QA bot step QA2: live checks after each merge, a daily real sign-up, and the QA tag (docs/QA.md,
"Live checks after merge and daily" and "QA accounts and the QA tag"; my setup is "Setup B").

Scope:
- The QA tag migration and supabase/tests/qa_accounts.sql, as outlined in QA.md; docs/USAGE.md
  queries use the new summary views.
- vite.config.js writes version.json (version and commit); vercel.json marks it no-cache.
- playwright.config.js: a LIVE=1 mode (e2e/live, the live URL, no local server).
- e2e/live/after-deploy.spec.js and e2e/live/daily-signup.spec.js.
- .github/workflows/live-check.yml: push to main (wait for the merged commit) and daily; environment
  live-check; on failure one PR comment and one qa-bot + needs-triage issue per failing check.
- A step-by-step guide for me to create the live QA account.

Ask me before building: the migration outline; then walk me through Setup B at the right moments.

Done when: qa_accounts.sql passes on test; a manual live-check run and a manual daily run pass;
private.platform_summary shows the same numbers as before and private.qa_summary only the live QA
account; QA.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### QA3 · The AI tester

```
QA bot step QA3: the AI tester on each PR before merge (docs/QA.md, "AI tester before merge" and
"Safety"; my setup is "Setup C").

Scope:
- .claude/skills/qa/SKILL.md (the rules), qa/areas.md (files → areas → connected areas, routes,
  tests, T-lines), qa/mcp.json (two browsers, admin and crew).
- scripts/qa/context.mjs, scripts/qa/sign-in.mjs, scripts/qa/inbox.mjs.
- .github/workflows/qa-agent.yml: ready PRs and the qa label; the agent job read-only; a separate job
  posts one PR comment; security findings only in an encrypted artifact. Model and turn cap from
  repo variables, never in code.

Ask me before building: yes to anthropics/claude-code-action@v1 and @playwright/mcp (pinned); check
Setup C.

Done when: on a scratch PR with two planted bugs the bot reports both with steps, a clean PR passes,
`/qa` works in a session; time and cost per run written in QA.md; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### QA4 · Catch-up (repeat)

```
QA bot step QA4: catch-up. Take the next area without browser tests, in this order: inventory and
scanning, messaging, crew network, tasks and business, field tools, import (docs/QA.md, "Build
order"; skip areas QA.md marks done).

Scope: run /qa over that area's lines in docs/PENDING.md section 2 on the test project; commit the
checks it confirms as fixed tests in e2e/auth/<area>.spec.js; list what it found; mark the area done
in QA.md. Scanning can use a fake camera feed showing a QR label. Import: only after the import
overhaul's IM2 is merged, and only what IM1–IM2's own browser tests don't cover.

Done when: the new tests pass twice in CI; problems found are listed in the PR; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

---

## Import overhaul (any time, in order)

Plan: [SWITCHING.md](SWITCHING.md), "Import overhaul: fix it here" (decision D38). IM2, IM3 and IM4
need IM1 merged first.

### IM1 · Fix it in the check

```
Import overhaul IM1: fix it in the check (docs/SWITCHING.md, "Import overhaul: fix it here";
docs/PENDING.md D38). Read that section, then CheckStep and DoneStep in src/pages/ImportPage.jsx
and dryRun, buildRows and SERVER in src/lib/importer.js (in ranges).

Scope:
- The Check-step table: problems grouped by cause and value, one choice fixing every row in the
  group, cell errors edited in place and checked again as I type, "leave these rows out" on
  every group. Fixes marked IM3 show as not available yet, with the reason.
- What a fix adds (a location, an item, a contact) shows as "will be added", is listed on the
  Import button and is saved only when I press Import: locations and items through run_import
  (each its own batch for now), contacts as the Contacts page adds them.
- The new predictions in the table, a "left out on purpose" list and the heads-ups.
- The pipeline and the FIXES table as the plan describes, with the test that every reason has an
  entry. The fixes kept by ImportPage, so Back and Next keep them. CheckStep moves to
  src/components/import/.
- No database change.
- Browser tests: if QA1 is merged, use its shared helpers (e2e/helpers/app.js); the import area
  of QA4 then only adds what these tests don't cover.

Ask me before building: anything in the Check-step table I'd change, and principle 6 (groups
nobody decided on are left out).

Done when: unit tests for fixTable, groupProblems, the new predictions and the FIXES coverage; a
signed-in e2e test (an equipment file with an unknown location → add it from the check → import
→ the stock is there); axe clean; a browser check at 320 and 390 px in both languages; the
wh-import help guide and its imp-check screenshot updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### IM2 · Before and after the check

```
Import overhaul IM2: before and after the check (docs/SWITCHING.md, "Import overhaul: fix it
here", the Choose, Match and Done tables). IM1 must be merged. Read ChooseStep, MatchStep and
DoneStep in src/pages/ImportPage.jsx, src/lib/xlsx.js, and parseDate and buildRows in
src/lib/importer.js.

Scope:
- Choose: a sheet picker for workbooks with several sheets; "headings are on row N", suggested;
  a file saved by Excel on Windows noticed and read as Windows-1252, saying so, with a switch;
  more than 5000 rows imported in parts of 5000 (a quote's lines never split); "this looks like
  a … file" with Switch.
- Match: "same for every row" for a field the file doesn't have (it replaces "Where is this
  stock?"); the date order noticed per date column, asked when it can't be told; the columns
  that won't be imported listed; the organisation's custom fields (gigs, clients, suppliers,
  items) offered as places a column can go, their values checked by the field's kind
  (docs/BUSINESS.md, custom fields, "Not yet").
- Done: "fix and try again" for rows the database refused (back to the check with only those
  rows and IM1's fixes); left-out rows downloadable with their original columns and a Problem
  column.
- No database change unless saving custom values through the import needs one (outline it
  for my yes first).
- Browser tests: if QA1 is merged, use its shared helpers (e2e/helpers/app.js); the import area
  of QA4 then only adds what these tests don't cover.

Done when: unit tests (sheets, heading row, text encoding, parts, date order, the left-out
file); e2e for one Choose fix and one Done fix; a browser check at 320 and 390 px in both
languages; the help guide and its imp-choose and imp-match screenshots updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### IM3 · The database part

```
Import overhaul IM3: the database part (docs/SWITCHING.md, "Import overhaul: fix it here",
Parts). IM1 must be merged, and supabase/migrations/20261117000001_import_undo.sql run by hand
(docs/PENDING.md T31): check that undo_import exists on both projects first. Read
20261115000000_import_wizard.sql (run_import and its row functions),
20261117000001_import_undo.sql, 20261119000000_import_jobs.sql and
supabase/tests/import_wizard.sql.

Scope:
- What a fix adds or restores is made in the import's own batch, so one undo removes the import
  and what it added. run_import keeps its signature (create or replace).
- Exact picks: a row may carry the id the check chose (item, location, gig, client), checked to
  belong to the organisation and not archived, used before the code and name lookup, in
  run_import and import_jobs. This turns on "choose which one" for same-named records without
  codes and "add as a new contact".
- Restoring an archived item from the check, logged so undo archives it again.
- Fixes remembered with a saved matching: import_presets.fixes (jsonb, size-limited), applied
  with it.
- Units for an item counted in bulk: "Switch X to per unit" (only while its stock is just the
  opening quantity, which is removed; the units then bring the stock). It removes a stock
  movement, so it is in the hand-run file (SWITCHING.md S4, known limitation).
- Undo refused "in use": say what uses it (the first few, with names) and offer to undo the
  rest. This changes undo_import, which removes records, so it is a hand-run file again.
- The app side: IM1's separate batches for additions folded into the import's batch; the IM3
  fixes switched on.

Ask me before building: the migration outline and the hand-run file, for my yes.

Done when: supabase/tests/import_fixes.sql (and import_undo.sql after the hand-run file) end
with "ALL … CHECKS PASSED" on the test project; the migration applied to production with the
same function bodies; unit tests for the app side; the hand-run steps in docs/PENDING.md; PR
open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### IM4 · Past jobs and decided quotes (history import)

```
Import overhaul IM4: the history import (docs/PENDING.md D26; docs/SWITCHING.md, "Import
overhaul: fix it here", Parts; docs/ANALYTICS.md on year-on-year). IM1 must be merged. Read
20261119000000_import_jobs.sql and 20261210000001_import_gig_client.sql, and dryRun for gigs and
quotes in src/lib/importer.js.

Scope:
- In the check's "left out on purpose" list, past jobs offer "Import as past jobs": they become
  completed gigs with their dates, client and venue (cancelled ones stay out unless I choose
  "Import as cancelled").
- Quotes can come in with their status (accepted, declined) and their dates (sent, decided) so
  the K reports count them; a declined quote can bring its reason when the file has one.
- Past gigs never book equipment or clash with anything, and nobody is notified about them.
- Re-importing still matches by the old number (import_ref), so nothing doubles.

Ask me before building: the migration outline for my yes; how far back to allow.

Done when: supabase/tests/import_jobs.sql extended (past gigs don't book stock, statuses and
dates kept) ends with "ALL … CHECKS PASSED" on test; production applied with the same function
bodies; unit tests for the predictions; help guide; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

---

## End of the build (after S31 and the final test pass)

### P1 · Decisions

```
End of build P1: decisions for the public launch. Read docs/PUBLIC_SITE.md.

Don't build anything. Walk me through the decisions one by one, with a recommendation each:
- tiers and prices;
- per company, per seat or by usage;
- trial length;
- billing and certified invoicing provider;
- domain;
- site technology.
Write the answers into PUBLIC_SITE.md and prompts P2–P5 here.
Finish with the short summary CLAUDE.md asks for.
```

### P2 · Commercial site

```
End of build P2: the commercial site (docs/PUBLIC_SITE.md §2, decisions from P1). A separate
static site in PT and EN with home, features, for crew, switching, pricing, security and privacy,
FAQ, contact/demo form. Propose the structure and technology from P1 and wait for my yes before
creating anything. PR open, never deployed without my yes.
Finish with the short summary CLAUDE.md asks for.
```

### P3 · Plans in the app

```
End of build P3: plans in the app (docs/PUBLIC_SITE.md §4). Plan limits per organisation in the
database, a trial on organisation creation, what's included shown in the app, upgrade screens.
Crew stay free. Outline the migration and wait for my yes. PR open.
Finish with the short summary CLAUDE.md asks for.
```

### P4 · Billing

```
End of build P4: billing (docs/PUBLIC_SITE.md §4). The payment provider and certified invoicing
from P1:
- customer portal;
- upgrades and downgrades;
- failed payments: reminders, a grace period, then read-only, never deletion;
- cancellation with data export.
List the secrets I must add; never ask me to paste keys. PR open.
Finish with the short summary CLAUDE.md asks for.
```

### P5 · Public docs and help

```
End of build P5: public docs and help (docs/PUBLIC_SITE.md §1). A public docs site and FAQ built
from the in-app guides (src/help), one source for every answer. An AI help assistant that answers
only from the docs, cites the guide, says when it doesn't know and offers a contact form. Ask me
which AI provider and budget before building. PR open.
Finish with the short summary CLAUDE.md asks for.
```

---

## After launch

Planned in [ANALYTICS.md](ANALYTICS.md) ("After the launch"), not scheduled: run these once the
public launch has settled.

### K12 · Crew: all income

```
After the launch, step K12: crew, all income. Read the ROADMAP row, docs/ANALYTICS.md ("K12",
"How K8 works") and ask me what freelancers asked for during the beta.

Scope:
- Work outside AVX, private to the person: company, dates, fee, km, notes; counted in My numbers
  and the year statement, marked as typed by them.
- The person's own business costs (fuel, gear, training, insurance) with receipts, reusing the
  expense receipt handling (9b) in a personal space.
- Totals and the year statement covering everything; a mileage log export; amounts kept in the
  currency they were earned in, never added across currencies.
- Labelled as a summary, not tax advice.

Ask me before building: what beta freelancers asked for; any tax-office format worth matching.

Connect: My numbers (K8), year statement, freelancer invoicing (step 27).

Done when: database tests (nobody but the person sees any of it); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

### K13 · Crew-owned gear for hire

```
After the launch, step K13: crew-owned gear for hire. Read the ROADMAP row, docs/ANALYTICS.md
("K13"), docs/INVENTORY.md I6 (cross-hire codes, hire requests) and docs/CREW_NETWORK.md.

Approach to confirm with me first: a freelancer who owns gear runs it as a one-person
organisation (already possible today), so the catalogue, units, availability, QR labels,
cross-hire code and hire requests work unchanged, and companies hire it as a subrental.

Scope:
- A short "I own gear" setup from the crew profile: creates or picks the person's own
  organisation and links it to the profile.
- "Gear and operator" in crew calls and job posts: a call can carry a hire request for the
  person's gear.
- Optional: gear for hire shown on the crew profile and in Find crew.
- The hire income appears in the person's numbers (K8) next to their fees.

Ask me before building: show gear on profiles and in Find crew?; who sees hire prices; damage terms
(repairs charged to the hirer, step 12).

Connect: crew profile, Find crew, crew calls, job board, subrentals, My numbers, rental network
(step 30).

Done when: database tests (a company sees only what the owner shares; prices only when shared);
help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

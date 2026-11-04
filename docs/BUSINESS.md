# Business features

The business side of AVX built from the build order in [ROADMAP.md](../ROADMAP.md): tasks,
an organisation's own statuses, types and fields, and the money loop (crew rates, then time
registration, leave, expenses, gig finance, invoices); the reports built on all of it are planned in
[ANALYTICS.md](ANALYTICS.md). Each section says how a built feature works, so the
next session can connect to it without reading its code first. Rows the competitor research
ranks are numbered [n] from [COMPETITOR_RESEARCH.md](COMPETITOR_RESEARCH.md).

When a step here is built, its session adds a "How … works" section below in the same shape.

## How Tasks T1 works (0.58.0)

| Piece | How it works |
|---|---|
| Data | `tasks` (migration `20261129000000_tasks.sql`): on a gig or for an organisation, title, notes, assignee, due date, checklist (JSON, up to 50 items), open/done with who and when, where it came from (a rehearsal note), soft removal. At most 2000 per gig (or per organisation, for its own tasks) |
| Who may | Read: the gig's members (or the organisation's, for organisation tasks). Add, edit, remove: production managers and organisation admins. Tick: anyone who writes on the gig and the assignee; the trigger lets them change only the status and checklist ticks |
| Checks | The assignee must be on the gig (or in the organisation); a note becomes a task on its own gig only, once |
| Notification | `task_assigned` when someone else gives you a task or changes who it's for; a direct kind, sent even when the organisation is muted |
| Screens | Gig → Tasks (`TasksTab`), My tasks (`/tasks`), the rehearsal session's "Make a task" button. Pure helpers in `src/lib/tasks.js` with tests; database checks in `supabase/tests/tasks.sql` |

## How Tasks T2 works (0.59.0)

| Piece | How it works |
|---|---|
| Templates | `task_templates` (migration `20261130000000_tasks_t2.sql`): name, notes, items (texts of up to 200 characters, up to 50). Members of the organisation read them; admins and members manage them; removing only marks them. At most 200 per organisation. Database checks in `supabase/tests/tasks_t2.sql` |
| Repairs | `tasks.repair_id`: set when the task is made, never changed; the repair must be the organisation's, the task the organisation's own (not a gig's); one live task per repair |
| Screens | Organisation → Tasks (`OrgTasksPage`, with the templates tab in `TaskTemplates`), "Start from a template" in the task form, "Make a task" in the repair window, the tasks card and tile in On-site mode |

## How gig statuses and types work (S1, 0.61.0)

| Piece | How it works |
|---|---|
| Data | `gig_statuses` (name, colour, `base_status`: one of draft, confirmed, active, completed, archived; position) and `gig_types` (name, colour, position), per organisation, at most 30 each, removing only marks them (migration `20261201000000_gig_statuses_types.sql`). `gigs.custom_status_id`, `gigs.gig_type_id` |
| The built-in status still rules | A trigger keeps them in step: choosing a custom status sets `status` to its base; changing `status` on its own (an import, an older screen) picks the organisation's first status for it, or none; a status that changes its meaning moves its gigs; a removed status or type comes off its gigs. So lists, archiving, notifications and the activity log work as before |
| Who | Admins manage both lists (Organisation settings → Gig statuses and types); members and anyone on one of the organisation's gigs read them. Checks in `supabase/tests/gig_statuses_types.sql` |
| Screens | New and edit gig forms (`GigLabelFields`), the gig header and gig cards (`GigLabels`, embedded with the gig in one query), status and type filters on the gigs list and calendar, the organisation export (`status_label`, `gig_type` in the gigs file) |

## How custom fields work (S2, 0.62.0)

| Piece | How it works |
|---|---|
| Data | `custom_fields` (entity: gig, client, supplier or item; label; kind: text, number, date, yes_no, choice, link; choices; position; `removed_at`), at most 40 per entity per organisation (migration `20261202000000_custom_fields.sql`). Values in `custom_values` (jsonb, field id → value) on `gigs`, `clients`, `suppliers` and `price_items` |
| Checks | A trigger checks every value a save sets or changes: the organisation's own current field for that kind of record, and a value of its kind. Values of removed fields stay untouched and can't be set again. A field's kind can't be changed (no update grant). Checks in `supabase/tests/custom_fields.sql` |
| Who | Admins manage the fields; members read them, and crew on one of the organisation's gigs read its gig fields (so gig fields are visible to crew). Values follow the record's own access rules |
| Screens | Organisation settings (`OrgCustomFieldsSettings`), `CustomFieldInputs` in the gig, client, supplier and item forms (saved with `mergeValues`, which keeps removed fields' values), `CustomFieldList` on the gig overview, the item page's details, the gigs search (`customSearchText`) |
| Export | `private.custom_columns` turns each record's values into one column per field label (built-in columns win a clash) in the gigs, clients, suppliers and items files (migration `20261202000001_export_custom_fields.sql`) |
| Not yet | Import mapping to custom fields (planned in IM2, [SWITCHING.md](SWITCHING.md) "Import overhaul"); filters by a field's value |

## How crew rates work (step 7, 0.63.0)

| Piece | How it works |
|---|---|
| Data | `crew_rates` (function title and/or person; day, half-day and hour rates; note; `removed_at`; one live rate per function and person, at most 500), `crew_rate_factors` (one row per organisation: overtime and after how many hours, weekend, night, holiday), `gig_crew_fees` (per gig and person: unit day, half_day, hour or fixed; rate; quantity; note). Migration `20261203000000_crew_rates.sql` |
| Who | Admins manage rates and factors; admins and members read them. A gig's managers (including freelance PMs) set fees there; each person reads only their own fee. Crew never read rates. Checks in `supabase/tests/crew_rates.sql` |
| Cost | `src/lib/crewRates.js`: the most specific rate (person in function, person, function; names compared ignoring case), the booked days (the person's booking, else the gig's dates), weekend days × the weekend factor, an agreed fee instead when set. Revenue: crew lines of the accepted quote (else the newest not declined) after its discount |
| Screens | Organisation settings (`OrgCrewRatesSettings`), the gig's Crew tab (`LabourCost` for managers, `MyFee` for crew) |
| Export | Three files (`crew_rates`, `crew_rate_factors`, `gig_crew_fees`). The export function was renamed `export_org_part_base` and is wrapped by the new one, which handles these parts (migration `20261203000001_export_crew_rates.sql`) |
| Not yet | Overtime, night and holiday factors (step 8) |

## How crew-rate follow-ups work (step 7b, 0.65.0)

| Piece | How it works |
|---|---|
| Data | `crew_calls` has an optional fee: `fee_unit` (day, half_day, hour, fixed), `fee_rate`, `fee_quantity` (all three or none; fixed counts once). One fee for everyone in the call. Migration `20261211000000_crew_call_fees.sql` |
| Sending | `send_crew_call` has an eight-argument version that takes the fee. Find crew's "Offer a place" (`contact_crew`) and the job board's "Offer" (`answer_application`) have versions that take it too and pass it on (migration `20261211000001_offer_fees.sql`); their older versions still work and send none. The fee goes into each invitation message and notification (`fee`: unit, rate, quantity, total) |
| Accepting | Accepting a call with a fee creates the person's `gig_crew_fees` row with the call's unit, rate and quantity, so the labour panel shows it as agreed. A fee already set for them is kept (only a cleared one is filled). Checks in `supabase/tests/crew_call_fees.sql` |
| Who | The people called see the fee in their offer before answering (they read the call's row, as before); crew on the gig never see the calls or others' fees. Only admins and members read the rate card, so freelance PMs get no suggestion but can type a fee |
| Suggestions | `src/lib/crewRates.js`: `feeFromForm` (a fee form → the fee to send), `offerFee` (a job board offer starts from the applicant's day rate, else the post's pay: per day × the post's days, per job fixed, per hour with the hours to fill in; euros only), `functionRate` (a function's rate under any of its names), `callFee` (the rate card's suggestion for the gig's days; with weekend days at a higher rate it becomes one fixed amount), `jobPay` (day rate per day, else hour rate per hour), `quoteLineCost` and `quoteCrewMargin` (a crew line's description is its function; per day uses the day rate, per hour the hour rate, × quantity × factor) |
| Screens | `FeeFields` and `useFeeForm` (`components/gig/FeeFields.jsx`), shared by `CrewCallModal` (the function's rate), Find crew's offer (`ContactModal`: the person's own rate first, then the function's) and the job board's `OfferModal` (which replaced the browser confirm box); each fills from its suggestion until edited. `CrewCallList` and the chat offer card (`EventCard`) show the fee; the notification adds it. `PostJobModal` fills pay from the card for the function or title until someone types their own. The quote editor shows each crew line's cost and margin under it, and the Summary tab a "Crew margin" block; only for EUR quotes, and never in `QuoteDocument` (print, PDF, client link) |

## Planned

Specs for the business steps still to build, in ROADMAP.md order. Each is a starting point: the
session that builds it reads its spec, checks it against the code, and **asks the owner the
questions marked "Ask" before outlining the migration**. When built, the spec is replaced by a
"How … works" section above.

### 8 · Time registration [2]

- Each person on a gig logs **hours per day**: start, end, break, plus travel time and kilometres
  (optional). Prefilled from their booking (`gig_members.booked_from/until`) or the gig's schedule.
- **Overtime and factors** from `crew_rate_factors`: hours past `overtime_after_hours` in a day,
  weekend days, night hours (Ask: which window counts as night, e.g. 00:00–07:00?), public holidays
  (Ask: a Portuguese holiday list built in, or the organisation types its own?).
- **Approval:** the gig's managers approve or send back with a note; approved hours are locked.
  The person is notified both ways.
- **Money:** approved hours × the agreed fee or rate → **actual labour cost**, shown next to the
  planned cost in the labour panel (step 7). Fixed fees ignore hours.
- **History stays true:** each approved day keeps its hours split (normal, overtime, night,
  weekend, holiday) and its cost as they were at approval, so a later rate change never rewrites
  past costs (reports K2, K7 and K8 read them).
- **Views:** the person's own hours (My work), the gig's hours (Crew tab), an organisation view per
  person and month. CSV export, and a "hours" file in the organisation export.
- **Who:** each person writes their own; managers write for anyone on the gig; crew never see
  others' hours or money.
- Offline: hours can be typed without a connection and sent later (like rehearsal notes).

### 9 · Leave requests [5]

- Builds on `crew_unavailability` (a person's own unavailable dates). Adds **types** (holiday,
  sick, training, other) and, for an organisation's **staff** (admins and members), a request that
  an admin approves or refuses. Freelancers keep marking dates without approval.
- **Balances** per staff member per year for holiday days (Ask: whole days only? carry-over?).
- Approved leave blocks the person like unavailability: clashes, Find crew "free", the network
  picker's ⚠, and time registration (no hours on leave days).
- Organisation calendar of who is away; notifications to the person and the admins.
- A **working week** per staff member (default Monday to Friday), so reports (K7) can count
  utilisation.

### 9b · Expenses

Full expense tracking, decided 2026-11-02 ([PENDING.md](PENDING.md) D24). AVX doesn't keep the
official accounts: the ledger is for running the business and handing the accountant a clean file.

- **Ledger:** date, supplier (from Contacts, or typed), description, category, amount excl. VAT,
  VAT rate and amount, total, currency, the supplier's invoice number, due date, paid on and how,
  notes, and a receipt (phone photo or PDF in a private bucket). Removing only marks it
  (`removed_at`).
- **Categories** per organisation (admins manage them; a starter list), each of a kind: direct (job
  costs), overhead (running the company), capital (equipment, vehicles: spread over a number of
  months, not a cost of the month) or tax/other.
- **Each cost counted once:** an expense links to a gig and to at most one of a subrental, a repair,
  a crew fee or a stock purchase (a vehicle after step 23). The linked expense is the actual amount;
  until then the record's own amount is the estimate.
- **Recurring** costs (rent, insurance, leasing): monthly, quarterly or yearly; a daily job drafts
  the next one on its date for someone to confirm.
- **Who:** `private.can_see_finance(org)` as decided in D23, made here and used by every report
  later.
- **Views**, simple first: this month, unpaid and due, by category, with totals; details (VAT,
  links, receipts) on demand; CSV for the accountant; a file in the organisation export.
- Ask: D23; the starter categories; whether VAT is recovered (if not, it counts as cost); expense
  claims by crew and staff (an expense on a gig with a photo, approved by the gig's managers, shown
  as "to reimburse") now or after the launch; importing the AT e-Fatura purchase-invoices file now
  or after the launch.

### 10 · Gig finance overview [4]

- One panel per gig (those who see money, D23): **revenue** (every accepted quote of the gig, net,
  by the revenue rule in [ANALYTICS.md](ANALYTICS.md); none accepted: the newest sent quote, marked
  estimate) against **costs**: labour (planned from step 7, actual from step 8 when approved),
  subrentals (confirmed `subrentals.quoted_total` or their lines), repairs charged to the gig, and
  **other costs**: expenses linked to the gig (step 9b; a linked expense replaces the planned amount
  of its subrental, repair or fee).
- Margin in money and %, with the parts that are still estimates marked as such.
- When a gig is completed, its rate-card labour can be saved as agreed fees, so a later rate change
  doesn't change its margin.
- One function, `gig_finance(org, from, until)`, feeds the panel and an organisation list of gigs
  with revenue, cost and margin, built as a report in the Reports area (K1): filters by period,
  status, type and client; CSV. K2 builds on it.

### 11 · Invoices [1]

- **Portugal requires certified invoicing software (AT)**, so AVX does not issue legal invoices.
  Ask: which program the owner uses (InvoiceXpress, Moloni, Vendus, TOConline) and whether to start
  with a file export (works with any) or that program's API.
- First: **VAT per line** on quotes (today one rate per quote), needed for invoices. It changes the
  quote maths, so the revenue rule's SQL and JS twins (K1) change with it, checked by their shared
  fixtures.
- An **invoice draft** from an accepted quote (all, or chosen phases or a deposit %), with the
  client from contacts; status draft → sent to the certified program → issued (number and PDF
  link stored) → paid / overdue; credit notes against an issued invoice.
- Reminders for overdue invoices (notification, optional email to the client through Brevo).

### 12 · Damage charged to the client [15], payments [22]

- Repairs marked "charge client" (`repairs.charge_client`) appear as lines to add to the gig's next
  invoice draft.
- **Payments:** record payments against invoices (date, amount, method); later a payment link
  (Ask: Stripe, or Portuguese methods first: MB Way, Multibanco references through a provider such
  as easypay or ifthenpay).

### 16 · E-signature [16]

- A signature pad on the phone, stored as an image with name, time and the document's hash, and a
  signed PDF kept with the record. Used for: quote acceptance (today a typed name), delivery notes /
  packing slips on site, crew contracts (step 27) and the rigger's sign-off (RG4).
- Plain electronic signature (not qualified); the terms say so.

### 22 · Shareable rider / advance page [28]

- A public link per gig (token, expiry, revocable) for the visiting engineer: stage plot, input
  list, patch, power and rigging summaries, schedule and contacts the PM chooses. No account needed;
  the page is read-only and printable.
- From StageKit: start the input list, mixes and stage plot **from the line-up** (band members and
  their instruments), and a **readiness check** before sending (missing inputs, no power plan…).

### 23 · Vehicles and transport [8], appointments [9]

- **Vehicles** as bookable resources in the reservations engine (docs/RESERVATIONS.md): plate,
  capacity (kg, m³), driver licence needed. **Trips** on a gig (out/back, vehicle, driver, times),
  the packing list split per vehicle with weight against capacity, clashes when a van or driver is
  double-booked.
- **Appointments:** non-gig calendar items (site visit, meeting, warehouse day) with people, shown in
  calendars, clashes and the calendar feed.
- **Costs:** running cost per km and per day on each vehicle and km on each trip, so transport cost
  goes into gig finance; expenses (9b) can link to a vehicle (fuel, tolls, repairs).
- **Vehicle use** report in the Reports area (trips, km, days used, load against capacity): the
  vehicle part of the old step 24.

### 24 · Reports [11]

Covered by the dashboards and analytics pack, K1–K8 in [ANALYTICS.md](ANALYTICS.md): crew days and
hours (K7), gigs and revenue per client and the quote win rate (K4), margin per gig type and period
(K2), equipment use (K5, building on I7) and the key numbers (K1's Overview). Vehicle use is part of
step 23.

### 25 · Gig templates [7]

- Save a gig as a template, or start a gig from one: schedule (relative days and times), positions,
  equipment, tool data (plots, patches), tasks, custom fields, status and type. Dates shift to the
  new gig's start.

### 26 · Client portal [13], online booking requests [14]

- **Portal:** one link per client (token) listing their quotes, invoices, shared documents and the
  conversations they already have through quote links, and their balance (from K3's cash function).
- **Booking requests:** a public form per organisation (dry hire): pick catalogue items and dates,
  see indicative availability, send → a draft quote and a notification. Spam protection.

### 27 · Freelancer side: contracts [25], invoicing [26], work history [24]

- **Contracts** generated from an accepted crew call or job offer (dates, fee, terms), signed by
  both with step 16. Ask: start with a Portuguese "prestação de serviços" template?
- **Freelancer invoicing:** a summary of approved hours and fees per company and month to issue a
  "recibo verde" on the AT portal (AVX never issues it).
- **Work history** on crew profiles: gigs done on AVX, shown only with the company's permission.
- Freelancer invoicing and the work-history counts reuse K8's monthly summary (crew numbers in My
  work).

### 28 · Public API and webhooks [17]

- Tokens per organisation with scopes; read gigs, schedule, crew, equipment; write availability.
  Webhooks on gig, quote and crew changes. Rate limits, audit log. Unlocks the cueing app (R3),
  accounting sync [18], payroll export [23] and an MCP server [19].

### 30 · Rental network [21], RFID [20]

- **Rental network:** AVX companies that opt in see each other's available stock (not prices unless
  shared) and send a subrental request in two clicks (builds on cross-hire codes, I6).
- **RFID:** only with a hardware partner; QR covers most companies. Plan when asked.

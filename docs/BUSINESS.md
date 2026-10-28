# Business features

The business side of AVX built from the build order in [ROADMAP.md](../ROADMAP.md): tasks,
an organisation's own statuses, types and fields, and the money loop (crew rates, then time
registration, leave, gig finance, invoices). Each section says how a built feature works, so the
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
| Not yet | Import mapping to custom fields; filters by a field's value |

## How crew rates work (step 7, 0.63.0)

| Piece | How it works |
|---|---|
| Data | `crew_rates` (function title and/or person; day, half-day and hour rates; note; `removed_at`; one live rate per function and person, at most 500), `crew_rate_factors` (one row per organisation: overtime and after how many hours, weekend, night, holiday), `gig_crew_fees` (per gig and person: unit day, half_day, hour or fixed; rate; quantity; note). Migration `20261203000000_crew_rates.sql` |
| Who | Admins manage rates and factors; admins and members read them. A gig's managers (including freelance PMs) set fees there; each person reads only their own fee. Crew never read rates. Checks in `supabase/tests/crew_rates.sql` |
| Cost | `src/lib/crewRates.js`: the most specific rate (person in function, person, function; names compared ignoring case), the booked days (the person's booking, else the gig's dates), weekend days × the weekend factor, an agreed fee instead when set. Revenue: crew lines of the accepted quote (else the newest not declined) after its discount |
| Screens | Organisation settings (`OrgCrewRatesSettings`), the gig's Crew tab (`LabourCost` for managers, `MyFee` for crew) |
| Export | Three files (`crew_rates`, `crew_rate_factors`, `gig_crew_fees`). The export function was renamed `export_org_part_base` and is wrapped by the new one, which handles these parts (migration `20261203000001_export_crew_rates.sql`) |
| Not yet | Fees in crew calls and job posts; quote labour lines from the rate card; overtime, night and holiday factors (step 8) |

## Planned

Specs for the business steps still to build, in ROADMAP.md order. Each is a starting point: the
session that builds it reads its spec, checks it against the code, and **asks the owner the
questions marked "Ask" before outlining the migration**. When built, the spec is replaced by a
"How … works" section above.

### 7b · Crew-rate follow-ups

- **Crew calls** (`CrewCallModal`, `crew_calls`) and **job posts** (`job_posts.pay_*`) offer the fee
  suggested by the rate card for the function, editable. Accepting a crew call with a fee creates
  the person's `gig_crew_fees` row.
- **Quotes:** adding a crew line offers the function's day rate as a cost hint next to the price
  (price list stays the selling price); the quote shows the crew margin per line for admins and
  members only, never on the client's print.
- No new tables expected; maybe a `fee` column on `crew_calls`.

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

### 10 · Gig finance overview [4]

- One panel per gig (admins and members only): **revenue** (accepted quote total, net) against
  **costs**: labour (planned from step 7, actual from step 8 when approved), subrentals (confirmed
  `subrentals.quoted_total` or their lines), repairs charged to the gig, and **other costs** typed
  in (a new table: description, amount, category, receipt photo optional).
- Margin in money and %, with the parts that are still estimates marked as such.
- An organisation list of gigs with revenue, cost and margin, filterable by period, status, type,
  client; CSV. Feeds reports (step 24).

### 11 · Invoices [1]

- **Portugal requires certified invoicing software (AT)**, so AVX does not issue legal invoices.
  Ask: which program the owner uses (InvoiceXpress, Moloni, Vendus, TOConline) and whether to start
  with a file export (works with any) or that program's API.
- First: **VAT per line** on quotes (today one rate per quote), needed for invoices.
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

### 24 · Reports [11]

- Organisation reports: crew days and hours per person, gigs and revenue per client, quote win
  rate, margin per gig type and period, equipment utilisation (I7 already has the item side),
  vehicle use. Each a table with filters and CSV; a small dashboard of the key numbers.

### 25 · Gig templates [7]

- Save a gig as a template, or start a gig from one: schedule (relative days and times), positions,
  equipment, tool data (plots, patches), tasks, custom fields, status and type. Dates shift to the
  new gig's start.

### 26 · Client portal [13], online booking requests [14]

- **Portal:** one link per client (token) listing their quotes, invoices, shared documents and the
  conversations they already have through quote links.
- **Booking requests:** a public form per organisation (dry hire): pick catalogue items and dates,
  see indicative availability, send → a draft quote and a notification. Spam protection.

### 27 · Freelancer side: contracts [25], invoicing [26], work history [24]

- **Contracts** generated from an accepted crew call or job offer (dates, fee, terms), signed by
  both with step 16. Ask: start with a Portuguese "prestação de serviços" template?
- **Freelancer invoicing:** a summary of approved hours and fees per company and month to issue a
  "recibo verde" on the AT portal (AVX never issues it).
- **Work history** on crew profiles: gigs done on AVX, shown only with the company's permission.

### 28 · Public API and webhooks [17]

- Tokens per organisation with scopes; read gigs, schedule, crew, equipment; write availability.
  Webhooks on gig, quote and crew changes. Rate limits, audit log. Unlocks the cueing app (R3),
  accounting sync [18], payroll export [23] and an MCP server [19].

### 30 · Rental network [21], RFID [20]

- **Rental network:** AVX companies that opt in see each other's available stock (not prices unless
  shared) and send a subrental request in two clicks (builds on cross-hire codes, I6).
- **RFID:** only with a hardware partner; QR covers most companies. Plan when asked.

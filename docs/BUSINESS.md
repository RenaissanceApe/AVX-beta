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
| Data | `gig_statuses` (name, colour, `base_status`: one of draft, confirmed, active, completed, archived, and cancelled since K7; position) and `gig_types` (name, colour, position), per organisation, at most 30 each, removing only marks them (migration `20261201000000_gig_statuses_types.sql`). `gigs.custom_status_id`, `gigs.gig_type_id` |
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
| Import | A file's column can go to a field of gigs, clients, suppliers or items ("Your own fields" in the Match step); values checked by the field's kind in the check, saved and undone with the import (IM2, migration `20270114000000_import_custom_values.sql`, [SWITCHING.md](SWITCHING.md) "How IM2 works") |
| Not yet | Filters by a field's value |

## How crew rates work (step 7, 0.63.0)

| Piece | How it works |
|---|---|
| Data | `crew_rates` (function title and/or person; day, half-day and hour rates; note; `removed_at`; one live rate per function and person, at most 500), `crew_rate_factors` (one row per organisation: overtime and after how many hours, weekend, night, holiday), `gig_crew_fees` (per gig and person: unit day, half_day, hour or fixed; rate; quantity; note). Migration `20261203000000_crew_rates.sql` |
| Who | Admins manage rates and factors; admins and members read them. A gig's managers (including freelance PMs) set fees there; each person reads only their own fee. Crew never read rates. Checks in `supabase/tests/crew_rates.sql` |
| Cost | `src/lib/crewRates.js`: the most specific rate (person in function, person, function; names compared ignoring case), the booked days (the person's booking, else the gig's dates), weekend days × the weekend factor, an agreed fee instead when set. Revenue: crew lines of every accepted quote of the gig after line, phase and quote discounts (the revenue rule, K1); none accepted: the newest sent quote, marked estimate; drafts never count |
| Screens | Organisation settings (`OrgCrewRatesSettings`), the gig's Crew tab (`LabourCost` for managers, `MyFee` for crew) |
| Export | Three files (`crew_rates`, `crew_rate_factors`, `gig_crew_fees`). The export function was renamed `export_org_part_base` and is wrapped by the new one, which handles these parts (migration `20261203000001_export_crew_rates.sql`) |
| Later | Overtime, night and holiday factors are used by time registration (step 8, below) |

## How crew-rate follow-ups work (step 7b, 0.65.0)

| Piece | How it works |
|---|---|
| Data | `crew_calls` has an optional fee: `fee_unit` (day, half_day, hour, fixed), `fee_rate`, `fee_quantity` (all three or none; fixed counts once). One fee for everyone in the call. Migration `20261211000000_crew_call_fees.sql` |
| Sending | `send_crew_call` has an eight-argument version that takes the fee. Find crew's "Offer a place" (`contact_crew`) and the job board's "Offer" (`answer_application`) have versions that take it too and pass it on (migration `20261211000001_offer_fees.sql`); their older versions still work and send none. The fee goes into each invitation message and notification (`fee`: unit, rate, quantity, total) |
| Accepting | Accepting a call with a fee creates the person's `gig_crew_fees` row with the call's unit, rate and quantity, so the labour panel shows it as agreed. A fee already set for them is kept (only a cleared one is filled). Checks in `supabase/tests/crew_call_fees.sql` |
| Who | The people called see the fee in their offer before answering (they read the call's row, as before); crew on the gig never see the calls or others' fees. Only admins and members read the rate card, so freelance PMs get no suggestion but can type a fee |
| Suggestions | `src/lib/crewRates.js`: `feeFromForm` (a fee form → the fee to send), `offerFee` (a job board offer starts from the applicant's day rate, else the post's pay: per day × the post's days, per job fixed, per hour with the hours to fill in; euros only), `functionRate` (a function's rate under any of its names), `callFee` (the rate card's suggestion for the gig's days; with weekend days at a higher rate it becomes one fixed amount), `jobPay` (day rate per day, else hour rate per hour), `quoteLineCost` and `quoteCrewMargin` (a crew line's description is its function; per day uses the day rate, per hour the hour rate, × quantity × factor) |
| Screens | `FeeFields` and `useFeeForm` (`components/gig/FeeFields.jsx`), shared by `CrewCallModal` (the function's rate), Find crew's offer (`ContactModal`: the person's own rate first, then the function's) and the job board's `OfferModal` (which replaced the browser confirm box); each fills from its suggestion until edited. `CrewCallList` and the chat offer card (`EventCard`) show the fee; the notification adds it. `PostJobModal` fills pay from the card for the function or title until someone types their own. The quote editor shows each crew line's cost and margin under it, and the Summary tab a "Crew margin" block; only for EUR quotes, and never in `QuoteDocument` (print, PDF, client link) |

## How time registration works (step 8, 0.66.0)

| Piece | How it works |
|---|---|
| Data | `time_entries`: one row per person, gig and day (start, end, break, travel minutes, km, note; an end at or before the start runs past midnight). Status `submitted` → `approved` or `returned` (with `review_note`). Approved rows keep `split` (normal, overtime, night, weekend, holiday, worked, travel, km hours), `fee_unit`, `fee_rate` and `cost` as they were at approval. `crew_rate_factors` gained `night_from`, `night_until` (default 22:00–07:00) and `km_rate`. `org_holidays`: the organisation's own days. Removing marks (`removed_at`). Migration `20261212000000_time_registration.sql` |
| Who | Each person writes their own days; the gig's managers (`can_manage_gig`: PMs, the creator, org admins) write for anyone on the gig and read everyone's. Crew never read others' hours or money. Approved days can't be changed by anyone. Only `review_time_entry` sets the status, split and cost. Org members not managing the gig see nothing; org admins see all (the Hours page). Checks in `supabase/tests/time_registration.sql` |
| Maths | `src/lib/timeRegistration.js` (unit tested): Portuguese national holidays (Easter-based ones computed) plus the organisation's; each minute of the shift gets its highest factor (ties: holiday > weekend > overtime > night); overtime starts after `overtime_after_hours` of work; the break is taken from the cheapest non-overtime minutes. Cost: hour fee = hours × rate × factor; day / half-day fee = the rate per day worked + hourly equivalent (rate ÷ overtime hours, or half of them) × overtime factor for overtime hours and × (factor − 1) for night, weekend and holiday hours; fixed fee = km only per day, the fee itself once per gig (`personActual`). Travel at the plain hourly rate; km × `km_rate`. Price: the agreed fee, else the rate card (hour, day, half-day rate) |
| Approval | The app works out the split and cost (`approval` in `src/lib/hours.js`) and sends them to `review_time_entry`, which checks the split adds up to the worked hours and stores it. Freelance PMs get the factors and holidays from `time_settings`; without an agreed fee they approve with no cost. Notifications: `hours_submitted` to the approvers (the gig's PMs and creator, else the org admins; one unread per person), `hours_approved` / `hours_returned` to the person |
| Offline | `src/lib/hours.js`: days typed without a connection are kept on the phone (per user) with their id and sent when the connection returns (App flushes on `online`); cleared on sign-out |
| Screens | `components/hours/GigHours.jsx` on the gig's Crew tab (crew: their own; managers: everyone, approve, send back, approve all, CSV); `HoursParts.jsx` (the day form, rows, status); `ClockInOut.jsx` in On-site mode; `pages/HoursPage.jsx` at `/me/hours` (My work) and `/org/:orgId/hours` (admins), per month with CSV; the labour panel shows the actual cost next to the planned; Crew rates settings have the night window, km rate and holidays |
| Export and feed | Organisation export: `time_entries` and `org_holidays` files, the factors file with the new columns (the export function was renamed `export_org_part_pre_step8` and wrapped). The calendar feed lists the person's own logged days in each gig's description |
| Reports | K2, K7 and K8 read approved `time_entries` (`split`, `cost`); a fixed fee is added once per person and gig |

## How leave requests work (step 9, 0.67.0)

| Piece | How it works |
|---|---|
| Data | `crew_unavailability` (a person's own dates since 0.12) gained `type` (holiday, sick, training, other), `org_id` (empty for a freelancer's own dates), `status` (requested → approved or refused; cancelled when removed), `start_half` / `end_half` (afternoon of the first day, morning of the last), `days` (working days used, set by the database), who decided, when and the note, and `removed_at`. Rows from before stay approved "other" dates. New tables: `org_leave_settings` (holiday days per year, default 22), `staff_leave_years` (a person's own allowance for a year and the days carried over, typed by an admin), `staff_work_weeks` (ISO weekdays, default Monday to Friday, and hours a day). Migrations `20261213000000_leave_requests.sql` and `20261213000001_leave_requests_removal.sql` (applied by hand: hard removal stays only for freelance dates) |
| Who | Staff = an organisation's admins and members (not viewers). Each asks for their own leave; holiday, training and other start as `requested`, sick is `approved` at once (past days allowed; requests start from today); an admin may enter leave for staff, approved at once. Only `decide_leave` changes the status: admins approve, or refuse with a note (approved leave can still be refused, e.g. a sick day by mistake). Asked or approved leave can't be moved, only removed (marked) and asked again. Admins read their organisation's leave; members read the calendar through `org_leave_calendar` (no notes, a colleague's sick day as "away", requests only their own); other companies only ever get "busy" through the reservations. Checks in `supabase/tests/leave_requests.sql` |
| Days | `private.leave_days` counts the person's working weekdays in the range, without Portugal's national holidays (`private.pt_holiday`, Easter-based ones computed, the same list as `src/lib/timeRegistration.js`) and the organisation's `org_holidays`; a half first or last day counts 0.5; without an organisation every day counts. `src/lib/leave.js` (unit tested) counts the same way for the form's preview |
| Balances | `leave_balances(org, year)`: per member of staff, allowance (their own for the year, else the organisation's), carried, used (approved holiday that year), asked (waiting), left, their working days and hours a day. Admins get everyone, others only themselves. Leave across New Year counts in each year |
| Blocking | Only approved, not removed entries block. Reservations (clashes on a gig's Crew tab, the network picker's ⚠) are confirmed only then, and a half day starts or ends at 13:00 in the organisation's time zone (personal dates: Lisbon); `person_conflicts` and Find crew's `crew_busy` filter the same way. Time registration: `time_entries_leave` refuses hours on a whole day of approved organisation leave ("On leave that day"); half days and freelance dates don't block hours |
| Notifications | `leave_requested` and `leave_sick` to the organisation's admins, `leave_cancelled` when someone removes approved leave, `leave_approved` / `leave_refused` (with the note) to the person, `leave_approved` also when an admin enters leave for them. All count as direct (shown even when the organisation is muted); they open `/org/:id/leave` |
| Screens | `pages/LeavePage.jsx` at `/org/:orgId/leave` (menu: Organisation → Leave, admins and members): ask for leave, your balance, who is away (month, day by day), your leave (remove with ×); admins also get the requests waiting (`components/leave/LeaveAdmin.jsx`), "Add for someone", and holiday days and working weeks (organisation's days per year; per person: own allowance, carried, working days, hours a day). `components/leave/LeaveParts.jsx` has the form and the chips. Account → Availability shows a type on each date, the person's organisation leave with its status, and a button per organisation to ask for leave |
| Feed and export | The calendar feed adds the person's approved leave and unavailable dates as all-day events. Organisation export: `leave_settings`, `work_weeks`, `leave_years` and `leave` files (the export function was renamed `export_org_part_pre_step9` and wrapped) |
| Reports | `staff_utilisation(org, from, to)` (admins): per member of staff, working days, approved leave days per type, days and hours available, approved hours logged on the organisation's gigs. K7 builds on it |

## How expenses work (step 9b, 0.68.0)

Full expense tracking (D24). AVX doesn't keep the official accounts: the ledger is for running the
business and handing the accountant a clean file.

| Piece | How it works |
|---|---|
| Who sees money | `private.can_see_finance(org)`: the organisation's **admins and members** (D23). Expenses use it; every money report (K1 on) will too |
| Data | `expenses`: date, supplier (`supplier_id` from Contacts, or a typed `supplier_name`), description, category, amount excl. VAT, VAT rate, VAT amount (worked out, or the invoice's own), `total` (stored, net + VAT), currency, the supplier's invoice number, due date, paid on and how, notes, receipt (`receipt_path`, `receipt_name`), status, `removed_at`. `expense_categories` (per organisation; kind `direct`, `overhead`, `capital` with `spread_months`, or `tax_other`; `vat_recoverable`; archived, never removed). `org_finance_settings` (`recovers_vat`, default yes). `expense_recurrences`. Migration `20261214000000_expenses.sql` |
| Categories | A starter list of 23 is made the first time someone who sees money opens Expenses (`ensure_expense_categories`): job costs (hire-in, freelance crew, transport and fuel, tolls and parking, travel and accommodation, meals on jobs, consumables, repairs and parts), running the company (rent and utilities, insurance, vehicle leasing and upkeep, software, phone and internet, accountant and legal, marketing, bank fees, office supplies), equipment and vehicles (equipment 60 months, vehicles 48, computers 36) and taxes and other (taxes and fees, fines, other). Starter ones keep a `starter_key` and show in the reader's language until renamed. Meals and travel/accommodation start with VAT "not recoverable". Admins add, edit and archive |
| VAT | Cost of an expense = amount excl. VAT, plus the VAT when the organisation doesn't recover VAT or the category's VAT isn't recoverable (`costOf` in `src/lib/expenses.js`). Totals are per currency, never added across |
| Each cost counted once | An expense links to a gig and to at most one of a subrental, a repair, a crew fee (`crew_fee_user_id` with the gig: that person's `gig_crew_fees` row), a bulk stock purchase (`stock_movement_id`) or a unit bought (`stock_unit_id`). One live expense per linked record (unique indexes). Links to another organisation's records, a crew fee that doesn't exist or a record of another gig are refused; a linked subrental or repair fills in its gig. The linked expense is the actual amount; the record's own amount stays the estimate |
| Statuses | `confirmed` (counts), `draft` (made by a recurring cost; counts once confirmed), and for claims `claimed` (waiting) and `returned` (sent back with a note). Nobody sets a status by hand except confirming a draft; `decide_expense_claim` and the recurring job set the rest |
| Claims | Anyone on a gig (crew included) adds what they paid themselves, with the receipt, from the gig's Crew tab: it starts `claimed`, links only to its gig, and its owner can't mark it paid. They see only their own claims. The gig's approvers (its PMs and creator, else the organisation's admins) are notified (`expense_claimed`); the gig's managers and those who see money approve or send back with a note (`decide_expense_claim`; nobody approves their own claim unless an organisation admin). Editing a returned claim sends it again. An approved claim with no paid date is **to reimburse**; whoever sees money adds the date it was paid. Notifications `expense_approved` / `expense_returned` |
| Recurring | `expense_recurrences`: description, supplier, category, amount, VAT rate, how paid, monthly / quarterly / yearly, first and last date. The n-th date is first date + n periods (a 31st falls back to the month's last day and returns). Every morning at 05:47 UTC (`avx-recurring-expenses`, `private.draft_recurring_expenses`) each one due by today (the organisation's time zone) gets its draft, at most 24 a run; a unique index makes each date once, and a removed draft isn't made again. The admins get one `expense_drafted` notification per organisation. Adding one that starts in the past drafts at once (`draft_recurring_expenses_now`) |
| Receipts | Private bucket `expense-receipts`, `<organisation>/<expense>/<file>`, photos or PDF up to 10 MB. Those who see money read and add; a claim's owner adds to their waiting claim and reads it with the gig's managers. An expense's `receipt_path` must be under its own folder |
| Screens | `pages/ExpensesPage.jsx` at `/org/:orgId/expenses` (menu: Organisation → Expenses, admins and members): This month (totals excl. VAT by kind, capital also as this month's spread share; "Show details" adds VAT, by category, and each row's invoice, due, paid, link and receipt), Unpaid and due (to reimburse, overdue, unpaid), Claims, Recurring, Categories (admins: categories and "We recover VAT"); search and filters by kind and category; "CSV for the accountant" (confirmed expenses in view, semicolon CSV). `components/expenses/`: `ExpenseForm` (ledger or claim; type the amount excl. VAT or the total), `ExpenseParts`, `ExpenseSettings`, `GigExpenses` (gig Crew tab), `LinkedExpense` |
| Connected | Subrentals and repairs: their window shows the linked expense (actual vs planned) or "Add expense". Labour panel: a crew fee's linked expense replaces the hours as that person's actual cost (receipt button to add it). Bulk stock "Add → Bought": "Also record the supplier's invoice as an expense". Contacts: each supplier's spend this year and what is unpaid (`supplier_spend`). Organisation export: `expense_categories`, `expenses`, `expense_recurrences` files (export function renamed `export_org_part_pre_step9b` and wrapped, `20261214000001_export_expenses.sql`). DATA_MAP.md: expenses and receipts. Push and email summary texts for the new notifications |
| Tests | `supabase/tests/expenses.sql` (who adds, reads and approves; other organisations' links refused; one live expense per link; recurring drafts once; export), `src/lib/expenses.test.js` (VAT, recurrence, totals, form, CSV) |
| Later | K1 and later reports read confirmed expenses (capital spread by `spread_months`), using `can_see_finance`. Step 10 shows a gig's linked expenses as its other costs (built, 0.71.0). Importing the AT e-Fatura purchase-invoices file waits for a sample file (after launch) |

## How gig finance works (step 10, 0.71.0)

What each gig brings in and costs, for those who see money (admins and members, D23). Migration
`20261221000000_gig_finance.sql` (functions and one view, no tables); checks in
`supabase/tests/gig_finance.sql` (no delete statements).

| Piece | How it works |
|---|---|
| `gig_finance(org, from, until, gig)` | One row per gig starting in `[from, until)`, or the one `gig`, or every gig when both dates are empty. Runs as the reader and calls `private.require_finance` (admins and members, with the second sign-in step when set up). Columns: the gig (name, dates, status, own status, type, client), **revenue** (every accepted quote of the gig, net, by the K1 rule; none accepted: the newest sent quote, `revenue_source` `estimate`; none: `none`), **labour** (planned, actual, counted, estimated part, people, people without a rate), **subrentals** (confirmed or returned: the supplier's price, else the lines), **repairs** (on the gig and not charged to the client; those charged are in `repairs_charged`, not counted), **other costs** (confirmed expenses on the gig not linked to a subrental, repair, crew fee of someone on the gig or stock purchase; capital ones left out), cost, estimated cost, **margin** and margin %. A linked expense replaces the planned amount of its subrental, repair or crew fee (and a subrental's expense counts even if the subrental was later cancelled). Euros only, as the labour panel (D42 c); other currencies in `other_currencies`, never added. `plan_cache_mode = force_custom_plan`: a plan cached from one-gig calls made a month of 300 gigs take seconds |
| Labour | `private.gig_labour(org, gigs)` (security definer, finance check first): totals per gig only, never per person, because fees and approved hours are readable only by a gig's managers. Per person on the gig: actual = an expense linked to their fee (confirmed, EUR), else their approved days' stored cost plus a fixed fee once; planned = the agreed fee, else the rate card (most specific rate, day or half-day rate per booked day, weekend days × the weekend factor), which is the estimated part; counted = actual, else planned. The same rule as the labour panel (`labourLines`, `personActual`) |
| Expense cost | `private.expense_costs` (a view, `security_invoker`): amount excl. VAT, plus the VAT when the organisation or the category doesn't recover it, as `costOf` in `src/lib/expenses.js` |
| JS twin | `src/lib/analytics/gigFinance.js` (`gigFinanceRow`, `gigLabour`, `countedQuotes`, `financeTotals`, `filterFinanceRows`, `isEstimate`, `hasMargin`, `cardFees`); `src/lib/analytics/gigFinanceFixtures.json` holds the shared fixtures, checked by `gigFinance.test.js` and copied verbatim into the database test (a Vitest test keeps the copy equal). Change both twins and both files together |
| Panel | `components/gig/GigFinancePanel.jsx` on the gig's Overview for admins and members (hidden in simple mode): revenue (and how many accepted quotes, or "estimate"), labour (planned and actual, the rate-card part, people without a rate), subrentals, repairs (and what is charged to the client), other costs, total cost, margin and % (red when negative, with the amount's sign; "Part of this is an estimate" in words). "Add expense" opens the expense form with the gig filled in. On a **completed** gig with rate-card labour, its managers get "Save as agreed fees": the rate card's suggestion for each person without a fee is stored in `gig_crew_fees` (with weekend days at a higher rate, one fixed amount, as a crew call offers it), so a later rate change doesn't change the margin |
| Report | Reports → **Gig margins** (`components/reports/GigMarginsReport.jsx`, tab `margins`): period and comparison, tiles (margin with % of revenue, revenue, cost, gigs with a negative margin out of how many), margin by month (one month: by gig, lowest first), "Show details" for the status, type and client filters and the sortable table; CSV with every column, print. A period not yet over counts gigs starting up to today |
| Overview tiles | `report_overview` gained `margin_this_month` (EUR), `margin_pct_this_month` and `negative_margin`: gigs starting this month that have a quote (the K1 function was renamed `private.report_overview_pre_step10` and wrapped). Tiles "Margin, gigs this month" and "Gigs losing money this month", on Reports → Overview and the Home strip |
| Gig cards | On an organisation's gig list, admins and members (not in simple mode) see "Margin 18%" (or "· est.") on each gig that has a quote; red with its minus sign when negative (`useGigMargins`) |
| Export | Organisation export: a `gig_finance` file with every gig's row (the export function was renamed `export_org_part_pre_step10` and wrapped) |
| Help | Term "gig margin", ⓘ `gig-finance`, guide `office-gig-finance` with two pictures (`gig-finance`, `reports-margins`); the Overview pictures were refreshed for the two new tiles |
| Tests | `gig_finance.sql`: the fixtures' totals as a member who manages none of the gigs (and can't read fees or hours directly), the periods, the overview tiles, who may call each function (admin and member yes; viewer, crew, another organisation, anonymous no; the second sign-in step), the export file (admins only), 300 gigs with 5 people each under a second (about 90 ms on the test project). Vitest: the twin on the same fixtures, the totals, filters, estimates and saved fees; the signed-in e2e journey opens Gig margins with axe |
| K2 | `finance_results` builds on `gig_finance` (built, 0.75.0; docs/ANALYTICS.md, "How K2 works") |

## How invoices work (step 11, 0.72.0)

In Portugal only certified invoicing software (AT) may issue an invoice, so AVX **prepares** each
invoice and the organisation **issues it in its own certified program**, then types the program's
number (and PDF link) back into AVX. Invoicing is **manual for every organisation** (D45): AVX is
sold to companies using different programs, so it isn't tied to one. Connecting the most used
programs directly is step 11b ("How invoicing connectors work" below).
Migration `20261222000000_invoices.sql`; checks in `supabase/tests/invoices.sql` (no delete
statements).

| Piece | How it works |
|---|---|
| VAT per line | Each quote line has its own `vat_rate` (and, at 0 %, an AT exemption code `vat_exemption`: M05, M07, M10, M16, M40, M99). The quote's `vat_rate` is the rate new lines start with; "Apply this rate to every line" sets them all. A line without a rate (saved before 0.72) uses the quote's (`lineVatRate`). `quoteTotals` gives `vatByRate` (base and VAT per rate; the bases always add up to the unchanged net, rounding left over goes to the biggest base) and `missingExemption`. The migration copied each quote's rate onto its lines and its saved versions' lines without touching the edit counter. The printed quote and PDF list VAT per rate when lines differ |
| Revenue rule (K1) | Unchanged amounts. `private.report_quote_lines` gained `vat_rate` (the line's, else the quote's) at the end; `revenue.js` rows carry `vat_rate` too, checked against the shared fixtures. `report_revenue_lines` and `gig_finance` keep their columns (adding one would need recreating them) |
| Data | `invoices`: AVX `number` (per organisation, given by the trigger; nobody can set or change it: column grants), `kind` invoice or credit_note (`credited_invoice_id`), quote, gig and client links, a copy of the client (name, NIF, address, email), `scope` (all, phases, deposit, rest, credit, custom), `phase_ids`, `deposit_pct`, language, currency, `lines` (cleaned and checked on save), `net`/`vat`/`total` worked out by the trigger (VAT per rate on the sum of its lines, the twin of `invoiceTotals`), notes, issue and due dates, `status`, sent/issued timestamps, `paid_on`, `legal_number` and `pdf_url` (Moloni's), `moloni_document_id`, reminder dates, `removed_at`. `organisations.invoice_due_days` (Company details, default 30). `moloni_connections` (tokens, company, series, the "AVX service" product; no rules or grants, the Edge Function only) |
| Rules | Admins and members only (`can_see_finance`, two-step sign-in when set up). Status draft → sent → issued → paid (sent → draft and paid → issued undo); overdue is worked out (issued, unpaid, past due), never stored. Only drafts can be changed or removed (marked). Issued needs the program's number; once issued the number and issue date stay. A credit note needs an issued invoice of the same organisation and can't credit more than is left (other non-removed credit notes count); it takes the invoice's currency and is never "paid". An invoice can't total below zero |
| Maths | `src/lib/invoices.js`: `quoteInvoiceLines` (each priced line, line × phase × quote discount as one %, qty × factor as one quantity, its own VAT; chosen phases may include optional ones), `depositLines` (pct % of each rate's base), `restLines` (the whole quote less each deposit invoice, at its rates), `creditLines`, `invoiceTotals`, `invoiceState`, `dueDateFor`, `invoiceProblems`. An invoice can be a cent away from its quote (it rounds per line, the quote per phase); the window says so |
| Hand-off | Manual, the same for every organisation: create the invoice in your certified program, tap "Mark as sent to my program", then add the program's number (required to mark it issued) and the link to its PDF. Back to draft is possible while it is only sent. Connecting a program (step 11b) adds "Send to <program>" and "Check <program>" beside this, below |
| Reminders | `private.remind_overdue_invoices()` every morning (`avx-overdue-invoices`, 07:23 UTC): each overdue invoice notifies the quote's author and the admins (`invoice_overdue`), again a week later while unpaid. "Email the client a reminder" (overdue, with an email and a PDF link) sends one email through Brevo in the invoice's language, counted as a quote email in the send limits |
| Screens | `pages/InvoicesPage.jsx` at `/org/:orgId/invoices` (menu: Quotes → Invoices): overdue and unpaid totals, views To send, Unpaid (overdue first), Paid, All, search, "New invoice from a quote" (accepted quotes). `components/invoices/InvoiceModal.jsx`: what to invoice, client, dates, language, lines (editable in a draft, with VAT and reasons), totals by rate, then the actions for its status (mark as sent to the program, the program's number and PDF link, back to draft, paid, not paid, credit note, email reminder, tell the client in the quote's conversation, open the PDF) |
| Connected | Quote editor → Summary: invoiced and left to invoice (excl. VAT), its invoices, "New invoice" (`QuoteInvoices`). Quotes list: "Invoiced €…" per quote. Contacts → Clients: invoiced, unpaid and overdue. Gig finance panel: invoiced, paid, unpaid (overdue), still to issue (`invoice_summary`). Client guest thread: an issued invoice's number, amount, due date and PDF link posted in the quote's conversation on request. Organisation export: `invoices` and `invoice_lines` files (export function renamed `export_org_part_pre_step11` and wrapped). Notifications (app, push, email summary). K3 reads `issue_date`, `due_date`, `paid_on` and `invoice_summary` |
| Help | Terms invoice, credit note, certified program; ⓘ for the line VAT, NIF, due date, number and the quote's invoices (the Moloni ones are kept for 11b); page note `org-invoices`; guide `office-invoices` with five pictures |
| Tests | `invoices.sql`: VAT copy, numbering (can't be given or changed), totals, viewers/crew/other companies see and do nothing, status rules and locks, credit-note limits, `invoice_summary`, Moloni tokens unreadable (kept for 11b), overdue reminders once a week, export. Vitest: VAT per line (`quotes.test.js`), invoice and deposit maths (`invoices.test.js`), the revenue fixtures with VAT |

## How invoicing connectors work (step 11b, 0.73.0)

Each organisation can connect **one** certified invoicing program, or stay **by hand** (the step 11
flow, always available, even with a program connected). A connector only saves typing: AVX still
never issues a legal invoice. It sends a **draft** to the program; you check and finalise it there;
"Check <program>" reads back the number, dates and PDF link. Migration
`20261223000000_invoicing_connectors.sql`; checks in `supabase/tests/invoicing_connectors.sql` (and
`invoices.sql`, updated for the new names). Vendus was left out (D46): its API has no drafts, so
sending would issue the invoice.

| Piece | How it works |
|---|---|
| Programs | **Moloni** (sign-in with AVX's developer app: `MOLONI_CLIENT_ID` / `MOLONI_CLIENT_SECRET`), **InvoiceXpress** (the admin types the account name and API key), **TOConline** (each company makes its own API details in TOConline, Empresa → Configurações → Dados API; the admin types the client ID, secret, OAuth and API addresses, then signs in). A program is offered only once the owner lists it in the `INVOICING_PROVIDERS` function secret, after an end-to-end test with a real account |
| Data | `invoicing_connections` (renamed from `moloni_connections`): one row per organisation, `provider` (null: by hand), `account` (InvoiceXpress account name / TOConline client ID), `api_key` (InvoiceXpress key / TOConline secret), `settings` (TOConline addresses, its "AVX-SERVICE" id), tokens, company and series. No rules and no grants: only the Edge Function reads it, so nobody in the app, admins included, reads a key back. `invoicing_status(org)` (admins and members) says which program, connected, expired, ready, the company and series, never a key. `moloni_status` lost its grant (kept). `invoices.provider` / `provider_document_id`: where a sent draft went; written by the Edge Function only (no column grants); a trigger clears them on insert and whenever an invoice is (back to) a draft |
| Edge Function | `invoicing` (Verify JWT **off**: the OAuth sign-in comes back as a browser visit; every POST checks the caller's token itself). Actions: `providers`, `connect`, `setup`, `save_setup`, `disconnect` (admins), `push`, `sync` (anyone who can read the invoice, by RLS). One adapter per program in `invoicing/moloni.ts`, `invoicexpress.ts`, `toconline.ts` with the same shape (connect, callback, setup, saveSetup, push, sync); the mapping is pure and unit-tested (`src/lib/invoicingAdapters.test.js`). Switching program or going back to by hand empties the row. `push` refuses anything but a complete EUR draft; marks it `sent` with the program and its id. `sync` reads it back: still a draft, gone, or finalised (then `issued` with the number, PDF link, issue and due dates). An invoice sent to a program no longer connected is finished by hand. The old `moloni` function folder is superseded (never deployed) |
| Mapping | **Moloni:** one "AVX service" product, each line with its own name, price, discount and VAT (or exemption code); client found by NIF or added; credit notes linked line by line to the invoice in Moloni. **InvoiceXpress:** `POST /invoices.json` (or `credit_notes.json` with `owner_invoice_id`), client by code (NIF, else `AVX-<client>`), item tax by the account's tax name for the rate, one exemption code per document, dates dd/mm/yyyy, reference `AVX <n>`; read back `FT <series/number>`, the PDF (`api/pdf`, else the document page). No negative lines or mixed 0 % reasons (refused with a plain message). **TOConline:** the older draft API (`/api/commercial_sales_documents` header, then one `commercial_sales_document_lines` call per line on an "AVX-SERVICE" service; the newer `/api/v1` one finalises at once, so it is never used); a client with a NIF is found or created by TOConline; VAT ids by rate (0 %: ISE) and one exemption reason per document; credit notes as NC with `parent_document_reference`; a failed line removes the half-made draft; read back `document_no`, the print link or public link |
| Screens | Invoices page: "Invoicing program" panel (everyone who sees invoices sees the program; admins choose, connect, pick the series, "Back to by hand"), "CSV" downloads the invoices shown, one row per line (`invoiceCsv.js`), for programs without a connector. Invoice window: "Send to <program>" next to "Mark as sent to my program" while it is a draft, "Check <program>" while it waits there; refusals show the program's own words. Company details names the program, with a link to the Invoices page |
| Connected | Invoices (send / check), Company details, help (term "invoicing connection", ⓘ for the program, InvoiceXpress account and keys, the guide step and picture "invoicing-program"), organisation export (`invoicing_connection` file without keys; `program` on `invoices`) |
| Not checked yet | No real account was used in this session: each adapter follows its program's published API. TOConline's draft credit notes and the exact JSON:API content type, InvoiceXpress' credit-note body key and Moloni's deposit-minus line are to be confirmed in the end-to-end test (PENDING T76) before the program goes into `INVOICING_PROVIDERS` |

## How repair charges and payments work (step 12, 0.74.0)

A repair the client should pay for becomes a line on the gig's invoice, once; payments are recorded
against issued invoices, and an invoice is **paid when its payments cover it**. Migration
`20261224000000_repair_charges_payments.sql`; checks in `supabase/tests/payments.sql` (and
`invoices.sql`, updated: "paid" is set by a payment now). No delete statements.

| Piece | How it works |
|---|---|
| Charged repairs | `repairs.invoice_id`: the invoice that bills it. An invoice line may carry `repair_id` (kind `repair`; `invoice_clean_lines` keeps both). After every save of an invoice, `private.invoices_after_step12` links the repairs its lines name and frees those taken out (or all of them when the draft is removed). Refused: a repair of another organisation or not marked "charge client" (22023), or already on another live invoice (23505). From the app the link can't be written, and a billed repair stays "charge client" (`repairs_invoice_guard`, which lets the database's own functions through). Credit notes never carry repairs. The price starts at the repair's cost and is edited like any line; gig finance still leaves charged repairs out of costs (`repairs_charged`) |
| Payments | `invoice_payments`: invoice, `paid_on`, `amount` (> 0), `method` (transfer, mbway, multibanco, card, cash, cheque, other), `note`, `removed_at`/`removed_by`, `created_by`. Admins and members (`can_see_finance`, two-step sign-in when set up). Only issued or paid invoices (not credit notes); not in the future; never more than is left (`invoice_due` − `invoice_paid`, the invoice row locked while checking). A payment can't be edited (only `removed_at` is granted), and a removed one stays removed |
| Paid follows the payments | `private.sync_invoice_paid` after each payment, and after a credit note is issued or removed: paid when payments > 0 and ≥ total − issued credit notes, `paid_on` = the last payment's date; otherwise issued. From the app, `status` can't be moved to or from paid and `paid_on` can't be changed (`invoices_payment_status`, which runs after `invoices_before_write` by name order). A fully credited invoice with no payment stays issued and shows "Credited" |
| Totals | `invoice_summary` keeps its columns: `paid` = payments received (part payments too), `outstanding` and `overdue` = what is left on issued invoices, `last_paid` = the last payment. `payments_by_month(org, from, until)` gives money received per month and currency (for K3). Overdue reminders skip invoices with nothing left and carry `left` in their details |
| JS twin | `src/lib/payments.js`: `invoiceDue`, `paidSoFar`, `leftToPay`, `isPartlyPaid`, `paymentProblem`, `paymentsByInvoice`, `repairLine`, `repairsToBill` (tests in `payments.test.js`) |
| Screens | Invoice window → **Payments** (`InvoicePayments.jsx`) on issued invoices: to pay after credit notes, paid so far, left to pay, the payments (remove with the bin), and the form (date, amount starting at what is left, method, note; the button reads "Mark as paid" when the amount is all that is left). A gig's invoice draft → **Repairs to charge the client** (`ChargedRepairs.jsx`) with "Add to invoice". Invoices list: "… left to pay" on part-paid invoices; the unpaid and overdue totals count what is left. Maintenance: a charged repair says "billed on invoice …" or "not billed yet", and its "Charge the client" box is locked once billed |
| Existing data | Each invoice already marked paid got one payment of its full amount (method "other", its paid date) |
| Connected | Repairs, invoices, Invoices list, gig finance and Contacts (through `invoice_summary`), organisation export (`invoice_payments` file; export function renamed `export_org_part_pre_step12` and wrapped), help (terms "payment" and "repair charged to the client", ⓘ `invoice-payment`, `invoice-repairs`, `repair-charge-client`, guide `office-payments` with two pictures). Client portal (step 26): payments and payment links later |
| Not built | Payment links (MB Way, Multibanco references through easypay or ifthenpay, or Stripe): left for the client portal (step 26), which gives the client a page to pay on and the webhook that records the payment |

## How e-signature works (step 16)

A **simple electronic signature** (not qualified; the owner's choice, 2026-11-09): a drawing made
with a finger, pen or mouse, the signer's typed name (and role or company), the time and the SHA-256
of the exact text that was signed, kept with a signed PDF. No Chave Móvel Digital / Cartão de
Cidadão: a later integration if a client needs one. Migration `20270105000000_signatures.sql`;
checks in `supabase/tests/signatures.sql`. No delete statements.

| Piece | How it works |
|---|---|
| Table | `signatures`: `kind` (`quote_acceptance`, `delivery_note`, and for later `crew_contract` (step 27) and `rigging_signoff` (RG4)), `org_id`, `gig_id`, `quote_id`, `quote_share_id`, `title`, `signer_name`, `signer_role`, `signed_at`, `document` (the signed text: canonical JSON, keys sorted, no spaces), `document_sha256`, `image_path`, `image_sha256`, `pdf_path`, `pdf_sha256`, `created_by`, `removed_at`/`removed_by` |
| Can't be changed | `signatures_before_insert` sets the time, `created_by` and the drawing's path, and refuses a hash that doesn't match the document (23514) or a gig or quote of another organisation. `signatures_guard` (before update, the service role included) freezes every signed field (42501). Allowed: the signed PDF once (null → `<org>/<id>/signed.pdf`), marking removed and back (`removed_by` is the user), and `created_by` → null when that account is erased. Signed-in users only have select, insert and update; anonymous users nothing |
| Who | See: quote acceptances = `can_quote` or the quote's gig managers; delivery notes and rigging sign-offs = everyone on the gig; contracts = the organisation's admins (`private.can_see_signature`). Collect, attach the PDF and hide: delivery notes = `can_dispatch` (who may scan out); rigging = the gig's managers; contracts = admins; quote acceptances: the quoting people may attach the PDF and hide, but a new acceptance only comes from the client's link (`private.can_manage_signature`) |
| Files | Private bucket `signatures` (PNG and PDF, 5 MB): `<org>/<signature>/signature.png` (only by whoever collected it, within 15 minutes of signing) and `signed.pdf` (once, while the row has none). No update or removal policies, so a file can't be replaced. A copy of each signed PDF goes into the gig's files (`assets`, `gig-assets`) for convenience; the kept copy is the one in `signatures` |
| Quote acceptance | On the client's page (`QuotePublicPage`), **Accept** offers "Add a drawn signature (optional)" next to the typed name. `quote-public` checks the PNG (≤ 500 KB), stores it and the row with the version's snapshot as the document, and returns the signature; the page shows it with the hash and puts it into the client's PDF. Removed quotes are still "not found"; cancelled ones can't be answered. If the drawing can't be kept the acceptance stands and the client is told. The notification carries `signed: true` |
| Signed quote PDF | In **Send to client**, an answer with a signature shows "Signed with a drawn signature" and **Signed PDF**: the first time, the app builds the signed version (`buildQuotePdf` with the signature block at the end, from the snapshot kept in the signature), keeps it, and copies it to the quote's gig files (`src/lib/signedQuote.js`) |
| Delivery notes | Packing list → **Delivery note: sign** (for those who may scan out): what went out (scanned) and what was planned, with unit codes, the client's name, role or company, a note and the drawing. The PDF (`src/lib/deliveryNotePdf.js`) is built from the same document that was hashed, kept and copied to the gig's files. Signed notes are listed under the packing list (not printed) with **Signed PDF**, **Hide** and, for hidden ones, **Show again** |
| JS | `src/lib/signatures.js`: `canonicalJson`, `sha256Hex`, `saveSignature`, `attachSignedPdf`, `copyToGigFiles`, `downloadSignatureFile`; `SignaturePad.jsx` (3:1 PNG, dark ink on white whatever the theme); `signaturePdf.js` (`drawSignatureBlock`). quote-public has its own copy of `canonicalJson` |
| Connected | Quotes (client page, Send to client), packing lists, gig files, privacy notice and terms (EN/PT: "Signatures", "Electronic signatures"), data map, help (term `e-signature`, ⓘ `signature.plain`, guides `wh-delivery-note` and `of-signed-quote`) |
| Kept with the gig | A gig with signatures (hidden ones too) can't be erased: the app checks before removing anything (EditGigModal) and `gigs_keep_signatures` refuses it (`20270105000001_signatures_keep_gig.sql`, run by hand; checks in `supabase/tests/signatures_keep_gig.sql`). Cancel the gig instead. Erasing the whole organisation still takes its signatures with it. Accepted quotes can't reach the quote bin, so quote acceptances are safe from its nightly erase |
| Later | Crew contracts (step 27) and the rigger's sign-off (RG4) use the same table, pad and PDF block: `kind` and the rules are already there |

## How vehicles and trips work (step 23, V1)

Vehicles are bookable like crew and equipment: a trip books its vehicle and its driver in the
reservations engine (docs/RESERVATIONS.md), so a van or driver used twice at once shows a clash.
Migration `20270118000000_vehicles_trips.sql` (only adds; the shared `private.gigs_reservations`
and `private.clashes` are not replaced); checks in `supabase/tests/vehicles.sql`.

| Piece | How it works |
|---|---|
| Vehicles | `vehicles`: name, plate, `licence_category` (B, BE, C1, C1E, C, CE, D1, D1E, D, DE or none), `max_load_kg`, `volume_m3`, `cost_per_km`, `cost_per_day` (stored now; gig finance and the vehicle-use report read them later), notes, `removed_at`. Admins and members (`can_quote`) see and manage them in **Inventory → Vehicles**, with each vehicle's coming trips. Removing marks it: it can't be picked for new trips, old trips keep it. Planners who aren't org members pick through `gig_vehicle_choices(gig)` (no costs) |
| Trips | `trips`: one leg per row, `direction` out / back / one_way, `vehicle_id`, `driver_id`, `co_driver_id`, `passenger_ids` (all on the gig's crew), `departs_at`, `arrives_at` (after it, at most 7 days), places, `km`, note, `licence_override`, `removed_at`. Everyone on the gig sees them (`can_access_gig`); the gig's managers and the organisation's admins and members plan them (`private.can_plan_transport`). The gig's **Transport** tab lists them with times on the organisation's clock; "Plan the way back too" or the return button adds the back leg. `gig_trips(gig)` gives each trip with its vehicle's name, plate, licence and capacity (never the costs) and, for planners only, the licence status and clashes |
| Bookings | Triggers keep one reservation per role and trip: `vehicle`/`trip`, `person`/`trip_driver`, `person`/`trip_codriver` (source id = the trip), for the trip's times, status from the gig's (draft = hold, archived or cancelled = cancelled), cancelled when the trip is removed or the role emptied. A gig's status change re-syncs its trips (`trips_reservations_sync`, its own trigger on `gigs`); a renamed vehicle relabels them. So a driver's trip shows where crew bookings already show: other gigs' Crew tab clashes, My work's double bookings and Find crew's busy |
| Clashes | `transport_clashes(gig, trip, vehicle, driver, co_driver, from, until)` for planners while they fill the form, and in `gig_trips`: other non-cancelled reservations of the vehicle and people in that time, without the trip's own rows and the driver's own crew booking on this gig; gig names only where the caller can see the gig. A warning, never a block |
| Licence | `driving_licences` (one row per person, `categories`), set in **Settings → Profile → Driving licence**. Read by the person and the admins of an organisation they belong to (`private.is_admin_of`; shown on the person page). Planners who aren't admins only get ok / missing / unknown (`driver_licence_check`, `licence_status` in `gig_trips`). The rule (`private.licence_covers`, `licenceCovers` in `src/lib/transport.js`): a category covers itself; C covers C1; CE covers C, C1E and BE; C1E covers BE and C1; D covers D1; DE covers D, D1E and BE; any C or D category means B. Missing or unknown is a warning the planner overrides by ticking "I've checked"; the trip keeps `licence_override` |
| Driving hours | `time_entries.driving_minutes` (0–1440) next to travel. The day form fills it from the gig's trips where the person drives that day (`drivingMinutes`, split across midnight on the organisation's clock); `review_time_entry` stores `split.driving`. Priced like travel: at the plain hourly rate (`entryCost`). Totals and the hours CSV show driving apart from the hours on site |
| Later in step 23 | Packing list per vehicle with weight against capacity (V3); transport cost into gig finance, expenses linked to a vehicle and the vehicle-use report (V4) read `max_load_kg`, `volume_m3`, `cost_per_km`, `cost_per_day` and the trips' `km`; appointments (V2) |

## Planned

Specs for the business steps still to build, in ROADMAP.md order. Each is a starting point: the
session that builds it reads its spec, checks it against the code, and **asks the owner the
questions marked "Ask" before outlining the migration**. When built, the spec is replaced by a
"How … works" section above.

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
  conversations they already have through quote links, and their balance from K3's
  `client_balance(org, client)` (docs/ANALYTICS.md, "How K3 works"): it runs as the reader, so the
  portal calls it through a security-definer wrapper that checks the client's token first.
- **Booking requests:** a public form per organisation (dry hire): pick catalogue items and dates,
  see indicative availability, send → a draft quote and a notification. Spam protection.

### 27 · Freelancer side: contracts [25], invoicing [26], work history [24]

- **Contracts** generated from an accepted crew call or job offer (dates, fee, terms), signed by
  both with step 16. Ask: start with a Portuguese "prestação de serviços" template?
- **Freelancer invoicing:** a summary of approved hours and fees per company and month to issue a
  "recibo verde" on the AT portal (AVX never issues it).
- **Work history** on crew profiles: gigs done on AVX, shown only with the company's permission.
- Freelancer invoicing and the work-history counts reuse K8's monthly summary (crew numbers in My
  work): `public.my_monthly_summary(from, until, org)`, one row per company and month (docs/ANALYTICS.md,
  "How K8 works").

### 28 · Public API and webhooks [17]

- Tokens per organisation with scopes; read gigs, schedule, crew, equipment; write availability.
  Webhooks on gig, quote and crew changes. Rate limits, audit log. Unlocks the cueing app (R3),
  accounting sync [18], payroll export [23] and an MCP server [19].

### 30 · Rental network [21], RFID [20]

- **Rental network:** AVX companies that opt in see each other's available stock (not prices unless
  shared) and send a subrental request in two clicks (builds on cross-hire codes, I6).
- **RFID:** only with a hardware partner; QR covers most companies. Plan when asked.

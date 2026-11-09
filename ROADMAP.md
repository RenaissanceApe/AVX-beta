# Roadmap

The one list of what is built and what comes next, in order. Each feature set is built in **its
own session** with the prompt for it in [docs/SESSION_PROMPTS.md](docs/SESSION_PROMPTS.md); that
session reads this file, [CLAUDE.md](CLAUDE.md) and the design doc named in its row, nothing else
up front. What each release changed is in [CHANGELOG.md](CHANGELOG.md).

## Built

| Area | Versions | How it works |
|---|---|---|
| Accounts, organisations, gigs, files, feed, schedule, call sheet, activity, calendar, installable app | 0.2–0.5 | [README.md](README.md), [SETUP.md](SETUP.md) |
| Notifications and daily email summary, offline mode, magic links, two-step sign-in, usage counts, browser tests | 0.5–0.10 | [docs/EMAIL.md](docs/EMAIL.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/USAGE.md](docs/USAGE.md), [docs/TESTING.md](docs/TESTING.md) |
| Quotes: builder, templates, versions, price list, branding, send to client, PDF, quote → gig | 0.7–0.10 | [docs/QUOTES.md](docs/QUOTES.md) |
| Navigation and workspaces | 0.11 | [docs/NAVIGATION.md](docs/NAVIGATION.md) |
| Bookings, clashes, reservations engine | 0.12 | [docs/RESERVATIONS.md](docs/RESERVATIONS.md) |
| Inventory I1–I7: catalogue, availability, warehouse scanning, kits, maintenance, subrentals, reports | 0.13–0.19 | [docs/INVENTORY.md](docs/INVENTORY.md) |
| "Your network" picker | 0.20 | [docs/CREW_NETWORK.md](docs/CREW_NETWORK.md) |
| Messaging M1–M6b (M5b not built) | 0.21–0.28 | [docs/MESSAGING.md](docs/MESSAGING.md) |
| Help and inclusion H1–H5b (H6 not built) | 0.29–0.35 | [docs/HELP.md](docs/HELP.md) |
| Field tools F1–F4: stage plot, input list, patch, DMX patch, light plot, sound system calculator | 0.36–0.40 | [docs/FIELD_TOOLS.md](docs/FIELD_TOOLS.md) |
| Switching S1–S5: import wizard, contacts, crew and jobs import, Rentman exports, organisation export | 0.41–0.47 | [docs/SWITCHING.md](docs/SWITCHING.md) |
| Crew network N1–N5: profiles, Find crew, job board, trust, alerts | 0.48–0.53 | [docs/CREW_NETWORK.md](docs/CREW_NETWORK.md) |
| Steps 1–4: rehearsal companion R1–R2, DMX calculator D1, On-site mode | 0.54–0.57 | [docs/TOOLS_PLAN.md](docs/TOOLS_PLAN.md) |
| Steps 5–7b: tasks T1–T2, gig statuses and types, custom fields, crew rates and labour cost, fees in crew calls, job posts and quotes | 0.58–0.65 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| Step 8: time registration (hours per day, approval, actual labour cost) | 0.66.0 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| Step 9: leave requests (types, approval, holiday days, working week, who is away) | 0.67.0 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| Step 9b: expenses (ledger with receipts, categories, VAT, claims, recurring costs, links so each cost counts once) | 0.68.0 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| K0: capture for reports (quote dates and lost reasons, a client on gigs, equipment costs) | 0.64.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K1: reports engine (one revenue rule in SQL and JS, periods, report parts and charts), the Reports area with its Overview, key numbers on Home, Inventory reports counted in the database | 0.69.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| Lumen & Pixel design language: themes, square UI, type, status squares, AVX glyph | 0.70.0 | [DESIGN.md](DESIGN.md) |
| Step 10: gig finance overview (panel per gig, Reports → Gig margins, margin tiles and card hints, `gig_finance` for K2) | 0.71.0 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| Step 11: invoices (VAT per line on quotes, drafts from accepted quotes, issued in your own invoicing program, credit notes, overdue reminders) | 0.72.0 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| Step 11b: invoicing program connectors (Moloni, InvoiceXpress, TOConline: drafts sent, numbers read back; each switched on after a real-account test), CSV of invoices | 0.73.0 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| Step 12: repairs charged to the client (added once to the gig's invoice draft), payments against invoices (part payments, paid when covered) | 0.74.0 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| K2: money, results and margins (Reports → Money: results with overheads and depreciation, margins by type, status, client, kind and PM, planned against actual labour; `finance_results`; four money tiles) | 0.75.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K3: money, cash, spending and forecast (Reports → Money: cash position three months ahead, overdue by age, client balances, spending with the biggest changes, forecast with the win rate beside it, budgets and a revenue target; four cash tiles) | 0.76.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K4: sales and clients (Reports → Sales: quotes waiting and to follow up, win rate by period, gig type, client, author, lost reason or a choice field; clients with revenue, margin, gigs, new and returning; a numbers card in Contacts; a follow-up filter in Quotes; three tiles) | 0.77.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K5: equipment money (Reports → Equipment: profit per item, category and unit, payback, buy or keep hiring in, purchase-cost coverage; item numbers card; "buy instead?" on subrentals; three tiles) | 0.77.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K6: warehouse and upkeep (Reports → Warehouse: demand against stock and idle gear, suppliers, damage and loss with inspections, dispatch; three tiles) | 0.77.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K7: operations and people (Reports → Operations: activity, people, staffing, tasks; gig wrap-up; person page for admins; a "cancelled" gig status; four tiles) | 0.77.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K8: crew numbers (My numbers in My work, year statement per company, fee paid and received, Expenses → Crew to pay, crew fees in the cash position; a tile) | 0.77.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| K9: report extras (weekly key-numbers email for admins, saved views pinned to the Overview, monthly management pack PDF, read-only accountant link) | 0.77.0 | [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| Design refresh DR1–DR6, "room to breathe": layout pieces (Section, Stack, PageHeader, SwipeRow, MoreMenu), Arrange home and the slim First steps, the gig page, lists, detail pages and editors, field and crew screens, every screen on the type and spacing scales (a test fails on any off-scale size or gap), all help screenshots retaken | 0.78.0 | [docs/DESIGN_REFRESH.md](docs/DESIGN_REFRESH.md), [DESIGN.md](DESIGN.md) |
| Step 13: A1 speaker library (speaker specs and rigging data on catalogue items, presets for ten models from the manufacturers' documents, catalogue speakers in the sound system calculator, speaker columns in the import) | 0.79.0 | [docs/INVENTORY.md](docs/INVENTORY.md), "How the speaker library works" |
| Step 14: MVR/GDTF import and MVR export (fixtures with type, mode, footprint, place and address into the DMX patch and light plot, matched to the catalogue; GDTF modes, weight and power on catalogue items; MVR export with GDTF files; Vectorworks, grandMA3 and Capture styles) | 0.79.0 | [docs/FIELD_TOOLS.md](docs/FIELD_TOOLS.md), "How MVR and GDTF work" |
| Step 16: e-signature (signature pad, `signatures` table and private bucket, signatures that can't be changed, signed PDFs; quote acceptance and delivery notes; ready for crew contracts and rigger sign-off) | 0.79.0 | [docs/BUSINESS.md](docs/BUSINESS.md), "How e-signature works" |
| Step 15: P1–P2 power and cables (electrical fields on catalogue items and in the import; supply, distros, outputs, loads from every tool and typed by hand; currents per phase and output, neutral, headroom, balance, generator size; connected statuses; cable runs with voltage drop and capacity by type and laying; cable list → gig equipment and packing list; phase balancing and fill-to-reserve suggestions shown before applying; inrush groups; distro and cable labels; report and PDF in gig files) | 0.80.0 | [docs/FIELD_TOOLS.md](docs/FIELD_TOOLS.md), "How the power tool works" |
| Step 17a: RG1 rigging weights, points and hoists (truss lines, hang points, a continuous-beam solver, hoist WLL and class check; hoist models; light plot "Rigging: not checked" and Tools tab connected) | 0.80.0 | [docs/TOOLS_PLAN.md](docs/TOOLS_PLAN.md), "How RG1 works" |
| Step 18: RG3 line arrays (arrays in the rigging tool, bumper limits from the manufacturers' manuals, pick loads from the centre of gravity, the speaker rigging sign-off; connected to the sound system calculator, RG1 truss lines and gig equipment) | 0.80.0 | [docs/TOOLS_PLAN.md](docs/TOOLS_PLAN.md), "How RG3 works" |
| Truss load tables (data only, waiting for a second check) | 0.60 | [docs/TRUSS_DATA.md](docs/TRUSS_DATA.md) |
| Privacy and security check: data map, OWASP review, sign-in failure tests | 0.62.1 | [docs/DATA_MAP.md](docs/DATA_MAP.md), [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) |

## What's left, in order

Built in dependency order: nothing before what it needs. **"Connect"** lists the earlier features
that must pick up the new one; that linking is part of the step's PR, not a later clean-up, and
the PR description and CHANGELOG say what was connected. Numbers in brackets are from
[docs/COMPETITOR_RESEARCH.md](docs/COMPETITOR_RESEARCH.md). Step numbers are fixed (code and
migrations refer to them). "Prompt" is the section of docs/SESSION_PROMPTS.md to paste. **K** rows
are the dashboards and analytics pack ([docs/ANALYTICS.md](docs/ANALYTICS.md)), each placed after
the data it counts.

| # | What | Needs | Connect | Plan | Prompt |
|---|---|---|---|---|---|
| 17b | **RG2** trusses, bridles, hardware (RG1 is built) | RG1, truss tables | Bridle pocket tool, truss-table review screen | TOOLS_PLAN.md §5, TRUSS_DATA.md | S13 |
| 19 | **RG4** rigging plot, report, sign-off, **engineer's pack** and **measured loads** (D33) | RG1–RG3, job board, 16 | Gig files, on-site view, job board prefill, supplier-style link (send to an engineer), QR on the report (U6) | TOOLS_PLAN.md §5, "Decided (2026-11-03)" | S15 |
| 19b | **TradeShowLoads export** (`.tsle`, D34), if the format can be had openly | 19 | Rigging report, gig files | TOOLS_PLAN.md "Decided (2026-11-03)" | S15b |
| 20 | **RG5** suggestions; **P3** one-line diagram (with the data chain), move-loads grid and on-site power checklist | RG4, P2 | On-site mode | TOOLS_PLAN.md §4–5, "Decided (2026-11-03)" | S16 |
| 20b | **Work areas** (D35): positions, fixtures and gear grouped into areas, each a task with people, build time, instructions, a QR sheet and progress | 20, tasks, U5, U6 | Tasks, light plot positions, power and rigging plots, On-site mode, labels, prints | TOOLS_PLAN.md "Decided (2026-11-03)" | S16b |
| K10 | **Safety and compliance**, only if you say yes (D27): overdue inspections on booked gear, expiring certificates, missing sign-offs, a safety pack per gig | I5, 16, 19, 20, K1 | Equipment tab, maintenance, crew profiles, rigging report, power checklist, gig files | ANALYTICS.md | K10 |
| 21 | **A2** coverage map, **A3** prediction and measurement files | 13, F4 | Gig files, tuning sheet | TOOLS_PLAN.md §6 | S17 |
| 21b | **A4–A6** own simulator by level of detail | A1–A3, RG1, RG3 | A2 map, system calculator, tuning sheet | TOOLS_PLAN.md §6 | S18, S19, S20, S20b |
| 22 | **Shareable rider / advance page** [28] | stage plot, inputs, patch, P, RG | Power and rigging summaries; line-up start and readiness check (from StageKit) | BUSINESS.md | S21 |
| 22b | **Venue pages**, only if you say yes (decision D14) | 22, P1, RG1 | Gig address, call sheet, power supply, rigging points | TOOLS_PLAN.md "Proposed" | S22 |
| 23 | **Vehicles and transport** [8] (with a split-across-vehicles suggestion), **appointments** [9] | reservations, item weights | Packing list per vehicle, calendar, clashes, gig finance (running costs), expenses, vehicle-use report | BUSINESS.md | S23 |
| K11 | **Sustainability report**, only if you say yes (D28): transport, energy and estimated emissions per gig | 8, 15, 23, K1 | Trips, power plan, gig files, Reports | ANALYTICS.md | K11 |
| 24 | ~~Reports~~ [11]: covered by K1–K8, and vehicle use by step 23 | — | — | ANALYTICS.md | — |
| 25 | **Gig templates** [7] | everything above | Copies schedule, positions, equipment, tools, tasks, custom fields | BUSINESS.md | S25 |
| 26 | **Client portal** [13], **online booking requests** [14] | 11, quotes | Quote links, guest threads, the client's balance (K3) | BUSINESS.md | S26 |
| 26b | **M5b** email replies (needs inbound email on the domain) | messaging, 26 | Email summary, client and supplier threads | MESSAGING.md | S27 |
| 27 | Freelancer side: **contracts** [25], **invoicing** [26], **work history** [24] | 7, 8, 16 | Crew profiles, crew calls, K8's monthly summary | BUSINESS.md | S28 |
| 28 | **Public API and webhooks** [17] | stable data model | Cueing app, accounting sync [18], payroll export [23], MCP [19] | BUSINESS.md | S29 |
| 29 | **R3** cueing app bridge | R1, tasks, 28 | Cueing app roadmap starts here | TOOLS_PLAN.md §2 | S30 |
| 30 | Rental network [21], RFID [20] | 28, inventory | Subrentals | BUSINESS.md | S31 |

**Upkeep sessions**, run whenever there's a gap (each is small and independent):

| What | Why | Prompt |
|---|---|---|
| Organisation time zone (D10) | Everything is read as Lisbon time; needed before companies abroad join | U1 |
| React Router 7, current Vite and Vitest | Remaining advisories (docs/SECURITY_REVIEW.md) | U2 |
| Data map open items: trim the crew-search log and old notifications, held-invitation time limit | docs/DATA_MAP.md | U3 |
| Truss tables: mark checked or update from the manufacturers' answers (D12, D13) | Needed before RG2 can use them | U4 |
| Label templates in three standard sizes, on rolls or sheets (D31) | Cases, units and cables labelled for any printer | U5 |
| A QR and print date on every print (D32) | An old paper copy is easy to spot | U6 |

**QA bot** ([docs/QA.md](docs/QA.md)), decided 2026-11-02. Run these in order, in any gap; each needs
a few minutes of setup from you (QA.md, "Build order and when you step in"):

| What | Why | Prompt |
|---|---|---|
| QA1 Foundations: Mailosaur inbox, QA accounts on the test project, the SQL access-rule tests in CI | Everything below needs them; the 57 SQL tests stop depending on someone pasting them | QA1 |
| QA2 Live checks after each merge, a daily real sign-up, the QA tag that keeps QA accounts out of your numbers | Every merge goes live; this checks the live app straight away | QA2 |
| QA3 The AI tester on each PR before merge | Tests each change like a person, and writes fixed tests for what it confirms | QA3 |
| QA4 Catch-up, one area per run (repeat) | Inventory, messaging, crew network, tasks, field tools and import have no browser tests (import: after IM2, only what IM's own tests don't cover) | QA4 |

**Import overhaul** ([docs/SWITCHING.md](docs/SWITCHING.md), "Import overhaul: fix it here"), decided
2026-11-04 (D38). Run these in order, in any gap:

| What | Why | Prompt |
|---|---|---|
| IM1 Fix it in the check: every problem gets a fix on the spot (add the missing location, use one you have, edit the cell, read an unknown word as a known one), grouped so one choice fixes every row; what a fix adds is saved only on Import; the check predicts what the database would refuse | Today every problem's only answer is "fix the file and import it again" | IM1 |
| IM2 Before and after the check: a sheet picker, the heading row, files saved on Windows, more than 5000 rows, month/day dates, one value for every row, "fix and try again" after the import, left-out rows downloaded with their data, columns going into your custom fields | The same dead ends in the other steps; custom fields can't be imported today | IM2 |
| IM3 The database part (migration outlined for your yes first): one undo for the import and what it added, picking the exact record when two share a name, restoring archived equipment, fixes remembered with a saved matching, undo saying what's in use, equipment counted in bulk switched to per unit when its units are imported | Finishes "nothing changes until Import, and one undo takes it all back"; ends a known limitation | IM3 |
| IM4 History import (D26): past jobs as completed gigs, quotes with their accepted or declined status and dates (migration outlined for your yes first) | Year-on-year reports work from the day a company switches | IM4 |

## End of the build

1. **Final test pass** from [docs/PENDING.md](docs/PENDING.md) section 2 (run once, by you).
2. **Public site, pricing, billing and public help** P1–P5 ([docs/PUBLIC_SITE.md](docs/PUBLIC_SITE.md)), prompts P1–P5.
3. **Phone app decision** (D11): a wrapper around this app, or the installed web app.
4. **H6** (ask for help, more languages, SMS/WhatsApp, video guides): only as asked ([docs/HELP.md](docs/HELP.md)).

## Before a public launch

- Full terms of use replacing the beta terms, including the rigging disclaimer (TOOLS_PLAN.md
  "Decided") and a data processing agreement for organisations (DATA_MAP.md open items).
- Legal review of the privacy notice and terms.
- Leaked-password protection and daily restorable backups (Supabase Pro); Vercel Pro (commercial use).
- Custom domain for the app.

## After launch

Planned, not scheduled: built once the public launch has settled. Prompts are in
docs/SESSION_PROMPTS.md ("After launch"), plans in [docs/ANALYTICS.md](docs/ANALYTICS.md).

| # | What | Needs | Prompt |
|---|---|---|---|
| K12 | **Crew: all income**: work outside AVX, the person's own costs, a year statement covering everything | K8, 9b | K12 |
| K13 | **Crew-owned gear for hire**, run as a one-person organisation so inventory and cross-hire work unchanged | I6, K8, 12 | K13 |
| 9c | **AT e-Fatura purchase invoices**: import the file from the portal as expenses, through the import wizard and its fix panel (IM1). Waits for a sample file from you (the format isn't published) | 9b, IM1 | — |
| — | Ideas, only if you say yes (D29): market insights, client feedback, a platform dashboard for you, expense automation | — | — |

## Known limitations (beta)

- The email summary goes out once a day, not instantly.
- Quotes need a connection.
- Invoices are issued in your own certified program. Moloni, InvoiceXpress and TOConline can send
  drafts and read numbers back once each is switched on; other programs: by hand or the CSV.
- Availability is checked only for quote lines added from the price list.
- Gig days are read in Lisbon time (U1).
- Offline mode is read-only except rehearsal notes and messages, which are sent when back online.
- The quote PDF uses standard PDF fonts, so it looks slightly plainer than the printed page.

# Competitor research: what AVX is missing, ranked

A research note, meant to be re-run every few months to challenge the roadmap. Each run adds a
dated section at the bottom ("Changes since the last run") rather than rewriting history.

**Run 1: 2026-10-26.** Compared: Rentman, Crewbooking, StageKit, LumiStage (asked for), plus the
reference tools named for the new field tools (Earwig, NEXT X-Rig, loadcalc, EASE Focus, DMX
calculators). AVX state: 0.51.0 (crew network N4).

## How this was done, and its limits

- Web search only. Pages could not be opened directly from the build machine, so features come from
  search summaries of vendor pages, help centres, app-store listings and reviews. Vendor marketing
  claims are marked as such where it matters; nothing was tried hands-on except Rentman's data
  model, which the mock Rentman account shows (every kind of record it has: projects, subprojects,
  functions, crew rates and factors, time registration, leave, appointments, vehicles, tasks,
  invoices, payments, purchase orders, costs, ledger codes, tax classes, serial numbers, stock
  movements, repairs, subrentals, project requests, project templates, custom fields, files…).
- **LumiStage**: not found. lumistage.online does not resolve from here and every search result is
  an unrelated anime game of the same name. As it launches this month, it may simply not be indexed
  yet. **Send me a link, screenshots or a feature list** and I'll add it in the next run.
- **StageKit**: not found under that name. Searches return Stage Kit (virtual-event branding),
  STAGE.KIT (motion capture), StagePro (theatre stage management) and a family of stage-plot/rider
  apps (StageOn, Stagediver, ArtistRider/StageRider). The rider apps are covered below because they
  overlap with AVX's field tools; **tell me which product you meant**.
- **Crew Booking**: taken to be **Crewbooking** (Brussels/Walhain, crewbooking.io): a marketplace
  and app for audiovisual and event crew ("missions", profiles, skill filters, interim contracting
  and payment).

## Where AVX stands

| Area | AVX today | Rentman | Crewbooking |
|---|---|---|---|
| Gigs/projects, schedule, call sheet | ✅ (gigs, schedule, call sheet, phases on quotes) | ✅ projects + subprojects, project types and statuses, templates | — |
| Crew planning: positions, invites, availability, clashes | ✅ | ✅ (drag-and-drop planner, skill matching) | partial (missions) |
| Crew job board / freelancer pool | ✅ N1–N4 | ✅ job board for own crew | ✅ core of the product |
| Leave / unavailability | partial (unavailable dates; no types, no approval, no balance) | ✅ leave requests with approval, types, balances, payroll export | — |
| Time registration / timesheets | ❌ | ✅ (prefilled forms, overtime, export) | — |
| Crew rates and labour cost | ❌ | ✅ rates, factors (overtime/weekend), cost per function | — |
| Tasks and to-dos | ❌ (schedule items only) | ✅ tasks with deadlines, "up for grabs"; new **Organize** product (pre/post-production project management, Oct 2026) | — |
| Appointments (non-gig calendar items) | ❌ | ✅ | — |
| Vehicles and transport | ❌ (reservations engine is ready for it) | ✅ vehicles, drivers, distances | — |
| Quotes | ✅ versions, phases, templates, branding, send, accept, PDF | ✅ document builder, e-signature | — |
| Invoices, payments, credit notes | ❌ | ✅ invoices, installments, Stripe payments, accounting sync (Exact, Xero, QuickBooks) | partial (secure payment, interim) |
| Project finance (costs, margin) | ❌ | ✅ costs, purchase orders, financial overview per project | — |
| Inventory: catalogue, units, locations, kits, alternatives | ✅ | ✅ | — |
| Scanning, packing, steps | ✅ QR/barcode, camera | ✅ QR/barcode, **RFID** | — |
| Repairs, inspections | ✅ | ✅ (plus damage charged to the client) | — |
| Subrentals | ✅ | ✅ (plus rental network between companies) | — |
| Online booking requests / webshop | ❌ | ✅ project requests, Shopify integration | — |
| Client-facing pages | partial (quote link + thread, supplier link) | partial (online quote approval; no full portal found) | — |
| Custom fields | ❌ | ✅ extra input fields | — |
| Reports and dashboards | ❌ (usage analytics only) | ✅ utilisation, financial overviews | — |
| API, webhooks, AI (MCP) | ❌ | ✅ public API (expand, bulk), **Rentman MCP** (public beta) | — |
| Field tools (stage plot, input list, patch, DMX, light plot, system calc) | ✅ | ❌ | — |
| Messaging, announcements, guest threads | ✅ | partial (crew communication, notifications) | partial |
| Accessibility, help, PT/EN | ✅ | partial (many languages) | — |

AVX's edge: the field tools, messaging, the crew network with trust, accessibility and help. The
gaps are almost all on the **business side** (time, cost, invoicing, transport, tasks, reports)
and in **integrations**.

## Ranked: what to build first

Scored on three things: how much it matters to AVX's users (production companies and freelancers in
Portugal and Europe, small to mid-size), how well it fits what's built (reuses data AVX already
has), and the effort. **Tier 1** is the next year's backbone; **tier 4** is "only if asked".

### Tier 1: closes the loop from quote to money (high value, builds on what exists)

| # | Feature | Why first | Builds on | Effort |
|---|---|---|---|---|
| 1 | **Invoices from accepted quotes** (numbering, VAT per line, credit notes, PDF, status paid/overdue) | Every company invoices; today they leave AVX to do it. In Portugal invoices must come from **certified software** (AT), so the first step is an export/hand-off to a certified program (InvoiceXpress, Moloni, Vendus, TOConline) rather than issuing legal invoices ourselves | Quotes, contacts, branding | M (hand-off) / XL (certified) |
| 2 | **Time registration** (crew log hours per gig, prefilled from the schedule; overtime; PM approves; export) | Freelancers and companies both need it to get paid; Rentman's most-used crew feature after planning | Gigs, schedule, crew, positions | M |
| 3 | **Crew rates and labour cost** (rate per person/function, day/half-day/hour, overtime and weekend factors) → cost on the gig and in the quote | Needed for margins and for time registration to mean money | Positions, crew network rates (applications) | M |
| 4 | **Gig finance overview** (quote total vs equipment, subrental, crew and other costs; margin) | Owners want "did we make money?"; all inputs exist after 1–3 | Quotes, subrentals, 2–3 | S–M |
| 5 | **Leave requests with approval** (types, approve/refuse, balances for staff) | Turns unavailable dates into a staff tool; small step from what exists | Crew unavailability, notifications | S |
| 6 | **Tasks / to-dos** on a gig and in the organisation (assignee, deadline, checklist templates per gig type) | Production work is lists; AVX has schedule items but no "who does what by when"; Rentman just launched a whole product for it | Gigs, members, notifications, messaging cards | M |

### Tier 2: day-to-day completeness

| # | Feature | Notes | Effort |
|---|---|---|---|
| 7 | **Gig templates** (copy a gig's schedule, positions, equipment, tools, tasks) | Huge time saver for recurring shows; Rentman has project templates | S–M |
| 8 | **Vehicles and transport** (vans/trucks as bookable resources, driver, trips, load list per vehicle, weight/volume) | The reservations engine already supports it | M |
| 9 | **Appointments** (non-gig calendar items: site visits, meetings, warehouse days) shown in calendars and clashes | Small; uses reservations | S |
| 10 | **Custom statuses and gig types** per organisation (e.g. "option", "confirmed", "invoiced") with colours | Every company uses its own words | S |
| 11 | **Reports**: equipment utilisation and revenue per item, crew days per person, gigs per client, quote win rate | Uses existing data; mostly views and CSV | M |
| 12 | **Custom fields** on gigs, contacts and items | Covers the long tail ("PO number", "venue capacity") without new features | M |
| 13 | **Client portal** (one link per client: their quotes, documents, call-sheet-lite, messages, pay) | Extends quote links and guest threads | M |
| 14 | **Online booking requests** (a public form or widget for dry hire: pick items and dates → a draft quote) | Rentman's Shopify route; good for rental-heavy companies | M |
| 15 | **Damage charged to the client** (repair cost onto the invoice) | Small once invoices exist | S |
| 16 | **E-signature on documents** beyond quote acceptance (packing slips/delivery notes on site, crew contracts) | Signature pad on the phone; stored PDF | S–M |

### Tier 3: integrations and scale

| # | Feature | Notes | Effort |
|---|---|---|---|
| 17 | **Public API and webhooks** (read gigs, equipment, crew; write availability) | Unlocks integrations and the standalone cueing app | M–L |
| 18 | **Accounting sync** (Portuguese certified invoicing first: InvoiceXpress/Moloni/TOConline; then Xero/Exact/QuickBooks) | Follows 1 | M each |
| 19 | **AI assistant / MCP server** for AVX data | Rentman shipped one; AVX's help centre plan (P-phase) already points this way | M |
| 20 | **RFID** check-in/out | Needs hardware partners; QR covers most companies | L |
| 21 | **Rental network between AVX companies** (see each other's available stock and subrent in two clicks) | AVX already links suppliers that are on AVX; this makes it a marketplace | L |
| 22 | **Payments** (Stripe/MB Way/Multibanco references on invoices and deposits) | After 1 | M |
| 23 | **Payroll export** (hours and leave in the format of PT payroll tools) | After 2 and 5 | S–M |

### Tier 4: from Crewbooking and the rider apps (marketplace depth)

| # | Feature | Notes | Effort |
|---|---|---|---|
| 24 | **Work history on crew profiles** (gigs done on AVX, with companies' permission; "worked with" already counts them) | Crewbooking's "tag companies in past projects"; strengthens trust (N4) | S |
| 25 | **Contracts for freelancers** (generated from an accepted crew call: dates, fee, terms; both sign) | Legal templates per country; start with PT "prestação de serviços" | M |
| 26 | **Freelancer invoicing** ("recibo verde" reminder/export from accepted jobs and hours) | Freelancers' biggest admin pain in PT; must hand off to the AT portal, not issue receipts | M |
| 27 | **Interim/agency payroll** (Crewbooking-style) | Requires being an employer of record; not a software feature; skip | — |
| 28 | **Shareable rider / advance page** (stage plot + input list + patch as one public link for the visiting engineer, no account; ArtistRider/StageOn) | AVX has all the parts and prints; this is a share link | S |
| 29 | **MVR/GDTF import** for the light plot and DMX patch (fixtures, footprints, positions from Vectorworks/grandMA) | Pro lighting users expect it; the DMX tools apps advertise it | M–L |

### Incomplete pieces already in AVX (cheap wins)

| Built | What's missing |
|---|---|
| Unavailable dates | Types (holiday, sick, training), approval, balance → #5 |
| Quote acceptance | Typed-name acceptance only; no drawn signature or signed PDF stored → #16 |
| Quote phases | No gig phases/subprojects with their own dates and crew (Rentman subprojects) |
| One VAT rate per quote | VAT per line (needed for invoices) |
| Organisation time zone fixed to Lisbon | A setting per organisation (D10 in PENDING; needed for the international job board) |
| Light plot power estimate | Distribution to distros/phases and cable runs → the power tool in TOOLS_PLAN.md |
| Light plot weights per position | Rigging loads, hoists and bridles → the rigging tool in TOOLS_PLAN.md |
| DMX patch | Dipswitch view and address calculator → TOOLS_PLAN.md |
| Supplier links to AVX companies | Shown as "on AVX", not by name (D7) → #21 |
| Calendar feed | Read-only; no appointments of one's own → #9 |
| Help guides | No in-app search across guides; no AI help yet (planned in PUBLIC_SITE) |

## Suggested order

1. Settings layout (asked), crew network N5, rehearsal companion R1–R2 (asked as the next tool).
2. **Business loop:** crew rates (#3) → time registration (#2) → leave approval (#5) → gig finance (#4)
   → invoices hand-off (#1, starting with an export to a Portuguese certified program).
3. **Daily completeness:** tasks (#6) with gig templates (#7), custom statuses (#10), appointments
   (#9), vehicles (#8).
4. Field tools from TOOLS_PLAN.md in its order (DMX calculator, power, rigging, sound).
5. Reports (#11), client portal (#13), API (#17) as the cueing app needs it.

## Sources (run 1)

- Rentman: [GetApp listing](https://www.getapp.com/all-software/a/rentman/), [Software Advice](https://www.softwareadvice.com/retail/rentman-profile/), [Rentman vs Current RMS](https://rentman.io/rentman-vs-current-rms), [crew scheduling](https://rentman.io/product/crew-scheduling-software), [9 key features of crew scheduling software](https://rentman.io/blog/9-key-features-of-crew-scheduling-software-in-2026), [leave management](https://support.rentman.io/hc/en-us/articles/24569529468562-Leave-Management), [time registration](https://support.rentman.io/hc/en-us/articles/360015498439-Time-Registration-Module), [crew pricing](https://rentman.io/pricing/crew), [inventory management](https://rentman.io/solutions/inventory-management), [repairs and inspections](https://rentman.io/solutions/repairs-inspections), [quoting and invoicing](https://rentman.io/product/quoting-invoicing), [Shopify integration](https://rentman.io/integrations/shopify), [product updates](https://rentman.io/product-updates), [Organize launch](https://rentman.io/blog/rentman-launches-organize), [API changelog](https://support.rentman.io/hc/en-us/articles/26707946497042-Rentman-API-Changelog), [mobile app changelog](https://support.rentman.io/hc/en-us/articles/33064984123538-Changelog-Rentman-Mobile-App)
- Crewbooking: [crewbooking.io](https://crewbooking.io/), [TPi article](https://www.tpimagazine.com/crewbooking-reuniting-people-under-one-platform/), [Wallimage](https://www.wallimage.be/en/studios/crewbooking-sprl/), [App Store](https://apps.apple.com/be/app/crewbooking/id1519444823)
- Rider/stage-plot apps (for "StageKit"): [Startion ArtistRider](https://startion.io/en/artistrider), [StageRider](https://startion.io/en/stagerider), [StageOn](https://stageon.app/), [Stagediver](https://stagediver.app/), [SoundGirls list](https://soundgirls.org/list-of-apps-and-software-for-designing-stage-plots/)
- Field-tool references: see TOOLS_PLAN.md

## Changes since the last run

(First run.)

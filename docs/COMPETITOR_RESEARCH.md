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
- **LumiStage**: compared on 2026-10-27 from its own site (see "Changes since the last run"). Run 1: not found. lumistage.online does not resolve from here and every search result is
  an unrelated anime game of the same name. As it launches this month, it may simply not be indexed
  yet. Link received on 2026-10-26 (lumistage.online/uygulama), but this environment's network policy
  blocks the site; it gets compared once the domain is allowed, or from screenshots or a feature list.
- **StageKit**: compared on 2026-10-27 from its own site (see "Changes since the last run"). Run 1: not found under that name. Searches return Stage Kit (virtual-event branding),
  STAGE.KIT (motion capture), StagePro (theatre stage management) and a family of stage-plot/rider
  apps (StageOn, Stagediver, ArtistRider/StageRider). The rider apps are covered below because they
  overlap with AVX's field tools. The product meant is at stagekit.fsnipes.com (link received on
  2026-10-26); that domain is blocked here too, so it gets compared on the next run.
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

## Order

The order these are built in is kept in [ROADMAP.md](../ROADMAP.md) ("What's left"), with the
numbers in brackets pointing back to the rows above.

## Sources (run 1)

- Rentman: [GetApp listing](https://www.getapp.com/all-software/a/rentman/), [Software Advice](https://www.softwareadvice.com/retail/rentman-profile/), [Rentman vs Current RMS](https://rentman.io/rentman-vs-current-rms), [crew scheduling](https://rentman.io/product/crew-scheduling-software), [9 key features of crew scheduling software](https://rentman.io/blog/9-key-features-of-crew-scheduling-software-in-2026), [leave management](https://support.rentman.io/hc/en-us/articles/24569529468562-Leave-Management), [time registration](https://support.rentman.io/hc/en-us/articles/360015498439-Time-Registration-Module), [crew pricing](https://rentman.io/pricing/crew), [inventory management](https://rentman.io/solutions/inventory-management), [repairs and inspections](https://rentman.io/solutions/repairs-inspections), [quoting and invoicing](https://rentman.io/product/quoting-invoicing), [Shopify integration](https://rentman.io/integrations/shopify), [product updates](https://rentman.io/product-updates), [Organize launch](https://rentman.io/blog/rentman-launches-organize), [API changelog](https://support.rentman.io/hc/en-us/articles/26707946497042-Rentman-API-Changelog), [mobile app changelog](https://support.rentman.io/hc/en-us/articles/33064984123538-Changelog-Rentman-Mobile-App)
- Crewbooking: [crewbooking.io](https://crewbooking.io/), [TPi article](https://www.tpimagazine.com/crewbooking-reuniting-people-under-one-platform/), [Wallimage](https://www.wallimage.be/en/studios/crewbooking-sprl/), [App Store](https://apps.apple.com/be/app/crewbooking/id1519444823)
- Rider/stage-plot apps (for "StageKit"): [Startion ArtistRider](https://startion.io/en/artistrider), [StageRider](https://startion.io/en/stagerider), [StageOn](https://stageon.app/), [Stagediver](https://stagediver.app/), [SoundGirls list](https://soundgirls.org/list-of-apps-and-software-for-designing-stage-plots/)
- Field-tool references: see TOOLS_PLAN.md

## Changes since the last run

### 2026-10-27: LumiStage and StageKit, from their own sites

The build machine can now open web pages, so both products were read on their own sites (features
as the vendors describe them; neither was installed or tried).

**LumiStage** ([lumistage.online/uygulama](https://www.lumistage.online/uygulama), Turkish team; also
EN/FR/ES/DE). A Windows desktop app for planning a stage in 3D, $10 a month after a 3-day trial, one
computer, works offline up to 30 days, projects stay on the computer. It says its calculations are
for planning and critical decisions need an authorised engineer.

| LumiStage | AVX today | AVX plan |
|---|---|---|
| 3D stage: drag speakers, lights, LED, truss; "type 'medium concert' and the stage builds itself"; 105 equipment models; camera views | 2D stage plot and light plot per gig, from the gig's real equipment | 3D only for the acoustic simulator (A4); a "starter layout" from a gig type fits gig templates (step 25) |
| Sound: coverage from dispersion data, SPL heat map, phase between cabinets, line array hung on truss with angles | System calculator | A1–A3, then A4–A6 (TOOLS_PLAN §6) |
| Light: beams and floor spots, DMX address/universe plan with clash warnings, MVR light plot and DMX patch export | Light plot, DMX patch with clashes, dipswitches, walk-through | **MVR export** next to the planned import (#29) |
| Power: 16 A circuits, phase balance, suggested generator | Power estimate per position and phase | P1–P3: add "suggested generator size" to P1 |
| Truss and motor load, overloads coloured in 3D | Weights per light-plot position | RG1–RG5, with the manufacturers' load tables (docs/TRUSS_DATA.md); colour overloaded positions on the plot |
| Cable list (power, DMX, speaker, signal) | Input list, patch | P2 cable list, joined with the gig's equipment |
| PDF technical file (A4/A3), Word report, Excel equipment list, DXF, MVR, 4K images, GLB | PDFs and prints per tool, call sheet | Shareable rider/advance page (#28) as the one "technical file" |
| Plans A/B with comparison, autosave and previous versions | Versions on files and quotes | A/B variants of a plot: idea for later |
| **Venue library**: per venue the stage size and capacity, installed equipment, light plots and documents, contacts by role, access hours for build and rehearsal, photos, 3D model, 360° tour | Venue as text on the gig | **New idea: venue pages** (shared by the organisations that work there; fills the gig, the call sheet and the plots) |
| Single user, desktop | Team, crew, inventory, quotes, messaging on any phone or computer | AVX's edge |

**StageKit** ([stagekit.fsnipes.com](https://stagekit.fsnipes.com), "a project by F.Snipes",
Portuguese). A free web tool for independent bands to make a technical rider: no login, no server,
no analytics, data kept in the browser (export/import JSON).

| StageKit | AVX today | AVX plan |
|---|---|---|
| Wizard: band members with instrument, lead/backing vocal, amp, pedalboard, DI, laptop, playback, click, in-ear → channels, monitor mixes and stage positions are suggested | Input list, monitor mixes in the patch, stage plot: entered separately | **"From the line-up"**: start the input list, mixes and plot from the people and instruments |
| Drums: how many rack and floor toms → drum channels | Input list templates | Same, in the line-up start |
| Backline: what the band brings, what the house provides, not used | Equipment on the gig | Part of the shareable rider (#28) |
| PA text, minimum channels and monitor sends, phantom power when a condenser is used | Input list totals | Shown on the rider page |
| **Tech check**: a score ("ready for the stage" … "check before sending") with warnings: vocalist without a mic, instrument needing a DI without one, musician without a monitor mix, playback without a stereo DI, laptop without power, in-ear without its own mix, channel count below the sources, band size not matching, missing contact | Conflict warnings in the patch | **A readiness check on the rider page (#28)**, with these rules |
| A4 PDF: cover, line-up, input list, monitor mixes, backline + PA, stage plot; stage plot as an image; a shareable "tech check" card | Prints per tool | #28 |

What changes in the roadmap: #28 (shareable rider/advance page) gains the line-up start and the
readiness check, and moves up; MVR export joins #29; venue pages are a new item for Tier 2; P1 adds
a suggested generator. Recorded in TOOLS_PLAN.md.

### 2026-11-03: Production Assist, from its own site and manual

**Production Assist** ([production-assist.com](https://www.production-assist.com), DeerSoft GmbH,
Germany; version 1.15, October 2026; 11 languages including Portuguese). Read from its public pages:
the home page, pricing, feature pages (structural, power, collaboration, VR, engineering office) and
about 30 pages of its online manual (electrical and network planning, labels, QR codes, assembly
sheets and tasks, worksheets, online workflow, load cells, TradeShowLoads, maintenance, CRM, the
Core API, the 1.15 release notes). Nothing was installed or tried. The site and manual are served as
plain pages, so reverse-engineering the app (the "rea" tool) wasn't needed and wasn't used: the
manual is more detailed than anything we could get from the app's code, and it says plainly
which parts don't work yet.

**What it is:** a 3D CAD and engineering program for temporary structures (truss, ground support,
scaffolding, stages, exhibition stands, tents), with real-time structural calculation (finite
elements, Eurocode), electrical and data planning, paperwork and labels. Desktop app (Windows, Mac,
a portable Windows build), iOS app, a browser view of online projects, and plug-ins for Vectorworks,
AutoCAD, BricsCAD, ZWCAD, SketchUp, Capture and grandMA3. Its main selling point is its own
**engineering office**: you order a certified structural check from inside the app, see the price
straight away, and the office signs it and carries the liability.

**Pricing** (per month): Community free (structures with up to 6 supports, 20 power consumers, 10
cases, 2 trucks); Basic €20 (30 supports, exports and labels); Pro Teams €120 with 5 users, +€20 per
user (unlimited, cloud teamwork); Arena €600 (whole venue roofs, chain-shortening across systems,
load cells, script-based checks for venues, phone support from a structural engineer). Limits are
counted in the things it calculates, which is worth remembering for AVX's own pricing
([PUBLIC_SITE.md](PUBLIC_SITE.md)).

| Production Assist | AVX today | AVX plan | Verdict |
|---|---|---|---|
| **3D drawing** of trusses, scaffolding, booths; imports DWG/DXF, 3DS/glTF/FBX/OBJ/IFC, images; 2D and 3D views; animation timeline | 2D stage plot and light plot per gig | MVR/GDTF import and export (#14); 3D only for the acoustic simulator (A4) | **Don't copy.** A CAD program is a different product; AVX reads and writes MVR so it works next to one |
| **Structural calculation** (FEA, Eurocode): loads, support reactions, deflection, utilisation; statically indeterminate systems with chain shortening; ground support, **ballast**, **wind loads**, tipping and sliding; connections, corner braces, truss crosses; load combinations; PDF report with a QR code; DSTV/IFC export | Weights per light-plot position | RG1–RG5: point loads on a line, manufacturers' truss tables, bridles, line arrays, plot and report with sign-off | **Keep AVX's line**: manufacturers' tables and a competent person's check, never our own engineering. Two pieces fit (see TOOLS_PLAN "Proposed" 2026-11-03): an **engineer's pack** from RG4 and **measured loads** typed in on site |
| **Engineering office**: order a certified structural check in the app, instant price, sent back into the project | — | RG4 suggests hiring a certified rigger through the job board | **Adopt the hand-off, not the office**: RG4 exports everything an engineer needs (D33) |
| **Load cells**: live readings (Broadweigh, Flexa IOT, Show Distribution, RON StageMaster, T24 USB) compared with the calculated loads (Arena tier) | — | — | **Small version only**: type the measured load per point and see it against the plan (RG4 extra). No hardware links |
| **TradeShowLoads** `.tsle` export/import of hang points for trade fairs | — | — | **Ask** (D34): only useful for fairs that ask for that file |
| **Electrical planning**: power sources, distributors, consumers; patch by hand or automatically (1:1, or **fill each output up to a reserve**); a **hotpatch matrix** to move loads between outputs on site; phase load, voltage drop and residual current per cable; cables routed along the truss; a wiring diagram; a red/yellow/green "connected" status per object; non-show loads (catering) as plain consumers | Power estimate per light-plot position and phase | P1–P3: catalogue electrical fields, supply → distros → outputs → loads, per-phase totals, warnings, cable runs and voltage drop, cable list, balancing suggestion, one-line diagram, on-site checklist | **Mostly planned already.** Add to P1–P3: fill-to-reserve auto-assign, a move-loads grid for on-site changes, a "connected / partly / not" status (shown as words and icons, not colour alone), and loads typed by hand for catering, bars and the like |
| **Data/network planning**: DMX daisy chains, splitters, nodes and switches; DMX address shorthand (`1+24`, or `1+` to use each fixture's footprint); DMX overview; data wiring diagram | DMX patch with next-free addressing, clash warnings, readdress in order, dipswitches | — | Addressing is **already covered**. **Adopt** the data chain (which fixture feeds which, through which splitter/node) as part of P3's one-line diagram |
| **Labels**: a label designer (paper formats, label size, rounding; dynamic fields, static text, QR code, image, **colour code**); label types for objects, cases and racks; filtered by kind (fixture, electrical, structure, inventory, audio); PDF | A4 QR label sheets (3 or 2 across) for items and units | — | **Adopt** as a small step: label templates (D31) |
| **QR codes** on objects, work areas and printed PDFs, opening the live online version | QR per item and unit, `/scan/<code>` opens it | — | **Adopt the cheap part**: a QR on every AVX print (call sheet, patch, power plan, rigging report) that opens the current version, so a paper copy shows when it's out of date (D32) |
| **Assembly sheets as tasks**: the drawing split into work areas (a truss, a tower, a layer), each with assigned people, a calculated build time, build instructions, notes, a QR code, and a status (upcoming, active, done) with a progress bar | Tasks T1–T2; On-site mode; light-plot positions | — | **Adopt** as "work areas" on the gig (D35): tasks linked to a position or area, with the equipment and fixtures in it, a QR on the printed sheet and a progress bar in On-site mode |
| **Paperwork / worksheets**: patch lists, dimmer sheets, mark-out lists, material overview, transport cases, racks, colour filters, connections, notes; PDF/CSV export | Prints per tool, packing lists, call sheet | Rider/advance page (#22) | **Covered**; a **colour-filter (gel) list** from the light plot is a cheap extra if asked |
| **Truck packing**: cases, racks and trucks, automatic placing of objects into containers | Truck totals (weight, volume) on packing lists | Step 23: packing list per vehicle, weight against capacity | **Covered by step 23**; add an "auto-split across vehicles by weight and volume" suggestion there. No 3D packing |
| **Online workflow**: a master plan, branches, commits, change requests with reviews, approvals and automatic checks; public share links; project notifications and calendar | One live version per gig, versions on files and quotes, activity feed, notifications, links for guests and suppliers | A/B variants of a plot (idea, later) | **Don't copy** branching: crews work on one live gig. An "approved by … on …" stamp on a plot or power plan is the useful core; fold into the A/B idea |
| **Cue list, presets, focus plots**; grandMA3 cue import; **PosiStageNet** send/receive | Rehearsal companion R1–R2 | R3 cueing app bridge (#29) | **Later, with R3** if at all |
| **VR** (Meta Quest walkthrough) | — | — | **Don't copy** |
| **CAD plug-ins** (Vectorworks, AutoCAD, BricsCAD, ZWCAD, SketchUp, Capture) and **Core API** (glTF in, calculation results out as JSON) | — | MVR/GDTF (#14), public API (#28) | **Covered by the plan**: MVR is the shared format; no plug-ins |
| **Maintenance** (inspection pool, schedules, report templates) | Inspections and repairs (I5) | — | **AVX is ahead.** Their manual says these screens are examples and don't save anything yet |
| **CRM** (prospect contact queue, follow-ups, response rate) | Contacts, quotes with lost reasons (K0) | K4 sales and clients | **Not comparable**: it reads as their own sales team's tool. Nothing to add |
| Content library: manufacturers' trusses, fixtures, electrical devices | Catalogue per organisation; truss tables (waiting for the check) | A1 speaker library, GDTF import | **Covered by the plan** |
| Sign-in with Microsoft Entra; Pro Teams licence sharing | Email, magic link, two-step sign-in | — | Not now |
| Know-how pages explaining the rules (DGUV 17, Eurocodes, what belongs in a structural report) | Help guides, terms, hints | — | **Small idea**: a help page per rigging/power tool on which rules apply in Portugal and what a report must contain (with RG4 and P1, not before) |

**Where AVX stands against it.** Production Assist is an engineering and drawing tool; AVX runs the
gig (crew, quotes, inventory, messages, field tools). The overlap is power, rigging, labels and
on-site paperwork, and there Production Assist goes deeper (real FEA, certified checks). AVX's
answer should stay "aids from manufacturers' data, checked by a competent person", made easy to hand
to a real engineer, and joined with the gig's real equipment, which Production Assist doesn't have
(it has no rental, crew or quoting side).

What changes in the plan: five proposals, recorded in TOOLS_PLAN.md ("Proposed, to confirm
(2026-11-03)") and asked in docs/PENDING.md (D31–D35). Smaller additions inside steps already planned (P1–P3, RG4, step 23) are listed in
the same TOOLS_PLAN section, to be picked up when each step is built; nothing moves in the roadmap
until you say yes.

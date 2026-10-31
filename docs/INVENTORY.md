# Inventory and equipment: plan

Status: **all phases built** (I1 0.13.0 to I7 0.19.0). Each phase ships on its own and is useful alone.
Modelled on how rental software such as Rentman structures equipment (set/case/item types,
accessories, alternatives, serial numbers, stock locations, repairs, subrentals, planning vs
use periods). AVX doesn't integrate with Rentman.

## Feature set

| Module | Features |
|---|---|
| **A. Catalogue** | Rental and sale items, categories, photos and manuals, specs (weight, power W/A, size, volume), day price and multi-day rules ("2 days = 1.5×"), replacement value, suppliers, notes for packing lists and documents. Grows out of today's price list |
| **B. Stock** | **Bulk** items (cables: counted) and **serialised** units (serial, QR code, purchase date and cost, depreciation, book value). Warehouses and vans as stock locations. A stock ledger (purchase, sale, lost, found, correction, transfer). Low-stock alerts, stock counts |
| **C. Kits** | **Cases** (fixed contents travel together), **sets** (planning shortcuts), **accessories** (a speaker brings its cables and clamps), **alternatives** (suggested when short) |
| **D. Planning and availability** | Equipment on gigs and quote phases with a **planning period** (prep and return days included) separate from the **use period**; holds follow the gig's status; a timeline per item; ⚠ shortage warnings, never a hard block |
| **E. Quote to warehouse** | Quote lines linked to catalogue items; accepting a quote reserves the gear; packing lists from the gig |
| **F. Warehouse** | Scan out / scan in with the phone camera (QR / barcode); status per unit (warehouse, on site, repair, lost); missing-item report on return; truck totals (weight, volume) |
| **G. Maintenance** | Report damage from site with a photo; repairs (who, outside repairer, cost, charge to client), unit unavailable meanwhile; periodic inspections (electrical/PAT, rigging certificates) with reminders; history per unit |
| **H. Subrental and cross-hire** | Rent from a supplier to cover a shortage, at supplier cost. If the supplier also uses AVX, ask their availability directly |
| **I. Reports** | Use and revenue per item (return on investment), idle stock, losses and damage, book values |
| **J. Later** | Client-facing catalogue, ATA carnets for touring, accounting exports |

## Phases

| Phase | Scope |
|---|---|
| **I1 · Catalogue and stock** | A and B: bulk and serialised items, locations, ledger, spreadsheet import, QR labels; the price list becomes the catalogue |
| **I2 · Availability** | D and the quote link from E: plan gear on gigs and quote phases, reservations by status, timeline, shortage warnings |
| **I3 · Warehouse** | F and packing lists: scanning in the browser with the camera, unit status, missing reports, truck totals |
| **I4 · Kits** | C: cases, sets, accessories, alternatives |
| **I5 · Maintenance** | G: repairs from site, inspections with reminders (repairs make units unavailable through reservations) |
| **I6 · Subrental and cross-hire** | H: suppliers, subrental costs, availability between AVX companies |
| **I7 · Reports** | I: use, return on investment, depreciation |

## I1 · Catalogue and stock (built)

Inventory menu (admins and members): **Catalogue**, **Locations**, **Stock movements**, **QR labels**.

| Piece | How it works |
|---|---|
| Catalogue | The price list's rental and sale items, plus: how stock is kept (not tracked / counted in bulk / by serial number), a code, brand, model, weight, power, size, replacement value, minimum stock and a packing note. Archiving hides an item from the catalogue, price list and new quotes; nothing is lost |
| Locations | Warehouses, vehicles, sites. Archived, never deleted; stock can leave an archived location but not enter it |
| Bulk stock | A ledger (`stock_movements`) that is only ever added to: bought/added, found, sold, lost, retired, moved, count corrections. "Count" compares what you counted with the books and writes the correction. Taking out more than a location holds is refused |
| Serial units | `stock_units`: code (QR), serial, location, status (available, in repair, lost, retired), purchase date and cost, write-off period. Book value is straight-line (60 months unless set). Every change of place or status is logged automatically |
| Stock levels | `stock_levels` view: quantity per item and location (units available or in repair). It reads `stock_totals`, a running total per item and location that the database updates whenever a bulk movement is recorded or a unit is added, moved or changes status (0.63.6), so the ledger isn't added up again on each read. `supabase/tests/stock_totals.sql` compares the totals with the full ledger |
| Import | Paste rows (name; category; code; quantity; price; location): items matched by code then name, new ones created in bulk, quantities added as purchases |
| QR labels | A4 sheets (3 or 2 across). Each QR opens `/scan/<code>`, which finds the item or unit in your organisations and opens it, so any phone camera works as a scanner |

Rules live in the database (`20261025000000_inventory_catalogue.sql`, tests in
`supabase/tests/inventory.sql`): codes unique per organisation, serials unique per item, stock
only for rental/sale items, the way stock is kept can't change once there is history, units
can't move to another company's item or location, users can't write unit history or edit the
ledger, viewers and other companies see nothing.

## I2 · Availability (built)

| Piece | How it works |
|---|---|
| Equipment tab on gigs | Everyone on the gig sees what's going (name, quantity, notes). The gig's managers and the organisation's admins/members plan it: add from the catalogue (with "x of y free" for the gig's dates), change quantities, give a line its own dates, remove. Shortages show as ⚠ "3 short (5 free)" with a banner; nothing is blocked. Planners also see total weight and power |
| Reservations | Each line is a reservation of the item (`resource_type = 'equipment'`, with quantity) for the gig's days plus the organisation's **prep and return days** (Organisation settings), or for its own dates. Draft gigs hold, archived gigs free the gear, date and status changes follow automatically |
| Availability | Stock that can go out (bulk + units available, not in repair) minus the **busiest moment** of other bookings in the period: two gigs on different days don't add up |
| Quotes | Lines added from the price list remember their catalogue item. "Availability" in the quote editor checks them for the quote's dates (the quote's own gig doesn't count against it). Filling a gig from its quote now also adds that equipment |
| Item timeline | The item page shows upcoming bookings and a 6-week strip of how many are free each day (amber = fully booked) |

Functions: `equipment_availability(org, items, from, until, exclude_gig)`, `gig_equipment_status(gig)`,
`item_bookings(item, from, until)` (admins/members; status also for the gig's managers). Migration
`20261026000000_equipment_availability.sql`, tests `supabase/tests/equipment_availability.sql`.

## I3 · Warehouse (built)

| Piece | How it works |
|---|---|
| Packing list | `/gig/:id/packing`, printable, for everyone on the gig: items by category with quantity, packing note, a tick box, and what has been scanned out and back. The packing note is copied onto the gig's line when it is planned |
| Scan out / in | `/gig/:id/scan`, for the gig's managers and the organisation's admins/members. Point the phone camera at a QR label (or type the code, or use a hardware scanner that types it). A unit's code moves that unit; an item's code moves a quantity of a bulk item. Returns can be marked damaged, which sends a unit to repair |
| Warnings, never blocks | More than planned, a unit already out on another gig (it moves to this one), more back than went out, a lost unit turning up (it becomes available again). Scanning the same unit out twice, or in when it isn't out, is refused |
| Progress | Planned / out / back per item on the scan page and in the Equipment tab; units still out are listed with their codes |
| Missing | After the gig, **Mark lost** marks every unit still out as lost (with a warning first); if it turns up later, scanning it in brings it back |
| Units | The item page shows which gig a unit is out on. Only scanning moves a unit out or in |
| Steps and undo | Since 0.35.0 (docs/HELP.md, H5b): steps between out and back (prepped, on site, loaded back, checked in), chosen per organisation, and Undo on your own scans for 15 minutes. Undone rows stay in the log, marked |

Every scan is a row in `gig_dispatch`, a log that is only added to (no one can edit or remove it; an undone scan is marked, not removed).
Functions: `dispatch_scan(gig, code, direction, quantity, condition, note)`,
`gig_dispatch_summary(gig)`, `gig_units_out(gig)`, `mark_units_lost(gig)`. Camera scanning uses the
browser's barcode reader where there is one and a built-in reader elsewhere; the site allows the
camera for itself only. Migration `20261027000000_warehouse.sql`, tests `supabase/tests/warehouse.sql`.

## I4 · Kits (built)

| Piece | How it works |
|---|---|
| Sets | An item marked **Set** (Edit item → Kit) has no stock of its own: it's a planning shortcut and a quote line. Adding a set to a gig, or filling a gig from a quote with a set on it, adds its contents. Sets can hold other sets. The picker shows how many sets are free |
| Cases | An item marked **Case** is stock (a flight case, a rack), usually per unit. Its contents are planned with it. On each case unit, **packed** chooses which units travel in it; scanning the case out or in moves those units and the bulk items in its contents, and says if any packed unit wasn't available (repair, lost, out elsewhere) |
| Accessories | On a stock-tracked item: what comes along, per item, when it's planned (a speaker brings its clamp). Only an increase brings more; lowering a quantity leaves accessories as they are |
| Alternatives | Pairs of items that can stand in for each other. When a gig line is short, the Equipment tab offers "Use 3 × other item" if the alternative is free, moving the shortfall across |
| Rules | Contents belong to sets and cases, accessories to stock-tracked items; only stock-tracked items (or sets inside sets) go in; nothing can contain itself, however indirectly; an item stays a set or case while it has contents or packed units; a case can't be packed in a case |

Tables `item_parts` (parent, child, `content`/`accessory`, quantity) and `item_alternatives` (one
row per pair); `price_items.kit_type` (`set`/`case`); `stock_units.case_unit_id`. Admins and
members manage them. Migration `20261028000000_kits.sql`, tests `supabase/tests/kits.sql`.

## I5 · Maintenance (built)

| Piece | How it works |
|---|---|
| Damage from site | **Report damage** on a gig's Equipment tab, for everyone on the gig (crew included): the item, the unit's code (or how many, for bulk items), what's wrong and a photo from the phone camera. It opens a repair and notifies the organisation's admins. A unit with an open repair isn't reported twice |
| Damaged returns | Scanning a return in as damaged (I3) opens a repair too |
| Repairs | Inventory → **Maintenance**: open repairs, recently closed ones, and **New repair** for damage found in the warehouse. Each has a status (reported, in repair, repaired, written off), who repairs it (in house or an outside repairer), cost, whether the client is charged, expected return date and outcome. Repairs are never deleted |
| Availability | A unit is **in repair** while its repair is open (not available, so not offered to gigs), available again when repaired, retired when written off. Bulk quantities under repair count against what can go out |
| Inspections | Per item: what kind (e.g. PAT test, rigging certificate) and every how many months. Each unit (or the bulk item) is due that long after its last pass; never inspected means due now. **Record inspection** with date, who and a note; a **fail** opens a repair. Inspections are a record: added, never changed |
| Reminders | Every morning (06:17 UTC, database job `avx-maintenance-reminders`) the admins get one notification per organisation for inspections due in the next two weeks or overdue that haven't been mentioned before |
| History | The item page shows its repairs and inspections; stock movements already record units going to and back from repair |

Photos live in the private `repair-photos` bucket under `<organisation>/<gig or "stock">/`;
admins and members see them, anyone on the gig can add one. Functions: `report_damage(gig, item,
unit_code, quantity, problem, photo)`, `maintenance_due(org)`. Migration
`20261029000000_maintenance.sql` (enables `pg_cron`), tests `supabase/tests/maintenance.sql`.

## I6 · Subrental and cross-hire (built)

| Piece | How it works |
|---|---|
| Suppliers | Inventory → **Subrentals**: name, contact, email, phone, notes. Archived, never deleted |
| Subrentals | Gear hired in from a supplier for a period, optionally for a gig: lines (linked to a catalogue item or free text), quantity, cost each, reference/PO, status (draft, requested, confirmed, declined, returned, cancelled). Total = lines, or the supplier's price when they gave one. Cancelled, never deleted |
| Availability | **Confirmed** lines linked to a catalogue item add to what can go out, for periods the subrental covers completely. A short line on a gig offers **Subrent N** (supplier, dates and item filled in) next to the alternatives; the gig lists what's hired in for it |
| Cross-hire on AVX | Each organisation has a **cross-hire code** (Subrentals tab; admins can replace it). Entering a supplier's code links that supplier to their organisation. Setting a subrental to **requested** then appears in their Subrentals tab under "Hire requests to you" (and notifies their admins) with your organisation's name, dates, reference, notes and what you need, never your costs, gigs or clients. They **confirm or decline** with a note and a price, and you're notified |

Functions: `partner_code(org, new)`, `link_supplier(supplier, code)`, `incoming_hire_requests(org)`,
`answer_hire_request(id, answer, note, total)`. Migration `20261030000000_subrentals.sql`, tests
`supabase/tests/subrentals.sql`.

## I7 · Reports (built)

Inventory → **Reports**, for the last 90 days, 12 months or this year, with a CSV download
(semicolon-separated, opens directly in spreadsheets set to Portuguese):

| Figure | How it's counted |
|---|---|
| Use | Days booked on confirmed gigs (prep and return days included) ÷ days owned in the period, up to today |
| Gigs, last used | Confirmed gigs the item was on in the period; the latest booking that has started |
| Revenue | Lines of quotes accepted in the period that came from the catalogue, after line, phase and quote discounts; optional phases left out |
| Revenue ÷ cost | That revenue against the purchase cost of the item's units (return on investment) |
| Repairs | Repairs opened in the period, their cost and what was charged to clients |
| Lost | Lost minus found in the period, valued at replacement value |
| Hired in | What subrental lines for the item cost (confirmed or returned subrentals overlapping the period) |
| Book value | Straight-line depreciation of units with a purchase cost |
| Not used | Items in stock with no confirmed booking in the period: candidates to sell or stop buying |

No database changes: the report is worked out in the browser from what admins and members can
already read (`src/lib/reports.js`, tested in `reports.test.js`).

## How it builds on what exists

- **Reservations** ([RESERVATIONS.md](RESERVATIONS.md)): gear on a gig becomes reservations with
  `resource_type = 'equipment'` (with `quantity`) or `'unit'`; availability is stock minus
  overlapping reservations. A unit in repair is simply not available, and bulk quantities under
  repair are taken off what can go out.
- **Quotes**: lines get an optional link to a catalogue item; accepted quotes already create the
  gig's schedule and crew positions, and will reserve equipment the same way.
- **Access rules**: inventory belongs to an organisation; admins and members manage it, viewers
  and crew see packing lists for their gigs only, and prices follow the existing quote rules.
- **Messaging** comes after inventory ([MESSAGING.md](MESSAGING.md)) and attaches conversations
  to items, repairs and subrentals.
- **Phone app**: decided at the end of the build. I3's scanning works in the browser first.

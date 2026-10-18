# Inventory and equipment: plan

Status: **I1 (0.13.0), I2 (0.14.0) and I3 (0.15.0) built**; I4–I7 planned. Each phase ships on its own and is useful alone.
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
| Stock levels | `stock_levels` view: quantity per item and location (units available or in repair), worked out from the ledger and units |
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

Every scan is a row in `gig_dispatch`, a log that is only added to (no one can edit or remove it).
Functions: `dispatch_scan(gig, code, direction, quantity, condition, note)`,
`gig_dispatch_summary(gig)`, `gig_units_out(gig)`, `mark_units_lost(gig)`. Camera scanning uses the
browser's barcode reader where there is one and a built-in reader elsewhere; the site allows the
camera for itself only. Migration `20261027000000_warehouse.sql`, tests `supabase/tests/warehouse.sql`.

## How it builds on what exists

- **Reservations** ([RESERVATIONS.md](RESERVATIONS.md)): gear on a gig becomes reservations with
  `resource_type = 'equipment'` (with `quantity`) or `'unit'`; availability is stock minus
  overlapping reservations. Repairs and inspections are reservations too, so a unit in repair is
  simply not available.
- **Quotes**: lines get an optional link to a catalogue item; accepted quotes already create the
  gig's schedule and crew positions, and will reserve equipment the same way.
- **Access rules**: inventory belongs to an organisation; admins and members manage it, viewers
  and crew see packing lists for their gigs only, and prices follow the existing quote rules.
- **Messaging** comes after inventory ([MESSAGING.md](MESSAGING.md)) and attaches conversations
  to items, repairs and subrentals.
- **Phone app**: decided at the end of the build. I3's scanning works in the browser first.

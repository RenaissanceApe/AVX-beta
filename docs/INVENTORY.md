# Inventory and equipment: plan

Status: **planned** (next after Phase 5a). Each phase ships on its own and is useful alone.
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

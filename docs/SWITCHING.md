# Switching to AVX: plan

Status: **S1 built**: the import wizard for locations, equipment and units (S1a, 0.41.0), Excel files and kit contents (S1b, 0.42.0). Next: S2 (contacts), then S3–S5.

The aim: a company using Rentman, another rental tool or spreadsheets can be fully running on
AVX within a day, without retyping anything and without risking their data. Making it easy to
**leave** AVX is part of the same plan: companies switch more readily to a tool they know won't
lock them in.

This is **file import, not integration**. AVX reads files the company exports from its current
tool. There's no live connection to Rentman or anyone else (the roadmap keeps integrations out
for now).

## What a company needs to bring

In the order they depend on each other:

| Order | Data | Becomes in AVX | Notes |
|---|---|---|---|
| 1 | Warehouses, vans | Locations | Usually a handful; typed or imported |
| 2 | Equipment list | Catalogue items (category, code, brand, model, price, weight, power, replacement value) | The core. Most tools export it to Excel/CSV |
| 3 | Serial numbers | Units (serial, purchase date and cost, location, status) | Existing barcodes can be kept as the unit's code, so old labels keep working |
| 4 | Sets, cases, accessories | Kit contents | Often a separate export, or listed per item |
| 5 | Clients and suppliers | **Contacts directory** (doesn't exist yet: quotes store a client's name and email only) | Prerequisite built in S2 |
| 6 | Crew | Invitations, **held until you press send** | Nobody gets emailed by surprise |
| 7 | Upcoming jobs | Gigs with dates, venue, status and equipment lines (which book the gear) | Past jobs stay in the old tool's export, kept as an archive file |
| 8 | Open quotes | Draft quotes | Optional |

Not migrated: invoices and accounting, full history of past jobs, time sheets.

## How the import works

One **import wizard** for everything (it grows out of today's catalogue paste import):

1. **Choose what you're importing** and drop the file (CSV or Excel), or paste from a spreadsheet.
2. **Match the columns.** AVX guesses ("Naam"/"Name"/"Nome" → name) and remembers the mapping
   as a preset, e.g. "Rentman equipment export", so the next file needs no matching.
3. **Preview** every row with problems highlighted: a missing name, a category that doesn't
   exist yet, a serial already in use, a price written "1.200,00".
4. **Dry run** shows what will be created, updated or skipped, with counts.
5. **Import as one batch.** A batch can be **undone in one go** until something uses it (an item
   planned on a gig, a unit scanned out), so a wrong file caught early is never a disaster.
6. **Report** of what was imported and what was skipped, downloadable.

Re-importing the same file updates existing records (matched by code, then serial, then name)
instead of creating duplicates, so a company can import, keep working in the old tool for a
week, and import again before switching for good.

## Making the move easier for everyone

- **Source presets:** ready-made column mappings for the tools companies leave from. Rentman
  first, built from a real Rentman export; then others as real files arrive (Current RMS, Flex,
  HireHop, EasyJob, Booqable, plain spreadsheets). The formats need checking against real
  exports, not guessed.
- **Switching checklist** in the app for a new organisation: locations → equipment → units and
  labels → contacts → crew → upcoming jobs, with progress and a link to each importer.
- **Calendar feed (ICS):** each person's gigs in their phone's own calendar, so crew who don't
  want another app still see dates and call times.
- **Crew without friction:** call sheets and changes already reach people by email; crew can
  start with the emails and install the app later.
- **We do it for you:** for the first companies, they send their exports and the import is run
  for them (a service, not code; the wizard makes it a few minutes' work).
- **Leaving is easy too:** an organisation admin can export everything (catalogue, units,
  contacts, gigs, quotes) as a zip of CSV files. Personal export already exists.

## Stages

| Stage | Scope | Roughly |
|---|---|---|
| **S1 · Import wizard** | Wizard (file or paste, column matching, saved presets, preview, dry run, batch undo) for locations, catalogue items, units and kit contents | 2 PRs |
| **S2 · Contacts** | Clients and suppliers directory (quotes and subrentals pick from it), with import | 1 PR |
| **S3 · Crew and jobs** | Crew import as held invitations; upcoming jobs → gigs with equipment lines; open quotes → drafts | 1–2 PRs |
| **S4 · Presets and checklist** | Rentman preset from a real export, others on request; switching checklist; calendar feed | 1 PR |
| **S5 · Organisation export** | Everything an organisation holds, as CSV files | 1 PR |

Live integrations (syncing both ways with another tool) stay out of scope. A public API for
integrations is a later, separate decision.

## How S1a works (0.41.0)

| Piece | How it works |
|---|---|
| Where | Inventory → Import (`/org/:id/inventory/import`), for organisation admins and members |
| File | A CSV or tab-separated file (up to 5 MB, 5000 rows), or rows pasted from a spreadsheet. The separator (`;` `,` tab `\|`) and quoted cells are read automatically; a first row of headings is assumed (can be switched off). Excel files are saved as CSV first for now (S1b reads them) |
| Matching | `src/lib/importer.js` guesses each column from its heading in English, Dutch (Rentman) or Portuguese ("Naam", "Verhuurprijs", "Gewicht", "Magazijn"…). Each field comes from one column. The matching can be saved as a **preset** (`import_presets`, per organisation and kind) and picked for the next file |
| Values | Prices and numbers written either way ("1.234,50" or "1,234.50"), dates as 2024-03-01, 01-03-2024 or 1/3/2024, choices in the three languages ("Verhuur", "Aluguer" → rental). Bad cells are flagged per row |
| Check | Before importing: how many rows are new, how many match what's already in AVX (items by code then name, units by code then serial, locations by name), and which rows have problems (left out), with a preview |
| Import | `run_import(org, kind, rows)` in one call: each row is matched and updated (only the cells that are filled; a name or code that only differs in capitals is kept) or created; a row the database refuses is skipped with its reason, the others go in. Equipment with a quantity gets that opening stock at its location (once: re-importing doesn't add it again). Units can keep their old barcodes; an untracked item becomes serial-numbered when units are imported for it. Every created or changed record is logged in `import_changes` |
| Report | Counts (added, updated, unchanged, skipped) and each skipped row or note with its line, translated; downloadable as CSV |
| Undo | "Earlier imports" lists each batch. **Undo** (with a warning and a confirmation) removes what the batch created and puts back what it changed, unless it has been changed again since. It's refused if anything it added is already in use (stock moved, on a gig, scanned, in a kit or a case, on a plot or patch). `undo_import` is in `20261116000001_import_undo.sql`, **run by hand** because it removes records; until then the app says undo isn't switched on yet |
| Re-importing | The same file again updates instead of doubling, so a company can import, keep working in the old tool, and import again before switching |

Checks: `supabase/tests/import_wizard.sql`, and `supabase/tests/import_undo.sql` after the hand-run file.

## How S1b works (0.42.0)

| Piece | How it works |
|---|---|
| Excel | An `.xlsx` file is read in the browser (`src/lib/xlsx.js`, on the small `fflate` unzip library, loaded only when an Excel file is chosen): the first sheet, with text, numbers, booleans and dates (by the cell's date format) as they show. It then goes through the same matching as a CSV file. Old `.xls`, `.ods` and Numbers files are asked to be saved as `.xlsx` or CSV |
| Kit contents | A fourth kind of import: one row per part, naming the kit (a set, a case, or an item with accessories) and what goes in it, by code or name, with how many and optionally "contents"/"accessory" and "set"/"case" (also in Dutch and Portuguese). A kit given contents becomes a set if it isn't kept in stock and a case if it is, unless the file says. Re-importing changes the quantity of a part already there |
| Storage | `run_import(org, 'kits', rows)` keeps the batch as an equipment import with `subject = 'kits'` (presets too), so no existing rule had to be replaced; the parts it adds or changes are logged in `import_part_changes` |
| Undo | `undo_import` (in `20261116000001_import_undo.sql`, still **run by hand**; renamed from `20261115000001` so it runs after the kits migration it now relies on) also removes the parts a kits import added and puts back changed quantities |

Checks: `supabase/tests/import_kits.sql`; `supabase/tests/import_undo.sql` covers kits too.

## Decided (2026-10-19)

- The Rentman preset is built from a **mock Rentman account** the owner created for this, whose
  field structure Claude may read and write freely. Sample export files are only needed if that
  route doesn't give enough.
- Order: after messaging and after help stage H1.

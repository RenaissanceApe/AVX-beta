# Switching to AVX: plan

Status: **S1–S5 built**: the import wizard for locations, equipment and units (S1a, 0.41.0), Excel files and kit contents (S1b, 0.42.0), the contacts directory with its import (S2, 0.43.0), crew as held invitations (S3a, 0.44.0), upcoming jobs, their equipment and open quotes (S3b, 0.45.0), Rentman exports, the switching checklist and the calendar feed (S4, 0.46.0), the organisation export (S5, 0.47.0). Switching is complete; next on the roadmap: crew network and job board.

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
| 5 | Clients and suppliers | **Contacts directory** (Contacts: clients and suppliers) | Built in S2 (0.43.0) |
| 6 | Crew | Invitations, **held until you press send** | Built in S3a (0.44.0): nobody gets emailed by surprise |
| 7 | Upcoming jobs | Gigs with dates, venue, status and equipment lines (which book the gear) | Built in S3b (0.45.0). Past jobs stay in the old tool's export, kept as an archive file |
| 8 | Open quotes | Draft quotes | Built in S3b (0.45.0) |

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
| Undo | "Earlier imports" lists each batch. **Undo** (with a warning and a confirmation) removes what the batch created and puts back what it changed, unless it has been changed again since. It's refused if anything it added is already in use (stock moved, on a gig, scanned, in a kit or a case, on a plot or patch). `undo_import` is in `20261117000001_import_undo.sql`, **run by hand** because it removes records; until then the app says undo isn't switched on yet |
| Re-importing | The same file again updates instead of doubling, so a company can import, keep working in the old tool, and import again before switching |

Checks: `supabase/tests/import_wizard.sql`, and `supabase/tests/import_undo.sql` after the hand-run file.

## How S1b works (0.42.0)

| Piece | How it works |
|---|---|
| Excel | An `.xlsx` file is read in the browser (`src/lib/xlsx.js`, on the small `fflate` unzip library, loaded only when an Excel file is chosen): the first sheet, with text, numbers, booleans and dates (by the cell's date format) as they show. It then goes through the same matching as a CSV file. Old `.xls`, `.ods` and Numbers files are asked to be saved as `.xlsx` or CSV |
| Kit contents | A fourth kind of import: one row per part, naming the kit (a set, a case, or an item with accessories) and what goes in it, by code or name, with how many and optionally "contents"/"accessory" and "set"/"case" (also in Dutch and Portuguese). A kit given contents becomes a set if it isn't kept in stock and a case if it is, unless the file says. Re-importing changes the quantity of a part already there |
| Storage | `run_import(org, 'kits', rows)` keeps the batch as an equipment import with `subject = 'kits'` (presets too), so no existing rule had to be replaced; the parts it adds or changes are logged in `import_part_changes` |
| Undo | `undo_import` (in `20261117000001_import_undo.sql`, still **run by hand**; renamed from `20261115000001`, then again for S2, so it runs after the migrations it relies on) also removes the parts a kits import added and puts back changed quantities |

Checks: `supabase/tests/import_kits.sql`; `supabase/tests/import_undo.sql` covers kits too.

## How S2 works (0.43.0)

| Piece | How it works |
|---|---|
| Where | **Contacts** in the Quotes menu (`/org/:id/contacts`, `?tab=suppliers`), for organisation admins and members. Clients and suppliers each have a tab with search, archive (never delete) and a dialog per contact |
| Clients | `clients`: company or name, contact person, e-mail, phone, tax number, address, notes. Same access rules as quotes (`can_quote`); crew and viewers don't see them |
| Suppliers | The existing `suppliers` (subrentals pick from them, 0.36) get an address and a tax number. They're managed in Contacts as well as in Inventory → Subrentals, where linking a supplier that is on AVX stays |
| Quotes | `quotes.client_id` links a quote to its client. "Client from contacts" (quote Details, and the new-quote form) fills in the client fields; the quote keeps its **own copy**, so a contact changed later doesn't change a quote already sent, and versions keep what was sent. A client typed by hand is kept with "Save to contacts". A client page lists their quotes |
| From quotes | `clients_from_quotes(org)`: each client typed on unlinked quotes (by company, or by name without a company) becomes a contact with the details of its latest quote, or is matched to a contact of that name; those quotes are linked. Offered on the Clients tab while any quote has an unlinked client |
| Import | Two more kinds in the wizard: **Clients** and **Suppliers**. Matched by tax number (spaces, dots and capitals ignored), then by name, with the e-mail address telling apart two of the same name (otherwise the row is skipped, asking for the tax number). The address comes whole or as street, postcode, city and country (put together on separate lines). Headings guessed in English, Dutch and Portuguese |
| Switching it on | The import tables only allowed the S1 kinds; widening their checks replaces constraints, so it's in the **hand-run** `20261117000001_import_undo.sql` with undo. Until it runs, `run_import` refuses contacts with a clear message (the app shows it); adding contacts by hand works |
| Undo | Removes the clients and suppliers an import added unless a quote or a subrental uses them, and puts back changed details |

Checks: `supabase/tests/contacts.sql`; after the hand-run file, `supabase/tests/contacts_import.sql` (and `import_undo.sql`).

## How S3a works (0.44.0)

| Piece | How it works |
|---|---|
| Where | The import wizard's **Crew** kind (organisation admins only, as inviting people is), also reached from Members → "Import your crew from a file" |
| File | One row per person: e-mail (required), name or first and last name, phone, functions, role, notes. Headings guessed in English, Dutch and Portuguese. Roles: admin, member or viewer, also read from words like "Freelancer"/"ZZP"/"Crew" (viewer), "Medewerker"/"Employee"/"Staff" (member), "Beheerder"/"Owner" (admin); viewer when the file doesn't say |
| Held | `import_crew(org, rows, file)` writes `held_invites`, not invitations: nobody is e-mailed and nobody joins. Re-importing updates the held ones by e-mail; people already in the organisation or already invited are left out with a note |
| Sending | Members shows "N people imported, not invited yet": check each role, select, **Send**. Each goes through the normal invitation (`send-invite`: added at once if they have an account, otherwise e-mailed), one at a time; the held invitation is then marked sent with the outcome. One that fails stays held to try again |
| Discarding | Marks them discarded (nothing is removed), so a wrong import needs no undo |
| Why not batches | Crew aren't kept in `import_batches` (no presets or history for them), so no import-table check had to be widened by hand |

Checks: `supabase/tests/held_invites.sql`.

## How S3b works (0.45.0)

| Piece | How it works |
|---|---|
| Kinds | **Upcoming jobs**, **Equipment on jobs** and **Open quotes** in the import wizard (admins and members), grouped under "People and work" with crew |
| Jobs | One row per job: number, name, start and end dates, venue, status, client, notes. Each becomes a gig (status read from words like "Bevestigd"/"Confirmado" → confirmed, "Optie"/"Concept" → draft); the client and notes go in its description; the importer becomes its manager. Past jobs (ended before today) and cancelled ones are left out with a note; a new job needs a start date |
| Equipment | One row per line: the job (number or name), the item (code or name), how many. Lines go on the gig's Equipment tab and book the gear for the gig's dates; the same item again changes its quantity. Only items kept in stock can be planned (sets through their contents, as in the app) |
| Quotes | One row per quote line, with the quote's number (or title), client, dates, section, description, item code, quantity, days, price, discount. Rows with the same number make one **draft** quote, its lines in sections; a line with a catalogue item keeps the item (so availability can be checked) and its price when the file has none. A client whose name is in Contacts is linked with their details |
| Re-importing | Gigs and quotes keep the old tool's number (`import_ref`) and are matched by it (gigs also by name and start date), so they're updated, not doubled. A quote already sent from AVX is left as it is |
| No batches | Like crew, these aren't kept in `import_batches` (no presets, history or undo, and no hand-run change): a gig or a quote is deleted the usual way, an equipment line taken off |

Checks: `supabase/tests/import_jobs.sql`.

## How S4 works (0.46.0)

| Piece | How it works |
|---|---|
| Rentman | Built from the mock Rentman account: its exports use the API's field names, so those are added to the column guesses (`displayname`, `folder`, `price`, `rental_sales`, `stock_management`, `current_quantity`, `list_price`, `critical_stock_level`, `internal_remark`; `ref`, `serial`, `purchasedate`, `purchase_costs`, `remark`; `email_1`, `phone_1`, `visit_street`, `visit_number`, `visit_postalcode`, `visit_city`, `country`, `VAT_code`; `firstname`, `lastname`, `email`, `phone`, `active`; `number`, `name`, `planperiod_start/end`, `customer`, `location`). `looksLikeRentman` recognises a file with two or more of the Rentman-only names and the wizard says so. No stored preset is needed: the guesses are the preset |
| Values | "Track stock" → counted in bulk, "Exclude from stock tracking" → not kept in stock; date-times like `2026-10-14T00:00:00+01:00` read as dates; crew with `active` false are left out. Rentman's `unit` (Piece, Can) and `type` (item/set/case) are no longer guessed as AVX's "charged per" and "rental/sale" |
| Default location | Equipment with quantities and no location column (Rentman's export): the match step asks which location the stock is in |
| Checklist | Import page, first step: the order (locations → equipment → units → kits → clients → suppliers → crew → jobs → their equipment → quotes), each ticked once something of that kind is in the organisation (jobs and quotes: imported ones), with the count; tapping one chooses it. Can be folded away (remembered on the device) |
| Calendar feed | Account panel → "Your gigs in your phone's calendar": `calendar_feed()` gives the person's private key (64 hex characters, `calendar_feeds`), shown as a link to the `calendar-feed` Edge Function (Verify JWT off). The function returns an iCalendar of the gigs the person is on, from 60 days ago: all-day over the gig's days, or the person's own booking times; venue, role, call time, a link to the gig; drafts as tentative, archived left out; in the person's language. "New link" replaces the key. Apple/Outlook subscribe through `webcal://`, Google through its "add by URL" link |

Known limitation: an item imported with a bulk quantity can't take serial numbers afterwards (the
units import refuses bulk items). For gear kept per serial number, import the units file first or
leave its quantity out of the equipment file. Converting it automatically needs the opening stock
movement removed, which is a hand-run change for later.

Checks: `supabase/tests/calendar_feed.sql`; the feed's text in `src/lib/ics.test.js`.

## How S5 works (0.47.0)

| Piece | How it works |
|---|---|
| Where | Organisation settings → "Your organisation's data" → "Download everything (zip)". The settings are admins-only, and so is the database function |
| Server | `export_org_part(org, part, offset)` returns one file's rows as JSON, 5000 at a time, with names in place of ids (a unit's item and location, a gig line's gig and item, a quote's client). Admins only, two-step sign-in, reads only. Quote numbers as the app shows them (Q0042) |
| Files | `src/lib/orgExport.js` asks for each part in turn (page by page), writes semicolon-separated CSV with decimal commas and a byte-order mark (like the app's other CSV files), adds `messages.json` (the Messages download) and a README in the admin's language, and zips them in the browser with `fflate` (loaded only for this) |
| Parts | organisation, members (name, e-mail, role), crew not invited yet, locations, items, stock per location, units, kit contents, stock movements, clients, suppliers, gigs, gig equipment, gig crew (names, not e-mails), gig schedule, gig files (the list, not the files), quotes, quote lines (one row per line, with phase, section and line total), subrentals and their lines, repairs, inspections |
| Round trip | The headings are the import wizard's own words, so equipment, units, kit contents, clients, suppliers, gigs (the `ref` column keeps the link), gig equipment and quote lines import straight back; `src/lib/orgExport.test.js` checks it |
| Not included | Uploaded files (riders, plans, photos, repair photos): listed, downloaded from each gig. Activity history, notifications and import logs |

Checks: `supabase/tests/org_export.sql`; the files in `src/lib/orgExport.test.js`.

## Decided (2026-10-19)

- The Rentman preset is built from a **mock Rentman account** the owner created for this, whose
  field structure Claude may read and write freely. Sample export files are only needed if that
  route doesn't give enough.
- Order: after messaging and after help stage H1.

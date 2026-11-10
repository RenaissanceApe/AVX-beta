# Switching to AVX: plan

Status: **S1–S5 built**: the import wizard for locations, equipment and units (S1a, 0.41.0), Excel files and kit contents (S1b, 0.42.0), the contacts directory with its import (S2, 0.43.0), crew as held invitations (S3a, 0.44.0), upcoming jobs, their equipment and open quotes (S3b, 0.45.0), Rentman exports, the switching checklist and the calendar feed (S4, 0.46.0), the organisation export (S5, 0.47.0). Switching is complete; next on the roadmap: crew network and job board. An overhaul of the wizard, so every problem can be fixed where it shows up (IM1–IM3), is planned in "Import overhaul: fix it here" below (IM1–IM4).

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
| 2 | Equipment list | Catalogue items (category, code, brand, model, price, weight, power, replacement value, cost price and write-off months since 0.64) | The core. Most tools export it to Excel/CSV |
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
| Jobs | One row per job: number, name, start and end dates, venue, status, client, notes. Each becomes a gig (status read from words like "Bevestigd"/"Confirmado" → confirmed, "Optie"/"Concept" → draft); the client and notes go in its description, and a client whose name is in Contacts is also linked as the gig's client (0.64); the importer becomes its manager. Past jobs (ended before today) and cancelled ones are left out with a note; a new job needs a start date |
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
movement removed, which is a hand-run change: planned in IM3 ("Import overhaul" below).

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

## Import overhaul: fix it here (plan, decided 2026-11-04)

Why: an equipment file stopped at the Check step because its rows named a location "warehouse"
the organisation didn't have. The check was right, but its only answer was to go back, edit the
file and import again, and that is true of every problem today: the check lists problems, leaves
those rows out and says "Fix them in the file and import it again". Importing is tedious by
nature, so the wizard should make it as easy and as controlled as possible.

Scope: the whole wizard (it is the app's only import path), all ten kinds and all four steps.
Built in four parts, each in its own session (ROADMAP.md, prompts IM1–IM4; decision D38).

### Principles

1. **Never a dead end.** Every problem offers at least one fix on the spot, plus "leave these rows
   out". Going back to the file is one option, never the only one.
2. **Fix once for every row.** Problems are grouped by cause and value ("12 rows · location
   'warehouse'"), and one choice fixes the whole group. One-off cell errors are edited in place.
3. **Nothing changes until Import.** A fix that adds something (a location, an item, a contact)
   shows at once in the check as "will be added", is listed on the Import button ("Import 130
   rows · adds 1 location") and is saved only when Import is pressed.
4. **The check tells the truth.** Every reason the database can refuse a row is predicted in the
   check where the page has the data. Anything that still slips through comes back after the
   import with "fix and try again", not as a dead list.
5. **Your file isn't changed, and the fixes can go with you.** Rows left out can be downloaded
   with their original cells and the problem, fixed in Excel and imported as a small file.
6. Groups nobody decided on are left out, as today, and the Import button says how many ("12 rows
   waiting for a decision will be left out"). IM1 asks the owner to confirm this default.

### Check step

Every group also offers "Leave these rows out". **(IM3)** marks a fix that needs the database part.

| Situation (key today) | Kinds | Fixes offered |
|---|---|---|
| Location not in AVX (`unknownLocation`) | equipment, units | **Add "warehouse" as a new location** (type filled in as warehouse) · **Use a location you have ▾** (the closest name chosen first) |
| …but an archived location has that name | equipment, units | **Restore "warehouse"** · use another ▾ |
| A quantity with an empty location cell (`needLocation`) | equipment | **Put them in ▾** |
| Item not in AVX (`unknownItem`) | units, kit contents, equipment on jobs | **Use an item you have ▾** · **Add "X" to the catalogue** (a small form: name, code, how it's kept; for units, per unit) |
| Kit not in AVX (`unknownKit`) | kit contents | **Use an item you have ▾** · **Add "X" as a new set or case** |
| Several items share the name (`sameName`) | equipment, units, kits, equipment on jobs | **Choose which one ▾** (code, brand and category shown to tell them apart); when the chosen one has no code **(IM3)** |
| The code of an archived item (new prediction: today a surprise after the import) | same | **Restore the item (IM3)** · use another ▾ |
| Units for an item counted in bulk (`bulkItem`) | units | Use another item ▾, with the known limitation (above) explained |
| An item not kept in stock, planned on a job (`notTracked`) | equipment on jobs | **Start keeping "X" in stock (counted)** · use another item ▾ |
| Job not in AVX (`unknownJob`) | equipment on jobs | **Use a gig you have ▾** (closest name first) |
| Several gigs share the name (new prediction: shown as "new" today) | jobs, equipment on jobs | **Choose which one ▾** |
| Several contacts share the name (`sameContact`) | clients, suppliers | **Choose which one ▾** · **Add as a new contact (IM3)** |
| Client not in Contacts (silent today: kept as text) | jobs, quotes | A heads-up, not a problem: **Add to Contacts** · **Link to a contact ▾** · keep as text (as today) |
| A word AVX doesn't know (`choice`: a status "Gepland", a unit "Stück") | every choice field | **Treat "Gepland" as [Confirmed ▾]** in every row · leave it empty (the usual default) |
| A bad or missing cell (`number`, `whole`, `date`, `code`, `email`, `long`, `missing`, `noStart`) | all | **Edit the cell here** (checked again as you type). The same value in many rows ("n/a" as a price): **Treat as empty**. A code with spaces: **Remove the spaces**. Too long: **Cut to N characters** |
| A job that ends before it starts (`dates`) | jobs | **Swap the dates** · edit |
| A new item kept per unit, with a quantity (new prediction, `serialQuantity`) | equipment | **Count it in bulk instead** · **Leave the quantity out** (import its units later) |
| A unit code already on another item's unit (new prediction, `otherItem`) | units | **Edit the code** |
| Changing how an item with stock is kept (new prediction where the stock totals tell, `trackingLocked`) | equipment | **Keep it as it is** |
| A quantity for an item already in AVX (`quantityKept`, a note after the import today) | equipment | A heads-up before importing: not added, use a stock count |
| Past or cancelled jobs, inactive crew, people already in or invited, a quote already sent (new prediction) | jobs, crew, quotes | **"Left out on purpose"**: a calm list, no action until IM4, which adds **Import as past jobs** (D26) |

### Choose step

| Situation | Today | Fix |
|---|---|---|
| An Excel workbook with several sheets | only the first sheet is read | **A sheet picker**, with each sheet's number of rows |
| Title lines above the headings | the headings are assumed on line 1 | **"Headings are on row N"**, suggested |
| A CSV file saved by Excel on Windows (accents turn into "Armaz�m") | read as UTF-8 | Noticed and read again as Western (Windows-1252) text, saying so, with a switch |
| More than 5000 rows | Next can't be pressed | **Import in parts of 5000** (a batch each; a quote's lines are never split) |
| The wrong kind chosen | nothing | "This looks like a Units file", with **Switch** |

### Match step

| Situation | Today | Fix |
|---|---|---|
| A field the file doesn't have (no item column in a units file, no location column…) | blocked, except "Where is this stock?" for Rentman's equipment | **"Same for every row"**: one value for a missing field (location, item, job, client, status, role, location type). Replaces "Where is this stock?" |
| Dates written month/day | read day first: some fail, some are silently wrong | The order noticed per date column; asked when it can't be told |
| Columns with data that won't be imported | left out silently | Listed: "Not imported: Remarks, Colour" |
| A column for one of your custom fields | can't be imported (BUSINESS.md, "Not yet") | Custom fields of gigs, clients, suppliers and items offered as targets; values checked by the field's kind |

### Done step and earlier imports

| Situation | Today | Fix |
|---|---|---|
| Rows the database refused | a list, and a CSV of messages | **Fix and try again**: back to the check with only those rows, and the same fixes |
| Rows left out | a CSV of lines and messages | **Download them with their data**: the original columns plus a Problem column |
| Undo refused "already in use" | one general message | Says what uses it and offers to undo the rest **(IM3, a hand-run file)** |

### How it will be built

- The logic stays pure and tested in `src/lib/importer.js`, as one pipeline:
  `table → fixTable(table, mapping, fixes) → buildRows(…, { defaults }) → dryRun(rows, kind, existing + pending) → groupProblems(rows, plan, kind)`.
- The fixes are kept by the wizard page, so Back and Next keep them, keyed by field and value
  (so they survive a change of column): replaced values, edited cells, "same for every row"
  values, rows left out, and what's waiting to be added.
- `dryRun` gains the new predictions and says per row whether it's a problem, left out on purpose
  or a note. Edited cells are checked with `cleanValue`, as the file's are; the closest existing
  name is suggested; refusals after the import are read with `serverMessage`.
- A `FIXES` table says which fixes each reason offers per kind. A unit test checks that every
  reason the check gives and every reason the database gives has an entry, so a new refusal can't
  ship without a way forward.
- What a fix adds is saved when Import is pressed, just before the import: locations and items
  through `run_import` (each its own batch in Earlier imports, undone on its own, until IM3 puts
  them in the import's batch); contacts added as the Contacts page adds them. Restoring a
  location and "start keeping in stock" are ordinary changes the people who can import may
  already make.
- The check step moves to `src/components/import/` (the fix panel and a small "add" dialog);
  choices are radio buttons in labelled groups, with text and an icon, never colour alone. Text
  in English and Portuguese; the `wh-import` help guide and its screenshots follow.
- The fix panel is generic, so later additions to the import use it: S07's speaker specs and
  S09's electrical columns (new fields, and a `FIXES` entry for any new reason), S08's MVR/GDTF
  fixtures matched to catalogue items, and S03b's AT e-Fatura file if it is imported.
- Browser tests: IM1–IM2 write the import's own; QA4's import run comes after IM2 and only adds
  what they don't cover (it uses QA1's shared helpers, as IM does once QA1 is merged).

### Parts

| Part | What | Database |
|---|---|---|
| **IM1 · Fix it in the check** | The Check-step table (the IM3 fixes show as not available yet), grouping, cell edits, additions saved on Import, the new predictions, "left out on purpose" and heads-ups, the summary on the Import button, the `FIXES` table and its test, a signed-in browser test | None |
| **IM2 · Before and after the check** | The Choose, Match and Done tables, except the undo row; columns into custom fields | None expected (outlined first if saving custom values needs one) |
| **IM3 · The database part** | Additions and restores in the import's own batch (one undo takes it all back); exact picks by id (item, location, gig, client; checked to belong to the organisation), so same-named records without codes can be chosen and "add as a new contact" works; restoring archived items; fixes remembered with a saved matching (`import_presets.fixes`); undo saying what's in use and offering to undo the rest; units for an item counted in bulk can switch it to per unit (the S4 known limitation) | One migration, outlined for the owner's yes first; the undo change is a hand-run file (it removes records). Needs `20261117000001_import_undo.sql` to have been run (T31) |
| **IM4 · History import** (D26) | Past jobs come in as completed gigs (no booking, no clashes, nobody notified) and quotes with their accepted or declined status and dates, for year-on-year reports | One migration, outlined for the owner's yes first |

## How IM1 works (fix it in the check)

- **The pipeline** is in `src/lib/importer.js`: `checkImport` runs
  `fixTable → buildRows → dryRun(rows, kind, withPending(existing, fixes)) → groupProblems`.
  The file itself never changes: `fixTable` works on a copy, adding an empty column when a fix fills
  a field the file lacks (e.g. the voltage).
- **The fixes** are a list kept by `ImportPage`, so Back and Next keep them (a new file, kind or
  heading setting starts afresh). Each is one record: `replace` (every row with that value in a
  field, matched without capitals or surrounding spaces), `cells` (edited cells by line), `skip`
  (rows left out), `add` (a location, item or client to add on Import), `restore` (an archived
  location) or `track` (start counting an item in stock). "Your fixes" lists them, each with
  **Take back**.
- **`FIXES`** says which fixes each reason offers; every group also gets "Leave these rows out".
  `importer.fixes.test.js` reads the importer's own source and the database's reasons (`SERVER`)
  and fails if any has no entry. Fixes marked `im3` show as not available yet, with the reason;
  so do picks of a record without a code when others share its name (IM3 picks by id).
- **New predictions** in `dryRun`: an archived location or item code, gigs sharing a name, a
  quantity on a new item kept per unit, a unit code on another item, a tracking change on an item
  with stock (read from `stock_levels`). Heads-ups (`note`): a quantity for an item already in
  AVX, a job's or quote's client not in Contacts. Left out on purpose (`purpose`): past and
  cancelled jobs, inactive crew, people already members or invited, quotes already sent.
- **The Check step** is `src/components/import/CheckStep.jsx`, each group a `FixGroup.jsx`:
  radio buttons in a labelled group, each with its controls (a picker with the closest name
  first, cell editors checked with `cleanValue` as you type, a small dialog to add an item or a
  set or case). Groups nobody decided on are left out, and the Import button's note says how many.
- **Saved on Import**, in this order, just before the import: restored locations; new locations,
  then new items, each through `run_import` as its own batch in Earlier imports; items that start
  being counted; new clients (inserted as the Contacts page does). If any of these fails, nothing
  is imported. No database change.
- **Speaker and power refusals** (D80, D93): an unknown preset can be picked from the presets or
  left empty; out-of-range cells are edited in place; amps without volts can take one voltage for
  all those rows (230 suggested); an unknown connector is read as one from the connector list.
- **Tests**: `importer.fixes.test.js` (fixTable, groupProblems, the predictions, closest names,
  FIXES coverage) and the signed-in `e2e/auth/import.spec.js` (an equipment file with an unknown
  location → add it from the check → import → the stock is there, axe on the check).

## How IM2 works (before and after the check)

- **Choose.** A CSV file is read as bytes (`decodeText`): UTF-8 when it is valid UTF-8, UTF-16 by
  its mark, otherwise Western (Windows-1252), which is how Excel on Windows saves it. The page says
  so and offers a switch to the other reading. An Excel workbook lists its sheets with their number
  of rows (`readXlsx(buffer, { sheet })` in `src/lib/xlsx.js`) and reads the one picked.
  `suggestHeaderRow` finds title lines above the headings ("Stock list March"); the page sets
  "The headings are on row N" to it, and `parseTable(text, { headerAt })` leaves those lines out
  while keeping the file's line numbers (`table.offset`, `firstLine`). `guessKind` says "This looks
  like a file of Units", with **Switch**, when the headings fit another kind clearly better. A file
  of more than 5000 rows goes on: Import sends it in parts of 5000 (`splitParts`), each its own
  batch in Earlier imports, and a quote's lines stay together; the results are added up
  (`mergeResults`), and if a later part fails the Done step says how many went in.
- **Match.** "Same for every row" (`SAME_FOR_ALL`, `openDefaults`) gives one value to a field no
  column has: a location, an item, a set or case, a job, a client, a status, a role or a location
  type, picked from what the organisation has (an item or job by its code or number when it has
  one). It replaces "Where is this stock?": for equipment it is the location of the quantities.
  `buildRows(…, { defaults })` fills it in; a column always wins. Each date column's order is noticed
  from its values (`dateOrder`: a 31/12 says day first, a 12/31 month first); when no value tells,
  the page asks and Next waits. Columns with data that no field takes are listed ("Not imported:
  Remarks, Colour"). The organisation's own fields of gigs, clients, suppliers and items are offered
  under "Your own fields" (`customFieldDefs`, `fieldsFor`): text (up to 1000), number, date, yes/no
  (the import's yes/no words), choice (one of the field's choices, without capitals) and link
  (https://). Their values go in the row's `custom_values`, and a bad one is a problem in the check
  like any other cell.
- **Saving custom values** (migration `20270114000000_import_custom_values.sql`): the equipment,
  contacts and jobs import functions read `custom_values` and save it: a new record gets it, an
  existing one gets the fields the file gives merged over its own. The existing `custom_values`
  trigger checks every value; what it refuses comes back as the row's problem ("A value doesn't
  fit one of your own fields"). On an update the values are part of the import's before/after, so
  Undo puts them back. Checks in `supabase/tests/custom_fields.sql` (the last block).
- **Done.** "Fix and try again" takes the rows the database refused (`refusedRows`: each with what
  was sent) back to the check alone (`checkImport(…, { only, refused })`). Each comes back as a
  problem with what the database said, grouped like the check's own (an unknown location by its
  name), and with IM1's fixes where the refusal names a field; it stays a problem until the row
  changes or a fix answers its group. Rows left out on purpose aren't refusals. "Download the rows
  left out" (`leftOutCsv`) writes every row that wasn't imported (left out in the check, left out
  by a choice, or refused) with the file's own columns, before any fix, and a Problem column.
- **Tests**: `importer.im2.test.js` (heading row, text encoding, other kind, unused columns, same
  for every row, date order, custom fields, fix and try again, parts, the left-out file),
  `xlsx.test.js` (sheets), and two signed-in tests in `e2e/auth/import.spec.js` (a title line above
  the headings → suggested → import; a row left out → its download has the columns and the problem).

## How IM3 works (the database part)

- **Fixes go with the import.** `fixRows(fixes)` (`src/lib/importer.js`) turns what the fixes add,
  restore or switch into rows with `_fix`, sent ahead of the first part's rows: restored locations
  and items, new locations, new items, new clients, items that start being counted, items switched
  to per unit. `run_import` and `import_jobs` apply them first, in the same call
  (`private.import_apply_fix`), and log them in the import's own batch like any row, so the
  existing undo removes what was added and archives again what was restored. If one fails the whole
  call fails ("Fix not saved: …") and nothing is imported. They are counted in
  `import_batches.added`, which Earlier imports shows ("1 added by a fix"). Upcoming jobs, their
  equipment and quotes still aren't kept as batches: what their fixes add goes in a batch of its
  own, made in the same call (equipment for equipment on jobs, clients for jobs and quotes).
- **Exact picks.** A pick sends the record's id with the row (`PICKS`: `_item_id`, `_kit_id`,
  `_location_id`, `_gig_id`, `_client_id`, `_contact_id`, and `_new` for "add as a new contact").
  The database checks it belongs to the organisation and isn't archived (`private.import_pick`, the
  new overloads of `import_item_find`, `import_location_id`, `import_gig_find`, and
  `import_client_pick`) and uses it before the code and the name. So "Choose which one" works for
  same-named records without codes, and the check (`dryRun`) honours the picks too.
- **Restoring an archived item** ("Restore the item" for an archived code) is a fix like restoring a
  location; undo archives it again.
- **Remembered fixes.** With a saved matching chosen, the Check step offers "Remember these fixes
  with …" (on by default). On Import, the fixes that don't depend on the file's lines
  (`presetFixes`: replacements, picks, additions, restores; not edited cells or rows left out) are
  saved in `import_presets.fixes` (an array, up to 32 KB). Choosing the matching again brings them
  back (`withPresetFixes`); the check drops any that no longer fit (`liveFixes`: a picked record
  gone or archived, something to add that is there already, a switch already made).
- **Switch to per unit.** In a units import, an item counted in bulk offers "Switch X to per unit"
  while `import_per_unit_ok` says its only stock is opening quantities an import added (not undone),
  with no units, nothing moved and not on a gig. On Import those movements are removed (logged as
  `removed`, with the whole row) and the item is kept per unit; the units bring the stock. Undoing
  that units import puts the item back to bulk and the movements back with their ids. This ends the
  S4 known limitation. It needs the hand-run file (below); until then the fix says it isn't
  available yet.
- **Undo says what's in use.** When Undo is refused, Earlier imports asks `import_in_use(batch)`
  (from `private.import_used`: stock moved, a kit, an alternative, a gig, units added later, a case,
  a quote, a gig's or invoice's client, a subrental) and lists the first five with names
  ("Shure SM58: on the gig Festival"). **Undo the rest** calls `undo_import(batch, true)`: what's in
  use stays, with what it needs (a delete the database refuses keeps that record too), everything
  else is undone, and what stayed is recorded in `import_batches.kept`.
- **Migrations.** `20270115000000_import_fixes.sql` (add-only: the columns, the helpers, the import
  functions replaced with the same signatures). `20270115000001_import_fixes_undo.sql` (hand-run:
  allows the `removed` log entry, replaces the per-unit stub and `undo_import`).
- **Tests.** `importer.im3.test.js`; `supabase/tests/import_fixes.sql` and the last two blocks of
  `supabase/tests/import_undo.sql`; the signed-in `e2e/auth/import.spec.js` (the addition is in the
  import's batch, and one undo takes back both).

## How IM4 works (the history import)

- **Past jobs, chosen in the check.** In an Upcoming jobs file, jobs whose end (or start) is before
  today are left out on purpose, as before, but the "left out on purpose" list now offers **Import
  as past jobs** (`pastJob`) and, for past cancelled jobs, **Import as cancelled** (`pastCancelled`).
  The choice is a fix like any other (`historyFix`: a `cells` fix giving each row of the group the
  hidden field `_history` = `completed` or `cancelled`), listed under "Your fixes" and taken back
  there. Upcoming cancelled jobs stay out with nothing to choose. Groups nobody decided on are left
  out, as everywhere.
- **Up to 10 years back** (the owner's answer, `HISTORY_YEARS`, `historyFrom`): older jobs, and
  quotes decided more than 10 years ago, are listed as too old (`tooOld`) and never imported.
- **A past gig books nothing.** `private.import_gig_row` inserts it with status completed (or
  cancelled) and `gigs.from_history = true`. `handle_new_gig` gives such a gig no production
  manager, so nobody is booked (no person reservation, nothing in `person_conflicts` or
  `crew_busy`) and nobody is notified; org members still open it and its creator manages it.
  Equipment lines for it are refused (`historyGig`, predicted in the check as left out on purpose),
  so no stock is reserved. A gig already in AVX that isn't from history is never turned into a past
  one (`gigThere`).
- **Quotes with their history.** A quotes file can give, on a quote's first line, its status
  (draft, sent, accepted, declined: `quoteStatus` words / `private.import_quote_status`), the date
  sent, the date decided and a decline reason. The sent date defaults to the quote's date and the
  decided date to the sent date; both are stored at noon in the organisation's time zone in
  `sent_at` / `decided_at`, which the K reports read. `quotes_report_dates` keeps those dates only
  while `private.import_quote` writes the quote (`avx.import_history`, set for that statement);
  everywhere else it sets them as before. A reason that matches one of the reports' reasons (price,
  competitor, cancelled, unavailable, scope; `private.import_lost_reason`) is used; any other text
  is kept as "other" with the text as the note. The check predicts dates after today
  (`futureDate`) and a decision before the quote was sent (`decidedFirst`), with cell edits.
- **Nothing doubles.** Gigs and quotes are still matched by their old number (`import_ref`). A quote
  already sent or decided in AVX is left as it is; a draft imported earlier gets its lines, status
  and dates from the file.
- **Migration** `20270116000000_import_history.sql` (add-only; no hand-run file): `gigs.from_history`,
  `handle_new_gig`, `quotes_report_dates`, `import_quote_status`, `import_lost_reason`, and
  `import_gig_row`, `import_gig_equipment_row`, `import_quote` replaced from IM3's bodies (same
  signatures). `run_import`, `import_jobs` and undo are unchanged; jobs and quotes still aren't in
  Earlier imports' undo.
- **Tests.** `importer.im4.test.js`; the IM4 block of `supabase/tests/import_jobs.sql`; the
  signed-in `e2e/auth/import.spec.js` (a past job imported as done, then the same file again: 2
  unchanged). Help: the `of-import-history` guide, the `imp-history` hint and screenshot.

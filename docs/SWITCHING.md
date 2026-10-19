# Switching to AVX: plan

Status: **planned**, stages S1–S5.

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

## Questions to settle before S1

1. **Sample files.** Can you export from Rentman (or get from a friendly company) one file of
   each kind: equipment, serial numbers, contacts, crew, projects? Your own data is fine; it's
   only used to build the preset and isn't stored in the repository.
2. This session can also see a **Rentman connection**. If it's your account, reading its field
   structure (not copying data) would help build the Rentman preset. Only with your go-ahead,
   since we agreed no Rentman integration.
3. Which tools do the companies you want to win use most, after Rentman?

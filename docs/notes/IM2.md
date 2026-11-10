# IM2: Before and after the check

## Changelog
### Added
- **Choose:** a workbook with several sheets asks which one, with each sheet's number of rows.
  Title lines above the headings are noticed ("The headings are on row 3", suggested; you can
  change it). A CSV file saved by Excel on Windows is read with its accents (Western,
  Windows-1252), and the page says so, with a switch back to UTF-8. When the headings fit another
  kind better, the page says "This looks like a file of Units (serial numbers)" and offers
  **Switch**. Files of more than 5000 rows no longer stop: they are imported in parts of 5000, each
  its own import in Earlier imports, and a quote's lines stay together.
- **Match:** "Same for every row" gives one value to a field the file doesn't have (a location, an
  item, a set or case, a job, a client, a status, a role, a location type). It replaces "Where is
  this stock?". Each date column's order is noticed (day or month first). When the dates can't
  tell, the page asks before going on. The columns that won't be imported are listed ("Not
  imported: Remarks, Colour"). **Your own fields** on gigs, clients, suppliers and items can now
  take a column. Their values are checked by the field's kind and saved, and Undo takes them back.
- **Done:** "Fix and try again" opens the check with only the rows the database refused, with the
  same fixes. "Download the rows left out" gives every row that wasn't imported, with your file's
  own columns and a Problem column, to fix in a spreadsheet and import as a small file.

### Changed
- The wh-import help guide (steps 2, 3 and 5), two new ⓘ hints, and the imp-choose and imp-match
  pictures.

### For developers
- Migration `20270114000000_import_custom_values.sql`: `private.import_item_row`,
  `import_contact_row` and `import_gig_row` read `custom_values` (create or replace, same
  signatures and grants). Checks in the last block of `supabase/tests/custom_fields.sql`.
- New pure helpers in `src/lib/importer.js` (`decodeText`, `suggestHeaderRow`, `guessKind`,
  `unusedColumns`, `SAME_FOR_ALL`/`openDefaults`, `dateOrder`/`dateOrders`, `customFieldDefs`/`fieldsFor`,
  `refusedRows`, `splitParts`, `mergeResults`, `leftOutCsv`). `buildRows` and `checkImport` take
  `defaults`, `dateOrders`, `custom`, `only` and `refused`. `readXlsx(buffer, { sheet })` returns
  `sheets`. Tests: `importer.im2.test.js`, `xlsx.test.js`, and two new signed-in tests in
  `e2e/auth/import.spec.js`.

## Roadmap
| IM2 Before and after the check | A sheet picker, the heading row, files saved on Windows, imports in parts of 5000, "this looks like a … file", "same for every row", date order per column, columns not imported, your own fields as targets, "fix and try again" and the left-out rows downloaded with their data ([SWITCHING.md](docs/SWITCHING.md), "How IM2 works") | 0.83.0 |

## Pending: test lines (section 2)
- Import an Excel file with two sheets: pick the second sheet and check the rows are its own.
- Save a CSV with accents ("Armazém") from Excel on Windows and import it. The page should say it
  was read as Western text, and the accents should be right. Try the switch to UTF-8 and back.
- Import a file with a title line above the headings. Check "The headings are on row 2" is
  suggested and the columns are named right.
- Import a units file without an item column. Choose the item under "Same for every row", import,
  and check the units are on that item.
- Import upcoming jobs with dates like 01/02/2027: the Match step asks day or month first. Choose
  month first and check the gig's dates.
- Add a field of your own to items (Settings), import equipment with a column for it, check the
  value on the item. Then undo the import in Earlier imports and check the value is gone.
- Import a file with a bad row, leave it out, and download the rows left out from the Done step.
  Open the file in Excel, fix it, and import it again.
- On a phone (320 px), in both languages: the Choose, Match and Done steps with the new controls.

## Pending: new questions (section 3)
- The file hint on the Choose step still says "Excel (.xlsx, its first sheet)" ("a primeira
  folha"), which is no longer true now that a workbook asks which sheet. Rewording needs your yes.
  Proposed: "Excel (.xlsx), CSV or tab-separated, as most tools export." (Assumed: leave it until
  you say.)
- The Done step keeps the old "Download the report" (line, result, message) next to the new
  "Download the rows left out". Remove the old one? (Assumed: keep both.)
- "The headings are on row N" counts the file's non-empty lines, so in a sheet with empty rows
  above the headings the number can differ from Excel's row number. (Assumed: fine; the suggestion
  is right either way.)
- Owner's yes for migration `20270114000000_import_custom_values.sql` given on 2026-11-10 (relayed
  by the Dispatcher). Applied to the test project only; production waits for the Dispatcher.

## Session prompt
IM2

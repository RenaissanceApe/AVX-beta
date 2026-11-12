# AT5: Automated tests, import

## Changelog
### Added
- **Automated tests for the import (AT5).** 28 signed-in browser tests in
  `e2e/auth/import-more.spec.js` (tag `@import`) now check T31–T35, T37, T98, T108, T134–T139,
  T141–T143, T145, T147–T153 and T155–T160 on the test project every night, including the import
  on a 320 px phone in English and Portuguese. The import's one smoke test stays in
  `e2e/auth/import.spec.js`. New sample files (made-up data): a workbook with two sheets and
  Rentman-style contacts and crew exports.

## Roadmap
Automated tests: AT5 (import) built: `e2e/auth/import-more.spec.js`.

## T-lines automated (test names in `e2e/auth/import-more.spec.js`)
| T-line | What the tests check | Tests |
|---|---|---|
| T31 | Locations (name and type guessed), equipment with every column guessed and the matching saved, units by item code with serials; the same equipment file again with the saved matching: "2 match", 0 added, nothing doubles; Earlier imports → Undo the units import (the dialog's count, the "I understand" tick, "Undone"), the units go; undoing an import whose item is on a gig lists the item and the gig | `the move in order: …`; `undoing an import whose item is on a gig: …` |
| T32 | `equipment.xlsx` reads like a CSV (columns guessed, samples, prices and categories saved); kit contents by case and item code: the case's page lists its contents; the same file with one quantity changed: 1 updated, 1 unchanged; undo puts the old quantity back | `an Excel file reads like a CSV, and kit contents import, update and undo` |
| T33 | Clients with Dutch headings (Naam, E-mailadres, Telefoon, Straat, Huisnummer, Postcode, Plaats, Land, BTW nummer) all guessed; the address put together on three lines; a second import matches (1 unchanged, one client); Contacts → the client shows the address and their quote; archived | `clients with Dutch headings: …` |
| T34 | Members → "Import your crew from a file" → two people held (roles from "freelancer"/"employee"), "Nobody has been e-mailed yet", nothing sent; Members' "not invited yet" list: a role changed, one discarded (its confirm); the same file again: the held one matches, nobody doubles | `crew from a file are held, not e-mailed: …` |
| T35 | Upcoming jobs: the past and the cancelled job left out on purpose, statuses read (confirmed, option → draft), the client linked; equipment on jobs: the gig's Equipment tab shows the gear and the shortage when two gigs need more than there is; open quotes: one quote with two sections and lines, its client and total; the jobs file again with a changed date: 1 updated, 1 unchanged, the gig's date changed | `upcoming jobs, their equipment and open quotes: …` |
| T37 | Rentman-style equipment, serial numbers, contacts, crew and projects files: "Recognised as a Rentman export" each time, every column matched without changing it, equipment asks where the stock is; the checklist goes from 0 to 5 of 10 with counts | `Rentman exports: …`; `an item not kept in stock but with a quantity is caught in the check (bug)` (#227) |
| T98 | Name, Speaker preset, Sensitivity: "NEXO GEO M1220" fills the specs; "Nobody X1" refused with "no speaker preset by that name" | `speaker presets: …` |
| T108 | Power, Power factor, Amps, Voltage, Connector ("CEE 32/3") guessed and saved; a power factor of 1.5 refused ("outside what an electrical datasheet gives") | `electrical columns are read, and impossible values are refused` |
| T134 | Units for an unknown item: "Add … to the catalogue" → the form (name filled, code, kept per unit) → "Import 2 rows · adds 1 item"; the new item is per unit with both units | `units for an item that isn't in AVX: …` |
| T135, T159 | Status "Gepland" treated as Confirmed; the heads-up names the client (no "{value}"); "Add … to Contacts" → the gig is linked to the new client | `an unknown status treated as Confirmed, …` |
| T136 | Two fixes, Back to Match and Next: both still there; Take back one: its rows wait again | `fixes are kept through Back and Next, …` |
| T137, T145, T153, T158, T160 | At 320 px: Choose, Match (saving a matching), a check with three groups (edit a cell, treat as, a new location with its type, take back), the "Remember these fixes" line, Done, the undo dialog with the in-use list; the past-jobs check with "Import as past jobs"; in Portuguese: each step, the undo dialog and "Seguinte: Unidades (números de série)" whole on screen. Nothing scrolls sideways and the accessibility check passes on each | `on a phone: …` (two tests); `in Portuguese on a phone: …` |
| T138 | A two-sheet workbook: the sheet picker, the second sheet's rows only | `an Excel file with two sheets: …` |
| T139 | The Windows-1252 CSV: "read as Western (Windows-1252)", accents right; "Read as UTF-8 instead" garbles them, back to Western and they're right; imported | `a CSV saved by Excel on Windows: …` |
| T141 | A units file with no item column: the Match step says so, "Same for every row" → the item; the units are on it | `a units file without an item column: …` |
| T142 | 01/02/2027: Match asks day or month first and won't go on until chosen; month first → 2 January | `dates like 01/02/2027: …` |
| T143 | An item field of your own (made through the set-up), its column picked on Match, the value on the item's page; undo → the value is gone | `your own field: …` |
| T147 | Two items with the same name: "Choose which one" → the second; the unit is on it | `two items with the same name: …` |
| T148 | Two contacts with the same name: "Add as a new contact" → three | `clients whose name two contacts share: …` |
| T149 | An archived item's code: "Restore the item" → back; undo → archived again | `an archived item's code: …` |
| T150 | A saved matching, a fix ("Huurgoed" → Rental) with "Remember these fixes" ticked; the next file with that matching has the fix already | `fixes remembered with a saved matching …` |
| T151 | Equipment counted in bulk (3), then its units: "Switch … to per unit" → per unit with two units; undo → bulk with 3 again | `units for an item counted in bulk: …` |
| T152 | An imported item put on a gig: Undo → the dialog lists "… on the gig …"; "Undo the rest" removes the other item and keeps that one ("1 kept: in use") | `undoing an import whose item is on a gig: …` |
| T155, T156 | A past cancelled job stays out until "Import as cancelled"; a job from 11 years ago is listed as too old and not imported | `past cancelled jobs stay out …` |
| T157 | Quotes with Status, Sent on, Decided on and Reason: accepted and declined with their dates, "too expensive" → Price; Reports → Sales → Win rate counts both in their month and lists "Price too high" | `decided quotes: …` |

## T-lines (parts) left manual, and why
- **T31, T35, T37:** the real mock Rentman account's exports (the tests use made-up files with
  Rentman's column names; no Rentman integration). Whether the column guesses and messages are clear
  is for a person to judge.
- **T33:** Quotes → Contacts "Add them to contacts", picking a client on a draft quote and "Save to
  contacts" (the quotes editor, AT3's area); suppliers (same code path as clients); whether the
  Portuguese wording is right.
- **T34:** sending the invitations, whether they arrive and whether people with an AVX account join
  at once: that e-mails real addresses (an inbox is needed). The tests check nothing was sent.
- **T35:** whether the Portuguese wording is right.
- **T137, T145, T153, T158, T160:** on a real phone (the tests use a 320 px browser window).

## Bugs found
- **#227 (should fix):** an equipment row not kept in stock (Rentman `stock management` = `no`) but
  with a quantity passes the check, and the database then refuses it with "Stock for this item is
  kept per unit". Documented by `an item not kept in stock but with a quantity is caught in the check
  (bug)` with `test.fail()`; the Rentman test checks the other rows.

## Found, not changed (nice to have)
- `src/lib/importer.js` FIELDS: the Portuguese heading "Localização" isn't one of the names the
  equipment's location column is guessed from ("Local" and "Armazém" are), so the Windows-1252 sample
  needs it picked by hand.
- `src/lib/importer.js` cleanValue (`int`): a whole number above a field's maximum (power 99999999 W)
  is reported as "not a whole number" instead of "too big".
- Rentman-style "rental sales" value `sales` isn't a known word (`sale` is); the Rentman test treats it
  as Sale in the check. Check what the real Rentman export writes there.
- The Choose step's sheet picker counts the heading row ("Lighting · 4 rows" for 3 rows of data).
- `src/components/import/FixGroup.jsx`: the chosen fix is set once when the group appears; for
  "Switch … to per unit" that is while AVX is still checking the item, so "Use an item you have" is
  preselected and the person must pick the switch themselves.
- Undoing a units import: the dialog says "2 records it added are removed", the message after says
  "Import undone: 4 removed" (it counts the units' stock history too).
- Importing the same crew file again resets a role changed in Members ("1 updated").

## Pending: test lines (section 2)
- **AT5:** T31–T35, T37, T98, T108, T134–T139, T141–T143, T145, T147–T153, T155–T160 now run every
  night (`@import`); strike them from the manual list except the parts above. When #227 is fixed, the
  bug test turns red ("expected to fail but passed"): remove its `test.fail()` line.

## Pending: new questions (section 3)
- None.

## Session prompt
None: the Automated tests set was given by the Dispatcher.

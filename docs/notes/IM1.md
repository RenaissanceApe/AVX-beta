# IM1: Fix it in the check

## Changelog
### Added
- **Fix problems in the import's check.** Rows with the same problem are grouped ("12 rows ·
  Location “warehouse”") and one choice fixes them all: add the missing location, use one you have,
  use an item you have or add it to the catalogue, choose which of several same-named items, gigs
  or contacts, read an unknown word as a known one ("Gepland" as Confirmed), edit a cell (checked
  again as you type), treat "n/a" as empty, swap a job's dates, and more. Every group can also be
  left out. Your file isn't changed.
- **"Your fixes"** lists each fix, and each can be taken back. Back and Next keep them.
- **Nothing is added until Import.** What a fix adds shows as "will be added" and on the Import
  button ("Import 130 rows · adds 1 location"). Rows nobody decided on are left out, and the
  button's note says how many.
- **The check predicts more of what the database would refuse:** an archived location or item,
  gigs that share a name, a quantity on a new item kept per unit, a unit code already on another
  item, a change in how an item with stock is kept.
- **Heads-ups** (a quantity for an item already in AVX, a client not in Contacts, with "Add to
  Contacts" and "Link to a contact") and a calm **"left out on purpose"** list (past and cancelled
  jobs, inactive crew, people already in or invited, quotes already sent).
- Speaker and power refusals get fixes too: pick a speaker preset, edit an out-of-range cell, fill
  one voltage for every row with amps but no volts, read an unknown connector as a known one.

### Changed
- The check's counts are now: new, matching, waiting for a decision, left out.
- People already members or invited, and quotes already sent, show as left out on purpose (they
  showed as "match" before; the database already left them out).
- The wh-import help guide and its check picture.

### For developers
- No migration. New `src/components/import/` (CheckStep, FixGroup, kinds). The pipeline, `FIXES`
  and its coverage test in `src/lib/importer.js` / `importer.fixes.test.js`. New signed-in browser
  test `e2e/auth/import.spec.js` (account role `imp`, added to `e2e/auth/accounts.js`).

## Roadmap
| IM1 Fix it in the check | Every problem in the import's check gets a fix on the spot, grouped so one choice fixes every row; additions saved on Import; new predictions, heads-ups and "left out on purpose" ([SWITCHING.md](docs/SWITCHING.md), "How IM1 works") | 0.82.0 |

## Pending: test lines (section 2)
- Import an equipment file whose rows name a location you don't have: add it from the check, import,
  and check the location and the stock in Inventory. Then undo both imports in Earlier imports.
- Import units for an item that isn't in AVX: add it from the check (form: name, code, per unit),
  import, and check the units on the new item.
- Import upcoming jobs whose status is a word AVX doesn't know ("Gepland"): treat it as Confirmed and
  check the gigs' status. A client not in Contacts: "Add to Contacts" and check the gig is linked.
- Make several fixes, press Back to Match and Next again: the fixes are still there; take one back.
- On a phone (320 px), in both languages, open a check with several groups and use each control.

## Pending: new questions (section 3)
- The existing problem texts still say "(import locations first)" / "add their codes to the file"
  next to the new fixes. Rewording existing text needs your yes, so they were left as they are:
  shorten them to just the problem? (Assumed: leave as they are for now.)
- Additions are saved just before the import, each as its own batch, so if the main import then
  fails the added location or item stays (it can be undone in Earlier imports). IM3 puts them in
  the import's own batch. (Assumed: fine until IM3.)
- D80 and D93 are built (their fixes are in `FIXES`): mark both done.

## Session prompt
IM1

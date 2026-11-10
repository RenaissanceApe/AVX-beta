# IM3: The database part

## Changelog
### Added
- **One undo takes it all back.** What a fix adds (a location, an item, a contact), restores or
  starts counting in stock is now saved with the import itself. If any of it can't be saved,
  nothing is imported, and one Undo in Earlier imports takes back the import and what it added.
  Earlier imports says how many records the fixes added.
- **Choose which one, even without codes.** When two items, gigs or contacts share a name and have
  no code, "Choose which one" picks the exact record. "Add as a new contact" works too.
- **Restore an archived item** from the check, when the file names its code.
- **Fixes remembered with a saved matching.** "Remember these fixes with …" saves the fixes with the
  matching, and they come back the next time you choose it.
- **Switch an item counted in bulk to per unit** while importing its units, as long as its stock
  is still just the quantity an import added. Undo puts it back. This ends a known limitation.
- **Undo says what's in use.** When an import can't be undone, Earlier imports lists what uses its
  records ("Shure SM58: on the gig Festival") and offers **Undo the rest**.

### For developers
- Migration `20270115000000_import_fixes.sql` (add-only) and hand-run file
  `20270115000001_import_fixes_undo.sql`. `run_import` and `import_jobs` read `_fix` rows and
  exact picks (same signatures). New `import_in_use`, `import_per_unit_ok`,
  `undo_import(batch, rest)`; new columns `import_batches.added`, `.kept`, `import_presets.fixes`.
- `src/lib/importer.js`: `PICKS`, `fixRows`, `presetFixes`, `withPresetFixes`, `liveFixes`; FIXES
  no longer marks anything as waiting for IM3. Tests: `importer.im3.test.js`,
  `supabase/tests/import_fixes.sql`, `import_undo.sql` (last two blocks), `e2e/auth/import.spec.js`.

## Roadmap
| IM3 The database part | One undo for the import and what its fixes added; exact picks for same-named records without codes; restoring archived items; fixes remembered with a saved matching; undo saying what's in use and undoing the rest; bulk items switched to per unit by their units ([SWITCHING.md](docs/SWITCHING.md), "How IM3 works") | 0.84.0 |

## Owner's yes
- 2026-11-10, relayed by the Dispatcher: yes to (a) the add-only migration
  `20270115000000_import_fixes.sql` and (b) the hand-run file `20270115000001_import_fixes_undo.sql`,
  as outlined (undo the rest, switch to per unit included).
- (a) is applied to the **test** project (function bodies checked by md5); production waits for the
  Dispatcher. (b) was run by hand by the owner on test on 2026-11-10; `import_undo.sql` then ended
  with "ALL IMPORT UNDO CHECKS PASSED" and `import_fixes.sql` passed again with its post-(b) cases.
- Comparing (b)'s bodies: pasted in the SQL editor, they were stored with Windows line endings, so
  `md5(prosrc)` differs from the file's until the line endings are ignored
  (`md5(replace(prosrc, E'\r', ''))`); with that the bodies match. Compare test and production the
  same way.

## Hand-run steps (for PENDING.md)
1. Test project: run `20270115000000_import_fixes.sql` (done by IM3), then
   `supabase/tests/import_fixes.sql` → "ALL IMPORT FIXES CHECKS PASSED".
2. Test project, by hand: run `supabase/migrations/20270115000001_import_fixes_undo.sql` in the SQL
   editor. Then run `supabase/tests/import_undo.sql` → "ALL IMPORT UNDO CHECKS PASSED", and
   `import_fixes.sql` again (it then checks the post-hand-run cases).
3. Production, right before the merge: (a) first, then (b) by hand, then compare `md5(prosrc)` of
   `run_import`, `import_jobs`, `undo_import`, `import_in_use`, `import_per_unit_ok` and the
   `private.import_*` functions with test.

## Pending: test lines (section 2)
- Import equipment naming a location you don't have: add it from the check and import. Earlier
  imports shows one import ("1 added by a fix"). Undo it: the equipment and the location are gone.
- Have two items with the same name and no code. Import units for that name: "Choose which one",
  pick the second, import, and check the units are on the item you picked.
- Import clients with a name two contacts share: choose "Add as a new contact" and check a third
  one is added.
- Archive an item with a code, then import a file with that code: "Restore the item", import, and
  check it's back. Undo: it's archived again.
- Choose a saved matching, make a fix (e.g. treat "Gepland" as Confirmed), keep "Remember these
  fixes" ticked and import. Import the same kind again with that matching: the fix is already there.
- After the hand-run file: import equipment with a quantity (bulk), then a units file for it:
  "Switch … to per unit", import, check the item is per unit with its units. Undo the units import:
  it's counted in bulk with its quantity again.
- After the hand-run file: import equipment, put one item on a gig, then Undo the import: the
  dialog lists the item and the gig; "Undo the rest" removes the others and keeps that one.
- On a phone (320 px), in both languages: the undo dialog with the in-use list, and the "Remember
  these fixes" line on the Check step.

## Pending: new questions (section 3)
- `imp.fix.bulkLimit` ("can't switch to per unit here yet") is no longer shown; a new note explains
  the switch instead. The old key is left in the dictionaries until you say it can go.
- `imp.done.chooseContact` says "→ tax number {to}"; a contact picked by id without a tax number
  uses a new line ("{what} → name · email") instead. (Assumed: fine.)
- Upcoming jobs, their equipment and quotes are still not kept as batches: what their fixes add is
  a separate entry in Earlier imports (made in the same step, so it's never half done). Keeping jobs
  themselves undoable would be a later step. (Assumed: fine.)
- "Undo the rest" undoes the import for good: what stayed can't be undone later from Earlier imports
  (it's listed as kept). (Assumed: fine.)
- Under (a) alone, the old `undo_import` doesn't know that a gig or an invoice uses a client it
  added (their links are cleared, not refused). The hand-run file adds those checks, so production
  should run (b) soon after (a).

## Session prompt
IM3

# BF1: Quick changes no longer get lost

## Changelog
### Changed
- **Two quick changes are both kept.** Ticking two checklist items in a row, or making two quick
  changes in the patch, light plot, rigging and line arrays, sound system calculator, stage plot or
  power plan, could lose one on a slow network: an older save reached the database last and wrote
  the older state back, though the screen showed the newer one. Saves of the same thing now go out
  one after another, and only the latest state is sent (#214, #229).

## Roadmap
Bug fix, no row: whole-object saves are queued per thing (`src/lib/saveQueue.js`,
`src/lib/queuedSaves.js`).

## Pending: test lines (section 2)
- On a phone with a slow connection (or Chrome DevTools → Network → Slow 3G), tick two checklist
  items of a task quickly, then reload: both stay ticked. Do the same with two quick changes in the
  patch (add a stage box, tick Split) and the light plot (two phases): both are there after a reload.

## Pending: new questions (section 3)
- None.

## Session prompt
none (bug fix set from the automated tests, no prompt in docs/SESSION_PROMPTS.md)

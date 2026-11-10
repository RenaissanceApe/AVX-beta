# FX2: Test fix-ups (report capture test, quote bin test, sweep tags)

## Changelog
#### Fixed
- The database checks for report dates (`supabase/tests/report_capture.sql`) run to the end again.
  They stopped at the "declined → draft" step, which still expected the old behaviour; since the
  quote bin (0.80), a declined quote goes back to draft only through "Revise", which clears both
  report dates and the reason (#174).
- The quote bin's database checks (`supabase/tests/quote_bin.sql`) can now run through the
  Supabase connector, with the same checks as before.
- `npm run e2e:sweep` accepts 2-letter worker tags such as `u1` (2 to 40 letters, digits or
  hyphens) (#158).

## Roadmap
None: these are fixes to tests and a script, not a roadmap step.

## Pending: test lines (section 2)
- None: no screen changed.

## Pending: new questions (section 3)
- D131 (worker test tags) is settled by this change: tags may now be 2 to 40 characters, so
  `npm run e2e:sweep -- u6` works. The release worker can mark D131 decided.

## Session prompt
None (a fix-up step from the Dispatcher, tracking issue #181).

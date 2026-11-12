# BF4: Bug fixes (line arrays, channel posting, Crew tab on a phone, fee-paid test)

## Changelog
### Fixed
- Rigging → Line arrays: an array added from the sound system while the speakers were still loading was saved without its element weight, preset and bumper ("0 kg"). The picker (and "Update from the sound system") now waits, showing "Loading the speakers…", until the speakers are in (#246).
- Messages: an admin who opened an organisation channel by its link right after signing in could not post in it until they reloaded. The right to post is now worked out again once their organisations have loaded (#245).
- Gig → Crew on a phone: a long organisation name in "Add to <organisation>" made the page scroll sideways. The button now wraps (#243).
- Tests: the crew "fee paid" notification check no longer fails when the run's tag happens to contain "300"; it now checks the details for money keys and for the amount itself.

## Roadmap
None (bug fixes).

## Pending: test lines (section 2)
- Rigging on a slow connection: pick "Add an array from the sound system" straight after opening the tool; it shows "Loading the speakers…" and the array arrives with its weight and bumper.
- Open an organisation channel by its link right after signing in (as an admin): the message box is there without reloading.
- On a phone, a gig's Crew tab in an organisation with a long name: "Add to …" wraps onto two lines, no sideways scroll.

## Pending: new questions (section 3)
None.

## Session prompt
None (bug-fix set from the Dispatcher).

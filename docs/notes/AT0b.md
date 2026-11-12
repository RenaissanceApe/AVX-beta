# AT0b: Automated tests, steadier pull-request checks

## Changelog
### Changed
- **Shorter, steadier test run on pull requests (AT0b).** The signed-in checks a pull request runs
  are now 8 short tests (about 1½–3 minutes instead of 5+): signing up through the form with an
  organisation and a gig, adding crew to a gig, signing in through the form and deleting the
  account, one import check, the broken-session check, and one path per area. Everything else,
  the reports included, still runs every night. Only two tests use the sign-in form; the others
  sign in once in the background and reuse it, so several pull requests at once stay inside the
  test project's sign-in limit, and a refused or unanswered sign-in is tried again after a pause.
  The test-account clean-up now tries only the accounts the run actually made.

## Roadmap
Automated tests: AT0b built (short PR smoke set, API sign-ins, auth back-off, report waits).
How it works: docs/TESTING.md, "When it runs".

## Pending: test lines (section 2)
- **PR smoke run (AT0b):** open two pull requests at once and check both `e2e-auth` jobs pass;
  each runs `--grep @smoke` (8 tests). The nightly run still runs every signed-in test.

## Pending: questions (section 3)
- Should the test project move to a larger compute size? Report and save calls there average
  0.1–0.3 s but peak at 6–8 s (the 8 s statement limit) when runs overlap (#183, #194).

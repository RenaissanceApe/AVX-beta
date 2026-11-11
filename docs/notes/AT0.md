# AT0: Automated tests, the foundation

## Changelog
### Added
- **Automated test suite, the foundation (AT0).** Shared helpers and a fast set-up for the signed-in
  browser tests: ready-made people already signed in (an organisation's admin, member and viewer,
  crew on a gig, and another company), made through the same database calls as the app with its
  access rules; stand-ins for the town search and company-number check; readers for zip exports,
  PDFs, calendar files and two-step codes; sample import files. Each test file gets its own
  organisation and accounts, and the clean-up removes exactly what a run (or one part of it) made.
- **Every signed-in test, every night.** A new nightly run (about 03:00 Lisbon time) runs all of them
  in four parts side by side and opens one issue when something fails. Pull requests now run only a
  short smoke set.
- **Test-only database helpers** (`supabase/tests/support/test_support.sql`) for the test project:
  run by hand by the owner, never on production.
### Changed
- Live check: stops with a clear message when the crew test account is a Member or Admin of the
  company instead of a Viewer.
### Fixed
- A gig page could briefly show older data (for example a file's previous version) when two reloads
  finished out of order (#193).
- The offline test no longer stalls the signed-in tests waiting for the app's offline copy (#206).

## Roadmap
Automated tests: AT0 foundation built (helpers, set-up, fixtures, stand-ins, nightly run,
test_support). How it works: docs/TESTING.md, "Automated test suite". AT1–AT11 next.

## Pending: test lines (section 2)
- **test_support (AT0):** on the TEST project only, run `supabase/tests/support/test_support.sql` in
  the SQL editor, add `test_support` to Project Settings → Data API → Exposed schemas, then run
  `supabase/tests/test_support_check.sql`: it must end with "ALL TEST SUPPORT CHECKS PASSED". Then
  Actions → E2E nightly → Run workflow: the test "test_support: the admin becomes an AVX admin…" in
  `foundation.spec.js` must pass instead of being skipped.
- **Nightly run (AT0):** the morning after merging to main, Actions → E2E nightly has a green run (or
  one "Nightly e2e tests failing" issue listing what failed).
- **Live check crew account (AT0):** in AVX TEST CO. on production, the crew test account is a
  Viewer (Members → its role).

## Pending: new questions (section 3)
- None.

## Session prompt
None: docs/SESSION_PROMPTS.md has no section for the Automated tests set (it was given by the Dispatcher).

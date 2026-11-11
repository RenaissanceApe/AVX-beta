# LC1: Live check of the production app

## Changelog
### Added
- **Live check** (for the team, not a screen in the app): after each release a GitHub workflow
  signs two dedicated accounts of the company "AVX TEST CO." in to the live app and checks the main
  screens: the manager's 16 screens render, the crew member's own screens render, the company's
  reports, invoices, expenses, crew search and hours stay closed to the crew member, phone numbers
  and crew rates stay private, and a few screens pass the accessibility check. It is read-only: any
  request that would write is blocked before it leaves the browser and fails the check. Started by
  hand (Actions → Live check); never runs on pull requests.

## Roadmap
| LC1 Live check of the production app | Read-only check of the live app per role, started after each release; `e2e/live/`, `playwright.live.config.js`, `.github/workflows/live-check.yml` | docs/TESTING.md, "Live check" |

## Pending: test lines (section 2)
- After the next release: Actions → **Live check** → *Run workflow* (default address). Both tests
  pass; the run's notes may list `POST /rest/v1/rpc/ensure_expense_categories` as a blocked
  on-load write the first time (expected, see below).
- Run it once with a wrong `base_url` such as `http://localhost:4173`: the first step refuses it.

## Pending: new questions (section 3)
- **Writes the app makes by itself on load.** Opening Expenses calls `ensure_expense_categories`,
  which adds the starter categories the first time an organisation opens it. The check blocks it
  (nothing is written) but doesn't fail on it, or every run would fail. Options: keep it like that
  (assumed), or open Expenses once by hand as the live manager so the categories exist.
- **Traces on failure** hold the screens as the live accounts saw them (their names and emails, and
  the session, which signing out ends). They're kept 7 days and only people with access to the
  repository can download them. Options: keep (assumed), or switch traces off for the live check.
- **QA2** (docs/SESSION_PROMPTS.md) plans a broader live check (after every merge, a daily
  sign-up, the QA tag) in the same `e2e/live/` folder and `live-check.yml`. LC1 builds the
  read-only per-role part only; QA2's prompt should say to extend these files instead of a
  `LIVE=1` mode in `playwright.config.js`.

## Session prompt
none (LC1 came from the Dispatcher; it overlaps part of QA2, which stays in SESSION_PROMPTS.md)

# AT1: Automated tests, gigs, crew, the double-booking check and tasks

## Changelog
### Added
- **Automated tests for gigs, crew, the double-booking check and tasks (AT1).** 21 signed-in browser
  tests in `e2e/auth/gigs.spec.js` (tag `@gigs`) now check T1, T3, T8, T11, T23, T49–T53, T65, T104,
  T120 and T121 on the test project every night. The smoke test (the PM gives the crew a task with a
  checklist, the crew tick it and the PM sees it done without reloading) runs on every pull request.

## Roadmap
Automated tests: AT1 (gigs, crew, double booking, tasks) built: `e2e/auth/gigs.spec.js`.

## T-lines automated (test names in `e2e/auth/gigs.spec.js`)
| T-line | What the tests check | Tests |
|---|---|---|
| T1 | Crew tab → Invite crew by email (with a function): the person is on the crew list; their bell shows "1 unread notification", "… added you to <gig>" opens the gig; with test_support, the invite is in the next morning's email summary list | `adding someone to a gig from the Crew tab puts it in their bell`; `a gig invite is in the member's next morning email summary` (skips until test_support is installed) |
| T3 | Typing the email of someone booked on an overlapping gig warns "… is already booked for this time" with the other gig; Ask availability first → message → "Asked …"; they see "1 question for you" at home and answer Available; added anyway, their crew row shows "Clash", the other gig and "Said they're available" | `double booking: the PM is warned, asks availability, and the person answers` |
| T8 | Someone who shared a gig with you is found by name in Invite crew → Your network (with their function), picked, and added | `your network: someone who shared a gig with you is found by name in Invite crew` |
| T11 | A gig with equipment, a feed post, crew and a chat message: Edit gig → Danger zone → the two-step warning (impact list, "I understand", typing the name, the wait) → deleted, gone from the database with its equipment | `a gig with equipment and messages is deleted for good after the two-step warning` |
| T23 | A new crew-only account: the simple home with the next gig and "Call: 09:15"; Call sheet, Chat and Report damage open; Settings → Simple mode Off shows the full home, On the simple one again. A new organisation's first-steps card: "0 of 4 done", each step leads to its page, and it counts up as each is done until it goes; the empty catalogue and an empty gig's tabs (Schedule, Tasks, Assets, Equipment, Transport, Tools, Updates) each say what to do | `a crew-only account gets the simple home; Simple mode switches; first steps and empty screens guide` |
| T49 | A gig today opens on "On site today" with the note why, the call time and function, today's schedule and the person's task; the big buttons (Call sheet, Rehearsal notes links; Tasks, Files, Chat open their tab); Full gig view stays off after a reload; On-site mode by hand on another gig (no note); Settings → untick "Switch to On-site mode on gig days" → a gig day opens normally; the Portuguese wording | `on a gig day the gig opens in On-site mode, and it can be switched off and on`; `On-site mode in Portuguese`; `the On-site "Crew and phones" button opens the crew list in simple mode` (bug #215) |
| T50 | New task for the crew member, due tomorrow, three checklist lines; their notification opens the gig's Tasks tab; it's under My tasks; they tick two items and the task; the PM's page shows "done by …" without reloading; no Edit or Remove for crew; the PM removes it after the question; a rehearsal note's task button makes one task and says "already has a task" the second time; the Tasks tab and form in Portuguese | `the PM gives the crew a task with a checklist; …` (**@smoke**); `a rehearsal note makes one task, and the Tasks tab reads in Portuguese`; `two quick checklist ticks are both kept` (bug #214) |
| T51 | Organisation → Tasks → Checklist templates: "Van check" with four lines; a gig's New task → Start from a template fills the title and checklist; an organisation task for a member, whose notification opens My tasks with it; the Organisation / On gigs filters; a repair's "Make a task", then "already has a task"; On-site mode shows your tasks (in the T49 test) | `checklist templates, organisation tasks for a member, the filters and a task from a repair` |
| T52 | "Start with a common set", rename, colour, move up; two gig types; Edit gig lists them in order; filters by status and type in the list and the calendar; changing what a status means moves its gig (to Archived); removing a type leaves its gig with none; the export's gigs file has the status name and type | `gig statuses and types: set up, used on a gig, filtered, re-meant, removed and exported`; `a gig marked "Invoiced" (it means done) moves to the past gigs` (#217, needs a decision) |
| T53 | A gig field of each kind; Edit gig fills them (a number with a comma); "More details" shows them with the link; the gigs list finds the text; client, supplier and item fields; rename, reorder, remove (gone from the overview); the export has one column per field; crew on the gig see the gig fields, not the client ones | `custom fields: one of each kind on a gig, …`; `a removed custom field's values still come out in the organisation export` (bug #216) |
| T65 | Edit gig open in two windows: the second save says "Someone else changed this — reload …", keeps the form open, Reload shows the first change; saving twice in a row alone never shows it | `two people saving the same gig: the second is told to reload, saving twice alone is fine` |
| T104 | A gig with a signed delivery note: Delete permanently is refused with the "signed documents … Set its status to Cancelled instead" message; the gig and the signature are still there, and the database refuses the delete too | `a gig with a signed delivery note can't be deleted for good` |
| T120 | On a device set to New York time: organisation settings → Europe/London → saved; a gig's Crew tab → Set times 09:00–18:00 shows 09:00 and 18:00 and stores 09:00/18:00 London time | `booking times are read in the organisation's time zone, whatever the device's` |
| T121 | A person on a Lisbon gig and on two Tokyo gigs (the next and the previous day): the clash shows only with Tokyo's next day, on both gigs, and not with the day before | `clashes across time zones only where the days overlap in real time` |

## T-lines (parts) left manual, and why
- **T1:** the invitation email itself and the actual morning email (they need an inbox; the tests check
  the bell and, with test_support, what the summary would hold).
- **T50:** the push notification on a phone (a real device with push switched on).
- **T23:** the first-steps card's steps are checked to lead to the right page, then done through the
  set-up (company name, an item, a member, a gig) rather than by filling in each form; those forms
  have their own areas' tests.
- **T49:** "Tap each big button" for the tools that only show when a gig has them (Walk the rig, Input
  list, Power plan, Scan equipment), and the phone layout.
- **T53:** the client, supplier and catalogue item values are set through the database API (the
  forms use the same field inputs as the gig form, which is filled through the UI).
- **T65:** the same check on a schedule item, a task, a client in Contacts and a price-list / inventory
  item (the same guard; the gig form is tested) and the Portuguese wording.
- **Portuguese wording** of T50–T53 and T65 beyond what is listed above: a person reading it.

## Bugs found
- **#214 (should fix):** ticking two checklist items quickly can lose one: each tick saves the whole
  checklist, and the older save can arrive last. Documented by `two quick checklist ticks are both
  kept` (`test.fail()`); seen once without any delay while automating T50.
- **#215 (should fix):** On-site mode's "Crew and phones" does nothing for crew-only people (simple
  mode has no Crew tab, so the page switches straight back). `test.fail()`.
- **#216 (should fix):** the organisation export leaves out removed custom fields, though the settings
  say their values "still come out in the export". `test.fail()`.
- **#217 (needs a decision):** a gig set to a done status (e.g. Invoiced) stays under Upcoming while its
  dates are ahead; T52 expects it under Past. `test.fail()`.
- **#209 (already filed by AT7):** the bell over 9 unread fails axe. Here each test marks its people's
  notifications read before an accessibility check (`readNotifications`).
- Seen once each, not reproduced (16 and 4 tries): Report damage from the simple home not opening its
  form, and the organisation settings form not saving a time zone chosen right after the page opened.
  The tests now wait for the page to finish loading and check the form took the change.

## Notes for the suite
- New account role `crew2` in `e2e/auth/accounts.js` (a fresh crew-only account for T23).
- The test project was slow at times while other areas ran (a gig page taking over 20 s): this file
  waits up to 45 s for loads and gives each test up to 150 s. Accessibility checks wait for fade-in
  animations to finish (axe measured a fading button as low contrast once).

## Pending: test lines (section 2)
- **AT1:** after test_support is installed (AT0), Actions → E2E nightly: `a gig invite is in the
  member's next morning email summary` passes instead of being skipped. When #214, #215, #216 or #217
  is fixed (or decided), its test turns red ("expected to fail but passed"): remove its `test.fail()`.

## Pending: new questions (section 3)
- **#217:** should a gig with a done status (Done, Invoiced) move to Past even while its dates are
  ahead, or should T52 be reworded? Suggested default: dates decide (no change), T52 reworded.
- **#216:** should removed custom fields' values come out in the export (as the settings say), or should
  the wording change? Suggested default: export them, headed "<label> (removed)".

## Session prompt
None: the Automated tests set was given by the Dispatcher.

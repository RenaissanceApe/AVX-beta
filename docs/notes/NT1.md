# NT1: nightly signed-in run green and trustworthy

Worker notes for the release worker (docs/PARALLEL.md, "Worker rules"). Issues: #239 (first nightly,
8 failures), #237 (equal washes), new: #243 ("Add to <organisation>" on a phone), #245 (a
channel opened by its link can wrongly be read-only) and #246 (a line array added before the
catalogue loads is saved without its weight and bumper).

## What each of the 8 failures was

Run 43169869533 (main at 6386033, 4 shards at once). Times are UTC on 12 Nov.

| Test | Class | What happened | Change |
|---|---|---|---|
| `fieldtools-power.spec.js:245` suggest where to plug in | test (#237) | Three equal 300 W washes; which one goes to L2 or L3 follows their random ids | Checks each wash once, two on B (L2), one on C (L3), plus the totals as before |
| `settings.spec.js:358` send limits | test | The headless shell CI installs answers `Notification.permission` with "denied" although the test grants it (full Chromium says "granted"), so the device switch stayed off and "Send a test" never showed. Reproduced locally with the same browser | The test's init script sets the permission as it already sets the stand-in subscription |
| `settings.spec.js:653` gig page on a phone | app bug (#243) + test race | At 320 px "Add to <organisation>" (crew row, admin view) doesn't wrap: `btn` has `flexShrink: 0`. The organisation's name holds the run tag, so CI's "E2E Settings gh43169869533-1-s4" overflowed by 72 px while a local short tag fits. Locally the check also passed early because the button loads after the list | The test waits for the button, then checks the crew tab's controls and accessibility; its width moved to a new test with a fixed long name at 320 and 390 px (5 px over at 390 in one local run), marked `test.fail()` for #243 |
| `journey.spec.js:66` quote → template → print | load | The quote's save (PATCH) had no answer in 10 s at 06:49:35 while `report_overview` took 11 s and returned 500. The file is serial, so 15 later journey tests didn't run | Two shards at a time (below) |
| `messages.spec.js:101` gig chat | load | 06:44:51: the crew's gig page sent 9 reads; trivial ones took 2–4 s (the PM's, 3 s earlier, 130 ms) and one (`assets`) never got an answer, so the page stayed blank | Two shards at a time |
| `quotes.spec.js:180` client declines | load | `send-quote` returned 504 at 06:50:40 | Two shards at a time |
| `settings.spec.js:834` field and crew screens on a phone | load | Ran 06:49:38–06:51:08, through the database restart; timed out | Two shards at a time |
| `settings.spec.js:891` design sweep at 320 px | load | `send-quote` returned 500 at 06:51:44, as PostgREST restarted | Two shards at a time |

Found while re-running (not in the nightly's 8): `messages.spec.js:360` failed 1 run in 3. The admin
opened the channel by its link before their organisations had loaded and got "You can read this
channel but not post in it" (app bug, #245). The #211 test now opens the channel from the list, as a
person does; a new test holds the organisations back 3 s so the bad order happens every time, marked
`test.fail()` for #245.

Also found while re-running: `fieldtools-power.spec.js:586` (line array) failed 1 run in 6: the array
was added ~30 ms before the catalogue's speakers arrived, so it was saved as "0 kg" without its
K2-BUMP (app bug, #246). The test now waits for the speakers before picking; a new test holds them
back 3 s, marked `test.fail()` for #246.

Also in that run: shard 2's sweep failed ("viewer (inventory): signing in failed: {}") at 06:50–06:51.

## The test project's load, in numbers (Supabase logs)

- Four shards at once sent 2,600–4,400 requests a minute (06:41–06:48).
- Statement timeouts (8 s limit): 5 at 06:43, 4 at 06:48, 10 at 06:49, 7 at 06:50.
- Sign-up took 27 s on average at 06:50 (max 41 s); `delete_my_account` 13 s at 06:49.
- 06:50:31–06:51:45: Cloudflare 520/521/522/525 on every kind of call, then
  **Postgres restarted at 06:51:29** ("database system was not properly shut down; automatic
  recovery in progress"), and PostgREST and Auth restarted with it.

Choice: keep 4 shards, run **two at a time** (`max-parallel: 2`). That roughly halves the peak (two
browsers instead of four) and keeps each job short and its report the same. Cost: the shards took
8.1, 11.3, 13.6 and 15.6 min, so the night takes about 27 min instead of 16. Not chosen: 2 bigger
shards (same load, longer jobs, bigger trace artifacts); retries (a restarted database fails
everything for ~1 minute, and the suite's rule is no retries, so a real failure stays red).

The sweep now treats a sign-in that fails with a 5xx/52x, an empty answer (`{}`) or no answer as
"busy" and tries again on its next pass (20 s later), as it already did for a busy deletion.

## For the CHANGELOG (plain language)

- Nightly browser tests: fixed four tests that failed for reasons other than the app (equal lights
  placed in random order, the CI browser's notification setting, a phone check that ran before the
  list had loaded) and made the night run two groups of tests at a time instead of four, which
  overloaded the test database until it restarted. Three app bugs found on the way are #243 (a
  button on a gig's Crew tab runs off a phone's screen), #245 (a channel opened by its link can
  wrongly say you can't post) and #246 (a line array added very quickly is saved without its weight).

## For docs/PENDING.md

Section 2 (test line): after the next nightly, the issue "Nightly e2e tests failing" gets no new
comment, or only lists tests marked as known bugs.

Section 3 (questions): see "Needs your decision" in the PR.

## Found, not changed

- **#243 (should fix):** "Add to <organisation>" on a gig's Crew tab runs off a phone's screen with a
  long organisation name. `CrewTab.jsx` ~210, `btn` in `ui.jsx` has `flexShrink: 0`.
- **#245 (should fix):** `MessagesPage.jsx` `OpenConversation.load()` (~297) decides `canPost` for an
  organisation channel from `roleIn()` before the organisations have loaded, and never looks again.
- **#246 (should fix):** `LineArrays.jsx` `add()` (~32) looks the speaker up before the catalogue has
  loaded and saves the array without weight, preset and bumper.
- **The test project's database restarted under four browsers (should fix, owner's call):** if the
  test project is on the same compute size as production, a busy day in production could do the
  same. Worth comparing the two projects' compute sizes. No issue opened: it's a question for the
  owner (Needs your decision).
- **A gig page waits forever on one request that never answers (nice to have):** `GigPage.jsx` line
  ~132 loads 9 things with one `Promise.all` and no time limit; if one stalls, `<main>` stays empty
  with no message. Rare (it took a stalled server here).
- **One failure in `journey.spec.js` skips the rest of the file (nice to have):** it's serial, so
  the quote failure above cost 15 more tests, including the account deletion at the end (the sweep
  catches that).

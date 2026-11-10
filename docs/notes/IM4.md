# IM4: The history import

## Changelog
### Added
- **Bring in your past jobs.** In the import's check, past jobs (left out on purpose) now offer
  **Import as past jobs**: they come in as done gigs with their dates, client and venue, so the
  reports can compare years from the start. Past cancelled jobs stay out unless you choose
  **Import as cancelled**. Up to 10 years back: older ones are listed as too old.
- **Past gigs book nothing.** They don't book equipment or crew, don't clash with anything and
  nobody is notified. Equipment lines for them in an "Equipment on jobs" file are left out.
- **Quotes with their history.** A quotes file can give each quote's status (accepted, declined,
  sent), the dates it was sent and decided, and why it was declined. The reports count it on those
  dates. Quotes decided more than 10 years ago are left out as too old.
- Importing the same file again still matches by the old number, so nothing doubles.
- A new help guide, "Bring over your past jobs and decided quotes", with its picture, and an ⓘ hint.

### Changed
- The imp-jobs help picture (the check now shows "Import as past jobs").

### For developers
- Migration `20270116000000_import_history.sql` (add-only, no hand-run file): `gigs.from_history`;
  `handle_new_gig` skips the PM row for it; `quotes_report_dates` keeps the import's dates while
  `avx.import_history` is on; new `private.import_quote_status`, `private.import_lost_reason`;
  `import_gig_row`, `import_gig_equipment_row`, `import_quote` replaced from IM3's bodies (same
  signatures and grants). Checks in the IM4 block of `supabase/tests/import_jobs.sql`.
- `src/lib/importer.js`: `quoteStatus` words, quote fields `status`, `sent_date`, `decided_date`,
  `lost_reason`; `HISTORY_YEARS`, `historyFrom`, `quoteHistory`, `historyFix`; new reasons
  `pastCancelled`, `tooOld`, `gigThere`, `historyGig`, `futureDate`, `decidedFirst`; groups left
  out on purpose can offer a choice (`fixesFor`). Tests: `importer.im4.test.js`, one signed-in test
  in `e2e/auth/import.spec.js`.

## Roadmap
| IM4 History import | Past jobs as done gigs (or cancelled, when chosen), booking nothing; quotes with their status, sent and decided dates and decline reason, for year-on-year reports; up to 10 years back; matched by the old number ([SWITCHING.md](docs/SWITCHING.md), "How IM4 works") | 0.84.0 |

## Pending: test lines (section 2)
- Import a jobs file with a job from last year: in the check, tap "Import as past jobs", import, and
  open the gig: status Done, nobody in its crew, nothing in Equipment, no notification. Import the
  same file again: nothing doubles.
- In the same file, a past job marked cancelled: it stays out until "Import as cancelled".
- A job from 11 years ago: listed as too old, not imported.
- Import a quotes file with Status (accepted / declined), Sent on, Decided on and Reason columns.
  Check the quotes' status, and that the K reports count them in the right month and the decline
  reason shows.
- On a phone (320 px), in both languages: the check with "Import as past jobs".

## Pending: new questions (section 3)
- Owner's yes for migration `20270116000000_import_history.sql` given on 2026-11-10 (relayed by the
  Dispatcher). Applied to the test project only; production waits for the Dispatcher.
- The wh-import guide's mistake line still says past and cancelled jobs are left out "with nothing to
  do", and the check's existing hint "Nothing to do: these stay out by design" is shown when no
  group offers a choice (a new hint shows when one does). Rewording needs your yes. Proposed:
  "Past and cancelled jobs, people already in AVX and quotes already sent are left out on purpose;
  past jobs can be brought in with "Import as past jobs"." (Assumed: leave until you say.)
- The of-import-jobs guide's intro still says "Past jobs stay in the old tool's export as an
  archive." Reword to point to the new guide? (Assumed: leave until you say.)
- A quote's status "sent" is also accepted (it shows as waiting for an answer, sent on its date).
  Quote status "cancelled" isn't offered (the check asks to treat the word as another status).
  (Assumed: fine.)
- D26 is built: mark it done.

## Session prompt
IM4

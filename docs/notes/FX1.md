# FX1: Reports Overview, faster and sturdier (issue #114)

## Changelog
### Changed
- The Reports Overview loads about twice as fast for small and new organisations. Its money tiles used to run the full results
  calculation three times. Two of those runs only needed the revenue total, so they now read it
  straight from the accepted quote lines. Every number stays the same.
- If one part of the Overview can't be loaded (for example, the database is busy), the other tiles
  are still shown. The tiles from the failed part say "Couldn't load this number. Try again in a
  moment." Before, one failing part blanked the whole Overview and the key numbers on Home.

## Roadmap
None (a fix, not a step).

## Pending: test lines (section 2)
- Reports → Overview and the organisation's Home: the key numbers load as before and show the same
  values as the previous version (this month's revenue, same days last year, margin and operating
  result this year).

## Pending: new questions (section 3)
- None.

## Production (for the Dispatcher, after the owner's yes)
- The owner said yes to this migration on 2026-11-10 (relayed by the Dispatcher). It is applied to
  the **test** project only. Same report_overview output before and after: a fingerprint of 36 dates on
  finance_results.sql's data, `414534a22049bd4ae4e1beed69169bfe`, matched both times. Warm timings on
  test went from 61–72 ms to 27–32 ms.
- Report tests rerun on test after applying: finance_results, gig_finance, org_time_zone and
  finance_cash passed. reports_k1 fails its 1-second "overview on 5,000 quotes" check (5.0 s). It
  did so before this change too: the old and new K2 queries took 1.31–1.40 s vs 1.28–1.36 s on the
  same 5,000 quotes, with identical output. Issue #183 tracks it.
- Apply `supabase/migrations/20270117000000_report_overview_speed.sql` (add-only: one
  `create or replace` of `private.report_overview_pre_k3`, same signature; no index, RLS unchanged).
  Then compare `md5(prosrc)` of `private.report_overview_pre_k3` on test and production.

## Session prompt
none

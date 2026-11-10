# IMFIX: import follow-up (problem texts, file hint, two small bugs)

## Changelog
### Changed
- **Import check:** the problem texts now only say what's wrong, because the fixes right beside
  them do the rest. Gone: "(import locations first)", "(import equipment first)", "(import the jobs
  first)", "add their codes to the file" and "add their tax numbers or e-mail addresses to the file".
- **Import, Choose step:** the file hint no longer says Excel files are read from their first
  sheet; a workbook with several sheets asks which one. It now reads "Excel (.xlsx), CSV or
  tab-separated, as most tools export."

### Fixed
- The "client not in Contacts" heads-up in the import check shows the client's name instead of
  "{value}" (#173).
- On a narrow phone in Portuguese, the "Seguinte: Unidades (números de série)" button at the end
  of an equipment import wraps onto two lines instead of running off the screen (#170).

## Roadmap
None: a follow-up to the import overhaul (IM1–IM4), no new row.

## Pending: test lines (section 2)
- Import a jobs file whose client isn't in Contacts: the heads-up names the client.
- On a 320 px phone in Portuguese, import equipment: the "Seguinte: Unidades…" button fits.

## Pending: new questions (section 3)
- D132 and D133 are done (owner's yes on 2026-11-10): mark them resolved.
- Kept as they were (they don't send the person away to do something the check now does, or a
  fix isn't always there): `imp.err.unknownPreset` "(use the brand and model, e.g. …)",
  `imp.err.date` "(use 2024-03-01 or 01-03-2024)", `imp.err.notTracked` "(sets are planned
  through their contents)", `imp.err.pastJob` "(it stays in your old tool's export)". Shorten
  any of them too?

## Session prompt
none (a Dispatcher follow-up, not a prompt in docs/SESSION_PROMPTS.md)

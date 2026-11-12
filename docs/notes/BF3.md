# BF3: Bug fixes from the automated tests (logic)

## Changelog
### Fixed
- **Credit notes:** "Credit note" on an issued invoice opens a new credit note again (it used to
  leave the invoice's window as it was), on the Invoices page and on a quote's invoices (#208).
- **On site:** "Crew and phones" now opens the gig's crew list for crew-only people too (simple
  mode used to switch straight back to the overview) (#215).
- **Reports → Vehicle use:** a period that hasn't started yet loads; there is simply nothing to
  compare it with yet (#222).
- **Import → Equipment:** an item that isn't kept in stock but has a quantity is caught in the
  Check step, with two fixes there: count it in bulk instead, or leave the quantity out. It used
  to pass the check and then be refused with a misleading "kept per unit" message (#227).
- **Messages:** when a message is reported, every manager of the conversation is told, including a
  manager whose own message was reported (#221).
### Changed
- **Custom fields:** the setting and its help now say that a removed field is left out of the
  organisation export (its values are kept) (#216).

## Roadmap
- No roadmap row: bug fixes only.

## Pending: test lines (section 2)
- BF3: on an issued invoice press **Credit note**: a new credit note opens, crediting that invoice.
- BF3: as a crew-only person on today's gig, tap **Crew and phones** on "On site today": the Crew tab opens.
- BF3: Reports → Vehicle use with a custom period next week: the report loads.
- BF3: import equipment with a row "stock management: no" and a quantity: the Check step holds it
  back with "Count it in bulk instead" / "Leave the quantity out (not kept in stock)".
- BF3: as crew, report a message the gig's manager wrote: the manager's bell shows the report.
- Change T53's wording: a removed custom field is **left out** of the organisation export (owner's
  decision on #216), not "still in the export".

## Pending: new questions (section 3)
- none

## Session prompt
none (bug-fix set started by the Dispatcher)

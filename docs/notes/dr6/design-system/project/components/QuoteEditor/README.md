# QuoteEditor

The quote editor (`QuoteEditor.jsx`), built for long, dense line lists.

- **Header**: number in mono, title, status (Draft, Sent, Accepted, Declined), autosave state (`quote.saved/unsaved/saving` as a square: `accent-text` saved, `warn` unsaved), and **Send to client** as the one accent fill; Preview & print and Create gig / Open gig beside it on a computer; Versions, Duplicate, Save as template, Delete and the rest in ⋯ (on a phone the two secondaries join ⋯ too).
- **Phases** as square tabs: number · name · dates; the selected phase has a 2px `accent` top edge; **optional** phases (options not in the total) have a dashed edge and say "Option".
- **Lines** on a 32px grid: kind (Rental, Sale, Crew, Transport, Other) in a mono micro-label, description, qty, unit, factor (× with a FieldHint), price, total. All numbers mono, right-aligned, Portuguese formatting (`1 020,00`). Comments are italic `muted` rows. Sections are `label` headings on the page ground, not panels; the line grid is the one compact place (8px gaps).
- **Totals**: label left, value right in mono, the grand total bigger and bold with the currency. Discounts negative with a real minus.

Sent quotes are read-only until a new version is saved (QuoteVersions). Status words, never colour alone: Accepted `ok`, Declined `danger`, Sent `info`, Draft dashed.

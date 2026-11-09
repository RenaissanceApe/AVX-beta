# DR4 notes for the Dispatcher

What this worker would add to the files only the Dispatcher edits (docs/PARALLEL.md, "Worker rules").

## CHANGELOG (under the feature set's version, heading "DR4: Detail pages and editors")

#### Changed
- **Quote editor:** fewer buttons at the top. **Send to client** is the green one; **Preview & print** and
  **Create gig** (or **Open gig**) sit next to it on a computer. Everything else (Fill gig from quote,
  Availability, Versions, Duplicate, Save as template, Delete) is in the **⋯** menu; on a phone, Preview and the
  gig button are there too. The Details tab has no boxes around Client, Conditions and Texts, just headings
  with space between them; the Summary lists phases as plain rows; the groups of lines in a phase are no longer
  boxed. The line grid itself stays compact.
- **Equipment item page:** a calmer header (Edit and QR labels at the top, Archive in ⋯), the details without a
  box, and stock, units, bookings and history as plain rows with thin lines between them. Each location row shows
  Move and Remove; Count is in its ⋯.
- **Reports:** the report tabs are a row of words with a green line under the chosen one (no green block), and
  they scroll sideways on a phone. Sections on the Overview have more room between them.
- **Settings** and **organisation settings:** groups are separated by space instead of lines, sections have
  clear headings, and the buttons are no longer green.
- **Import:** the steps at the top are words with a line under the current one; the checklist, the kinds to
  import, the column matching and earlier imports are plain rows instead of boxes.
- Help: the guides for versions, sending a quote and quote-to-gig say where the moved buttons are now; their
  screenshots, and those of Reports, the item page, Import and the settings, are new.

## Version
Part of the design refresh feature set's version (D50 d). On its own it would be a minor bump.

## ROADMAP
Mark the DR4 row built.

## Pending: test lines (section 2)
- Quote editor (DR4): on a phone, open a quote; only Send to client and ⋯ show under the title. In ⋯: Preview,
  Create gig / Open gig, Fill gig from quote (with a linked gig), Availability, Versions, Duplicate, Save as
  template, Delete (if you may delete). On a computer, Preview and the gig button show next to Send.
- Item page (DR4): open a bulk item with stock in two locations; each row shows Move, Remove and ⋯ → Count.
  Open a serial item from a scanned label (`?unit=`): that unit is marked with the wash and a bar.
- Reports (DR4): switch through every tab on a phone; the chosen tab has a green line under it and the row
  scrolls sideways.

## Pending: new questions (section 3)
- **Quote editor's visible actions** (owner asked to be told): Send to client (primary), Preview & print and
  Create gig / Open gig (secondary). Why: sending is the step that moves a quote on, Preview is checked before
  every send and is how quotes are printed or saved as PDF, and the gig button is the hand-off to production
  once a quote is accepted. Versions, Availability, Duplicate, Save as template, Fill gig from quote and Delete
  are used less often. Change: swap entries between `secondary` and `moreActions` in `QuoteEditorPage.jsx`.
- Four help guide steps were reworded to say the moved buttons are in ⋯ (en + pt: of-build-quote,
  of-versions, of-send-quote, of-quote-to-gig). Keep, or word them differently?

## Session prompt
"DR4 · Detail pages and editors": remove its section and update
the "built" line.

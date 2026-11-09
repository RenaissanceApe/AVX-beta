# DR6 notes for the Dispatcher

What this worker would add to the files only the Dispatcher edits (docs/PARALLEL.md, "Worker rules").

## CHANGELOG (under the feature set's version, heading "DR6: The sweep")

#### Changed
- **Every screen, the same few sizes:** the screens the earlier steps didn't reach (organisation menus and pages,
  reports, inventory panels, invoices, public quote and report pages, the call sheet and more) now use the same seven
  text sizes and the same spacing steps as the rest of the app. The smallest text grew from 10–12 px to 11–13 px.
- **The ⋯ "More actions" button** is bigger on a phone (44 × 44 px), so it's easy to hit (#126).
- **Help:** every guide's pictures were taken again so they show the screens as they are now.

#### For developers
- The off-scale test now fails on any text size or gap off the scales, in every `.jsx` and `.css` file
  (`src/theme/offScale.test.js`); the per-file baseline is gone. It also reads the size in a `font:` shorthand, and
  ignores pt / mm / em sizes (print sheets) and the 1px hairline grid in the menu cards.

## Version
Part of the design refresh feature set's version. On its own it would be a patch bump.

## ROADMAP
Mark the DR6 row built (done in docs/DESIGN_REFRESH.md, which is not a shared file). With DR6 the design refresh
(DR1–DR6) is complete.

## docs/PENDING.md
- Section 2 (to test): "Design refresh sweep (DR6): on a phone (320 px if you can), open a few screens no earlier
  step touched — Organisations, Reports → Cash, Inventory → Maintenance and Sub-rentals, an invoice, a shared quote
  link, the call sheet in large text — and a page with a ⋯ button. Text is readable, nothing is cramped or cut off,
  and ⋯ is easy to hit."
- Section 3 (new questions): see "Needs your decision" below.

## SESSION_PROMPTS.md
The "DR6 · Sweep" prompt was carried out: remove its section and update the "built" line.

## Needs your decision

1. **The design system artifact was not updated.** The publish to the "AVX" Design System artifact
   (claude.ai/artifact/WJutLzGMprXUuAz2QkHgfL) was refused by this session's permission check (changing a shared
   resource). The changed files are ready in `docs/notes/dr6/design-system/project/`, at the paths they have in the
   artifact:
   - `tokens.json`: type styles cut to DESIGN.md's seven sizes (28 / 22 page title, 24 big number, 20 timecode,
     16 heading, 14 body and buttons, 13 meta, 11 labels; the old 20px "title" and 15px "heading" are gone);
     spacing usages rewritten as the three distances, plus `space-section` (40 / 48) and `gutter` (16 / 24); rows
     52 px (name + meta) and a new `row-single` 44 px; compact sizes marked "data grids only".
   - `README.md`: Typography and Layout follow DESIGN.md; a new "Room to breathe" section (the seven rules, the
     layout pieces `Section`, `Stack`, `PageHeader`, `SwipeRow`, `MoreMenu`, and the squint check); the
     before-shipping checklist adds one accent fill and sizes on the scales.
   - Component notes: Button (one accent fill, 14 px label, ≤ 2 buttons on a card, rest in ⋯), StatTile (SwipeRow),
     SegmentedControl (2 px bar, no fill), Dialog (16 px title), GigCard (14 px name), GigHeader (PageHeader, Edit gig
     in ⋯ on a phone, plain counts), EmptyState (the slim First steps row), JobCard (a row, two buttons), QuoteEditor
     (Send to client, secondaries, ⋯; sections not panels), AppShell (PageHeader, gutter, 960 px column).
   - `design-system.json`: only `lastChange` differs. Read the live one again right before publishing and change
     only `lastChange`, so nothing added in the page meanwhile is lost.
   To publish: allow the Artifact tool in this session (or a new one) and ask Claude to publish these files to that
   artifact, or paste them in the page's Files.
2. **Not restyled in DR6** (the Dispatcher asked to keep each file's look the same apart from sizes and gaps):
   `RepairRow` / `DueRow` in `MaintenancePanels.jsx` (DR4 left them for DR6) and the field-tool row cards that show a
   state with their border (DMX clash, checked input line, note priority; DR5 left them for DR6). They still have a
   box per row. Restyle them in a follow-up (hairline rows, and a word or icon for the state so it isn't the border's
   colour alone)?
3. **Buttons are 13 px; DESIGN.md says buttons use the 14 px body size.** `btn` in `ui.jsx` (and many inline
   buttons) use 13 px. Moving them to 14 changes every button's width, so it was left; the artifact notes say 14.
   Move the code to 14, or change DESIGN.md to 13?
4. **Paddings are still off the grid in places** (e.g. `9px 14px` in `btn`, `22px` in `Modal`, `12px 14px` on cards).
   The test counts sizes and gaps only, as the prompt asked. Extend it to paddings and margins in a later step?
5. **Repeated from DR1** (still open, not acted on): the i18n keys `home.myWorkIntro`, `firstSteps.left` and
   `firstSteps.done` look unused. Remove them?
6. **Repeated from DR5:** On-site's call time and timecode clock stay at 28 px (the table says 24 and 20) for reading
   at arm's length; and Read aloud stays in view on the Simple home card. Keep both?

# Design refresh: room to breathe

Decided 2026-11-06 (D48). The owner found the whole app too busy. This file holds the assessment
and the build order. **The rules themselves live in [DESIGN.md](../DESIGN.md)** ("Room to breathe",
"Home", "Typography", "Layout", "Motion"); every screen session reads them there.

## What makes it busy

Checked against the code (inline styles in `src/**/*.jsx`) and the 119 help screenshots, which are
the real screens with sample data.

| Suspect | Verdict | Evidence |
| --- | --- | --- |
| Colour palette | **Not the cause.** Navy, panel and one green are calm on their own | The noise comes from *how often* green is used, not the colours: 2–4 green fills on one screen (the next-event card: call-time wash, "Call sheet" button, "Available"; Invoices: "New invoice" and the selected "All" filter) |
| Square corners | **Not the cause**, and brand-locked (Brand Book §11) | Square corners read calm when there is space around them; boxed and cramped, every edge adds a line |
| Spacing | **Main cause** | 11 different gap values between 2 and 22 px (most used: 8, 6, 10); sections are 20–24 px apart while items inside are 8–12 px apart, so nothing groups; values off the 4 px grid (3, 5, 6, 7, 10, 14, 18, 22) in about 1,400 places |
| Boxes | **Main cause** | Sections are each wrapped in a bordered card, cards hold bordered cards (members invite list, next-event card), list rows are cards; on a phone the screen becomes a grid of outlines |
| Too many elements | **Cause** | Page headers carry an intro paragraph plus 2–3 buttons (Invoices, Contacts, Inventory item); cards show 4 buttons in a 2×2 grid; section descriptions repeat what ⓘ already explains |
| Type | **Contributes** | 15 text sizes in use; most text is 12–13 px (774 places) against a 14 px body; uppercase Space Mono labels at two levels on the same screen ("O SEU PRÓXIMO EVENTO" above the event title) |
| Loading | Fixed in 0.74.1 | Was 197 spinning icons; now one `<AvxLoader>` |

## The decisions (now in DESIGN.md)

1. Three distances: within 4–8, between items 12–16, between sections 40 phone / 48 desktop.
2. One box deep: sections are space + heading; cards only for things you open or act on.
3. One loud thing: one accent fill per screen; selected tabs and filters are a 2 px bar.
4. Say it once: a header is the title + at most one short line + ⓘ; explanations go behind ⓘ.
5. Few actions in view: one primary + two secondary in a header, two per card; the rest in ⋯.
6. Most important first; nothing repeats the top bar on phone.
7. Seven type sizes; body 14 px.
8. Comfortable by default; compact only in data grids.
9. Home is modular (standard: First steps → Availability requests → Key numbers → Events),
   rearranged per person and workspace; Key numbers are a swipe row on phone; no organisation
   name on the phone home.
10. Loading is the AVX Pixel Build everywhere.

## Build order

One session each, in order, from its prompt in [SESSION_PROMPTS.md](SESSION_PROMPTS.md). No
database changes are expected (the home arrangement is saved on the device, like Appearance). Each
session regenerates the help screenshots of the guides whose screens it changed, checks 320 and
390 px in both languages and all three themes, and keeps axe clean.

| Step | Screens | Why this order |
| --- | --- | --- |
| **DR1** Foundations + Home ✅ built (see "How the foundations work") | `Section`, `Stack`, `PageHeader`, `SwipeRow`, `MoreMenu` in `ui.jsx`; CSS variables for the spacing steps; a test that stops new off-scale sizes and gaps (counts may only go down); the modular home with Arrange home, the swipe row, the phone header and the slim First steps | Everything after uses the pieces; the home is the first screen everyone sees |
| **DR2** Gig | Gig header, Overview (next-event card included), Schedule, Crew, Equipment, Feed/Chat tabs | The most used screen |
| **DR3** Lists ✅ built (see "How the list pages work") | Quotes, Invoices, Inventory, Contacts, Members, Expenses, Hours, Leave, Jobs, Find crew | Same pattern repeated: header, filters, list rows |
| **DR4** Detail and editors | Quote editor (stays compact in the line grid), Inventory item, Reports, Settings and organisation settings dialogs, Import | Denser screens: apply rules 2–5 without losing data |
| **DR5** Field and crew ✅ built (see "How the field and crew screens work") | My work, Simple home, On-site, Scan and Dispatch, field tools, Messages, Help | Used standing up and on phones |
| **DR6** Sweep | Everything left, the ratchet test down to zero, all help screenshots refreshed, the design system artifact brought in line | Finishes the refresh |

## How the foundations work (DR1, built)

**Spacing steps** are CSS variables in `index.html`: `--space-1` … `--space-7` (4 · 8 · 12 · 16 · 24 · 32 · 48 px),
`--space-section` (40 px phone / 48 px from 768 px) and `--gutter` (16 / 24 px). In JS, `space` from `ui.jsx`
gives the same values (`space[3]` → `var(--space-3)`, `space.section`). The layout pieces' CSS is in
`src/theme/brand.css` (`.avx-section`, `.avx-page-head`, `.avx-swipe`, `.avx-more`).

**The pieces** (`src/components/ui.jsx`, each with a usage comment above it):

| Piece | Use it for |
| --- | --- |
| `Section` | a page section: 16 px heading (`id` names it for `aria-labelledby`), optional `link={{ to, label }}` or any `aside` on the right, content on the page ground. Sections next to each other are 40/48 px apart by themselves (`.avx-section + .avx-section`), so a module that renders nothing leaves no gap |
| `Stack` | items with a gap from the steps: `gap` 1–7 or `'section'`, `direction`, `align`, `wrap`, `as` |
| `PageHeader` | `title`, optional `eyebrow` (small line above), `line` (one short line), `after` (chips), `help` (`<PageHelp>`), `primary` (one element), `secondary` (up to two actions shown on desktop), `more` (the rest). On phone the secondaries move into the ⋯ menu. An action is `{ label, icon?, onClick, disabled? }` |
| `SwipeRow` | tiles: a scroll-snap row on phone (`item` = tile width, default 44%), a grid of `cols` (default 3) from 768 px; a focusable region named by `label`; ← → scroll it |
| `MoreMenu` | the ⋯ button ("More actions") with a menu of actions; ↑ ↓ Home End move, Escape or a click outside closes and returns focus. Renders nothing with no items |
| `usePhone()` | true below 768 px, follows the window |

**The ratchet** (`src/theme/offScale.test.js`, counting with `offScale.js`): text sizes off 11 · 13 · 14 · 16 · 20 ·
22 · 24 · 28 and gaps off 0 · 4 · 8 · 12 · 16 · 24 · 32 · 40 · 48, per `.jsx` file, against
`offScale.baseline.json`. A file's count going up fails; going down also fails until the baseline is lowered
(edit the number, or `UPDATE_OFFSCALE=1 npx vitest run src/theme/offScale.test.js`). Per file, so sessions on
different screens don't touch the same line. Start (2026-11-09): 644 sizes and 639 gaps in 177 files.

**The home** (`src/pages/Dashboard.jsx`): `PageHeader` (phone: the greeting is the title, no organisation name;
the role description is the role chip's ⓘ), then the slim First steps row (`FirstSteps.jsx`: one row, opens the
steps still to do), then the modules in the person's order: `requests` (My work), `numbers` (My numbers / Key
numbers, in a `SwipeRow`), `events`. "Arrange home" at the end opens `ArrangeHome.jsx`. The order and hidden
modules are saved in `localStorage` under `avx.home.layout.<user>.<workspace>` by `src/lib/homeLayout.js`
(standard order = nothing saved; a module the saved order doesn't know joins at its standard place). Key numbers
are no longer folded with their heading: hiding them is done in Arrange home.

## How the field and crew screens work (DR5, built)

- **Text sizes and gaps** in every DR5 file are on the scales (the ratchet baseline has no DR5 file left in it, except
  `DmxWalkPage.jsx`'s `0.45em`, which the counter reads as a 0). Off-scale sizes went to the nearest size above
  (12 → 13, 15 → 16, 17 → 16 for headings); gaps to the nearest step (6 → 8, 10 → 12, 14 → 16).
- **Headers:** My tasks, My numbers, Pocket tools, Messages and Dispatch use `PageHeader`; Help and a guide use the
  page-title type (`.avx-page-head__title`). Dispatch: Sound and Scan mode stay in view (used standing); Packing list and
  the warehouse numbers are secondary (in ⋯ on a phone). Record is the screen's one green fill.
- **One box deep:** On-site mode's Today and My tasks, My numbers' sections, the Simple home's later gigs, the Messages
  list, search and saved, the Help guides and glossary and the light plot's fixture list are sections or hairline rows,
  not cards. Cards stay for things you act on: the On-site tiles, the next-gig card, the scan form, the availability
  question, the open conversation, the field tools' editors.
- **The Simple home's next-gig card:** two buttons in view (Call sheet, the one green fill, and Chat), Read aloud under
  them, Open the gig and Report damage in the card's ⋯.
- **Selected and current:** Messages' Search / Saved and My tasks' "Open only" are marked with a 2px accent bar; the
  glossary word you arrived at has the `selection` wash and a 2px accent edge; your call on On-site has the wash.
  Guide step numbers are an outlined square with green text, no longer a green fill per step.
- **44px targets** for what's used standing: On-site's buttons and schedule rows, the Simple home's buttons, Dispatch's
  form and rows, the Messages header's icon buttons and Search / Saved / New channel, the glossary search.
- **Not changed:** the field tools' print sheets (stage plot, input list, patch, light plot, system, rehearsal report)
  are paper documents. Field-tool row cards that show a state with their border (a DMX clash, a checked input line, a
  note's priority) keep the card until DR6 finds another signal that isn't colour alone.

## How the list pages work (DR3, built)

Quotes, Invoices, Inventory (the list), Contacts, Members, Expenses, Hours, Leave, Jobs, Job posts and Find
crew share one pattern, from `src/components/ListParts.jsx`:

- **The page:** `pageWrap` (960px column, the gutter, 32px from the header to the first section), then
  `PageHeader` with the title, the ⓘ and one primary button; the other buttons are `secondary` (in ⋯ on a
  phone). The organisation's name is not repeated above the title.
- **Filters and tabs:** `FilterTabs` — words in a row, the chosen one `text` + a 2px `accent` bar, scrolling
  sideways on a narrow phone. `tabs` makes them tabs (`role="tab"`, they switch a panel: Quotes, Inventory,
  Contacts, Expenses, Jobs); otherwise toggle buttons (`aria-pressed`: Quotes' status, Invoices' views,
  Inventory's filters).
- **Rows:** a `<ul style={rowList}>` with `row` (or `rowButton` for a row you open) and `rowName` /
  `rowMeta` for the two lines: a hairline between rows, 52px tall, no card per row. `JobCard` is such a
  row. Crew search results stay cards (a person you act on); the cards hold at most two buttons, the rest
  in ⋯.
- **Explanations:** the line that used to sit under each title is in the page's ⓘ; notes at the top of a
  tab (Locations, Movements, Recurring, Crew to pay, Held invitations, Members) are a `Hint` ⓘ.
- Sections inside a page (Leave, Expenses, the invoicing program) use `Section` or the `avx-section`
  classes: a 16px heading on the page ground, 40/48px apart.

## Not changing

The palette, the three themes, square corners, Space Mono + Inter, the 5×5 glyph and the paper
documents (call sheet, quote document, labels) stay as they are.

# AVX — product design system

AVX is the **AV production copilot**: gigs, crew, quotes and inventory for AV companies and the freelancers who work for them. It runs as a web app and PWA (React 18 + Vite, Supabase), in English and Portuguese. AVX is **a Lumen and Pixel product**: it inherits the L&P brand (Brand Book v1.2, `DESIGN.md`) and adds what a dense, daily-use tool needs — three themes, a status vocabulary, label colours and product copy rules.

This system is drawn **around the app that exists** (`RenaissanceApe/AVX-beta`): its pages, navigation, roles and token names. The visuals are new — the app's earlier look (Nunito, rounded cards, gradients, glows, blur) is replaced by the L&P language. Tokens use the **same names as `src/theme/tokens.js`**, so a value here is a value there.

## How the app is organised

- **Workspaces.** *My work* (every gig you're on, at any company, in any role) or an **organisation** you belong to. Your org role — **admin**, **member**, **viewer** — decides what you see (`navSections` in `src/lib/nav.js`). On a gig you are **PM**, **crew** or **viewer**. Never show a place the role can't use.
- **Places.** *My work:* My gigs, My calendar, Availability, My tasks, My hours, Jobs board, Pocket tools, Organisations. *Organisation:* Gigs (list, calendar, new) · Quotes (quotes, contacts, price list, templates, company) · Inventory (catalogue, locations, movements, maintenance, sub-rentals, reports, labels) · Organisation (members, tasks, find crew, jobs, leave, hours, settings).
- **A gig** has tabs: Overview, Schedule, Files, Equipment, Crew, Tools, Chat, Updates, Tasks, Hours; a printable **call sheet**; equipment that is packed and returned by **scan**.
- **Navigation.** Desktop: top bar with the workspace switcher and section **mega-menus** (cards + list). Phone: a **bottom bar** of three daily places plus **More** (a sheet).
- **Appearance** (Settings): theme Show / Daylight / Contrast / System, text size, Comfort mode, Readable font (Atkinson Hyperlegible), Simple mode.

## Principles

1. **The call time is the truth.** Every screen a crew member opens answers *where, when, with whom*. Their own call is the one accent-filled thing in a row.
2. **Exact, not friendly.** Times, money, quantities, serials and codes in Space Mono, 24-hour clocks, Portuguese number format (`1 020,00 €`). "Booked on NOS Alive 12 Dec, 08:00–20:00", not "Heads up!".
3. **Built for the dark.** People use AVX at FOH, backstage, in a van at 2 a.m. **Show** is the default; **Daylight** is for sun and office; **Contrast** for low vision and glare.
4. **Colour is never the only signal.** Every status is a square plus a word. Every warning has an icon and a sentence.
5. **Square, flat, calm.** Radius 0 everywhere, no shadows, no glows, no blur, no gradients in the UI. Motion only reports state.

## Themes

| Theme | id in code | ground → panel → chrome | accent |
| --- | --- | --- | --- |
| Show | `dark` | blue-700 `#021829` → `#03213a` → blue-900 | green-500 `#33fb31` |
| Daylight | `light` | gray-100 → white → blue-100 | **navy** blue-700 (lime has no edge on white); `accent-text` olive `#3f511a` |
| Contrast | `contrast` | blue-900 → blue-700 → black | green-500; lines at 2.5× |
| System | `system` | follows the OS between Show and Daylight | |

`lineK` (1 / 1.6 / 2.5) scales every hairline: `line` = fg at 7% × lineK, `line-strong` (control edges) = fg at 38% × lineK — the lowest mix that is 3:1 on `panel` in every theme. All text tokens are ≥ 4.5:1 on bg, panel, fill, hover and chrome in all three themes (checked by `gen_tokens.py`, mirrored by the repo's theme tests).

## Colour roles

- **Grounds:** `bg` → `panel` (cards, sheets, menus) → `fill` / `hover` / `selection`; `chrome` for the top bar and tab bar. Separation is a 1px `line`, never a shadow.
- **Text:** `text`, `text2` (venue, client, times you still need to read), `muted` (labels, metadata), `soft` (placeholders).
- **Action:** `accent` fill + `on-accent` text, `accent2` for hover. One filled primary per view. `accent-text` for accent as text or indicator (links, live squares, the glyph).
- **Function:** `danger` (clash, lost, refused, destructive), `warn` (hold, shortage, due, unsaved, offline), `info` (neutral, sent, out). With `danger-soft` / `warn-soft` for banner grounds. These are **functional, not brand**: never fills of cards, never gradients.
- **Labels:** gig labels are user data stored as 9 DB keys — grey, blue, green, yellow, orange, red, purple, pink, sky → `muted`, `info`, `accent-text`, `yellow`, `orange`, `danger`, `purple`, `pink`, `sky`. They render only as a **square + word** (LabelChip, calendar event square). Never a coloured block.
- **Paper:** call sheets, quote documents, packing lists and QR labels are `paper` white with `ink` navy whatever the theme.

## Status vocabulary

| Domain | States |
| --- | --- |
| Gig | Draft (dashed) · Confirmed (ok) · Active (info) · Completed, Archived (off) |
| Quote | Draft (dashed) · Sent (info) · Accepted (ok) · Declined (danger) |
| Crew / availability | Pending (open) · Available / Accepted (ok) · Not free / Declined (off) · Hold (warn) · Clash (danger) |
| Unit | Available (ok) · Out (info) · In repair (warn) · Lost, Written off (danger) · Retired (off) |
| Inspection | OK (ok) · Due soon (warn) · Overdue (danger) |
| Hours | Submitted (open) · Approved (ok) · Rejected (danger) |
| Sub-rental | Draft · Requested (open) · Confirmed (ok) · Declined (danger) · Returned, Cancelled (off) |

Use the i18n words (`status.*`, `quoteStatus.*`, `inv.unitStatus.*`…) everywhere: badges, filters, legends, notifications, exports.

## Typography

- **Space Mono** 400/700 names things: page and card titles, uppercase `label`s, table heads, and every piece of data (times, dates, money, quantities, serials, codes, timecode).
- **Inter** 400–700 explains them: sentences, buttons, inputs, nav.
- **Readable font** setting swaps both for Atkinson Hyperlegible; layouts must survive it.
- **Seven sizes, no others** (DESIGN.md "Typography", 2026-11-06): 28 / 22px page title (computer / phone, one per page), 24px a big number (key numbers, totals, a call time), 20px timecode and clocks in field tools only, 16px section heading, 14px body (sentences, names in lists, buttons, inputs; 16px inputs on a phone), 13px metadata, hints and table cells, 11px uppercase labels tracked 0.16em. 12px goes to 13; 10, 15, 17 and 18 go to the nearest size on the scale. Nothing under 11px.
- Uppercase labels are one level only: a section has a 16px heading *or* an 11px eyebrow, never both; a card has no eyebrow above its own title. Titles sentence case.

## Layout and density

- 4px grid, and only the steps: 4 · 8 · 12 · 16 · 24 · 32 · 40/48 (`space-1`…`space-7`, `space-section`). No 2, 3, 5, 6, 7, 10, 14, 18 or 22. Page gutter 24px desktop, 16px phone (`gutter`); content column 960px max; the page header sits 32px above the first section.
- **Three distances:** within an item 4–8, between items 12–16, between sections 40 on a phone / 48 on a computer.
- Top bar 56px; phone top bar 52px and tab bar 64px + safe area. Mega-menu panels up to 720px.
- Controls 36px desktop, **44px on phone and anywhere used standing** (scan, availability answers). Rows 52px with a name + meta line, 44px with one line; quote lines and dense tables 32px with 8px gaps (the only compact places).
- Comfort mode = 44px everywhere and no motion.

## Room to breathe

Decided 2026-11-06 (D48) after the owner found every screen busy, and applied to every screen in the design refresh (DR1–DR6). The palette and square corners stay; the noise came from boxes, small uneven gaps, several loud things per screen and explanations printed on the page.

1. **Space shows the structure.** The three distances above; the gap between sections is at least three times the gap inside one, so grouping reads without a border.
2. **One box deep.** A page section is a heading and its content on the page ground, not a card. A card (`panel` + 1px `line`) is only for a thing you open or act on as a whole: a gig, a tile, a dialog. A card never holds a bordered card. Lists are rows with hairlines between them, not a card per row.
3. **One loud thing.** One `accent` fill per screen: the primary action. Selected tabs, filters and segmented buttons are `text` + a 2px `accent` bar, never a fill. "Done" and "available" are an `accent-text` square + word. The `selection` wash marks one thing only (the current row, "now", your own call).
4. **Say it once.** A page header is the title, at most one short line (one line at 320px), the ⓘ and actions. Explanations go behind ⓘ or into the empty state.
5. **Few actions in view.** A header shows one primary and at most two secondary buttons; the rest in a ⋯ menu. A card or row shows at most two buttons. On a phone the header's secondary buttons move into ⋯.
6. **Most important first.** No title that repeats the top bar on a phone.
7. **Density is chosen.** Comfortable by default; compact (32px rows, 8px gaps) only in data grids. Comfort mode (44px targets) applies on top.

**The layout pieces** (`ui.jsx`, from DR1): `Section` (a 16px heading with an optional link or aside on the right, content on the page ground; sections next to each other are 40/48px apart by themselves), `Stack` (items with a gap from the steps), `PageHeader` (title, optional eyebrow, one line, chips, ⓘ, one primary, up to two secondary actions shown on a computer, the rest in ⋯), `SwipeRow` (tiles: a scroll-snap row on a phone, a grid from 768px), `MoreMenu` (the ⋯ "More actions" button: 36px on a computer, 44px on a phone; arrow keys move, Escape closes and returns focus).

**Checking a screen:** squint at it at 390px. You should see the title, two to four section blocks with clear gaps, and one green thing. The repo's off-scale test fails on any text size or gap off the scales.

## Shape, depth, motion

Radius 0, enforced globally (`*, *::before, *::after { border-radius: 0 !important }` in index.html). Depth is a step in ground, a 1px line, and the flat 72% scrim behind dialogs and sheets. No `box-shadow` except focus rings and 2px indicator bars; no `backdrop-filter`.

Motion (L&P §09): 100ms press, 150ms hover/colour, 250ms tabs/dialogs (`cubic-bezier(.16,1,.3,1)`), rise 10px on enter. Loading is a blinking square, never a spinning circle. `prefers-reduced-motion` and Comfort mode remove it.

## Iconography

L&P **Signal Pixel** (24 grid, 2px, square caps, mitre joins, `currentColor`, one optional signal pixel). The app still uses lucide-react: set square caps and mitre joins globally now, swap icon-for-icon from `ICONS.md` (group P3) later. See `assets/Icons`.

## Voice

Operational, terse, second person, EN and PT side by side (every new string goes in `src/i18n/en.js` and `pt.js`).

- Buttons: verb + object, sentence case — "Send quote", "Remove from gig", "Record".
- Warnings: what, where, what to do — "Booked on NOS Alive 12 Dec, 08:00–20:00. Change his shift or find someone else."
- Empty states name the space and why it's worth filling.
- Never: "Oops", "Successfully", exclamation marks, "please" in errors, emoji in UI.

## Brand relationship

- The **AVX glyph (B, locked)** — D1 · B2 C2 · A3–E3 · C4 D4 · B5 — is the only logo in the product: `AvxMark` in `ui.jsx`, the favicon and PWA icons. No tile behind it.
- "A Lumen and Pixel product" appears on sign-in, Help → About and exported documents.
- Brand patterns stay out of the UI except the quiet dot field in empty states. Patch is for physical and marketing surfaces.

## Using this system

- Tokens → CSS variables with the same names the app's `themeCss()` emits (`--bg`, `--panel`, `--accent-text`…); `line`, `line-strong`, `fill`, `hover` are the `color-mix` formulas above, given here as resolved values.
- Components are framework-free `avx-` classes (`components/bundle.css`) with a live preview and a README naming the screen and file they map to. In React, port the rules into `ui.jsx` style objects; don't invent new ones.
- Before shipping a screen: one accent fill (the primary action); sizes and gaps on the scales; sections on the page ground, one box deep; every status has a word; every corner 0; no shadow, glow, blur or gradient; data in Space Mono; contrast checked in all three themes; EN + PT strings; help screenshots regenerated.

---
version: alpha
name: AVX
description: AVX is the AV production copilot — gigs, crew, quotes and inventory for AV companies and the freelancers who work for them — endorsed as "A Lumen and Pixel product". A dense, dark-first web app and PWA (React 18 + Vite, Supabase, EN/PT) used at FOH, backstage, in the warehouse and on the road. It inherits the Lumen and Pixel brand (navy field, one electric green, Space Mono names things, Inter explains them, square corners everywhere, the 5×5 pixel grid) and adds three themes (Show, Daylight, Contrast), functional status and label colours that are never brand colours, and components mapped to the app's real screens. Token names match src/theme/tokens.js.

colors:
  # Show theme (default, data-theme="dark")
  bg: "#021829"
  panel: "#03213A"
  chrome: "#00080E"
  shade: "#00080E"
  fg: "#F0F1F3"
  text: "#F0F1F3"
  text2: "#DFE9F0"
  muted: "#B8BEC8"
  soft: "#B8BEC8"
  accent: "#33FB31"
  accent2: "#7EF67D"
  accent-text: "#33FB31"
  on-accent: "#021829"
  line: "#143047"
  line-strong: "#5d7080"
  fill: "#0a2740"
  hover: "#112d45"
  focus: "#33FB31"
  selection: "#093b39"
  overlay: "rgba(0,0,0,0.72)"
  danger: "#FA8A80"
  danger-soft: "#2b3245"
  warn: "#F5B94A"
  warn-soft: "#25363c"
  info: "#94C0E2"
  sky: "#7FD0F0"
  purple: "#B9A3FB"
  pink: "#F78BC6"
  yellow: "#F2D14E"
  orange: "#F6A26A"
  paper: "#ffffff"
  ink: "#021829"
  # Daylight theme (data-theme="light")
  daylight-bg: "#F0F1F3"
  daylight-panel: "#FFFFFF"
  daylight-chrome: "#DFE9F0"
  daylight-shade: "#FFFFFF"
  daylight-fg: "#021829"
  daylight-text: "#021829"
  daylight-text2: "#2E3441"
  daylight-muted: "#4A5462"
  daylight-soft: "#4A5462"
  daylight-accent: "#021829"
  daylight-accent2: "#16598C"
  daylight-accent-text: "#3F511A"
  daylight-on-accent: "#F0F1F3"
  daylight-line: "#e3e5e7"
  daylight-line-strong: "#65737d"
  daylight-fill: "#f3f4f5"
  daylight-hover: "#e7e9ea"
  daylight-focus: "#16598C"
  daylight-selection: "#e1e3e5"
  daylight-danger: "#931A11"
  daylight-danger-soft: "#eedad9"
  daylight-warn: "#733606"
  daylight-warn-soft: "#ebe3dc"
  daylight-info: "#134D7A"
  daylight-sky: "#02486A"
  daylight-purple: "#4E1EA6"
  daylight-pink: "#870F44"
  daylight-yellow: "#633F06"
  daylight-orange: "#7A3105"
  # Contrast theme (data-theme="contrast")
  contrast-bg: "#00080E"
  contrast-panel: "#021829"
  contrast-chrome: "#000000"
  contrast-shade: "#000000"
  contrast-fg: "#FFFFFF"
  contrast-text: "#FFFFFF"
  contrast-text2: "#FFFFFF"
  contrast-muted: "#E6EAEF"
  contrast-soft: "#E6EAEF"
  contrast-accent: "#33FB31"
  contrast-on-accent: "#00080E"
  contrast-line: "#2e404e"
  contrast-line-strong: "#f2f3f4"
  contrast-fill: "#152939"
  contrast-hover: "#283b49"
  contrast-selection: "#08332a"
  contrast-danger: "#FFA3A3"
  contrast-danger-soft: "#2a2e3d"
  contrast-warn: "#FFCB66"
  contrast-warn-soft: "#253132"
  contrast-info: "#A6CFFF"
  contrast-sky: "#8FDCFD"
  contrast-purple: "#D2C4FF"
  contrast-pink: "#FFB3DA"
  contrast-yellow: "#FFE066"
  contrast-orange: "#FFC49A"

typography:
  title-lg:
    fontFamily: "'Space Mono', 'Courier New', monospace"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 34px
  title:
    fontFamily: "'Space Mono', 'Courier New', monospace"
    fontSize: 22px
    fontWeight: 700
    lineHeight: 28px
  heading:
    fontFamily: "'Space Mono', 'Courier New', monospace"
    fontSize: 16px
    fontWeight: 700
    lineHeight: 22px
  body:
    fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  body-sm:
    fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  button:
    fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 16px
  label:
    fontFamily: "'Space Mono', 'Courier New', monospace"
    fontSize: 11px
    fontWeight: 700
    lineHeight: 14px
    letterSpacing: 0.16em
  data:
    fontFamily: "'Space Mono', 'Courier New', monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  data-lg:
    fontFamily: "'Space Mono', 'Courier New', monospace"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 28px
  timecode:
    fontFamily: "'Space Mono', 'Courier New', monospace"
    fontSize: 20px
    fontWeight: 400
    lineHeight: 24px

rounded:
  none: 0px

spacing:
  # The only gaps, paddings and margins a screen uses (see "Room to breathe")
  space-1: 4px    # inside a control: icon to its word
  space-2: 8px    # between lines of one item (name, meta)
  space-3: 12px   # between items in a group: rows, fields, buttons in a row
  space-4: 16px   # card padding on phone; heading to its content
  space-5: 24px   # between groups inside a section; card padding on desktop; page gutter on desktop
  space-6: 32px   # above a page's first section, below the page header
  space-7: 48px   # between sections on desktop
  section-phone: 40px
  section-desktop: 48px

sizes:
  control-sm: 28px
  control-md: 36px
  control-lg: 44px
  row: 44px
  row-compact: 32px
  topbar: 56px
  tabbar: 64px
  menu: 720px

components:
  app-topbar:
    backgroundColor: "{colors.chrome}"
    borderBottom: "1px solid {colors.line}"
    height: 56px
    activeSection: "2px {colors.accent} bar under the trigger"
  workspace-switcher:
    borderColor: "{colors.line-strong}"
    currentRow: "{colors.selection}"
    roleChip: "{typography.label} on transparent, 1px {colors.line}"
  mega-menu:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.line-strong}"
    maxWidth: 720px
    cards: "max 4, 1px {colors.line} gaps"
  phone-tabbar:
    backgroundColor: "{colors.chrome}"
    height: 64px
    activeTab: "{colors.text} + 2px {colors.accent} top bar"
  button-primary:
    backgroundColor: "{colors.accent}"
    hoverBackground: "{colors.accent2}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button}"
    height: 36px
    rounded: "{rounded.none}"
  button-secondary:
    backgroundColor: "transparent"
    borderColor: "{colors.line-strong}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
  button-danger:
    borderColor: "{colors.danger}"
    hoverBackground: "{colors.danger-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
  text-field:
    backgroundColor: "{colors.shade}"
    borderColor: "{colors.line-strong}"
    focusRing: "2px {colors.focus}"
    errorBorder: "2px solid {colors.danger}"
    labelTypography: "{typography.label}"
    rounded: "{rounded.none}"
  status-badge:
    borderColor: "{colors.line}"
    typography: "{typography.label}"
    height: 24px
    indicator: "8px square: accent-text ok · info · warn · danger · empty open · dashed draft"
  label-chip:
    backgroundColor: "{colors.fill}"
    borderColor: "{colors.line}"
    indicator: "8px square in the label colour (grey→muted, blue→info, green→accent-text, red→danger, yellow, orange, purple, pink, sky)"
  call-chip:
    borderColor: "{colors.line-strong}"
    valueTypography: "{typography.data}"
    ownCall: "key cell {colors.accent} with {colors.on-accent}"
  card:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.line}"
    hoverBorderColor: "{colors.line-strong}"
    rounded: "{rounded.none}"
  banner-danger:
    backgroundColor: "{colors.danger-soft}"
    borderColor: "{colors.danger}"
  banner-warn:
    backgroundColor: "{colors.warn-soft}"
    borderColor: "{colors.warn}"
  dialog:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.line-strong}"
    scrim: "{colors.overlay}"
    rounded: "{rounded.none}"
  loader:
    shape: "the AVX glyph, 11 cells, built one cell every 50 ms in reading order; whole at 600 ms; clears at 1400 ms; 1.6 s loop"
    color: "currentColor (accent-text on the app-start screen)"
    size: "multiple of 5 px (10, 15, 20, 25, 40)"
    reducedMotion: "the still mark, no loop"
  home-module:
    spacing: "{spacing.section-phone} / {spacing.section-desktop} between modules"
    header: "{typography.heading} + optional link on the right"
  swipe-row:
    phone: "horizontal scroll-snap row, tiles 44% of the row so the next one shows cut off, 12px gap"
    desktop: "grid, 3 columns"
  paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    note: "call sheet, quote document, packing list, QR labels; same in every theme"
---
# AVX — DESIGN.md

> For Claude Code sessions working in `RenaissanceApe/AVX-beta`. Read with the master L&P `DESIGN.md` (brand rules) — this file is the product layer. The live reference with previews is the **AVX design system** artifact; values here and there are the same.

## Overview

AVX is a Lumen and Pixel product: the **AV production copilot**. Companies run gigs, quotes and inventory in an **organisation** workspace; freelancers see every gig they're on, at any company, in **My work**. Roles decide what anyone sees — org admin / member / viewer, gig PM / crew / viewer (`src/lib/nav.js`). The structure is built and stays; the visual language is being replaced.

The look in one breath: navy dark by default, one electric green for the one action that matters, Space Mono for names and numbers, Inter for sentences, square corners, 1px lines instead of shadows, and no glow, blur or gradient anywhere in the UI. **Calm comes from space, not from softer shapes:** few boxes, generous gaps between sections, one loud thing per screen (decided 2026-11-06, "Room to breathe" below).

## Where things live in code

| What | File |
| --- | --- |
| Theme values (`THEMES`, `themeCss()`, `contrast()`) | `src/theme/tokens.js` + `tokens.test.js` |
| Shared styles (`btn`, `btnPrimary`, `btnDanger`, `iconBtn`, `input`, `label`, `card`, `Modal`, `AvxMark`, `AvxLoader`) | `src/components/ui.jsx` |
| Fonts | `src/main.jsx` (@fontsource Inter, Space Mono, Atkinson Hyperlegible) |
| Global CSS: `--font-ui`, radius reset, keyframes (incl. the loader's Pixel Build) | `index.html` |
| Navigation model | `src/lib/nav.js` |
| Shell, top bar, mega-menus, phone tabs | `src/components/shell/AppShell.jsx` |
| Strings | `src/i18n/en.js`, `src/i18n/pt.js` |
| Help screenshots | `public/help/shots/en`, `public/help/shots/pt` |

The repo's tests forbid raw colours in screens and check contrast per theme: always use `var(--token)` or `colors.*` from ui.jsx.

## Colors

Three themes, same token names (kebab-case CSS variables from `themeCss()`):

| Token | Show (`dark`) | Daylight (`light`) | Contrast | Role |
| --- | --- | --- | --- | --- |
| `bg` | #021829 | #F0F1F3 | #00080E | page |
| `panel` | #03213A | #FFFFFF | #021829 | cards, sheets, menus |
| `chrome` | #00080E | #DFE9F0 | #000000 | top bar, tab bar, theme-color |
| `text` / `text2` | #F0F1F3 / #DFE9F0 | #021829 / #2E3441 | #FFFFFF | content / secondary |
| `muted` = `soft` | #B8BEC8 | #4A5462 | #E6EAEF | labels, metadata |
| `accent` / `accent2` | #33FB31 / #7EF67D | **#021829** / #16598C | #33FB31 / #7EF67D | one primary action / hover |
| `accent-text` | #33FB31 | **#3F511A** | #33FB31 | accent as text, live squares, glyph |
| `on-accent` | #021829 | #F0F1F3 | #00080E | on accent fills |
| `danger` · `warn` · `info` | #FA8A80 · #F5B94A · #94C0E2 | #931A11 · #733606 · #134D7A | #FFA3A3 · #FFCB66 · #A6CFFF | function only |
| `lineK` | 1 | 1.6 | 2.5 | hairline multiplier |

Derived (computed with `color-mix` from `--fg`): `line` 7% × lineK, **`line-strong` 38% × lineK** (control edges, ≥3:1), `fill` 3%, `hover` 6%, `danger-soft` / `warn-soft` (16% / 14% over panel), `selection` (accent 12%).

**Labels.** The 9 gig-label DB keys stay as data and render as a square + word: grey→`muted`, blue→`info`, green→`accent-text`, red→`danger`, yellow, orange, purple, pink, sky → same-name tokens. All are 4.5:1 on every ground.

**Rules.** `accent` appears once per view. Status and label colours are never card fills, washes, gradients or brand colour. Paper (call sheet, quote doc, packing list, labels) is white with navy ink in every theme.

## Typography

Space Mono 400/700 for titles, uppercase labels (11px, 700, 0.16em), table heads and **all data** — times, dates, money (`1 020,00 €`), quantities, serials, codes, timecode. Inter 400–700 for sentences, buttons, inputs, nav (`--font-ui`). Readable font swaps both for Atkinson Hyperlegible. Nunito is gone.

**Seven sizes, no others** (2026-11-06; the code used 15):

| Size | Font | Use |
| --- | --- | --- |
| 28 / 22 px | Space Mono 700 | page title, desktop / phone (one per page) |
| 24 px | Space Mono 700 | a big number: key numbers, totals, a call time |
| 20 px | Space Mono 400 | timecode and clocks in field tools only |
| 16 px | Space Mono 700 | section heading |
| 14 px | Inter | body: sentences, names in lists, buttons, inputs (16 px inputs on phone) |
| 13 px | Inter / Space Mono | metadata under a name, hints, table cells |
| 11 px | Space Mono 700 caps | labels: field labels, table heads, status words |

12 px goes to 13; 10, 15, 17, 18, 21 and 26 go to the nearest size above. Uppercase Space Mono labels are one level only: a section uses a 16 px heading *or* an 11 px eyebrow, never both, and a card has no eyebrow above its own title.

## Layout

4px grid, and only the steps in `spacing` (4 · 8 · 12 · 16 · 24 · 32 · 40/48): no 2, 3, 5, 6, 7, 10, 14, 18 or 22. Top bar 56px, phone top bar 52px, tab bar 64px + safe area. Controls 36px desktop, 44px on phone and anything used standing (scan, availability answers, Comfort mode). Rows 52px with a name + meta line, 44px single line; quote lines and dense tables 32px (the only compact places). Page gutter 24px desktop / 16px phone; content column 960px max; the page header sits 32px above the first section.

## Room to breathe

Decided 2026-11-06 after the owner found every screen busy. The cause is not the palette or the square corners (both are the brand and stay); it is **too many boxes, gaps that are all small and all different, more than one loud thing per screen, explanations printed on the page, and every action shown at once**. Measured in the code: 15 text sizes, gaps of 2–14 px in 11 different values, section spacing of 20–24 px (barely more than the 8–12 px inside a section), several green fills per screen. The plan that applies this screen by screen is in [docs/DESIGN_REFRESH.md](docs/DESIGN_REFRESH.md). Every new or touched screen follows these rules:

1. **Space shows the structure.** Three distances only: *within* an item 4–8, *between* items 12–16, *between sections* 40 phone / 48 desktop. The gap between sections is at least three times the gap inside one, so grouping reads without a border. Use the `Section` and `Stack` helpers in `ui.jsx` (from DR1) instead of inline margins.
2. **One box deep.** A page section is a heading and its content on the page ground, not a card. Use a card (`panel` + 1px `line`) only for a thing you can open or act on as a whole: a gig, a tile, a dialog. A card never holds a bordered card; inside it, separate with space or one hairline. Lists are rows with hairlines between them, not a card per row.
3. **One loud thing.** One accent fill per screen: the primary action. Selected tabs, filters and segmented buttons use `text` + a 2px `accent` bar, never an accent fill. "Done" and "available" are an `accent-text` square + word, not a fill. The `selection` wash marks one thing only (the current row, "now", your own call).
4. **Say it once, in the right place.** A page header is the title, at most one short line (one line on a 320px phone), the ⓘ (`PageHelp`) and actions. Longer explanations, role descriptions and "what this section is" go behind ⓘ (`Hint`) or into the empty state, not above the content. A section has no description line unless it changes what you do.
5. **Few actions in view.** A page header shows one primary and at most two secondary buttons; the rest go in a ⋯ menu (`More actions`). A card or row shows at most two buttons; the rest in its ⋯. On phone the secondary buttons in a header become the ⋯ menu.
6. **Most important first, then less.** Each screen states what the person came for and puts it first; numbers and history after, unless the person reorders (Home). Repeated context is dropped: no title that repeats the top bar on phone.
7. **Bigger, fewer sizes.** The seven type sizes above. Body is 14px; nothing under 11px.
8. **Density is chosen, not accidental.** Comfortable (default): rows 44–52px, the spacing above. Compact (32px rows, 8px gaps) only in data grids: quote lines, tables, patch and input lists. Comfort mode (44px targets) still applies on top.

**Checking a screen:** squint at it at 390px. You should see the title, two to four section blocks with clear gaps, and one green thing. If you see a grid of outlines or more than one green block, it isn't done.

## Home

The home is built from **modules** in a column, 40/48px apart, each with a 16px heading and an optional link on the right:

| Module | Who | Notes |
| --- | --- | --- |
| First steps | organisation admins, My work | until all done or closed; a single row "First steps · 3 of 4 · next: Invite your team →" that opens the list; no accent border or fill; finished steps hidden |
| Availability requests | My work | questions waiting for your answer |
| Key numbers | admins and members (not Simple mode) | the six tiles; **phone: a sideways swipe row** (scroll-snap, the next tile shows cut off, focusable region with a label, arrow keys scroll); desktop: 3-column grid |
| Events | everyone | list / calendar, filters and search |

**Standard order:** First steps → Availability requests → Key numbers → Events. Anyone can change it: **Arrange home** (a link at the end of the home) opens a sheet with each module, ↑ / ↓ buttons, a show/hide switch and "Back to the standard". First steps is not in the sheet: it stays on top until finished or closed. Saved per person and per workspace on this device (like Appearance), so a manager who wants events first moves Events up once. New modules join at their standard place.

**Header:** desktop: greeting line (13px), organisation name as the title with the role chip and ⓘ, New event on the right. **Phone: no organisation name** (the top bar already shows it): the greeting as the title line with the role chip and ⓘ, then New event. The role description moves into the role chip's ⓘ.

## Elevation & Depth

None. Grounds step `bg → panel → fill/hover`, a 1px `line` separates, a flat 72% black scrim sits behind dialogs and sheets. **No `box-shadow`** except the focus ring and 2px indicator bars; **no `backdrop-filter`**; no glows; no GRAIN gradients on cards.

## Shapes

Radius 0 everywhere, enforced by `*, *::before, *::after { border-radius: 0 !important }`. Inline radii are dead code — remove them when you touch a file. Avatars, checkboxes, status squares, scan brackets, QR codes: all square.

## Components

Mapped to the screens in the app; full specs and previews in the design system artifact.

- **AppShell** — top bar on `chrome`: AvxMark + "AVX" in Space Mono, WorkspaceSwitcher, section triggers, search, messages, notifications, avatar. No tile behind the logo.
- **WorkspaceSwitcher** — My work first, then orgs with monogram square, role chip, one line of status.
- **MegaMenu** — `splitItems(items, 4)`: up to 4 cards (icon, mono name, `nav.<key>Desc`) + minor list.
- **PhoneTabBar + More sheet** — `phoneTabs()` + More; active tab has a 2px accent top bar.
- **GigCard / GigHeader / gig tabs** — date block, status + label chip + venue, the viewer's call time or crew avatars; header without the tint gradient.
- **CallChip** — key + time; your own call has the accent key cell.
- **Schedule** — day bars, mono times, now = `selection` + ▶, done = muted.
- **CallSheet / quote document / packing list** — paper rules.
- **CrewRow + clash** — `danger-soft` row, "Clash" status and a sentence saying where and what to do; holds use `warn`.
- **AvailabilityAsk** — question card with a day strip and two 44px answers.
- **Calendar** — `fill` day cells, event = panel block with a label square; holds dashed; unavailable hatched.
- **QuoteEditor / QuoteVersions** — square phase tabs (optional = dashed), 32px line grid, mono right-aligned numbers, autosave square, totals block.
- **InventoryItem / StepBar / ScanPanel / QRLabel** — 14-day availability strip, unit statuses, square counters "7 / 12", camera brackets and log with ✓ ⚠ ✕ + words.
- **Chat** — no bubbles, square avatars, announcements with a `warn` edge and acknowledgements.
- **Banner / Offline bar / Toast / Dialog / EmptyState + First steps / StatTile / DataTable / TimecodeClock / ToolCard / JobCard / AppearancePicker / FieldHint / StatusBadge / LabelChip**.
- **AvxLoader** — the one loading sign (see Motion).
- **PageHeader / Section / Stack / SwipeRow / MoreMenu** (from DR1) — the layout pieces that carry "Room to breathe": the header rule, section spacing and headings, the item gaps, the phone swipe row, and the ⋯ menu for actions past the visible ones.

## Iconography

Target: the L&P **Signal Pixel** set (24 grid, 2px, square caps, mitre joins, one signal pixel). Now: lucide-react with `strokeLinecap="square"` and `strokeLinejoin="miter"` set once in the icon wrapper; swap icons from `ICONS.md` group P3 as they're drawn. Keep the `power`/Zap icon only where it means electrical power (EquipmentTab).

## Motion

100ms press (1px down) · 150ms hover/colour · 250ms tabs, dialogs, menus with `cubic-bezier(0.16,1,0.3,1)` and a 10px rise. `prefers-reduced-motion` and Comfort mode turn movement off.

**Loading is one thing everywhere: `<AvxLoader>`** (`ui.jsx`, CSS in `index.html`), the Brand Book's *Pixel Build* on the AVX glyph: the 11 cells appear one every 50 ms in reading order, the mark is whole at 600 ms, holds, clears at 1400 ms and builds again (1.6 s loop). Same sign while the app opens (40px, `accent-text`), while a page or section loads, and inside a busy button (15px, the button's text colour). Sizes are multiples of 5px so each cell is whole pixels. Give it `label` when it is the only thing on screen (it becomes `role="status"`); next to a word that already says what is happening, leave the label off. Reduced motion and Comfort mode show the still mark. **Never** a spinner, a rotating icon or a progress ring; the only other loading-style motion is the 8px blinking square of an autosave status.

## Voice

Operational, terse, second person; every string in EN and PT. Buttons are verb + object ("Send quote", "Remove from gig"). Warnings say what, where and what to do. No "Oops", "Successfully", exclamation marks or emoji.

## Do's and Don'ts

- Do keep one accent-filled thing per view (primary button, or your own call). Selected tabs and filters are a 2px bar, not a fill.
- Do separate sections with 40/48px of space and a heading, not a card around each one.
- Do put explanations behind ⓘ; a page header has at most one short line under the title.
- Do pair every status colour with a word and every warning with an icon + sentence.
- Do use Space Mono for anything you could copy into a spreadsheet.
- Do check all three themes and both languages before you finish.
- Don't add `box-shadow`, `backdrop-filter`, `text-shadow`, glows or gradients.
- Don't round anything, including avatars and the logo.
- Don't put a bordered card inside a card, or one card per list row.
- Don't use spacing or text sizes off the scales (no 6, 10 or 14px gaps; no 12, 15 or 18px text).
- Don't add a spinner or rotating icon: loading is `<AvxLoader>`.
- Don't fill cards, rows or calendar blocks with label or status colours.
- Don't use lime as text on white: that's `accent-text` olive in Daylight.
- Don't hard-code hex values in screens (tests fail) — add a token if one is missing, with a test.

## Responsive Behavior

Below 768px: top-bar menus become PhoneTabBar + More sheet, the workspace switcher opens as a sheet from the title, tables become row lists with two key values, forms go full-height sheets, controls 44px. Gig tabs scroll horizontally. Call sheet and quote previews stay paper-proportioned and zoom.

## Brand Assets

- **AVX glyph B (locked v1.2)** — D1 · B2 C2 · A3–E3 · C4 D4 · B5. Path `M3 0h1v1H3z M1 1h2v1H1z M0 2h5v1H0z M2 3h2v1H2z M1 4h1v1H1z` in a `0 0 5 5` viewBox, `shape-rendering="crispEdges"`. In code: `<AvxMark size={22} />` (currentColor → `accent-text`; `text` on Daylight top bar).
- Favicon and PWA icons: green-500 glyph on `#00080E`, `theme-color` `#00080E`.
- "A Lumen and Pixel product": sign-in, Help → About, exported documents only.

## Iteration Guide

1. Change a value in `src/theme/tokens.js` → run `npm run check` (contrast tests) → update the design system artifact's `tokens.json` with the same value.
2. New component → build it from `ui.jsx` styles and tokens; if it's reusable, add it to the design system with a preview in all three themes.
3. Every UI change → EN + PT strings, CHANGELOG entry, regenerate affected help screenshots.

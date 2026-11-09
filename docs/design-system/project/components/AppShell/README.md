# AppShell

Desktop frame (`src/components/shell/AppShell.jsx`):

- **Top bar** 56px on `chrome`: AVX glyph + wordmark (Space Mono, `accent-text` glyph; `text` on Daylight), the **WorkspaceSwitcher**, the section triggers that open **MegaMenu** panels, then search, messages, notifications, avatar. The active section gets a 2px `accent` bar under its trigger.
- **Page** on `bg`, 24px gutter (16px on a phone), 960px content column: a `PageHeader` (title, at most one short line, the ⓘ, one primary and up to two secondary actions, the rest in ⋯), 32px above the first section. The organisation's name is not repeated above the title.
- Sections come from `navSections({workspace, role})` in `src/lib/nav.js`: My work shows *Work* and *Organisations*; an organisation shows *Gigs*, *Quotes*, *Inventory* (admin/member) and *Organisation*. Never show a place the role can't use.
- Phones use **PhoneTabBar** instead of the top-bar menus.

Remove from the current shell: the tile behind the logo, the GRAIN card gradients, glows, `box-shadow` and `backdrop-filter`. Separation is a 1px `line`, nothing else. The L&P endorsement ("A Lumen and Pixel product") appears only on sign-in, Help → About and exported documents.

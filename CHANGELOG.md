# Changelog

## 0.13.0 — Inventory I1: catalogue and stock

### Added
- Inventory menu for admins and members: Catalogue, Locations, Stock movements and QR labels
- The price list becomes the catalogue: rental and sale items can be counted in bulk or tracked by
  serial number, with a code, brand, model, weight, power, size, replacement value, minimum stock
  and packing note; low stock is flagged
- Locations (warehouses, vehicles, sites), archived instead of deleted
- Bulk stock through a ledger that can't be edited: add, move, remove (sold, lost, retired) and
  count (records the correction). You can't take out more than a location holds
- Serial-numbered units with QR code, status (available, in repair, lost, retired), purchase details
  and book value; every move and status change is logged automatically
- Paste import from a spreadsheet (creates items and adds stock)
- Printable A4 QR label sheets; scanning a label with any phone camera opens the item or unit
  (`/scan/<code>`)
- docs: decisions for the "your network" picker (after inventory) and the crew network / job board
  (after messaging) recorded in the roadmap

### Changed
- Archived catalogue items no longer appear in the price list or the quote picker
- Disabled buttons look disabled everywhere

## 0.12.0 — Phase 5a: people, bookings and clashes

### Added
- A reservations engine: one table records who (later: what equipment, vehicle or room) is taken
  for which time range, kept in step by the database (docs/RESERVATIONS.md)
- Booking times per crew member ("Set times" in the Crew tab); without them a person is booked for
  the gig's whole days, so short jobs on the same day no longer clash
- Double-booking warnings: ⚠ next to anyone booked elsewhere at the same time, with advice to talk
  to them first; the same warning while inviting by email; a warning in the new/edit gig form when
  the dates overlap your own bookings. Nothing is blocked. Other companies' gigs still show only as
  "another gig"
- Ask availability: managers send a question, the person answers Available / Not available with a
  note from My work, and both sides are notified (in the app and the email summary)
- My work marks gigs that overlap another booking or your unavailable dates ("Double booking" on the
  card, amber outline in the calendar)
- Unread updates per workspace in the switcher; mute an organisation from the Organisations page
  (no badge and no email summary for it; questions addressed to you still arrive)
- Organisation admins can add someone from a gig's crew to the organisation in one click
- Plans: docs/INVENTORY.md (inventory phases I1–I7) and docs/MESSAGING.md (messaging M1–M6)

### Changed
- Viewers can no longer create gigs (enforced by the database)
- Notifications about a gig always carry its organisation
- My work shows a gig once even if you hold two roles on it, with both functions

## 0.11.0 — Phase 4d: navigation and workspaces

### Added
- App shell on every signed-in screen: the logo always goes home; notifications and account in the
  top bar; section menus (Gigs, Quotes, Organisation) open dark frosted card panels on desktop, with
  a side list for smaller items; on phones a bottom tab bar plus a "More" sheet
- Workspace switcher next to the logo: **My work** (every gig you're on, at any company, with the
  company and your role on each) or one of your organisations, with your role there. Menus follow
  the role; AVX reopens the workspace you used last
- Organisations page (`/orgs`): your organisations with your role in each, the companies you work
  for as crew, and creating a new one
- Addresses for everything the menus link to (`/me`, `/org/:id`, quotes tabs, members, settings,
  new gig, account), so links, the back button and bookmarks work
- The gig page shows which company it belongs to and your role there

### Changed
- `/dashboard` now opens your current workspace; gigs shared with you moved into My work
- The gig page's back button returns to where you came from
- Viewers are no longer offered "New gig" in the menus

## 0.10.0 — Phase 3 leftovers and the quote PDF

### Added
- Quote PDF: emails to clients carry a PDF of the quote (same version as the link) as an attachment;
  "Download PDF" on the print preview and on the client's page. Made in the browser, never stored.
- Two-step sign-in (Account → Two-step sign-in): codes from an authenticator app. Once on, the database
  itself refuses a session that hasn't given the code (tables, files and the app's functions), so the
  password alone isn't enough even outside the app.
- Anonymous usage counts for the pilot: how often each screen and a few actions are used per day, with
  no user id, IP, device or cookie; skipped when the browser sends Do Not Track / Global Privacy Control
  (docs/USAGE.md)
- Signed-in browser tests for uploading a file and a new version, and for inviting someone by email
  before they have an account

### Changed
- Privacy notice names Brevo as the email provider and describes usage counts and quote recipients
- The client's quote page offers "PDF" and "Print" separately

## 0.9.0 — Phase 4c: quote versions, sending to clients, quote → gig

### Added
- Quote versions: save the quote as a numbered version with a note, view or print any version, and
  restore one (the current state is saved as a version first, so nothing is lost)
- Send to client: creates a private link to an online copy of the quote (valid 30 days) and emails it
  through Brevo when an address is given; otherwise copy the link yourself. Sending again replaces the
  previous link; links can be turned off. Each send is saved as a version.
- Public quote page (`/q/…`, no account needed) in the quote's language, printable, with Accept /
  Decline (name and optional message). The answer sets the quote's status and notifies the sender, the
  quote's author and the organisation's admins (in the app and in the daily email).
- Fill a gig from its quote: schedule items from the phase dates (one per day) and crew positions from
  the crew lines, shown first so you can untick or adjust them
- "Positions to fill" in the gig's Crew tab: roles with how many people are needed, how many are
  filled (crew and invites with that function), and a quick invite for the role

### Changed
- The printed quote fits phone screens (smaller type, wrapping, scrolls sideways when needed)

## 0.8.0 — Phase 4b: branded quotes, price list, safe deletion

### Added
- Delete a gig (Edit gig → Danger zone) or an organisation (dashboard → ⚙ settings → Danger zone),
  admins/creators only, behind a two-step confirmation: a list of everything that will be destroyed
  with counts and an "I understand" tick, then typing the name, with the button locked for 5 seconds.
  Crew and members get a notification (and the daily email) when it happens.
- Organisation settings (rename) for admins; deletion moved out of the Members window
- Quote branding: header image repeated on every printed page, accent colour, number prefix and
  "next number" to continue an existing numbering
- Quote fields for project manager and payment method; optional start/end times per phase, printed
  as an agenda
- Printed quote redesigned (Inter + Space Mono): client, title, project details, agenda, sections with
  section totals, totals by type, final discount, VAT, numbered conditions, contact footer
- Price list per organisation: add/edit items, paste-import from a spreadsheet, and "From price list"
  in every quote section

## 0.7.0 — Phase 4: quotes

### Added
- Quotes for organisation admins and members: phases as tabs (own dates, discount, optional),
  sections and priced lines (rental, sale, crew, transport, other, comment), live totals by phase,
  by type, with discount and VAT
- Templates: save a whole quote or one phase, start a quote from a template or add one as a block
- Printable quote / PDF in Portuguese or English with company details and terms; optional
  "no prices per line" layout
- Company details and quote defaults per organisation (admins)
- Create a gig from a quote, or link a quote to an existing gig
- Access-rule test for quotes (`supabase/tests/quotes_rls.sql`), unit tests for the quote maths,
  signed-in browser test for building and printing a quote

## 0.6.0 — Phase 3: out in the field

### Added
- Offline mode: the app opens without signal; dashboard, gig pages and call sheets show the last saved
  copy with a banner; files can be kept offline one by one or all at once. Saved data is cleared on sign-out.
- Magic-link sign-in ("Email me a sign-in link"), with a bilingual email template
- Daily email summary of unread notifications (Brevo), in each person's language, with an Account opt-out
- Signed-in browser tests against a separate Supabase test project (`e2e-auth` CI job, off until enabled)

### Changed
- Projects without email confirmation sign the new user straight in after sign-up
- Keep-alive also pings the test project when configured

## 0.5.0 — Phase 2b: team experience

### Added
- In-app notifications with a live bell (gig/org invites, new files and versions, important posts, schedule,
  call-time, status and date changes)
- Portuguese / English interface, including legal pages; language saved to your profile
- Crew availability (private unavailable dates) with clash warnings for managers
- "Coming up" schedule card on the gig overview
- Playwright browser tests in CI; optional backup of uploaded files

### Changed
- Gig page split into tab components (`src/components/gig/`) using the shared UI module

### Fixed
- Re-inviting someone already on a gig silently did nothing; it now updates their call time and role
- Feed post headers wrap properly on narrow screens

## 0.4.0 — Phase 2a: day-to-day production tools

### Added
- Gig schedule tab and printable call sheet (schedule + crew calls + phones)
- Activity log per gig, written by database triggers
- Live updates for the feed and for changes made by other people
- File version history with PDF/image preview and per-version download
- Dashboard calendar view
- Installable PWA (manifest, icons, iOS home-screen support)
- Optional phone number in Account

### Changed
- Gig tabs scroll horizontally on small screens
- New shared UI module (`src/components/ui.jsx`) for new components

## 0.3.0 — Phase 1: ready for pilot companies

### Added
- Organisation members: invite by email, roles, remove, leave, delete organisation (last admin is protected)
- Invitation emails for gigs and organisations, and a `/welcome` page to set name + password
- Account: export my data, delete my account
- Privacy notice and beta terms, linked from sign-up
- Dashboard filters (upcoming / past / archived / all) and search
- Optional Sentry error monitoring; daily encrypted database backups workflow
- Branded auth email templates and email deliverability guide

### Changed
- DM Sans font is now self-hosted (no requests to Google)
- Clearer message when choosing your current password as the new one

## 0.2.0 — Pilot foundation

### Added
- Password reset ("Forgot password?"), resend confirmation email, change password and name from the Account panel
- Crew by email: existing users are added at once; pending invites are claimed automatically on sign-up
- "Shared with you" gigs on the dashboard for crew outside the organisation
- Delete assets, delete feed posts, remove crew / leave a gig
- Upload hint showing when a file will become a new version
- Error boundary, toast notifications, central logger, friendly error messages
- Security headers (CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy), favicon, robots noindex
- ESLint, Vitest unit tests, GitHub Actions CI, Supabase keep-alive workflow
- `supabase/migrations/` and an access-rule smoke test

### Fixed
- Access rules: recursion errors, users able to join any organisation, crew seeing other gigs' files
- Creating an organisation failed; storage bucket was public
- A new upload replaced any asset of the same type (now only same type + same name)
- Empty dates broke gig create/edit; errors were silent
- Debug output shown when opening files; pinch-zoom disabled on mobile

### Changed
- Minimum password length 8; file uploads limited to 50 MB with a clear message

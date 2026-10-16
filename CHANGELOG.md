# Changelog

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

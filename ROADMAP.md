# Roadmap

Status of the beta and what comes next, in order. Each phase is shipped to `main`
before the next one starts (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Phase 0 — Pilot foundation ✅ (v0.2.0)

- Secure access rules (RLS), private file storage, automated access-rule test
- Sign up / sign in, email confirmation (with resend), **password reset**, change password, edit name
- Organisations, gigs, crew by email (pending invites claimed on sign-up)
- Asset upload with versioning by type + name, delete; feed posts with delete; remove / leave crew
- Error boundary, toasts instead of alerts, central logger, friendly error messages
- Security headers (CSP, frame, referrer), noindex for the beta, accessibility fixes (zoom, labels, focus)
- Lint + unit tests + CI on every PR; Supabase keep-alive so the free project doesn't pause

## Phase 1 — Must-haves before inviting external companies ✅ (v0.3.0)

- Privacy notice and beta terms (`/privacy`, `/terms`), linked from sign-up. **Get them reviewed before a public launch.**
- Export my data (JSON) and delete my account (with the files of organisations only you belong to)
- Organisation members: invite colleagues by email, change roles (admin / member / viewer), remove, leave,
  delete organisation; every organisation keeps at least one admin
- Invitation emails for gigs and organisations (`send-invite` Edge Function → Supabase invite email → `/welcome`)
- Optional error monitoring (Sentry, enabled by `VITE_SENTRY_DSN`; privacy-scrubbed)
- Daily encrypted database backups (GitHub Actions, needs two secrets: see `docs/BACKUPS.md`)
- Dashboard: upcoming / past / archived filters and search
- Self-hosted font (no Google Fonts requests), branded auth email templates and a deliverability guide (`docs/EMAIL.md`)

Still to do by you (settings, not code): custom domain + email DNS (SPF/DKIM/DMARC), turn off click tracking
in the SMTP provider, paste email templates, add backup secrets, set `VITE_CONTACT_EMAIL`.

## Phase 2a — Day-to-day production tools ✅ (v0.4.0)

- **Schedule** tab per gig (load-in, soundcheck, doors, show…), editable by PMs and organisation admins
- **Call sheet** page (`/gig/:id/callsheet`): schedule by day plus crew with call times and phones. Print or save as PDF.
- **Activity** tab: uploads, new versions, crew and schedule changes, status changes (written by database triggers)
- **Live updates**: new feed posts and changes by others appear without refreshing (Supabase Realtime)
- **File version history** with in-app preview for PDFs and images, and download of any version
- **Calendar view** on the dashboard (dots + day list on phones)
- **Installable app** (PWA manifest and icons): "Add to Home Screen" on iOS and Android
- Optional phone number on your profile (Account), shown to people you work with

## Phase 2b — Team experience ✅ (v0.5.0)

- **Notifications** (bell, live): added to a gig or organisation, new file or version, important updates,
  schedule changes (grouped), call-time changes, gig status or dates/venue changes
- **Português / English**: everything translated, including the legal pages; switch on the sign-in page or in Account
  (saved to your profile); dates are formatted in the chosen language
- **Crew availability**: mark dates you can't work (private); managers see clash warnings when inviting and on the
  crew list. Other companies' gigs appear only as "busy".
- **Gig page refactor**: `GigPage.jsx` went from about 1,250 lines to about 150; each tab is a component in `src/components/gig/`
- **Browser tests** (Playwright) in CI for public pages, routing, language switch and installability
- **Backups of uploaded files** (optional `SUPABASE_SERVICE_ROLE_KEY` secret)
- Fix: re-inviting someone already on a gig now updates their call time and role

## Phase 3 — Next

| Item | Notes |
|---|---|
| ✅ Email notifications | Daily summary of unread notifications through Brevo, in each person's language; opt-out in Account (0.6.0; switch on per docs/EMAIL.md) |
| ✅ Signed-in browser tests | "AVX test" Supabase project + `e2e-auth` CI job: sign-up, org, gig, schedule, offline, notifications, account deletion (0.6.0; switch on per docs/TESTING.md) |
| ✅ Offline mode | App shell cached by a service worker; dashboard, gig and call sheet show their last saved copy; files can be kept offline (0.6.0) |
| ✅ Magic-link sign-in | Passwordless option alongside email + password (0.6.0) |
| ✅ Two-step sign-in | Optional authenticator-app codes (Account), enforced by the database, not just the screens (0.10.0) |
| Leaked-password protection | Supabase checks new passwords against known breaches; needs Supabase Pro |
| ✅ Usage analytics for the pilot | Anonymous daily counts per screen and action; no ids, cookies or IPs (0.10.0; docs/USAGE.md) |
| ✅ Signed-in tests for uploads and invites by email | File upload + new version; invite by email before sign-up (0.10.0) |

**Later, not now:** Rentman integration (import gigs and crew).

## Phase 4 — Quotes

| Item | Notes |
|---|---|
| ✅ Quote builder | Phases as tabs (own dates, discount, optional), sections, priced lines; autosave with conflict protection (0.7.0) |
| ✅ Templates | Whole quotes or single phases as reusable blocks (0.7.0) |
| ✅ Client-ready print/PDF | Company details, PT or EN per quote, optional "no prices per line" layout (0.7.0) |
| ✅ Quote versions | Numbered versions with a note; view, print or restore any of them (0.9.0) |
| ✅ Price list | Reusable items with a default price, paste-import from a spreadsheet, pick into any section (0.8.0) |
| ✅ Branded quotes | Header image on every page, accent colour, own numbering, agenda, totals by type, numbered conditions (0.8.0) |
| ✅ Safe deletion | Gigs and organisations, behind a two-step confirmation; people affected are notified (0.8.0) |
| ✅ Accepted quote → gig crew/schedule | Schedule items from phase dates, crew "positions to fill" from crew lines (0.9.0) |
| ✅ Send to client | Link to an online quote with Accept / Decline, emailed via Brevo; the team is notified of the answer (0.9.0) |
| ✅ PDF attachment | The quote email carries a PDF of the same version, made in the browser; also "Download PDF" (0.10.0) |

## Phase 4d — Navigation and workspaces ✅ (v0.11.0)

| Item | Notes |
|---|---|
| ✅ App shell | One top bar on every signed-in screen; logo → home of the current workspace; bell and account inside it |
| ✅ Workspaces | Switcher next to the logo: My work (every gig you're on, any company, with your role) or an organisation (with your role there); remembers the last one |
| ✅ Organisations page | Your organisations with your role in each, companies you work for as crew, create one |
| ✅ Proper addresses | `/me`, `/org/:id`, `/orgs`, quotes tabs, members/settings/new gig as links (docs/NAVIGATION.md) |
| ✅ Section menus | Desktop: dark frosted card panels on hover/click, hybrid cards + list as sections grow. Phone: bottom tabs + "More" sheet |
| ✅ Role-aware | One central menu list (`src/lib/nav.js`); viewers never see quote links |

## Phase 5a — People: bookings and clashes ✅ (v0.12.0)

| Item | Notes |
|---|---|
| ✅ Reservations engine | One table for "this is taken for this time range", kept in step by the database; built for people now and equipment, vehicles and rooms later (docs/RESERVATIONS.md) |
| ✅ Booking times | Managers set a shift per person; without one they're booked for the gig's days |
| ✅ Double-booking warnings | ⚠ next to crew booked elsewhere, with advice to talk first; warning while inviting by email and in the gig form for your own dates; never blocks |
| ✅ Ask availability | Question to the person, answered Available / Not available with a note from My work; both sides notified |
| ✅ My work | "Double booking" on cards and in the calendar; one row per gig even with two roles |
| ✅ Unread and mute | Unread count per workspace in the switcher; mute an organisation (no badge, no email summary; direct questions still arrive) |
| ✅ Crew → member | Organisation admins add someone from the Crew tab to the organisation in one click |
| ✅ Viewers | Can no longer create gigs (database rule) |

## Phase 5b — Inventory and equipment (in progress)

Full plan in [docs/INVENTORY.md](docs/INVENTORY.md). Each phase ships on its own:

| Phase | Scope |
|---|---|
| ✅ I1 · Catalogue and stock (0.13.0) | Price list becomes the catalogue; bulk and serial-numbered stock, locations, an append-only ledger, counts, import, QR labels and scanning |
| ✅ I2 · Availability (0.14.0) | Equipment tab on gigs, availability with prep/return days, quote availability check, quote → gig equipment, item timeline |
| ✅ I3 · Warehouse (0.15.0) | Packing lists, scan out/in with the camera, units out on gigs, damaged → repair, mark missing units lost |
| ✅ I4 · Kits (0.16.0) | Sets, cases with packed units (scanning a case scans its contents), accessories, alternatives offered when short |
| ✅ I5 · Maintenance (0.17.0) | Damage reports from site with photos, repairs (repairer, cost, charge to client), inspections with daily reminders |
| ✅ I6 · Subrental and cross-hire (0.18.0) | Suppliers, subrentals with costs that count as stock when confirmed, hire requests between AVX companies via cross-hire codes |
| ✅ I7 · Reports (0.19.0) | Use, revenue and return on cost per item, repairs, losses, hire-in spend, book value, idle stock, CSV |

## ✅ Phase 5c — "Your network" picker (0.20.0)

In the gig and organisation invite dialogs, find people you've already shared a gig or
organisation with, by name, with their past functions, how many gigs together and a ⚠ when
they're booked on the gig's dates; pick one to add them by account (their email is never shown).
Nobody can browse everyone on AVX. Each person chooses in Account who can find them:
**managers and admins only** (organisation admins and members; the default) or **also other
crew** (freelancers, including freelance PMs). The privacy notice describes it. Migration
`20261031000000_network.sql`, tests `supabase/tests/network.sql`.

## Phase 6 — Messaging

Full plan in [docs/MESSAGING.md](docs/MESSAGING.md): direct, group, gig, department and organisation
conversations attached to what they're about, then attachments and mentions, announcements with
acknowledgement, crew calls, client and supplier threads, push, moderation (stages M1–M6).

| Stage | Scope |
|---|---|
| ✅ M1 · Direct and gig conversations (0.21.0) | Messages page, a Chat tab on every gig (status, date and venue changes posted in it), replies, unread counts, mute, live delivery, bell + email summary, "Message" buttons on crew and organisation members |
| ✅ M2 · Richer messages (0.22.0) | Files with previews, cards for gigs, schedule items, files, quotes and equipment, @mentions of people and groups, reactions, edit with history, remove, link to a message |
| ✅ M3 · Channels (0.23.0) | Organisation channels with audiences and "admins only", department channels per function on a gig, pinned messages, announcements with read-and-confirm, search, saved messages |
| ✅ M4a · Connected to AVX (0.24.0) | Availability questions and crew calls answered in messages, call sheet sent to the crew with read-and-confirm, schedule changes posted in the gig's chat, team conversations on equipment, repairs and subrentals |
| ✅ M4b · Clients and suppliers (0.25.0) | Conversations with a quote's client (on the quote's page) and a subrental's supplier (through a link made for them), without an account |
| ✅ M5a · Push and offline (0.26.0) | Push notifications on phones and computers, messages written offline are sent when the connection is back |
| ✅ M6a · Safety (0.27.0) | Report a message, moderators remove messages, block a person, rate limits |
| ✅ M6b · Care (0.28.0) | Retention per organisation (nightly deletion), download of the organisation's conversations, usage counts |
| M5b · Email replies | Reply by email to the summary; email clients and suppliers when you answer (needs inbound email on the domain) |

## Help and inclusion (H1 built in 0.29.0, H2 in 0.30.0–0.31.0, H3 in 0.32.0, H4 in 0.33.0)

| Stage | Scope |
|---|---|
| ✅ H1 · Foundations (0.29.0) | Glossary (Help) with tappable words, ⓘ hints on the first fields, ? on page headers, accessibility checks in the browser tests, contrast fixes |
| ✅ H2a · Guides (0.30.0) | 14 how-to guides for crew and production managers, with screenshots generated from the real screens in both languages; in Help and in the ? panel |
| ✅ H2b · Guides (0.31.0) | 18 more guides for the warehouse, office and sales, and admins (32 in all) |
| ✅ H3 · Comfort (0.32.0) | Light and high-contrast themes from the L&P palette, text size, comfortable mode, readable font, new fonts |
| ✅ H4 · First steps (0.33.0) | Teaching empty states, first-steps checklists, simple mode (automatic for crew-only, a switch for everyone) |
| ✅ H5a · Field kit (0.34.0) | Scan mode (big buttons, sounds, vibration, torch), read aloud, large-print call sheet, undo on removals |
| ✅ H5b · Equipment steps (0.35.0) | Steps per gig (prepped → out → on site → loaded back → back in → checked in), chosen per organisation; undo a scan |

Glossary, ⓘ hints on ambiguous fields, how-to guides with screenshots per role, text size,
comfortable and high-contrast modes, simple mode for crew, a field kit for scanning, and a rule
that every new feature ships its hints and guide. Stages H1–H6 in [docs/HELP.md](docs/HELP.md).

## Field tools (built)

A **Tools** tab on each gig (decided 2026-10-20) with optional tools that share their data: stage
plot and input list, patch and DMX patch, light plot, sound system calculator. The organisation
turns on only the tools it uses; what is drawn from the catalogue becomes the gig's equipment.
After H5, before switching. **F1 built:** Tools tab, input list, Updates tab (0.36.0); stage plot (0.37.0). **F2 built (0.38.0):** patch and DMX patch. **F3 built (0.39.0):** light plot. **F4 built (0.40.0):** sound system calculator: all field tools are built; switching (S1) is next. **Decided 2026-10-21:** all field tools (F1–F4) before switching. Stages F1–F4 in [docs/FIELD_TOOLS.md](docs/FIELD_TOOLS.md).

## Switching to AVX (built)

**S1a built (0.41.0):** the import wizard for locations, equipment and units (CSV or paste, column matching with saved presets, check, report, undo). **S1b built (0.42.0):** Excel files and kit contents. **S2 built (0.43.0):** Contacts, a directory of clients and suppliers that quotes pick from, filled from existing quotes or imported. **S3a built (0.44.0):** crew imported as invitations held until an admin sends them. **S3b built (0.45.0):** upcoming jobs as gigs with their equipment, open quotes as drafts. **S4 built (0.46.0):** Rentman exports recognised, switching checklist, calendar feed for each person's phone. **S5 built (0.47.0):** an admin downloads everything the organisation holds as a zip of CSV files that import straight back. Switching is complete.


Import wizard (CSV/Excel, column matching with saved presets, preview, dry run, undo), contacts
directory, crew and upcoming jobs, a Rentman preset built from real exports, and an organisation
export. File import only, no live integration. Stages S1–S5 in [docs/SWITCHING.md](docs/SWITCHING.md).

**Order (decided 2026-10-19):** finish messaging (M2–M6) → help and inclusion (H1 first) → switching
(S1 onwards; the Rentman preset is built by reading the field structure of a mock Rentman account
made for this) → crew network and job board. Final testing happens once, at the end, from
[docs/PENDING.md](docs/PENDING.md).

## Phase 7 — Crew network and job board (built)

Opt-in freelancer profiles (functions, region, languages, certificates) and open positions posted
by companies to that pool, with the availability check built in; applications become conversations.
**International from the start.** **Day rates are shared only when a freelancer applies**, never
shown on a profile. Needs opt-in, abuse protection, reporting and ideally verified profiles; the
privacy notice and terms need a full section on it. Plan and decisions (2026-10-21) in [docs/CREW_NETWORK.md](docs/CREW_NETWORK.md), stages N1–N5. **N1 built (0.48.0):** opt-in crew profiles; each person chooses who sees theirs (companies only, or companies and crew). **N2 built (0.49.0):** Find crew: search by function, place, dates and language, then ask about a gig or offer a place. **N3 built (0.50.0):** the job board: companies post positions (two-step sign-in, 3 open posts until verified), freelancers apply with their rate, applications become conversations, offers become crew calls. **N4 built (0.51.0):** trust: verified companies (VIES or a manual check by AVX), certificates confirmed by companies or checked from a proof, reports on profiles and job posts with automatic pauses, contact settings, and an AVX reviews page. **N5 built (0.53.0):** job alerts for freelancers and saved crew searches with alerts for companies. The crew network is complete.

## End of the build

- **Public site, pricing and help** (planned 2026-10-19): a commercial site with pricing tiers and
  the sales workflows (trial, billing, certified invoices), public documentation, and help in
  layers (FAQ → docs → AI-assisted help centre), all built from the in-app guides. Stages P1–P5 in
  [docs/PUBLIC_SITE.md](docs/PUBLIC_SITE.md).
- **Phone app decision** (wrapper around this app vs. staying with the installed web app), once
  inventory scanning and messaging show what on-site use needs

## Before a public launch

- **Full terms of use** to replace the beta terms (prepare near the end of the build phase; can stay hidden while the beta runs)
- Legal review of the privacy notice and terms
- Custom domain and email records (SPF, DKIM, DMARC) checked in Brevo
- Leaked-password protection (Supabase Pro)

## Known limitations (beta)

- The email summary goes out once a day, not instantly.
- Quotes have one VAT rate per quote and need a connection (not part of offline mode). Availability is checked only for lines added from the price list.
- Gig days are read in the organisation's time zone (Lisbon for now; there's no setting for it yet). Unavailable dates are Lisbon days.
- Offline mode is read-only: uploads, posts and edits need a connection.
- Supabase free plan: pauses after 7 days idle (the keep-alive workflow prevents this); no leaked-password check.
- The quote PDF uses standard PDF fonts (Helvetica/Courier), so it looks slightly plainer than the printed page.

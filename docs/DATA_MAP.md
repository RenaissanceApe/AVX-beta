# Data map

What personal data AVX keeps, where, who sees it, why and for how long. It backs the privacy
notice (`src/pages/LegalPage.jsx`, `LegalPagePt.jsx`) and is the start of a GDPR record of
processing (Article 30). Check it, and the notice, whenever a feature stores something new about a
person: a new table or column with a name, contact detail, free text about someone, a file or a
location.

Written from the production schema on 2026-10-28 (83 tables, all with row-level security; 5
storage buckets, all private; a sixth, `signatures`, added with step 16). Not legal advice: have someone who knows Portuguese data-protection
law read it before AVX opens beyond invited pilot companies (ROADMAP.md).

## Who is who

- **AVX's operator** (see `COMPANY_NAME` in `src/config.js`) is the controller for accounts, crew
  profiles, the job board, the crew network's trust features, messages between people, and the
  service's own logs.
- **Each organisation** decides what it keeps about its own clients, suppliers, crew it imports and
  its gigs. For that data AVX probably acts as the organisation's **processor**. *Open:* a data
  processing agreement for organisations (see the end).

## Where it lives

All in Supabase (Zurich, Switzerland): the Postgres database, sign-in (`auth` schema, run by
Supabase) and private file storage. Encrypted backups for up to 30 days (docs/BACKUPS.md). Nothing
is kept on our own servers; Vercel only serves the app's files.

## The map

| Data | About whom | Where | Who can see it | Why (basis) | Kept until |
|---|---|---|---|---|---|
| Email, password hash, sign-in times, two-step sign-in factor | Account holders | `auth.users`, `auth.mfa_factors` (Supabase) | The person; AVX admins via Supabase | Contract; security | Account deleted |
| Name, phone, photo, language, specialisms, who can find you, email summary on/off, weekly numbers on/off | Account holders | `profiles` | Name and photo: people sharing an organisation, a gig (crew, guests, the gig company's people) or a conversation with them, and people they've sent a notification to (`private.can_see_profile`, since 0.82.3). Phone: the person, and people who can open a gig the person is on (`gig_crew_phones`). Email summary and weekly numbers switches: only the person (`my_profile`). Find crew shows a name only through its own search, never the phone | Contract | Account deleted |
| Organisation details (legal name, tax id, address, email, phone), VAT check answer | Organisations (may name a sole trader) | `organisations`, `org_verifications` | Its members; verified name shown on the crew network | Contract; trust on the network (legitimate interest) | Organisation deleted |
| Memberships and roles, invitations (email) | Members, invitees | `org_members`, `org_invites`, `gig_members`, `gig_invites` | The organisation's members; a gig's people | Contract | Membership ends / invite used or withdrawn |
| Gigs: name, venue, dates, description, custom fields, schedule, crew list with call times, files, posts, activity log | Crew, clients named in them | `gigs`, `gig_schedule`, `gig_members`, `assets` (+ `gig-assets` bucket), `feed_posts`, `gig_activity` | Everyone on the gig and the organisation's members | Contract | Gig or organisation deleted |
| Unavailable dates, availability questions and answers | Crew | `crew_unavailability`, `availability_requests` | The person; other companies only see "booked" | Contract | Account deleted |
| Leave: type (holiday, sick, training, other), dates, half days, notes, the decision and its note; holiday allowance and carry-over per year; working week and hours a day | Staff | `crew_unavailability` (with an organisation), `staff_leave_years`, `staff_work_weeks`, `org_leave_settings` | The person and the organisation's admins; the organisation's members see who is away (a sick day only as "away", no notes); other companies only see "booked" | Contract (employment records); a sick day is health data, kept to the organisation's admins | Removed leave is hidden; organisation or account deleted |
| Tasks: title, notes, checklist, who it's for, due date, who ticked it | Crew and staff | `tasks`, `task_templates` | The gig's people (gig tasks) or the organisation's members (organisation tasks) | Contract | Removed tasks are hidden; deleted with the gig or organisation |
| Rehearsal notes (text, photo, author, assignee) | Crew | `rehearsal_notes`, `rehearsal_sessions`, `rehearsal-photos` bucket | Everyone on the gig | Contract | Gig deleted |
| Repairs and inspections: who reported, repairer and inspector names (free text), photos | Staff, outside repairers | `repairs`, `inspections`, `repair-photos` bucket | The organisation's members | Contract (the organisation's records) | Organisation deleted |
| Crew rates for a person; fees agreed on gigs (rate, quantity, note) | Crew | `crew_rates`, `gig_crew_fees` | Rates: the organisation's admins and members. Fees: the gig's managers, and each person their own | Contract (paying crew) | Removed rates are hidden; organisation or gig deleted |
| Hours worked per day (start, end, break, travel, km, notes), the approval note, the hours split and cost at approval | Crew | `time_entries` | The gig's managers (its PMs, its creator, the organisation's admins) and each person their own | Contract (paying crew) | Removed days are hidden; gig, organisation or account deleted |
| Per-person reports (K7): one person's crew days, hours planned and approved (overtime, night, weekend, holiday), hours waiting, how long approval took, cost by the labour rule, utilisation (booked working days ÷ working days after leave and holidays), leave taken and left, tasks open, overdue and done on time; the gig wrap-up's hours per person and its notes | Crew and staff | Worked out on request from `gig_members`, `time_entries`, `gig_crew_fees`, `crew_rates`, `crew_unavailability`, `staff_work_weeks`, `tasks` (`ops_people`, `ops_person`, `ops_tasks`, `gig_wrapup`); notes in `gigs.wrapup_notes`. Nothing new is stored except the notes | Per person: the organisation's admins only (the owner's choice, 2026-11-08); members see totals; the wrap-up's rows: the gig's managers and the organisation's admins; crew and viewers nothing | Contract (planning and paying crew; employment records) | Not stored (counted when asked); notes: gig or organisation deleted |
| Expenses: supplier, what for, amounts and VAT, invoice number, due and paid dates and how, notes, receipts (photos and PDFs, which may show names, card digits or a car's plate); claims name who paid and the approval note | Staff and crew who claim; suppliers' people | `expenses`, `expense_recurrences`, `expense_categories`, `org_finance_settings`, `expense-receipts` bucket (`<organisation>/<expense>/`) | The organisation's admins and members; a claim also its owner and the gig's managers | Contract (the organisation's records; reimbursing people) | Removed expenses are hidden; organisation deleted (*open:* receipts are kept with the expense, as the accountant may need them for years) |
| Invoices and credit notes: the client's name, tax number (NIF), address and email, lines and amounts, dates, the certified program's number and a link to its PDF; payments received (date, amount, method, note; step 12). Moloni connection (unused until step 11b): tokens, company and series | Clients and their contact people | `invoices`, `invoice_payments`, `moloni_connections` (empty; no access from the app) | The organisation's admins and members; tokens: nobody through the app | Contract and legal obligation (invoices must be kept; the legal copy is in the certified program) | Drafts are removed by marking them; issued ones stay; organisation deleted (*open:* how long to keep them, as the program keeps the legal copy for 10 years) |
| Clients and suppliers: names, contacts, email, phone, address, tax id, notes, custom fields | Clients', suppliers' people | `clients`, `suppliers` | The organisation's admins and members | The organisation's (processor) | Changed or cleared by the organisation; organisation deleted |
| Quotes: client name, company, email, address, tax id; quote answers (name, note) | Clients | `quotes`, `quote_versions`, `quote_shares` | The organisation's quoting people; the client through the link | The organisation's (processor) | Quote or organisation deleted |
| Signatures (step 16): the drawing, the signer's typed name and role or company, the time, the exact text signed and its SHA-256, a signed PDF; who collected it (an account) and who hid it | Clients signing a quote or a delivery note; later crew (contracts) and riggers | `signatures`, `signatures` bucket (`<organisation>/<signature>/signature.png`, `signed.pdf`); a copy of the signed PDF in the gig's files (`assets`, `gig-assets`) | Quote acceptances: the organisation's quoting people and the quote's gig managers; delivery notes: everyone on the gig; the client sees their own on the quote's page | The organisation's (processor): proof of the order or the delivery | Can't be changed; hidden by marking; deleted with the quote, gig or organisation (*open:* how long a signed delivery note should be kept) |
| Crew imported before inviting: name, email, phone, functions | Crew not yet on AVX | `held_invites` | The organisation's admins | The organisation's (processor) | Sent or discarded by the organisation; admins reminded after 14 days unsent, marked expired after 60 (still sendable, not removed); organisation deleted |
| Import undo records (before/after copies of imported rows) | Whoever the rows name | `import_changes`, `import_part_changes` (server only) | Nobody through the app | Undoing an import | Organisation deleted |
| Crew profile: functions, town (to ~1 km), travel range, languages, experience, certificates, text, links | Freelancers who switch it on | `crew_profiles`, `certificate_confirmations` | Who the person chooses; never the public web | Consent (switching it on) | Switched off/removed; account deleted |
| Certificate proofs (files) | Freelancers | `certificate_proofs`, `certificate-proofs` bucket | The person and AVX admins only | Trust on the network | Account deleted |
| Job posts and applications (message, day rate) | Companies' staff, applicants | `job_posts`, `job_applications` | Crew with a profile on (posts); the posting company (applications) | Contract | Account or organisation deleted |
| Crew contacts, searches, saved searches | Searching staff; contacted crew | `crew_contacts`, `crew_search_log`, `crew_saved_searches` | The organisation (saved searches); server only (logs) | Preventing misuse (legitimate interest); the contact record both sides see | Search log: 30 days (nightly clean-up). Contacts and saved searches: organisation deleted |
| Reports about people, posts or messages; blocks | Reporters and the reported | `network_reports`, `message_reports`, `user_blocks` | AVX admins or the conversation's moderators; never who reported | Preventing abuse (legitimate interest) | Account deleted |
| Messages, files, edits, reactions, read confirmations, saved messages; guest names | Account holders, clients and suppliers writing through a link | `messages`, `message_edits`, `message_reactions`, `message_acks`, `saved_messages`, `message-files` bucket | The conversation's people | Contract | The organisation's retention setting (forever or 90 days to 2 years); direct conversations until removed |
| Notifications | Account holders | `notifications` | The person | Contract | Read ones: 12 months after reading (nightly clean-up); unread ones until read or account deleted |
| Calendar link key | Account holders | `calendar_feeds` | The person | Contract | Replaced or account deleted |
| Push subscriptions (endpoint, keys, device name) | Account holders | `push_subscriptions` | Server only | Contract (opt-in) | Turned off, signed out or account deleted |
| Usage counts per screen per day | Nobody (no id, IP or device) | `private.usage_daily` | AVX admins | Improving the service | Not personal data |
| Error reports (only if Sentry is set up) | Account holders by internal id | Sentry | AVX admins | Fixing errors (legitimate interest) | Sentry's retention |

## Who processes it for us

Supabase (database, sign-in, files; Zurich), Vercel (serves the app; IP addresses), Brevo (sends
emails; France), the browsers' push services (encrypted notifications), LocationIQ's place search, EU servers
(only the town name typed for a crew profile or a crew search), the European Commission's VIES (only a VAT number),
Sentry if configured. All listed in the privacy notice.

## Open items

1. **Data processing agreement** for organisations: the terms should say AVX processes their
   clients', suppliers' and imported crew's data on their behalf (Article 28). Legal wording needed.
2. ~~**Keep logs only as long as needed.**~~ Done in U3: `private.run_data_retention()` runs every
   night (pg_cron `avx-data-retention`, 04:11 UTC) and removes `crew_search_log` rows older than
   30 days and notifications read more than 12 months ago (unread ones stay). It deletes rows, so
   its migration (`20270111000001_retention_cleanup.sql`) is applied by hand. `crew_contacts` is
   the record of who contacted whom that both sides see, so it stays.
3. ~~**Held invitations** never sent.~~ Done in U3: `private.remind_held_invites()` (pg_cron
   `avx-held-invites`, 06:53 UTC) reminds the organisation's admins once after 14 days and marks
   the invitation expired (`held_invites.expired_at`) after 60. Nothing is removed: an expired
   invitation can still be sent or discarded, and goes with the organisation.
4. **Custom fields and free-text notes** can hold anything an organisation types, including
   sensitive data. The help guide warns that crew see gig fields; the terms could ask organisations
   not to store special-category data there.

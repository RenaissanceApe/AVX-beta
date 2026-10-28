# Data map

What personal data AVX keeps, where, who sees it, why and for how long. It backs the privacy
notice (`src/pages/LegalPage.jsx`, `LegalPagePt.jsx`) and is the start of a GDPR record of
processing (Article 30). Check it, and the notice, whenever a feature stores something new about a
person: a new table or column with a name, contact detail, free text about someone, a file or a
location.

Written from the production schema on 2026-10-28 (83 tables, all with row-level security; 5
storage buckets, all private). Not legal advice: have someone who knows Portuguese data-protection
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
| Name, phone, photo, language, specialisms, who can find you, email summary on/off | Account holders | `profiles` | People sharing a gig or organisation with them; phone only on gigs they share | Contract | Account deleted |
| Organisation details (legal name, tax id, address, email, phone), VAT check answer | Organisations (may name a sole trader) | `organisations`, `org_verifications` | Its members; verified name shown on the crew network | Contract; trust on the network (legitimate interest) | Organisation deleted |
| Memberships and roles, invitations (email) | Members, invitees | `org_members`, `org_invites`, `gig_members`, `gig_invites` | The organisation's members; a gig's people | Contract | Membership ends / invite used or withdrawn |
| Gigs: name, venue, dates, description, custom fields, schedule, crew list with call times, files, posts, activity log | Crew, clients named in them | `gigs`, `gig_schedule`, `gig_members`, `assets` (+ `gig-assets` bucket), `feed_posts`, `gig_activity` | Everyone on the gig and the organisation's members | Contract | Gig or organisation deleted |
| Unavailable dates, availability questions and answers | Crew | `crew_unavailability`, `availability_requests` | The person; other companies only see "booked" | Contract | Account deleted |
| Tasks: title, notes, checklist, who it's for, due date, who ticked it | Crew and staff | `tasks`, `task_templates` | The gig's people (gig tasks) or the organisation's members (organisation tasks) | Contract | Removed tasks are hidden; deleted with the gig or organisation |
| Rehearsal notes (text, photo, author, assignee) | Crew | `rehearsal_notes`, `rehearsal_sessions`, `rehearsal-photos` bucket | Everyone on the gig | Contract | Gig deleted |
| Repairs and inspections: who reported, repairer and inspector names (free text), photos | Staff, outside repairers | `repairs`, `inspections`, `repair-photos` bucket | The organisation's members | Contract (the organisation's records) | Organisation deleted |
| Clients and suppliers: names, contacts, email, phone, address, tax id, notes, custom fields | Clients', suppliers' people | `clients`, `suppliers` | The organisation's admins and members | The organisation's (processor) | Changed or cleared by the organisation; organisation deleted |
| Quotes: client name, company, email, address, tax id; quote answers (name, note) | Clients | `quotes`, `quote_versions`, `quote_shares` | The organisation's quoting people; the client through the link | The organisation's (processor) | Quote or organisation deleted |
| Crew imported before inviting: name, email, phone, functions | Crew not yet on AVX | `held_invites` | The organisation's admins | The organisation's (processor) | Organisation deleted (*open:* discard sooner) |
| Import undo records (before/after copies of imported rows) | Whoever the rows name | `import_changes`, `import_part_changes` (server only) | Nobody through the app | Undoing an import | Organisation deleted |
| Crew profile: functions, town (to ~1 km), travel range, languages, experience, certificates, text, links | Freelancers who switch it on | `crew_profiles`, `certificate_confirmations` | Who the person chooses; never the public web | Consent (switching it on) | Switched off/removed; account deleted |
| Certificate proofs (files) | Freelancers | `certificate_proofs`, `certificate-proofs` bucket | The person and AVX admins only | Trust on the network | Account deleted |
| Job posts and applications (message, day rate) | Companies' staff, applicants | `job_posts`, `job_applications` | Crew with a profile on (posts); the posting company (applications) | Contract | Account or organisation deleted |
| Crew contacts, searches, saved searches | Searching staff; contacted crew | `crew_contacts`, `crew_search_log`, `crew_saved_searches` | The organisation (saved searches); server only (logs) | Preventing misuse (legitimate interest); the contact record both sides see | Organisation deleted (*open:* search log kept longer than needed) |
| Reports about people, posts or messages; blocks | Reporters and the reported | `network_reports`, `message_reports`, `user_blocks` | AVX admins or the conversation's moderators; never who reported | Preventing abuse (legitimate interest) | Account deleted |
| Messages, files, edits, reactions, read confirmations, saved messages; guest names | Account holders, clients and suppliers writing through a link | `messages`, `message_edits`, `message_reactions`, `message_acks`, `saved_messages`, `message-files` bucket | The conversation's people | Contract | The organisation's retention setting (forever or 90 days to 2 years); direct conversations until removed |
| Notifications | Account holders | `notifications` | The person | Contract | Account deleted (*open:* no time limit) |
| Calendar link key | Account holders | `calendar_feeds` | The person | Contract | Replaced or account deleted |
| Push subscriptions (endpoint, keys, device name) | Account holders | `push_subscriptions` | Server only | Contract (opt-in) | Turned off, signed out or account deleted |
| Usage counts per screen per day | Nobody (no id, IP or device) | `private.usage_daily` | AVX admins | Improving the service | Not personal data |
| Error reports (only if Sentry is set up) | Account holders by internal id | Sentry | AVX admins | Fixing errors (legitimate interest) | Sentry's retention |

## Who processes it for us

Supabase (database, sign-in, files; Zurich), Vercel (serves the app; IP addresses), Brevo (sends
emails; France), the browsers' push services (encrypted notifications), OpenStreetMap's place search
(only the town name typed for a crew profile), the European Commission's VIES (only a VAT number),
Sentry if configured. All listed in the privacy notice.

## Open items

1. **Data processing agreement** for organisations: the terms should say AVX processes their
   clients', suppliers' and imported crew's data on their behalf (Article 28). Legal wording needed.
2. **Keep logs only as long as needed:** `crew_search_log` is only read for the last day's limit but
   is kept for ever, and old `notifications` are never cleared. (`crew_contacts` is the record of who
   contacted whom that both sides see, so it stays.) A
   nightly clean-up like the message retention job would fix it (a schema change, so a hand-run step
   per the project's rules).
3. **Held invitations** that are never sent stay until the organisation is deleted; offer a time
   limit or a reminder to discard them.
4. **Custom fields and free-text notes** can hold anything an organisation types, including
   sensitive data. The help guide warns that crew see gig fields; the terms could ask organisations
   not to store special-category data there.

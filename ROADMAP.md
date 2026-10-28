# Roadmap

The one list of what is built and what comes next, in order. Each feature set is built in **its
own session** with the prompt for it in [docs/SESSION_PROMPTS.md](docs/SESSION_PROMPTS.md); that
session reads this file, [CLAUDE.md](CLAUDE.md) and the design doc named in its row, nothing else
up front. What each release changed is in [CHANGELOG.md](CHANGELOG.md).

## Built

| Area | Versions | How it works |
|---|---|---|
| Accounts, organisations, gigs, files, feed, schedule, call sheet, activity, calendar, installable app | 0.2–0.5 | [README.md](README.md), [SETUP.md](SETUP.md) |
| Notifications and daily email summary, offline mode, magic links, two-step sign-in, usage counts, browser tests | 0.5–0.10 | [docs/EMAIL.md](docs/EMAIL.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/USAGE.md](docs/USAGE.md), [docs/TESTING.md](docs/TESTING.md) |
| Quotes: builder, templates, versions, price list, branding, send to client, PDF, quote → gig | 0.7–0.10 | [docs/QUOTES.md](docs/QUOTES.md) |
| Navigation and workspaces | 0.11 | [docs/NAVIGATION.md](docs/NAVIGATION.md) |
| Bookings, clashes, reservations engine | 0.12 | [docs/RESERVATIONS.md](docs/RESERVATIONS.md) |
| Inventory I1–I7: catalogue, availability, warehouse scanning, kits, maintenance, subrentals, reports | 0.13–0.19 | [docs/INVENTORY.md](docs/INVENTORY.md) |
| "Your network" picker | 0.20 | [docs/CREW_NETWORK.md](docs/CREW_NETWORK.md) |
| Messaging M1–M6b (M5b not built) | 0.21–0.28 | [docs/MESSAGING.md](docs/MESSAGING.md) |
| Help and inclusion H1–H5b (H6 not built) | 0.29–0.35 | [docs/HELP.md](docs/HELP.md) |
| Field tools F1–F4: stage plot, input list, patch, DMX patch, light plot, sound system calculator | 0.36–0.40 | [docs/FIELD_TOOLS.md](docs/FIELD_TOOLS.md) |
| Switching S1–S5: import wizard, contacts, crew and jobs import, Rentman exports, organisation export | 0.41–0.47 | [docs/SWITCHING.md](docs/SWITCHING.md) |
| Crew network N1–N5: profiles, Find crew, job board, trust, alerts | 0.48–0.53 | [docs/CREW_NETWORK.md](docs/CREW_NETWORK.md) |
| Steps 1–4: rehearsal companion R1–R2, DMX calculator D1, On-site mode | 0.54–0.57 | [docs/TOOLS_PLAN.md](docs/TOOLS_PLAN.md) |
| Steps 5–7: tasks T1–T2, gig statuses and types, custom fields, crew rates and labour cost | 0.58–0.63 | [docs/BUSINESS.md](docs/BUSINESS.md) |
| Truss load tables (data only, waiting for a second check) | 0.60 | [docs/TRUSS_DATA.md](docs/TRUSS_DATA.md) |
| Privacy and security check: data map, OWASP review, sign-in failure tests | 0.62.1 | [docs/DATA_MAP.md](docs/DATA_MAP.md), [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md) |

## What's left, in order

Built in dependency order: nothing before what it needs. **"Connect"** lists the earlier features
that must pick up the new one; that linking is part of the step's PR, not a later clean-up, and
the PR description and CHANGELOG say what was connected. Numbers in brackets are from
[docs/COMPETITOR_RESEARCH.md](docs/COMPETITOR_RESEARCH.md). Step numbers are fixed (code and
migrations refer to them). "Prompt" is the section of docs/SESSION_PROMPTS.md to paste.

| # | What | Needs | Connect | Plan | Prompt |
|---|---|---|---|---|---|
| 7b | Crew-rate follow-ups: fees in crew calls and job posts, quote crew lines from the rate card | 7 | Crew calls, job board, quote editor | BUSINESS.md | S01 |
| 8 | **Time registration** [2] | 7, schedule | Gig crew tab, labour cost (actual vs planned), calendar feed, export | BUSINESS.md | S02 |
| 9 | **Leave requests** [5] | availability | Clashes, Find crew "free", time registration | BUSINESS.md | S03 |
| 10 | **Gig finance overview** [4] | 7, 8, quotes, subrentals | Dashboard, reports | BUSINESS.md | S04 |
| 11 | **Invoices** [1] (hand-off to certified software, VAT per line) | accepted quotes, 10 | Quotes, contacts, guest threads, client links | BUSINESS.md | S05 |
| 12 | Damage charged to the client [15], **payments** [22] | 11, repairs | Repairs, quotes, invoices | BUSINESS.md | S06 |
| 13 | **A1** speaker library | catalogue | F4 sound calculator; later P1 and RG3 | TOOLS_PLAN.md §6 | S07 |
| 14 | **MVR/GDTF import** [29] and MVR export | light plot, DMX patch | Fixture weights and power for P1 and RG1 | TOOLS_PLAN.md, FIELD_TOOLS.md | S08 |
| 15 | **P1–P2** power and cables | light plot, 13, 14 | Light plot power estimate, gig equipment (distros, cables) | TOOLS_PLAN.md §4 | S09, S10 |
| 16 | **E-signature** [16] | — | Quote acceptance, delivery notes, crew contracts, rigger sign-off | BUSINESS.md | S11 |
| 17 | **RG1–RG2** weights, points, hoists, trusses, bridles | light plot, catalogue, truss tables | Light plot "rigging not checked", bridle pocket tool, truss-table review screen | TOOLS_PLAN.md §5, TRUSS_DATA.md | S12, S13 |
| 18 | **RG3** line arrays | 13, F4, RG1 | Sound system calculator | TOOLS_PLAN.md §5 | S14 |
| 19 | **RG4** rigging plot, report, sign-off | RG1–RG3, job board, 16 | Gig files, on-site view, job board prefill | TOOLS_PLAN.md §5 | S15 |
| 20 | **RG5** suggestions; **P3** one-line diagram and on-site power checklist | RG4, P2 | On-site mode | TOOLS_PLAN.md §4–5 | S16 |
| 21 | **A2** coverage map, **A3** prediction and measurement files | 13, F4 | Gig files, tuning sheet | TOOLS_PLAN.md §6 | S17 |
| 21b | **A4–A6** own simulator by level of detail | A1–A3, RG1, RG3 | A2 map, system calculator, tuning sheet | TOOLS_PLAN.md §6 | S18, S19, S20, S20b |
| 22 | **Shareable rider / advance page** [28] | stage plot, inputs, patch, P, RG | Power and rigging summaries; line-up start and readiness check (from StageKit) | BUSINESS.md | S21 |
| 22b | **Venue pages**, only if you say yes (decision D14) | 22, P1, RG1 | Gig address, call sheet, power supply, rigging points | TOOLS_PLAN.md "Proposed" | S22 |
| 23 | **Vehicles and transport** [8], **appointments** [9] | reservations, item weights | Packing list per vehicle, calendar, clashes | BUSINESS.md | S23 |
| 24 | **Reports** [11] | 10, 11, 23 | Dashboard | BUSINESS.md | S24 |
| 25 | **Gig templates** [7] | everything above | Copies schedule, positions, equipment, tools, tasks, custom fields | BUSINESS.md | S25 |
| 26 | **Client portal** [13], **online booking requests** [14] | 11, quotes | Quote links, guest threads | BUSINESS.md | S26 |
| 26b | **M5b** email replies (needs inbound email on the domain) | messaging, 26 | Email summary, client and supplier threads | MESSAGING.md | S27 |
| 27 | Freelancer side: **contracts** [25], **invoicing** [26], **work history** [24] | 7, 8, 16 | Crew profiles, crew calls | BUSINESS.md | S28 |
| 28 | **Public API and webhooks** [17] | stable data model | Cueing app, accounting sync [18], payroll export [23], MCP [19] | BUSINESS.md | S29 |
| 29 | **R3** cueing app bridge | R1, tasks, 28 | Cueing app roadmap starts here | TOOLS_PLAN.md §2 | S30 |
| 30 | Rental network [21], RFID [20] | 28, inventory | Subrentals | BUSINESS.md | S31 |

**Upkeep sessions**, run whenever there's a gap (each is small and independent):

| What | Why | Prompt |
|---|---|---|
| Organisation time zone (D10) | Everything is read as Lisbon time; needed before companies abroad join | U1 |
| React Router 7, current Vite and Vitest | Remaining advisories (docs/SECURITY_REVIEW.md) | U2 |
| Data map open items: trim the crew-search log and old notifications, held-invitation time limit | docs/DATA_MAP.md | U3 |
| Truss tables: mark checked or update from the manufacturers' answers (D12, D13) | Needed before RG2 can use them | U4 |

## End of the build

1. **Final test pass** from [docs/PENDING.md](docs/PENDING.md) section 2 (run once, by you).
2. **Public site, pricing, billing and public help** P1–P5 ([docs/PUBLIC_SITE.md](docs/PUBLIC_SITE.md)), prompts P1–P5.
3. **Phone app decision** (D11): a wrapper around this app, or the installed web app.
4. **H6** (ask for help, more languages, SMS/WhatsApp, video guides): only as asked ([docs/HELP.md](docs/HELP.md)).

## Before a public launch

- Full terms of use replacing the beta terms, including the rigging disclaimer (TOOLS_PLAN.md
  "Decided") and a data processing agreement for organisations (DATA_MAP.md open items).
- Legal review of the privacy notice and terms.
- Leaked-password protection and daily restorable backups (Supabase Pro); Vercel Pro (commercial use).
- Custom domain for the app.

## Known limitations (beta)

- The email summary goes out once a day, not instantly.
- Quotes have one VAT rate per quote (step 11 adds VAT per line) and need a connection.
- Availability is checked only for quote lines added from the price list.
- Gig days are read in Lisbon time (U1).
- Offline mode is read-only except rehearsal notes and messages, which are sent when back online.
- The quote PDF uses standard PDF fonts, so it looks slightly plainer than the printed page.

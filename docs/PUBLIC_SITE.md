# Public site, pricing and help — plan (end of the build)

Status: **planning only**. Nothing here is built yet; it's tackled in the final phase, together
with the full terms of use. Raised 2026-10-19.

AVX today is only the app. Before a public launch it needs a face outside the app: a commercial
site that explains it and sells it, and documentation that lets anyone see how it works before
joining.

## 1. Help is an onion

Each layer answers what the one before couldn't:

| Layer | Answers | Where | Built from |
|---|---|---|---|
| **FAQ** | The common questions, quickly: "Do crew pay?", "Does it work offline?", "Can I import from Rentman?", "Where is my data?" (~90% of questions) | Public site and in the app | Short answers, each linking to a guide |
| **Documentation** | "Show me how it works": every feature, step by step, with screenshots, per role | Public docs site (searchable, PT/EN) | The **same guides as the in-app help** (docs/HELP.md, H2) |
| **Help centre** | "Help me!": an assistant that answers from the documentation, then a person | Public site and in the app | AI chat grounded only on the docs (it links to the guide it used, and says when it doesn't know), then a contact form |

**One source for every answer.** The in-app guides (H1/H2) are written once as content files.
The public docs, the FAQ and the AI assistant all read from them, so they never contradict each
other or go stale. When a feature changes, its guide changes in the same PR (the "part of done"
rule already in CONTRIBUTING).

The AI assistant:
- answers **only from the documentation** and cites the guide; no made-up features;
- says "I don't know" and offers a person (email, or a ticket that becomes a conversation);
- on the public site, knows nothing about anyone's data. In the app, a later option is to let it
  see the page you're on (never your organisation's data without asking);
- logs questions it couldn't answer (anonymously), which becomes the list of guides to write.

## 2. The commercial site

A separate, fast, static site (good for search engines), on the main domain, with the app on a
subdomain (e.g. `avx…` for the site, `app.avx…` for the app). Portuguese and English from day one.

Pages:
- **Home:** what AVX is in one sentence, for whom, and a screenshot or short video per role
  (production manager, crew, warehouse, office).
- **Features**, by job: gigs and crew, call sheets, quotes, inventory and scanning,
  subrentals, messaging, offline use, reports.
- **For crew:** free, and why being on AVX gets you work (ties in with the crew network, Phase 7).
- **Switching:** "Coming from Rentman / Excel / another tool": what the import does
  (docs/SWITCHING.md), and an honest comparison table.
- **Pricing** (below).
- **Security and privacy:** EU hosting, two-step sign-in, backups, GDPR, data export and deletion.
- **About / contact**, **FAQ**, **Docs**, **Help**, **Terms**, **Privacy**, **Status**.

## 3. Pricing tiers (to decide)

A starting proposal to react to, not a decision:

| Tier | For | Includes |
|---|---|---|
| **Crew** — free, always | Freelancers and crew | Everything for your own work: gigs you're on, call sheets, availability, messages, My work, offline |
| **Starter** | Small production companies | Gigs, crew, schedule and call sheets, quotes, messaging; limited gigs per month or seats |
| **Pro** | Production and rental companies | Everything in Starter + inventory, scanning, kits, repairs, subrentals, reports, import |
| **Business** | Larger companies | Pro + several organisations, more storage, priority support, custom contracts |

Questions:
- Charge **per company**, **per admin/member seat** (crew always free), or **by usage**
  (active gigs per month)? Seats for office staff with free crew is the usual model for this
  kind of tool and keeps the network growing.
- Monthly and yearly (with a discount)? Price in euros only at first?
- Free trial length (14 or 30 days, no card), and what happens to data after it ends.
- Do beta companies keep a founder's price?

## 4. Sales workflows

- **Sign-up → trial → plan:** creating an organisation starts a trial; plan limits live in the
  database per organisation and the app shows what's included and what's not.
- **Billing:** card and SEPA through a payment provider (e.g. Stripe), with a customer portal for
  changing plan, card and billing details. **In Portugal, invoices must be issued by certified
  invoicing software** (AT), so payments connect to a certified invoicing service (e.g. Moloni,
  InvoiceXpress) that issues the legal invoice. VAT and reverse charge for EU companies.
- **Upgrades, downgrades, failed payments** (reminders, a grace period, then read-only, never
  sudden deletion), **cancellation** with data export.
- **Demo requests and contact** → the CRM / email tool, with follow-up emails.
- **Onboarding emails** during the trial (first gig, invite crew, first quote), sent with Brevo.
- Later: referral credit (a company that invites another), partner/reseller terms.

## 5. Legal and trust (with the full terms)

- Full **terms of use** and a **data processing agreement** (companies process their crew's data
  in AVX, so AVX acts as a processor for them), list of subprocessors, SLA for paid plans.
- The marketing site's analytics: privacy-friendly like the app's; any advertising pixels would
  need a cookie consent banner, so avoid them if possible.

## Stages (end of the build)

| Stage | Scope |
|---|---|
| **P1 · Decisions** | Tiers, prices, trial, invoicing provider, domain, site technology |
| **P2 · Site** | Commercial site (PT/EN), pricing page, contact/demo form |
| **P3 · Plans in the app** | Plan limits per organisation, trial, upgrade screens |
| **P4 · Billing** | Payments, customer portal, certified invoices, failed payments, cancellation |
| **P5 · Docs and help** | Public docs site and FAQ from the H2 guides; AI help assistant grounded on the docs; contact/tickets |

The in-app help (H1–H4) comes first in the build and is the content P5 publishes.

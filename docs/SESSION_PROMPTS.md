# Session prompts

One prompt per remaining feature session, in [ROADMAP.md](../ROADMAP.md) order. To build the next
step:

1. Make sure the previous step's PR is merged.
2. Open a **new** Claude Code session on this repository.
3. Paste the prompt below, as it is.

Each session follows CLAUDE.md ("A session, start to finish"), so the prompts don't repeat it: it
branches from `main`, asks you its questions, outlines the migration and waits for your yes, builds,
connects, documents and opens a PR. **It never merges**; you do. Then the next prompt.

Every prompt ends with the same two lines on purpose: they keep a session from drifting into the
next step.

**Several steps at once:** a Dispatcher session can run a group of steps in parallel, one worker
session each, and hand you one PR at the end ([PARALLEL.md](PARALLEL.md)). Then the release
worker, not each session, removes the prompts carried out.

**When a step's plan changes** (a new decision, a question answered), edit its prompt here and its
plan in the doc it names, in the same commit.

**Once a prompt has been used, its section is removed** (CLAUDE.md, "A session, start to finish",
step 6), so this file only holds prompts still to run. The ROADMAP's "Built" table records what
they built.

Steps 1–12 (0.54–0.74), K0 (0.64), K1 (0.69), K2 (0.75), K3 (0.76), K4–K9 (0.77), the design refresh DR1–DR6 (0.78), steps 13, 14 and 16 (0.79), steps 15, 17a and 18 (0.80), the upkeep sessions U1–U3, U5 and U6 (0.81) and the import overhaul IM1–IM4 (0.82) step 23, vehicles, transport and appointments (0.83), and LC1, the read-only live check (0.83.1, part of QA2, whose prompt stays), are built, and their prompts (S01–S12, S14, S23, K1–K9, DR1–DR6, U1–U3, U5, U6, IM1–IM4) removed. Sessions
S13–S31 are the build order, with steps 19b and 20b (S15b, S16b) and the dashboards and analytics pack (K1–K11, [ANALYTICS.md](ANALYTICS.md)) slotted in where
ROADMAP.md places them; U4 is the small upkeep session left, to run in any gap; QA1–QA4 build the QA bot ([QA.md](QA.md)) in any gap; P1–P5 close the build;
K12–K13 come after the launch.

---

## S13 · Step 17b: RG2 truss tables, bridles, hardware

```
Build ROADMAP step 17, second part: RG2. Read docs/TOOLS_PLAN.md §5 (RG2, Decided Q3),
docs/TRUSS_DATA.md, src/lib/trussTables.js, src/data/truss/ and docs/PENDING.md D12–D13.

Scope:
- Truss types from the manufacturers' load tables:
  - a pass/fail per span for UDL, CPL, TPL, QPL and deflection, using only tables whose status is
    "checked";
  - each report shows which table and edition it used.
- A review screen where a second person checks a table row by row against its source document and
  marks it checked (name, date); blocked tables stay unusable.
- A bridle calculator (two legs to a pick point): leg lengths, angles, tension per leg, a warning
  above 120°, horizontal force on the beams. Also as a pocket tool (My work → Tools).
- A rigging hardware list: shackles, slings, steels and spansets with their WLL.

Ask me before building: should checks be stored in the database (per organisation, or by AVX for
everyone) or stay in the repo's JSON as now? Any answers from the manufacturers (D13)?

Connect: RG1 lines (truss type per line), pocket tools, gig equipment (hardware).

Done when: unit tests for bridle maths and table look-ups (interpolation never extrapolates past
the table); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S15 · Step 19: RG4 rigging plot, report and sign-off

```
Build ROADMAP step 19: RG4. Read docs/TOOLS_PLAN.md "Decided" (Q4, rigger sign-off) and §5 (RG4),
how RG1–RG3 and e-signature (step 16) were built, and the job board (docs/CREW_NETWORK.md N3).

Scope:
- A top view with points, hoists, bridles and truss lines.
- A per-point table: load, hoist, class, WLL, % used. Totals per beam or roof zone against the
  venue's capacities.
- The rigging report as print/PDF with its assumptions and sources.
- Catalogue lines (hoists, truss, shackles, steels) offered to the gig's equipment.
- "Checked by" sign-off (Q4, decided):
  - a named rigger, their certificate from their crew profile, the date, signed with step 16;
  - until signed, the plot and report carry a visible warning;
  - with no rigger, suggest a job post for a certified rigger, prefilled;
  - if every warning is dismissed, show the liability disclaimer.
- Engineer's pack (D33): one download with every input (positions, weights, points, hoists, truss
  types and the table edition used, bridles), the results and the plot, so a certified engineer
  can check it without re-entering anything; "Send to an engineer" shares it through a
  supplier-style link.
- Measured loads (TOOLS_PLAN "Decided (2026-11-03)"): the rigger types the load-cell reading per
  point on site and sees it next to the planned load, with a warning above the hoist's WLL or more
  than a set percentage over the plan.

Connect: gig files (the report and the pack), On-site mode (read-only plot, measured loads), job
board prefill, the QR on prints (U6), the terms (disclaimer wording to review).

Done when: database tests for sign-off (who can sign, can't edit after); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S15b · Step 19b: TradeShowLoads export

```
Build ROADMAP step 19b: TradeShowLoads export (docs/PENDING.md D34). Read docs/TOOLS_PLAN.md
"Decided (2026-11-03)" and how RG4 was built.

First: find out whether the .tsle file format is published or openly documented. If it isn't,
stop, tell me what you found and who to ask, and build nothing.

Scope (only if the format is open):
- Export the rigging plan's hang points as a .tsle file: fair, hall, booth and company typed in;
  each point with its name, position and load from RG4.
- The export uses the same checked numbers as the report and carries the same "aid, to be checked"
  wording.

Connect: rigging report, gig files.

Done when: unit tests that the file matches the format's examples; help entry; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S16 · Step 20: RG5 suggestions, P3 one-line and on-site power

```
Build ROADMAP step 20: RG5 and P3. Read docs/TOOLS_PLAN.md §4 (P3) and §5 (RG5), and how RG4 and
P1–P2 were built.

Scope:
- RG5: when a rigging check fails, suggest fixes (move a point, add a point, a bigger hoist, a
  stronger truss type, spread a bridle), each re-checked before it's shown.
- P3:
  - a one-line diagram of the power tree, with the data chain (which fixture feeds which, through
    which splitter or node) from the DMX patch;
  - a move-loads grid for on-site changes (outputs down the side, loads across, tap to move, phase
    totals update at once);
  - views per area and per department;
  - an on-site checklist of what plugs into what, ticked off on the phone, offline.

Connect: On-site mode (both checklists), rigging and power reports.

Done when: unit tests (every suggestion passes the same checks); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S16b · Step 20b: work areas

```
Build ROADMAP step 20b: work areas (docs/PENDING.md D35). Read docs/TOOLS_PLAN.md "Decided
(2026-11-03)", docs/BUSINESS.md (tasks T1–T2), how On-site mode, the light plot positions, P3 and
RG4 were built, and how U5 (labels) and U6 (QR on prints) work.

Scope:
- A work area on a gig groups light-plot positions, power and rigging items and gig equipment
  (a truss, FOH, a tower, stage left).
- Each area is a task: people, an estimated build time, build instructions, notes; status
  upcoming, active, done.
- A printed sheet per area with what goes there, who builds it and a QR that opens the area.
- Progress per area and for the whole gig in On-site mode, offline like the other checklists.

Ask me before building: how areas are made (by hand, or suggested from positions), and the
migration outline.

Connect: tasks, light plot, power and rigging plots, On-site mode, labels (area on case labels),
prints, the activity feed.

Done when: database tests for who can see and change areas; help guide and screenshots; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K10 · Safety and compliance (only if D27 is yes)

```
Build ROADMAP step K10: safety and compliance. Check docs/PENDING.md D27 first: if I haven't said
yes, stop and ask me. Read the ROADMAP row, docs/ANALYTICS.md ("K10"), docs/INVENTORY.md I5
(inspections), docs/CREW_NETWORK.md N4 (certificates), and how RG4's sign-off, P3's on-site power
checklist and e-signature were built (docs/TOOLS_PLAN.md §4–5, docs/BUSINESS.md 16).

Scope (Reports → Safety):
- Gear: inspections due, overdue and failed; units booked on upcoming gigs whose inspection will
  be overdue by then (and a ⚠ on the gig's Equipment tab, never a block).
- People: crew on upcoming gigs whose certificates (from the profiles they share) expire before
  the gig; the certificates each function needs, as I set them.
- Gigs: rigging sign-offs missing or pending, on-site power checklists not done, documents not
  signed (crew contracts, delivery notes), damage reported on site.
- A printable safety pack per gig: inspection dates of the gear going, rigging sign-off, power
  checklist, crew certificates.
- Tiles: booked gear with an overdue inspection, unsigned rigging in the next 7 days.

Already decided: rigging and power results are aids that a competent person must check; the pack
says so.

Ask me before building: which certificates each function needs; who sees crew certificates in the
pack (the gig's managers only?).

Connect: Equipment tab (⚠), maintenance, crew profiles, rigging report, power checklist, gig files
(the pack can be saved there), Overview.

Done when: database tests (certificates only from profiles the organisation may see; crew don't see
others' certificates); help guide "pm-safety"; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S17 · Step 21: A2 coverage map, A3 prediction and measurement files

```
Build ROADMAP step 21: A2 and A3. Read docs/TOOLS_PLAN.md §6 (A2, A3 and why we don't copy EASE),
the A1 data and src/lib/systemCalc.js.

Scope:
- A2: a plan view of the venue with SPL estimates from point sources with nominal dispersion
  (inverse square, air absorption per band) for fills, delays and small systems. Labelled
  "estimate, not a simulation"; line arrays shown only as aim lines and splays.
- A3:
  - attach prediction files (EASE, ArrayCalc, Soundvision) and measurement files (Smaart/SysTune,
    EQ) to the gig's system, versioned, with notes;
  - a "system tuning sheet" print: delays, EQ, gains and splays as built.

Connect: gig files, sound system calculator.

Done when: unit tests for the SPL maths; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S18 · Step 21b, part 1: A4 3D venue

```
Build ROADMAP step 21b, A4 part 1: the 3D venue. Read docs/TOOLS_PLAN.md §6 "Our own simulator"
(levels L0–L3, A4) and how RG1, RG3 and A2 were built.

Scope:
- A simple 3D venue: audience planes and walls, drawn in AVX or traced over an imported plan.
- The rigging points from RG and the arrays from RG3 placed in it.
- Saved per gig.
- No sound computation yet.

Ask me before building: is a 3D library (e.g. three.js) acceptable as a new dependency? Propose it
and wait for my yes.

Connect: rigging plot (points), arrays, A2 map (same venue).

Done when: unit tests for the geometry; works on a laptop and is viewable on a phone; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S19 · Step 21b, part 2: A4 direct-field engine (L1)

```
Build ROADMAP step 21b, A4 part 2: the L1 direct-field engine. Read docs/TOOLS_PLAN.md §6 (L1, what
makes it hard) and how the 3D venue was built.

Scope:
- A coherent direct-field engine in a background worker (bands 63 Hz–16 kHz): each element
  modelled from its physical size, added with distance, delay and level.
- SPL and frequency-response maps on the audience planes; sub arrays and cardioid subs.
- Every result labelled L1 (±3–6 dB, worst at high frequencies), with what it ignores.

Done when:
- unit tests against analytic cases (a single piston, two sources' interference);
- a short validation note comparing a known system with a manufacturer's tool, published with the
  results;
- PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S20 · Step 21b, part 3: A5 measured directivity (L2)

```
Build ROADMAP step 21b, A5: measured directivity. Read docs/TOOLS_PLAN.md §6 (L2, GLL is closed)
and how the L1 engine was built.

Ask me first: which manufacturers publish directivity data in an open format or would give
permission, and whether I've asked any.

Scope:
- Import open directivity data (balloons per 1/3 octave, ideally with phase) per cabinet where
  allowed; the engine uses it.
- A validation report against reference systems; results labelled L2.

Done when: unit tests for the import and interpolation; validation report in docs; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S20b · Step 21b, part 4: A6 room estimate (L3)

```
Build ROADMAP step 21b, A6: the room estimate. Read docs/TOOLS_PLAN.md §6 (L3).

Scope:
- Surface materials on the 3D venue.
- RT60 (Sabine and Eyring), critical distance and an STI estimate per area, shown as a room summary
  beside the direct-field map.
- Labelled as a statistical estimate. Never ray tracing.

Done when: unit tests against textbook examples; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S21 · Step 22: shareable rider / advance page

```
Build ROADMAP step 22: the shareable rider / advance page. Read docs/BUSINESS.md "Planned → 22",
docs/FIELD_TOOLS.md, and how quote links work (token hashing, supabase/functions/quote-public).

Scope:
- A public, read-only, printable link per gig: a random token (only its hash stored), expiry,
  revocable.
- It shows what the PM chooses: stage plot, input list, patch, power and rigging summaries,
  schedule, contacts.
- From StageKit:
  - start the input list, mixes and stage plot from the line-up (band members and their
    instruments);
  - a readiness check before sending (missing inputs, no power plan, unsigned rigging…).

Connect: field tools, power and rigging reports, gig files, messaging (send the link).

Done when: database or function tests (expired and revoked links show nothing); security review of
the public endpoint; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S22 · Step 22b: venue pages (only if D14 is yes)

```
Build ROADMAP step 22b: venue pages. Check docs/PENDING.md D14 first: if I haven't said yes, stop
and ask me. Read docs/TOOLS_PLAN.md "Proposed, to confirm".

Ask me before building:
- private to each organisation, or shared between organisations (then: who may edit, and how
  wrong data gets corrected)?

Scope:
- One page per venue: stage size, capacity, installed equipment, rigging points and limits, power
  supply, documents, contacts by role, access hours, photos.
- A gig at the venue fills its address, call sheet, power supply (P1) and rigging points (RG1)
  from it.

Connect: gigs, call sheet, power tool, rigging tool, rider page.

Done when: database tests for the chosen sharing model; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## K11 · Sustainability report (only if D28 is yes)

```
Build ROADMAP step K11: the sustainability report. Check docs/PENDING.md D28 first: if I haven't
said yes, stop and ask me. Read the ROADMAP row, docs/ANALYTICS.md ("K11"), and how time
registration (km), P1 power and vehicles and trips were built (docs/BUSINESS.md 8 and 23,
docs/TOOLS_PLAN.md §4).

Scope (Reports → Sustainability, and per gig):
- Transport: km per trip and vehicle (with its fuel type), crew travel km, tonne-km of gear moved.
- Energy: the power plan's estimated kWh per gig, from the grid or a generator.
- Estimated emissions from a named, dated set of published emission factors (stored with their
  source and version, editable per vehicle), per gig and per period.
- A per-gig summary for clients and festivals (printable), labelled as an estimate with its method.

Ask me before building: which emission-factor source (e.g. Portugal's APA, the EU's EEA or the UK's
DESNZ factors); whether clients have asked for it, and in what format.

Connect: trips, power plan, gig files, Reports.

Done when: unit tests against the source's worked examples; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S24 · Step 24: reports (covered by the K steps)

```
Step 24 is covered by the dashboards and analytics pack: K1–K8 (docs/ANALYTICS.md) and step 23's
vehicle-use report. There is nothing to build here: if one of its reports is still missing, add it
to the K step it belongs to.
```

## S25 · Step 25: gig templates

```
Build ROADMAP step 25: gig templates. Read docs/BUSINESS.md "Planned → 25" and the "How … works"
sections of everything a gig holds (tasks, statuses, custom fields, field tools, equipment).

Scope:
- Save a gig as a template, or start a new gig from one.
- What a template holds:
  - schedule (relative days and times), positions, equipment, tool data (plots, patches);
  - tasks, custom fields, status and type.
- Dates shift to the new gig's start.

Connect: every gig feature listed; the new-gig form.

Done when: unit tests for date shifting; database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S26 · Step 26: client portal, online booking requests

```
Build ROADMAP step 26: the client portal and online booking requests. Read docs/BUSINESS.md
"Planned → 26", how quote links and guest threads work (docs/QUOTES.md, docs/MESSAGING.md M4b),
and how invoices were built.

Scope:
- Portal: one link per client (token) with their quotes, invoices, shared documents and
  conversations.
- Booking requests: a public form per organisation for dry hire. The visitor picks catalogue items
  and dates and sees indicative availability; sending creates a draft quote and a notification.
  Spam protection.

Ask me before building: which items may be offered publicly, and should prices show?

Connect: quotes, invoices, guest threads, availability, contacts, the client's balance (K3).

Done when: security review of both public surfaces; database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S27 · Step 26b: M5b email replies

```
Build ROADMAP step 26b: M5b, email replies. Read docs/MESSAGING.md (M5b, M4b) and docs/EMAIL.md.

Ask me first: inbound email needs a receiving address on my domain (Brevo inbound parsing or
another service); have I set it up?

Scope:
- Reply by email to the summary and land in the conversation.
- Email clients and suppliers when someone answers them, with a reply-to that threads back.

Connect: email summary, guest threads, notifications.

Done when: the inbound function checks signatures and rate-limits; tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S28 · Step 27: freelancer side

```
Build ROADMAP step 27: contracts, freelancer invoicing and work history. Read docs/BUSINESS.md
"Planned → 27", docs/CREW_NETWORK.md, and how crew calls, time registration and e-signature were
built.

Scope:
- Contracts generated from an accepted crew call or job offer (dates, fee, terms), signed by both
  (step 16).
- Freelancer invoicing: a monthly summary of approved hours and fees per company, for issuing a
  "recibo verde" on the AT portal (AVX never issues it).
- Work history on crew profiles: gigs done on AVX, shown only with the company's permission.
- Freelancer invoicing and the work-history counts reuse K8's monthly summary (docs/ANALYTICS.md
  "How K8 works").

Ask me before building: a Portuguese "prestação de serviços" template to start from, and whether
a lawyer should review it.

Connect: crew calls, job board, crew profiles, time registration.

Done when: database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S29 · Step 28: public API and webhooks

```
Build ROADMAP step 28: the public API and webhooks. Read docs/BUSINESS.md "Planned → 28",
docs/SECURITY_REVIEW.md and the edge functions' permission pattern (CLAUDE.md Database).

Scope:
- API tokens per organisation with scopes (hashed, revocable, last used).
- Read endpoints: gigs, schedule, crew, equipment. Write: availability.
- Webhooks on gig, quote and crew changes, with signed payloads and retries.
- Rate limits and an audit log.
- Public documentation of the API.

Ask me before building: the first integration I want (accounting sync, payroll export, the
cueing app, an MCP server)? It decides which endpoints come first. Should the report functions
(K1–K8) get read-only endpoints?

Connect: settings (token management), the data map (who receives data), the security review.

Done when: tests for scopes and rate limits; a security review section added; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S30 · Step 29: R3 cueing-app bridge

```
Build ROADMAP step 29: R3. Read docs/TOOLS_PLAN.md §2 (R3, Decided Q2), "How R1 works" and the
public API from step 28.

Scope:
- Cue labels from a cue list.
- The JSON export/import shared with the standalone cueing app (format avx-rehearsal, version
  bump).
- Markers export for editing and DAW tools.
- The live link through the API ("Sign in with AVX").

Ask me before building: the cueing app's current state and what it needs first.

Connect: rehearsal companion, tasks, API.

Done when: unit tests for the formats; PR open; the cueing app's own roadmap started in a doc if I
ask.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S31 · Step 30: rental network, RFID

```
Build ROADMAP step 30: the rental network between AVX companies. Read docs/BUSINESS.md
"Planned → 30" and docs/INVENTORY.md I6 (cross-hire codes).

Scope:
- Companies that opt in see each other's available stock (prices only if shared).
- A subrental request in two clicks.
- RFID only if I have a hardware partner; otherwise leave it planned.

Ask me before building: opt-in per item or per category; who sees what.

Connect: subrentals, availability, crew network trust (verified companies only?).

Done when: database tests for visibility; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

---

## Upkeep sessions (any time, small)

### U4 · Truss tables

```
Upkeep U4: truss tables (docs/PENDING.md D12, D13; docs/TRUSS_DATA.md).

Ask me for:
- which tables I have checked against their source documents, and what differed;
- any replies from Fantek or Global Truss.

Scope:
- Mark the checked tables as checked (my name, the date).
- Correct or unblock tables from the manufacturers' answers.
- Rebuild with scripts/truss-data/ so the data stays reproducible.

Done when: src/lib/trussTables.test.js passes; TRUSS_DATA.md and PENDING.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

---

## QA bot (any time, in order)

Plan and setup steps: [QA.md](QA.md). Each prompt tells you which setup to do first.

### QA1 · Foundations

```
QA bot step QA1: foundations (docs/QA.md, "Fixed tests on every PR" and "QA accounts and the QA
tag"; my setup is "Setup A"). Read docs/QA.md and docs/TESTING.md.

Scope:
- e2e/helpers/app.js: move the shared helpers out of e2e/auth/journey.spec.js (sign up, sign in,
  English, accessibility check, delete account); add an init script that sends the "do not track"
  signal src/lib/usage.js respects.
- e2e/helpers/inbox.js (Mailosaur API with fetch: new address, wait for an email, return its links
  without printing them) and e2e/helpers/totp.js (two-step codes with Node's crypto).
- scripts/qa/seed.mjs and scripts/qa/cleanup.mjs on the test project: the QA admin and QA crew
  accounts, a fresh "AVX QA run <id>" company with realistic data, removal through the app; cleanup
  also clears old e2e-… leftovers (PENDING F8, D21).
- scripts/qa/run-sql-tests.sh and a sql-tests job in .github/workflows/ci.yml (psql 17 as in
  backup.yml, refuse production, on when SQL_TESTS_ENABLED is 'true', environment test-project).
- .github/pull_request_template.md with a "How to test" section; one line in CLAUDE.md step 5 to fill
  it.

Ask me before building: confirm Mailosaur as a new outside service; check Setup A is done and tell
me exactly what's missing.

Done when: the inbox helper receives a password-reset email from the test project; sql-tests runs
all 57 files (list any that fail because their migration isn't on test); npm run check and the
signed-in tests pass; TESTING.md and QA.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### QA2 · Live checks and the QA tag

```
QA bot step QA2: live checks after each merge, a daily real sign-up, and the QA tag (docs/QA.md,
"Live checks after merge and daily" and "QA accounts and the QA tag"; my setup is "Setup B").

Scope:
- The QA tag migration and supabase/tests/qa_accounts.sql, as outlined in QA.md; docs/USAGE.md
  queries use the new summary views.
- vite.config.js writes version.json (version and commit); vercel.json marks it no-cache.
- The read-only per-role check is already built (LC1, 0.83.1: e2e/live/, playwright.live.config.js,
  .github/workflows/live-check.yml, started by hand; docs/TESTING.md, "Live check"). Extend those
  files; don't add a LIVE=1 mode to playwright.config.js.
- e2e/live/after-deploy.spec.js and e2e/live/daily-signup.spec.js, next to LC1's specs.
- .github/workflows/live-check.yml (LC1's workflow): add push to main (wait for the merged commit)
  and daily; environment live-check; on failure one PR comment and one qa-bot + needs-triage issue
  per failing check.
- A step-by-step guide for me to create the live QA account.

Ask me before building: the migration outline; then walk me through Setup B at the right moments.

Done when: qa_accounts.sql passes on test; a manual live-check run and a manual daily run pass;
private.platform_summary shows the same numbers as before and private.qa_summary only the live QA
account; QA.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### QA3 · The AI tester

```
QA bot step QA3: the AI tester on each PR before merge (docs/QA.md, "AI tester before merge" and
"Safety"; my setup is "Setup C").

Scope:
- .claude/skills/qa/SKILL.md (the rules), qa/areas.md (files → areas → connected areas, routes,
  tests, T-lines), qa/mcp.json (two browsers, admin and crew).
- scripts/qa/context.mjs, scripts/qa/sign-in.mjs, scripts/qa/inbox.mjs.
- .github/workflows/qa-agent.yml: ready PRs and the qa label; the agent job read-only; a separate job
  posts one PR comment; security findings only in an encrypted artifact. Model and turn cap from
  repo variables, never in code.

Ask me before building: yes to anthropics/claude-code-action@v1 and @playwright/mcp (pinned); check
Setup C.

Done when: on a scratch PR with two planted bugs the bot reports both with steps, a clean PR passes,
`/qa` works in a session; time and cost per run written in QA.md; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### QA4 · Catch-up (repeat)

```
QA bot step QA4: catch-up. Take the next area without browser tests, in this order: inventory and
scanning, messaging, crew network, tasks and business, field tools, import (docs/QA.md, "Build
order"; skip areas QA.md marks done).

Scope: run /qa over that area's lines in docs/PENDING.md section 2 on the test project; commit the
checks it confirms as fixed tests in e2e/auth/<area>.spec.js; list what it found; mark the area done
in QA.md. Scanning can use a fake camera feed showing a QR label. Import: only after the import
overhaul's IM2 is merged, and only what IM1–IM2's own browser tests don't cover.

Done when: the new tests pass twice in CI; problems found are listed in the PR; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

---

## End of the build (after S31 and the final test pass)

### P1 · Decisions

```
End of build P1: decisions for the public launch. Read docs/PUBLIC_SITE.md.

Don't build anything. Walk me through the decisions one by one, with a recommendation each:
- tiers and prices;
- per company, per seat or by usage;
- trial length;
- billing and certified invoicing provider;
- domain;
- site technology.
Write the answers into PUBLIC_SITE.md and prompts P2–P5 here.
Finish with the short summary CLAUDE.md asks for.
```

### P2 · Commercial site

```
End of build P2: the commercial site (docs/PUBLIC_SITE.md §2, decisions from P1). A separate
static site in PT and EN with home, features, for crew, switching, pricing, security and privacy,
FAQ, contact/demo form. Propose the structure and technology from P1 and wait for my yes before
creating anything. PR open, never deployed without my yes.
Finish with the short summary CLAUDE.md asks for.
```

### P3 · Plans in the app

```
End of build P3: plans in the app (docs/PUBLIC_SITE.md §4). Plan limits per organisation in the
database, a trial on organisation creation, what's included shown in the app, upgrade screens.
Crew stay free. Outline the migration and wait for my yes. PR open.
Finish with the short summary CLAUDE.md asks for.
```

### P4 · Billing

```
End of build P4: billing (docs/PUBLIC_SITE.md §4). The payment provider and certified invoicing
from P1:
- customer portal;
- upgrades and downgrades;
- failed payments: reminders, a grace period, then read-only, never deletion;
- cancellation with data export.
List the secrets I must add; never ask me to paste keys. PR open.
Finish with the short summary CLAUDE.md asks for.
```

### P5 · Public docs and help

```
End of build P5: public docs and help (docs/PUBLIC_SITE.md §1). A public docs site and FAQ built
from the in-app guides (src/help), one source for every answer. An AI help assistant that answers
only from the docs, cites the guide, says when it doesn't know and offers a contact form. Ask me
which AI provider and budget before building. PR open.
Finish with the short summary CLAUDE.md asks for.
```

---

## After launch

Planned in [ANALYTICS.md](ANALYTICS.md) ("After the launch"), not scheduled: run these once the
public launch has settled.

### K12 · Crew: all income

```
After the launch, step K12: crew, all income. Read the ROADMAP row, docs/ANALYTICS.md ("K12",
"How K8 works") and ask me what freelancers asked for during the beta.

Scope:
- Work outside AVX, private to the person: company, dates, fee, km, notes; counted in My numbers
  and the year statement, marked as typed by them.
- The person's own business costs (fuel, gear, training, insurance) with receipts, reusing the
  expense receipt handling (9b) in a personal space.
- Totals and the year statement covering everything; a mileage log export; amounts kept in the
  currency they were earned in, never added across currencies.
- Labelled as a summary, not tax advice.

Ask me before building: what beta freelancers asked for; any tax-office format worth matching.

Connect: My numbers (K8), year statement, freelancer invoicing (step 27).

Done when: database tests (nobody but the person sees any of it); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

### K13 · Crew-owned gear for hire

```
After the launch, step K13: crew-owned gear for hire. Read the ROADMAP row, docs/ANALYTICS.md
("K13"), docs/INVENTORY.md I6 (cross-hire codes, hire requests) and docs/CREW_NETWORK.md.

Approach to confirm with me first: a freelancer who owns gear runs it as a one-person
organisation (already possible today), so the catalogue, units, availability, QR labels,
cross-hire code and hire requests work unchanged, and companies hire it as a subrental.

Scope:
- A short "I own gear" setup from the crew profile: creates or picks the person's own
  organisation and links it to the profile.
- "Gear and operator" in crew calls and job posts: a call can carry a hire request for the
  person's gear.
- Optional: gear for hire shown on the crew profile and in Find crew.
- The hire income appears in the person's numbers (K8) next to their fees.

Ask me before building: show gear on profiles and in Find crew?; who sees hire prices; damage terms
(repairs charged to the hirer, step 12).

Connect: crew profile, Find crew, crew calls, job board, subrentals, My numbers, rental network
(step 30).

Done when: database tests (a company sees only what the owner shares; prices only when shared);
help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

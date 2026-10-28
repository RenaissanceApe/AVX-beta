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

**When a step's plan changes** (a new decision, a question answered), edit its prompt here and its
plan in the doc it names, in the same commit.

Steps 1–7 (0.54–0.63) are built. Sessions S01–S31 are the build order; U1–U4 are small upkeep
sessions to run in any gap; P1–P5 close the build.

---

## S01 · Step 7b: crew-rate follow-ups

```
Build ROADMAP step 7b: crew-rate follow-ups. Read the ROADMAP row, docs/BUSINESS.md
"How crew rates work" and "Planned → 7b", then src/lib/crewRates.js,
src/components/gig/CrewCalls.jsx, src/components/jobs/PostJobModal.jsx and the quote editor's crew lines.

Scope:
- Crew calls: when a manager creates a crew call for a function, offer the fee the rate card
  suggests (day rate × the gig's days, weekend factor), editable, shown to the people called.
  Accepting a call that has a fee creates that person's gig_crew_fees row (unit, rate, quantity).
- Job posts: prefill pay (pay_mode, pay_amount, pay_per) from the rate card for the chosen function;
  still editable.
- Quotes: for crew lines, show the rate-card cost next to the selling price and the crew margin
  per line and in the totals, for admins and members only; never on the client's print, PDF or
  online quote.

Already decided: rates are seen only by organisation admins and members; crew never see others'
fees; euros before VAT.

Ask me before building: should crew called see the fee before accepting (my default: yes, theirs
only)?

Connect: crew calls, job board, quote editor, labour cost panel (an accepted call's fee shows as
"agreed").

Done when: the above works in EN and PT at 320 and 390 px, unit tests cover the new helpers, the
crew-call fee is tested in supabase/tests if the database changes, and the PR is open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S02 · Step 8: time registration

```
Build ROADMAP step 8: time registration. Read the ROADMAP row, docs/BUSINESS.md "Planned → 8" and
"How crew rates work", then src/lib/crewRates.js, src/components/gig/LabourCost.jsx,
src/components/gig/CrewTab.jsx, the gig schedule code and the calendar feed function
(supabase/functions/calendar-feed).

Scope (spec in BUSINESS.md):
- Each person on a gig logs hours per day: start, end, break, optional travel time and km,
  prefilled from their booking or the gig's schedule. Works offline (queue and send later, like
  rehearsal notes).
- Overtime past overtime_after_hours, weekend, night and holiday hours, using crew_rate_factors.
- The gig's managers approve or send back with a note; approved hours lock; notifications both ways.
- Actual labour cost = approved hours × the agreed fee or rate (fixed fees ignore hours), shown next
  to the planned cost in the labour panel.
- Views: my hours (My work), the gig's hours (Crew tab), an organisation view per person and month;
  CSV; a new file in the organisation export (wrap private.export_org_part_unchecked as
  20261203000001_export_crew_rates.sql does).

Ask me before building: which hours count as night; whether public holidays come from a built-in
Portuguese list or the organisation types its own; whether travel time is paid at the same rate.

Connect: labour cost panel (actual vs planned), My work, calendar feed (show logged hours?),
organisation export, On-site mode (a quick "clock in / clock out" on gig days).

Done when: database tests cover who can write, approve and read (crew never see others' hours or
money); unit tests for the hour and factor maths (overtime across midnight, weekend, holiday);
help guide with screenshots; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S03 · Step 9: leave requests

```
Build ROADMAP step 9: leave requests. Read the ROADMAP row, docs/BUSINESS.md "Planned → 9", and how
crew_unavailability is used today (grep it in src/ and supabase/migrations/, and
docs/RESERVATIONS.md for clashes).

Scope:
- Types for unavailable dates (holiday, sick, training, other).
- For an organisation's staff (admins and members): a leave request that an admin approves or
  refuses, with notifications; freelancers keep marking dates without approval.
- Holiday balances per staff member per year.
- An organisation calendar of who is away.
- Approved leave blocks the person like unavailability does: clashes, Find crew "free", the network
  picker ⚠, and no hours can be logged on leave days (step 8).

Ask me before building: whole days only or half days too; holiday allowance per year (one number
per organisation, or per person); carry-over to the next year; can a sick day be entered after
the fact without approval?

Connect: clashes, Find crew, network picker, time registration, calendar feed, organisation export.

Done when: database tests cover who requests, approves and sees (other companies see only "busy");
help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S04 · Step 10: gig finance overview

```
Build ROADMAP step 10: gig finance overview. Read the ROADMAP row, docs/BUSINESS.md "Planned → 10"
and "How crew rates work", docs/QUOTES.md (totals), and the subrental and repair tables
(docs/INVENTORY.md I5–I6).

Scope:
- A finance panel per gig for organisation admins and members:
  - revenue: the accepted quote, net;
  - labour: planned (step 7) and actual (step 8, approved hours);
  - subrentals: confirmed ones;
  - repairs charged to the gig;
  - other costs typed in (new table: description, amount, category, optional receipt photo in a
    private bucket).
- Margin in money and %, with estimated parts marked.
- An organisation list of gigs with revenue, cost and margin; filters (period, status, type,
  client); CSV and an export file.

Ask me before building: the categories for other costs; should members (not only admins) see
margins?

Connect: dashboard (a margin hint on gig cards for admins?), reports (step 24 will reuse the
query), organisation export.

Done when: database tests for who sees money; unit tests for the totals; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S05 · Step 11: invoices

```
Build ROADMAP step 11: invoices. Read the ROADMAP row, docs/BUSINESS.md "Planned → 11",
docs/QUOTES.md, src/lib/quotes.js and the contacts page.

Important: in Portugal legal invoices must come from certified software (AT). AVX prepares the
invoice and hands it to a certified program; it never issues a legal invoice itself.

Ask me first, before any design:
1. Which certified program do I use (InvoiceXpress, Moloni, Vendus, TOConline, other)?
2. Start with a file export that any program can import, or that program's API?

Scope:
- VAT per line on quotes (today one rate per quote), with old quotes migrated to their single rate.
- An invoice draft from an accepted quote: all of it, chosen phases, or a deposit %. Client from
  contacts.
- Status: draft → sent to the certified program → issued (store its number and a link to the PDF)
  → paid / overdue.
- Credit notes against an issued invoice. Overdue reminders (notification, optional email through
  Brevo).
- Invoices in the organisation export.

Connect: quotes (invoiced amount on the quote), contacts, client guest threads, gig finance
(step 10: invoiced vs paid).

Done when: database tests (only admins and members, numbering can't be edited by hand); unit
tests for VAT per line and deposit maths; help guide; PR open. If the API route is chosen, list
the secrets I must add and never ask me to paste keys.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S06 · Step 12: damage charged to the client, payments

```
Build ROADMAP step 12: repairs charged to the client and payments. Read the ROADMAP row,
docs/BUSINESS.md "Planned → 12" and the invoices section written by step 11.

Scope:
- Repairs with charge_client become lines to add to the gig's next invoice draft (once).
- Record payments against invoices (date, amount, method, note); partial payments; the invoice
  turns paid when covered.
- Optionally a payment link on invoices.

Ask me before building: payment links now or later; if now, which provider (Stripe, or Portuguese
methods first: MB Way and Multibanco references through easypay or ifthenpay)?

Connect: repairs, invoices, gig finance, client portal later (step 26).

Done when: database tests; help guide; PR open; any provider secret listed for me to add.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S07 · Step 13: A1 speaker library

```
Build ROADMAP step 13: A1, the speaker library. Read the ROADMAP row, docs/TOOLS_PLAN.md §6 (A1),
docs/FIELD_TOOLS.md (F4), src/lib/systemCalc.js and src/components/tools/SystemCalcTool.jsx, and
the catalogue item fields (docs/INVENTORY.md I1).

Scope:
- Catalogue items get speaker specs: sensitivity, max SPL, nominal dispersion H×V, frequency
  range, impedance, weight, amplifier channels per cabinet, power draw.
- Rigging data for RG3: centre of gravity, pickup points, the manufacturer's bumper/frame limits.
- Presets for common models, typed from the manufacturers' datasheets with the source noted.
- Import presets in the import wizard.

Already decided: data only from manufacturers' datasheets; never derived.

Ask me before building: which brands and models to preset first (the ones I own or rent most)?

Connect: the F4 sound system calculator uses the specs (sensitivity, max SPL, dispersion) instead
of typed numbers; later P1 (power) and RG3 (arrays) read the same fields.

Done when: unit tests; help hints on the new fields; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S08 · Step 14: MVR/GDTF import and MVR export

```
Build ROADMAP step 14: MVR and GDTF for the light plot and DMX patch. Read the ROADMAP row,
docs/FIELD_TOOLS.md (F2 DMX patch, F3 light plot), src/lib/lightPlot.js and the import wizard
(docs/SWITCHING.md).

Scope:
- Import an MVR file (Vectorworks, grandMA, Capture…): fixtures with type, mode, footprint,
  position and DMX address into the gig's light plot and DMX patch, matched to catalogue items
  where possible (ask the user to match the rest).
- GDTF fixture types: weight, power, modes and footprints into the catalogue item.
- Export the gig's light plot and patch as MVR.
- Parse in the browser (fflate is already a dependency); no new package without my yes.

Ask me before building: which programs do I or my clients use, and can I share a sample MVR file
to test with?

Connect: catalogue (weights and power for P1 and RG1), light plot, DMX patch, gig equipment.

Done when: unit tests with a small sample MVR/GDTF; the round trip (import → export → import) keeps
fixtures and addresses; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S09 · Step 15a: P1 power distribution

```
Build ROADMAP step 15, first part: P1 power distribution. Read the ROADMAP row and
docs/TOOLS_PLAN.md §4 (P1, and the LumiStage comparison), then src/lib/lightPlot.js (power
estimate today), and the speaker specs from A1 and the fixture data from step 14.

Scope (TOOLS_PLAN §4 P1):
- Electrical fields on catalogue items (watts max and typical, power factor, inrush, connectors;
  for distros: inputs and outputs with connector, phase, breaker, RCD), also in import presets.
- A power tool on the gig:
  - the supply (generator or venue: voltage, phases, amps per phase), distros and outputs;
  - loads assigned from the light plot, DMX patch, sound system and the gig's equipment;
  - current per phase and per output, neutral current, breaker headroom (warn at 80 %), phase
    balance;
  - a generator size suggestion with a margin;
  - a printable report labelled as an estimate for a qualified electrician.

Ask me before building: supply defaults for Portugal (230/400 V, 50 Hz), and which connectors
and distros I own.

Connect: light plot power estimate (now from the tool), gig files (the report), On-site mode
(read-only view).

Done when: unit tests for the electrical maths (single and three phase, unbalanced neutral); help
guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S10 · Step 15b: P2 cables

```
Build ROADMAP step 15, second part: P2 cables. Read docs/TOOLS_PLAN.md §4 (P2) and how P1 was
built (its "How … works" section).

Scope:
- Cable runs between distros and loads: length, cross-section, type, how it's laid.
- Voltage drop (warn above 3–5 %) and current capacity.
- A cable list (power, DMX, speaker, signal) added to the gig's equipment.
- An automatic phase-balancing suggestion.
- Inrush groups that flag where many fixtures power on at once.

Ask me before building: the cable types and lengths I stock (so the list maps to catalogue items).

Connect: gig equipment and packing list, power report.

Done when: unit tests for voltage drop and capacity; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S11 · Step 16: e-signature

```
Build ROADMAP step 16: e-signature. Read the ROADMAP row and docs/BUSINESS.md "Planned → 16", then
how quotes are accepted today (quote-public function, docs/QUOTES.md) and the warehouse packing
list (docs/INVENTORY.md I3).

Scope:
- A signature pad (finger or mouse), stored privately as an image with signer name, time and the
  SHA-256 of the document signed.
- A signed PDF kept with the record.
- Used for:
  - quote acceptance (optional drawn signature next to the typed name);
  - delivery notes / packing slips on site (the client signs on the phone);
  - later crew contracts (step 27) and the rigger's sign-off (RG4).
- A plain electronic signature, not qualified; the terms will say so.

Ask me before building: is a drawn signature enough for my clients, or do some need a qualified
signature (Chave Móvel Digital / Cartão de Cidadão)? If so, that becomes a later integration.

Connect: quotes, packing lists, gig files (signed PDFs), privacy notice and data map (signatures
are personal data).

Done when: database tests; signatures can't be changed after signing; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S12 · Step 17a: RG1 weights, points and hoists

```
Build ROADMAP step 17, first part: RG1. Read the ROADMAP row, docs/TOOLS_PLAN.md §5 ("What it
must respect", RG1, "Prompting from other tools", Decided Q3 and Q4), src/lib/lightPlot.js
(weights per position) and docs/PENDING.md D15 (hoist brand).

Scope:
- A rigging tool on the gig:
  - truss lines with their load: fixtures from the light plot, truss self-weight, cable allowance
    per metre, motors, accessories, a dynamic/safety allowance;
  - hang points along each line;
  - reactions per hoist for a continuous beam on 2+ supports, with uneven loads and cantilevers (a
    small structural solver, unit tested against hand calculations);
  - a hoist WLL check by class (D8, D8+, C1), including whether the class may hang over people.
- Hoist models: the 0.5, 1 and 2 t models of the brand I confirm in D15, from the manufacturer's
  data sheets with the source noted; anyone can add another from its data plate.
- Every result labelled as an aid that a competent rigger must check.

Already decided: WLL only as the manufacturer states it, never derived; sign-off comes in RG4.

Ask me before building: D15 if still open; the default cable allowance and dynamic factor.

Connect: light plot ("Rigging: not checked" on positions with weights, coloured when overloaded),
Tools tab suggestion when hoists are on the gig.

Done when: solver unit tests (simply supported, continuous, cantilever, point and distributed
loads); help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

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

## S14 · Step 18: RG3 line arrays

```
Build ROADMAP step 18: RG3 line arrays. Read docs/TOOLS_PLAN.md §5 (RG3), the A1 speaker data
(rigging fields), src/lib/systemCalc.js (F4) and how RG1 was built.

Scope:
- An array as a number of elements with splay angles (from the system calculator).
- Outputs:
  - total weight;
  - front and rear point loads and pull-back;
  - bumper position and tilt;
  - pass/fail against the manufacturer's bumper limits;
  - a side-view drawing.
- The limits always come from the manufacturer's data; where a manufacturer's own tool exists, the
  report says that tool decides.

Ask me before building: which arrays to support first (the models from A1).

Connect: sound system calculator, RG1 points (the array hangs from them), gig equipment.

Done when: unit tests against a manufacturer's published example; help guide; PR open.
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

Connect: gig files (the report), On-site mode (read-only plot), job board prefill, the terms
(disclaimer wording to review).

Done when: database tests for sign-off (who can sign, can't edit after); help guide; PR open.
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
  - a one-line diagram of the power tree;
  - views per area and per department;
  - an on-site checklist of what plugs into what, ticked off on the phone, offline.

Connect: On-site mode (both checklists), rigging and power reports.

Done when: unit tests (every suggestion passes the same checks); help guide; PR open.
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

## S23 · Step 23: vehicles and transport, appointments

```
Build ROADMAP step 23: vehicles, transport and appointments. Read docs/BUSINESS.md "Planned → 23"
and docs/RESERVATIONS.md (the reservations engine was built for this).

Scope:
- Vehicles as bookable resources: plate, capacity (kg, m³), licence needed.
- Trips on a gig: out and back, vehicle, driver, times.
- The packing list split per vehicle, with weight against capacity.
- Clashes when a vehicle or driver is double-booked.
- Appointments: non-gig calendar items (site visit, meeting, warehouse day) with people, shown in
  calendars, clashes and the calendar feed.

Ask me before building: my vehicles and whether drivers need a licence category check.

Connect: packing lists, scanning out per vehicle, calendars, calendar feed, time registration
(driving hours).

Done when: database tests; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
```

## S24 · Step 24: reports

```
Build ROADMAP step 24: reports. Read docs/BUSINESS.md "Planned → 24", docs/INVENTORY.md I7 (the
equipment reports already built) and the gig finance query from step 10.

Scope:
- Organisation reports:
  - crew days and hours per person;
  - gigs and revenue per client;
  - quote win rate;
  - margin per gig type and period;
  - vehicle use.
- Each report is a table with filters and CSV.
- A small dashboard of the key numbers.
- Reuse I7 for equipment.

Ask me before building: which five numbers I want to see first.

Connect: dashboard, organisation export.

Done when: unit tests for the aggregations; help guide; PR open.
Stop after this step; don't start the next one.
Finish with the short summary CLAUDE.md asks for.
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

Connect: quotes, invoices, guest threads, availability, contacts.

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
cueing app, an MCP server)? It decides which endpoints come first.

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

### U1 · Organisation time zone

```
Upkeep U1: an organisation time zone (docs/PENDING.md D10). Today everything is read as Lisbon
time. Grep for 'Europe/Lisbon' and time_zone in src/ and supabase/.

Scope:
- Make organisations.time_zone a real setting in organisation settings.
- Use it everywhere gig days, bookings, clashes, the calendar feed, the email summary and
  reminders are computed.
- Keep Lisbon as the default.

Ask me before building: confirm the migration outline.

Done when: unit and database tests with a non-Lisbon organisation (e.g. Europe/London,
America/New_York); PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### U2 · Dependency upgrades

```
Upkeep U2: upgrade React Router 6 → 7 and Vite and Vitest to current versions
(docs/SECURITY_REVIEW.md, A06). Propose the exact versions and wait for my yes.

Scope:
- Follow each project's migration guide.
- Change only what the upgrade needs.
- Run npm audit before and after.

Done when: npm run check and the e2e tests pass; npm audit shows no advisories in shipped
packages; SECURITY_REVIEW.md updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

### U3 · Data map open items

```
Upkeep U3: the open items in docs/DATA_MAP.md.

Scope:
- A nightly clean-up that keeps crew_search_log for 30 days and read notifications for 12 months.
  Deletion runs from a hand-run or scheduled function, never through the connector (CLAUDE.md).
- A time limit or reminder for held invitations that were never sent.
- Update DATA_MAP.md and the privacy notice.

Ask me before building: the retention periods, and approve the migration outline. Rewriting the
privacy notice needs my yes too.

Done when: tests; DATA_MAP.md open items updated; PR open.
Stop after this step.
Finish with the short summary CLAUDE.md asks for.
```

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

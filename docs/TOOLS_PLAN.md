# New tools: plan (2026-10-26)

The next tools after the built field tools (F1–F4: stage plot, input list, patch, DMX patch, light
plot, sound system calculator). Asked for on 2026-10-26: a **rehearsal companion**, a **rigging and
load calculator**, an **electrical load** tool, **sound system calibration / acoustic simulation**,
and a **DMX calculator with dipswitch converter**; plus the question of where prep tools and
show-time tools should live.

Everything here is a plan. Answers given on 2026-10-26 are under **Decided** below; questions
still open are marked **Q**.

## Decided (2026-10-26)

- **On-site mode (Q1):** both. A manual switch on the gig, and an automatic switch on the person's
  gig days, **on by default**. The automatic part is a personal setting (Settings → Language and
  appearance: "Switch to On-site mode on gig days"). The first time it switches on its own, a note
  says why and links to that setting, so everyone knows it can be turned off.
- **Cueing app (Q2):** a standalone app with its own roadmap (a future build). It connects to AVX
  through an integration rather than sharing AVX's code or database: "Sign in with AVX", the public
  API and webhooks (COMPETITOR_RESEARCH #17), and the rehearsal export format (R3). Until the API
  exists, the two exchange files. Its own roadmap is written when that build starts.
- **Rigger sign-off (Q4):** recommended, never forced:
  - Every rigging report has a "Checked by" step: a named rigger, their certificate (from their
    crew profile, if they have one) and the date.
  - Until it is signed, the plot and the report carry a visible warning.
  - If the organisation has no rigger to check it, AVX suggests posting a job on the job board for
    a certified rigger, with the dates, the function and the certificate already filled in.
  - If every warning and suggestion is dismissed, the report and the on-site view show a
    disclaimer: AVX accepts no liability for a rig built without a certified rigger's sign-off.
    The wording goes into the terms of service too, and should be checked by a lawyer before
    launch.
- **Order (Q6):** no preferred order between field tools and business features. Build in
  dependency order, and when something new is built, go back and connect it to what was built
  before. The build order is in ROADMAP.md.

- **Truss data first (Q3, 2026-10-27):** the brands that matter in Portugal: **Fantek**, **Global
  Truss** and **Prolyte**, whole catalogues if the data can be had, otherwise at least the 30 and
  40 cm square series (Fantek EC30 and EC40; Global Truss F34 and F44; Prolyte H30V/X30V and
  H40V/X40V). See RG2.
- **Acoustics (Q5, 2026-10-27):** not a copy of EASE, but our own simulator whose detail grows with
  the detail of the project (2D plan → 3D venue → measured speaker data → room surfaces). Stages
  A4–A6 in section 6, **confirmed 2026-10-27**: built after A1–A3.

---

## 1. Prep tools and show tools: where they live

**Built:** the Tools tab's two groups (0.54.0) and On-site mode (0.57.0). On-site mode takes the
place of the gig's overview on its days (`src/lib/onSite.js`, `OnSiteView`); a switch per gig lasts
the day; the automatic switch is a device setting, on by default. It keeps the person's own theme
rather than forcing a dark one: in a bright venue the light or high-contrast theme reads better.

You noticed that the tools serve two different moments:

| | Prepare (office, days before) | Run (on site, during setup and the show) |
|---|---|---|
| Who | PMs, designers, office | Technicians, stage managers, PMs on site |
| Device | Laptop, big screen, mouse | Phone or tablet, one hand, gloves, dark, noisy |
| Purpose | Produce documents and numbers: plots, patches, rigging and power reports, quotes | Look things up fast and capture what happens: notes, checks, dipswitches, scans |
| Output | Prints and PDFs that others follow | Notes and changes that feed back into the documents |
| Network | Online | Often bad: must work offline |

**My view:** keep **one place per gig** (the gig is what people think in), but give every gig two
faces, and add a small pocket kit outside gigs.

1. **The gig's Tools tab becomes two groups.**
   - **Plan:** stage plot, input list, patch, DMX patch, light plot, rigging, power, sound system.
   - **On site:** rehearsal companion, line check (from the input list), dipswitch view (from the
     DMX patch), equipment steps and scanning, read-only prints.
   - A tool can appear in both. The light plot is "Plan"; its read-only view with each fixture's
     dipswitches is "On site".
2. **An "On site" mode for the whole gig.** One switch (or automatic on show days) that:
   - turns the gig into big buttons, a dark theme and offline-first;
   - opens straight on today's schedule, call sheet, rehearsal notes and the on-site tools;
   - hides the editing-heavy screens.

   This builds on the field kit (H5a scan mode, large-print call sheet) rather than a second app.
3. **Pocket tools, no gig needed** (My work → Tools): DMX calculator and dipswitch converter, unit
   conversions, bridle calculator, power and cable quick calculators. These are things a technician
   wants on the phone at any venue, even for a gig that isn't in AVX. They also make AVX useful to
   freelancers who don't have a company account yet, which helps the crew network.
4. **Documents stay separate from tools.** What the Plan tools produce (rigging report, power
   report, patch sheets) is listed under the gig's files and prints. The on-site crew then find
   "the rigging plot" without opening the rigging tool.

**Decided (Q1):** both; automatic on gig days is on by default and can be switched off in
Settings (see Decided above).

---

## 2. Rehearsal companion

**R1 built (0.54.0), R2 built (0.55.0).** How they work is under "How R1 works" and "How R2 works" at the end of this section.

A shared, time-stamped notebook for rehearsals. Everyone on the gig (sound, lights, video, stage,
SM, PM) writes notes at the same time against the same clock. Afterwards each department gets its
list. Designed to bridge to your standalone timecode cueing app later.

Inspired by Earwig: there you tap to mark a moment, and it lines up with the camera's timecode. Its
"scan your camera's timecode" captures the code from a photo of the camera screen, and you can nudge
it if it drifts.

### How it works

- **Session:** a rehearsal run on a gig ("Run-through 2", "Tech day 1, act 1"), with a clock source
  and frame rate (23.976, 24, 25, 29.97 drop/non-drop, 30).
- **Clock sources**, in the order we'd build them:
  1. Time of day (the phone's clock, kept in step with the server).
  2. Stopwatch (start, pause, set to a value).
  3. **Camera sync:** point the camera at a visible timecode display (LTC reader, console,
     timecode generator, video monitor); AVX reads the digits and starts counting from them. Scan
     again to correct drift, or nudge ±1 frame or second.
  4. **LTC from the microphone or line input:** decode the SMPTE audio signal live (libltc compiled
     for the browser exists, LTC.wasm).
  5. MIDI timecode (Chrome on desktop only).
- **Shared clock:** once one person syncs, the session's offset is shared with everyone through the
  server. Every phone then shows the same timecode without each person scanning.
- **Notes:** one tap marks the time, then you type, dictate (the phone's speech-to-text) or add a
  photo. Each note carries:
  - department (preset per person from their function) and author;
  - priority (note, fix, urgent);
  - optional cue, song or scene label;
  - assignee and status (open → done).

  Quick buttons save typing ("Level", "Focus", "Late cue", "Feedback", "Missing").
- **Live list:** everyone's notes appear as they're written (filter by department, mine, open).
  Tapping a note's time "jumps" a shared marker so people can talk about the same moment.
- **After the run:** a report per department (print, PDF, CSV), open notes carried to the next run,
  and done notes kept for history. An export the cueing app can read (JSON with timecode, frame
  rate, notes, cue labels), and markers for editing or DAW tools (CSV markers; Reaper/Premiere marker
  formats later).

### Stages

| Stage | Scope | Size |
|---|---|---|
| **R1** | Sessions on a gig, time-of-day and stopwatch clocks, frame rates, shared session clock, notes (department, priority, cue label, assignee, status), live list with realtime and filters, quick buttons, dictation, photos, report per department, offline capture (notes queue and sync later), "On site" group | 1 PR |
| **R2** | **Camera timecode sync** (digit reading on the phone, manual confirm, nudge, re-scan; no image leaves the phone), LTC from audio input, drift warning when the session runs long | 1 PR |
| **R3** | Bridge: cue labels from a cue list, the JSON export/import shared with the cueing app, markers export, notes to tasks (when tasks exist) | 1 PR |

**Technical notes.**
- Reading digits works best on 7-segment and plain monospaced displays. We'd use an on-device text
  recogniser with a narrow "HH:MM:SS:FF" model, then cross-check the reading against a second frame
  a moment later (the frames must advance as expected). That makes misreads rare, and the person
  always confirms.
- LTC decoding in the browser is proven (libltc to WebAssembly).

**Decided (Q2):** the cueing app is standalone and integrates with AVX (sign in with AVX, the API,
the shared export format). R3 ships the file format first; the live link follows the public API.

---

### How R1 works (0.54.0)

| Piece | How it works |
|---|---|
| Sessions | `rehearsal_sessions` (gig, name, fps, `frame_count` ndf/df, clock, `running`, `anchor_at`, `anchor_ms`). The clock is an anchor: at server time `anchor_at` it read `anchor_ms`; while running it advances with real time. Phones measure their offset to the server (`server_now()`) and draw the timecode every frame. Changing the reading, running or clock makes the server stamp `anchor_at` and `clock_set_by`, so every phone shows the same time |
| Timecode | `src/lib/rehearsal.js`: frames are counted at the actual rate (23.976, 29.97) and labelled at the nominal one (24, 30); drop-frame skips frame numbers 0 and 1 each minute except every tenth. Notes keep milliseconds (`tc_ms`), so the label can be redrawn at any rate |
| Notes | `rehearsal_notes`: department (sound, lighting, video, stage, SM, production, other), priority, cue, body, photo, assignee (must be on the gig), open/done (the server stamps who and when). `client_id` is made on the phone, so a note sent twice is kept once. The author changes what it says; anyone writing on the gig ticks it or reassigns it; the author or the gig's managers remove it (marked only) |
| Who | Read: everyone on the gig (`can_access_gig`). Write: the gig's PMs and crew, its creator, and the organisation's admins and members (`can_note_gig`); viewers only read |
| Live and offline | Both tables are in the realtime publication; the tool listens per session. Notes written offline wait in `localStorage` (`avx.rehearsalOutbox.<user>`) and go out when the connection is back |
| Photos | Private bucket `rehearsal-photos`, `<gig>/<session>/<note>.jpg`, made smaller on the phone (long side 1600 px) |
| Outputs | `/gig/:id/rehearsal/:session` (print per department), CSV, JSON (`format: avx-rehearsal`, version 1: timecode, frames, ms, department, priority, cue, text, status) |
| Not yet | Shared marker on a note's time (later), notifications to assignees (with tasks), camera and LTC sync (R2), cue lists and the live bridge (R3) |

Checks: `supabase/tests/rehearsals.sql`; `src/lib/rehearsal.test.js` (timecode, drop-frame, clock, filters, CSV, export).

### How R2 works (0.55.0)

| Piece | How it works |
|---|---|
| Exact anchor | Migration `20261128000000_rehearsal_clock.sql`: the phone sends `anchor_at` (its time plus its offset to `server_now()`) with the reading; the server keeps it when it is within 5 s of its own time, otherwise uses its own |
| Camera | `src/lib/tcOcr.js`: the guide box is cropped from the camera picture (84 % × 24 % of it), turned into an ink mask (Otsu threshold, ink = the minority side, so lit digits on dark and dark digits on light both work), the line of digits is found, pieces of seven-segment digits are joined, colons dropped, and each of the eight digits is read by sampling where its seven segments would be. Two readings must move on with the elapsed time (±2.5 frames) before one is offered; the person confirms. Nothing leaves the phone |
| LTC | `src/lib/ltc.js`: biphase-mark decoding with an adaptive bit length (any of 23.976–30 fps, any sample rate), sync word, BCD fields and the drop-frame flag. The audio is read with Web Audio (no echo cancellation, noise suppression or gain control); each word's end marks the start of the next frame, and the time it was heard on the phone sets the reading |
| Drift | Camera and LTC sources run on their own clocks; after 20 minutes a note under the clock suggests syncing again |
| Checks | `src/lib/tcOcr.test.js` (drawn seven-segment displays, both polarities, noise), `src/lib/ltc.test.js` (generated LTC at 25, 30 and 29.97 DF, 48 and 44.1 kHz, noise); the browser was checked with a generated video of a running display and a generated LTC file as the fake camera and microphone |
| Not yet | Fonts that aren't seven-segment-like may not read; then type it. The cue list and live bridge are R3 |

## 3. DMX calculator and dipswitch converter (small, do early)

**D1 built (0.56.0).** See "How D1 works" at the end of this section.

Modelled on the best parts of DMX Toolbox, DMXRef and DMX Dip Calculator:
- **Address ↔ dipswitches:** 9 or 10 switches, value of each switch shown, tap switches to build an
  address. Display options: mirrored, upside-down, ON = up or down, switch 1 on the left or right,
  and LSB-first or MSB-first, because fixtures disagree.
- **Universe/address ↔ absolute address** (1–512 per universe; absolute = (universe − 1) × 512 +
  address), with a choice of whether universes count from 0 or 1.
- **Block addressing:** N fixtures with footprint F from a start address. It lists every address,
  shows when the next fixture would cross into a new universe, and gives each address's dipswitches.
- **Value converters:** % ↔ 0–255, 16-bit coarse/fine ↔ value, hex.
- **Inside a gig:** the DMX patch gets a "Dipswitches" column and an on-site view that walks
  fixture by fixture ("next fixture" with big switches, works offline).
- **Pocket tool:** the same calculator without a gig.

| Stage | Scope | Size |
|---|---|---|
| **D1** | Calculator, dipswitch view (with display options), block addressing, converters; pocket tool + DMX patch column + on-site walk-through | 1 PR |

### How D1 works (0.56.0)

| Piece | How it works |
|---|---|
| Maths | `src/lib/dmxCalc.js`: switch values (LSB or MSB first, a 10th switch worth nothing), address ↔ switches, universe/address ↔ absolute (from 1 or 0), block addressing that never splits a fixture across universes, % / 16-bit / hex conversions. Tests in `dmxCalc.test.js` |
| Layout | Each person chooses how their fixtures show the switches (count, order, ON direction, side); kept in `localStorage` (`avx.dipLayout`) and shared by the calculator, the patch and the walk-through |
| Pocket tools | `/tools` (My work → Pocket tools), no gig needed, no network needed |
| In the gig | DMX patch: "Dipswitches" toggle per fixture; "Walk the rig" opens `/gig/:id/dmx/walk`, fixtures with an address sorted by position, then universe and address; uses the patch's offline copy |

---

## 4. Electrical load and power distribution

The light plot already estimates watts, amps and kg per position and per phase. This grows it into
power distribution for the whole gig, from the equipment actually on it.

- **Data:** catalogue items get electrical fields:
  - watts (max and typical), power factor, inrush;
  - connector in and out (Schuko, CEE 16/32/63/125, Powerlock, Socapex, powerCON, True1);
  - for distros: inputs, outputs (connector, phase, breaker size, RCD).
- **Distribution tree:** supply (generator or venue: voltage, phases, amps per phase) → distros →
  outputs → loads (fixtures from the light plot and DMX patch, speakers and amps from the system,
  video, backline). Each load is placed by drag or from a list, or automatically by position and
  phase balancing.
- **Calculations:**
  - current per phase and per output, with neutral current on unbalanced three-phase;
  - breaker headroom (warn at 80%) and phase balance (difference in %);
  - inrush per group, to flag where many fixtures power on at once;
  - cable runs: length and cross-section give voltage drop (limit 3–5%) and current capacity by
    cable type and how it's laid.
- **Views:**
  - by physical position (stage left, FOH, truss 2);
  - by distro;
  - by phase;
  - by department (lights, sound, video);
  - a one-line diagram of the tree.
- **Reports:** power plan print (tree, tables per distro, per phase, warnings), a cable list (what
  to pack), and catalogue lines added to the gig's equipment (distros, cables).
- **Labelled as estimates.** Electrical work on site is the responsibility of a qualified
  electrician; the report says so.

| Stage | Scope | Size |
|---|---|---|
| **P1** | Electrical fields on catalogue items (and import presets), supply, distros and outputs, assigning loads (from all tools and the gig's equipment), per-phase and per-output totals, warnings, report | Built (S09): docs/FIELD_TOOLS.md, "How the power tool works" |
| **P2** | Cable runs and voltage drop, cable list → equipment, automatic phase balancing suggestion, inrush groups | Built (S10): docs/FIELD_TOOLS.md, "How the power tool works" |
| **P3** | One-line diagram, views per area and department, on-site checklist (what plugs into what, ticked off) | 1 PR |

Compared with LumiStage on 2026-10-27 (docs/COMPETITOR_RESEARCH.md): it groups loads into 16 A
circuits, balances phases and **suggests a generator size**, and makes a cable list (power, DMX,
speaker, signal). P1 adds the generator suggestion (from the total and per-phase load, with a
margin); P2's cable list already covers the rest, joined with the gig's real equipment.

---

## 5. Rigging and load calculator

The most complex of these, and the one where a wrong number can hurt people. It is phased so that
each stage is useful and safe on its own, and so the hard engineering comes last.

### What it must respect

- Hoist classes:
  - **D8**: hold a load, never over people without secondary safety.
  - **D8+**: may hold over people; usually de-rated, about 2:1 versus D8.
  - **C1**: may move and hold loads over people; design factor 10:1.

  The classes come from the German BGV/DGUV rules and SQP2, now carried into **EN 17206** (lifting
  and load-bearing equipment in the entertainment industry). Sources disagree on exact factors, so
  AVX would use the manufacturer's WLL as typed and never derive one.
- **Truss:** only the manufacturer's load tables (allowable UDL, CPL, TPL, QPL and deflection per
  span) are valid. AVX would store those tables per truss type, never compute truss strength
  itself.
- **Points:** beam or roof point capacities come from the venue. AVX checks against them; it
  doesn't know them.
- **Every report** says it is an aid and must be checked by a competent rigger. Inputs and their
  sources are printed with it.

### Stages

| Stage | Scope | Size |
|---|---|---|
| **RG1 · Weights and point loads** | From the light plot (fixtures and their weights, already there) and the gig's equipment: weight per truss line (fixtures, truss self-weight, cable allowance per metre, motors, accessories, a dynamic/safety allowance). Hang points along each line. **Reactions per hoist** for a straight truss on 2+ points (a continuous beam with several supports: a small structural solver on the line, uneven loads and cantilevers included). Hoist WLL check by class (D8/D8+/C1), with a check that the class is allowed over people | 1 PR |
| **RG2 · Truss tables and bridles** | Truss types with manufacturer load tables (span vs allowed UDL/CPL/TPL/QPL, deflection) and a pass/fail per span. **Bridle calculator** (two legs to a pick point: leg lengths, angles, tension per leg, warning above 120° included angle, horizontal force on the beams), also as a pocket tool. Rigging hardware list (shackles, slings, steels, spansets with WLL) | 1 PR |
| **RG3 · Line arrays** | Speaker cabinets from the catalogue tagged as line-array elements with rigging data: weight, centre of gravity, the manufacturer's bumper/frame limits per configuration, pickup points. The array is defined as a number of elements with splay angles (from the system calculator, F4). Outputs: total weight, front/rear point loads, pull-back, bumper position and tilt, a pass/fail against the bumper limits, and a drawing. Modelled after NEXT X-Rig and JBL's array calculators, but **the limits always come from the manufacturer's data**, and a manufacturer's own tool beats ours | 1–2 PRs |
| **RG4 · Rigging plot and report** | Top view with points, hoists, bridles and truss lines; per-point table (load, hoist, class, WLL, % used), totals per beam or roof zone against venue capacities; the rigging report as print/PDF with assumptions; catalogue lines (hoists, truss, shackles, steels) offered to the gig's equipment | 1 PR |
| **RG5 · Suggestions** | When something fails: move a point, add a point, use a bigger hoist, change to a stronger truss type, or spread a bridle; each suggestion re-checked before it's shown. Ground support (towers) later, if asked | 1 PR |

### How RG1 works (step 17a)

| Piece | How it works |
|---|---|
| Where | Gig → Tools → Rigging (tool id `rigging`). The rigging is in `gig_show.rigging`: the defaults (`cable_kg_m`, `dynamic_factor`) and the truss lines. Same rights as the rest of the show model: everyone on the gig reads it (also offline), editors change it |
| Lines | A line comes from a light plot bar (`bar_id`: its length and its fixtures with their weights and places along the bar) or is typed by hand (name, length). Each line adds the truss weight per metre, a cable allowance per metre (the gig's default or its own), accessories (spread evenly), extra loads (at one place, or spread between two) and the motors that climb with the line (the hoist model's own weight at that point) |
| Solver | `solveBeam` in `src/lib/rigging.js`: the line is a straight continuous beam of even stiffness on two or more rigid points at the same height. Beam elements between every point, load and load edge; Gaussian elimination; the reactions don't depend on the stiffness. Cantilevers and uneven loads included; a negative reaction means the line would lift off that point (flagged). Unit tested against hand calculations (`src/lib/rigging.test.js`: simply supported, two and three equal spans, cantilevers, point and distributed loads, equilibrium on an uneven case) |
| Check | Each point's reaction × the dynamic factor against the hoist's WLL: ok, near (over 80%), over, lifting, no hoist, no WLL. A D8 hoist over people is flagged (D8+ and C1 may be). WLL values are only ever the manufacturer's; nothing is derived |
| Hoist models | `hoist_models`: brand, model, class (D8, D8+, C1), WLL, falls, own weight, chain weight per metre, speed, source and its edition, notes, `needs_check`. Rows without an organisation are presets (read-only); an organisation's admins and members add their own from a data plate (removed by marking). Every model is shown as needing a second person's check. A point keeps a copy of its model, so crew outside the organisation see the same check |
| Presets | Chainmaster D8+ 500, 1000 and 2000 kg from CHAINMASTER's product data sheets (URL and revision on each). CM Lodestar D8+ 0.5, 1 and 2 t ship without values: no D8+ data sheet could be reached on cmco.com when they were added |
| Light plot | Under each bar with weights: "Rigging: not checked", "Rigging: checked · busiest hoist n%" or "Rigging: overloaded" (words and icon, not colour alone). One tap opens the tool on that line (starting it, and adding the tool to the gig, for editors). "Mark the loads as checked" keeps a fingerprint of the bar's fixtures, weights and places; any change makes it "not checked" again |
| Tools tab | When the gig's equipment has hoists (by name: hoist, chain motor, Lodestar, Chainmaster, talha, D8…) and the tool isn't on the gig, the Tools tab suggests it |
| Labels | Every screen says it is an aid that a competent rigger must check; the defaults are labelled as values to check. The "Checked by" sign-off comes in RG4 |
| Not yet | Truss load tables (RG2), bridles (RG2), line arrays (RG3), the rigging plot, report and sign-off (RG4) |

Checks: `supabase/tests/rigging.sql`; `src/lib/rigging.test.js`.

### How RG2 works (step 17b)

| Piece | How it works |
|---|---|
| Truss type | Each RG1 line can have a `truss_table_id` (a table in `src/data/truss/`) and an optional `defl_limit_mm`, kept in `gig_show.rigging.lines`. Tables blocked in the repository aren't offered. "Use its weight" copies the weight per metre from the table's weight column |
| Who may use a table | `public.truss_table_checks` (migration `20270126000000`): one mark per table and source document (`table_id`, `edition`, `source_sha256`), `checked` (with the number of rows compared) or `blocked` (with the reason), who (name from their profile) and when. Only AVX admins with two-step sign-in mark (`mark_truss_table`) or take a mark back with a reason (`withdraw_truss_mark`); a mark is never edited (trigger) and nothing is removed. Everyone signed in reads the marks. `tableStatus` in `src/lib/trussTables.js` counts a table as checked only when its active mark matches the repository's edition and SHA-256: a new edition needs a new check, and a `checked` written into the JSON alone doesn't count |
| Look-up | `rowFor`: the row for a span is the exact row or the next longer one (allowable loads only fall with span, and a straight line between rows would read high); shorter than the table → its first row; longer than the table → no row (no pass/fail). Never interpolated, never extrapolated |
| Pass/fail | `lineTrussCheck`: each span between neighbouring hang points as a simple span. Spread loads covering the whole span are UDL; shorter spreads, fixtures, extra loads, motors and line-array picks count as point loads. Loads × the dynamic factor. The truss's own weight is left out when the table says it is included (Prolyte, Global Truss), added otherwise (Fantek). `spanCheck`: UDL use + point use, with all point loads at the centre (CPL) for the verdict; TPL and QPL (loads shared over the third or quarter points) shown too. Pass up to 90%, near up to 100%, fail above. Deflection estimated in proportion to the published deflections; checked only against a limit the line sets. Overhangs and lines on 3+ points are flagged for a structural check |
| Report | Each line names the table, its document, edition, who checked it and when, the table row used per span, and the manufacturer's conditions. While nothing is checked, the line says so and links to the review |
| Review screen | `/admin/truss` (`TrussReviewPage`), also from Settings → AVX reviews: each table's source, edition, SHA-256, second copy, conditions, issues, questions and rows; an AVX admin ticks every row before "Mark checked", blocks with a reason, or takes a mark back; the history shows every mark |
| Bridles | `src/lib/bridle.js`: beam point A at (0, 0), B at (span, rise); the pick point from the two leg lengths (circle intersection below AB) or from where it hangs. Statics of a weightless two-leg sling: tension per leg, angle from vertical, included angle (warning above 120°), sideways pull on the beams, and each leg against the WLL of its weakest piece. In a gig: `gig_show.rigging.bridles`; in My work → Tools: the same card with WLLs typed (not saved) |
| Hardware | `gig_show.rigging.hardware` (`src/lib/riggingHardware.js`): shackles, slings, steels, spansets and other, with WLL (never a default), quantity and source. "Add from the equipment" brings the gig's equipment lines whose names look like hardware (English and Portuguese). Warns when bridles use more than the list holds |

Checks: `supabase/tests/truss_checks.sql`; `src/lib/trussTables.test.js` (status from the database, look-ups never interpolate or extrapolate, pass/fail cases), `src/lib/bridle.test.js` (hand calculations), `src/lib/riggingHardware.test.js`; e2e in `e2e/auth/fieldtools-power.spec.js`.

### How RG3 works (step 18)

| Piece | How it works |
|---|---|
| Where | Gig → Tools → Rigging, section "Line arrays" (no new tool id). Arrays are kept in `gig_show.rigging.arrays`, beside RG1's truss lines: same rights, same offline copy |
| An array | Elements (a catalogue speaker, line-array element or subwoofer, or typed by hand: name and weight), how many, one splay angle per element (`splays[0]` is bumper → top element), the bumper or frame, extra load, one or two picks and an optional pullback. Elements copy the item's weight, preset and the state of its rigging check, so crew who can't read the catalogue see the same |
| Bumper data | `src/data/lineArrays.js`, keyed by speaker preset: each frame's parts and weights, its safe limit, maximum, SWL (where printed) and whether it is a pullback frame, each with the manufacturer's wording, document, version and PDF page, opened 2026-11-09. K2 (K2-BUMP, + K2-BAR, K2-RIGBAR, pullback), Kara II (M-BUMP, + M-BAR, KARA-MINIBU, M-BUMP + KARA-PULLBACK), KS28 (KS28-BUMP), d&b V8 and V-SUB (Z5380 V Flying frame), NEXO GEO M1220 (VNT-BUMPM12, + VNT-EXBARM12), Meyer LEOPARD (MG-LEOPARD/900, no weight printed). RCF HDL 30-A has none (its manual couldn't be opened): its fly bar is typed by hand. Any bumper can be typed by hand from the manual (shown as needing a check) |
| Check | `bumperCheck` in `src/lib/lineArray.js`: **pass** within the safe limit (and d&b's 340 kg, cabinets only) and under the SWL; **check** between the safe limit and the maximum, or when the manufacturer gives only a maximum: the manufacturer's software must confirm; **fail** over the maximum or the SWL (frame, elements and extra load) |
| Loads | No datasheet prints a centre of gravity (D74), so nothing is invented: with two picks the user types the centre of gravity behind the front pick and the pick spacing from the manufacturer's software and AVX shares the weight by the lever rule (outside the picks: one is pulled up, fail); or types the point loads, checked to add up to the weight within 5%. One pick carries the whole weight. A pullback needs typed loads. Tilt and pick position (hole) are typed from the software too. Every array names the software that decides (Soundvision, ArrayCalc, NS-1, MAPP, RCF Easy Shape Designer) |
| Picks | Each pick has its own hoist (checked like RG1's points: × the dynamic factor against the WLL, D8 over people flagged, via `hoistCheck` in `src/lib/rigging.js`) or hangs from a point on an RG1 truss line: then its load is added to that line as a point load and checked with the line's hang points (also in the light plot's "Rigging" mark) |
| Drawing | `LineArraySvg`: a schematic side view, boxes hinged at the front, angles as typed, sizes not to scale |
| Sign-off (D73) | `price_items.rigging` keeps who typed it (`entered_by`); any change to the data clears the check, and the check fields can't be written by a plain update (trigger `private.price_items_rigging_before`). On the item page, "Mark the rigging data as checked" calls `mark_speaker_rigging_checked(item, frames)`: someone who can edit the catalogue and isn't the typist. It keeps who and when, and a fingerprint of the bumper data AVX shows; if that data changes, the check shows as out of date |
| Connected | Sound system calculator: "Add an array from the sound system calculator" takes a source's name, count and speaker, offers to update when they change, and the source shows the array's weight and result. Gig equipment: the array warns when the gig has fewer of the element than the arrays need; the Tools tab suggests the rigging tool when line-array elements are on the gig. RG1: picks can hang from truss lines |

Checks: `supabase/tests/line_arrays.sql`; `src/lib/lineArray.test.js` (the d&b V-Series rigging manual's own limits: 10 V8 = 340 kg in any splay, 24 V8 and 13 V-SUB inside 860 kg; L-Acoustics safe and maximum limits; the lever rule against hand calculations).

### Prompting from other tools

Yes, this is viable, because the data is already connected:
- When a light plot position has fixtures with weights, the position shows "Rigging: not checked".
  One tap opens the rigging tool with that line filled in.
- When catalogue items marked "line-array element" or "hoist" are added to a gig, the Tools tab
  suggests the rigging tool, just as the input list suggests the patch today.
- Once checked, the position shows the result, and it turns back to "not checked" when the fixtures
  change.

**Decided (Q3, 2026-10-27):** truss data from **Fantek**, **Global Truss** and **Prolyte**:
- whole catalogues if the load tables can be had, otherwise first the 30 and 40 cm square series:
  Fantek EC30 and EC40; Global Truss F34 and F44; Prolyte H30V, X30V, H40V and X40V;
- the tables come from the manufacturers' own published load tables (PDF), never derived. Each
  table keeps its source (document, edition, date), is entered by one person and checked by a
  second before it can be used, and is versioned, so a report always shows which table it used;
- **data collected 2026-10-27** (docs/TRUSS_DATA.md, `src/data/truss/`): 39 tables from the
  manufacturers' documents, with source, edition and checksum. 35 wait for the second person's
  check; 4 are blocked on questions to the manufacturers (Fantek EC-40's weights, Fantek EC-76,
  Global Truss F23/F24). Prolyte no longer publishes X40V. RG2 builds the review screen;
- **hoists (2026-10-28):** the Lodestar range from 0.5 to 2 t is the standard in Portugal, so those
  models come first (0.5 t, 1 t, 2 t), from the manufacturer's data sheets; anyone can add another
  model from its data plate.

**Decided (Q4):** a "Checked by" sign-off with warnings, a suggestion to hire a certified rigger
through the job board, and a liability disclaimer when it is skipped (see Decided above). It is
part of RG4.

---

## 6. Sound system calibration and acoustic simulation: is it worth it?

EASE Focus 3 (free, from AFMG) models line arrays, sub-arrays, steered columns and conventional
speakers in 3D. It shows direct-field coverage, SPL and frequency response, with auto-splay, a
virtual EQ and FIR filters, all from manufacturers' **GLL** files.

**My recommendation: don't replicate EASE Focus.**
- **Data:** an accurate simulation needs measured, high-resolution directivity data (balloons per
  frequency, with phase) for every cabinet and every array configuration. That data lives in GLL
  files, a proprietary AFMG format that manufacturers publish for EASE. There's no licence to read
  GLL in our own engine, and building our own measurements is not realistic.
- **Physics:** coherent summation of arrays, with splay-dependent interaction, is a specialised
  engine. Getting it subtly wrong is worse than not having it, because people would tune real
  systems to it.
- **Competition:** EASE Focus is free, and every major manufacturer has its own free tool (d&b
  ArrayCalc, L-Acoustics Soundvision, Meyer MAPP 3D, JBL Venue Synthesis). Engineers already use
  them; they won't switch to a weaker one inside AVX.

**What is worth building instead** (where AVX adds something those tools don't: the gig's data, the
team, the documents):

| Stage | Scope | Size |
|---|---|---|
| **A1 · Speaker library** ✅ (built in step 13; how it works: docs/INVENTORY.md, "How the speaker library works") | Speaker cabinets in the catalogue with specs: sensitivity, max SPL, nominal dispersion H×V, frequency range, impedance, weight, rigging data (for RG3), power (for P1), amplifier channels per cabinet. Presets for common models, typed in from datasheets. Feeds rigging, power and the F4 calculator | 1 PR |
| **A2 · Simple coverage map** | A plan view of the venue with SPL estimates from point sources with nominal dispersion (inverse square and air absorption by frequency band), for fills, delays and small systems. **Labelled as an estimate, not a simulation**; line arrays are shown only as their aim lines and splays, never as a fake SPL map | 1 PR |
| **A3 · Prediction and measurement files** | Attach the real prediction (EASE, ArrayCalc, Soundvision project or export) and measurement files (Smaart/SysTune captures, EQ settings) to the gig's sound system, versioned, with notes; a "system tuning sheet" print: delays, EQ, gains, splay angles, as built | 1 PR |

### Our own simulator, in levels of detail (confirmed 2026-10-27)

Your question: with a 3D venue, the rigging points, the arrays (count, position, splays) and the
speakers' specs, what else is needed, and can the simulation scale with the detail the project
has? **Yes, it can.** What EASE Focus shows is the **direct field**: the sound arriving straight
from each speaker, added up with its phase. The maths for that is well known (each element is a
source; at each point and frequency band, add the contributions with their distance, delay and
directivity). The geometry and the array come from AVX already. What decides the accuracy is one
thing: **how each cabinet radiates** (its directivity, per frequency, with phase). So the result is
labelled by the detail it was built from, and gets better as detail is added:

| Level | What the project has | What we compute | How it is labelled |
|---|---|---|---|
| **L0** | 2D plan, nominal specs | A2: point sources, nominal dispersion, distance and air loss | Estimate |
| **L1** | 3D venue (audience planes, rigging points), array configuration, cabinet geometry (size, driver layout) | Direct field per frequency band: each element modelled from its physical size (a line/piston model), added coherently with splays, delays and levels. Shows coverage, throw, the effect of array length and splay, sub arrays and cardioid sub set-ups | Approximate, ±3–6 dB, worst at high frequencies |
| **L2** | Measured directivity for the cabinet (balloon data per 1/3 octave, ideally with phase) from an open format or with the manufacturer's permission | Same engine with real directivity: close to a direct-field tool like EASE Focus | Prediction |
| **L3** | Room surfaces with materials | Adds the room in statistical form: reverberation time (Sabine/Eyring), direct-to-reverberant ratio, critical distance and an STI estimate per area | Prediction plus room estimate |

Never: ray tracing or auralisation (that is EASE's full product and a research field of its own).

What makes it hard is not the maths but **data and trust**:
- **Directivity data:** GLL is closed. Some manufacturers publish data in other formats or would
  share it; that needs checking per brand before L2 is promised. Without it, L1 is as far as it
  goes for that cabinet.
- **Validation:** before anyone tunes a system with it, the engine has to be compared with
  measurements and with the manufacturers' tools on a few known systems, and the differences
  published with the results.
- **Labels on every result:** the level, what it ignores, and that the manufacturer's tool decides
  rigging and safety.

| Stage | Scope | Size |
|---|---|---|
| **A4 · 3D venue and direct-field engine (L1)** | Audience planes and walls from a simple 3D model (drawn in AVX or imported from a plan), the rigging points from RG, arrays from RG3; a coherent direct-field engine in a background worker (bands 63 Hz–16 kHz), SPL and frequency-response maps, labelled L1 | 2 PRs |
| **A5 · Measured directivity (L2)** | Import of open directivity data where a manufacturer publishes or allows it; the same engine uses it per cabinet; a validation report against reference systems | 1–2 PRs |
| **A6 · Room estimate (L3)** | Surface materials, RT60, critical distance, STI estimate, shown as a room summary beside the direct-field map | 1 PR |

**Decided (Q5b, 2026-10-27):** yes. A4–A6 come after A1–A3; in the build order (ROADMAP.md) they also wait for
RG3, which supplies the arrays.


---

## Proposed, to confirm (2026-10-27, from LumiStage and StageKit)

- **Venue pages:** one page per venue, shared by the organisations that work there: stage size and
  capacity, installed equipment, rigging points and their limits, power supply, light plots and
  documents, contacts by role, access hours for build and rehearsal, photos. A gig at that venue
  would fill its address, call sheet, power supply (P1) and rigging points (RG1) from it. Would
  sit after step 22 (rider page).
- **A/B variants** of a plot or a power plan, compared side by side: later, with gig templates.

## Decided (2026-11-03, from Production Assist)

From docs/COMPETITOR_RESEARCH.md ("2026-11-03: Production Assist"). The first group goes inside steps
already planned and needs no new step; the second group became new steps. All of it was confirmed
on 2026-11-03 (docs/PENDING.md D31–D35); the steps are in ROADMAP.md.

**Inside planned steps** (added to the step's scope when it is built):

- **P1:** loads typed by hand with watts and phase (catering, bars, site office), so the whole supply
  is planned, not just the show; a status per distro and load ("connected", "partly", "not
  connected"), shown in words and icons, not by colour alone.
- **P2:** automatic assignment that **fills each output up to a reserve** (for example 80% of the
  breaker), as a choice next to phase balancing; every suggestion shown before it is applied.
- **P3:** a **move-loads grid** for on-site changes (outputs down the side, loads across the top,
  tap to move, the phase totals update at once); the one-line diagram also shows the **data chain**
  (which fixture feeds which, through which splitter or node), using the DMX patch.
- **RG4:** an **engineer's pack**: one download with the inputs (positions, weights, points, hoists,
  truss types and the table edition used, bridles), the results and the plot, so a certified engineer
  can check it without re-entering anything; and **measured loads**: the rigger types the load-cell
  reading per point on site and sees it next to the planned load, with a warning when it is over the
  hoist's WLL or more than a set percentage above the plan.
- **Step 23:** a suggestion that splits the packing list across the chosen vehicles by weight and
  volume (cases kept whole), which the planner can change.

**New steps (yes, 2026-11-03):**

| # | What | Size | Would sit |
|---|---|---|---|
| D | What | Size | Where |
|---|---|---|---|
| D31 | **Label templates**: three standard sizes (below) and what goes on each: name, code, QR, gig, case contents, a colour band per department (with its name printed, not colour alone), the distro or circuit; for items, units, cases and, after P1, distros and cables | 1 PR | Upkeep U5 (it extends I1's QR labels) |
| D32 | **A QR on every print** (call sheet, input list, patch, DMX, light plot, system calculator, and later the power plan and rigging report) that opens the current version, with the print date beside it, so an old paper copy is easy to spot | small, 1 PR | Upkeep U6 |
| D33 | The **engineer's pack** above, plus a "Send to an engineer" step that shares it through a supplier-style link | part of RG4 | Step 19 (RG4) |
| D34 | **TradeShowLoads** (`.tsle`) export of hang points for trade fairs | small, if the format is open | Step 19b, after RG4 |
| D35 | **Work areas** on a gig: group positions, fixtures and equipment into areas (a truss, FOH, a tower), each a task with people, an estimated build time, instructions and a QR on its printed sheet; progress per area in On-site mode | 1 PR | Step 20b, after P3 and RG4 (it uses their positions) |

**Label sizes (D31, decided 2026-11-03: modular, no specific printer).** Three sizes, chosen
because each exists both as a printer roll and as a pre-cut A4 sheet sold internationally:

- **Small, 50 × 25 mm**: cables, small items (QR and code). Roll 50 × 25 mm (2 × 1 in); A4 pre-cut
  sheet 52.5 × 29.7 mm, 40 per sheet.
- **Medium, 100 × 50 mm**: units, distros, racks (QR, name, code, a colour band). Roll 100 × 50 mm
  (4 × 2 in); A4 pre-cut sheet 105 × 57 mm, 10 per sheet.
- **Large, A6 / 4 × 6 in**: cases (QR, name, contents, gig). Roll 102 × 152 mm (4 × 6 in, the
  shipping-label size every thermal printer takes); A4 pre-cut sheet 105 × 148 mm (A6), 4 per sheet.

Each size prints three ways: **on a roll** (one label per page, for any label or thermal printer),
**on pre-cut A4 sheets**, or **on plain A4 or US Letter with cut lines**. Each layout is drawn a few
millimetres inside the smaller of its roll and sheet sizes, so the same design fits both. No printer
brand or model is assumed. The two sheet layouts in use today (63.5 × 38.1 mm, 21 per sheet; 99.1 ×
67.7 mm, 8 per sheet) match no roll size and are replaced by these three.

Not adopted: 3D CAD, our own structural engineering (finite elements, wind, ballast), an in-house
engineering office, live load-cell hardware links, VR, CAD plug-ins, branch-and-merge versions of a
gig, PosiStageNet. Reasons are in the research note.

## Build order

Moved to [ROADMAP.md](../ROADMAP.md) ("What's left"), which is now the only list of what is built
next. Step numbers are unchanged (code and migrations refer to "build order step N"). How the
business features built from it work (tasks, statuses, custom fields, crew rates) is in
[BUSINESS.md](BUSINESS.md).

## References

- Earwig: [earwig.io](https://earwig.io/), [how to use](https://earwig.io/howto.html), [FAQ](https://earwig.io/faq)
- Timecode in the browser: [LTC.wasm](https://github.com/JorenSix/LTC.wasm), [SMPTE decoding in the browser](https://0110.be/posts/SMPTE_decoding_in_the_browser)
- Hoist classes: [CMCO on SQP2, D8, D8+ and C1](https://cmco.com/en-us/resources/blog/breaking-down-sqp22018-requirements), [Tuchler chain hoists](https://www.tuchler.net/en/products/chain-hoists.html)
- Bridles: [two-leg tension reference](https://open-exam-prep.com/study-guides/nccco-rigger-level-2/balanced-forces/two-leg-tension), [4Wall on bridles](https://www.4wall.com/help/what-is-a-bridle-in-rigging--n-213), [ETC load calculations](https://support.etcconnect.com/ETC/Rigging/General_Information_-_Rigging_Systems/Load_Calculations_-_Behind_the_Numbers_-_Rigging)
- Line array calculators: [JBL Line Array Calculator III](https://jblpro.com/fr/products/line-array-calculator-iii), [NEXT LA210x rigging](https://www.prosoundweb.com/next-proaudio-introduces-new-la210x-medium-format-line-array/) (X-Rig itself could not be opened from here)
- Acoustic simulation: [EASE Focus 3](https://afmg.eu/node/32), [CODA on EASE Focus](https://codaaudio.com/softwares/ease-focus-ii/), [RCF GLL files](https://rcf.it/en/-/new-gll-speaker-definition-files)
- DMX tools: [DMXRef review](https://techietalk.co.uk/articles/dmxref-review), [DMXCalc review](https://techietalk.co.uk/articles/dmxcalc-review), [DMX Toolbox](https://apps.apple.com/mx/app/dmx-toolbox/id6474448260), [Patch List Calculator](https://apps.apple.com/it/app/patch-list-calculator/id6764568918)

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
  before. See **Build order** at the end.

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
| **P1** | Electrical fields on catalogue items (and import presets), supply, distros and outputs, assigning loads (from all tools and the gig's equipment), per-phase and per-output totals, warnings, report | 1 PR |
| **P2** | Cable runs and voltage drop, cable list → equipment, automatic phase balancing suggestion, inrush groups | 1 PR |
| **P3** | One-line diagram, views per area and department, on-site checklist (what plugs into what, ticked off) | 1 PR |

LumiStage: link received (lumistage.online/uygulama), but this environment's network can't open
it yet, so P1–P3 haven't been compared with it.

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
- the documents themselves are needed first: this environment can't reach the manufacturers'
  sites, so they have to be shared (the PDFs, or the sites allowed in the environment);
- hoists (not chosen yet): CM Lodestar, Chainmaster BGV-D8+ and C1, Verlinde Stagemaker, Movecat
  and Liftket stay the suggestion; anyone can add a model from its data plate.

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
| **A1 · Speaker library** | Speaker cabinets in the catalogue with specs: sensitivity, max SPL, nominal dispersion H×V, frequency range, impedance, weight, rigging data (for RG3), power (for P1), amplifier channels per cabinet. Presets for common models, typed in from datasheets. Feeds rigging, power and the F4 calculator | 1 PR |
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

**Decided (Q5b, 2026-10-27):** yes. A4–A6 come after A1–A3; in the build order they also wait for
RG3, which supplies the arrays.


---

## Build order

Built in dependency order: nothing is built before what it needs. Each step lists **what it must
connect to once built**, so that earlier features pick up the new data. That linking is part of
the step's PR, not a later clean-up. Numbers in brackets are from COMPETITOR_RESEARCH.md.

| # | What | Needs | When built, also connect |
|---|---|---|---|
| 1 | **R1** rehearsal companion ✅ 0.54.0 | gig, schedule, members | Department from the gig function; reports printable |
| 2 | **R2** camera and LTC sync ✅ 0.55.0 | R1 | Session clock type shown in the report |
| 3 | **D1** DMX calculator and dipswitches ✅ 0.56.0 | DMX patch | DMX patch column and walk-through (by light plot position) |
| 4 | **On-site mode** and Tools split (Plan / On site), personal auto setting ✅ 0.57.0 | R1, D1, field kit | Call sheet, rehearsal notes, walk-through, input list, scanning, settings |
| 5 | **Tasks** [6]: **T1** gig tasks, My tasks, R1 notes → tasks, notification ✅ 0.58.0; **T2** organisation tasks, checklist templates ✅ 0.59.0 | — | R1 notes → tasks ✅, inventory repairs ✅, On-site mode ✅; gig templates (step 25) will copy tasks |
| 6 | **Custom statuses and gig types** [10], **custom fields** [12] | — | Gig lists, calendar, filters, export, import |
| 7 | **Crew rates** [3] | crew, functions | Crew calls and job posts (fee), quotes (labour lines) |
| 8 | **Time registration** [2] | crew rates, schedule | Gig crew tab, calendar feed, export |
| 9 | **Leave requests** [5] | availability | Clashes, Find crew "free", time registration |
| 10 | **Gig finance overview** [4] | 7, 8, quotes, subrentals | Dashboard, reports |
| 11 | **Invoices** [1] | accepted quotes, 10 | Quotes, contacts, guest threads, client links |
| 12 | Damage charged to the client [15], **payments** [22] | invoices, repairs | Repairs, quotes, invoices |
| 13 | **A1** speaker library | catalogue | F4 sound calculator; later P1 and RG3 |
| 14 | **MVR/GDTF import** [29] | light plot, DMX patch | Fixture weights and power for P1 and RG1 |
| 15 | **P1–P2** power and cables | light plot, A1, 14 | Light plot power estimate, equipment (distros, cables) |
| 16 | **E-signature** [16] | — | Quote acceptance, delivery notes, crew contracts, rigger sign-off |
| 17 | **RG1–RG2** weights, points, hoists, trusses, bridles | light plot, catalogue (Q3) | Light plot "rigging not checked", bridle pocket tool |
| 18 | **RG3** line arrays | A1, F4, RG1 | Sound system calculator |
| 19 | **RG4** rigging plot, report, sign-off (Q4) | RG1–RG3, job board, 16 | Gig files, on-site view, job board prefill |
| 20 | **RG5** suggestions; **P3** one-line and on-site power checklist | RG4, P2 | On-site mode |
| 21 | **A2** coverage map, **A3** prediction and measurement files | A1, F4 | Gig files, tuning sheet print |
| 21b | **A4–A6** own simulator, by level of detail | A1–A3, RG1, RG3 | A2 map, system calculator, tuning sheet |
| 22 | **Shareable rider / advance page** [28] | stage plot, inputs, patch, P, RG | Includes power and rigging summaries |
| 23 | **Vehicles and transport** [8], **appointments** [9] | reservations, item weights | Packing list (per vehicle), calendar, clashes |
| 24 | **Reports** [11] | 10, 11, 23 | Dashboard |
| 25 | **Gig templates** [7] | everything above | Copies schedule, positions, equipment, tools, tasks, custom fields |
| 26 | **Client portal** [13], **online booking requests** [14] | invoices, quotes | Quote links, guest threads |
| 27 | Freelancer side: **contracts** [25], **invoicing** [26], **work history** [24] | 7, 8, 16 | Crew profiles, crew calls |
| 28 | **Public API and webhooks** [17] | stable data model | Cueing app, accounting sync [18], payroll export [23], MCP [19] |
| 29 | **R3** cueing app bridge (live) | R1, tasks, API | Cueing app roadmap starts here |
| 30 | Rental network [21], RFID [20] | API, inventory | Subrentals |

Rule for every PR from now on: its description says which earlier features it connected to (or
why none), and CHANGELOG lists those connections.

### How Tasks T1 works (0.58.0)

| Piece | How it works |
|---|---|
| Data | `tasks` (migration `20261129000000_tasks.sql`): on a gig or for an organisation, title, notes, assignee, due date, checklist (JSON, up to 50 items), open/done with who and when, where it came from (a rehearsal note), soft removal. At most 2000 per gig (or per organisation, for its own tasks) |
| Who may | Read: the gig's members (or the organisation's, for organisation tasks). Add, edit, remove: production managers and organisation admins. Tick: anyone who writes on the gig and the assignee; the trigger lets them change only the status and checklist ticks |
| Checks | The assignee must be on the gig (or in the organisation); a note becomes a task on its own gig only, once |
| Notification | `task_assigned` when someone else gives you a task or changes who it's for; a direct kind, sent even when the organisation is muted |
| Screens | Gig → Tasks (`TasksTab`), My tasks (`/tasks`), the rehearsal session's "Make a task" button. Pure helpers in `src/lib/tasks.js` with tests; database checks in `supabase/tests/tasks.sql` |

### How Tasks T2 works (0.59.0)

| Piece | How it works |
|---|---|
| Templates | `task_templates` (migration `20261130000000_tasks_t2.sql`): name, notes, items (texts of up to 200 characters, up to 50). Members of the organisation read them; admins and members manage them; removing only marks them. At most 200 per organisation. Database checks in `supabase/tests/tasks_t2.sql` |
| Repairs | `tasks.repair_id`: set when the task is made, never changed; the repair must be the organisation's, the task the organisation's own (not a gig's); one live task per repair |
| Screens | Organisation → Tasks (`OrgTasksPage`, with the templates tab in `TaskTemplates`), "Start from a template" in the task form, "Make a task" in the repair window, the tasks card and tile in On-site mode |

## References

- Earwig: [earwig.io](https://earwig.io/), [how to use](https://earwig.io/howto.html), [FAQ](https://earwig.io/faq)
- Timecode in the browser: [LTC.wasm](https://github.com/JorenSix/LTC.wasm), [SMPTE decoding in the browser](https://0110.be/posts/SMPTE_decoding_in_the_browser)
- Hoist classes: [CMCO on SQP2, D8, D8+ and C1](https://cmco.com/en-us/resources/blog/breaking-down-sqp22018-requirements), [Tuchler chain hoists](https://www.tuchler.net/en/products/chain-hoists.html)
- Bridles: [two-leg tension reference](https://open-exam-prep.com/study-guides/nccco-rigger-level-2/balanced-forces/two-leg-tension), [4Wall on bridles](https://www.4wall.com/help/what-is-a-bridle-in-rigging--n-213), [ETC load calculations](https://support.etcconnect.com/ETC/Rigging/General_Information_-_Rigging_Systems/Load_Calculations_-_Behind_the_Numbers_-_Rigging)
- Line array calculators: [JBL Line Array Calculator III](https://jblpro.com/fr/products/line-array-calculator-iii), [NEXT LA210x rigging](https://www.prosoundweb.com/next-proaudio-introduces-new-la210x-medium-format-line-array/) (X-Rig itself could not be opened from here)
- Acoustic simulation: [EASE Focus 3](https://afmg.eu/node/32), [CODA on EASE Focus](https://codaaudio.com/softwares/ease-focus-ii/), [RCF GLL files](https://rcf.it/en/-/new-gll-speaker-definition-files)
- DMX tools: [DMXRef review](https://techietalk.co.uk/articles/dmxref-review), [DMXCalc review](https://techietalk.co.uk/articles/dmxcalc-review), [DMX Toolbox](https://apps.apple.com/mx/app/dmx-toolbox/id6474448260), [Patch List Calculator](https://apps.apple.com/it/app/patch-list-calculator/id6764568918)

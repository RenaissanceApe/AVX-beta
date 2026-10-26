# New tools: plan (2026-10-26)

The next tools after the built field tools (F1–F4: stage plot, input list, patch, DMX patch, light
plot, sound system calculator). Asked for on 2026-10-26: a **rehearsal companion**, a **rigging and
load calculator**, an **electrical load** tool, **sound system calibration / acoustic simulation**,
and a **DMX calculator with dipswitch converter**; plus the question of where prep tools and
show-time tools should live.

Everything here is a plan. Nothing is decided until you say so; open questions are marked **Q**.

---

## 1. Prep tools and show tools: where they live

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

**Q1:** Is "On site" mode switched by hand, automatic on gig days, or both? (Suggested: both, with
the automatic part off by default per organisation.)

---

## 2. Rehearsal companion

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

**Q2:** Is the cueing app going to share AVX's account and data (same login, same gigs), or be a
separate product that imports/exports files? It changes R3. (Suggested: same account, its own app,
talking to AVX through the API in COMPETITOR_RESEARCH #17.)

---

## 3. DMX calculator and dipswitch converter (small, do early)

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

LumiStage could not be found online yet (see COMPETITOR_RESEARCH.md); once you share what it does,
P1–P3 will be compared with it.

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

**Q3:** Which hoists and trusses do you own or use most? Their tables are entered first. Load tables
are published by the manufacturers (Prolyte, Eurotruss, Litec, Global Truss…). **Q4:** Do you want
the RG reports signed off in AVX by a named rigger (a "checked by" step with date), so the plot on
site shows it was approved?

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
| **(Stop)** | Revisit only if a manufacturer offers its data for us to use directly | — |

**Q5:** Agree to stop at A1–A3?

---

## Suggested order

| # | What | Why here |
|---|---|---|
| 1 | Settings layout (asked) | Small, pending UI debt |
| 2 | Crew network N5 | Finishes the phase in progress |
| 3 | **R1, R2** rehearsal companion | Asked as the next tool; R2 is the distinctive bit |
| 4 | **D1** DMX calculator | Small, high daily use, makes the "On site" group real |
| 5 | **On site mode + Tools split** (section 1) | Once there are enough on-site tools to group |
| 6 | **A1** speaker library | Needed by power and rigging |
| 7 | **P1–P2** power | Builds on the light plot's power estimate |
| 8 | **RG1–RG2** rigging basics | Weights, reactions, hoists, trusses, bridles |
| 9 | **RG3–RG5** line arrays, plot, suggestions | The heavy part |
| 10 | R3, P3, A2, A3 | Bridges and polish |

Interleaved with the business features ranked in COMPETITOR_RESEARCH.md (crew rates → time
registration → finance → invoices). **Q6:** Which goes first after the rehearsal companion: field
tools (4–9) or the business loop?

## References

- Earwig: [earwig.io](https://earwig.io/), [how to use](https://earwig.io/howto.html), [FAQ](https://earwig.io/faq)
- Timecode in the browser: [LTC.wasm](https://github.com/JorenSix/LTC.wasm), [SMPTE decoding in the browser](https://0110.be/posts/SMPTE_decoding_in_the_browser)
- Hoist classes: [CMCO on SQP2, D8, D8+ and C1](https://cmco.com/en-us/resources/blog/breaking-down-sqp22018-requirements), [Tuchler chain hoists](https://www.tuchler.net/en/products/chain-hoists.html)
- Bridles: [two-leg tension reference](https://open-exam-prep.com/study-guides/nccco-rigger-level-2/balanced-forces/two-leg-tension), [4Wall on bridles](https://www.4wall.com/help/what-is-a-bridle-in-rigging--n-213), [ETC load calculations](https://support.etcconnect.com/ETC/Rigging/General_Information_-_Rigging_Systems/Load_Calculations_-_Behind_the_Numbers_-_Rigging)
- Line array calculators: [JBL Line Array Calculator III](https://jblpro.com/fr/products/line-array-calculator-iii), [NEXT LA210x rigging](https://www.prosoundweb.com/next-proaudio-introduces-new-la210x-medium-format-line-array/) (X-Rig itself could not be opened from here)
- Acoustic simulation: [EASE Focus 3](https://afmg.eu/node/32), [CODA on EASE Focus](https://codaaudio.com/softwares/ease-focus-ii/), [RCF GLL files](https://rcf.it/en/-/new-gll-speaker-definition-files)
- DMX tools: [DMXRef review](https://techietalk.co.uk/articles/dmxref-review), [DMXCalc review](https://techietalk.co.uk/articles/dmxcalc-review), [DMX Toolbox](https://apps.apple.com/mx/app/dmx-toolbox/id6474448260), [Patch List Calculator](https://apps.apple.com/it/app/patch-list-calculator/id6764568918)

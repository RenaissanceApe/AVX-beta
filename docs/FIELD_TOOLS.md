# Field tools: plan

Status: **F1–F4 built**: F1a (0.36.0) Tools tab, organisation switches, shared show model, input list, Updates tab; F1b (0.37.0) stage plot; F2 (0.38.0) patch and DMX patch; F3 (0.39.0) light plot; F4 (0.40.0) sound system calculator. All four stages built; more tools as they are asked for. Decided 2026-10-20. Optional tools for the technical side of a gig (stage
plot, input list, patch, light plot, DMX patch, sound system calculator) that share their data,
so a stage plot can produce a channel list and a light plot a DMX patch. An ever-growing set,
added one tool at a time, without making AVX harder to use.

## Decisions

- **One "Tools" tab per gig** (decided 2026-10-20). Not in the main menu: stage plots and patches
  always belong to a show. The tab lists only the tools this gig uses, plus **Add a tool**; with
  none in use it explains what is there and offers the list. Nobody who doesn't need them sees
  more than one quiet tab.
- **Available at any gig status**, drafts included, so a production manager can sketch a stage
  plot while quoting (the plot can suggest quote lines).
- **The organisation chooses its tools:** admins turn on only what the company does (a sound
  company never sees the light plot). Each tool is a module.
- **Who:** production managers and organisation members edit; crew read the tools in use, on
  their phone, and can keep them offline like files.
- **Phone and computer:** drawing is a computer or tablet job; on a phone, tools are for reading
  on site and small edits (tick a channel, change a note).
- **The gig's tabs stay manageable:** when Tools arrives, Feed and Activity merge into one
  "Updates" tab, so the gig keeps 8 tabs.

## One model of the show, shared by the tools

Each gig gets one shared description of the show that every tool reads and adds to:

| Data | Comes from | Used by |
|---|---|---|
| Stage size, trim height, positions | Stage plot | Light plot, system calculator |
| Instruments, mics, DI, stands, monitors | Stage plot | Input list → patch |
| Fixtures and positions | Light plot | DMX patch (universes, addresses), power load |
| Venue measurements, speaker positions | System calculator | Delays, coverage (marked as estimates) |
| Anything placed that is in the catalogue | Any tool | Offered as lines in the gig's Equipment (availability, packing list, scanning) |

The last row is what standalone tools (StageKit and similar) can't do: what is drawn becomes
what is booked, packed and scanned.

Every tool also: prints and saves to PDF, saves into the gig's files, can be shared with the
venue or the artist through a private link (like quotes), and can be saved as a **template**
(a touring band's stage plot, a standard rig).

## Stages (one PR each)

| Stage | Scope |
|---|---|
| **F1a** ✅ (0.36.0) | Tools tab, organisation switches, the shared show model (table), **input list** (print, offline, line check, mics to equipment); Feed + Activity become Updates |
| **F1b** ✅ (0.37.0) | **Stage plot** (grid and symbols) that fills the input list and the show model's stage size |
| **F2** ✅ (0.38.0) | Patch (stage boxes, splits) and **DMX patch** |
| **F3** ✅ (0.39.0) | **Light plot** (truss, positions, fixtures from the DMX patch and the catalogue, power) |
| **F4** ✅ (0.40.0) | **Sound system calculator** (delays, time alignment, coverage), clearly labelled as estimates |
| later | More tools as they are asked for (rigging weights, power distribution, RF plan…) |

Each stage ships its glossary words, hints and a guide with screenshots (the help rule).

## How F1a works

| Piece | How it works |
|---|---|
| Organisation | `organisations.field_tools` lists the tools the company uses (both F1 tools on by default). Settings → Field tools; a tool not built yet shows "coming soon" |
| Gig | `gig_tools` (gig, tool) is what the Tools tab lists. Editors add a tool from those the organisation uses; removing it from the gig keeps its data |
| Who | `private.can_edit_tools(gig)`: the gig's managers and the organisation's admins and members. `private.can_see_tools(gig)`: also everyone on the gig. Crew only see the Tools tab once the gig uses a tool |
| Show model | `gig_show` (one row per gig, `stage` jsonb: width, depth, trim, notes). Created now; the stage plot (F1b) is the first to write it |
| Input list | `gig_inputs`: channel (unique per gig, 1–512), source, mic or DI, optional catalogue item, stand, 48V, stage box, notes, checked (line check), `plot_ref` for F1b. `order_inputs(gig, ids)` renumbers 1, 2, 3… in a new order. Print at `/gig/:id/inputs`; both work offline from the last copy |
| Mics → equipment | Inputs linked to catalogue items are counted; "Add mics and DIs to equipment" raises or adds the gig's equipment lines to match (admins and members) |
| Updates | The Feed and Activity tabs are now one "Updates" tab (Posts / History). Old `?tab=feed` and `?tab=activity` links still work |

Checks: `supabase/tests/field_tools.sql`.

## How F1b works (stage plot)

| Piece | How it works |
|---|---|
| Stage | Width and depth in the show model (`gig_show.stage`), 2–40 m × 2–30 m, 10 × 6 m until set. Drawn from above with the audience at the bottom and a 1 m grid |
| Things | `gig_plot_items`: kind, name, x (metres from the left as the audience sees it), y (metres from the front), rotation 0/90/180/270, optional catalogue item, notes; up to 300 per gig |
| Library | `src/lib/stagePlot.js`: drum kit, vocal mic, guitar amp, bass amp, keyboard, acoustic guitar, DI box, monitor wedge, musician, riser, power drop, text. No free drawing (decided as the first editor) |
| Editing | Drag with a finger or the mouse, or select a thing and use the arrow keys or buttons (25 cm; Shift 1 m), R rotates, Delete removes (with Undo). Changes are saved half a second after the last move |
| Input list | Symbols that make sound carry their channels (a drum kit 7, a keyboard 2…). "Send to the input list" adds the channels not there yet (`gig_inputs.plot_ref` = item id:n), numbered after the last channel, and adds the input list to the gig if needed. It never changes existing lines |
| Equipment | Things linked to catalogue items can be added to the gig's equipment, as from the input list |
| Reading | Crew see the drawing and the "On stage" list (also offline); print at `/gig/:id/plot` (landscape, black on white) |
| Accessibility | Each thing is a button with its name and position; the drawn names are hidden from screen readers, and the list under the drawing says the same in words |

Checks: `supabase/tests/stage_plot.sql`.

## How F2 works (patch and DMX patch)

| Piece | How it works |
|---|---|
| Stage boxes | Kept in the show model (`gig_show.audio.boxes`: name, number of inputs 1–128, split to monitors). Added, renamed, resized and removed in the Patch tool |
| Sockets | The socket stays on the input line (`gig_inputs.stage_box`, "SB1-03"), so the input list and the patch always agree. Each socket picks its line; "Fill the free sockets" places the lines without one in channel order. Two lines in a socket are flagged; removing a box leaves its lines "without a socket" |
| Fixtures | `gig_fixtures`: name, type, mode, footprint (channels), universe 1–256, address 1–512 (or none yet), position, optional catalogue item, notes; up to 1000 per gig. The database refuses a fixture that runs past channel 512 |
| Addressing | "Add fixtures" adds several of a type, numbered, each on the next free address (on the next universe when one is full). Overlapping channels are a warning, not an error. "Readdress in order" repacks a universe from 1 (with a warning first) |
| Prints | `/gig/:id/patch` (box by box, socket by socket, 48V shown) and `/gig/:id/dmx` (universe by universe), black on white, also offline |
| Defaults | The two tools join the default tools; organisations that never changed theirs get them too |

Checks: `supabase/tests/patch_dmx.sql`.

## How F3 works (light plot)

| Piece | How it works |
|---|---|
| Positions | Kept in the show model (`gig_show.lighting.bars`): name, kind (truss, pipe, ladder, floor), centre in metres (same axes as the stage plot; negative y is over the audience), length, across or up-and-down, trim height, phase. The drawing shows the stage and everything on it with 1.5 m around |
| Fixtures | The DMX patch's fixtures. One hangs on a position when its "Position" is the position's name (renaming a position renames it on its fixtures). Without a place of its own it is spaced evenly along its position, in DMX order; dragged, it keeps `plot_x`/`plot_y`. Dropped within 75 cm of a position it hangs there. Each shows its universe/address |
| Symbols | spot, wash, beam, profile, par, blinder, strobe, batten, haze, other. Guessed from the fixture type unless chosen (`gig_fixtures.symbol`); the print has a legend |
| Adding | "Add fixtures here" on a position opens the DMX patch's form with the position filled in (and adds the DMX patch to the gig if needed). Fixtures already in the patch are hung from the "not on the plot" list |
| Power | `gig_fixtures.power_w` and `weight_kg`, copied from the catalogue item when not typed (also when the item changes). Per position: fixtures, watts, amps, kg. Supply in `gig_show.lighting.supply` (single or three phase, amps per phase, volts). Positions with a phase load it; the rest is shared evenly. Warning above 80% and above 100%; labelled as an estimate, fixtures without a figure count as 0 W |
| Removing | Removing a position (with Undo) leaves its fixtures in the DMX patch, off the plot |
| Print | `/gig/:id/lights` (landscape, black on white): drawing, legend, fixtures per position, power per phase. Offline copies like the other tools |

Checks: `supabase/tests/light_plot.sql`.

## How MVR and GDTF work (step 14)

| Piece | How it works |
|---|---|
| Import | "Import MVR" in the DMX patch and the light plot. The file is read in the browser (`src/lib/mvr.js`, fflate); nothing is saved until Import. Each fixture brings its name, type, mode, footprint, universe/address (absolute numbers or "universe.address", first DMX break), fixture number, place and height. Footprints come from the GDTF files inside the MVR, then from the matched item's fixture type, then from what is typed per type; fixtures without one are left out (and counted) |
| Matching | One row per fixture type: the catalogue item it is, suggested by the same GDTF fixture type, then the same name, then a name that contains the other. Matched fixtures take the item's weight and power (the F3 trigger) and count for "Add to equipment". The import has its own match step: the IM1 fix panel isn't built yet |
| Places | MVR's origin is taken as the middle of the stage's front edge (y towards the back, z up, millimetres). Each fixture keeps its place (`plot_x`, `plot_y`) and height (`height_m`). Positions come from the fixture's `Position`, else the group or truss it is in; a position the plot hasn't got becomes a bar along its fixtures (across or up-and-down, floor below 0.5 m) |
| Importing again | `gig_fixtures.mvr_uuid` keeps the fixture's MVR id (unique per gig): the same fixture imported again is updated, not added twice. Up to 1000 fixtures per gig |
| Programs | Vectorworks: AUXData positions, GDTFSpec without ".gdtf", numbers in UnitNumber. grandMA3: GroupObjects (the group is the position), parts of multi-instance fixtures without their own address are left out, absolute addresses. Capture: fixtures inside their Truss. Transforms on layers, groups and trusses are multiplied through |
| GDTF on items | Inventory item → ⋯ → "GDTF fixture-type file": modes and their footprints (pixel cells counted at their offsets), weight and power go into `fixture_types` (one per item, the file in the private `fixture-types` bucket); the item's own weight and power take the file's when ticked. The MVR import can do the same for matched items. The DMX patch's form offers the item's modes and fills the footprint |
| Export | "Export MVR" downloads the gig's fixtures (each on its place or spaced along its bar, at its height or its bar's trim), positions as AUXData, addresses as absolute numbers, and the GDTF files stored on the items. Fixtures without a GDTF file are named "<type>.gdtf"; AVX also writes each fixture's type and footprint in its own UserData, so an AVX → AVX round trip keeps them |
| Samples | `src/lib/mvrSamples.js` builds small MVR and GDTF files from the standards in each program's style; `npx vite-node scripts/mvr-samples.mjs` writes them to `docs/samples/mvr/`. The unit tests (`mvr.test.js`) read them and check the round trip import → export → import |

Checks: `supabase/tests/mvr_gdtf.sql`. Weight and power from GDTF are the manufacturer's figures, an aid that a competent person must check.

## How F4 works (sound system calculator)

| Piece | How it works |
|---|---|
| Data | The show model's `gig_show.system`: air temperature, Haas offset, ear height; sources (name, kind main/sub/delay/fill, place across/front-back/height in the stage plot's metres, maximum SPL at 1 m, horizontal angle, number of boxes, extra delay typed by hand); listening positions (name, place). The first listening position is the reference (usually FOH). Results are worked out in the app (`src/lib/systemCalc.js`), nothing is stored |
| Delays | Mains 0. Delays and fills follow their nearest main: travel time from it (speed of sound from the temperature) plus the Haas offset. Subs are lined up with their nearest main at the reference position; when the subs arrive later, it says to delay the main instead. Any extra typed delay is added |
| Levels | Per listening position and source: −6 dB per doubling of distance from the 1 m rating, +10·log10(boxes), −12 dB outside the box's angle, −20 dB behind it (subs spread all round); the total and the mains' level added as power |
| Checks | At each position, a delay or fill within 10 dB of its main is checked: arriving before it ("the sound will seem to come from the delay"), or more than 30 ms after it ("heard as an echo") |
| Coverage | How wide each box covers at the farthest listening position in front of it (not for subs or boxes wider than 160°) |
| Catalogue speakers (A1) | A source can take its maximum SPL and horizontal angle from a speaker in the catalogue instead of typed numbers; they are copied into the source (`item_id`, `item_name`), so crew get the same results, and "Update from catalogue" appears when the item changes |
| Estimates | Every screen and the print say they are estimates (straight lines, open air, no reflections, boxes aimed straight at the audience), to plan with and then measure on site |
| Print | `/gig/:id/system` with the plan, sources and listening positions. Offline copies like the other tools; crew read it |

Checks: `supabase/tests/system_calc.sql`.

## How the power tool works (P1, step 15)

| Piece | How it works |
|---|---|
| Catalogue | Items have electrical fields (Inventory → item → Edit → Electrical): `power_w` stays the maximum watts; new `power_typical_w`, `power_factor` (0.30–1), `inrush_a`, `current_a` + `current_v` (D77: a datasheet that gives amps, not watts; they count as amps × volts in VA and no watt figure is made up), `connector_in`, `connector_out`, and for distros `distro` (`{ inputs: [{ connector }], outputs: [{ id, label, connector, phase L1/L2/L3/3P, breaker_a, rcd_ma }] }`). Connectors: Schuko 16 A; CEE 16, 32, 63 A single- and three-phase; CEE 125 A; Powerlock; Socapex; powerCON; powerCON TRUE1 (`src/lib/power.js`, `CONNECTORS`) |
| Import | The items import guesses the columns (typical power, power factor, inrush, amps, voltage, connector in/out); connectors are read as rental lists write them ("CEE 32/3", "CEE 32A 5P", "CEE 16A blue"). Refused here: values outside the limits (`powerRange`), amps without volts (`powerNeedVolts`), typical above max (`powerTypical`); the database's `price_items_power_check` shows as `powerSpec` |
| Data | `gig_show.power`: the supply (venue or generator, name, volts phase–neutral, 1 or 3 phases, amps per phase, 50/60 Hz; Portugal's 230/400 V 50 Hz by default), the generator margin, distros (from the catalogue or blank; each plugged into the supply, another distro's output or nothing), loads typed by hand (watts each, how many, power factor, three-phase or not), `assign` (load → `{ distro, output }` or `{ phase }` straight on the supply) and `figures`, a copy of the catalogue items' electrical figures refreshed when an editor opens the tool, so crew who can't read the catalogue see the same numbers |
| Loads | Fixtures from the light plot and DMX patch (`gig_fixtures`), the sound system's sources with a catalogue speaker (× their count), the gig's equipment with electrical figures that isn't already one of those (distros left out), and loads typed by hand. A fixture without a power figure counts as 0 W and is flagged |
| Maths | Phase currents are added up as they are (the cautious sum): VA ÷ volts on one phase, VA ÷ 3 × volts per phase for a three-phase load. The neutral is the phasor sum of the three phases (120° apart, each lagging by its loads' power factor); harmonics are not included and the report says so. A single-phase distro (fed from one phase) puts all its outputs on that phase. Ratings: an output's breaker (or its connector's rating); a distro's input connector and the breaker feeding it, the smaller; the supply's amps. Warnings at 80% and above 100%; phase balance as (largest − smallest) ÷ largest, flagged above 20% |
| Generator | Sized from the busiest phase × 3 (× 1 single-phase) × volts, with all loads (those not plugged in spread over the phases), plus the margin (25% by default), rounded up to a common size (10–2000 kVA); above that it says more than one is needed |
| Status | Each distro and load: Connected (plugged in all the way up to the supply), Partly (plugged into a distro that isn't), Not connected; shown as a word with a square (`StatusBadge`), never colour alone |
| Screens | Gig → Tools → Power plan (tool id `power`). Report: `/gig/:id/power`, also On-site mode's Power plan tile (read-only), offline from the last copy. "Save to gig files" puts the report as a PDF in the Files tab (`src/lib/powerPdf.js`). The light plot's power section, and its print, show the fixtures' figures from the plan once the gig has one (`fixtureShare`) |
| Estimates | Every screen, the report and the PDF say these are estimates for a qualified electrician, who checks and connects the supply, distros and cables |
| Cables (P2) | `gig_show.power.cables`: runs of a kind (power, DMX, speaker, signal), a cable type from the proposed set or (power) any H07RN-F size, length, how many alike, how it's laid (spread out, bundled with n others, n layers on a drum), the air around it, a label, and for power the link it carries (`d:<distro>` its feed, `o:<distro>/<output>` an output); other kinds have a typed from and to (`src/lib/cables.js`) |
| Voltage drop | ΔU = b × R60 × L × I, b = 2 single-phase, 1 three-phase (phase to neutral), I the busiest phase of the link, R at 60 °C (R20 × (1 + 0.00393 × 40)); reactance left out, cos φ = 1. Added up from the supply to the end of each run (the worst feed run on each link). Warning above 3 %, over above 5 % |
| Capacity | The datasheet's mobile-use amps × the factor for the air around (30/40/50 °C; above 50 no figure), bundling, drum layers and (Socapex, 12 loaded cores) many cores. Over when the link's current is above it; a check when the breaker in front is larger than it (the cable isn't protected from overload) |
| Sources | General Cavi H07RN-F datasheet "Model Product: 250-251 - 20250206" (R20, mobile amps at 60 °C); Lapp Technical Tables T12 (PDF of 2021-08-24), tables 12-2, 12-3, 12-5, 12-6 (from DIN VDE 0298-4:2013-06); 0.00393 /K (BS EN IEC 60228:2024 Annex B, as quoted by mycableengineering.com); breaker curves B 3–5 × and C 5–10 × In from Hager's catalogue (IEC 60898-1). Each is noted beside its values in the code |
| Cable list | Runs grouped by cable and length (`cableList`); each line is matched to a stock-tracked catalogue item with the same name (case, spaces and the "m" ignored) or one picked by hand (`power.cableItems`); editors create missing items (counted in bulk, category Cables) and add the list to the gig's equipment, only what's missing, so it reaches the packing list |
| Placement suggestion | Gig → Power plan → Loads → "Suggest where to plug in" (`src/lib/powerBalance.js`): balance the phases (biggest load first, where the busiest phase stays lowest) or fill each output up to a reserve (first output that fits), never above the reserve (80 % by default) on an output, the distros above it or the supply; only outputs of connected distros (without any, the supply's phases); loads already plugged in stay unless asked. The changes and the phases before and after are shown; nothing changes until "Apply" (with undo) |
| Inrush | Loads carry their datasheet inrush × how many; per output (and per phase for loads wired straight to the supply) the peaks are added up and compared with the breaker: above 3 × it may trip a B-curve breaker, above 5 × a C-curve one. Loads without a figure are counted and said |
| Labels | `/gig/:id/power/labels`: cables 50 × 25 mm, distros 100 × 50 mm (the D31 sizes), on pre-cut A4 sheets or one per page on a roll; a label per cable (× how many), with its length and where it goes, and per distro with its feed and outputs |
| Report | The report and its PDF add the inrush groups, the cable runs (current, capacity, drop and total, state) and the cable list, with the method and sources |

Checks: `supabase/tests/power.sql`; unit tests in `src/lib/power.test.js` (single and three phase, unbalanced neutral, headroom, generator), `src/lib/importer.power.test.js`, `src/lib/cables.test.js` (voltage drop, capacity and its factors, the checks on a plan, the cable list) and `src/lib/powerBalance.test.js` (balancing, reserve, inrush). The tool id needs `20270106000001_tool_ids_power_rigging.sql`, run by hand.

## How the print QR works (U6)

Every gig print (call sheet, input list, stage plot, patch and DMX sheets, light plot, system, power
plan, packing list, rehearsal report) ends with one shared `<PrintFooter />`
(`src/components/PrintFooter.jsx`): a small QR in the bottom corner and the date and time it was
printed. The link comes from `printLink()` (`src/lib/printLink.js`): the app's own address for the
current page, with any query value that looks like a secret dropped, so it needs a sign-in and the
same access as the page. Later prints (rigging report RG4, work areas 20b) get it by adding
`<PrintFooter />`. The quote print, the wrap-up and the reports pages have none (D-question in
docs/PENDING.md).

## Saving when two people edit (BF5)

- **Checklist ticks** go through `public.set_task_checklist_item(task, item id, done)`
  (migration `20270125000000_task_checklist_item.sql`): one statement sets that item's `done`
  inside `tasks.checklist` and returns the new list and `updated_at`. Who may tick is the same as
  the tasks policy (`private.task_can_tick`), plus the two-step sign-in check. In the app,
  `tickChecklistItem` (`src/lib/queuedSaves.js`) queues ticks per item, and `tickTaskItem`
  (`src/components/tasks/TaskParts.jsx`) shows the tick at once and takes the server's list when
  the task's last tick is back. Adding, removing and renaming items still saves the whole list
  from the edit form, with the `updated_at` guard (`updateIfUnchanged`).
- Items are identified by the `id` the app gives them when the checklist is written
  (`checklistFromText`); it now also gives an id to an old item without one, and never reuses an
  id for two items.
- **Field tools** save through `saveShow(gigId, values)`. Each tool reads `updated_at` with
  `gig_show` and reports it with `noteShowLoaded`. A save is an update that only matches if
  `updated_at` is unchanged (`updateIfUnchanged`, keyed by `gig_id`), or the first insert when the
  gig has no row yet (refused if someone else made it first). After each save of its own, the
  device moves its copy of `updated_at` on. Saves for one gig go out one at a time (one queue per
  gig, BF1's queue), so a device's own quick changes never conflict with each other. On a
  conflict the tool shows the stale-save toast with Reload and leaves the screen as it is.
- The guard is per gig, not per tool: `gig_show` has one `updated_at` for all its parts, so a
  change to the patch makes an open light plot's next save ask for a reload (D168).

## Open questions

1. **When:** after H5 (field kit) and before switching (S1); started 2026-10-20. **Decided 2026-10-21: all field tools (F1–F4) first, then switching.** Done: F1–F4 built by 0.40.0.
2. Drawing on screen: a simple grid-and-symbols editor first (no free drawing), symbols from a
   small built-in library plus the catalogue.

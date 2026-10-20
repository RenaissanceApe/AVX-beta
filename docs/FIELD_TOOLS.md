# Field tools: plan

Status: **F1 built**: F1a (0.36.0) Tools tab, organisation switches, shared show model, input list, Updates tab; F1b (0.37.0) stage plot. F2 (patch, DMX patch) next. Decided 2026-10-20. Optional tools for the technical side of a gig (stage
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
| **F2** | Patch (stage boxes, splits) and **DMX patch** |
| **F3** | **Light plot** (truss, positions, fixtures from the catalogue, power) |
| **F4** | **Sound system calculator** (delays, time alignment, coverage), clearly labelled as estimates |
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

## Open questions

1. **When:** after H5 (field kit) and before switching (S1); started 2026-10-20 (the owner may move it).
2. Drawing on screen: a simple grid-and-symbols editor first (no free drawing), symbols from a
   small built-in library plus the catalogue.

# Field tools: plan

Status: **planned** (decided 2026-10-20). Optional tools for the technical side of a gig (stage
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
| **F1** | Tools tab, organisation switches, the shared show model; **stage plot** and **input list**; Feed + Activity become Updates |
| **F2** | Patch (stage boxes, splits) and **DMX patch** |
| **F3** | **Light plot** (truss, positions, fixtures from the catalogue, power) |
| **F4** | **Sound system calculator** (delays, time alignment, coverage), clearly labelled as estimates |
| later | More tools as they are asked for (rigging weights, power distribution, RF plan…) |

Each stage ships its glossary words, hints and a guide with screenshots (the help rule).

## Open questions

1. **When:** proposed after H5 (field kit) and before switching (S1); the owner may move it.
2. Drawing on screen: a simple grid-and-symbols editor first (no free drawing), symbols from a
   small built-in library plus the catalogue.

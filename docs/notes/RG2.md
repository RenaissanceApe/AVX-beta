# RG2: Truss tables, bridles and rigging hardware

## Changelog
### Added
- **Truss type on each rigging line** (RG2): choose the truss model from the manufacturers' load
  tables (Fantek, Global Truss, Prolyte). Each span between hang points gets a pass/fail for UDL,
  CPL, TPL and QPL and an estimated deflection (with an optional deflection limit), and the report
  names the table, its edition and who checked it. Only a table an AVX admin has checked for that
  exact edition gives a pass/fail; until then the line says plainly that no table is checked yet
  and links to the review. Spans between two table rows use the next longer row, and a span longer
  than the table gets no pass/fail: values are never interpolated upwards or extrapolated.
  Overhangs and lines on three or more points are flagged for a structural check.
- **Truss table review** (`/admin/truss`, RG2): every table with its source document, edition,
  SHA-256, the manufacturer's conditions and all its rows. An AVX admin (two-step sign-in) ticks
  each row against the document and marks the table checked, or blocks it with a reason; a mark
  can be taken back (with a reason) but never edited, and a new edition needs a new check. The
  marks are kept in the database for every organisation. Everyone signed in can read them.
- **Bridles** (RG2): in Gig → Tools → Rigging and in My work → Tools. Two legs from two beam
  points to a pick point, set by the leg lengths or by where it should hang (beams at different
  heights too): leg lengths, angles, the angle between the legs with a warning above 120°, the
  tension in each leg and the sideways pull on the beams.
- **Hardware list** (RG2): shackles, slings, steels and spansets per gig, each with the WLL from
  its tag (never filled in for you), how many and where the value came from. Each bridle leg picks
  its weakest piece and is checked against its WLL; the list warns when the bridles use more
  pieces than it holds.
### Connected
- RG1 truss lines: truss type per line; "Use its weight" copies the weight per metre from the
  table; line-array picks hung from a line count as point loads in its truss check.
- Pocket tools: the bridle calculator.
- Gig equipment: "Add from the equipment" brings the gig's shackles, slings, steels and spansets
  (English and Portuguese names) into the hardware list with their quantities.
- Settings → AVX reviews (AVX admins only): a button to the truss table review.

## Roadmap
| Step 17b: RG2 truss tables, bridles and hardware (truss type per RG1 line with pass/fail per span from AVX-checked tables only, the truss table review with database marks, bridle calculator in the rigging tool and Pocket tools, hardware list with WLLs; connected to RG1 lines, pocket tools and gig equipment) | <version> | [docs/TOOLS_PLAN.md](docs/TOOLS_PLAN.md), "How RG2 works" |

Also: the "Truss tables: mark checked…" row (D12) now happens on the review screen by an AVX admin.

## Pending: test lines (section 2)
- **Truss type, nothing checked yet (RG2):** Gig → Tools → Rigging, a line, Truss type → Prolyte H30V: it says no truss table has been checked yet and links to the review; no pass/fail is shown. Fantek EC40 and Global Truss F23/F24 aren't offered.
- **Check a table (RG2, AVX admin with two-step sign-in):** Settings → AVX reviews → Truss table review → Prolyte H30V: open the document, compare every row, tick each, "Mark checked". The line in a gig now shows "Within the table" per span with the table, edition and your name and date. "Take the mark back" (with a reason) makes it unchecked again; the history keeps both.
- **Pass/fail figures (RG2):** with H30V checked, a 6 m line on points at 0 and 6 m, cable 0, one 600 kg extra load at 3 m, dynamic factor 1.2: CPL 720 of 914.4 kg (79%), "Within the table".
- **Bridle (RG2):** My work → Tools → Bridle calculator: beams 2 m apart, legs 1.5 m, 1000 kg: 83.6°, each leg 670.8 kg, sideways 447.2 kg. Beams 3.6 m apart with 2 m legs: the "wider than 120°" warning.
- **Hardware (RG2):** a gig with "Manilha 2t" and "Spanset 1t" in its equipment: Rigging → Hardware → "Add from the equipment"; type their WLLs; choose one for a bridle leg and see its % of the WLL.

## Pending: new questions (section 3)
- **Rows between two spans:** a span between two table rows uses the next longer row (the lower allowable), not a straight-line interpolation, because straight lines read slightly high on these curves (up to about 6% at short spans). A span shorter than the first row uses the first row. OK? (Assumed: yes, the safe reading.)
- **The verdict's load case:** the pass/fail treats every point load as hanging at the centre (CPL) plus the UDL, the strictest case; TPL and QPL are shown but only for information. Should a line be able to say "my loads hang at the third points" and use TPL? (Assumed: strict case only.)
- **Dynamic factor on truss loads:** the truss check multiplies the loads by the gig's dynamic factor (as RG1 does for hoists), although the tables are for static loads. Stricter; OK? (Assumed: yes.)
- **Deflection limit:** none by default (the estimate is shown); a line can set one in mm. Should AVX suggest a default such as span/200? (Assumed: no default, as nothing was published to base it on.)
- **Continuous lines and overhangs:** each span is checked as a simple span and the line gets a warning that it needs a structural check. OK until RG5? (Assumed: yes.)
- **Who may check a table:** any AVX admin with two-step sign-in, using the name on their profile. The truss data was copied by a script, so any admin counts as the second person. OK?
- **Pocket tools summary:** the page note for Pocket tools ("Calculators for any venue… DMX…") doesn't mention the bridle calculator; rewording existing text needs your yes. Add "and bridles"?
- **Tools tab suggestion:** rigging hardware in the gig's equipment does not (yet) suggest the rigging tool, because the suggestion's text says "There are hoists…". Add a second text for hardware?

## Session prompt
S13 (RG2)

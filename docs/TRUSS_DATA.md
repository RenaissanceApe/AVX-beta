# Truss load tables

The manufacturers' published allowable loads for straight truss, for the rigging tools
(docs/TOOLS_PLAN.md §5, RG2). Decided on 2026-10-27 (Q3): Fantek, Global Truss and Prolyte first,
the 30 and 40 cm square series before the rest of each catalogue; values only ever come from the
manufacturer's own documents, never derived; each table records its source and is checked by a
second person before it can be used.

- Data: `src/data/truss/{fantek,globaltruss,prolyte}.json`, read through `src/lib/trussTables.js`.
- How it was made: `scripts/truss-data/` (`fetch.sh` downloads the documents, `build.py` writes the
  JSON). Running both again gives byte-identical files.
- Retrieved 2026-10-27. The PDFs are not in the repository; each table keeps the document's
  address, edition and SHA-256 so the exact file can be checked.

## What each table holds

| Field | Meaning |
|---|---|
| `columns` / `rows` | One row per span. `span_m`; `udl_kg_m` uniformly distributed load; `pN_kg` the load **per point** for N−1 equal loads at L/N (`p2` centre point, `p3` third points, `p4` quarter points, `p5` fifth points…); `…_defl_mm` the deflection at that load; `weight_kg` the span's own weight where published. Fantek also publishes `udl_pa_kg_m` (UDL plus two 150 kg PA points 1 m from the supports) and one deflection for all its point cases (`points_defl_mm`). |
| `conditions` | The manufacturer's conditions for the table (static loads, single span supported at both ends, self-weight included, orientation…). |
| `source` | Publisher, document, address, edition (the document's date), retrieval date, SHA-256, page. |
| `crossCheck` | A second document with the same table, and whether it matches. |
| `checks` | Automatic checks it passed. |
| `issues` | Values that break the plausibility checks below. Some may have a reason (another limit governing), but a person has to look first. |
| `questions` | Open questions to the manufacturer. |
| `status` | `unchecked` (copied and checked automatically, not yet by a person), `checked` (a second person compared it with the source; `checkedBy` says who and when) or `blocked` (has issues or open questions: not offered). |

Units are as published, except Global Truss deflections: published in cm, stored in mm (×10).

## How the values were checked

1. **Copied from the document's text**, not retyped, wherever the PDF has text (all Prolyte and
   Global Truss tables, the Fantek manuals). The one table published only as an image (Fantek
   EC-40) was typed from a 200 dpi rendering.
2. **Units against each other.** Prolyte and the Fantek EC-40 sheet print every value in kg and lbs,
   mm and inches; every pair agrees (a misread digit would break its pair).
3. **A second copy.** Prolyte's 2015 loading tables against its 2022 product data sheets; Global
   Truss tables against the same table on the black-finish ("-B") page; Fantek manuals against the
   manufacturer's certificate printed in the same manual. All identical where a second copy exists.
4. **Plausibility** (`tableProblems` in `src/lib/trussTables.js`, the same rules in `build.py`, and a
   test that fails if a value is edited into breaking them):
   - spans increase in even steps (so a dropped row shows);
   - allowable loads never rise, and deflections never fall (by more than rounding), as the span grows;
   - more points never carry more per point;
   - at long spans, where bending governs, each point case keeps its beam-theory ratio to the centre
     load (N−1 equal loads at L/N give a largest moment of P·L·k, with k = N/8 for even N and
     (N²−1)/8N for odd N), and UDL × span ≈ 2 × centre load, within 15–25 %.

These checks catch copying errors (and, as it turned out, some oddities in the published tables). They don't replace the second person: until RG2 builds the
review screen, a table is marked `checked` by a pull request that sets `status` and `checkedBy`
(name and date) after comparing every row with the source document.

## Included (39 tables)

| Brand | Series | Shape, size | Spans | Status |
|---|---|---|---|---|
| Fantek | **EC30** | square 30 cm | 3–16 m | unchecked; certificate copy identical |
| Fantek | **EC40** | square 40 cm | 3–18 m | **blocked**: open question (weight, below) |
| Fantek | EC29p | square 29 cm | 3–16 m | unchecked |
| Fantek | EC76 | square 76 cm | 4–24 m | **blocked**: loads rise after 10 m |
| Global Truss | **F34**, F34P, F34PL | square 29 cm | 4–18 m | unchecked; F34 and F34P "-B" pages identical |
| Global Truss | **F44**, F44P | square 40 cm | 4–20 m | unchecked; F44P "-B" page identical |
| Global Truss | F43 | triangle 40 cm | 4–18 m | unchecked |
| Global Truss | F54 | square 52 cm | 4–24 m | unchecked |
| Global Truss | F14 | square 10 cm | 2–7 m | unchecked |
| Global Truss | F23, F24 | triangle / square 22 cm | 2–10 m | **blocked**: point cases off beam theory |
| Prolyte | **H30V**, **X30V**, **H40V** | square 30 / 40 cm | 3–20 m | unchecked; 2022 data sheets identical |
| Prolyte | H30D, X30D, H40D, E20D | triangle | 3–16 m (H30D, X30D), 3–18 m (E20D), 3–20 m (H40D) | unchecked; data sheets identical |
| Prolyte | E20V, S36V, S52V, S52SV, S66V | square | 3–20 m (S66: 6–24 m) | unchecked; data sheets identical |
| Prolyte | H40R, S36R, S66R, B100RV | rectangle | 3–20 m (S66R 6–24, B100RV 6–40 m) | unchecked; data sheets identical |
| Prolyte | H30L, X30L, H40L | ladder, three support cases each | 1–6 / 4–12 m | unchecked |

## Blocked: questions for the manufacturers

- **Fantek EC-40** (`Datos técnicos EC 40 FK40Q 1`): the weight column gives about 5 kg/m (15 kg at
  3 m … 90 kg at 18 m), almost the same as EC-30, while the FK40Q product page gives 7.2 kg/m. Which
  truss is the table for, and is the right self-weight in it?
- **Fantek EC-76** (manual, 2024): the centre and point loads rise from 10 m to 11 m (2175 → 2204 kg,
  1259 → 1289 kg…), and from 15 m the third- and fifth-point loads sit well below beam-theory
  ratios to the centre load. Printed that way in the manual.
- **Global Truss F23 and F24** (catalogue 2023): every point case is the centre load divided by the
  number of points (third points = ½, quarter points = ⅓…), as if the columns were total loads, not
  loads per point. Is that intended?

## Not included yet

- **Prolyte X40V**: Prolyte no longer publishes it (not on prolyte.com; the X40 range seems
  discontinued). An owner's own copy of the table can be added the same way, with its source.
- **Global Truss**: the ladder types (F22, F32, F42, F31) have several sub-tables per page whose
  conditions aren't clear from the page; F33, F34DNA, F52, iM-Type and iL-Type use other layouts.
  Global Truss's own downloads page refuses automated requests, so the 2023 catalogue on their
  site is the source. Older copies of Global Truss data sheets found at dealers (e.g. a 2012 F34
  sheet) have different, lower values: the catalogue's are newer.
- **Fantek**: EC-39 and EC-52C publish their tables as images; EC-25 and ER-25 use a shorter layout
  (and EC-25's quarter-point load at 6 m, 302 kg, is above its third-point load, 205 kg, printed
  that way twice); the "Serie 45" sheet (ER45/ERP45) uses another layout; the PRO, 29e, ER-29/30
  and ES series have no load table among the downloads on fantek.es.
- Tower and mast sections (Prolyte C52T, D75T, S40T): not straight spans; for the ground-support
  stage of RG.
- Hoists: still to choose (docs/TOOLS_PLAN.md §5).

# AT4: Automated tests, inventory, labels and subrentals

## Changelog
### Added
- **Automated tests for inventory, labels and subrentals (AT4).** 14 signed-in browser tests in
  `e2e/auth/inventory.spec.js` (tag `@inventory`) now check T4, T6, T9, T25, T64, T95, T96,
  T128–T131 and T180 on the test project every night: planning more equipment than you own (⚠,
  Subrent, an alternative), damage reported from site with a photo, cross-hire between two
  companies, scan steps with Undo, speaker presets and rigging data, item volume, label templates,
  case, power and phone labels, and the pickers. The smoke test (equipment on a gig) runs on every
  pull request.

## Roadmap
Automated tests: AT4 (inventory, labels and subrentals) built: `e2e/auth/inventory.spec.js`.

## T-lines automated (test names in `e2e/auth/inventory.spec.js`)
| T-line | What the tests check | Tests |
|---|---|---|
| T4 | Add equipment shows "2 of 2 free"; plan 3 → "1 short (2 free)" with the amber banner; "Subrent 1" opens a new subrental with the gig, the item and 1 filled in, saved with a new supplier → "Hired in for this gig"; "Use 1 × <alternative>" moves one over and nothing is short | `equipment on a gig: going past what you own …` (**@smoke**, ~12 s) |
| T6 | Crew on the gig (not in the organisation): Equipment → Report damage, unit code, problem and a photo → "Damage reported"; the admin's Inventory → Maintenance lists it as Reported, from the gig, with the unit code and the photo | `crew report damage from site with a photo; …` |
| T9 | The other company shows its cross-hire code; this company links its supplier with it ("Linked to …", "on AVX"), makes a subrental with status Requested; the other company sees it under "Hire requests to you" and confirms with a price; this company sees Confirmed and €150.00 | `cross-hire: link the other company by its code, …` |
| T25 | Scan screen: Prepped × 3 (codes typed) → "Prepped 3 of 3"; Out (loaded) × 2 → Undo the last → "Out 1 of 3"; the Equipment tab's bars (Prepped 3 of 3, Out 1 of 3); the packing list's Step column says Prepped; Organisation settings → untick On site → the scan screen no longer offers it | `scan steps: Prepped and Out (loaded), Undo, …` |
| T64 | Inventory → Subrentals: the supplier list, and the new subrental's supplier and item pickers list them; an item's Accessories and Alternatives pickers list the other items, and adding an alternative shows it; Inventory → QR labels (all) and labels for one chosen item | `pickers show everything: …` (the gig's equipment picker is checked in T4's test) |
| T95 | Edit → Speaker specs → Fill from a preset → L-Acoustics X12: 136 dB, 60° × 90°, 59–20000 Hz, 8 Ω, 20 kg, datasheet named; Sensitivity 200 → "Between 60 and 130" and Save is disabled; saved, the item page lists them | `speaker presets: …` |
| T96 | The d&b V8 preset fills the rigging data with the "Needs a second person's check" note on the form and on the item page | `rigging data from the d&b V8 preset …` |
| T128 | Fields: untick and tick Code, untick Organisation, Save for the organisation; a second browser window gets the same fields; a viewer (on a gig's power labels, as viewers have no Inventory) can tick Gig for this print, sees "Changes here are for this print only…" and no Save; the database refuses a viewer's save | `label templates: …` |
| T129 | A case unit with 2 + 1 units packed in it, ticked on its item page → "Labels for 1" → Large: "Case contents", "2 × …", "1 × …" | `case labels: …` |
| T130 | A gig's power report → Labels: cables small, 3 labels on a roll (3 pages) and on A4 sheets (1 page), with the Power band when ticked; distros medium with the Power band, fed from "The supply", the outputs | `power labels: …` |
| T131 | At 320 and 390 px: every size on roll and on sheets, opened with that choice, fits on screen with no sideways scroll | `labels on a phone (320 px) …`, `(390 px) …`; bug #223 below |
| T180 | Edit an item: Volume 0.084 → "0.084 m³" on its page; another with only "60 x 40 x 50 cm"; on a gig's Packing list per vehicle the first counts 0.08 m³ and the second 0.12 m³ read from its size | `item volume: typed in, or worked out from the size` |

## T-lines (parts) left manual, and why
- **All of them, Portuguese wording:** the tests run in English; a person reading the wording is
  still needed.
- **T4:** "Subrent N" then actually covering the shortage (does a confirmed subrental stop the ⚠?)
  isn't checked: the T-line only asks to "try" it.
- **T6:** taking the photo with a real phone camera (the test sends a file).
- **T9:** "only if a second company joins": automated with the test's second company; the
  supplier link for a supplier not on AVX (a public page, AT2 covers its messages) and declining a
  request are not.
- **T25:** scanning with the camera (codes are typed, as a hand scanner would); the On site / Loaded
  back / Checked in steps beyond the two the line names; marking units lost.
- **T64:** the equipment pickers in the input list, stage plot, light plot and DMX patch tools
  (field tools, AT10) and the client pickers in Quotes (AT3); printing.
- **T95/T96:** the second person's sign-off of rigging data (RG3) isn't part of the line.
- **T128–T131:** printing on a real printer, roll or pre-cut sheets (stays manual); checking the
  labels scan back to the right item with a phone.
- **T180:** none beyond the wording.

## Bugs found
- **#223 (should fix):** on a phone, switching a label sheet from a roll to A4 sheets keeps the
  roll's zoom, so the sheet is cut off about 70 px on the left and the page scrolls sideways until
  it's reloaded. Documented by `labels on a phone: switching from a roll to sheets still fits the
  sheet on screen` with `test.fail()`. The T131 tests that open each choice fresh pass.

## Pending: test lines (section 2)
- **AT4:** when #223 is fixed, the test above turns red ("expected to fail but passed"): remove its
  `test.fail()` line. Nothing in this file needs test_support.

## Pending: new questions (section 3)
- None.

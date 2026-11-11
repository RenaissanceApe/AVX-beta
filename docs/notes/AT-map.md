# Automated tests: which T-line goes to which area

From the Dispatcher's research for the "Automated tests" set (AT0–AT11): the lines of
docs/PENDING.md section 2 (T1–T187) by feature area. Each area's worker writes
`e2e/auth/<area>.spec.js` and marks the lines a test covers with `// covers: T…` above it
(docs/TESTING.md, "Automated test suite").

| # | Area | Spec file (AREAS name) | T-lines |
|---|---|---|---|
| 1 | Gigs, crew and tasks | `gigs` | T1, T3, T8, T11, T23, T49, T50, T51, T52, T53, T65, T104, T120, T121 |
| 2 | Messages | `messages` | T2, T12, T13, T14, T15, T17, T18 |
| 3 | Quotes and invoices | `quotes` | T7, T67, T75, T77, T102 |
| 4 | Inventory and labels | `inventory` | T4, T6, T9, T25, T64, T95, T96, T128–T131, T180 |
| 5 | Import | `import` | T31–T35, T37, T98, T108, T134–T139, T141–T143, T145, T147–T153, T155–T160 |
| 6 | Marketplace | `marketplace` | T40–T43, T45 |
| 7 | Hours, leave and expenses | `hours` | T55, T68–T71, T85 |
| 8 | Reports and finance | `reports` | T61, T74, T82, T83, T84, T161 |
| 10 | Field tools | `fieldtools` | T26–T30, T46, T48, T97, T99, T101, T106–T119 |
| 11 | Vehicles and appointments | `vehicles` | T164, T166–T185 (not T165) |
| 12 | Settings, privacy, export and phone widths | `settings` | T39, T44, T56, T57, T87–T92, T105, T125, T126, T132, T162, T163 |

**Already covered** by existing tests: T62, T63, T72, T79, T80, T81, T86, T93, T123, T124, T133,
T140, T144, T146, T154, T165.

**By hand only** (need a person, a real device, an email inbox, a printer or production):
T5, T10, T16, T19–T22, T24, T36, T38, T47, T54, T58–T60, T66, T73, T76, T78, T94, T100, T127,
T186, T187.

(There is no area 9 in the research's numbering.) The import area may keep its tests in the
existing `e2e/auth/import.spec.js` or add `import` set-up tests beside them.

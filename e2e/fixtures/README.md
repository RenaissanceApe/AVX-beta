# Sample files for the browser tests

Made-up data only: no real people, companies, emails or phone numbers. Email addresses are
`@example.com`; the tax number is Portugal's generic final-consumer number (PT999999990).

| File | What it is | Made by |
|---|---|---|
| `equipment.xlsx` | Excel workbook, one sheet "Equipment": Name, Code, Quantity, Price, Category (3 rows) | `make-fixtures.mjs` |
| `equipment-windows-1252.csv` | CSV saved the way Excel on Windows does (Windows-1252, `;`, CRLF), Portuguese headings and accents ("Armazém") | `make-fixtures.mjs` |
| `rentman-equipment.csv` | Equipment export with Rentman's column names (recognised as a Rentman export) | `make-fixtures.mjs` |
| `contacts.csv` | Two clients for the Contacts import | typed |
| `rig-vectorworks-style.mvr` | A small MVR in the Vectorworks style: 4 spots on LX1, 2 pixel washes on FOH, made-up fixture types with their GDTF files (field tools, T99) | copy of `docs/samples/mvr/vectorworks-style.mvr` (`scripts/mvr-samples.mjs`) |
| `sample-spot-300.gdtf` | A made-up GDTF fixture type: modes Standard (18 ch) and Basic (12 ch), 21.5 kg, 450 W (field tools, T101) | copy of `docs/samples/mvr/Sample@Spot 300.gdtf` (`scripts/mvr-samples.mjs`) |

Use one in a test with `setInputFiles`:

```js
import { fileURLToPath } from 'node:url'
const fixture = name => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))
await page.locator('input[type="file"]').setInputFiles(fixture('equipment.xlsx'))
```

**Adding a file** (import and field-tools areas): put it here with made-up data and add a row above.
A binary file (xlsx, Windows-1252 text) goes in `make-fixtures.mjs` so it can be made again; run
`node e2e/fixtures/make-fixtures.mjs` and commit what it writes. Lighting-plot (MVR) samples
already have their own maker: `scripts/mvr-samples.mjs`.

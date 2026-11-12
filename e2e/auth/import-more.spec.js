// Import (AT5): the owner's manual test lines for the import wizard (docs/PENDING.md section 2:
// T31–T35, T37, T98, T108, T134–T139, T141–T143, T145, T147–T153, T155–T160) as signed-in journeys
// on the TEST project. The organisation, its people and the records an import needs to find are made
// through the set-up (setup.js); only the import itself is clicked through. e2e/auth/import.spec.js
// keeps the older import checks (and the area's one @smoke test). What stays manual is in
// docs/notes/AT5.md.
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addItem, addGig, addClient, addOrg, addQuote, pageAs } from './setup.js'
import { RUN } from './accounts.js'

test.use({ area: 'import' })

const TAG = '@import'
// A short tag for this test's own records (codes take letters, digits, . - _ only)
const uniq = () => `${RUN}-${Date.now().toString(36).slice(-5)}`
const fixture = name => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))
const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
// The shared test project is slow when several runs use it at once
const SLOW = { timeout: 45_000 }

// Marks the people's notifications read, so the bell's count doesn't trip the accessibility check (#209)
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}

// ---- The wizard's steps ----

async function openImport(page, org, kind) {
  await page.goto(`${org.path}/inventory/import?kind=${kind}`)
  await expect(page.locator('#imp-paste')).toBeVisible(SLOW)
  await expect(page.locator(`input[name="imp-kind"][value="${kind}"]`)).toBeChecked()
}
// Paste rows (tab-separated, as from a spreadsheet) and go on to Match columns
async function pasteAndMatch(page, rows) {
  await page.locator('#imp-paste').fill(rows.map(r => r.join('\t')).join('\n'))
  await toMatch(page)
}
async function toMatch(page) {
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Match columns' })).toBeVisible()
}
// Match columns → Check: the check has loaded once its counts are there
async function toCheck(page) {
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByText('waiting for a decision', { exact: true })).toBeVisible(SLOW)
}
// One group of rows in the check (a region named after its rows, field and value)
const group = (page, value) => page.getByRole('region', { name: new RegExp(`“${escape(value)}”$`) })
const escape = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Import, and wait for the report's summary line
async function importAndWait(page, button, summary) {
  const go = page.getByRole('button', { name: button, exact: true })
  await expect(go).toBeEnabled(SLOW)
  await go.click()
  await expect(page.getByRole('status').filter({ hasText: summary })).toBeVisible(SLOW)
}
const summary = (added, updated = 0, unchanged = 0, skipped = 0) => `${added} added · ${updated} updated · ${unchanged} unchanged · ${skipped} skipped`
// The column picker for a heading on Match columns
const column = (page, header) => page.getByRole('combobox', { name: `What column ${header} becomes`, exact: true })

// The undo dialog for the newest import in Earlier imports
async function undoNewest(page) {
  const history = page.getByRole('region', { name: 'Earlier imports' })
  await expect(history).toBeVisible(SLOW)
  await history.getByRole('button', { name: /^Undo/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Undo this import?' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function itemByCode(account, orgId, code) {
  const rows = ok('Finding the item', await account.client.from('price_items').select('id, name, code, tracking, archived_at, custom_values').eq('org_id', orgId).eq('code', code))
  return rows[0] || null
}
async function unitsOf(account, itemId) {
  return ok('Listing the units', await account.client.from('stock_units').select('code, serial').eq('item_id', itemId).order('code'))
}
const addLocation = async (account, orgId, name, fields = {}) => ok('Adding a location',
  await account.client.from('stock_locations').insert({ org_id: orgId, name, ...fields }).select().single())

// covers: T134
test('units for an item that isn\'t in AVX: add it from the check, import, and the units are on it', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const name = `E2E Amp ${u}`
  await openImport(page, org, 'units')
  await pasteAndMatch(page, [['Item', 'Barcode', 'Serial number'], [name, `U1-${u}`, 'SN-1'], [name, `U2-${u}`, 'SN-2']])
  await toCheck(page)

  const g = group(page, name)
  await expect(g).toBeVisible()
  await g.getByRole('radio', { name: `Add "${name}" to the catalogue` }).check()
  await g.getByRole('button', { name: 'Fill in its details' }).click()
  const form = page.getByRole('dialog', { name: 'Add to the catalogue' })
  await expect(form.getByLabel('Name')).toHaveValue(name)
  await form.getByLabel('Code').fill(`AMP-${u}`)
  await expect(form.getByLabel('How it\'s kept')).toBeDisabled()
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Add when importing' }).click()

  await expect(page.getByText(`New item ${name}`)).toBeVisible()
  await expectAccessible(page)
  await importAndWait(page, 'Import 2 rows · adds 1 item', summary(2))

  // The new item is kept per unit and has both units; its page lists them
  const item = await itemByCode(account, org.id, `AMP-${u}`)
  expect(item).toMatchObject({ name, tracking: 'serial' })
  expect((await unitsOf(account, item.id)).map(x => x.code)).toEqual([`U1-${u}`, `U2-${u}`])
  await page.goto(`${org.path}/inventory/${item.id}`)
  await expect(page.getByText(`U1-${u}`).first()).toBeVisible(SLOW)
  await expect(page.getByText(`U2-${u}`).first()).toBeVisible()
})

// covers: T136
test('fixes are kept through Back and Next, and one can be taken back', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org } = adminWithOrg
  const u = uniq()
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Price', 'Quantity', 'Location'],
    [`E2E Desk ${u}`, `D-${u}`, 'lots', '1', `Shelf ${u}`],
    [`E2E Lamp ${u}`, `L-${u}`, 'lots', '2', `Shelf ${u}`]])
  await toCheck(page)

  // Two fixes: the bad price treated as empty, then (the rows' next problem) a new location
  const price = page.getByRole('region', { name: '2 rows · Price', exact: true })
  await price.getByRole('radio', { name: 'Treat "lots" as empty (2 rows)' }).check()
  await price.getByRole('button', { name: 'Apply' }).click()
  const loc = group(page, `Shelf ${u}`)
  await loc.getByRole('button', { name: 'Apply' }).click()
  const fixes = page.getByRole('region', { name: 'Your fixes (2)' })
  await expect(fixes).toBeVisible()
  await expect(fixes.getByText(`New location Shelf ${u}`)).toBeVisible()

  // Back to Match columns and Next again: both fixes are still there
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Match columns' })).toBeVisible()
  await toCheck(page)
  await expect(fixes).toBeVisible()
  await expect(page.getByText('No problems: every row can go in.')).toBeVisible()

  // Take one back: its rows wait for a decision again
  await fixes.getByRole('button', { name: /^Take back: Price/ }).click()
  await expect(page.getByRole('region', { name: 'Your fix (1)' })).toBeVisible()
  await expect(price).toBeVisible()
  await expect(loc).toHaveCount(0)
  await expect(page.getByText('2 rows waiting for a decision will be left out.')).toBeVisible()
  await expectAccessible(page)
})

// covers: T141
test('a units file without an item column: the item chosen under "Same for every row" gets the units', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const item = await addItem(account, org.id, { name: `E2E Radio ${u}`, code: `RAD-${u}`, tracking: 'serial' })
  await openImport(page, org, 'units')
  await pasteAndMatch(page, [['Barcode', 'Serial number'], [`R1-${u}`, 'S-1'], [`R2-${u}`, 'S-2']])
  await expect(page.getByText('Choose which column says which item each unit is (its name or code).')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()

  const same = page.getByRole('region', { name: /Same for every row/ })
  await same.getByLabel('Item', { exact: true }).selectOption({ label: `E2E Radio ${u} · RAD-${u}` })
  await expectAccessible(page)
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  expect((await unitsOf(account, item.id)).map(x => x.code)).toEqual([`R1-${u}`, `R2-${u}`])
})

// covers: T147
test('two items with the same name: "Choose which one" puts the units on the one picked', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const name = `E2E Twin ${u}`
  await addItem(account, org.id, { name, tracking: 'serial', brand: 'First' })
  const second = await addItem(account, org.id, { name, tracking: 'serial', brand: 'Second' })
  await openImport(page, org, 'units')
  await pasteAndMatch(page, [['Item', 'Barcode'], [name, `T1-${u}`]])
  await toCheck(page)

  const g = group(page, name)
  await expect(g.getByText(`several items are called "${name}"`)).toBeVisible()
  await expect(g.getByRole('radio', { name: 'Choose which one' })).toBeChecked()
  const picker = g.getByRole('combobox', { name: 'Choose which one' })
  await picker.selectOption(await picker.locator('option', { hasText: /· Second$/ }).getAttribute('value'))
  await g.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(`Item (name) “${name}” → ${name}`)).toBeVisible()
  await importAndWait(page, 'Import 1 row', summary(1))
  expect((await unitsOf(account, second.id)).map(x => x.code)).toEqual([`T1-${u}`])
})

// covers: T149
test('an archived item\'s code: "Restore the item", import, and undoing archives it again', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const code = `ARC-${u}`
  const item = await addItem(account, org.id, { name: `E2E Old case ${u}`, code, archived_at: new Date().toISOString() })
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Price'], [`E2E Old case ${u}`, code, '15']])
  await toCheck(page)

  const g = group(page, code)
  await expect(g.getByText(`the item with code "${code}" is archived`)).toBeVisible()
  await g.getByRole('radio', { name: 'Restore the item' }).check()
  await g.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(`Item E2E Old case ${u} (${code}) restored`)).toBeVisible()
  await importAndWait(page, 'Import 1 row', /0 added · 1 updated/)
  expect((await itemByCode(account, org.id, code)).archived_at).toBeNull()

  // Undo: the item is archived again
  const dialog = await undoNewest(page)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Undo the import' }).click()
  await expect(page.getByText(/Import undone/)).toBeVisible(SLOW)
  expect((await itemByCode(account, org.id, code)).archived_at).not.toBeNull()
  expect(item.id).toBeTruthy()
})

// covers: T98
test('speaker presets: a known preset fills the row, an unknown one is refused', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Speaker preset', 'Sensitivity'],
    [`E2E Geo ${u}`, `GEO-${u}`, 'NEXO GEO M1220', ''],
    [`E2E Nobody ${u}`, `NOB-${u}`, 'Nobody X1', '']])
  await expect(column(page, 'Speaker preset')).toHaveValue('speaker_preset')
  await toCheck(page)
  const g = group(page, 'Nobody X1')
  await expect(g.getByText('no speaker preset by that name (use the brand and model, e.g. "L-Acoustics K2")')).toBeVisible()
  await expect(page.getByText('1 row waiting for a decision will be left out.')).toBeVisible()
  await importAndWait(page, 'Import 1 row', summary(1))
  const geo = await itemByCode(account, org.id, `GEO-${u}`)
  const filled = ok('Reading the item', await account.client.from('price_items').select('speaker_preset, sensitivity_db, speaker_type').eq('id', geo.id).single())
  expect(filled.speaker_preset).toBeTruthy()
  expect(Number(filled.sensitivity_db)).toBeGreaterThan(80)
  expect(await itemByCode(account, org.id, `NOB-${u}`)).toBeNull()
})

// covers: T108
test('electrical columns are read, and impossible values are refused', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Power', 'Power factor', 'Amps', 'Voltage', 'Connector'],
    [`E2E Amp rack ${u}`, `RACK-${u}`, '3600', '0.95', '16', '230', 'CEE 32/3'],
    [`E2E Heater ${u}`, `HEAT-${u}`, '2000', '1.5', '5', '230', 'Schuko']])
  for (const [header, key] of [['Power', 'power_w'], ['Power factor', 'power_factor'], ['Amps', 'current_a'], ['Voltage', 'current_v'], ['Connector', 'connector_in']]) {
    await expect(column(page, header)).toHaveValue(key)
  }
  await toCheck(page)
  // A power factor above 1 can't be right
  const power = page.getByRole('region', { name: '1 row · Power factor', exact: true })
  await expect(power.getByText('outside what an electrical datasheet gives (check the unit)')).toBeVisible()
  await importAndWait(page, 'Import 1 row', summary(1))
  const rack = await itemByCode(account, org.id, `RACK-${u}`)
  const read = ok('Reading the item', await account.client.from('price_items').select('power_w, power_factor, current_a, current_v, connector_in').eq('id', rack.id).single())
  expect(read).toMatchObject({ power_w: 3600, current_v: 230 })
  expect(Number(read.power_factor)).toBe(0.95)
  expect(Number(read.current_a)).toBe(16)
  expect(read.connector_in).toMatch(/cee32/i)
  expect(await itemByCode(account, org.id, `HEAT-${u}`)).toBeNull()
})

// covers: T138
test('an Excel file with two sheets: the second sheet\'s own rows are imported', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const room = `E2E Rack room ${uniq()}`
  await addLocation(account, org.id, room)
  await openImport(page, org, 'items')
  await page.locator('input[type="file"]').setInputFiles(fixture('equipment-two-sheets.xlsx'))
  const sheet = page.getByLabel('Sheet', { exact: true })
  await expect(sheet).toHaveValue('Audio')
  await expect(page.getByText('2 rows and 3 columns found.')).toBeVisible()
  await sheet.selectOption({ label: 'Lighting · 4 rows' })
  await expect(page.getByText('3 rows and 3 columns found.')).toBeVisible()
  await expectAccessible(page)
  await toMatch(page)
  await expect(page.getByText('E2E Fresnel · E2E Dimmer · E2E Hazer')).toBeVisible()
  // Its quantities need a location: one for every row
  await page.getByRole('region', { name: /Same for every row/ }).getByLabel('Location', { exact: true }).selectOption(room)
  await toCheck(page)
  await importAndWait(page, 'Import 3 rows', summary(3))
  expect(await itemByCode(account, org.id, 'E2E-FRS')).toMatchObject({ name: 'E2E Fresnel' })
  expect(await itemByCode(account, org.id, 'E2E-MIX')).toBeNull()
})

// covers: T139
test('a CSV saved by Excel on Windows: read as Western text with the accents right, and the switch', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  await addLocation(account, org.id, 'Armazém')
  await openImport(page, org, 'items')
  await page.locator('input[type="file"]').setInputFiles(fixture('equipment-windows-1252.csv'))
  const windows = 'This file was saved by Excel on Windows, so it was read as Western (Windows-1252) text. Check the accents in the rows below.'
  await expect(page.getByText(windows)).toBeVisible()
  await expectAccessible(page)
  // UTF-8 garbles the accents; back to Western and they're right again
  await page.getByRole('button', { name: 'Read as UTF-8 instead' }).click()
  await expect(page.getByText('Read as UTF-8 text, as you chose.')).toBeVisible()
  await toMatch(page)
  await expect(page.getByText('Armaz�m').first()).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Read as Western (Windows-1252)' }).click()
  await expect(page.getByText(windows)).toBeVisible()
  await toMatch(page)
  await expect(page.getByText('Armazém').first()).toBeVisible()
  // "Localização" isn't one of the names the location column is guessed from: chosen by hand
  await column(page, 'Localização').selectOption('location')
  await toCheck(page)
  await importAndWait(page, 'Import 3 rows', summary(3))
  expect(await itemByCode(account, org.id, 'E2E-ECR')).toMatchObject({ name: 'E2E Ecrã' })
})

// covers: T142
test('dates like 01/02/2027: Match asks day or month first, and month first gives 2 January', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const year = new Date().getFullYear() + 1
  await openImport(page, org, 'gigs')
  await pasteAndMatch(page, [['Number', 'Name', 'Start', 'End'], [`DO-${u}`, `E2E Dates ${u}`, `01/02/${year}`, `01/03/${year}`]])
  await expect(page.getByText('Dates in Start: which comes first, the day or the month?')).toBeVisible()
  await expect(page.getByText('Choose how the dates are written before going on.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await expectAccessible(page)
  await page.getByLabel('Dates in Start: which comes first, the day or the month?').selectOption('mdy')
  // The other date column takes the same order
  const end = page.getByLabel(/^Dates in End:/)
  if (await end.inputValue() === '') await end.selectOption('mdy')
  await toCheck(page)
  await importAndWait(page, 'Import 1 row', summary(1))
  const gig = ok('Finding the gig', await account.client.from('gigs').select('start_date, end_date').eq('org_id', org.id).eq('import_ref', `DO-${u}`).single())
  expect(gig).toEqual({ start_date: `${year}-01-02`, end_date: `${year}-01-03` })
})

// covers: T155, T156
test('past cancelled jobs stay out until "Import as cancelled", and a job from 11 years ago is too old', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  await openImport(page, org, 'gigs')
  await pasteAndMatch(page, [['Number', 'Name', 'Start', 'End', 'Status'],
    [`PC-${u}`, `E2E Called off ${u}`, day(-60), day(-59), 'cancelled'],
    [`OLD-${u}`, `E2E Ancient ${u}`, day(-11 * 366), day(-11 * 366 + 1), 'confirmed'],
    [`UP-${u}`, `E2E Soon ${u}`, day(20), day(21), 'confirmed']])
  await toCheck(page)
  const purpose = page.getByRole('region', { name: /left out on purpose/ })
  await expect(purpose.getByText('1 past cancelled job')).toBeVisible()
  await expect(purpose.getByText('1 from more than 10 years ago (too old to import)')).toBeVisible()
  await expect(purpose.getByText(`E2E Ancient ${u}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import 1 row', exact: true })).toBeVisible()
  await expectAccessible(page)

  await purpose.getByRole('button', { name: 'Import as cancelled' }).click()
  await expect(page.getByText('1 past job imported as cancelled')).toBeVisible()
  await importAndWait(page, 'Import 2 rows', summary(2))
  const gigs = ok('Listing the gigs', await account.client.from('gigs').select('import_ref, status').eq('org_id', org.id).in('import_ref', [`PC-${u}`, `OLD-${u}`, `UP-${u}`]).order('import_ref'))
  expect(gigs).toEqual([{ import_ref: `PC-${u}`, status: 'cancelled' }, { import_ref: `UP-${u}`, status: 'confirmed' }])
})

// covers: T135, T159
test('an unknown status treated as Confirmed, and a client not in Contacts added and linked', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const client = `E2E New Client ${u}`
  await openImport(page, org, 'gigs')
  await pasteAndMatch(page, [['Number', 'Name', 'Start', 'End', 'Status', 'Client'],
    [`GP-${u}`, `E2E Planned ${u}`, day(15), day(16), 'Gepland', client]])
  await toCheck(page)

  const status = group(page, 'Gepland')
  await status.getByRole('combobox', { name: 'Treat "Gepland" in every row as' }).selectOption({ label: 'Confirmed' })
  await status.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('Status “Gepland” treated as Confirmed')).toBeVisible()
  // The heads-up names the client (0.82.1: not "{value}")
  const heads = page.getByRole('region', { name: 'Heads-ups' })
  await expect(heads.getByText(`"${client}" isn't in Contacts: it's kept as text unless you add it or link it to a contact.`)).toBeVisible()
  await expect(heads).not.toContainText('{value}')
  const g = group(page, client)
  await g.getByRole('radio', { name: `Add "${client}" to Contacts` }).check()
  await g.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(`New client ${client}`)).toBeVisible()
  await expectAccessible(page)
  await importAndWait(page, 'Import 1 row · adds 1 client', summary(1))

  const gig = ok('Finding the gig', await account.client.from('gigs').select('status, client_id, clients(name)').eq('org_id', org.id).eq('import_ref', `GP-${u}`).single())
  expect(gig.status).toBe('confirmed')
  expect(gig.clients?.name).toBe(client)
})

// covers: T31
test('the move in order: locations, equipment with a saved matching, units; a second import matches, and undo', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow() // a long journey on a shared, busy test database
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const store = `E2E Store ${u}`
  const preset = `E2E Stock list ${u}`

  // Locations
  await openImport(page, org, 'locations')
  await pasteAndMatch(page, [['Name', 'Type', 'Address'], [store, 'warehouse', 'Rua Inventada 1'], [`E2E Van ${u}`, 'vehicle', '']])
  await expect(column(page, 'Name')).toHaveValue('name')
  await expect(column(page, 'Type')).toHaveValue('kind')
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  await expect(page.getByRole('button', { name: 'Next: Equipment' })).toBeVisible()

  // Equipment: the guessed columns, saved as a matching
  const equipment = [['Name', 'Code', 'Rental price', 'Quantity', 'Location', 'Serial numbers'],
    [`E2E Truss ${u}`, `TR-${u}`, '25', '8', store, 'bulk'],
    [`E2E Wireless ${u}`, `WL-${u}`, '40', '', '', 'serial']]
  await openImport(page, org, 'items')
  await pasteAndMatch(page, equipment)
  for (const [header, key] of [['Name', 'name'], ['Code', 'code'], ['Rental price', 'unit_price'], ['Quantity', 'quantity'], ['Location', 'location'], ['Serial numbers', 'tracking']]) {
    await expect(column(page, header)).toHaveValue(key)
  }
  await page.getByLabel('Save this matching as').fill(preset)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(`Saved as "${preset}": next time choose it and the columns are matched.`)).toBeVisible()
  await expectAccessible(page)
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  const truss = await itemByCode(account, org.id, `TR-${u}`)
  const stock = ok('Reading the stock', await account.client.from('stock_levels').select('quantity').eq('item_id', truss.id))
  expect(stock.map(s => s.quantity)).toEqual([8])

  // Units (serial numbers) of the item kept per unit
  await openImport(page, org, 'units')
  await pasteAndMatch(page, [['Item code', 'Barcode', 'Serial number', 'Location'], [`WL-${u}`, `WL1-${u}`, 'A100', store], [`WL-${u}`, `WL2-${u}`, 'A101', store]])
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  const wireless = await itemByCode(account, org.id, `WL-${u}`)
  expect((await unitsOf(account, wireless.id)).map(x => x.serial)).toEqual(['A100', 'A101'])

  // The same equipment file again, with the saved matching: it matches instead of doubling
  await openImport(page, org, 'items')
  await page.locator('#imp-paste').fill(equipment.map(r => r.join('\t')).join('\n'))
  await toMatch(page)
  await page.getByLabel('Saved matching').selectOption({ label: preset })
  await toCheck(page)
  await expect(page.getByRole('status').filter({ hasText: /^0new2match what's in AVX/ })).toBeVisible()
  await importAndWait(page, 'Import 2 rows', summary(0, 0, 2))
  expect(ok('Counting', await account.client.from('price_items').select('id').eq('org_id', org.id).eq('code', `TR-${u}`))).toHaveLength(1)

  // Undo the units import: the units go, the item stays
  await page.goto(`${org.path}/inventory/import?kind=units`)
  const history = page.getByRole('region', { name: 'Earlier imports' })
  await expect(history).toBeVisible(SLOW)
  const unitsRow = history.getByRole('listitem').filter({ hasText: 'Units (serial numbers)' }).first()
  await unitsRow.getByRole('button', { name: /^Undo/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Undo this import?' })
  await expect(dialog.getByText('2 records it added are removed (with the stock they brought in).')).toBeVisible()
  await expectAccessible(page)
  await expect(dialog.getByRole('button', { name: 'Undo the import' })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: 'I understand this removes records for good.' }).check()
  await dialog.getByRole('button', { name: 'Undo the import' }).click()
  // (It says "4 removed": the two units and their stock history; the dialog said 2 records)
  await expect(page.getByText(/Import undone: \d+ removed, 0 put back/)).toBeVisible(SLOW)
  await expect(unitsRow.getByText('Undone', { exact: true })).toBeVisible()
  expect(await unitsOf(account, wireless.id)).toEqual([])
})

// covers: T31, T152
test('undoing an import whose item is on a gig: the dialog names both, and "Undo the rest" keeps that one', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Price', 'Tracking'], [`E2E Booked ${u}`, `BK-${u}`, '30', 'bulk'], [`E2E Free ${u}`, `FR-${u}`, '20', 'bulk']])
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))

  // The first item goes on a gig
  const booked = await itemByCode(account, org.id, `BK-${u}`)
  const gig = await addGig(account, org.id, { name: `E2E Booking gig ${u}` })
  ok('Booking the item', await account.client.from('gig_equipment').insert({ gig_id: gig.id, org_id: org.id, item_id: booked.id, item_name: booked.name, quantity: 1 }))

  const dialog = await undoNewest(page)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Undo the import' }).click()
  await expect(dialog.getByText('1 record this import added is in use, so the import can\'t be undone as a whole:')).toBeVisible(SLOW)
  await expect(dialog.getByText(`E2E Booked ${u}: on the gig E2E Booking gig ${u}`)).toBeVisible()
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Undo the rest' }).click()
  await expect(page.getByText('Import undone, except 1 record in use: 1 removed, 0 put back.')).toBeVisible(SLOW)
  await expect(page.getByRole('region', { name: 'Earlier imports' }).getByText('1 kept: in use').first()).toBeVisible()
  expect(await itemByCode(account, org.id, `BK-${u}`)).not.toBeNull()
  expect(await itemByCode(account, org.id, `FR-${u}`)).toBeNull()
})

// covers: T32
test('an Excel file reads like a CSV, and kit contents import, update and undo', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow() // a long journey on a shared, busy test database
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const shelf = `E2E Shelf ${u}`
  await addLocation(account, org.id, shelf)
  await openImport(page, org, 'items')
  await page.locator('input[type="file"]').setInputFiles(fixture('equipment.xlsx'))
  await expect(page.getByText('3 rows and 5 columns found.')).toBeVisible()
  await toMatch(page)
  for (const [header, key] of [['Name', 'name'], ['Code', 'code'], ['Quantity', 'quantity'], ['Price', 'unit_price'], ['Category', 'category']]) {
    await expect(column(page, header)).toHaveValue(key)
  }
  await expect(page.getByText('E2E Moving head · E2E Speaker · E2E Cable 10 m')).toBeVisible()
  await page.getByRole('region', { name: /Same for every row/ }).getByLabel('Location', { exact: true }).selectOption(shelf)
  await toCheck(page)
  await importAndWait(page, 'Import 3 rows', summary(3))
  const head = await itemByCode(account, org.id, 'E2E-MH')
  expect(ok('Reading', await account.client.from('price_items').select('unit_price, category').eq('id', head.id).single())).toEqual({ unit_price: 45, category: 'Lighting' })

  // Kit contents: a case with a moving head and cables
  const kase = await addItem(account, org.id, { name: `E2E Case ${u}`, code: `CASE-${u}`, kit_type: 'case' })
  const kit = qty => [['Case code', 'Item code', 'Quantity'], [`CASE-${u}`, 'E2E-MH', '2'], [`CASE-${u}`, 'E2E-CBL', qty]]
  await openImport(page, org, 'kits')
  await pasteAndMatch(page, kit('6'))
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  await page.goto(`${org.path}/inventory/${kase.id}`)
  await expect(page.getByText('E2E Moving head').first()).toBeVisible(SLOW)
  await expect(page.getByText('E2E Cable 10 m').first()).toBeVisible()
  const parts = async () => ok('Reading the contents', await account.client.from('item_parts').select('quantity, child_id').eq('parent_id', kase.id).order('quantity'))
  expect((await parts()).map(p => p.quantity)).toEqual([2, 6])

  // The same file with one quantity changed: one updated; undo puts it back
  await openImport(page, org, 'kits')
  await pasteAndMatch(page, kit('10'))
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(0, 1, 1))
  expect((await parts()).map(p => p.quantity)).toEqual([2, 10])
  const dialog = await undoNewest(page)
  await expect(dialog.getByText('1 record it changed gets its old values back.')).toBeVisible()
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Undo the import' }).click()
  await expect(page.getByText('Import undone: 0 removed, 1 put back, 0 left as changed since.')).toBeVisible(SLOW)
  expect((await parts()).map(p => p.quantity)).toEqual([2, 6])
})

// covers: T33
test('clients with Dutch headings: the address is put together, a second import matches, and the client\'s quotes', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow() // a long journey on a shared, busy test database
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const name = `E2E Klant ${u}`
  const file = [['Naam', 'E-mailadres', 'Telefoon', 'Straat', 'Huisnummer', 'Postcode', 'Plaats', 'Land', 'BTW nummer'],
    [name, `klant-${u}@example.com`, '+31 600 000 000', 'Kerkstraat', '12', '1000 AA', 'Amsterdam', 'Nederland', 'NL000000000B01']]
  await openImport(page, org, 'clients')
  await pasteAndMatch(page, file)
  for (const [header, key] of [['Naam', 'name'], ['E-mailadres', 'email'], ['Telefoon', 'phone'], ['Straat', 'street'], ['Huisnummer', 'house_number'], ['Postcode', 'postcode'], ['Plaats', 'city'], ['Land', 'country'], ['BTW nummer', 'tax_id']]) {
    await expect(column(page, header)).toHaveValue(key)
  }
  await toCheck(page)
  await importAndWait(page, 'Import 1 row', summary(1))
  const client = ok('Finding the client', await account.client.from('clients').select('id, address, tax_id').eq('org_id', org.id).eq('name', name).single())
  expect(client.address).toBe('Kerkstraat 12\n1000 AA Amsterdam\nNederland')

  // Again: matched, not doubled
  await openImport(page, org, 'clients')
  await pasteAndMatch(page, file)
  await toCheck(page)
  await importAndWait(page, 'Import 1 row', summary(0, 0, 1))
  expect(ok('Counting', await account.client.from('clients').select('id').eq('org_id', org.id).eq('name', name))).toHaveLength(1)

  // The client in Contacts, with their quote; then archived
  await addQuote(account, org, { title: `E2E Klant quote ${u}`, client_id: client.id, client_name: name })
  await page.goto(`${org.path}/contacts`)
  await page.getByLabel('Search').fill(u)
  await page.getByRole('button', { name: new RegExp(`^${escape(name)}`) }).click()
  const modal = page.getByRole('dialog', { name })
  await expect(modal.getByLabel('Address')).toHaveValue('Kerkstraat 12\n1000 AA Amsterdam\nNederland')
  await expect(modal.getByText(`E2E Klant quote ${u}`)).toBeVisible(SLOW)
  await expectAccessible(page)
  await modal.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: `Archive: ${name}` }).click()
  await expect.poll(async () => ok('Reading', await account.client.from('clients').select('archived_at').eq('id', client.id).single()).archived_at, SLOW).not.toBeNull()
})

// covers: T148
test('clients whose name two contacts share: "Add as a new contact" adds a third', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const name = `E2E Same Name ${u}`
  await addClient(account, org.id, { name, email: `one-${u}@example.com` })
  await addClient(account, org.id, { name, email: `two-${u}@example.com` })
  await openImport(page, org, 'clients')
  await pasteAndMatch(page, [['Name', 'City'], [name, 'Faro']])
  await toCheck(page)
  const g = group(page, name)
  await expect(g.getByText(`several contacts are called "${name}"`)).toBeVisible()
  await g.getByRole('radio', { name: 'Add as a new contact' }).check()
  await g.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(`New contact ${name}`)).toBeVisible()
  await importAndWait(page, 'Import 1 row', summary(1))
  expect(ok('Counting', await account.client.from('clients').select('id').eq('org_id', org.id).eq('name', name))).toHaveLength(3)
})

// covers: T34
test('crew from a file are held, not e-mailed: change a role, discard one, and a second import doesn\'t double', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow() // a long journey on a shared, busy test database
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const rigger = `e2e-rigger-${u}@example.com`
  const planner = `e2e-planner-${u}@example.com`
  const file = [['Email', 'Name', 'Function', 'Role'], [rigger, `E2E Rigger ${u}`, 'Rigger', 'freelancer'], [planner, `E2E Planner ${u}`, 'Planner', 'employee']]

  // From Members → "Import your crew from a file"
  await page.goto(`${org.path}?panel=members`)
  await page.getByRole('link', { name: 'Import your crew from a file' }).click()
  await expect(page).toHaveURL(/kind=crew/)
  await expect(page.locator('input[name="imp-kind"][value="crew"]')).toBeChecked(SLOW)
  await pasteAndMatch(page, file)
  await expect(column(page, 'Role')).toHaveValue('role')
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  await expect(page.getByText('Nobody has been e-mailed yet. In Members, check the roles and send the invitations when you\'re ready.')).toBeVisible()
  const held = async () => ok('Reading', await account.client.from('held_invites').select('email, role, status, sent_at').eq('org_id', org.id).in('email', [rigger, planner]).order('email'))
  expect(await held()).toEqual([
    { email: planner, role: 'member', status: 'held', sent_at: null },
    { email: rigger, role: 'viewer', status: 'held', sent_at: null },
  ])

  // Members: the "not invited yet" list
  await page.getByRole('link', { name: 'Review and send the invitations' }).click()
  const list = page.getByRole('region', { name: /imported, not invited yet/ })
  await expect(list).toBeVisible(SLOW)
  await expect(list.getByText(`E2E Rigger ${u}`)).toBeVisible()
  await expectAccessible(page)
  await list.getByRole('combobox', { name: new RegExp(`E2E Planner ${u}`) }).selectOption('viewer')
  await expect.poll(async () => (await held()).find(h => h.email === planner).role, SLOW).toBe('viewer')
  page.once('dialog', d => d.accept())
  await list.getByRole('button', { name: `Discard E2E Rigger ${u}` }).click()
  await expect(list.getByText(`E2E Rigger ${u}`)).toHaveCount(0, SLOW)
  expect((await held()).map(h => [h.email, h.status, h.sent_at])).toEqual([[planner, 'held', null], [rigger, 'discarded', null]])

  // The same file again: the held one isn't doubled
  await openImport(page, org, 'crew')
  await pasteAndMatch(page, file)
  await toCheck(page)
  // The held one matches (the discarded one can come in again)
  await expect(page.getByRole('status').filter({ hasText: /^1new1match what's in AVX/ })).toBeVisible()
  await importAndWait(page, 'Import 2 rows', /1 added · /)
  expect((await held()).filter(h => h.status === 'held').map(h => h.email)).toEqual([planner, rigger])
})

// covers: T35
test('upcoming jobs, their equipment and open quotes: past and cancelled stay out, gear is booked, and a changed date updates the gig', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow() // a long journey on a shared, busy test database
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const shelf = `E2E Job shelf ${u}`
  await addLocation(account, org.id, shelf)
  const client = await addClient(account, org.id, { name: `E2E Job Client ${u}`, email: `job-${u}@example.com` })
  // Two of an item in stock
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Quantity', 'Location', 'Price'], [`E2E Spot ${u}`, `SPOT-${u}`, '2', shelf, '30']])
  await toCheck(page)
  await importAndWait(page, 'Import 1 row', summary(1))

  // Upcoming jobs: the past and the cancelled one are left out, the statuses are read
  const jobs = start => [['Number', 'Name', 'Start', 'End', 'Status', 'Venue', 'Client'],
    [`J1-${u}`, `E2E Festival ${u}`, start, day(31), 'confirmed', 'E2E Park', client.name],
    [`J2-${u}`, `E2E Gala ${u}`, day(30), day(31), 'option', 'E2E Hall', client.name],
    [`J3-${u}`, `E2E Last year ${u}`, day(-300), day(-299), 'confirmed', 'E2E Hall', client.name],
    [`J4-${u}`, `E2E Called off ${u}`, day(40), day(41), 'cancelled', 'E2E Hall', client.name]]
  await openImport(page, org, 'gigs')
  await pasteAndMatch(page, jobs(day(30)))
  await toCheck(page)
  const purpose = page.getByRole('region', { name: /left out on purpose/ })
  await expect(purpose.getByText('1 past job')).toBeVisible()
  await expect(purpose.getByText('1 cancelled job')).toBeVisible()
  await importAndWait(page, 'Import 2 rows', summary(2))
  const gigs = async () => ok('Listing the gigs', await account.client.from('gigs').select('id, import_ref, status, start_date, client_id').eq('org_id', org.id).like('import_ref', `J%-${u}`).order('import_ref'))
  const made = await gigs()
  expect(made.map(g => [g.import_ref, g.status, g.client_id])).toEqual([[`J1-${u}`, 'confirmed', client.id], [`J2-${u}`, 'draft', client.id]])

  // Their equipment: 2 + 1 of an item there are 2 of, on overlapping dates
  await openImport(page, org, 'gig_equipment')
  await pasteAndMatch(page, [['Project number', 'Item code', 'Quantity'], [`J1-${u}`, `SPOT-${u}`, '2'], [`J2-${u}`, `SPOT-${u}`, '1']])
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  await page.goto(`/gig/${made[0].id}?tab=equipment`)
  await expect(page.getByText(`E2E Spot ${u}`).first()).toBeVisible(SLOW)
  await expect(page.getByRole('status').filter({ hasText: "1 item doesn't have enough stock for these dates." })).toBeVisible(SLOW)
  await expectAccessible(page)

  // Open quotes: lines, sections, prices and the client
  await openImport(page, org, 'quotes')
  await pasteAndMatch(page, [['Quote number', 'Title', 'Client', 'Section', 'Description', 'Quantity', 'Days', 'Price'],
    [`Q-${u}`, `E2E Quote ${u}`, client.name, 'Lighting', `E2E Spot ${u}`, '2', '1', '30'],
    [`Q-${u}`, `E2E Quote ${u}`, client.name, 'Crew', 'E2E Technician', '1', '2', '250']])
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(1))
  const quote = ok('Finding the quote', await account.client.from('quotes').select('id, status, client_id, total_net').eq('org_id', org.id).eq('import_ref', `Q-${u}`).single())
  expect(quote).toMatchObject({ status: 'draft', client_id: client.id, total_net: 560 })
  await page.goto(`/quote/${quote.id}`)
  const sections = page.getByRole('textbox', { name: 'Section name' })
  await expect(sections.first()).toBeVisible(SLOW)
  expect(await sections.evaluateAll(els => els.map(e => e.value))).toEqual(['Lighting', 'Crew'])
  const filled = () => page.locator('input, textarea').evaluateAll(els => els.map(e => e.value))
  await expect.poll(filled).toEqual(expect.arrayContaining([`E2E Spot ${u}`, 'E2E Technician']))

  // The jobs again with one date changed: that gig changes, nothing doubles
  await openImport(page, org, 'gigs')
  await pasteAndMatch(page, jobs(day(29)))
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(0, 1, 1))
  const again = await gigs()
  expect(again).toHaveLength(2)
  expect(again[0].start_date).toBe(day(29))
})

// covers: T37
test('Rentman exports: recognised, every column matched, equipment asks for a location, and the checklist ticks', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow() // a long journey on a shared, busy test database
  const { page, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  // A fresh organisation, so the checklist starts empty
  const org = await addOrg(account, { name: `E2E Import Rentman ${u}` })
  const rentman = 'Recognised as a Rentman export: its columns are matched below. Check them before going on.'
  const allMatched = async () => {
    const pickers = page.getByRole('list', { name: 'Match columns' }).getByRole('combobox')
    const n = await pickers.count()
    for (let i = 0; i < n; i++) await expect(pickers.nth(i), `column ${i + 1} wasn't matched`).not.toHaveValue('')
  }
  await page.goto(`${org.path}/inventory/import?kind=items`)
  const checklist = page.getByRole('region', { name: /Moving from another tool/ })
  await expect(checklist.getByText('0 of 10')).toBeVisible(SLOW)
  await addLocation(account, org.id, 'E2E Warehouse')

  // Equipment: recognised, matched, and the stock's location asked
  await openImport(page, org, 'items')
  await page.locator('input[type="file"]').setInputFiles(fixture('rentman-equipment.csv'))
  await toMatch(page)
  await expect(page.getByText(rentman)).toBeVisible()
  await allMatched()
  await expect(page.getByText('The file has quantities but no location column: choose where all that stock is.')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('region', { name: /Same for every row/ }).getByLabel('Location', { exact: true }).selectOption('E2E Warehouse')
  await toCheck(page)
  // Its "rental sales" value "sales" isn't one AVX knows (it knows "sale"): treated as Sale
  const sales = group(page, 'sales')
  await sales.getByRole('combobox', { name: 'Treat "sales" in every row as' }).selectOption({ label: 'Sale' })
  await sales.getByRole('button', { name: 'Apply' }).click()
  // The gaffa tape (not kept in stock, with a quantity) is caught in the check (#227): counted in bulk instead
  const gaffa = group(page, 'E2E Gaffa tape')
  await expect(gaffa).toContainText('an item not kept in stock can\'t have a quantity')
  await gaffa.getByRole('radio', { name: 'Count it in bulk instead' }).check()
  await gaffa.getByRole('button', { name: 'Apply' }).click()
  await importAndWait(page, 'Import 3 rows', / 0 skipped$/)
  for (const code of ['E2E-LA', 'E2E-SUB']) expect(await itemByCode(account, org.id, code), code).not.toBeNull()

  // Serial numbers: recognised and matched (not imported: the items are counted in bulk)
  await openImport(page, org, 'units')
  await page.locator('#imp-paste').fill('equipment\tserial\tasset location\tpurchasedate\tpurchase costs\nE2E Line array\tLA-0001\tE2E Warehouse\t2024-05-01\t1500')
  await toMatch(page)
  await expect(page.getByText(rentman)).toBeVisible()
  await allMatched()

  // Contacts, crew and projects
  for (const [kind, file, rows] of [['clients', 'rentman-contacts.csv', 1], ['crew', 'rentman-crew.csv', 2]]) {
    await openImport(page, org, kind)
    await page.locator('input[type="file"]').setInputFiles(fixture(file))
    await toMatch(page)
    await expect(page.getByText(rentman)).toBeVisible()
    await allMatched()
    await toCheck(page)
    await importAndWait(page, `Import ${rows} row${rows > 1 ? 's' : ''}`, summary(rows))
  }
  const client = ok('Reading the client', await account.client.from('clients').select('address, tax_id').eq('org_id', org.id).eq('name', 'E2E Rentman Client').single())
  expect(client).toEqual({ address: 'Rua Inventada 12\n1000-001 Lisboa', tax_id: 'PT999999990' })
  await openImport(page, org, 'gigs')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'rentman-projects.csv', mimeType: 'text/csv',
    buffer: Buffer.from(`number,displayname,planperiod start,planperiod end,status,customer\nRM-${u},E2E Rentman project ${u},${day(20)},${day(21)},Confirmed,E2E Rentman Client\n`),
  })
  await toMatch(page)
  await expect(page.getByText(rentman)).toBeVisible()
  await allMatched()
  await toCheck(page)
  await importAndWait(page, 'Import 1 row', summary(1))

  // The checklist ticks each step done: locations, equipment, clients, crew and jobs
  await page.goto(`${org.path}/inventory/import`)
  await expect(checklist.getByText('5 of 10')).toBeVisible(SLOW)
  await expect(checklist.getByRole('button', { name: /^Equipment [23] in AVX$/ })).toBeVisible()
  await expect(checklist.getByRole('button', { name: /^Crew 2 in AVX$/ })).toBeVisible()
  await expect(checklist.getByRole('button', { name: /^Units \(serial numbers\) not yet$/ })).toBeVisible()
})

// covers: T37 (bug #227: the check used to let it through and the database then refused the row)
test('an item not kept in stock but with a quantity is caught in the check', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const shelf = `E2E Tape shelf ${u}`
  await addLocation(account, org.id, shelf)
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Kind', 'Stock management', 'Quantity', 'Location'], [`E2E Tape ${u}`, `TAPE-${u}`, 'sale', 'no', '50', shelf]])
  await expect(column(page, 'Stock management')).toHaveValue('tracking')
  await toCheck(page)
  const tape = group(page, `E2E Tape ${u}`)
  await expect(tape).toContainText('an item not kept in stock can\'t have a quantity')
  await expect(page.getByText('1 row waiting for a decision will be left out.')).toBeVisible()
  // Fixed here: the quantity is left out and the item goes in, not kept in stock
  await tape.getByRole('radio', { name: 'Leave the quantity out (not kept in stock)' }).check()
  await tape.getByRole('button', { name: 'Apply' }).click()
  await importAndWait(page, 'Import 1 row', summary(1))
  const [tapeItem] = ok('Finding the tape', await account.client.from('price_items').select('tracking').eq('org_id', org.id).eq('name', `E2E Tape ${u}`))
  expect(tapeItem).toMatchObject({ tracking: 'none' })
})

// covers: T143
test('your own field: a column fills it on the item, and undoing the import takes the value away', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const label = `E2E Colour ${u}`
  const field = ok('Adding the field', await account.client.from('custom_fields').insert({ org_id: org.id, entity: 'item', label, kind: 'text' }).select().single())
  const item = await addItem(account, org.id, { name: `E2E Painted ${u}`, code: `PNT-${u}` })
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Code', 'Name', label], [`PNT-${u}`, `E2E Painted ${u}`, 'Ruby red']])
  await column(page, label).selectOption({ label })
  await toCheck(page)
  await importAndWait(page, 'Import 1 row', summary(0, 1))
  await page.goto(`${org.path}/inventory/${item.id}`)
  await expect(page.getByText('Ruby red')).toBeVisible(SLOW)
  const value = async () => (await itemByCode(account, org.id, `PNT-${u}`)).custom_values?.[field.id] ?? null
  expect(await value()).toBe('Ruby red')

  await page.goto(`${org.path}/inventory/import`)
  const dialog = await undoNewest(page)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Undo the import' }).click()
  await expect(page.getByText(/Import undone: 0 removed, 1 put back/)).toBeVisible(SLOW)
  expect(await value()).toBeNull()
  await page.goto(`${org.path}/inventory/${item.id}`)
  await expect(page.getByText(`E2E Painted ${u}`).first()).toBeVisible(SLOW)
  await expect(page.getByText('Ruby red')).toHaveCount(0)
})

// covers: T150
test('fixes remembered with a saved matching are there the next time it is chosen', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  const u = uniq()
  const preset = `E2E Remembered ${u}`
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Kind'], [`E2E Hired ${u}`, `HR1-${u}`, 'Huurgoed']])
  await page.getByLabel('Save this matching as').fill(preset)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(`Saved as "${preset}": next time choose it and the columns are matched.`)).toBeVisible()
  await toCheck(page)
  const g = group(page, 'Huurgoed')
  await g.getByRole('combobox', { name: 'Treat "Huurgoed" in every row as' }).selectOption({ label: 'Rental' })
  await g.getByRole('button', { name: 'Apply' }).click()
  const remember = page.getByRole('checkbox', { name: `Remember these fixes with "${preset}"` })
  await expect(remember).toBeChecked()
  await expectAccessible(page)
  await importAndWait(page, 'Import 1 row', summary(1))

  // Another file of the same kind, with the saved matching: the fix is already there
  await openImport(page, org, 'items')
  await page.locator('#imp-paste').fill(`Name\tCode\tKind\nE2E Hired too ${u}\tHR2-${u}\tHuurgoed`)
  await toMatch(page)
  await page.getByLabel('Saved matching').selectOption({ label: preset })
  await toCheck(page)
  await expect(page.getByRole('region', { name: 'Your fix (1)' }).getByText('Kind (rental, sale…) “Huurgoed” treated as Rental')).toBeVisible()
  await expect(page.getByText('No problems: every row can go in.')).toBeVisible()
  await importAndWait(page, 'Import 1 row', summary(1))
  expect(ok('Reading', await account.client.from('price_items').select('kind').eq('org_id', org.id).eq('code', `HR2-${u}`).single()).kind).toBe('rental')
})

// covers: T151
test('units for an item counted in bulk: "Switch to per unit", and undoing the units counts it in bulk again', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  const name = `E2E Mic ${u}`
  const shelf = `E2E Mic shelf ${u}`
  await addLocation(account, org.id, shelf)
  await openImport(page, org, 'items')
  await pasteAndMatch(page, [['Name', 'Code', 'Quantity', 'Location'], [name, `MIC-${u}`, '3', shelf]])
  await toCheck(page)
  await importAndWait(page, 'Import 1 row', summary(1))
  const item = await itemByCode(account, org.id, `MIC-${u}`)
  expect(item.tracking).toBe('bulk')

  await openImport(page, org, 'units')
  await pasteAndMatch(page, [['Item', 'Barcode', 'Location'], [name, `M1-${u}`, shelf], [name, `M2-${u}`, shelf]])
  await toCheck(page)
  const g = group(page, name)
  await expect(g.getByText(`"${name}" is counted in bulk, not per unit`)).toBeVisible()
  // The switch is offered once AVX has checked the item's stock is still just what the import added
  const perUnit = g.getByRole('radio', { name: `Switch "${name}" to per unit` })
  await expect(perUnit).toBeEnabled(SLOW)
  await perUnit.check()
  await g.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText(`${name} switches to per unit (its imported quantity goes)`)).toBeVisible()
  await importAndWait(page, 'Import 2 rows', /2 added · /)
  expect((await itemByCode(account, org.id, `MIC-${u}`)).tracking).toBe('serial')
  expect((await unitsOf(account, item.id)).map(x => x.code)).toEqual([`M1-${u}`, `M2-${u}`])

  const dialog = await undoNewest(page)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Undo the import' }).click()
  await expect(page.getByText(/Import undone/)).toBeVisible(SLOW)
  expect((await itemByCode(account, org.id, `MIC-${u}`)).tracking).toBe('bulk')
  expect(await unitsOf(account, item.id)).toEqual([])
  const stock = ok('Reading the stock', await account.client.from('stock_levels').select('quantity').eq('item_id', item.id))
  expect(stock.map(s => s.quantity)).toEqual([3])
})

// covers: T157
test('decided quotes: their status and dates come in, and the win rate counts them in their month with the reason', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow() // the reports are heavy on the shared test database
  const { page, org, account } = adminWithOrg
  await readBell(account)
  const u = uniq()
  // A month three months ago: sent on the 3rd, accepted on the 10th, declined on the 12th
  const m = new Date()
  m.setDate(1)
  m.setMonth(m.getMonth() - 3)
  const on = d => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  await openImport(page, org, 'quotes')
  await pasteAndMatch(page, [['Quote number', 'Title', 'Description', 'Quantity', 'Price', 'Status', 'Sent on', 'Decided on', 'Reason'],
    [`QA-${u}`, `E2E Won ${u}`, 'E2E Sound system', '1', '1000', 'accepted', on(3), on(10), ''],
    [`QD-${u}`, `E2E Lost ${u}`, 'E2E Lights', '1', '800', 'declined', on(3), on(12), 'too expensive']])
  for (const [header, key] of [['Status', 'status'], ['Sent on', 'sent_date'], ['Decided on', 'decided_date'], ['Reason', 'lost_reason']]) {
    await expect(column(page, header)).toHaveValue(key)
  }
  await toCheck(page)
  await importAndWait(page, 'Import 2 rows', summary(2))
  const quotes = ok('Reading the quotes', await account.client.from('quotes').select('import_ref, status, sent_at, decided_at, lost_reason').eq('org_id', org.id).in('import_ref', [`QA-${u}`, `QD-${u}`]).order('import_ref'))
  expect(quotes.map(q => [q.import_ref, q.status, q.sent_at?.slice(0, 10), q.decided_at?.slice(0, 10), q.lost_reason])).toEqual([
    [`QA-${u}`, 'accepted', on(3), on(10), null],
    [`QD-${u}`, 'declined', on(3), on(12), 'price'],
  ])

  // Reports → Sales → Win rate (last 12 months, by month): both decided in that month, one lost on price
  await page.goto(`${org.path}/reports?tab=sales&view=winrate`)
  const { reportLoaded } = await import('./helpers.js')
  const month = m.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  const row = page.getByRole('row').filter({ hasText: month })
  await reportLoaded(page, row.first(), { timeout: 60_000 })
  await expect(row.getByRole('cell').nth(1)).toHaveText('2')
  const lost = page.getByRole('region', { name: 'Why quotes were lost' })
  await expect(lost.getByText('Price too high')).toBeVisible()
  await expect(lost.getByText(/^1 quote/)).toBeVisible()
})

// ---- On a phone (320 px) ----

// Nothing sticks out sideways (the preview table scrolls inside its own box)
async function fitsWidth(page, width = 320) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'the page scrolls sideways').toBeLessThanOrEqual(width)
}
const PHONE = { width: 320, height: 640 }

// covers: T137, T145, T153
test('on a phone: Choose, Match, a check with several groups, the remember line, Done and the undo dialog fit', { tag: TAG }, async ({ browser, baseURL, world }) => {
  test.slow() // a long journey on a shared, busy test database
  const [account, org] = await Promise.all([world.admin(), world.org()])
  await readBell(account)
  const u = uniq()
  const page = await pageAs(browser, account, { baseURL, viewport: PHONE })
  try {
    await openImport(page, org, 'items')
    await fitsWidth(page)
    await page.locator('#imp-paste').fill([['Name', 'Code', 'Price', 'Quantity', 'Location', 'Kind'],
      [`E2E Phone desk ${u}`, `PD-${u}`, 'lots', '1', `Phone shelf ${u}`, 'rental'],
      [`E2E Phone lamp ${u}`, `PL-${u}`, '12', '2', `Phone shelf ${u}`, 'Huurgoed'],
      [`E2E Phone cable ${u}`, `PC-${u}`, '3', '4', `Phone shelf ${u}`, 'rental']].map(r => r.join('\t')).join('\n'))
    await expectAccessible(page)
    await toMatch(page)
    await page.getByLabel('Save this matching as').fill(`E2E Phone ${u}`)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText(`Saved as "E2E Phone ${u}"`, { exact: false })).toBeVisible()
    await fitsWidth(page)
    await expectAccessible(page)
    await toCheck(page)

    // Several groups, each control used
    const price = page.getByRole('region', { name: '1 row · Price', exact: true })
    await price.getByRole('textbox', { name: /^Line/ }).fill('9')
    await price.getByRole('button', { name: 'Apply' }).click()
    const kind = group(page, 'Huurgoed')
    await kind.getByRole('combobox').selectOption({ label: 'Rental' })
    await kind.getByRole('button', { name: 'Apply' }).click()
    const loc = group(page, `Phone shelf ${u}`)
    await loc.getByRole('combobox').selectOption({ label: 'Vehicle' })
    await loc.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByRole('region', { name: 'Your fixes (3)' })).toBeVisible()
    await page.getByRole('button', { name: /^Take back: Price/ }).click()
    await expect(page.getByRole('region', { name: 'Your fixes (2)' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: `Remember these fixes with "E2E Phone ${u}"` })).toBeVisible()
    await fitsWidth(page)
    await expectAccessible(page)
    await importAndWait(page, 'Import 2 rows · adds 1 location', summary(2))
    await fitsWidth(page)
    await expectAccessible(page)

    // Put one on a gig, then undo: the in-use list fits
    const item = await itemByCode(account, org.id, `PL-${u}`)
    const gig = await addGig(account, org.id, { name: `E2E Phone gig ${u}` })
    ok('Booking the item', await account.client.from('gig_equipment').insert({ gig_id: gig.id, org_id: org.id, item_id: item.id, item_name: item.name, quantity: 1 }))
    const dialog = await undoNewest(page)
    await fitsWidth(page)
    await dialog.getByRole('checkbox').check()
    await dialog.getByRole('button', { name: 'Undo the import' }).click()
    await expect(dialog.getByText(`E2E Phone lamp ${u}: on the gig E2E Phone gig ${u}`)).toBeVisible(SLOW)
    await fitsWidth(page)
    await expectAccessible(page)
    await dialog.getByRole('button', { name: 'Keep everything' }).click()
  } finally {
    await page.context().close()
  }
})

// covers: T158
test('on a phone: the check with "Import as past jobs" fits', { tag: TAG }, async ({ browser, baseURL, world }) => {
  const [account, org] = await Promise.all([world.admin(), world.org()])
  await readBell(account)
  const u = uniq()
  const page = await pageAs(browser, account, { baseURL, viewport: PHONE })
  try {
    await openImport(page, org, 'gigs')
    await page.locator('#imp-paste').fill(`Number\tName\tStart\tEnd\nPP-${u}\tE2E Phone past ${u}\t${day(-50)}\t${day(-49)}\nPN-${u}\tE2E Phone next ${u}\t${day(50)}\t${day(51)}`)
    await toMatch(page)
    await fitsWidth(page)
    await toCheck(page)
    const purpose = page.getByRole('region', { name: /left out on purpose/ })
    await expect(purpose.getByText('1 past job')).toBeVisible()
    await fitsWidth(page)
    await expectAccessible(page)
    await purpose.getByRole('button', { name: 'Import as past jobs' }).click()
    await expect(page.getByText('1 past job imported as done')).toBeVisible()
    await fitsWidth(page)
    await importAndWait(page, 'Import 2 rows', summary(2))
  } finally {
    await page.context().close()
  }
})

// covers: T137, T145, T153, T158, T160
test('in Portuguese on a phone: the steps fit, and "Seguinte: Unidades (números de série)" fits on screen', { tag: TAG }, async ({ browser, baseURL, world }) => {
  test.slow() // a long journey on a shared, busy test database
  const [account, org] = await Promise.all([world.admin(), world.org()])
  await readBell(account)
  const u = uniq()
  const page = await pageAs(browser, account, { baseURL, lang: 'pt', viewport: PHONE })
  try {
    await page.goto(`${org.path}/inventory/import?kind=items`)
    await expect(page.locator('#imp-paste')).toBeVisible(SLOW)
    await fitsWidth(page)
    await expectAccessible(page)
    await page.locator('#imp-paste').fill(`Nome\tCódigo\tQuantidade\tLocal\nE2E Telemóvel ${u}\tPT-${u}\t2\tArmazém PT ${u}`)
    await page.getByRole('button', { name: 'Seguinte', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'O que a coluna Nome passa a ser' })).toHaveValue('name')
    await fitsWidth(page)
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Seguinte', exact: true }).click()
    const g = group(page, `Armazém PT ${u}`)
    await expect(g.getByRole('radio', { name: `Adicionar "Armazém PT ${u}" como novo local` })).toBeChecked(SLOW)
    await fitsWidth(page)
    await expectAccessible(page)
    await g.getByRole('button', { name: 'Aplicar' }).click()
    await page.getByRole('button', { name: 'Importar 1 linha · adiciona 1 local', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '1 adicionados · 0 atualizados · 0 sem alterações · 0 ignorados' })).toBeVisible(SLOW)

    // The Done step: the button to the next kind is on screen, whole
    const next = page.getByRole('button', { name: 'Seguinte: Unidades (números de série)' })
    await expect(next).toBeVisible()
    const box = await next.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width)
    await fitsWidth(page)
    await expectAccessible(page)

    // The undo dialog in Portuguese
    await page.getByRole('region', { name: 'Importações anteriores' }).getByRole('button', { name: /^Anular/ }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Anular esta importação?' })
    await expect(dialog.getByRole('checkbox', { name: 'Compreendo que isto remove registos de vez.' })).toBeVisible()
    await fitsWidth(page)
    await expectAccessible(page)
  } finally {
    await page.context().close()
  }
})

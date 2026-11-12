// Inventory, labels and subrentals (AT4): the owner's manual test lines T4, T6, T9, T25, T64, T95,
// T96, T128–T131 and T180 (docs/PENDING.md section 2) as signed-in journeys on the TEST project.
// Data is made through the set-up (setup.js) and the database API as the test user; only what a line
// tests is clicked through. Camera scanning and printing stay manual (codes are typed instead of
// scanned). What stays manual is in docs/notes/AT4.md.
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addGig, addItem, addToGig, pageAs } from './setup.js'
import { RUN } from './accounts.js'

test.use({ area: 'inventory', actionTimeout: 30_000 })

const TAG = '@inventory'
const ALL_STEPS = ['prepped', 'loaded', 'on_site', 'loaded_back', 'returned', 'checked_in']
const LOAD = { timeout: 45_000 }
const uniq = () => `${RUN}-${Date.now().toString(36)}`
const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
// A 1×1 PNG, for the damage photo
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

// The people here collect notifications as the file runs; the bell's name doesn't include its "9+"
// from ten unread on (issue #209), so each test starts with them read (as in hours.spec.js)
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}

// A serial-tracked item with `units` units (codes made by the database), as Inventory → Add item → Add units
async function itemWithUnits(account, orgId, { units = 0, ...fields } = {}) {
  const item = await addItem(account, orgId, { tracking: 'serial', category: 'Audio', ...fields })
  const rows = units
    ? ok('Adding units', await account.client.from('stock_units').insert(Array.from({ length: units }, () => ({ org_id: orgId, item_id: item.id }))).select('id, code').order('code'))
    : []
  return { ...item, units: rows }
}
// A line on a gig's Equipment tab, as the add-equipment picker makes it
async function planLine(account, gig, item, quantity) {
  return ok('Planning equipment', await account.client.from('gig_equipment').insert({
    gig_id: gig.id, org_id: gig.org_id, item_id: item.id, item_name: item.name, category: item.category || null, quantity, created_by: account.id,
  }).select().single())
}
const equipmentTab = (page, gig) => page.goto(`${gig.path}?tab=equipment`)

// covers: T4
test('equipment on a gig: going past what you own shows ⚠, subrent the rest or swap to an alternative', { tag: ['@smoke', TAG] }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const id = uniq()
  const gig = await addGig(account, org.id, { name: `E2E Equipment ${id}` })
  const desk = await itemWithUnits(account, org.id, { name: `E2E Desk ${id}`, units: 2 })
  const spare = await itemWithUnits(account, org.id, { name: `E2E Backup console ${id}`, units: 2 })
  ok('Linking the alternative', await account.client.from('item_alternatives').insert({ org_id: org.id, item_a: desk.id, item_b: spare.id }))

  // Add equipment: the picker shows how many are free; plan 3 of the 2 owned
  await equipmentTab(page, gig)
  await page.getByRole('button', { name: 'Add equipment' }).first().click({ timeout: 45_000 })
  const picker = page.getByRole('dialog', { name: 'Add equipment' })
  await picker.getByRole('textbox', { name: 'Search name, code, brand…' }).fill(id)
  const row = picker.locator('label').filter({ hasText: desk.name })
  await expect(row).toContainText('2 of 2 free', LOAD)
  await row.getByRole('checkbox').check()
  await picker.getByLabel(`Quantity of ${desk.name}`, { exact: true }).fill('3')
  await expectAccessible(page)
  await picker.getByRole('button', { name: 'Add 1 item' }).click()
  await expect(picker).toBeHidden(LOAD)

  // The line is 1 short, with the banner, "Subrent 1" and the alternative
  const line = page.getByRole('listitem').filter({ hasText: desk.name })
  await expect(line).toContainText('1 short (2 free)', LOAD)
  await expect(page.getByRole('status').filter({ hasText: "1 item doesn't have enough stock for these dates" })).toBeVisible()
  await expect(line.getByRole('button', { name: `Use 1 × ${spare.name}` })).toBeVisible(LOAD)
  await expectAccessible(page)

  // Subrent 1: the new subrental has the gig and the missing piece filled in
  await line.getByRole('button', { name: 'Subrent 1' }).click()
  const sub = page.getByRole('dialog', { name: 'New subrental' })
  await expect(sub.getByLabel('Description', { exact: true })).toHaveValue(desk.name, LOAD)
  await expect(sub.getByLabel('Quantity', { exact: true })).toHaveValue('1')
  await expect(sub.getByLabel('For gig', { exact: true })).toHaveValue(gig.id)
  await sub.getByLabel('Supplier *', { exact: true }).selectOption('new')
  await sub.getByLabel('Supplier name', { exact: true }).fill(`E2E Hire Co ${id}`)
  await sub.getByLabel('Cost each', { exact: true }).fill('25')
  await expectAccessible(page)
  await sub.getByRole('button', { name: 'Save' }).click()
  await expect(sub).toBeHidden(LOAD)
  const hired = page.getByRole('heading', { name: /Hired in for this gig/ }).locator('..')
  await expect(hired).toContainText(`E2E Hire Co ${id}`, LOAD)
  await expect(hired).toContainText(`1 × ${desk.name}`)

  // The alternative: one moves to the spare desk, and nothing is short any more
  await line.getByRole('button', { name: `Use 1 × ${spare.name}` }).click()
  await expect(page.getByText(`1 moved to ${spare.name}.`)).toBeVisible(LOAD)
  await expect(page.getByLabel(`Quantity of ${spare.name}`, { exact: true })).toHaveValue('1', LOAD)
  await expect(page.getByLabel(`Quantity of ${desk.name}`, { exact: true })).toHaveValue('2')
  await expect(line).toContainText('2 free')
  await expect(line).not.toContainText('short')
  await expect(page.getByRole('status').filter({ hasText: "doesn't have enough stock" })).toHaveCount(0)
})

// covers: T6
test('crew report damage from site with a photo; the repair shows under Maintenance', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, account, org } = adminWithOrg
  const id = uniq()
  const crew = await world.account('crew')
  const gig = await addGig(account, org.id, { name: `E2E Damage ${id}` })
  await addToGig(account, gig.id, crew)
  const amp = await itemWithUnits(account, org.id, { name: `E2E Amp ${id}`, units: 1 })
  await planLine(account, gig, amp, 1)
  await readBell(account, crew)

  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await equipmentTab(crewPage, gig)
    await crewPage.getByRole('button', { name: 'Report damage' }).first().click({ timeout: 45_000 })
    const form = crewPage.getByRole('dialog', { name: 'Report damage' })
    await expect(form.getByLabel('Item', { exact: true })).toHaveValue(amp.id)
    await form.getByLabel('Unit code (on its label)', { exact: true }).fill(amp.units[0].code)
    await form.getByLabel("What's wrong *", { exact: true }).fill('Left channel crackles')
    await form.locator('input[type=file]').setInputFiles({ name: 'damage.png', mimeType: 'image/png', buffer: PNG })
    await expect(form).toContainText('damage.png')
    await expectAccessible(crewPage)
    await form.getByRole('button', { name: 'Send report' }).click()
    await expect(crewPage.getByText('Damage reported. Thanks!')).toBeVisible(LOAD)
    await expect(form).toBeHidden()
  } finally {
    await crewPage.context().close()
  }

  // The admin: Inventory → Maintenance lists it as Reported, from the gig, with the photo
  await page.goto(`${org.path}/inventory?tab=maintenance`)
  const repair = page.getByRole('button').filter({ hasText: amp.name }).filter({ hasText: 'Left channel crackles' })
  await expect(repair).toBeVisible(LOAD)
  await expect(repair).toContainText(amp.units[0].code)
  await expect(repair).toContainText(gig.name)
  await expect(repair).toContainText('Reported')
  await expect(repair.getByLabel('Photo', { exact: true })).toBeVisible()
  await expectAccessible(page)
  const row = ok('Reading the repair', await account.client.from('repairs').select('status, unit_id, gig_id, photo_path').eq('item_id', amp.id).single())
  expect(row).toMatchObject({ status: 'open', unit_id: amp.units[0].id, gig_id: gig.id })
  expect(row.photo_path).toBeTruthy()
})

// Opens the item's Edit form and its Speaker specs part
async function editSpeaker(page, org, item) {
  await page.goto(`${org.path}/inventory/${item.id}`)
  await page.getByRole('button', { name: 'Edit' }).first().click({ timeout: 45_000 })
  const form = page.getByRole('dialog').filter({ has: page.getByText('Speaker specs') })
  await expect(form).toBeVisible(LOAD)
  const specs = form.locator('details').filter({ hasText: 'Speaker specs' })
  if (!(await specs.getAttribute('open') !== null)) await specs.locator('summary').click()
  return { form, specs }
}

// covers: T95
test('speaker presets: L-Acoustics X12 fills the specs; an out-of-range sensitivity won\'t save', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const item = await addItem(account, org.id, { name: `E2E Speaker ${uniq()}`, tracking: 'serial', category: 'Audio' })
  const { form, specs } = await editSpeaker(page, org, item)
  await specs.getByLabel('Fill from a preset', { exact: true }).selectOption({ label: 'L-Acoustics X12' })
  await expect(specs.getByLabel('Max SPL (dB)', { exact: true })).toHaveValue('136')
  await expect(specs.getByLabel('Horizontal dispersion (°)', { exact: true })).toHaveValue('60')
  await expect(specs.getByLabel('Vertical dispersion (°)', { exact: true })).toHaveValue('90')
  await expect(specs.getByLabel('Lowest frequency (Hz)', { exact: true })).toHaveValue('59')
  await expect(specs.getByLabel('Highest frequency (Hz)', { exact: true })).toHaveValue('20000')
  await expect(specs.getByLabel('Impedance (Ω)', { exact: true })).toHaveValue('8')
  await expect(form.getByLabel('Weight (kg)', { exact: true })).toHaveValue('20')
  await expect(specs.getByLabel('Datasheet', { exact: true })).toHaveValue(/X12 system spec sheet/)
  await expect(specs).toContainText('Filled from the L-Acoustics X12 preset.')
  await expectAccessible(page)

  // 200 dB sensitivity: the form says the range and won't save
  await specs.getByLabel('Sensitivity (dB, 1 W/1 m)', { exact: true }).fill('200')
  await expect(specs.getByText('Between 60 and 130')).toBeVisible()
  await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled()
  await specs.getByLabel('Sensitivity (dB, 1 W/1 m)', { exact: true }).fill('')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden(LOAD)

  // The item page lists them
  const page2 = page.getByRole('main')
  await expect(page2).toContainText('136 dB', LOAD)
  await expect(page2).toContainText('60° × 90°')
  await expect(page2).toContainText('59–20000 Hz')
  await expect(page2).toContainText('8 Ω')
  await expect(page2).toContainText('20 kg')
  await expect(page2).toContainText('X12 system spec sheet')
  const saved = ok('Reading the item', await account.client.from('price_items').select('max_spl_db, sensitivity_db, speaker_preset').eq('id', item.id).single())
  expect(saved).toMatchObject({ max_spl_db: 136, sensitivity_db: null, speaker_preset: 'l-acoustics-x12' })
})

// covers: T96
test('rigging data from the d&b V8 preset carries the "needs a second person\'s check" note', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const item = await addItem(account, org.id, { name: `E2E Line array ${uniq()}`, tracking: 'serial', category: 'Audio' })
  const { form, specs } = await editSpeaker(page, org, item)
  await specs.getByLabel('Fill from a preset', { exact: true }).selectOption({ label: 'd&b audiotechnik V8' })
  const note = specs.getByRole('note').filter({ hasText: 'Needs a second person’s check before use.' })
  await expect(note).toBeVisible()
  await expect(specs.getByLabel('Bumper / frame limits', { exact: true })).toHaveValue(/Z5380 V Flying frame/)
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden(LOAD)

  const rigging = page.getByRole('region', { name: 'Rigging data' })
  await expect(rigging).toBeVisible(LOAD)
  await expect(rigging).toContainText('Needs a second person’s check before use.')
  await expect(rigging).toContainText('Z5380 V Flying frame')
  await expectAccessible(page)
})

// covers: T180
test('item volume: typed in, or worked out from the size', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const id = uniq()
  const typed = await addItem(account, org.id, { name: `E2E Volume typed ${id}`, tracking: 'serial' })
  const sized = await addItem(account, org.id, { name: `E2E Volume sized ${id}`, tracking: 'serial' })

  // One: Volume (m³) typed in the form
  await page.goto(`${org.path}/inventory/${typed.id}`)
  await page.getByRole('button', { name: 'Edit' }).first().click({ timeout: 45_000 })
  let form = page.getByRole('dialog').filter({ has: page.getByLabel('Volume (m³)', { exact: true }) })
  await form.getByLabel('Volume (m³)', { exact: true }).fill('0.084')
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden(LOAD)
  await expect(page.getByRole('main')).toContainText('0.084 m³', LOAD)

  // The other: no volume, size 60 x 40 x 50 cm
  await page.goto(`${org.path}/inventory/${sized.id}`)
  await page.getByRole('button', { name: 'Edit' }).first().click({ timeout: 45_000 })
  form = page.getByRole('dialog').filter({ has: page.getByLabel('Volume (m³)', { exact: true }) })
  await form.getByLabel('Size', { exact: true }).fill('60 x 40 x 50 cm')
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden(LOAD)
  await expect(page.getByRole('main')).toContainText('60 x 40 x 50 cm', LOAD)
  const saved = ok('Reading the item', await account.client.from('price_items').select('volume_m3, dimensions').eq('id', sized.id).single())
  expect(saved).toEqual({ volume_m3: null, dimensions: '60 x 40 x 50 cm' })

  // Where the volume is used: a gig's Packing list per vehicle (an outward trip in a van). The item
  // without a volume counts 0.12 m³ read from its size; the other its own 0.084 (0.08 rounded)
  const gig = await addGig(account, org.id, { name: `E2E Volume gig ${id}` })
  const van = ok('Adding the van', await account.client.from('vehicles').insert({ org_id: org.id, name: `E2E Van ${id}`, max_load_kg: 1000, volume_m3: 10 }).select().single())
  ok('Planning the trip', await account.client.from('trips').insert({
    gig_id: gig.id, vehicle_id: van.id, direction: 'out',
    departs_at: `${gig.start_date}T07:00:00Z`, arrives_at: `${gig.start_date}T09:00:00Z`,
  }))
  await planLine(account, gig, typed, 1)
  await planLine(account, gig, sized, 1)
  await page.goto(`${gig.path}/loads`)
  const left = page.getByRole('region', { name: 'Not in a vehicle yet' })
  await expect(left.getByRole('listitem').filter({ hasText: sized.name })).toContainText('0.12 m³', LOAD)
  await expect(left.getByRole('listitem').filter({ hasText: typed.name })).toContainText('0.08 m³')
  await expectAccessible(page)
})

// covers: T25
test('scan steps: Prepped and Out (loaded), Undo, the bars and the Step column; "On site" can be turned off', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const id = uniq()
  const gig = await addGig(account, org.id, { name: `E2E Scan ${id}` })
  const mic = await itemWithUnits(account, org.id, { name: `E2E Mic ${id}`, units: 3 })
  await planLine(account, gig, mic, 3)
  const codes = mic.units.map(u => u.code)
  // Every step on (the organisation's default), whatever an earlier run left
  ok('Using every step', await account.client.from('organisations').update({ equipment_steps: ALL_STEPS }).eq('id', org.id))
  try {
    await page.goto(`${gig.path}/scan`)
    const steps = page.getByRole('radiogroup', { name: 'What this scan records' })
    await expect(steps.getByRole('radio', { name: 'On site' })).toBeVisible(LOAD)
    const code = page.getByLabel('Code', { exact: true })
    const record = async value => {
      await code.fill(value)
      await page.getByRole('button', { name: 'Record' }).click()
      await expect(code).toHaveValue('', LOAD)
    }

    // Prepped: three labels typed as a scanner would
    await steps.getByRole('radio', { name: 'Prepped' }).click()
    for (const c of codes) await record(c)
    await expect(page.getByRole('heading', { name: 'Prepped 3 of 3' })).toBeVisible(LOAD)
    await expectAccessible(page)

    // Out (loaded): two, then undo the last one
    await steps.getByRole('radio', { name: 'Out (loaded)' }).click()
    await record(codes[0])
    await record(codes[1])
    await expect(page.getByRole('heading', { name: 'Out 2 of 3' })).toBeVisible(LOAD)
    // The newest scan is at the top; that code's Prepped scan keeps its own Undo
    const undoSecond = page.getByRole('button', { name: new RegExp(`^Undo\\b.*${codes[1]}`) })
    await expect(undoSecond).toHaveCount(2)
    await undoSecond.first().click()
    await expect(page.getByRole('heading', { name: 'Out 1 of 3' })).toBeVisible(LOAD)
    await expect(undoSecond).toHaveCount(1)

    // The gig's Equipment tab: a bar per step
    await page.goto(`${gig.path}?tab=equipment`)
    const bars = page.getByRole('region', { name: 'Equipment steps' })
    await expect(bars.getByRole('listitem').filter({ hasText: 'Prepped' })).toContainText('3 of 3', LOAD)
    await expect(bars.getByRole('listitem').filter({ hasText: 'Out (loaded)' })).toContainText('1 of 3')
    await expectAccessible(page)

    // The packing list's Step column: the whole line is prepped, not yet all out
    await page.goto(`${gig.path}/packing`)
    const row = page.getByRole('row').filter({ hasText: mic.name })
    await expect(row.getByRole('cell').last()).toHaveText('Prepped', LOAD)
    await expectAccessible(page)

    // Organisation settings → Equipment steps: untick "On site"; the scan screen no longer offers it
    await page.goto(`${org.path}?panel=settings`)
    const settings = page.getByRole('dialog', { name: `${org.name} — settings` })
    const onSite = settings.getByRole('region', { name: 'Equipment steps' }).getByRole('checkbox', { name: 'On site' })
    await expect(onSite).toBeChecked(LOAD)
    // The box changes once the database has saved it
    await onSite.click()
    await expect(onSite).not.toBeChecked(LOAD)
    await expectAccessible(page)
    await expect.poll(async () => ok('Reading the steps', await account.client.from('organisations').select('equipment_steps').eq('id', org.id).single()).equipment_steps, LOAD)
      .not.toContain('on_site')
    await page.goto(`${gig.path}/scan`)
    await expect(steps.getByRole('radio', { name: 'Prepped' })).toBeVisible(LOAD)
    await expect(steps.getByRole('radio', { name: 'On site' })).toHaveCount(0)
  } finally {
    ok('Putting every step back', await account.client.from('organisations').update({ equipment_steps: ALL_STEPS }).eq('id', org.id))
  }
})

// covers: T9
test('cross-hire: link the other company by its code, send a hire request, they confirm it', { tag: TAG }, async ({ adminWithOrg, secondCompany }) => {
  const { page, account, org } = adminWithOrg
  const other = secondCompany
  await readBell(account, other.account)
  const id = uniq()
  const supplier = ok('Adding the supplier', await account.client.from('suppliers').insert({ org_id: org.id, name: `E2E Partner ${id}` }).select().single())

  // The other company: Inventory → Subrentals → Show code
  await other.page.goto(`${other.org.path}/inventory?tab=subrentals`)
  await other.page.getByRole('button', { name: 'Show code' }).click({ timeout: 45_000 })
  const codeBox = other.page.locator('code').filter({ hasText: /\S/ })
  await expect(codeBox).toBeVisible(LOAD)
  const code = (await codeBox.textContent()).trim()
  await expectAccessible(other.page)

  // This company: the supplier → Cross-hire code → Link
  await page.goto(`${org.path}/inventory?tab=subrentals`)
  const row = page.locator('div').filter({ hasText: supplier.name }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last()
  await row.getByRole('button', { name: 'Edit' }).click({ timeout: 45_000 })
  const card = page.getByRole('dialog', { name: supplier.name })
  await card.getByLabel('Cross-hire code', { exact: true }).fill(code)
  await card.getByRole('button', { name: 'Link' }).click()
  await expect(card).toContainText(`Linked to ${other.org.name}`, LOAD)
  await expectAccessible(page)
  await card.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText(supplier.name).first()).toContainText('on AVX', LOAD)

  // A hire request: a new subrental from them, status Requested
  await page.getByRole('button', { name: 'New subrental' }).click()
  const sub = page.getByRole('dialog', { name: 'New subrental' })
  await sub.getByLabel('Supplier *', { exact: true }).selectOption(supplier.id)
  await expect(sub.getByText('This supplier is on AVX: setting the status to Requested sends them the request')).toBeVisible(LOAD)
  await sub.getByLabel('From', { exact: true }).fill(`${day(10)}T09:00`)
  await sub.getByLabel('Until', { exact: true }).fill(`${day(12)}T18:00`)
  await sub.getByLabel('Status', { exact: true }).selectOption('requested')
  await sub.getByLabel('Description', { exact: true }).fill(`E2E Hire desk ${id}`)
  await sub.getByLabel('Quantity', { exact: true }).fill('2')
  await sub.getByRole('button', { name: 'Save' }).click()
  await expect(sub).toBeHidden(LOAD)
  const mine = page.getByRole('button').filter({ hasText: supplier.name }).filter({ hasText: `2 × E2E Hire desk ${id}` })
  await expect(mine).toContainText('Requested', LOAD)

  // The other company: Hire requests to you → Confirm with a price
  await other.page.reload()
  const incoming = other.page.getByRole('heading', { name: 'Hire requests to you' }).locator('..')
  const request = incoming.locator('div').filter({ hasText: `2 × E2E Hire desk ${id}` }).filter({ has: other.page.getByRole('button', { name: 'Confirm' }) }).last()
  await expect(request).toContainText(org.name, LOAD)
  await request.getByLabel('Price (€)', { exact: true }).fill('150')
  await expectAccessible(other.page)
  await request.getByRole('button', { name: 'Confirm' }).click()
  await expect(other.page.getByText("Confirmed. They've been told.")).toBeVisible(LOAD)

  // This company sees it confirmed, with the price
  await page.reload()
  await expect(mine).toContainText('Confirmed', LOAD)
  await expect(mine).toContainText('€150.00')
})

// The label sheet's controls (LabelSheet): size, what it prints on, and the Fields panel
const sizeSelect = page => page.locator('label').filter({ hasText: /^Size/ }).locator('select')
const modeSelect = page => page.locator('label').filter({ hasText: /^Print on/ }).locator('select')
const sheetHeader = page => page.locator('strong').filter({ hasText: /\d+ labels?\b/ })
const labelPages = page => page.locator('.ls-page')
async function openFields(page) {
  await page.getByRole('button', { name: 'Fields' }).click()
  return page.getByRole('group', { name: /^On .* labels/ })
}

// covers: T128
test('label templates: fields saved for the organisation come back on another device; a viewer can change them for one print only', { tag: TAG }, async ({ adminWithOrg, viewer, browser, baseURL }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account, viewer.account)
  const id = uniq()
  const item = await itemWithUnits(account, org.id, { name: `E2E Label ${id}`, units: 1 })
  const url = `${org.path}/inventory/labels?units=${item.units[0].id}`
  const defaults = ['name', 'code', 'qr', 'org', 'department']
  ok('Starting from the default fields', await account.client.from('label_templates').upsert({ org_id: org.id, size: 'medium', fields: defaults }, { onConflict: 'org_id,size' }))
  try {
    await page.goto(url)
    await sizeSelect(page).selectOption('medium')
    const sheet = page.locator('.ls-pages')
    await expect(sheet).toContainText(item.units[0].code, LOAD)
    await expect(sheet).toContainText(org.name)
    const fields = await openFields(page)
    await expect(fields).toHaveAccessibleName(/^On Medium, 100 × 50 mm labels/)
    // Untick and tick again (nothing to save), then untick Organisation and save it
    await fields.getByRole('checkbox', { name: 'Code', exact: true }).uncheck()
    await expect(sheet).not.toContainText(item.units[0].code)
    await fields.getByRole('checkbox', { name: 'Code', exact: true }).check()
    await expect(sheet).toContainText(item.units[0].code)
    await expect(page.getByRole('button', { name: 'Save for the organisation' })).toBeDisabled()
    await fields.getByRole('checkbox', { name: 'Organisation' }).uncheck()
    await expect(sheet).not.toContainText(org.name)
    await expectAccessible(page)
    await page.getByRole('button', { name: 'Save for the organisation' }).click()
    await expect(page.getByText('Label fields saved for the organisation')).toBeVisible(LOAD)

    // Another device (a new browser window): the same fields come back
    const other = await pageAs(browser, account, { baseURL })
    try {
      await other.goto(url)
      await sizeSelect(other).selectOption('medium')
      await expect(other.locator('.ls-pages')).toContainText(item.units[0].code, LOAD)
      await expect(other.locator('.ls-pages')).not.toContainText(org.name)
      const again = await openFields(other)
      await expect(again.getByRole('checkbox', { name: 'Organisation' })).not.toBeChecked()
      await expect(again.getByRole('checkbox', { name: 'Code', exact: true })).toBeChecked()
    } finally {
      await other.context().close()
    }

    // A viewer: no Inventory for them (docs/INVENTORY.md), but a gig's power labels use the same
    // templates. They can change the fields for this print, but not save them
    const gig = await addGig(account, org.id, { name: `E2E Label gig ${id}` })
    ok('Saving a power plan', await account.client.from('gig_show').upsert({
      gig_id: gig.id, power: { distros: [{ id: 'dlabel', name: `Label distro ${id}`, feed: 'supply', outputs: [] }], cables: [] },
    }))
    const v = viewer.page
    await v.goto(`${gig.path}/power/labels`)
    await v.locator('label').filter({ hasText: /^Labels for/ }).locator('select').selectOption('distros')
    await sizeSelect(v).selectOption('medium')
    const theirSheet = v.locator('.ls-pages')
    await expect(theirSheet).toContainText(`Label distro ${id}`, LOAD)
    await expect(theirSheet).not.toContainText(org.name)
    const theirs = await openFields(v)
    await expect(theirs.getByRole('checkbox', { name: 'Organisation' })).not.toBeChecked()
    await theirs.getByRole('checkbox', { name: 'Gig' }).check()
    await expect(theirSheet).toContainText(gig.name)
    await expect(theirs).toContainText('Changes here are for this print only. Admins and members can save them for the organisation.')
    await expect(v.getByRole('button', { name: 'Save for the organisation' })).toHaveCount(0)
    await expectAccessible(v)
    // …and the database refuses a viewer's save too
    const { error } = await viewer.account.client.from('label_templates').upsert({ org_id: org.id, size: 'medium', fields: ['name'] }, { onConflict: 'org_id,size' })
    expect(error, 'a viewer saved the label template').toBeTruthy()
    const saved = ok('Reading the template', await account.client.from('label_templates').select('fields').eq('org_id', org.id).eq('size', 'medium').single())
    expect(saved.fields).toEqual(['name', 'code', 'qr', 'department'])
  } finally {
    ok('Putting the default fields back', await account.client.from('label_templates').upsert({ org_id: org.id, size: 'medium', fields: defaults }, { onConflict: 'org_id,size' }))
  }
})

// covers: T129
test('case labels: a large label of a case lists the units packed in it', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const id = uniq()
  const rack = await itemWithUnits(account, org.id, { name: `E2E Rack case ${id}`, kit_type: 'case', units: 1 })
  const wireless = await itemWithUnits(account, org.id, { name: `E2E Wireless ${id}`, units: 2 })
  const di = await itemWithUnits(account, org.id, { name: `E2E DI box ${id}`, units: 1 })
  ok('Packing the case', await account.client.from('stock_units').update({ case_unit_id: rack.units[0].id })
    .in('id', [...wireless.units, ...di.units].map(u => u.id)))

  // From the item page: tick the case unit → Labels for 1
  await page.goto(`${org.path}/inventory/${rack.id}`)
  await page.getByLabel(`Select unit ${rack.units[0].code}`, { exact: true }).check({ timeout: 45_000 })
  await page.getByRole('button', { name: 'Labels for 1' }).click()
  await expect(page).toHaveURL(new RegExp(`units=${rack.units[0].id}`))
  await sizeSelect(page).selectOption('large')
  const label = page.locator('.ls-cell')
  await expect(label).toHaveCount(1, LOAD)
  await expect(label).toContainText(rack.units[0].code)
  await expect(label).toContainText('Case contents')
  await expect(label).toContainText(`2 × ${wireless.name}`)
  await expect(label).toContainText(`1 × ${di.name}`)
  await expectAccessible(page)
})

// covers: T130
test('power labels: cables on small labels and distros on medium, with the Power band, on a roll and on sheets', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const id = uniq()
  const gig = await addGig(account, org.id, { name: `E2E Power ${id}` })
  ok('Saving the power plan', await account.client.from('gig_show').upsert({
    gig_id: gig.id,
    power: {
      distros: [{ id: 'dstage', name: `Stage distro ${id}`, feed: 'supply', outputs: [{ id: 'o1', label: 'Amps', connector: 'cee16_3p' }, { id: 'o2', label: 'Desk', connector: 'schuko' }] }],
      cables: [{ id: 'cfeed', kind: 'power', label: 'Stage feed', length: 25, qty: 3 }],
    },
  }))

  // The gig's power report → Labels
  await page.goto(`${gig.path}/power`)
  await page.getByRole('button', { name: 'Labels' }).click({ timeout: 45_000 })
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/power/labels$`))

  // Cables, small, on a roll: one label a page
  await sizeSelect(page).selectOption('small')
  await modeSelect(page).selectOption('roll')
  await expect(sheetHeader(page)).toHaveText('3 labels · 3 pages', LOAD)
  const cells = page.locator('.ls-cell')
  await expect(cells).toHaveCount(3)
  await expect(cells.first()).toContainText('Stage feed')
  await expect(cells.first()).toContainText('25 m')
  // Small labels leave the band out by default (docs/INVENTORY.md); tick it for this print
  await expect(cells.first()).not.toContainText('Power')
  const fields = await openFields(page)
  await fields.getByRole('checkbox', { name: 'Department band (colour and name)' }).check()
  await expect(cells.first().locator('.lf-band')).toHaveText('Power')
  await expectAccessible(page)
  // …and on pre-cut A4 sheets: one page
  await modeSelect(page).selectOption('sheet')
  await expect(sheetHeader(page)).toHaveText('3 labels · 1 page')
  await expect(labelPages(page)).toHaveCount(1)

  // Distros, medium
  await page.locator('label').filter({ hasText: /^Labels for/ }).locator('select').selectOption('distros')
  await sizeSelect(page).selectOption('medium')
  await expect(sheetHeader(page)).toHaveText(/^1 label · 1 page$/, LOAD)
  await expect(cells).toHaveCount(1)
  await expect(cells.first()).toContainText(`Stage distro ${id}`)
  await expect(cells.first()).toContainText('The supply')
  await expect(cells.first()).toContainText('Amps')
  await expect(cells.first().locator('.lf-band')).toHaveText('Power')
  await modeSelect(page).selectOption('roll')
  await expect(sheetHeader(page)).toHaveText('1 label · 1 page')
  await expectAccessible(page)
})

// The label sheets' pages, edge to edge, once the sheet has been fitted to the window
async function expectSheetOnScreen(page, width, what) {
  const edges = () => labelPages(page).evaluateAll(els => {
    const rects = els.map(el => el.getBoundingClientRect())
    return rects.length ? { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)) } : null
  })
  await expect.poll(async () => (await edges())?.left, { ...LOAD, message: `${what}: the sheet starts off screen on the left` }).toBeGreaterThanOrEqual(0)
  await expect.poll(async () => (await edges())?.right, { ...LOAD, message: `${what}: the sheet runs past the right edge` }).toBeLessThanOrEqual(width + 0.5)
  const scrolls = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(scrolls, `${what}: the page scrolls sideways`).toBeLessThanOrEqual(0)
}
async function phoneLabels(world, browser, baseURL, width) {
  const [account, org] = await Promise.all([world.admin(), world.org()])
  await readBell(account)
  const item = await itemWithUnits(account, org.id, { name: `E2E Phone label ${uniq()}`, units: 2 })
  const page = await pageAs(browser, account, { baseURL, viewport: { width, height: 740 }, isMobile: true, hasTouch: true })
  await page.goto(`${org.path}/inventory/labels?units=${item.units.map(u => u.id).join(',')}`)
  await expect(page.locator('.ls-cell').first()).toBeVisible(LOAD)
  return page
}

// covers: T131
for (const width of [320, 390]) {
  test(`labels on a phone (${width} px): the whole sheet shows, nothing cut off on the left`, { tag: TAG }, async ({ world, browser, baseURL }) => {
    const page = await phoneLabels(world, browser, baseURL, width)
    try {
      // Each size and paper as the page opens with it (the choice is remembered on the device)
      for (const size of ['small', 'medium', 'large']) {
        for (const mode of ['sheet', 'roll']) {
          await sizeSelect(page).selectOption(size)
          await modeSelect(page).selectOption(mode)
          await page.reload()
          await expect(sizeSelect(page)).toHaveValue(size, LOAD)
          await expect(modeSelect(page)).toHaveValue(mode)
          await expect(page.locator('.ls-cell').first()).toBeVisible(LOAD)
          await expectSheetOnScreen(page, width, `${size} on ${mode}`)
        }
      }
      await expectAccessible(page)
    } finally {
      await page.context().close()
    }
  })
}

// covers: T131. Bug #223: on a phone, switching from a label roll to A4 sheets keeps the roll's
// zoom (LabelSheet fits the page only when its width changes), so the sheet is cut off on the left
// (about 70 px at 320 px) until the page is reloaded. Expected to fail until that is fixed; then
// remove the test.fail() line.
test('labels on a phone: switching from a roll to sheets still fits the sheet on screen', { tag: TAG }, async ({ world, browser, baseURL }) => {
  test.fail(true, 'Bug #223: the sheet keeps the roll\'s zoom and is cut off on the left')
  const page = await phoneLabels(world, browser, baseURL, 320)
  try {
    await sizeSelect(page).selectOption('small')
    await modeSelect(page).selectOption('roll')
    await expectSheetOnScreen(page, 320, 'small on roll')
    await sizeSelect(page).selectOption('medium')
    await modeSelect(page).selectOption('sheet')
    await expect(page.locator('.ls-cell').first()).toBeVisible(LOAD)
    await expectSheetOnScreen(page, 320, 'medium on sheet, after the roll')
  } finally {
    await page.context().close()
  }
})

// covers: T64
test('pickers show everything: subrentals, kits and alternatives, QR labels for all and for chosen items', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const id = uniq()
  const a = await itemWithUnits(account, org.id, { name: `E2E Picker A ${id}`, units: 1 })
  const b = await itemWithUnits(account, org.id, { name: `E2E Picker B ${id}`, units: 1 })
  const supplier = ok('Adding the supplier', await account.client.from('suppliers').insert({ org_id: org.id, name: `E2E Picker supplier ${id}` }).select().single())

  // Inventory → Subrentals: the supplier list and the new subrental's supplier and item pickers
  await page.goto(`${org.path}/inventory?tab=subrentals`)
  await expect(page.getByText(supplier.name)).toBeVisible(LOAD)
  await page.getByRole('button', { name: 'New subrental' }).click()
  const sub = page.getByRole('dialog', { name: 'New subrental' })
  await expect(sub.getByLabel('Supplier *', { exact: true }).locator('option', { hasText: supplier.name })).toHaveCount(1, LOAD)
  const covers = sub.getByLabel('Covers catalogue item', { exact: true })
  await expect(covers.locator('option', { hasText: a.name })).toHaveCount(1)
  await expect(covers.locator('option', { hasText: b.name })).toHaveCount(1)
  await expectAccessible(page)
  await sub.getByRole('button', { name: 'Close' }).click()

  // An item's Accessories and Alternatives pickers list the other items; adding one shows it
  await page.goto(`${org.path}/inventory/${a.id}`)
  const accessories = page.getByLabel('Add an accessory…', { exact: true })
  await expect(accessories.locator('option', { hasText: b.name })).toHaveCount(1, LOAD)
  const alternatives = page.getByRole('heading', { name: 'Alternatives' }).locator('..')
  const altPicker = alternatives.getByLabel('Add an alternative…', { exact: true })
  await expect(altPicker.locator('option', { hasText: b.name })).toHaveCount(1)
  await altPicker.selectOption({ label: `${b.name} · Audio` })
  await alternatives.getByRole('button', { name: 'Add' }).click()
  await expect(alternatives.getByRole('link', { name: b.name })).toBeVisible(LOAD)
  await expectAccessible(page)

  // QR labels: all of them (Inventory → QR labels), and just the chosen ones
  await page.goto(`${org.path}/inventory`)
  await page.getByRole('button', { name: 'QR labels' }).click({ timeout: 45_000 })
  await expect(page).toHaveURL(new RegExp(`${org.path}/inventory/labels$`))
  const sheet = page.locator('.ls-pages')
  await expect(sheet).toContainText(a.name, LOAD)
  await expect(sheet).toContainText(b.name)
  await page.goto(`${org.path}/inventory/labels?items=${a.id}`)
  await expect(sheetHeader(page)).toHaveText(/^1 label\b/, LOAD)
  await expect(sheet).toContainText(a.name)
  await expect(sheet).not.toContainText(b.name)
})

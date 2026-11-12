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
const LOAD = { timeout: 45_000 }
const uniq = () => `${RUN}-${Date.now().toString(36)}`
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

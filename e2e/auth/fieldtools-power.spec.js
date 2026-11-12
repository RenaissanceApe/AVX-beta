// Field tools, power and rigging (AT10): the owner's manual test lines T106–T119 (docs/PENDING.md
// section 2): the power plan, cables, inrush, rigging and line arrays, as signed-in journeys on the
// TEST project. The rest of the field tools are in fieldtools.spec.js; what stays manual is in
// docs/notes/AT10.md. Power, cable and rigging figures are aids for a competent person to check:
// each screen says so, and the tests check it does. Truss and hoist data come only from the
// manufacturers' tables already in the repo.
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addItem, addToGig, pageAs } from './setup.js'
import { TAG, LOAD, uniq, ok, readBell, toolGig, openTool } from './fieldtoolsSupport.js'

test.use({ area: 'fieldtools' })

const ESTIMATE = "Estimates to plan with, for a qualified electrician to check. Connecting and testing the supply, distros and cables is a qualified electrician's job."

// A distro in the catalogue: 32 A three-phase in, three Schuko outputs (A on L1, B on L2, C on L3), 16 A breakers
function addDistroItem(account, org, fields = {}) {
  return addItem(account, org.id, {
    name: `E2E Distro 32A ${uniq()}`, category: 'Power', connector_in: 'cee32_3',
    distro: { inputs: [{ connector: 'cee32_3' }], outputs: ['A', 'B', 'C'].map((label, i) => ({ id: `o${i + 1}`, label, connector: 'schuko', phase: `L${i + 1}`, breaker_a: 16 })) },
    ...fields,
  })
}
const powerOf = async (account, gig) => ok('Reading the power plan', await account.client.from('gig_show').select('power').eq('gig_id', gig.id).maybeSingle())?.power || {}
const addWashes = (account, gig, n, watts = 300) => account.client.from('gig_fixtures').insert(Array.from({ length: n }, (_, i) => ({
  gig_id: gig.id, name: `Wash ${i + 1}`, fixture_type: 'LED Wash', footprint: 7, universe: 1, address: 1 + i * 7, power_w: watts,
})))
// One load's row in the power plan's list, by its name
const loadRow = (tool, name) => tool.getByRole('region', { name: 'Loads' }).getByRole('listitem').filter({ has: tool.page().getByRole('checkbox', { name: `Select ${name}`, exact: true }) })

// covers: T106
test('power plan: a 63 A three-phase generator, a catalogue distro plugged in, fixtures and a typed load; phases, the 80% warning, the generator size, connected in words', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Power', ['dmx_patch', 'power'])
  const distro = await addDistroItem(account, org)
  ok('Adding washes', await addWashes(account, gig, 3))
  await readBell(account)
  const power = () => powerOf(account, gig)

  await openTool(page, gig, 'power')
  const tool = page.getByRole('region', { name: 'Power plan' })
  await expect(tool).toContainText(ESTIMATE, LOAD)
  // The supply: a generator, three-phase, 63 A (each change saved before the next, issue #229)
  const supply = tool.getByRole('region', { name: 'Supply' })
  await supply.getByRole('combobox', { name: 'Supply from' }).selectOption('Generator')
  await expect.poll(async () => (await power()).supply?.kind, LOAD).toBe('generator')
  await expect(supply.getByRole('combobox', { name: 'Phases' })).toHaveValue('3')
  await expect(supply.getByRole('spinbutton', { name: 'Amps per phase' })).toHaveValue('63')
  await expect(supply).toContainText('Generator · 230/400 V · 50 Hz · 63 A per phase')

  // The distro from the catalogue, then a blank one plugged into its output C
  await tool.getByRole('button', { name: 'Add a distro' }).first().click()
  await page.getByRole('dialog', { name: 'Add a distro' }).getByRole('button', { name: new RegExp(`^${distro.name}`) }).click()
  await expect.poll(async () => (await power()).distros?.length, LOAD).toBe(1)
  await tool.getByRole('button', { name: 'Add a distro' }).first().click()
  await page.getByRole('dialog', { name: 'Add a distro' }).getByRole('button', { name: 'Blank distro' }).click()
  await expect.poll(async () => (await power()).distros?.length, LOAD).toBe(2)
  const main = tool.getByRole('article', { name: distro.name })
  const second = tool.getByRole('article').filter({ hasNot: page.getByRole('heading', { name: distro.name }) })
  await second.getByRole('combobox', { name: 'Plugged into' }).selectOption({ label: `${distro.name} · C (L3)` })
  await expect.poll(async () => (await power()).distros[1].feed, LOAD).toEqual({ distro: (await power()).distros[0].id, output: 'o3' })
  // The first distro starts on the supply: unplug it, and neither reaches the supply (the
  // catalogue one isn't plugged in, the other is partly)
  await expect(main.getByRole('combobox', { name: 'Plugged into' })).toHaveValue('supply')
  await main.getByRole('combobox', { name: 'Plugged into' }).selectOption('Not plugged in')
  await expect.poll(async () => (await power()).distros[0].feed ?? null, LOAD).toBeNull()
  await expect(main).toContainText('Not connected')
  await expect(second).toContainText('Partly')
  await main.getByRole('combobox', { name: 'Plugged into' }).selectOption('The supply')
  await expect.poll(async () => (await power()).distros[0].feed, LOAD).toBe('supply')
  await expect(main).toContainText('Connected')
  await expect(second).toContainText('Connected')
  await expect(main).toContainText('rated 32 A')

  // A typed load: a 3000 W catering kitchen, plugged into A (L1)
  const form = tool.getByRole('form', { name: 'Add a load by hand' })
  await form.getByRole('textbox', { name: 'What', exact: true }).fill('Catering kitchen')
  await form.getByRole('spinbutton', { name: 'Watts each' }).fill('3000')
  await form.getByRole('button', { name: 'Add the load' }).click()
  await expect.poll(async () => (await power()).manual?.length, LOAD).toBe(1)
  await expect(loadRow(tool, 'Catering kitchen')).toContainText('Not connected')
  await loadRow(tool, 'Catering kitchen').getByRole('combobox', { name: 'Where Catering kitchen is plugged in' }).selectOption({ label: `${distro.name} · A (L1)` })
  await expect.poll(async () => Object.keys((await power()).assign || {}).length, LOAD).toBe(1)
  // Two washes together into B (L2); Wash 3 stays out
  await loadRow(tool, 'Wash 1').getByRole('checkbox').check()
  await loadRow(tool, 'Wash 2').getByRole('checkbox').check()
  await tool.getByRole('combobox', { name: 'Plug the 2 selected into' }).selectOption({ label: `${distro.name} · B (L2)` })
  await expect.poll(async () => Object.keys((await power()).assign || {}).length, LOAD).toBe(3)

  // The figures: 3000 W ÷ 230 V = 13 A on A (82% of its 16 A breaker: above 80%); 600 W ÷ 230 V = 2.6 A on B
  const outputs = main.getByRole('list', { name: `Outputs of ${distro.name}` })
  const outA = outputs.getByRole('listitem').filter({ hasText: 'A · Schuko 16 A · L1' })
  const outB = outputs.getByRole('listitem').filter({ hasText: 'B · Schuko 16 A · L2' })
  await expect(outA).toContainText(/13 A of 16 A \(82%\)\s*Above 80%\s*Catering kitchen/, LOAD)
  await expect(outB).toContainText(/2\.6 A of 16 A \(16%\)\s*OK\s*Wash 1, Wash 2/)
  await expect(loadRow(tool, 'Catering kitchen')).toContainText(/Typed by hand · 3000 W · 13 A on L1\s*Connected/)
  await expect(loadRow(tool, 'Wash 1')).toContainText('Connected')
  await expect(loadRow(tool, 'Wash 3')).toContainText('Not connected')
  await expect(tool.getByRole('region', { name: 'Loads' })).toContainText('3900 W in all, 4 loads · 1 not plugged in (300 W)')
  await expect(tool.getByRole('region', { name: 'Warnings' })).toContainText("1 load isn't plugged in yet.")
  // The supply's phases; the neutral is the phasor sum √(13.04² + 2.61² − 13.04 × 2.61) = 12 A, and
  // with nothing on L3 the phases are 100% apart. The generator counts the unplugged wash spread
  // over the phases: L1 3100 W = 13.5 A × 230 V × 3 = 9.3 kVA, plus 25% = 11.6 → 15 kVA
  const phases = supply.getByRole('listitem')
  await expect(phases.filter({ hasText: 'L1' })).toContainText('13 A of 63 A (21%)')
  await expect(phases.filter({ hasText: 'L2' })).toContainText('2.6 A of 63 A (4%)')
  await expect(phases.filter({ hasText: 'L3' })).toContainText('0 A of 63 A (0%)')
  await expect(supply).toContainText('Neutral 12 A · phases 100% apart')
  await expect(supply).toContainText('15 kVA suggested (9.3 kVA on the busiest phase × 3, plus 25%).')
  await expectAccessible(page)
})

// Inventory → item → Edit → Electrical: types the fields given ({ 'Datasheet amps (A)': '4', … }) and saves
async function editElectrical(page, org, item, fields) {
  await page.goto(`${org.path}/inventory/${item.id}`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const dialog = page.getByRole('dialog').filter({ has: page.getByText('Electrical', { exact: true }) })
  await dialog.getByText('Electrical', { exact: true }).click()
  for (const [name, value] of Object.entries(fields)) await dialog.getByLabel(name, { exact: true }).fill(value)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden(LOAD)
}

// covers: T107
test('power plan: an amp rack whose datasheet gives amps only counts as VA from those amps', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(150_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Amps', ['power'])
  const rack = await addItem(account, org.id, { name: `E2E Amp rack ${uniq()}`, category: 'Sound' })
  await readBell(account)
  // Catalogue: the datasheet says 4 A at 230 V (no watts)
  await editElectrical(page, org, rack, { 'Datasheet amps (A)': '4', 'At volts (V)': '230' })
  await expect.poll(async () => ok('Reading the item', await account.client.from('price_items').select('power_w, current_a, current_v').eq('id', rack.id).single()), LOAD)
    .toEqual({ power_w: null, current_a: 4, current_v: 230 })
  // Two of them in the gig's equipment: 4 A × 230 V × 2 = 1840 VA
  ok('Planning the racks', await account.client.from('gig_equipment').insert({ gig_id: gig.id, item_id: rack.id, quantity: 2 }))
  await openTool(page, gig, 'power')
  const tool = page.getByRole('region', { name: 'Power plan' })
  await expect(loadRow(tool, rack.name)).toContainText(`${rack.name} × 2`, LOAD)
  await expect(loadRow(tool, rack.name)).toContainText("Gig equipment · Sound · 1840 VA from the datasheet's amps")
  await expectAccessible(page)
})

// covers: T112
test('inrush: a fixture item given an inrush figure; four on one output add up and warn', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(150_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Inrush', ['dmx_patch', 'power'])
  const batten = await addItem(account, org.id, { name: `E2E LED Batten ${uniq()}`, category: 'Lighting', power_w: 150 })
  const distro = await addDistroItem(account, org)
  await readBell(account)
  // Inventory → item → Edit → Electrical: inrush 20 A
  await editElectrical(page, org, batten, { 'Inrush (A)': '20' })
  await expect.poll(async () => ok('Reading the item', await account.client.from('price_items').select('inrush_a').eq('id', batten.id).single()).inrush_a, LOAD).toBe(20)
  ok('Adding battens', await account.client.from('gig_fixtures').insert([1, 2, 3, 4].map(n => ({
    gig_id: gig.id, name: `Batten ${n}`, fixture_type: 'LED Batten', footprint: 8, universe: 1, address: 1 + (n - 1) * 8, item_id: batten.id, power_w: 150,
  }))))

  await openTool(page, gig, 'power')
  const tool = page.getByRole('region', { name: 'Power plan' })
  await tool.getByRole('button', { name: 'Add a distro' }).first().click()
  await page.getByRole('dialog', { name: 'Add a distro' }).getByRole('button', { name: new RegExp(`^${distro.name}`) }).click()
  await expect.poll(async () => (await powerOf(account, gig)).distros?.length, LOAD).toBe(1)
  // All four into output A (16 A breaker)
  for (const n of [1, 2, 3, 4]) await loadRow(tool, `Batten ${n}`).getByRole('checkbox').check()
  await tool.getByRole('combobox', { name: 'Plug the 4 selected into' }).selectOption({ label: `${distro.name} · A (L1)` })
  await expect.poll(async () => Object.keys((await powerOf(account, gig)).assign || {}).length, LOAD).toBe(4)

  // 4 × 20 A = 80 A peak, 5 × the 16 A breaker: above 3 × (B curve), not above 5 × (C curve)
  const inrush = tool.getByRole('region', { name: 'Inrush at switch-on' })
  await expect(inrush).toContainText('about 80 A peak from 4 loads', LOAD)
  await expect(inrush).toContainText('5 × the 16 A breaker')
  await expect(inrush).toContainText('May trip (B)')
  await expect(tool.getByRole('region', { name: 'Warnings' })).toContainText('4 loads switching on together peak at about 80 A (5 × the breaker): it may trip a B-curve breaker.')
  await expectAccessible(page)
})

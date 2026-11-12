// Field tools, power and rigging (AT10): the owner's manual test lines T106–T119 (docs/PENDING.md
// section 2): the power plan, cables, inrush, rigging and line arrays, as signed-in journeys on the
// TEST project. The rest of the field tools are in fieldtools.spec.js; what stays manual is in
// docs/notes/AT10.md. Power, cable and rigging figures are aids for a competent person to check:
// each screen says so, and the tests check it does. Truss and hoist data come only from the
// manufacturers' tables already in the repo.
import { test, expect } from './fixtures.js'
import { expectAccessible, waitForServiceWorker } from './helpers.js'
import { readPdfText } from './files.js'
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

// A power plan made through the API: the venue's 63 A three-phase supply, the distro "Dimmer city"
// (32 A three-phase in, Schuko A/B/C on L1/L2/L3 with 16 A breakers) on the supply, and a 3680 W
// heater (16 A at 230 V) on A
const PLAN = {
  supply: { kind: 'venue', phases: 3, amps: 63, volts: 230, hz: 50 },
  distros: [{ id: 'd1', name: 'Dimmer city', feed: 'supply', input: 'cee32_3', outputs: ['A', 'B', 'C'].map((label, i) => ({ id: `o${i + 1}`, label, connector: 'schuko', phase: `L${i + 1}`, breaker_a: 16 })) }],
  manual: [{ id: 'm1', name: 'Heater', watts: 3680, qty: 1 }],
  assign: { 'm:m1': { distro: 'd1', output: 'o1' } },
}
const savePlan = (account, gig, power = PLAN) => account.client.from('gig_show').upsert({ gig_id: gig.id, power })
const cableRow = (tool, name) => tool.getByRole('region', { name: 'Cables' }).getByRole('listitem').filter({ has: tool.page().getByRole('button', { name: new RegExp(`^Remove ${name}`) }) })

// covers: T110
test('cable runs: added from the plan; length, size and a drum change the drop, the capacity and the warnings', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(150_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Cables', ['power'])
  ok('Saving the plan', await savePlan(account, gig))
  await readBell(account)
  const cables = async () => (await powerOf(account, gig)).cables || []

  await openTool(page, gig, 'power')
  const tool = page.getByRole('region', { name: 'Power plan' })
  await tool.getByRole('button', { name: 'Add cables from the plan' }).click()
  await expect(page.getByText('2 cables added: check their lengths.')).toBeVisible(LOAD)
  await expect.poll(async () => (await cables()).length, LOAD).toBe(2)
  // The feed: 25 m of CEE 32 A (5G6): 3.30 Ω/km at 20 °C, 3.82 mΩ/m at 60 °C × 25 m × 16 A = 1.53 V (0.66%);
  // the 63 A supply breaker in front is bigger than the 38 A the cable carries
  const feed = cableRow(tool, 'CEE 32 A three-phase')
  await expect(feed).toContainText('Carries 16 A · may carry 38 A · drop 1.53 V (0.66%) · 0.66% from the supply', LOAD)
  await expect(feed).toContainText('The 63 A breaker in front is larger than the cable carries (38 A).')
  // Output A: 10 m of Schuko 1.5 mm² (13.3 Ω/km): 15.4 mΩ/m × 2 × 10 m × 16 A = 4.93 V (2.14%)
  const outA = cableRow(tool, 'Schuko')
  await expect(outA).toContainText('Carries 16 A · may carry 16 A · drop 4.93 V (2.14%) · 2.8% from the supply')
  await expectAccessible(page)

  // 25 m of Schuko 2.5 mm² (7.98 Ω/km): 9.23 mΩ/m × 2 × 25 m × 16 A = 7.39 V (3.21%, "about 3.2%");
  // the drop from the supply adds the feed's: 0.66 + 3.21 = 3.87%,
  // with the feed, above the 3% warning
  await outA.getByRole('combobox', { name: 'Cable' }).selectOption({ label: 'Schuko (3G2.5)' })
  // (link "o:<distro>/<output>": the cable from output A; each change saved before the next, issue #229)
  const runA = async () => (await cables()).find(c => c.link === 'o:d1/o1')
  await expect.poll(async () => (await runA())?.type, LOAD).toBe('schuko_25')
  await expect(outA).toContainText('may carry 25 A', LOAD)
  await outA.getByRole('spinbutton', { name: 'Length (m)' }).fill('25')
  await outA.getByRole('spinbutton', { name: 'Length (m)' }).blur()
  await expect.poll(async () => (await runA())?.length, LOAD).toBe(25)
  await expect(outA).toContainText('Carries 16 A · may carry 25 A · drop 7.39 V (3.21%)', LOAD)
  await expect(outA).toContainText('3.87% from the supply')
  await expect(outA).toContainText('Check')
  await expect(tool.getByRole('region', { name: 'Warnings' })).toContainText('voltage drop 3.87% from the supply, above 3%.')

  // Left on a drum: one layer carries 25 A × 0.80 = 20 A; two layers 25 A × 0.61 = 15.3 A, less than the 16 A
  await outA.getByRole('combobox', { name: 'Laid' }).selectOption('Left on a drum')
  await expect.poll(async () => (await runA())?.laying, LOAD).toBe('drum')
  await expect(outA).toContainText('may carry 20 A', LOAD)
  await outA.getByRole('combobox', { name: 'Layers on the drum' }).selectOption('2')
  await expect(outA).toContainText('may carry 15.3 A', LOAD)
  await expect(outA).toContainText('Over')
  await expect(tool.getByRole('region', { name: 'Warnings' })).toContainText('16 A, more than the cable carries laid like this (15.3 A).')
  await expect.poll(runA, LOAD).toMatchObject({ type: 'schuko_25', length: 25, laying: 'drum', group: 2 })
  await expect(tool).toContainText(ESTIMATE)
})

// covers: T111
test('suggest where to plug in: balance or fill to a reserve; nothing changes until Apply, and Undo puts it back', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(150_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Balance', ['dmx_patch', 'power'])
  ok('Saving the plan', await savePlan(account, gig))
  ok('Adding washes', await addWashes(account, gig, 3))
  await readBell(account)
  const assigned = async () => Object.keys((await powerOf(account, gig)).assign || {}).length

  await openTool(page, gig, 'power')
  const tool = page.getByRole('region', { name: 'Power plan' })
  await expect(loadRow(tool, 'Wash 1')).toContainText('Not connected', LOAD)
  await tool.getByRole('button', { name: 'Suggest where to plug in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Suggest where to plug in' })
  const result = dialog.getByRole('region', { name: 'The suggestion' })
  // Balance (the default): each 300 W wash (1.3 A) goes to the lightest phase: L2, L3, then L2
  await expect(dialog.getByRole('radio', { name: /^Balance the phases/ })).toBeChecked()
  await expect(result).toContainText('Now: L1 16 A · L2 0 A · L3 0 A · phases 100% apart')
  await expect(result).toContainText('After: L1 16 A · L2 2.6 A · L3 1.3 A · phases 92% apart')
  await expect(result.getByRole('list', { name: '3 changes' })).toContainText('Wash 1: Not plugged in → Dimmer city · B (L2)')
  await expect(dialog).toContainText(ESTIMATE)
  await expectAccessible(page)

  // Fill each output up to 80% (12.8 A): A is already full, so all three go on B
  await dialog.getByRole('radio', { name: /^Fill each output up to a reserve/ }).check()
  await expect(result).toContainText('After: L1 16 A · L2 3.9 A · L3 0 A')
  // A 20% reserve (3.2 A): two washes (2.6 A) on B, the third on C
  await dialog.getByRole('spinbutton', { name: 'Reserve (% of breaker)' }).fill('20')
  await expect(result).toContainText('After: L1 16 A · L2 2.6 A · L3 1.3 A', LOAD)
  // Nothing saved yet
  expect(await assigned()).toBe(1)
  await expect(loadRow(tool, 'Wash 1')).toContainText('Not connected')

  // Apply: the washes are plugged in; Undo puts the plan back
  await dialog.getByRole('button', { name: 'Apply 3 changes' }).click()
  await expect(dialog).toBeHidden(LOAD)
  await expect.poll(assigned, LOAD).toBe(4)
  await expect(loadRow(tool, 'Wash 1')).toContainText('Connected')
  await page.getByText('Loads moved as suggested.').locator('..').getByRole('button', { name: 'Undo' }).click()
  await expect.poll(assigned, LOAD).toBe(1)
  await expect(loadRow(tool, 'Wash 1')).toContainText('Not connected', LOAD)
})

// covers: T113
test('cable list: made in the catalogue, added to the gig\'s equipment and packing list; cable and distro labels', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Cable list', ['power'])
  ok('Saving the plan', await savePlan(account, gig))
  await readBell(account)

  await openTool(page, gig, 'power')
  const tool = page.getByRole('region', { name: 'Power plan' })
  await tool.getByRole('button', { name: 'Add cables from the plan' }).click()
  await expect(page.getByText('2 cables added: check their lengths.')).toBeVisible(LOAD)
  const list = tool.getByRole('region', { name: 'Cable list' })
  const feedLine = list.getByRole('listitem').filter({ hasText: '1 × CEE 32 A three-phase (5G6) · 25 m' })
  const outLine = list.getByRole('listitem').filter({ hasText: '1 × Schuko (3G1.5) · 10 m' })
  await expect(feedLine).toContainText('not in the catalogue', LOAD)
  await expect(list.getByRole('button', { name: "Add to the gig's equipment" })).toBeDisabled()
  // Create both in the catalogue (one at a time: each saves the plan, issue #229)
  await feedLine.getByRole('button', { name: 'Create in the catalogue' }).click()
  await expect(page.getByText('CEE 32 A three-phase (5G6) · 25 m added to the catalogue.')).toBeVisible(LOAD)
  await expect.poll(async () => Object.keys((await powerOf(account, gig)).cableItems || {}).length, LOAD).toBe(1)
  await outLine.getByRole('button', { name: 'Create in the catalogue' }).click()
  await expect(page.getByText('Schuko (3G1.5) · 10 m added to the catalogue.')).toBeVisible(LOAD)
  await expect.poll(async () => Object.keys((await powerOf(account, gig)).cableItems || {}).length, LOAD).toBe(2)
  await list.getByRole('button', { name: "Add to the gig's equipment" }).click()
  await expect(page.getByText("2 more planned on the gig's equipment.")).toBeVisible(LOAD)
  const items = ok('Reading the cables', await account.client.from('price_items').select('id, name, category').eq('org_id', gig.org_id).in('name', ['CEE 32 A three-phase (5G6) · 25 m', 'Schuko (3G1.5) · 10 m']))
  expect(items.map(i => i.category)).toEqual(['Cables', 'Cables'])
  expect(ok('Reading equipment', await account.client.from('gig_equipment').select('item_id, quantity').eq('gig_id', gig.id)).map(l => l.quantity)).toEqual([1, 1])
  // The Equipment tab and the packing list
  await page.goto(`${gig.path}?tab=equipment`)
  await expect(page.getByRole('main')).toContainText('Schuko (3G1.5) · 10 m', LOAD)
  await page.goto(`${gig.path}/packing`)
  await expect(page.locator('body')).toContainText('CEE 32 A three-phase (5G6) · 25 m', LOAD)

  // Labels: the cables (two), then the distro, on a roll
  await openTool(page, gig, 'power')
  await tool.getByRole('link', { name: 'Labels' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/power/labels$`))
  const header = page.locator('strong').filter({ hasText: /\d+ labels?\b/ })
  await page.locator('label').filter({ hasText: /^Print on/ }).locator('select').selectOption('roll')
  await expect(header).toHaveText('2 labels · 2 pages', LOAD)
  await page.locator('label').filter({ hasText: /^Labels for/ }).locator('select').selectOption('distros')
  await expect(header).toHaveText('1 label · 1 page', LOAD)
  await expect(page.locator('.ls-pages')).toContainText('Dimmer city')
  await page.locator('label').filter({ hasText: /^Print on/ }).locator('select').selectOption({ index: 0 })
  await expect(page.locator('.ls-pages')).toContainText('Dimmer city')
  await expectAccessible(page)
})

// covers: T109, T113 (the report and its PDF show the cables, the cable list and inrush)
test('power report: from the on-site tile, also offline; saved to the gig files as a PDF; the light plot shows the plan\'s figures', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Report', ['dmx_patch', 'light_plot', 'power'])
  const batten = await addItem(account, org.id, { name: `E2E Batten ${uniq()}`, category: 'Lighting', power_w: 150, inrush_a: 20 })
  const fixtures = ok('Adding battens', await account.client.from('gig_fixtures').insert([1, 2].map(n => ({
    gig_id: gig.id, name: `Batten ${n}`, fixture_type: 'LED Batten', footprint: 8, universe: 1, address: 1 + (n - 1) * 8, item_id: batten.id, power_w: 150,
  }))).select('id'))
  // The plan: the heater on A, both battens on B, and a 25 m Schuko 2.5 mm² from A
  ok('Saving the plan', await savePlan(account, gig, {
    ...PLAN,
    assign: { ...PLAN.assign, ...Object.fromEntries(fixtures.map(f => [`fx:${f.id}`, { distro: 'd1', output: 'o2' }])) },
    cables: [{ id: 'c1', kind: 'power', type: 'schuko_25', length: 25, link: 'o:d1/o1' }],
  }))
  await readBell(account)
  // Opening the plan copies the catalogue's figures into it (so crew and the report see them)
  await openTool(page, gig, 'power')
  await expect.poll(async () => (await powerOf(account, gig)).figures?.[batten.id], LOAD).toMatchObject({ w: 150, in: 20 })

  // The light plot's power section takes the plan's figures: 2 × 150 W on L2 = 1.3 A
  await openTool(page, gig, 'light_plot')
  const lightPower = page.getByRole('region', { name: 'Power (estimate)' })
  await expect(lightPower).toContainText("From the gig's power plan", LOAD)
  await expect(lightPower).toContainText('300 W for 2 fixtures')
  await expect(lightPower.getByRole('listitem').filter({ hasText: 'L2' })).toContainText('1.3 A of 63 A (2%)')

  // On-site mode → the Power plan tile opens the report
  await page.goto(gig.path)
  await page.getByRole('button', { name: 'On-site mode' }).click()
  await page.getByRole('link', { name: 'Power plan' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/power$`))
  const report = page.locator('body')
  await expect(report).toContainText(ESTIMATE, LOAD)
  await expect(page.getByRole('region', { name: 'Loads' })).toContainText('Heater')
  await expect(page.getByRole('region', { name: 'Inrush at switch-on' })).toContainText('40 A')
  await expect(page.getByRole('region', { name: 'Cables' })).toContainText('Schuko (3G2.5)')
  await expect(page.getByRole('region', { name: 'Cable list' })).toContainText('Schuko (3G2.5)')
  await expectAccessible(page)
  // Offline: the report opens from this device's copy
  await waitForServiceWorker(page)
  await page.context().setOffline(true)
  try {
    await page.reload()
    await expect(page.getByRole('status').filter({ hasText: "You're offline: this is the last copy saved on this device." })).toBeVisible(LOAD)
    await expect(page.getByRole('region', { name: 'Loads' })).toContainText('Heater')
  } finally {
    await page.context().setOffline(false)
  }
  // Leave on-site mode for the rest
  await page.goto(gig.path)
  const leave = page.getByRole('button', { name: 'Full gig view' })
  if (await leave.isVisible({ timeout: 15_000 }).catch(() => false)) await leave.click()

  // Save to gig files: a PDF in the gig's files with the cables, the cable list and inrush
  await openTool(page, gig, 'power')
  await page.getByRole('region', { name: 'Power plan' }).getByRole('button', { name: 'Save to gig files' }).click()
  await expect(page.getByText("Report saved in the gig's files")).toBeVisible(LOAD)
  const asset = ok('Reading the files', await account.client.from('assets').select('name, file_url, type').eq('gig_id', gig.id)).find(a => a.name === `Power plan · ${gig.name}`)
  expect(asset).toMatchObject({ type: 'document' })
  const { data: blob, error } = await account.client.storage.from('gig-assets').download(asset.file_url)
  if (error) throw new Error(`Downloading the PDF failed: ${error.message}`)
  const { text } = await readPdfText(new Uint8Array(await blob.arrayBuffer()))
  for (const words of ['Heater', 'Dimmer city', 'Inrush', 'Cable list', 'Schuko (3G2.5)']) expect(text, `The PDF has "${words}"`).toContain(words)
  await page.goto(`${gig.path}?tab=assets`)
  await expect(page.getByRole('main')).toContainText(`Power plan · ${gig.name}`, LOAD)
})

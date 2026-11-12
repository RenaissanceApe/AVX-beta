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
import { TAG, LOAD, uniq, ok, readBell, toolGig, openTool, holdNextShowSave } from './fieldtoolsSupport.js'

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

// ── Rigging ──────────────────────────────────────────────────────────────────
const RIG_AID = 'An aid, not a sign-off. These figures help plan the rig. A competent rigger must check every load, point and hoist before anything is flown.'
// The Chainmaster D8+ 500 kg preset (from the manufacturer's data sheet, already in the database)
const D8PLUS_500 = 'Chainmaster D8+ 500 kg, 4 m/min (SK030/76U, CM-960505) · D8+ · 500 kg'
// A light plot with one 10 m truss across the default 10 m stage and six 20 kg fixtures on it
async function trussWithFixtures(account, gig) {
  ok('Saving the light plot', await account.client.from('gig_show').upsert({ gig_id: gig.id, lighting: {
    bars: [{ id: 'b1', name: 'Truss 1', kind: 'truss', x: 5, y: 5, rotation: 0, length: 10, height: 7, phase: null }],
  } }))
  ok('Adding fixtures', await account.client.from('gig_fixtures').insert([1, 2, 3, 4, 5, 6].map(n => ({
    gig_id: gig.id, name: `Spot ${n}`, fixture_type: 'Spot', footprint: 14, universe: 1, address: 1 + (n - 1) * 14, position: 'Truss 1', weight_kg: 20,
  }))))
}
const rigOf = async (account, gig) => ok('Reading the rigging', await account.client.from('gig_show').select('rigging').eq('gig_id', gig.id).maybeSingle())?.rigging || {}
const pointRow = (line, n) => line.getByRole('listitem').filter({ has: line.page().locator('strong', { hasText: new RegExp(`^Point ${n} · `) }) })
// The same, by where the point is along the line
const pointAt = (line, m) => line.getByRole('listitem').filter({ has: line.page().locator('strong', { hasText: new RegExp(`^Point \\d+ · ${String(m).replace('.', '\\.')} m$`) }) })
// A number field in the rigging tool: typed and left (it saves on leaving)
async function setNumber(field, value) {
  await field.fill(String(value))
  await field.blur()
}

// covers: T114
test('rigging from the light plot: not checked, the line with its fixtures and two points, hoists with load, ×f and % of WLL; overloaded in words', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Rigging', ['dmx_patch', 'light_plot'])
  await trussWithFixtures(account, gig)
  await readBell(account)
  const rig = () => rigOf(account, gig)

  // The light plot: the bar says "Rigging: not checked"; tapping it opens the rigging tool on that line
  await openTool(page, gig, 'light_plot')
  await page.getByRole('button', { name: 'Rigging: not checked — open the rigging tool for Truss 1' }).click()
  await expect(page).toHaveURL(/tool=rigging/, LOAD)
  const tool = page.getByRole('region', { name: 'Rigging' })
  await expect(tool).toContainText(RIG_AID, LOAD)
  const line = tool.getByRole('article', { name: 'Truss 1' })
  await expect(line).toContainText('From the light plot · 10 m')
  await expect.poll(async () => (await rig()).lines?.[0]?.points?.map(p => p.at_m), LOAD).toEqual([0.25, 9.75])
  // Fixtures 6 × 20 kg + cable 5 kg/m × 10 m = 170 kg, × 1.2 = 204 kg
  await expect(line).toContainText('Fixtures 120 kg · Cable 50 kg · × 1.2 = 204 kg')
  await expect(line).toContainText('170 kg')
  await expect(line).toContainText('Not checked against the light plot yet.')

  // A 500 kg hoist on each point: symmetric, so each carries 85 kg, × 1.2 = 102 kg, 20% of 500 kg
  for (const n of [1, 2]) {
    await pointRow(line, n).getByRole('combobox', { name: 'Hoist' }).selectOption({ label: D8PLUS_500 })
    await expect.poll(async () => (await rig()).lines[0].points[n - 1].hoist_model_id, LOAD).toBeTruthy()
  }
  for (const n of [1, 2]) {
    await expect(pointRow(line, n)).toContainText('85 kg · ×f 102 kg')
    await expect(pointRow(line, n)).toContainText('20% of the WLL (500 kg).')
  }
  await expectAccessible(page)

  // A 900 kg extra load in the middle: each point 85 + 450 = 535 kg, × 1.2 = 642 kg, 128%: overloaded
  await line.getByRole('button', { name: 'Add a load' }).click()
  await expect.poll(async () => (await rig()).lines[0].loads.length, LOAD).toBe(1)
  await setNumber(line.getByRole('textbox', { name: 'What' }), 'Video wall')
  await expect.poll(async () => (await rig()).lines[0].loads[0].name, LOAD).toBe('Video wall')
  await setNumber(line.getByRole('spinbutton', { name: 'kg', exact: true }), 900)
  await expect.poll(async () => (await rig()).lines[0].loads[0].kg, LOAD).toBe(900)
  await setNumber(line.getByRole('spinbutton', { name: 'At (m)' }).first(), 5)
  await expect.poll(async () => (await rig()).lines[0].loads[0].at_m, LOAD).toBe(5)
  for (const n of [1, 2]) {
    await expect(pointRow(line, n)).toContainText('535 kg · ×f 642 kg', LOAD)
    await expect(pointRow(line, n)).toContainText('Overloaded: 128% of the WLL (500 kg). Use a bigger hoist or add a point.')
  }
  // The light plot says so too
  await openTool(page, gig, 'light_plot')
  await expect(page.getByRole('button', { name: 'Rigging: overloaded — open the rigging tool for Truss 1' })).toBeVisible(LOAD)
})

// covers: T115
test('rigging edge cases: an overhang pulls a point up; a D8 hoist from a data plate over people is flagged; checked until a fixture moves', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(240_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Rig edges', ['dmx_patch', 'light_plot', 'rigging'])
  await trussWithFixtures(account, gig)
  await readBell(account)
  const rig = () => rigOf(account, gig)
  const at = async () => (await rig()).lines[0].points.map(p => p.at_m).sort((a, b) => a - b)

  await openTool(page, gig, 'rigging')
  const tool = page.getByRole('region', { name: 'Rigging' })
  await expect(tool).toContainText(RIG_AID, LOAD)
  // A 6 m line by hand (points at 0.25 and 5.75 m) and a third point (in the middle, 3 m) moved to 1.5 m
  await tool.getByRole('button', { name: 'Add a line by hand' }).click()
  await expect.poll(async () => (await rig()).lines?.length, LOAD).toBe(1)
  const line = tool.getByRole('article', { name: 'Line 1' })
  await line.getByRole('button', { name: 'Add a hang point' }).click()
  await expect.poll(at, LOAD).toEqual([0.25, 3, 5.75])
  await setNumber(pointAt(line, 3).getByRole('spinbutton', { name: 'At (m)' }), 1.5)
  await expect.poll(at, LOAD).toEqual([0.25, 1.5, 5.75])
  // The far point moved in to 3 m, so the line overhangs 3 m; 400 kg on its end
  await setNumber(pointAt(line, 5.75).getByRole('spinbutton', { name: 'At (m)' }), 3)
  await expect.poll(at, LOAD).toEqual([0.25, 1.5, 3])
  await line.getByRole('button', { name: 'Add a load' }).click()
  await expect.poll(async () => (await rig()).lines[0].loads.length, LOAD).toBe(1)
  const extra = line.getByRole('listitem').filter({ has: page.getByRole('textbox', { name: 'What' }) })
  await setNumber(extra.getByRole('spinbutton', { name: 'kg', exact: true }), 400)
  await expect.poll(async () => (await rig()).lines[0].loads[0].kg, LOAD).toBe(400)
  await setNumber(extra.getByRole('spinbutton', { name: 'At (m)' }), 6)
  await expect.poll(async () => (await rig()).lines[0].loads[0].at_m, LOAD).toBe(6)
  // The line levers over the point at 3 m: as a continuous beam over three points, the one in the
  // middle (1.5 m) is pulled up (−1295.5 kg) while the end points carry 270.3 and 1455.2 kg; with
  // 30 kg of cable the three add up to the 430 kg on the line
  await expect(pointAt(line, 1.5)).toContainText('This point would be pulled up: the line tips over its other points. Move the points or the load.', LOAD)
  await expect(pointAt(line, 0.25)).toContainText('270.3 kg · ×f 324.3 kg')
  await expect(pointAt(line, 3)).toContainText('1455.2 kg')
  await expect(line).toContainText('430 kg')
  await expectAccessible(page)

  // A D8 hoist from its data plate (250 kg); on a point over people (ticked by default) it's flagged
  await tool.getByRole('button', { name: 'Add a hoist model' }).click()
  const form = page.getByRole('dialog', { name: 'Add a hoist model' })
  const model = `D8 250 ${uniq()}`
  await form.getByLabel('Brand').fill('E2E Hoists')
  await form.getByLabel('Model').fill(model)
  await form.getByRole('combobox', { name: 'Class' }).selectOption('D8')
  await form.getByRole('spinbutton', { name: 'WLL (kg), as the manufacturer states it' }).fill('250')
  await form.getByRole('button', { name: 'Save the model' }).click()
  await expect(page.getByText('Hoist model added')).toBeVisible(LOAD)
  const middle = pointAt(line, 1.5)
  await expect(middle.getByRole('checkbox', { name: 'Over people' })).toBeChecked()
  await middle.getByRole('combobox', { name: 'Hoist' }).selectOption({ label: `E2E Hoists ${model} · D8 · 250 kg` })
  await expect.poll(async () => (await rig()).lines[0].points.find(p => p.at_m === 1.5)?.hoist_model_id, LOAD).toBeTruthy()
  await expect(middle).toContainText('A D8 hoist may not hold a load over people without a secondary safety.', LOAD)
  await expect(middle).toContainText("This hoist model still needs a second person's check.")
  // Not over people: no flag
  await middle.getByRole('checkbox', { name: 'Over people' }).uncheck()
  await expect.poll(async () => (await rig()).lines[0].points.find(p => p.at_m === 1.5)?.over_people, LOAD).toBe(false)
  await expect(middle).not.toContainText('may not hold a load over people')

  // The truss from the light plot: mark its loads as checked; the light plot says checked
  await tool.getByRole('combobox', { name: 'Add a line from the light plot' }).selectOption({ label: 'Truss 1 · 10 m' })
  await expect.poll(async () => (await rig()).lines.length, LOAD).toBe(2)
  const truss = tool.getByRole('article', { name: 'Truss 1' })
  await truss.getByRole('button', { name: 'Mark the loads as checked' }).click()
  await expect.poll(async () => (await rig()).lines[1].checked?.fingerprint, LOAD).toBeTruthy()
  await expect(truss).toContainText('Loads checked against the light plot on', LOAD)
  await openTool(page, gig, 'light_plot')
  await expect(page.getByRole('button', { name: /^Rigging: checked · busiest hoist \d+% — open the rigging tool for Truss 1$/ })).toBeVisible(LOAD)
  // Move a fixture along the truss (select it, arrow key): the bar is "not checked" again
  await page.getByRole('group', { name: `Light plot for ${gig.name}` }).getByRole('button', { name: /^Spot 1, / }).focus()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(async () => ok('Reading Spot 1', await account.client.from('gig_fixtures').select('plot_x').eq('gig_id', gig.id).eq('name', 'Spot 1').single()).plot_x, LOAD).not.toBeNull()
  await expect(page.getByRole('button', { name: 'Rigging: not checked — open the rigging tool for Truss 1' })).toBeVisible(LOAD)
  await openTool(page, gig, 'rigging')
  await expect(page.getByRole('article', { name: 'Truss 1' })).toContainText('Not checked: the fixtures on this bar changed since the last check.', LOAD)
})

// ── Line arrays ──────────────────────────────────────────────────────────────
// A K2 in the catalogue (the L-Acoustics K2 preset already in the repo: 56 kg an element; the
// K2-BUMP weighs 42.3 kg and allows 16 elements safely, 24 at most)
const addK2 = (account, org) => addItem(account, org.id, {
  name: `E2E K2 ${uniq()}`, category: 'Sound', speaker_type: 'line_array', speaker_preset: 'l-acoustics-k2', weight_kg: 56, max_spl_db: 147,
})
// A sound system with one main source of 12 × the item
const systemWith = (account, gig, item) => account.client.from('gig_show').upsert({ gig_id: gig.id, system: {
  sources: [{ id: 's1', name: 'Main L', kind: 'main', x: -1, y: 0, height: 9, spl: 147, angle: 90, count: 12, extra_ms: 0, item_id: item.id, item_name: item.name }],
} })
const arraysOfGig = async (account, gig) => (await rigOf(account, gig)).arrays || []
// "Change the array" open, and a field in it
async function openArrayForm(arr) {
  const summary = arr.getByText('Change the array', { exact: true })
  if (!(await arr.getByRole('spinbutton', { name: 'Elements' }).isVisible())) await summary.click()
}

// covers: T117
test('line array from the sound system: name, 12 × K2 and K2-BUMP come with it; splays drive the side view; 16, 17 and 25 elements against the limits', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Arrays', ['system_calc', 'rigging'])
  const k2 = await addK2(account, org)
  ok('Saving the sound system', await systemWith(account, gig, k2))
  await readBell(account)
  const arrays = () => arraysOfGig(account, gig)

  await openTool(page, gig, 'rigging')
  const section = page.getByRole('region', { name: 'Line arrays' })
  await section.getByRole('combobox', { name: 'Add an array from the sound system calculator' }).selectOption({ label: 'Main L · 12 elements' })
  await expect.poll(async () => (await arrays()).length, LOAD).toBe(1)
  const arr = section.getByRole('article', { name: 'Main L' })
  await expect(arr).toContainText(`12 × ${k2.name}`, LOAD)
  await expect(arr).toContainText('K2-BUMP')
  await expect(arr).toContainText('Safe limit 16 · maximum 24')
  // 12 × 56 kg + the 42.3 kg bumper
  await expect(arr).toContainText('12 elements 672 kg')
  await expect(arr).toContainText('bumper 42.3 kg')
  await expect(arr).toContainText('The manufacturer\'s software decides: model this array in Soundvision and use its loads, pick position and tilt. These figures are an aid that a competent rigger must check.')
  // Its picks have no hoists yet, so the array as a whole still needs checking
  await expect(arr.getByRole('status')).toHaveText(/The manufacturer's software must confirm this array/)
  await expect(arr).toContainText('12 elements: within the safe limit (16), whatever the angles.')
  await expectAccessible(page)

  // Splay angles: 0° under the bumper, then 1° and 2°: the side view aims the bottom element 3° down
  await openArrayForm(arr)
  // (typed one after the other, the first save held back on a slow network: all three kept, issue #229)
  await holdNextShowSave(page)
  for (const [name, deg] of [['Bumper → 1', 0], ['1 → 2', 1], ['2 → 3', 2]]) {
    await setNumber(arr.getByRole('spinbutton', { name, exact: true }), deg)
  }
  await expect.poll(async () => (await arrays())[0].splays.slice(0, 3), LOAD).toEqual([0, 1, 2])
  await expect(arr.getByRole('img', { name: 'Side view of an array of 12 elements, bumper tilted 0°, bottom element aimed 3° down' })).toBeVisible(LOAD)

  // 16 elements: within the safe limit; 17: the software must confirm; 25: over the maximum
  const count = arr.getByRole('spinbutton', { name: 'Elements' })
  await setNumber(count, 16)
  await expect.poll(async () => (await arrays())[0].count, LOAD).toBe(16)
  await expect(arr).toContainText('16 elements: within the safe limit (16), whatever the angles.', LOAD)
  await setNumber(count, 17)
  await expect.poll(async () => (await arrays())[0].count, LOAD).toBe(17)
  await expect(arr.getByRole('status')).toContainText("The manufacturer's software must confirm this array", LOAD)
  await expect(arr).toContainText('17 elements: over the safe limit (16), within the maximum (24). Only the manufacturer\'s software can say whether these angles are safe.')
  await setNumber(count, 25)
  await expect.poll(async () => (await arrays())[0].count, LOAD).toBe(25)
  await expect(arr.getByRole('status')).toContainText("Over a limit: don't fly it like this", LOAD)
  await expect(arr).toContainText("25 elements: over the manufacturer's maximum (24).")
})

// covers: T118
test('line array picks: centre of gravity splits the load 72/28; a negative one lifts a pick; a pullback asks for Soundvision\'s loads; a pick hung from a truss line', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(240_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Picks', ['system_calc', 'dmx_patch', 'light_plot', 'rigging'])
  const k2 = await addK2(account, org)
  ok('Saving the sound system', await systemWith(account, gig, k2))
  await trussWithFixtures(account, gig)
  await readBell(account)
  const arrays = () => arraysOfGig(account, gig)

  await openTool(page, gig, 'rigging')
  const section = page.getByRole('region', { name: 'Line arrays' })
  await section.getByRole('combobox', { name: 'Add an array from the sound system calculator' }).selectOption({ label: 'Main L · 12 elements' })
  await expect.poll(async () => (await arrays()).length, LOAD).toBe(1)
  const arr = section.getByRole('article', { name: 'Main L' })
  await openArrayForm(arr)
  // Two picks 1000 mm apart, centre of gravity 280 mm behind the front one: the lever rule puts
  // 72% on the front pick and 28% on the rear. 12 × 56 + 42.3 = 714.3 kg: 514.3 and 200 kg
  await expect(arr.getByRole('combobox', { name: 'Picks' })).toHaveValue('2')
  await setNumber(arr.getByRole('spinbutton', { name: 'Centre of gravity behind the front pick (mm)' }), 280)
  await expect.poll(async () => (await arrays())[0].cog_mm, LOAD).toBe(280)
  await setNumber(arr.getByRole('spinbutton', { name: 'Between the picks (mm)' }), 1000)
  await expect.poll(async () => (await arrays())[0].spacing_mm, LOAD).toBe(1000)
  const pick = name => arr.getByRole('listitem').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}`) }) })
  await expect(pick('Front pick')).toContainText('514.3 kg', LOAD)
  await expect(pick('Rear pick')).toContainText('200 kg')
  await expect(arr).toContainText('Split between the picks from the centre of gravity typed from the manufacturer\'s software.')
  await expectAccessible(page)

  // A negative centre of gravity: outside the picks, the rear pick is pulled up
  await setNumber(arr.getByRole('spinbutton', { name: 'Centre of gravity behind the front pick (mm)' }), -100)
  await expect.poll(async () => (await arrays())[0].cog_mm, LOAD).toBe(-100)
  await expect(arr.getByRole('alert')).toHaveText('The centre of gravity is outside the two picks: one pick would be pulled up. Check the pick positions in Soundvision.', LOAD)
  await expect(pick('Rear pick')).toContainText('This pick would be pulled up: the centre of gravity is outside the picks.')

  // The K2 pullback bumper: the weight alone isn't enough, Soundvision's point loads are needed
  await arr.getByRole('combobox', { name: 'Bumper or frame' }).selectOption('k2-pullback')
  await expect.poll(async () => (await arrays())[0].frame_id, LOAD).toBe('k2-pullback')
  await expect(arr.getByRole('alert')).toHaveText('With a pullback, type the point loads Soundvision gives: they can\'t be worked out from the weight alone.', LOAD)
  // Back to K2-BUMP with the 280 mm centre of gravity
  await arr.getByRole('combobox', { name: 'Bumper or frame' }).selectOption('k2-bump')
  await expect.poll(async () => (await arrays())[0].frame_id, LOAD).toBe('k2-bump')
  await setNumber(arr.getByRole('spinbutton', { name: 'Centre of gravity behind the front pick (mm)' }), 280)
  await expect.poll(async () => (await arrays())[0].cog_mm, LOAD).toBe(280)

  // The truss from the light plot, checked; then the front pick hung from it at 5 m: its hang
  // points carry the 514.3 kg and the light plot's mark changes with it
  await page.getByRole('region', { name: 'Rigging' }).getByRole('combobox', { name: 'Add a line from the light plot' }).selectOption({ label: 'Truss 1 · 10 m' })
  await expect.poll(async () => (await rigOf(account, gig)).lines?.length, LOAD).toBe(1)
  const truss = page.getByRole('article', { name: 'Truss 1' })
  for (const n of [1, 2]) {
    await pointRow(truss, n).getByRole('combobox', { name: 'Hoist' }).selectOption({ label: D8PLUS_500 })
    await expect.poll(async () => (await rigOf(account, gig)).lines[0].points[n - 1].hoist_model_id, LOAD).toBeTruthy()
  }
  await truss.getByRole('button', { name: 'Mark the loads as checked' }).click()
  await expect.poll(async () => (await rigOf(account, gig)).lines[0].checked?.fingerprint, LOAD).toBeTruthy()
  // Before: 85 kg a point (20% of 500 kg)
  await openTool(page, gig, 'light_plot')
  await expect(page.getByRole('button', { name: 'Rigging: checked · busiest hoist 20% — open the rigging tool for Truss 1' })).toBeVisible(LOAD)
  await openTool(page, gig, 'rigging')
  await openArrayForm(arr)
  await pick('Front pick').getByRole('combobox', { name: 'Hangs from' }).selectOption({ label: 'Truss line: Truss 1' })
  await expect.poll(async () => (await arrays())[0].front?.line_id, LOAD).toBeTruthy()
  await setNumber(pick('Front pick').getByRole('spinbutton', { name: 'At (m)' }), 5)
  await expect.poll(async () => (await arrays())[0].front?.at_m, LOAD).toBe(5)
  await expect(pick('Front pick')).toContainText('Hangs from Truss 1 at 5 m', LOAD)
  await expect(pick('Front pick')).toContainText("Checked with that truss line's hang points.")
  // The truss now carries it: 85 + 514.3 / 2 = 342.2 kg a point, × 1.2 = 410.6 kg, 82% of 500 kg
  await expect(pointRow(truss, 1)).toContainText('342.2 kg · ×f 410.6 kg', LOAD)
  await expect(pointRow(truss, 1)).toContainText('82% of the WLL (500 kg): close to the limit.')
  await openTool(page, gig, 'light_plot')
  await expect(page.getByRole('button', { name: 'Rigging: checked · busiest hoist 82% — open the rigging tool for Truss 1' })).toBeVisible(LOAD)
})

// covers: T116
test('rigging suggested by a hoist in the gig\'s equipment; crew outside the organisation read the same results and can\'t change them', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  test.setTimeout(180_000)
  const { page, world, account, org } = adminWithOrg
  // The organisation uses the rigging tool (Organisation settings → Field tools)
  const { data: chosen } = await account.client.from('organisations').select('field_tools').eq('id', org.id).single()
  if (!chosen.field_tools.includes('rigging')) ok('Choosing the rigging tool', await account.client.from('organisations').update({ field_tools: [...chosen.field_tools, 'rigging'] }).eq('id', org.id))
  const { gig } = await toolGig(world, 'Hoists', ['dmx_patch', 'light_plot'])
  await trussWithFixtures(account, gig)
  const crew = await world.account('crew')
  await addToGig(account, gig.id, crew)
  const hoist = await addItem(account, org.id, { name: `CM Lodestar 1t ${uniq()}`, category: 'Rigging' })
  ok('Planning the hoists', await account.client.from('gig_equipment').insert({ gig_id: gig.id, item_id: hoist.id, quantity: 2 }))
  await readBell(account, crew)

  // The Tools tab suggests the rigging tool
  await page.goto(`${gig.path}?tab=tools`)
  await expect(page.getByText("There are hoists in this gig's equipment. The rigging tool works out what each one carries.")).toBeVisible(LOAD)
  await page.getByRole('button', { name: 'Add the rigging tool' }).click()
  const tool = page.getByRole('region', { name: 'Rigging' })
  await expect(tool).toContainText(RIG_AID, LOAD)
  await expect.poll(async () => ok('Reading tools', await account.client.from('gig_tools').select('tool').eq('gig_id', gig.id)).map(r => r.tool).sort(), LOAD)
    .toEqual(['dmx_patch', 'light_plot', 'rigging'])
  // The truss from the light plot with a 500 kg hoist on each point
  await tool.getByRole('combobox', { name: 'Add a line from the light plot' }).selectOption({ label: 'Truss 1 · 10 m' })
  await expect.poll(async () => (await rigOf(account, gig)).lines?.length, LOAD).toBe(1)
  const line = tool.getByRole('article', { name: 'Truss 1' })
  for (const n of [1, 2]) {
    await pointRow(line, n).getByRole('combobox', { name: 'Hoist' }).selectOption({ label: D8PLUS_500 })
    await expect.poll(async () => (await rigOf(account, gig)).lines[0].points[n - 1].hoist_model_id, LOAD).toBeTruthy()
  }
  await expect(pointRow(line, 1)).toContainText('20% of the WLL (500 kg).', LOAD)

  // Crew: the same figures, nothing to change
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await openTool(crewPage, gig, 'rigging')
    const theirs = crewPage.getByRole('region', { name: 'Rigging' }).getByRole('article', { name: 'Truss 1' })
    await expect(crewPage.getByRole('region', { name: 'Rigging' })).toContainText(RIG_AID, LOAD)
    for (const n of [1, 2]) {
      await expect(pointRow(theirs, n)).toContainText('Chainmaster D8+ 500 kg, 4 m/min (SK030/76U, CM-960505) (D8+)')
      await expect(pointRow(theirs, n)).toContainText('85 kg · ×f 102 kg')
      await expect(pointRow(theirs, n)).toContainText('20% of the WLL (500 kg).')
      await expect(pointRow(theirs, n)).toContainText('Over people')
    }
    await expect(theirs).toContainText('Fixtures 120 kg · Cable 50 kg · × 1.2 = 204 kg')
    for (const role of ['combobox', 'spinbutton', 'textbox', 'checkbox']) await expect(theirs.getByRole(role)).toHaveCount(0)
    // Only the gig's defaults show as fields, locked
    for (const field of await crewPage.getByRole('main').getByRole('spinbutton').all()) await expect(field).toBeDisabled()
    for (const name of ['Add a line by hand', 'Add a hang point', 'Add a load', 'Mark the loads as checked', 'Add a hoist model', 'Remove this tool from the gig']) {
      await expect(crewPage.getByRole('button', { name })).toHaveCount(0)
    }
    await expectAccessible(crewPage)
    // The database agrees: crew can't change the rigging
    const { data } = await crew.client.from('gig_show').update({ rigging: {} }).eq('gig_id', gig.id).select('gig_id')
    expect(data || []).toEqual([])
    expect((await rigOf(account, gig)).lines).toHaveLength(1)
  } finally {
    await crewPage.context().close()
  }
})

// covers: T119
test('speaker rigging sign-off: the person who typed it can\'t check it, another member can; a change unchecks it; crew read the arrays and the check', { tag: TAG }, async ({ adminWithOrg, member, browser, baseURL }) => {
  test.setTimeout(240_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Sign-off', ['system_calc', 'rigging'])
  const k2 = await addK2(account, org)
  const crew = await world.account('crew')
  await addToGig(account, gig.id, crew)
  // The admin types the K2's rigging data (from the manufacturer's manual)
  ok('Typing the rigging data', await account.client.from('price_items').update({ rigging: {
    pickup_points: 'One or two motors with K2-BUMP alone.', frame_limits: 'Flown, K2-BUMP: 16 / 24.', source: "K2 owner's manual (EN), version 4.0",
  } }).eq('id', k2.id))
  ok('Saving the sound system', await systemWith(account, gig, k2))
  await readBell(account, member.account, crew)
  const itemUrl = `${org.path}/inventory/${k2.id}`
  const riggingOfItem = async () => ok('Reading the item', await account.client.from('price_items').select('rigging').eq('id', k2.id).single()).rigging

  // The admin typed it: no button, and the database refuses too
  await page.goto(itemUrl)
  const adminSection = page.getByRole('region', { name: 'Rigging data' })
  await expect(adminSection).toContainText('You typed or last changed this data, so someone else must check it.', LOAD)
  await expect(adminSection.getByRole('button', { name: 'Mark the rigging data as checked' })).toHaveCount(0)
  const { error: refused } = await account.client.rpc('mark_speaker_rigging_checked', { p_item: k2.id, p_frames: null })
  expect(refused?.hint).toBe('rigging_same_person')
  await expectAccessible(page)

  // A member (another person) checks it
  const { page: memberPage } = member
  await memberPage.goto(itemUrl)
  const memberSection = memberPage.getByRole('region', { name: 'Rigging data' })
  await expect(memberSection).toContainText('Needs a second person’s check before use.', LOAD)
  await memberSection.getByRole('button', { name: 'Mark the rigging data as checked' }).click()
  await expect(memberPage.getByText('Rigging data marked as checked')).toBeVisible(LOAD)
  await expect(memberSection.getByRole('note')).toHaveText(new RegExp(`^Checked by ${member.account.name} on \\d{1,2} \\w{3} \\d{4}\\.$`), LOAD)
  await expect.poll(async () => (await riggingOfItem()).checked, LOAD).toBe(true)

  // The admin adds the array: it copies the check, so it shows no warning about the data
  const NOT_CHECKED = "This speaker's rigging data needs a second person's check before use (catalogue item page)."
  await openTool(page, gig, 'rigging')
  const section = page.getByRole('region', { name: 'Line arrays' })
  await section.getByRole('combobox', { name: 'Add an array from the sound system calculator' }).selectOption({ label: 'Main L · 12 elements' })
  await expect.poll(async () => (await arraysOfGig(account, gig)).length, LOAD).toBe(1)
  expect((await arraysOfGig(account, gig))[0].data_check).toBe('checked')
  const arr = section.getByRole('article', { name: 'Main L' })
  await expect(arr).toContainText(`12 × ${k2.name}`, LOAD)
  await expect(arr).not.toContainText(NOT_CHECKED)

  // Crew outside the organisation: the array, its weight, limits and check, nothing to change
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await openTool(crewPage, gig, 'rigging')
    const theirs = crewPage.getByRole('region', { name: 'Line arrays' }).getByRole('article', { name: 'Main L' })
    await expect(theirs).toContainText(`12 × ${k2.name}`, LOAD)
    await expect(theirs).toContainText('12 elements 672 kg')
    await expect(theirs).toContainText('Safe limit 16 · maximum 24')
    await expect(theirs).not.toContainText(NOT_CHECKED)
    await expect(theirs.getByRole('status')).toHaveText(/The manufacturer's software must confirm this array/)
    await expect(theirs.getByText('Change the array', { exact: true })).toHaveCount(0)
    for (const role of ['combobox', 'spinbutton', 'textbox']) await expect(theirs.getByRole(role)).toHaveCount(0)
    await expect(crewPage.getByRole('button', { name: 'Add an array by hand' })).toHaveCount(0)
    await expectAccessible(crewPage)

    // A value changed (the admin again): not checked any more; the member can check it again
    ok('Changing the rigging data', await account.client.from('price_items').update({ rigging: { ...(await riggingOfItem()), frame_limits: 'Flown, K2-BUMP: 16 / 24 (typed again).' } }).eq('id', k2.id))
    await expect.poll(async () => (await riggingOfItem()).checked, LOAD).toBe(false)
    await memberPage.reload()
    await expect(memberSection).toContainText('Needs a second person’s check before use.', LOAD)
    await expect(memberSection.getByRole('button', { name: 'Mark the rigging data as checked' })).toBeVisible()
    // The admin's array offers to take the catalogue's state; then everyone sees it isn't checked
    await page.reload()
    await arr.getByRole('button', { name: 'Update the check from the catalogue' }).click()
    await expect.poll(async () => (await arraysOfGig(account, gig))[0].data_check, LOAD).toBe('notChecked')
    await expect(arr).toContainText(NOT_CHECKED)
    await crewPage.reload()
    await expect(theirs).toContainText(NOT_CHECKED, LOAD)
    await expect(theirs.getByRole('button', { name: 'Update the check from the catalogue' })).toHaveCount(0)
  } finally {
    await crewPage.context().close()
  }
})

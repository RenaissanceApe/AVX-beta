// Field tools (AT10): the owner's manual test lines T26–T30, T46, T48, T97, T99, T101 and
// T106–T119 (docs/PENDING.md section 2) as signed-in journeys on the TEST project. Data is made
// through the set-up (setup.js) and the database API with each person's own sign-in; only what a
// line tests is clicked through. Calculators are checked against the exact figures the screen shows
// for known inputs. What stays manual (camera, timecode between two phones, printing on paper,
// opening an MVR in Vectorworks) is in docs/notes/AT10.md.
import { test, expect } from './fixtures.js'
import { expectAccessible, waitForServiceWorker } from './helpers.js'
import { addItem, addToGig, pageAs } from './setup.js'
import { readZip, zipText, bytesOf } from './files.js'
import { barsOf, layoutFixtures, viewArea } from '../../src/lib/lightPlot.js'
import { TAG, LOAD, uniq, ok, readBell, toolGig, fixtureFile, openTool, screenPoint, drag } from './fieldtoolsSupport.js'

test.use({ area: 'fieldtools' })

// covers: T26
test('input list: channels with 48V and a catalogue mic, reorder, checks, print, to equipment; crew read it; the organisation can untick it', { tag: ['@smoke', TAG] }, async ({ adminWithOrg, browser, baseURL }) => {
  test.setTimeout(180_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Inputs')
  const crew = await world.account('crew')
  await addToGig(account, gig.id, crew)
  const mic = await addItem(account, org.id, { name: `E2E SM58 ${uniq()}`, category: 'Microphones' })
  await readBell(account, crew)

  // Tools → Add a tool → Input list
  await page.goto(`${gig.path}?tab=tools`)
  await page.getByRole('button', { name: 'Add a tool' }).first().click()
  await page.getByRole('dialog', { name: 'Add a tool' }).getByRole('button', { name: /^Input list/ }).click()
  const list = page.getByRole('region', { name: 'Input list' })
  await expect(list).toBeVisible(LOAD)

  // Three channels: a kick with 48V, a vocal on the catalogue SM58, a bass DI
  async function addInput({ source, micText, item, phantom }) {
    await list.getByRole('button', { name: 'Add input' }).first().click()
    const form = page.getByRole('dialog', { name: 'Add input' })
    await form.getByLabel('Source').fill(source)
    if (micText) await form.getByLabel('Mic or DI').fill(micText)
    if (item) await form.getByRole('combobox', { name: 'From the catalogue' }).selectOption({ label: `${item.name} · Microphones` })
    if (phantom) await form.getByLabel('Needs 48V (phantom power)').check()
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form).toBeHidden(LOAD)
    await expect(list.getByText(source, { exact: true })).toBeVisible(LOAD)
  }
  await addInput({ source: 'Kick in', micText: 'Beta 91A', phantom: true })
  await addInput({ source: 'Lead vocal', item: mic })
  await addInput({ source: 'Bass DI', micText: 'DI' })
  await expect(list).toContainText('3 inputs · 1 with 48V')
  await expectAccessible(page)

  // Move the bass up one: it becomes channel 2
  await list.getByRole('button', { name: 'Move Bass DI up' }).click()
  await expect.poll(async () => ok('Reading inputs', await account.client.from('gig_inputs').select('channel, source').eq('gig_id', gig.id).order('channel'))
    .map(r => `${r.channel} ${r.source}`), LOAD).toEqual(['1 Kick in', '2 Bass DI', '3 Lead vocal'])

  // Tick two as checked
  await list.getByRole('checkbox', { name: 'Checked Kick in' }).check()
  await list.getByRole('checkbox', { name: 'Checked Lead vocal' }).check()
  await expect(list).toContainText('2 of 3 checked', LOAD)

  // Print: the sheet lists the channels in their new order
  await list.getByRole('link', { name: 'Print' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/inputs$`))
  const rows = page.getByRole('row')
  await expect(rows.filter({ hasText: 'Kick in' })).toContainText('48V', LOAD)
  await expect(rows.nth(2)).toContainText('Bass DI')
  await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()
  await expectAccessible(page)

  // Add mics and DIs to equipment: the SM58 is planned once on the gig
  await openTool(page, gig, 'input_list')
  await list.getByRole('button', { name: 'Add mics and DIs to equipment' }).click()
  await expect(page.getByText("1 more planned on the gig's equipment.")).toBeVisible(LOAD)
  await page.goto(`${gig.path}?tab=equipment`)
  await expect(page.getByRole('main')).toContainText(mic.name, LOAD)
  expect(ok('Reading equipment', await account.client.from('gig_equipment').select('item_id, quantity').eq('gig_id', gig.id)))
    .toEqual([{ item_id: mic.id, quantity: 1 }])

  // Updates: the posts and the history
  await page.goto(`${gig.path}?tab=updates`)
  await expect(page.getByRole('main').getByText('Posts', { exact: true }).first()).toBeVisible(LOAD)
  await expect(page.getByRole('main').getByText('History', { exact: true }).first()).toBeVisible()

  // Crew: the same list, read-only (no add, move, edit or tick)
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await openTool(crewPage, gig, 'input_list')
    const theirs = crewPage.getByRole('region', { name: 'Input list' })
    await expect(theirs).toContainText('Channel 3: Lead vocal', LOAD)
    await expect(theirs).toContainText(mic.name)
    await expect(theirs).toContainText('3 inputs · 1 with 48V · 2 of 3 checked')
    await expect(theirs.getByRole('button', { name: 'Add input' })).toHaveCount(0)
    await expect(theirs.getByRole('button', { name: /^(Move|Edit|Remove) / })).toHaveCount(0)
    await expect(theirs.getByRole('checkbox')).toHaveCount(0)
    await expectAccessible(crewPage)
  } finally {
    await crewPage.context().close()
  }

  // Organisation settings: untick Input list; a new gig no longer offers it (ticked again after)
  try {
    await page.goto(`${org.path}?panel=settings`)
    const box = page.getByRole('dialog', { name: `${org.name} — settings` }).getByRole('region', { name: 'Field tools' })
      .getByRole('checkbox', { name: 'Input list' })
    await expect(box).toBeChecked(LOAD)
    await box.click()
    await expect(box).not.toBeChecked(LOAD)
    await expect.poll(async () => ok('Reading tools', await account.client.from('organisations').select('field_tools').eq('id', org.id).single()).field_tools, LOAD)
      .not.toContain('input_list')
    const { gig: other } = await toolGig(world, 'No inputs')
    await page.goto(`${other.path}?tab=tools`)
    await page.getByRole('button', { name: 'Add a tool' }).first().click()
    const offered = page.getByRole('dialog', { name: 'Add a tool' })
    await expect(offered.getByRole('button', { name: /^Stage plot/ })).toBeVisible(LOAD)
    await expect(offered.getByRole('button', { name: /^Input list/ })).toHaveCount(0)
    // The gig that has it keeps it
    await openTool(page, gig, 'input_list')
    await expect(list.getByText('Kick in', { exact: true })).toBeVisible(LOAD)
  } finally {
    const { data } = await account.client.from('organisations').select('field_tools').eq('id', org.id).single()
    if (data && !data.field_tools.includes('input_list')) {
      await account.client.from('organisations').update({ field_tools: [...data.field_tools, 'input_list'] }).eq('id', org.id)
    }
  }
})

// covers: T27
test('stage plot: stage size, a band dragged into place, named mics, rotated wedges, sent to the input list; crew see it read-only', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  test.setTimeout(180_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Plot', ['stage_plot'])
  const crew = await world.account('crew')
  await addToGig(account, gig.id, crew)
  await readBell(account, crew)
  const items = async () => ok('Reading the plot', await account.client.from('gig_plot_items').select('id, kind, x, y, rotation, label').eq('gig_id', gig.id).order('created_at'))

  // A tall window, so the whole drawing is on screen for the mouse
  await page.setViewportSize({ width: 1280, height: 1600 })
  await openTool(page, gig, 'stage_plot')
  // Stage 12 m × 8 m
  const stage = async () => ok('Reading the stage', await account.client.from('gig_show').select('stage').eq('gig_id', gig.id).maybeSingle())?.stage
  await page.getByLabel('Width (m)').fill('12')
  await page.getByLabel('Width (m)').blur()
  await expect.poll(stage, LOAD).toMatchObject({ width_m: 12 })
  await page.getByLabel('Depth (m)').fill('8')
  await page.getByLabel('Depth (m)').blur()
  await expect.poll(stage, LOAD).toMatchObject({ width_m: 12, depth_m: 8 })
  const drawing = page.getByRole('group', { name: `Stage plot for ${gig.name}, seen from above, audience at the bottom` })
  await expect(drawing).toContainText('Stage 12 m × 8 m · grid 1 m')

  // The drum kit, dragged with the mouse to the middle at the back (6 m from the left, 6.5 m from the front)
  const addKind = async kind => {
    const before = (await items()).length
    await page.getByRole('button', { name: new RegExp(`^${kind}( · \\d+ ch)?$`) }).click()
    await expect.poll(async () => (await items()).length, LOAD).toBe(before + 1)
  }
  await addKind('Drum kit')
  const kit = drawing.getByRole('button', { name: /^Drum kit, / })
  await expect(kit).toBeVisible(LOAD)
  // Grabbed by the kick drum (36 cm in front of the kit's middle; the middle itself is open); the
  // kit's middle goes where the pointer is let go
  await drag(page, await screenPoint(drawing, 450, (8 - 4) * 100 + 36), await screenPoint(drawing, 600, (8 - 6.5) * 100))
  await expect(drawing.getByRole('button', { name: 'Drum kit, 6 m from the left, 6.5 m from the front' })).toBeVisible(LOAD)
  await expect.poll(async () => (await items()).map(i => [i.kind, Number(i.x), Number(i.y)]), LOAD).toEqual([['drum_kit', 6, 6.5]])

  // Two vocal mics, a bass amp and two wedges
  for (const kind of ['Vocal mic', 'Vocal mic', 'Bass amp', 'Monitor wedge', 'Monitor wedge']) await addKind(kind)
  const onStage = page.getByRole('region', { name: 'On stage' })
  await expect(onStage.getByRole('button')).toHaveCount(6, LOAD)

  // Drag the first vocal mic downstage left (3 m, 2 m) and name both mics
  const list = await items()
  const [mic1, mic2] = list.filter(i => i.kind === 'vocal_mic')
  const micAt = i => drawing.getByRole('button', { name: `Vocal mic, ${Number(i.x)} m from the left, ${Number(i.y)} m from the front` })
  await drag(page, await screenPoint(drawing, Number(mic1.x) * 100, (8 - Number(mic1.y)) * 100), await screenPoint(drawing, 300, (8 - 2) * 100))
  await expect.poll(async () => (await items()).filter(i => i.id === mic1.id).map(i => [Number(i.x), Number(i.y)])[0], LOAD).toEqual([3, 2])
  const selected = page.getByRole('group', { name: /^Selected: / })
  async function name(id, label) {
    const row = (await items()).find(i => i.id === id)
    await micAt(row).focus()
    await page.keyboard.press('Enter')
    await selected.getByLabel('Name on the plot').fill(label)
    await selected.getByLabel('Name on the plot').blur()
    await expect.poll(async () => (await items()).find(i => i.id === id).label, LOAD).toBe(label)
  }
  await name(mic1.id, 'Ana')
  await name(mic2.id, 'Rui')
  await expect(drawing.getByRole('button', { name: 'Vocal mic, Ana, 3 m from the left, 2 m from the front' })).toBeVisible()

  // Rotate both wedges a quarter turn
  for (const wedge of list.filter(i => i.kind === 'wedge')) {
    await onStage.getByRole('button', { name: new RegExp(`^Monitor wedge ${Number(wedge.x)} m from the left`) }).click()
    await selected.getByRole('button', { name: 'Rotate' }).click()
    await expect.poll(async () => (await items()).find(i => i.id === wedge.id).rotation, LOAD).toBe(90)
  }
  await expect(page.getByText('6 things on stage · 10 channels')).toBeVisible()
  await expectAccessible(page)

  // Send to the input list: the kit's 7, two named vocals and the bass DI
  await page.getByRole('button', { name: 'Send to the input list' }).click()
  await expect(page.getByText('10 channels added to the input list.')).toBeVisible(LOAD)
  const inputs = ok('Reading inputs', await account.client.from('gig_inputs').select('channel, source, mic, phantom').eq('gig_id', gig.id).order('channel'))
  expect(inputs.map(i => i.source)).toEqual(['Kick', 'Snare', 'Hi-hat', 'Tom', 'Floor tom', 'Overhead L', 'Overhead R', 'Vocal (Ana)', 'Vocal (Rui)', 'Bass DI'])
  expect(inputs.find(i => i.source === 'Bass DI')).toMatchObject({ channel: 10, mic: 'DI', phantom: true })
  // Sent again: nothing doubles
  await page.getByRole('button', { name: 'Send to the input list' }).click()
  await expect(page.getByText('The input list already has every channel on the plot.')).toBeVisible(LOAD)

  // The print view draws the plot
  await page.getByRole('link', { name: 'Print' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/plot$`))
  await expect(page.getByRole('img', { name: /^Stage plot for / })).toBeVisible(LOAD)

  // Crew: the drawing and the list, nothing to change
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await openTool(crewPage, gig, 'stage_plot')
    await expect(crewPage.getByRole('img', { name: `Stage plot for ${gig.name}, seen from above, audience at the bottom` })).toBeVisible(LOAD)
    await expect(crewPage.getByRole('region', { name: 'On stage' })).toContainText('Ana')
    await expect(crewPage.getByRole('button', { name: 'Send to the input list' })).toHaveCount(0)
    await expect(crewPage.getByLabel('Width (m)')).toHaveCount(0)
    await expect(crewPage.getByRole('button', { name: /^Drum kit · 7 ch/ })).toHaveCount(0)
    await expectAccessible(crewPage)
  } finally {
    await crewPage.context().close()
  }
})

// An input list made through the API: channels 1… with these sources (index 0 with 48V)
async function addInputs(account, gig, sources) {
  ok('Adding inputs', await account.client.from('gig_inputs').insert(sources.map((source, i) => ({ gig_id: gig.id, channel: i + 1, source, phantom: i === 0 }))))
}

// covers: T28
test('patch: two stage boxes, sockets chosen and the rest filled, printed', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(150_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Patch', ['input_list', 'patch'])
  await addInputs(account, gig, ['Kick', 'Snare', 'Hi-hat', 'Tom', 'Floor tom', 'OH L', 'OH R', 'Vocal', 'Bass DI', 'Guitar'])
  await readBell(account)
  const lines = async () => Object.fromEntries(ok('Reading inputs', await account.client.from('gig_inputs').select('source, stage_box').eq('gig_id', gig.id)).map(r => [r.source, r.stage_box]))
  const boxes = async () => ok('Reading the boxes', await account.client.from('gig_show').select('audio').eq('gig_id', gig.id).maybeSingle())?.audio?.boxes

  await openTool(page, gig, 'patch')
  const patch = page.getByRole('region', { name: 'Patch' })
  await expect(patch).toContainText('0 of 10 lines patched', LOAD)
  // SB1, 16 inputs, split to monitors
  await patch.getByRole('button', { name: 'Add stage box' }).first().click()
  const sb1 = patch.getByRole('region', { name: /^SB1/ })
  await expect(sb1).toContainText('0 of 16 used', LOAD)
  await sb1.getByRole('checkbox', { name: 'Split to monitors' }).check()
  await expect(sb1).toContainText('SPLIT')
  // Each change saved before the next (two a moment apart can be saved out of order, issue #229)
  await expect.poll(boxes, LOAD).toEqual([{ name: 'SB1', inputs: 16, split: true }])
  // SB2 with 8 inputs
  await patch.getByRole('button', { name: 'Add stage box' }).first().click()
  const sb2 = patch.getByRole('region', { name: /^SB2/ })
  await expect.poll(boxes, LOAD).toEqual([{ name: 'SB1', inputs: 16, split: true }, { name: 'SB2', inputs: 16, split: false }])
  await sb2.getByLabel('Inputs').fill('8')
  await sb2.getByLabel('Inputs').blur()
  await expect(sb2).toContainText('0 of 8 used', LOAD)
  await expect.poll(boxes, LOAD).toEqual([{ name: 'SB1', inputs: 16, split: true }, { name: 'SB2', inputs: 8, split: false }])

  // A few sockets by hand: the vocal in SB2-01, the kick in SB1-01
  await sb2.getByRole('combobox', { name: 'Line in socket SB2-01' }).selectOption({ label: '8 · Vocal' })
  await sb1.getByRole('combobox', { name: 'Line in socket SB1-01' }).selectOption({ label: '1 · Kick' })
  await expect(patch).toContainText('2 of 10 lines patched', LOAD)
  await expect(sb1.getByText('48V')).toBeVisible()
  await expectAccessible(page)

  // Fill the free sockets: the other eight go in order into SB1-02…
  await patch.getByRole('button', { name: 'Fill the free sockets' }).click()
  await expect(page.getByText('8 lines placed in free sockets.')).toBeVisible(LOAD)
  await expect(patch).toContainText('10 of 10 lines patched')
  await expect.poll(lines, LOAD).toEqual({
    Kick: 'SB1-01', Snare: 'SB1-02', 'Hi-hat': 'SB1-03', Tom: 'SB1-04', 'Floor tom': 'SB1-05', 'OH L': 'SB1-06', 'OH R': 'SB1-07',
    Vocal: 'SB2-01', 'Bass DI': 'SB1-08', Guitar: 'SB1-09',
  })

  // Print: each box, socket by socket
  await patch.getByRole('link', { name: 'Print' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/patch$`))
  await expect(page.getByRole('heading', { name: 'SB1 · 16 inputs · SPLIT' })).toBeVisible(LOAD)
  await expect(page.getByRole('heading', { name: 'SB2 · 8 inputs' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Bass DI' })).toContainText('08')
  await expectAccessible(page)
})

// covers: T28
test('DMX patch: 8 spots and 4 LED pars addressed one after another, an overlap warned, printed', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(150_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'DMX', ['dmx_patch'])
  await readBell(account)
  const fixtures = async () => ok('Reading fixtures', await account.client.from('gig_fixtures').select('name, universe, address, footprint').eq('gig_id', gig.id).order('address'))

  await openTool(page, gig, 'dmx_patch')
  const dmx = page.getByRole('region', { name: 'DMX patch' })
  async function addFixtures({ count, type, footprint, name }) {
    await dmx.getByRole('button', { name: 'Add fixtures' }).first().click()
    const form = page.getByRole('dialog', { name: 'Add fixtures' })
    await form.getByLabel('Fixture type').fill(type)
    await form.getByRole('spinbutton', { name: 'Channels' }).fill(String(footprint))
    await form.getByLabel('How many').fill(String(count))
    await form.getByLabel(/^Name/).fill(name)
    await form.getByRole('button', { name: `Add ${count} fixtures` }).click()
    await expect(form).toBeHidden(LOAD)
  }
  await addFixtures({ count: 8, type: 'MAC Aura', footprint: 14, name: 'Spot' })
  await addFixtures({ count: 4, type: 'LED Par', footprint: 7, name: 'Par' })
  await expect(dmx).toContainText('12 fixtures · 1 universe', LOAD)
  const universe = dmx.getByRole('region', { name: 'Universe 1' })
  await expect(universe).toContainText('140 of 512 channels')
  const rows = await fixtures()
  expect(rows.map(f => `${f.name} ${f.address}`)).toEqual([
    'Spot 1 1', 'Spot 2 15', 'Spot 3 29', 'Spot 4 43', 'Spot 5 57', 'Spot 6 71', 'Spot 7 85', 'Spot 8 99',
    'Par 1 113', 'Par 2 120', 'Par 3 127', 'Par 4 134',
  ])
  await expect(universe.getByRole('listitem').filter({ hasText: 'Par 4' })).toContainText('134–140')
  await expect(page.getByText(/overlap/)).toHaveCount(0)
  await expectAccessible(page)

  // Spot 2 moved to address 10: it and Spot 1 overlap, and the page says so
  await universe.getByRole('button', { name: 'Edit Spot 2' }).click()
  const edit = page.getByRole('dialog', { name: 'Spot 2' })
  await edit.getByLabel('Address', { exact: true }).fill('10')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(edit).toBeHidden(LOAD)
  await expect(dmx.getByRole('status')).toContainText('2 fixtures overlap each other\'s channels.', LOAD)
  for (const name of ['Spot 1', 'Spot 2']) await expect(universe.getByRole('listitem').filter({ hasText: name })).toContainText('Overlaps another fixture\'s channels')
  await expect(universe.getByRole('listitem').filter({ hasText: 'Spot 3' })).not.toContainText('Overlaps')
  await expect(universe.getByRole('listitem').filter({ hasText: 'Spot 2' })).toContainText('10–23')

  // Print: the universe, fixture by fixture
  await dmx.getByRole('link', { name: 'Print' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/dmx$`))
  await expect(page.getByRole('heading', { name: 'Universe 1 · 140 of 512 channels' })).toBeVisible(LOAD)
  await expect(page.getByRole('row').filter({ hasText: 'Par 1' })).toContainText('LED Par (7 ch)')
  await expectAccessible(page)
})

// covers: T29
test('light plot: a truss and a pipe dragged into place with phases, fixtures added and hung, one dragged across, power per phase, printed', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Lights', ['dmx_patch', 'light_plot'])
  await readBell(account)
  const show = async () => ok('Reading the show', await account.client.from('gig_show').select('stage, lighting').eq('gig_id', gig.id).maybeSingle())
  const fixtures = async () => ok('Reading fixtures', await account.client.from('gig_fixtures').select('id, name, position, plot_x, plot_y, power_w, weight_kg').eq('gig_id', gig.id).order('name'))
  const bars = async () => barsOf((await show())?.lighting)
  // A point on the plot (metres; y from the front of the stage) on the screen, the way the drawing places it
  async function at(x, y) {
    const s = await show()
    const area = viewArea(s?.stage, barsOf(s?.lighting), layoutFixtures(barsOf(s?.lighting), await fixtures()))
    return screenPoint(drawing, (x - area.x0) * 100, (area.y1 - y) * 100)
  }

  await page.setViewportSize({ width: 1280, height: 1600 })
  await openTool(page, gig, 'light_plot')
  const drawing = page.getByRole('group', { name: `Light plot for ${gig.name}` })
  // A truss and a pipe: both start across the stage, 1 m from the back (5 m from the front)
  await page.getByRole('button', { name: 'Truss', exact: true }).click()
  await expect.poll(async () => (await bars()).length, LOAD).toBe(1)
  await page.getByRole('button', { name: 'Pipe', exact: true }).click()
  await expect.poll(async () => (await bars()).map(b => [b.name, b.kind, b.x, b.y]), LOAD).toEqual([['Truss 1', 'truss', 5, 5], ['Pipe 1', 'pipe', 5, 5]])
  // Drag the pipe (drawn on top) to 2 m from the front, then the truss to 4.5 m
  await drag(page, await at(5, 5), await at(5, 2))
  await expect.poll(async () => (await bars()).map(b => [b.name, b.y]), LOAD).toEqual([['Truss 1', 5], ['Pipe 1', 2]])
  await drag(page, await at(3, 5), await at(3, 4.5))
  await expect.poll(async () => (await bars()).map(b => [b.name, b.x, b.y]), LOAD).toEqual([['Truss 1', 5, 4.5], ['Pipe 1', 5, 2]])
  await expect(drawing.getByRole('button', { name: 'Truss 1, Truss, 10 m' })).toBeAttached()

  // A phase each: the truss on L1, the pipe on L2
  const positions = page.getByRole('region', { name: 'Positions' })
  // (each saved before the next: two changes a moment apart can be saved out of order, issue #229)
  for (const [name, phase] of [['Truss 1', 1], ['Pipe 1', 2]]) {
    await positions.getByRole('button', { name: new RegExp(`^${name} `) }).click()
    await page.getByRole('group', { name: `Selected: ${name}` }).getByRole('combobox', { name: 'Phase' }).selectOption(`L${phase}`)
    await expect.poll(async () => (await bars()).find(b => b.name === name).phase, LOAD).toBe(phase)
  }
  await expect(positions).toContainText('Truss · 10 m · L1')

  // The truss → Add fixtures here: 6 spots
  await positions.getByRole('button', { name: /^Truss 1 / }).click()
  await page.getByRole('group', { name: 'Selected: Truss 1' }).getByRole('button', { name: 'Add fixtures here' }).click()
  const form = page.getByRole('dialog', { name: 'Add fixtures' })
  await form.getByLabel('Fixture type').fill('Spot')
  await form.getByRole('spinbutton', { name: 'Channels' }).fill('14')
  await form.getByLabel('How many').fill('6')
  await form.getByLabel(/^Name/).fill('Spot')
  await form.getByRole('button', { name: 'Add 6 fixtures' }).click()
  await expect(form).toBeHidden(LOAD)
  await expect.poll(async () => (await fixtures()).map(f => f.position), LOAD).toEqual(Array(6).fill('Truss 1'))
  // Their power and weight (500 W, 20 kg each), and four washes already in the DMX patch, not on the plot yet
  ok('Setting power', await account.client.from('gig_fixtures').update({ power_w: 500, weight_kg: 20 }).eq('gig_id', gig.id))
  ok('Adding washes', await account.client.from('gig_fixtures').insert([1, 2, 3, 4].map(n => ({
    gig_id: gig.id, name: `Wash ${n}`, fixture_type: 'LED Wash', footprint: 7, universe: 1, address: 84 + (n - 1) * 7, power_w: 250, weight_kg: 8,
  }))))
  await page.reload()
  const loose = page.getByRole('region', { name: /not on the plot$/ })
  await expect(loose).toHaveAccessibleName('4 fixtures not on the plot', LOAD)
  await expectAccessible(page)
  for (const n of [1, 2, 3, 4]) {
    await loose.getByRole('combobox', { name: `Hang Wash ${n} on` }).selectOption('Pipe 1')
    await expect.poll(async () => (await fixtures()).find(f => f.name === `Wash ${n}`).position, LOAD).toBe('Pipe 1')
  }
  await expect(loose).toHaveCount(0, LOAD)

  // Drag Wash 1 from the pipe onto the truss: it hangs there now
  const wash = drawing.getByRole('button', { name: /^Wash 1, / })
  const box = await wash.boundingBox()
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await at(1, 4.6))
  await expect.poll(async () => (await fixtures()).find(f => f.name === 'Wash 1'), LOAD).toMatchObject({ position: 'Truss 1', plot_y: 4.5 })
  await expect(positions.getByRole('button', { name: /^Truss 1 / })).toContainText('7 fixtures · 3.3 kW · 14.1 A · 128 kg')
  await expect(positions.getByRole('button', { name: /^Pipe 1 / })).toContainText('3 fixtures · 750 W · 3.3 A · 24 kg')

  // The supply: three phase, 16 A first (L1 is above 80%), then 32 A
  const power = page.getByRole('region', { name: 'Power (estimate)' })
  await expect(power.getByRole('combobox', { name: 'Supply' })).toHaveValue('3')
  await power.getByLabel('Amps per phase', { exact: true }).fill('16')
  await power.getByLabel('Amps per phase', { exact: true }).blur()
  await expect(power.getByRole('listitem').filter({ hasText: 'L1' })).toContainText('3.3 kW · 14.1 A of 16 A', LOAD)
  await expect(power.getByRole('status')).toContainText('Above 80% of the supply on at least one phase.')
  await power.getByLabel('Amps per phase', { exact: true }).fill('32')
  await power.getByLabel('Amps per phase', { exact: true }).blur()
  await expect(power.getByRole('listitem').filter({ hasText: 'L1' })).toContainText('3.3 kW · 14.1 A of 32 A', LOAD)
  await expect(power.getByRole('listitem').filter({ hasText: 'L2' })).toContainText('750 W · 3.3 A of 32 A')
  await expect(power.getByRole('listitem').filter({ hasText: 'L3' })).toContainText('0 W · 0 A of 32 A')
  await expect(power).toContainText('In all: 4 kW, 17.4 A, 152 kg hanging.')
  await expect(power.getByRole('status')).toHaveCount(0)
  await expect.poll(async () => (await show()).lighting?.supply, LOAD).toMatchObject({ phases: 3, amps: 32, volts: 230 })
  await expectAccessible(page)

  // Print: the plot on paper with the power figures
  await page.getByRole('link', { name: 'Print' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/lights$`))
  await expect(page.getByRole('img', { name: `Light plot for ${gig.name}` })).toBeVisible(LOAD)
  await expect(page.getByRole('main').or(page.locator('body')).first()).toContainText('Truss 1')
  await expectAccessible(page)
})

// One source or listening position in the sound system calculator, by its name
const sysRow = (page, name) => page.locator('li').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) })
// Types a number in a field and leaves it (the calculator saves on leaving)
async function typeNumber(field, value) {
  await field.fill(String(value))
  await field.blur()
}

// covers: T30
test('sound system calculator: mains, subs, two delays, FOH and the back of the room; delay times, temperature and an echo; printed', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'System', ['system_calc'])
  await readBell(account)
  const system = async () => ok('Reading the system', await account.client.from('gig_show').select('system').eq('gig_id', gig.id).maybeSingle())?.system || {}
  const count = async key => (await system())[key]?.length || 0

  await openTool(page, gig, 'system_calc')
  const sources = page.getByRole('region', { name: 'Sources' })
  // Two mains, subs, two delays; each saved before the next (issue #229)
  for (const [kind, n] of [['Main', 1], ['Main', 2], ['Subs', 3], ['Delay', 4], ['Delay', 5]]) {
    await sources.getByRole('button', { name: kind, exact: true }).click()
    await expect.poll(() => count('sources'), LOAD).toBe(n)
  }
  // FOH, then the back of the room (moved to 45 m out)
  const positions = page.getByRole('region', { name: 'Listening positions' })
  await positions.getByRole('button', { name: 'Add a position' }).click()
  await expect.poll(() => count('listeners'), LOAD).toBe(1)
  await positions.getByRole('button', { name: 'Add a position' }).click()
  await expect.poll(() => count('listeners'), LOAD).toBe(2)
  const back = sysRow(page, 'Position 1')
  await typeNumber(back.getByRole('spinbutton', { name: 'Front/back (m)' }), -45)
  await expect.poll(async () => (await system()).listeners[1].y, LOAD).toBe(-45)
  await expect(sysRow(page, 'FOH')).toContainText('REFERENCE')

  // Delay 1 30 m out (front/back −30). From Main 1 (1 m left of the stage, 6 m up) to Delay 1
  // (2.5 m across, 5 m up) is √(3.5² + 30² + 1²) = 30.22 m; at 20 °C sound does 343.4 m/s:
  // 88.0 ms, plus the 10 ms Haas offset = 98 ms
  const delay1 = sysRow(page, 'Delay 1')
  await typeNumber(delay1.getByRole('spinbutton', { name: 'Front/back (m)' }), -30)
  await expect(delay1).toContainText('98 ms', LOAD)
  await expect(delay1).toContainText('Follows Main 1: the time sound takes from it, plus 10 ms so Main 1 is still heard first.')
  // Delay 2 stays 25 m out: √(3.5² + 25² + 1²) = 25.26 m from Main 2 → 73.6 + 10 = 83.6 ms
  await expect(sysRow(page, 'Delay 2')).toContainText('83.6 ms')
  await expect(page.getByText('Sound travels at 343.4 m/s')).toBeVisible()
  // At the back of the room Delay 1 arrives 10.7 ms after Main 1: fine
  await expect(back).toContainText('Delay 1 arrives 10.7 ms after Main 1: fine.')
  await expectAccessible(page)

  // 30 °C: sound is faster (349.5 m/s), so the delays are shorter
  await typeNumber(page.getByRole('spinbutton', { name: 'Air temperature (°C)' }), 30)
  await expect(page.getByText('Sound travels at 349.5 m/s')).toBeVisible(LOAD)
  await expect(delay1).toContainText('96.5 ms')
  await expect(sysRow(page, 'Delay 2')).toContainText('82.3 ms')

  // 25 ms typed on Delay 1: 121.5 ms, and at the back of the room it's an echo (more than 30 ms late)
  await expect.poll(async () => (await system()).temp_c, LOAD).toBe(30)
  await typeNumber(delay1.getByRole('spinbutton', { name: 'Extra delay (ms)' }), 25)
  await expect(delay1).toContainText('121.5 ms', LOAD)
  await expect(delay1).toContainText('Includes 25 ms typed by hand.')
  await expect(back).toContainText('Delay 1 arrives 35.8 ms after Main 1: heard as an echo here.')
  await expect(back).toContainText('Delay 2 arrives 10.4 ms after Main 2: fine.')
  await expect.poll(async () => (await system()).sources.find(s => s.name === 'Delay 1'), LOAD).toMatchObject({ y: -30, extra_ms: 25 })

  // Print: the same figures on paper
  await page.getByRole('link', { name: 'Print' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/system$`))
  await expect(page.locator('body')).toContainText('121.5 ms', LOAD)
  await expect(page.locator('body')).toContainText('heard as an echo here')
  await expectAccessible(page)
})

// covers: T97
test('sound system calculator: a catalogue speaker locks its max SPL and angle; typed by hand unlocks them; crew read the same', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  test.setTimeout(150_000)
  const { page, world, account, org } = adminWithOrg
  const { gig } = await toolGig(world, 'Speaker', ['system_calc'])
  const crew = await world.account('crew')
  await addToGig(account, gig.id, crew)
  const v8 = await addItem(account, org.id, { name: `E2E V8 ${uniq()}`, category: 'Speakers', speaker_type: 'line_array', max_spl_db: 142, dispersion_h: 80 })
  await readBell(account, crew)
  const system = async () => ok('Reading the system', await account.client.from('gig_show').select('system').eq('gig_id', gig.id).maybeSingle())?.system || {}

  await openTool(page, gig, 'system_calc')
  await page.getByRole('region', { name: 'Sources' }).getByRole('button', { name: 'Main', exact: true }).click()
  await expect.poll(async () => (await system()).sources?.length, LOAD).toBe(1)
  const main = sysRow(page, 'Main 1')
  const spl = main.getByRole('spinbutton', { name: 'Max SPL at 1 m (dB)' })
  const angle = main.getByRole('spinbutton', { name: 'Horizontal angle (°)' })
  await expect(spl).toHaveValue('136')
  await expect(spl).toBeEnabled()
  await main.getByRole('combobox', { name: 'Speaker' }).selectOption({ label: v8.name })
  await expect(spl).toHaveValue('142', LOAD)
  await expect(angle).toHaveValue('80')
  await expect(spl).toBeDisabled()
  await expect(angle).toBeDisabled()
  await expect(main).toContainText(`Max SPL and angle from the catalogue: ${v8.name}`)
  await expect.poll(async () => (await system()).sources[0], LOAD).toMatchObject({ item_id: v8.id, spl: 142, angle: 80 })
  await expectAccessible(page)

  // Crew: the same numbers, read-only
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await openTool(crewPage, gig, 'system_calc')
    await expect(sysRow(crewPage, 'Main 1')).toContainText('142 dB · 80°', LOAD)
    // Only the conditions show as fields, all locked; the source has none
    await expect(crewPage.getByRole('spinbutton')).toHaveCount(3)
    for (const field of await crewPage.getByRole('spinbutton').all()) await expect(field).toBeDisabled()
    await expect(sysRow(crewPage, 'Main 1').getByRole('spinbutton')).toHaveCount(0)
    await expect(crewPage.getByRole('button', { name: 'Main', exact: true })).toHaveCount(0)
    await expectAccessible(crewPage)
  } finally {
    await crewPage.context().close()
  }

  // Typed by hand: both fields can be changed again
  await main.getByRole('combobox', { name: 'Speaker' }).selectOption({ label: 'Typed by hand' })
  await expect(spl).toBeEnabled(LOAD)
  await expect(angle).toBeEnabled()
  await expect.poll(async () => (await system()).sources[0].item_id ?? null, LOAD).toBeNull()
  await typeNumber(spl, 139)
  await expect.poll(async () => (await system()).sources[0].spl, LOAD).toBe(139)
})

// A timecode hh:mm:ss:ff at 25 fps, in milliseconds
const tcMs = tc => {
  const [h, m, sec, f] = tc.split(':').map(Number)
  return ((h * 60 + m) * 60 + sec) * 1000 + f * 40
}
// Mark → the note form: department, the note, Save
async function markNote(page, { department, body }) {
  await page.getByRole('button', { name: 'Mark', exact: true }).click()
  const form = page.getByRole('dialog', { name: /^Note at \d\d:\d\d:\d\d:\d\d$/ })
  await form.getByRole('group', { name: 'Department' }).getByRole('button', { name: department, exact: true }).click()
  await form.getByRole('textbox', { name: 'Note', exact: true }).fill(body)
  await form.getByRole('button', { name: 'Save note' }).click()
  await expect(form).toBeHidden(LOAD)
}
const noteRow = (page, body) => page.getByRole('listitem').filter({ hasText: body })

// covers: T46
test('rehearsal notes: a stopwatch session shared live with crew, the clock set for everyone, notes both ways and offline, done, report and CSV; viewers read only', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  test.setTimeout(240_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Rehearsal')
  const [crew, viewer] = await Promise.all([world.account('crew'), world.viewer()])
  await addToGig(account, gig.id, crew)
  await readBell(account, crew, viewer)

  // PM: Tools → Rehearsal notes → New session (25 fps, stopwatch) → Run
  await page.goto(`${gig.path}?tab=tools`)
  await page.getByRole('button', { name: /^Rehearsal notes/ }).click()
  await page.getByRole('button', { name: 'New session' }).first().click()
  const create = page.getByRole('dialog', { name: 'New session' })
  await expect(create.getByRole('combobox', { name: 'Frame rate' })).toHaveValue('25')
  await create.getByRole('combobox', { name: 'Clock' }).selectOption('Stopwatch')
  await create.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('heading', { name: 'Run-through 1' })).toBeVisible(LOAD)
  await expect(page.getByText(`25 fps · Stopwatch · clock set by ${account.name}`)).toBeVisible()
  const pmClock = page.getByRole('timer', { name: 'Timecode' })
  await expect(pmClock).toHaveText('00:00:00:00')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(pmClock).not.toHaveText('00:00:00:00', LOAD)
  await expectAccessible(page)

  const crewPage = await pageAs(browser, crew, { baseURL })
  const viewerPage = await pageAs(browser, viewer, { baseURL })
  try {
    // Crew open the same session: their clock runs with the PM's
    await crewPage.goto(`${gig.path}?tab=tools&tool=rehearsal`)
    await crewPage.getByRole('button', { name: /^Run-through 1/ }).click()
    const crewClock = crewPage.getByRole('timer', { name: 'Timecode' })
    await expect(crewClock).not.toHaveText('00:00:00:00', LOAD)
    // Read both clocks one after the other: the second is ahead by about the time between the readings
    const sameClock = async () => {
      const t0 = Date.now()
      const a = tcMs(await pmClock.textContent())
      const t1 = Date.now()
      const b = tcMs(await crewClock.textContent())
      const t2 = Date.now()
      // The crew's reading can be ahead by up to the time between the readings, plus 3 frames
      return { gap: b - a, from: t1 - t0 - 120 - (t2 - t1), to: t2 - t0 + 120 }
    }
    const one = await sameClock()
    expect(one.gap, `The crew's clock is ${one.gap} ms from the PM's`).toBeGreaterThanOrEqual(Math.min(-120, one.from))
    expect(one.gap).toBeLessThanOrEqual(one.to)

    // PM sets the clock to 01:00:00:00: the crew's clock follows
    await page.getByRole('button', { name: 'Set the clock' }).click()
    const set = page.getByRole('dialog', { name: 'Set the clock' })
    await set.getByLabel('Timecode').fill('01:00:00:00')
    await set.getByRole('button', { name: 'Set', exact: true }).click()
    await expect(set).toBeHidden(LOAD)
    await expect(crewClock).toHaveText(/^01:00:\d\d:\d\d$/, LOAD)
    const two = await sameClock()
    expect(two.gap, `After setting, the crew's clock is ${two.gap} ms from the PM's`).toBeGreaterThanOrEqual(Math.min(-120, two.from))
    expect(two.gap).toBeLessThanOrEqual(two.to)

    // A note each: each appears on the other's screen without reloading
    await markNote(page, { department: 'Lighting', body: 'Q12 focus is late on the drum riser' })
    await markNote(crewPage, { department: 'Sound', body: 'Vocal mic 2 feeds back in the chorus' })
    await expect(noteRow(crewPage, 'Q12 focus is late on the drum riser')).toContainText(/01:00:\d\d:\d\dLighting/, LOAD)
    await expect(noteRow(page, 'Vocal mic 2 feeds back in the chorus')).toContainText(crew.name, LOAD)

    // Crew offline: the note waits on the phone, then goes when the connection is back
    await crewPage.context().setOffline(true)
    await markNote(crewPage, { department: 'Sound', body: 'Written in airplane mode' })
    await expect(noteRow(crewPage, 'Written in airplane mode')).toContainText('waiting to send', LOAD)
    await crewPage.context().setOffline(false)
    await expect(noteRow(crewPage, 'Written in airplane mode')).not.toContainText('waiting to send', LOAD)
    await expect(noteRow(page, 'Written in airplane mode')).toBeVisible(LOAD)
    await expect.poll(async () => ok('Reading notes', await account.client.from('rehearsal_notes').select('body').eq('gig_id', gig.id)).length, LOAD).toBe(3)

    // The PM ticks the feedback note done; the crew see it done by the PM
    await noteRow(page, 'Vocal mic 2 feeds back in the chorus').getByRole('checkbox').check()
    await expect(noteRow(crewPage, 'Vocal mic 2 feeds back in the chorus')).toContainText(`done by ${account.name}`, LOAD)
    await expectAccessible(crewPage)

    // A viewer of the organisation reads the notes but can't mark
    await viewerPage.goto(`${gig.path}?tab=tools&tool=rehearsal`)
    await viewerPage.getByRole('button', { name: /^Run-through 1/ }).click()
    await expect(noteRow(viewerPage, 'Q12 focus is late on the drum riser')).toBeVisible(LOAD)
    await expect(viewerPage.getByRole('button', { name: 'Mark', exact: true })).toHaveCount(0)
    await expect(viewerPage.getByRole('checkbox')).toHaveCount(0)
  } finally {
    await crewPage.context().close()
    await viewerPage.context().close()
  }

  // CSV: one line per note, in time order
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV', exact: true }).click()])
  expect(csv.suggestedFilename()).toBe(`${gig.name} - Run-through 1.csv`)
  const lines = new TextDecoder().decode(await bytesOf(csv)).replace(/^\uFEFF/, '').split('\n')
  expect(lines[0]).toBe('timecode,department,priority,cue,note,author,assignee,status')
  expect(lines).toHaveLength(4)
  expect(lines.find(l => l.includes('Vocal mic 2'))).toMatch(/^01:00:\d\d:\d\d,Sound,Note,,Vocal mic 2 feeds back in the chorus,.*,Done$/)
  expect(lines.find(l => l.includes('airplane'))).toMatch(/,Open$/)

  // Report: the notes and how many are still open, ready to print
  await page.getByRole('link', { name: 'Report' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/rehearsal/[0-9a-f-]{36}$`))
  await expect(page.locator('body')).toContainText('3 notes, 2 still open', LOAD)
  await expect(page.locator('body')).toContainText('Q12 focus is late on the drum riser')
  await expectAccessible(page)
})

// covers: T46 (the Portuguese wording)
test('rehearsal notes in Portuguese: crew mark a note and tick it done', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  test.setTimeout(150_000)
  const { world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Ensaio')
  const crew = await world.account('crew')
  await addToGig(account, gig.id, crew)
  ok('Starting a session', await account.client.from('rehearsal_sessions').insert({ gig_id: gig.id, name: 'Ensaio geral', fps: 25, clock: 'stopwatch' }))
  await readBell(crew)
  const crewPage = await pageAs(browser, crew, { baseURL, lang: 'pt' })
  try {
    await crewPage.goto(`${gig.path}?tab=tools&tool=rehearsal`)
    await crewPage.getByRole('button', { name: /^Ensaio geral/ }).click()
    await expect(crewPage.getByText('Ainda não há notas.')).toBeVisible(LOAD)
    await crewPage.getByRole('button', { name: 'Marcar', exact: true }).click()
    const form = crewPage.getByRole('dialog', { name: /^Nota em \d\d:\d\d:\d\d:\d\d$/ })
    await form.getByRole('group', { name: 'Departamento' }).getByRole('button', { name: 'Luz', exact: true }).click()
    await form.getByRole('textbox', { name: 'Nota', exact: true }).fill('Foco atrasado')
    await form.getByRole('button', { name: 'Guardar nota' }).click()
    await expect(form).toBeHidden(LOAD)
    const row = noteRow(crewPage, 'Foco atrasado')
    await expect(row).toContainText('Luz', LOAD)
    await row.getByRole('checkbox', { name: /^Feita: nota em \d\d:\d\d:\d\d:\d\d$/ }).check()
    await expect(row).toContainText(`feita por ${crew.name}`, LOAD)
    await expect(crewPage.getByRole('link', { name: 'Relatório' })).toBeVisible()
    await expectAccessible(crewPage)
  } finally {
    await crewPage.context().close()
  }
})

// covers: T48
test('DMX calculator in Pocket tools, offline: address to switches and back, the switch layout, a row of fixtures', { tag: TAG }, async ({ crewOnGig }) => {
  test.setTimeout(150_000)
  const { page, account } = crewOnGig
  await readBell(account)
  // My work → Pocket tools
  await page.goto('/me')
  const menu = page.getByRole('navigation', { name: 'Main menu' })
  await menu.getByRole('button').first().click()
  await page.getByRole('link', { name: /^Pocket tools/ }).click()
  await expect(page).toHaveURL(/\/tools$/)
  await expect(page.getByRole('heading', { name: 'Pocket tools', level: 1 })).toBeVisible(LOAD)
  // With the connection off: the page still opens
  await waitForServiceWorker(page)
  await page.context().setOffline(true)
  try {
    await page.reload()
    const calc = page.getByRole('region', { name: 'DMX address and dipswitches' })
    await expect(calc).toBeVisible(LOAD)
    // Address 161 = 128 + 32 + 1: switches 1, 6 and 8 ON
    await calc.getByRole('spinbutton', { name: 'Address' }).fill('161')
    await expect(calc.getByText('Switches ON: 1, 6, 8')).toBeVisible()
    const switches = calc.getByRole('group', { name: /^Dipswitches for address 161/ })
    for (const n of [1, 6, 8]) await expect(switches.getByRole('button', { name: new RegExp(`^Switch ${n},`) })).toHaveAttribute('aria-pressed', 'true')
    await expect(switches.getByRole('button', { name: 'Switch 2, worth 2' })).toHaveAttribute('aria-pressed', 'false')
    // Tapping switch 2 (worth 2) makes it 163
    await switches.getByRole('button', { name: 'Switch 2, worth 2' }).click()
    await expect(calc.getByRole('spinbutton', { name: 'Address' })).toHaveValue('163')
    await expect(calc.getByText('Switches ON: 1, 2, 6, 8')).toBeVisible()
    await expectAccessible(page)

    // A fixture labelled the other way: switch 1 worth 256, on the right, ON down
    await calc.getByText('How my fixtures show the switches').click()
    await calc.getByLabel('Switch 1 is worth').selectOption('msb')
    await calc.getByLabel('Switch 1 is on the').selectOption('right')
    await calc.getByLabel('ON is').selectOption('down')
    // 163 = 128 + 32 + 2 + 1: now switches 2, 4, 8 and 9
    await expect(calc.getByText('Switches ON: 2, 4, 8, 9')).toBeVisible()
    const turned = calc.getByRole('group', { name: /^Dipswitches for address 163/ })
    // Drawn from the right: switch 9 comes first
    await expect(turned.getByRole('button').first()).toHaveAccessibleName('Switch 9, worth 1')
    await turned.getByRole('button', { name: 'Switch 1, worth 256' }).click()
    await expect(calc.getByRole('spinbutton', { name: 'Address' })).toHaveValue('419')
    // The choice is kept on this phone
    await page.reload()
    await expect(page.getByRole('region', { name: 'DMX address and dipswitches' }).getByLabel('Switch 1 is worth')).toHaveValue('msb', LOAD)

    // Address a row: 6 fixtures of 40 channels from 401 run into the next universe
    const row = page.getByRole('region', { name: 'Address a row of fixtures' }).first()
    await row.getByRole('spinbutton', { name: 'Fixtures' }).fill('6')
    await row.getByRole('spinbutton', { name: 'Channels each' }).fill('40')
    await row.getByRole('spinbutton', { name: 'Start address' }).fill('401')
    const rows = row.getByRole('row')
    await expect(rows).toHaveCount(7)
    // 401–440 = 256 + 128 + 16 + 1: with switch 1 worth 256 that's switches 1, 2, 5 and 9
    await expect(rows.nth(1).getByRole('cell')).toHaveText(['1', '1', '401–440', '1 2 5 9'])
    await expect(rows.nth(2).getByRole('cell').nth(2)).toHaveText('441–480')
    // The third (481–520) would run past 512: it starts universe 2 at 1
    await expect(rows.nth(3).getByRole('cell').nth(0)).toHaveText('3')
    await expect(rows.nth(3).getByRole('cell').nth(1)).toContainText('2')
    await expect(rows.nth(3).getByRole('cell').nth(2)).toHaveText('1–40')
    await expect(rows.nth(6).getByRole('cell').nth(2)).toHaveText('121–160')
    await expectAccessible(page)
  } finally {
    await page.context().setOffline(false)
  }
})

// covers: T48 (the DMX patch's Dipswitches and Walk the rig)
test('DMX patch: Dipswitches per fixture and Walk the rig, position by position', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(120_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'Walk', ['dmx_patch'])
  ok('Adding fixtures', await account.client.from('gig_fixtures').insert([
    { gig_id: gig.id, name: 'Spot A', fixture_type: 'MAC Aura', footprint: 14, universe: 1, address: 1, position: 'FOH truss' },
    { gig_id: gig.id, name: 'Spot B', fixture_type: 'MAC Aura', footprint: 14, universe: 1, address: 15, position: 'FOH truss' },
    { gig_id: gig.id, name: 'Floor par', fixture_type: 'LED Par', footprint: 7, universe: 1, address: 30, position: 'Floor' },
  ]))
  await readBell(account)

  await openTool(page, gig, 'dmx_patch')
  const dmx = page.getByRole('region', { name: 'DMX patch' })
  await expect(dmx).toContainText('3 fixtures', LOAD)
  await dmx.getByRole('button', { name: 'Dipswitches' }).click()
  await expect(dmx.getByRole('button', { name: 'Dipswitches' })).toHaveAttribute('aria-pressed', 'true')
  // 15 = 8 + 4 + 2 + 1; 30 = 16 + 8 + 4 + 2
  await expect(dmx.getByRole('listitem').filter({ hasText: 'Spot A' })).toContainText('ON 1')
  await expect(dmx.getByRole('listitem').filter({ hasText: 'Spot B' })).toContainText('ON 1 2 3 4')
  await expect(dmx.getByRole('listitem').filter({ hasText: 'Floor par' })).toContainText('ON 2 3 4 5')
  await expectAccessible(page)

  // Walk the rig: by position (Floor, then FOH truss), then by address
  await dmx.getByRole('link', { name: 'Walk the rig' }).click()
  await expect(page).toHaveURL(new RegExp(`/gig/${gig.id}/dmx/walk`))
  const where = page.getByRole('heading', { level: 1 })
  await expect(where).toHaveText('Fixture 1 of 3 · Floor', LOAD)
  await expect(page.getByRole('main').or(page.locator('body')).first()).toContainText('Floor par')
  await expect(page.getByText('Switches ON: 2, 3, 4, 5')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: /^Next fixture/ }).click()
  await expect(where).toHaveText('Fixture 2 of 3 · FOH truss')
  await expect(page.getByText('Channels 1–14')).toBeVisible()
  await expect(page.getByText('Switches ON: 1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^Next fixture/ }).click()
  await expect(where).toHaveText('Fixture 3 of 3 · FOH truss')
  await expect(page.getByText('Switches ON: 1, 2, 3, 4')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Next fixture/ })).toBeDisabled()
  await page.getByRole('button', { name: /^Previous/ }).click()
  await expect(where).toHaveText('Fixture 2 of 3 · FOH truss')
})

// covers: T101
test('GDTF on a catalogue item: its modes with their channels, and the weight and power filled in when ticked', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(120_000)
  const { page, account, org } = adminWithOrg
  const item = await addItem(account, org.id, { name: `E2E Spot 300 ${uniq()}`, category: 'Lighting' })
  await readBell(account)
  await page.goto(`${org.path}/inventory/${item.id}`)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'GDTF fixture-type file' }).or(page.getByRole('button', { name: 'GDTF fixture-type file' })).first().click()
  const dialog = page.getByRole('dialog', { name: 'Fixture type (GDTF)' })
  await dialog.locator('#gdtf-file').setInputFiles(fixtureFile('sample-spot-300.gdtf'))
  // The file's two modes, with the channels the file gives
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Standard' })).toHaveText('Standard · 18 ch', LOAD)
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Basic' })).toHaveText('Basic · 12 ch')
  const use = dialog.getByRole('checkbox', { name: "Use the file's weight and power for this item (21.5 kg · 450 W)" })
  await expect(use).toBeChecked()
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Fixture type saved')).toBeVisible(LOAD)
  await expect(dialog).toBeHidden()
  // The item page shows the fixture type; the item has the file's weight and power
  const card = page.getByRole('region', { name: 'Fixture type (GDTF)' })
  await expect(card).toContainText('Sample Spot 300', LOAD)
  await expect(card).toContainText('Standard · 18 ch')
  await expect(card).toContainText('The file says 21.5 kg · 450 W')
  await expect.poll(async () => ok('Reading the item', await account.client.from('price_items').select('weight_kg, power_w').eq('id', item.id).single()), LOAD)
    .toEqual({ weight_kg: 21.5, power_w: 450 })
})

// covers: T99
test('MVR import into a gig: fixtures, modes, channels and addresses in the DMX patch, positions on the light plot; the export unzips to the same rig', { tag: TAG }, async ({ adminWithOrg }) => {
  test.setTimeout(180_000)
  const { page, world, account } = adminWithOrg
  const { gig } = await toolGig(world, 'MVR', ['dmx_patch', 'light_plot'])
  // The stage size first (12 m × 8 m), as the T-line asks
  ok('Setting the stage', await account.client.from('gig_show').upsert({ gig_id: gig.id, stage: { width_m: 12, depth_m: 8 } }))
  await readBell(account)
  const fixtures = async () => ok('Reading fixtures', await account.client.from('gig_fixtures')
    .select('name, fixture_type, mode, footprint, universe, address, position, plot_x, plot_y').eq('gig_id', gig.id).order('name'))

  await openTool(page, gig, 'dmx_patch')
  await page.getByRole('button', { name: 'Import MVR' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import an MVR file' })
  await dialog.locator('input[type="file"]').setInputFiles(fixtureFile('rig-vectorworks-style.mvr'))
  await expect(dialog.getByRole('status')).toContainText('rig-vectorworks-style.mvr: 6 fixtures · 2 fixture types · from Vectorworks', LOAD)
  const types = dialog.getByRole('region', { name: 'Which catalogue item is each fixture type?' })
  await expect(types.getByRole('listitem').filter({ hasText: 'Sample Spot 300' })).toContainText('4 fixtures · Modes: Standard · GDTF file included')
  await expect(types.getByRole('listitem').filter({ hasText: 'Sample Pixel Wash' })).toContainText('2 fixtures · Modes: Pixel · GDTF file included')
  const plan = dialog.getByRole('region', { name: 'What will happen' })
  await expect(plan).toContainText('6 fixtures added')
  await expect(plan).toContainText('2 new positions on the light plot')
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Import 6 fixtures' }).click()
  await expect(page.getByText('6 fixtures imported')).toBeVisible(LOAD)

  // The DMX patch: modes and channels from the GDTF files, addresses from the drawing (absolute
  // 513 and 529 are universe 2, 1 and 17); the Pixel mode is 4 channels + 4 cells × 3 = 16
  await expect.poll(async () => (await fixtures()).map(f => `${f.name}|${f.fixture_type}|${f.mode}|${f.footprint}|${f.universe}/${f.address}|${f.position}`), LOAD).toEqual([
    'Spot 1|Sample Spot 300|Standard|18|1/1|LX1', 'Spot 2|Sample Spot 300|Standard|18|1/19|LX1',
    'Spot 3|Sample Spot 300|Standard|18|1/37|LX1', 'Spot 4|Sample Spot 300|Standard|18|1/55|LX1',
    'Wash 1|Sample Pixel Wash|Pixel|16|2/1|FOH', 'Wash 2|Sample Pixel Wash|Pixel|16|2/17|FOH',
  ])
  const dmx = page.getByRole('region', { name: 'DMX patch' })
  await expect(dmx).toContainText('6 fixtures · 2 universes', LOAD)
  await expect(dmx.getByRole('region', { name: 'Universe 1' }).getByRole('listitem').filter({ hasText: 'Spot 4' })).toContainText('55–72')
  await expect(dmx.getByRole('region', { name: 'Universe 2' }).getByRole('listitem').filter({ hasText: 'Wash 2' })).toContainText('17–32')

  // The light plot: measured from the middle of the stage's front edge, so the spots at −3, −1,
  // 1 and 3 m across are 3, 5, 7 and 9 m from the left of a 12 m stage, 4 m from the front; the
  // washes 5 m in front of it. LX1 runs 1 m past the outer spots: 7 m long
  const placed = (await fixtures()).map(f => [f.name, Number(f.plot_x), Number(f.plot_y)])
  expect(placed).toEqual([['Spot 1', 3, 4], ['Spot 2', 5, 4], ['Spot 3', 7, 4], ['Spot 4', 9, 4], ['Wash 1', 4, -5], ['Wash 2', 8, -5]])
  const lighting = ok('Reading the plot', await account.client.from('gig_show').select('lighting').eq('gig_id', gig.id).single()).lighting
  expect(barsOf(lighting).map(b => [b.name, b.kind, b.x, b.y, b.height])).toEqual([['LX1', 'truss', 6, 4, 7], ['FOH', 'truss', 6, -5, 6]])
  await openTool(page, gig, 'light_plot')
  const positions = page.getByRole('region', { name: 'Positions' })
  await expect(positions.getByRole('button', { name: /^LX1 / })).toContainText('Truss · 7 m · trim 7 m', LOAD)
  await expect(positions.getByRole('button', { name: /^LX1 / })).toContainText('Spot 1 (1/1) · Spot 2 (1/19) · Spot 3 (1/37) · Spot 4 (1/55)')
  await expect(positions.getByRole('button', { name: /^FOH / })).toContainText('Wash 1 (2/1) · Wash 2 (2/17)')
  await expect(page.getByRole('group', { name: `Light plot for ${gig.name}` }).getByRole('button', { name: /^Spot 3, / })).toBeAttached()

  // Export: an MVR (a zip) with the six fixtures at the same addresses
  await openTool(page, gig, 'dmx_patch')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export MVR' }).click()])
  expect(download.suggestedFilename()).toMatch(/\.mvr$/)
  await expect(page.getByText('MVR file with 6 fixtures downloaded')).toBeVisible(LOAD)
  const files = await readZip(download)
  const xml = zipText(files, 'GeneralSceneDescription.xml')
  const exported = [...xml.matchAll(/<Fixture name="([^"]+)"[\s\S]*?<Address[^>]*>(\d+)<\/Address>/g)].map(m => `${m[1]} ${m[2]}`).sort()
  expect(exported).toEqual(['Spot 1 1', 'Spot 2 19', 'Spot 3 37', 'Spot 4 55', 'Wash 1 513', 'Wash 2 529'])
  expect(xml).toContain('<GDTFMode>Standard</GDTFMode>')
  expect(xml).toContain('LX1')
})

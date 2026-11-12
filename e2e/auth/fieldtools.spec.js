// Field tools (AT10): the owner's manual test lines T26–T30, T46, T48, T97, T99, T101 and
// T106–T119 (docs/PENDING.md section 2) as signed-in journeys on the TEST project. Data is made
// through the set-up (setup.js) and the database API with each person's own sign-in; only what a
// line tests is clicked through. Calculators are checked against the exact figures the screen shows
// for known inputs. What stays manual (camera, timecode between two phones, printing on paper,
// opening an MVR in Vectorworks) is in docs/notes/AT10.md.
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addGig, addItem, addToGig, pageAs } from './setup.js'
import { RUN } from './accounts.js'

test.use({ area: 'fieldtools' })

const TAG = '@fieldtools'
const LOAD = { timeout: 45_000 }
const uniq = () => `${RUN}-${Date.now().toString(36)}`
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
// Notifications read, so the bell's "9+" never trips the accessibility check (issue #209)
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}
// Its own gig per test, with the tools given already added (Tools → Add a tool is clicked in T26)
async function toolGig(world, label, tools = [], fields = {}) {
  const [admin, org] = await Promise.all([world.admin(), world.org()])
  const gig = await addGig(admin, org.id, { name: `E2E ${label} ${uniq()}`, ...fields })
  for (const tool of tools) ok(`Adding ${tool}`, await admin.client.from('gig_tools').insert({ gig_id: gig.id, tool }))
  return { admin, org, gig }
}
const openTool = (page, gig, tool) => page.goto(`${gig.path}?tab=tools&tool=${tool}`)

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

// Where a point of a drawing (in its own units, from getScreenCTM) is on the screen
async function screenPoint(svg, x, y) {
  return svg.evaluate((el, [px, py]) => {
    const p = el.createSVGPoint()
    p.x = px; p.y = py
    const s = p.matrixTransform(el.getScreenCTM())
    return { x: s.x, y: s.y }
  }, [x, y])
}
// Drags with the mouse from one screen point to another, in small steps like a hand
async function drag(page, from, to) {
  expect(Math.min(from.y, to.y), 'The drag starts or ends above the window').toBeGreaterThan(0)
  expect(Math.max(from.y, to.y), 'The drag starts or ends below the window').toBeLessThan(page.viewportSize().height)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  await page.mouse.up()
}

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

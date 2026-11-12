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

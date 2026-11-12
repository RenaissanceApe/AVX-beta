// Reports and gig finance (AT8): the owner's manual test lines T61, T74, T82, T83, T84 and T161
// (docs/PENDING.md section 2) as signed-in journeys on the TEST project. Each test makes its own
// small organisation through the set-up (setup.js), with data whose totals are known, and checks the
// exact numbers the reports and the gig's finance panel show. Only what a line tests is clicked
// through. Reports are the slowest calls on the test project (#183, #194): every view waits for
// reportLoaded (up to 45 s) before anything is read. What stays manual is in docs/notes/AT8.md.
import { test, expect } from './fixtures.js'
import { expectAccessible, reportLoaded } from './helpers.js'
import { addClient, addGig, addItem, addOrg, addQuote, addToGig, addToOrg, pageAs } from './setup.js'
import { RUN } from './accounts.js'
import { formatMoney } from '../../src/lib/quotes.js'

test.use({ area: 'reports' })

const TAG = '@reports'
const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const uniq = () => `${RUN}-${Date.now().toString(36)}`
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
const eur = (v, lang = 'en') => formatMoney(v, 'EUR', lang)

// The person has read their notifications (the bell's name drops its "9+" from ten unread on,
// issue #209), so axe's check of the bell's name doesn't depend on what the file did before
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}

// Its own organisation per test, so the organisation-wide reports count only this test's data
async function freshOrg(world, label, roles = []) {
  const admin = await world.admin()
  const org = await addOrg(admin, { name: `E2E ${label} ${uniq()}` })
  const people = {}
  for (const role of roles) {
    people[role] = await world.account(role)
    await addToOrg(admin, org.id, people[role], role)
  }
  return { admin, org, ...people }
}

// An accepted quote on a gig: rental lines [{ description, qty, unit_price, item_id? }]
async function acceptedQuote(admin, org, gig, lines) {
  const quote = await addQuote(admin, org, { gig_id: gig.id, lines })
  ok('Accepting the quote', await admin.client.from('quotes').update({ status: 'accepted' }).eq('id', quote.id))
  return quote
}

// A confirmed subrental from a new supplier: lines [{ item_id?, description, quantity, unit_cost }]
async function confirmedSubrental(admin, org, { gig, startsOn, days = 1, lines }) {
  const supplier = ok('Adding a supplier', await admin.client.from('suppliers').insert({ org_id: org.id, name: `E2E Hire Co ${uniq()}` }).select().single())
  const starts = new Date(`${startsOn}T00:00:00Z`)
  const sub = ok('Adding a subrental', await admin.client.from('subrentals').insert({
    org_id: org.id, supplier_id: supplier.id, gig_id: gig?.id || null, status: 'confirmed',
    starts_at: starts.toISOString(), ends_at: new Date(+starts + days * 86400e3).toISOString(),
  }).select().single())
  ok('Adding the subrental lines', await admin.client.from('subrental_lines').insert(lines.map((l, i) => ({ ...l, subrental_id: sub.id, org_id: org.id, position: i }))))
  return { ...sub, supplier }
}

// The amount beside a label in the gig finance panel (its <dt>, then the <dd> next to it)
const financeLine = (panel, label) => panel.locator('dt').filter({ hasText: label }).first().locator('xpath=following-sibling::dd[1]')
// A number tile on a report (its label, then the value under it)
const tile = (page, label) => page.locator(`xpath=//div[div[normalize-space(.)="${label}"]]`).first()
// …and just its value (the line under the label)
const tileValue = (page, label) => tile(page, label).locator('xpath=div[2]')
// One row of a report table as { column header: cell text }
async function tableRow(table, text) {
  await expect(table.getByRole('row').filter({ hasText: text })).toHaveCount(1)
  return table.evaluate((t, wanted) => {
    const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim())
    const row = [...t.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes(wanted))
    return Object.fromEntries([...row.querySelectorAll('td')].map((td, i) => [heads[i], td.textContent.trim()]))
  }, text)
}

// ---- T161: the key numbers ----

// This month's revenue (an accepted quote of €1,000 on a gig that starts today), the same days last
// year (a €500 quote on a gig a year ago), and this year's margin and operating result (a €100
// expense on today's gig: 90 % and €900). Made once and shared by the T161 tests.
function keyNumbersOrg(world) {
  return world.once('keyNumbers', async () => {
    const { admin, org } = await freshOrg(world, 'Key numbers')
    const now = await addGig(admin, org.id, { name: `E2E Today ${uniq()}`, start_date: day(0), end_date: day(0), status: 'confirmed' })
    await acceptedQuote(admin, org, now, [{ description: 'PA hire', qty: 2, unit_price: 500 }])
    const d = new Date()
    const lastYear = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d.getDate(), 28)).padStart(2, '0')}`
    const before = await addGig(admin, org.id, { name: `E2E Last year ${uniq()}`, start_date: lastYear, end_date: lastYear, status: 'completed' })
    await acceptedQuote(admin, org, before, [{ description: 'PA hire', qty: 1, unit_price: 500 }])
    ok('Adding an expense', await admin.client.from('expenses').insert({
      org_id: org.id, gig_id: now.id, spent_on: day(0), description: 'Cables', amount_net: 100, vat_rate: 23, vat_amount: 23, currency: 'EUR',
    }))
    return { admin, org }
  })
}
const KEY_NUMBERS = [
  ['Revenue this month', eur(1000)],
  ['Gross margin this year', '90%'],
  ['Operating result this year', eur(900)],
]

// covers: T161
test('Reports → Overview shows this month\'s revenue, the same days last year, the margin and the operating result', { tag: ['@smoke', TAG] }, async ({ adminWithOrg }) => {
  const { page, world, account } = adminWithOrg
  const { org } = await keyNumbersOrg(world)
  await readBell(account)
  await page.goto(`${org.path}/reports`)
  const revenue = page.getByRole('link', { name: /^Revenue this month/ })
  await reportLoaded(page, revenue)
  for (const [label, value] of KEY_NUMBERS) {
    await expect(page.getByRole('link', { name: new RegExp(`^${label}`) })).toContainText(value, { timeout: 45_000 })
  }
  await expect(revenue).toContainText(`Same days last year: ${eur(500)}`)
  await expectAccessible(page)
})

// covers: T161
test('the organisation\'s Home shows the same key numbers as Reports → Overview', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, account } = adminWithOrg
  const { org } = await keyNumbersOrg(world)
  await readBell(account)
  await page.goto(org.path)
  const strip = page.getByRole('region', { name: 'Key numbers' })
  await expect(strip.getByText('Revenue this month', { exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(strip.getByText("Couldn't load this number. Try again in a moment.")).toHaveCount(0)
  for (const [label, value] of KEY_NUMBERS) {
    await expect(strip.getByRole('link', { name: new RegExp(`^${label}`) })).toContainText(value)
  }
  await expect(strip.getByRole('link', { name: /^Revenue this month/ })).toContainText(`Same days last year: ${eur(500)}`)
  // A tile opens its report
  await strip.getByRole('link', { name: /^Operating result this year/ }).click()
  await expect(page).toHaveURL(/\/reports\?tab=money&period=this_year/)
  await reportLoaded(page, page.getByText(/^(Operating result|No money in this period yet)$/).first())
  await expectAccessible(page)
})

// ---- T74: gig finance ----

// A gig six days ago with an accepted quote (2 × €500), a confirmed subrental (2 × €100), a repair
// (€50), an expense (€100 net), and crew: the area's crew account with an agreed fee (€300 a day)
// whose day was approved at €280, and the extra account only on the rate card (Lighting, €150 a
// day). The admin (its PM) has no rate. Labour 280 + 150 = 430; cost 430 + 200 + 50 + 100 = 780;
// margin €220, 22 %, part estimated.
async function financeGig(world, label, roles = []) {
  const ctx = await freshOrg(world, label, roles)
  const { admin, org } = ctx
  const [crew, extra] = await Promise.all([world.account('crew'), world.account('extra')])
  const on = day(-6)
  const gig = await addGig(admin, org.id, { name: `E2E Finance ${uniq()}`, start_date: on, end_date: on, status: 'confirmed' })
  await addToGig(admin, gig.id, crew, { functionTitle: 'Sound' })
  await addToGig(admin, gig.id, extra, { functionTitle: 'Lighting' })
  await acceptedQuote(admin, org, gig, [{ description: 'PA hire', qty: 2, unit_price: 500 }])
  const sub = await confirmedSubrental(admin, org, { gig, startsOn: on, lines: [{ description: 'Extra subs', quantity: 2, unit_cost: 100 }] })
  const item = await addItem(admin, org.id, { name: `E2E Moving head ${uniq()}` })
  ok('Adding a repair', await admin.client.from('repairs').insert({ org_id: org.id, item_id: item.id, gig_id: gig.id, problem: 'Fan noise', cost: 50 }))
  ok('Adding an expense', await admin.client.from('expenses').insert({
    org_id: org.id, gig_id: gig.id, spent_on: on, description: 'Catering', amount_net: 100, vat_rate: 23, vat_amount: 23, currency: 'EUR',
  }))
  ok('Agreeing a fee', await admin.client.from('gig_crew_fees').insert({ gig_id: gig.id, user_id: crew.id, unit: 'day', rate: 300, quantity: 1 }))
  const rate = ok('Adding a rate', await admin.client.from('crew_rates').insert({ org_id: org.id, function_title: 'Lighting', day_rate: 150 }).select().single())
  const entry = ok('Logging hours', await crew.client.from('time_entries').insert({ gig_id: gig.id, user_id: crew.id, work_date: on, start_time: '09:00', end_time: '17:00' }).select().single())
  ok('Approving hours', await admin.client.rpc('review_time_entry', { p_entry: entry.id, p_approve: true, p_split: { normal: 8 }, p_fee_unit: 'day', p_fee_rate: 300, p_cost: 280 }))
  return { ...ctx, crew, extra, gig, sub, rate, on }
}

async function expectFinance(panel, { revenue, labour, subrentals, repairs, other, cost, margin }, lang = 'en') {
  const L = lang === 'pt'
    ? { revenue: /^Receita/, labour: /^Mão de obra/, subrentals: /^Subalugueres/, repairs: /^Reparações/, other: /^Outros custos/, cost: /^Custo total/, margin: /^Margem/ }
    : { revenue: /^Revenue/, labour: /^Labour/, subrentals: /^Subrentals/, repairs: /^Repairs/, other: /^Other costs/, cost: /^Total cost/, margin: /^Margin/ }
  await expect(financeLine(panel, L.revenue)).toHaveText(eur(revenue, lang), { timeout: 30_000 })
  await expect(financeLine(panel, L.labour)).toHaveText(eur(labour, lang))
  await expect(financeLine(panel, L.subrentals)).toHaveText(eur(subrentals, lang))
  await expect(financeLine(panel, L.repairs)).toHaveText(eur(repairs, lang))
  await expect(financeLine(panel, L.other)).toHaveText(eur(other, lang))
  await expect(financeLine(panel, L.cost)).toHaveText(eur(cost, lang))
  await expect(financeLine(panel, L.margin)).toHaveText(`${eur(margin, lang)} (${(Math.round(margin * 1000 / revenue) / 10).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%)`)
}
const FINANCE = { revenue: 1000, labour: 430, subrentals: 200, repairs: 50, other: 100, cost: 780, margin: 220 }

// covers: T74
test('gig finance: the numbers, an added expense, an expense replacing the subrental, and fees saved at completion', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow()
  const { page, world, account } = adminWithOrg
  const { admin, gig, rate } = await financeGig(world, 'Finance')
  await readBell(account)
  await page.goto(gig.path)
  const panel = page.getByRole('region', { name: 'Gig finance' })
  await expectFinance(panel, FINANCE)
  await expect(panel).toContainText('1 accepted quote')
  await expect(panel).toContainText(`Planned ${eur(450)}, actual ${eur(280)} · ${eur(150)} from the rate card (estimate) · 1 person without a rate`)
  await expect(panel).toContainText('Part of this is an estimate')
  await expect(panel.getByRole('button', { name: 'Save as agreed fees' })).toHaveCount(0) // not completed yet
  await expectAccessible(page)

  // Add expense: €30 more in other costs
  await panel.getByRole('button', { name: 'Add expense' }).click()
  let form = page.getByRole('dialog', { name: 'Add expense' })
  await form.getByLabel('What for').fill('Extra cables')
  await form.getByLabel('Amount excl. VAT').fill('30')
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden()
  await expectFinance(panel, { ...FINANCE, other: 130, cost: 810, margin: 190 })

  // An expense linked to the subrental: its €180 replaces the subrental's €200
  await panel.getByRole('button', { name: 'Add expense' }).click()
  form = page.getByRole('dialog', { name: 'Add expense' })
  await form.getByLabel('What for').fill('Hire Co invoice')
  await form.getByLabel('Amount excl. VAT').fill('180')
  await form.getByLabel('Replaces the planned cost of', { exact: true }).selectOption('subrental')
  const which = form.getByLabel('Which one')
  await expect(which.locator('option')).toHaveCount(2)
  await which.selectOption({ index: 1 })
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden()
  await expectFinance(panel, { ...FINANCE, other: 130, subrentals: 180, cost: 790, margin: 210 })

  // Completed: the rate card's €150 can be saved as an agreed fee; a later rate change then
  // leaves the margin alone
  ok('Completing the gig', await admin.client.from('gigs').update({ status: 'completed' }).eq('id', gig.id))
  await page.reload()
  const save = panel.getByRole('button', { name: 'Save as agreed fees' })
  await expect(save).toBeVisible({ timeout: 30_000 })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.getByText('1 fee saved')).toBeVisible()
  await expect(save).toHaveCount(0)
  await expect(panel).not.toContainText('Part of this is an estimate')
  ok('Changing the rate card', await admin.client.from('crew_rates').update({ day_rate: 250 }).eq('id', rate.id))
  await page.reload()
  await expectFinance(panel, { ...FINANCE, other: 130, subrentals: 180, cost: 790, margin: 210 })

  // The organisation export's gig_finance file has the same numbers (the call the download makes)
  const rows = ok('Exporting gig finance', await admin.client.rpc('export_org_part', { p_org: gig.org_id, p_part: 'gig_finance', p_offset: 0 }))
  const row = rows.find(r => r.gig === gig.name)
  expect(row).toMatchObject({ revenue: 1000, subrentals: 180, repairs: 50, other_costs: 130, cost: 790, margin: 210 })
})

// covers: T74
test('a member sees the same gig finance without the save button; a viewer and crew see no panel; the gig list shows the margin', { tag: TAG }, async ({ browser, baseURL, world }) => {
  test.slow()
  const { admin, member, viewer, crew, gig } = await financeGig(world, 'Finance roles', ['member', 'viewer'])
  ok('Completing the gig', await admin.client.from('gigs').update({ status: 'completed' }).eq('id', gig.id))
  await readBell(member, viewer, crew)
  const pages = []
  const open = async account => { const p = await pageAs(browser, account, { baseURL }); pages.push(p); return p }
  try {
    const m = await open(member)
    await m.goto(gig.path)
    const panel = m.getByRole('region', { name: 'Gig finance' })
    await expectFinance(panel, FINANCE)
    await expect(panel.getByRole('button', { name: 'Add expense' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Save as agreed fees' })).toHaveCount(0)
    // The organisation's gig list: the margin on the gig's card (estimated: the rate card part)
    await m.goto(`/org/${gig.org_id}`)
    await m.getByRole('tab', { name: /^Past/ }).click()
    const card = m.getByRole('button', { name: new RegExp(gig.name) })
    await expect(card).toContainText('Margin 22% · est.', { timeout: 30_000 })
    await expectAccessible(m)

    for (const account of [viewer, crew]) {
      const p = await open(account)
      await p.goto(gig.path)
      await expect(p.getByRole('heading', { name: gig.name })).toBeVisible({ timeout: 30_000 })
      await expect(p.getByText('Schedule', { exact: false }).first()).toBeVisible()
      await expect(p.getByRole('region', { name: 'Gig finance' })).toHaveCount(0)
      await expect(p.getByText(eur(1000))).toHaveCount(0)
    }
  } finally {
    for (const p of pages) await p.context().close()
  }
})

// covers: T74
test('Reports → Gig margins: totals for the period, the gig\'s row in the details, and the CSV', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, account } = adminWithOrg
  const { gig, on } = await financeGig(world, 'Margins')
  await readBell(account)
  await page.goto(`/org/${gig.org_id}/reports?tab=margins&period=custom&from=${on}&until=${on}`)
  await reportLoaded(page, page.getByText('Gigs with a negative margin'))
  await expect(tileValue(page, 'Margin')).toHaveText(`${eur(220)} · estimate`)
  await expect(tile(page, 'Margin')).toContainText('22% of revenue')
  await expect(tileValue(page, 'Revenue')).toHaveText(eur(1000))
  await expect(tileValue(page, 'Total cost')).toHaveText(eur(780))
  await expect(tileValue(page, 'Gigs with a negative margin')).toHaveText('0')
  await expect(tile(page, 'Gigs with a negative margin')).toContainText('of 1 gig')
  await page.getByLabel('Show details').check()
  const row = await tableRow(page.getByRole('table'), gig.name)
  expect(row).toMatchObject({ Revenue: eur(1000), 'Total cost': `${eur(780)} (estimate)`, Margin: eur(220) })
  await expectAccessible(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
  const csv = await (await download.createReadStream()).toArray().then(c => Buffer.concat(c).toString('utf8'))
  const lines = csv.trim().split(/\r?\n/)
  expect(lines).toHaveLength(2)
  expect(lines[1]).toContain(gig.name)
  for (const v of ['1000', '430', '200', '50', '100', '780', '220', '22']) expect(lines[1].split(/[;,]/)).toContain(v)
})

// covers: T74
test('gig finance in Portuguese', { tag: TAG }, async ({ browser, baseURL, world }) => {
  const { admin, gig } = await financeGig(world, 'Financas')
  await readBell(admin)
  const page = await pageAs(browser, admin, { baseURL, lang: 'pt' })
  try {
    await page.goto(gig.path)
    const panel = page.getByRole('region', { name: 'Finanças do evento' })
    await expectFinance(panel, FINANCE, 'pt')
    await expect(panel).toContainText('1 orçamento aceite')
    await expect(panel).toContainText('Parte disto é uma estimativa')
    await expect(panel.getByRole('button', { name: 'Adicionar despesa' })).toBeVisible()
    await expectAccessible(page)
  } finally {
    await page.context().close()
  }
})

// ---- T82: equipment money ----

// covers: T82
test('Reports → Equipment: a set\'s revenue lands on its contents, hand-typed lines show as not linked, a lost unit counts as a loss until found', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow()
  const { page, world, account } = adminWithOrg
  const { admin, org } = await freshOrg(world, 'Equipment')
  const s = uniq()
  // A set (€300 a day) of 1 speaker (€100) and 2 amps (€50 each): shared 50/50 by day price
  const speaker = await addItem(admin, org.id, { name: `E2E Speaker ${s}`, unit_price: 100, tracking: 'serial' })
  const amp = await addItem(admin, org.id, { name: `E2E Amp ${s}`, unit_price: 50, tracking: 'bulk' })
  const set = await addItem(admin, org.id, { name: `E2E PA set ${s}`, unit_price: 300, tracking: 'none', kit_type: 'set' })
  const mic = await addItem(admin, org.id, { name: `E2E Mic ${s}`, unit_price: 10, tracking: 'serial', replacement_value: 400 })
  ok('Filling the set', await admin.client.from('item_parts').insert([
    { org_id: org.id, parent_id: set.id, child_id: speaker.id, kind: 'content', quantity: 1 },
    { org_id: org.id, parent_id: set.id, child_id: amp.id, kind: 'content', quantity: 2 },
  ]))
  // A mic unit lost today, €100 paid out on its €400 replacement value: a €300 loss. A speaker
  // bought this month for €1,200.
  const [lostMic] = ok('Adding units', await admin.client.from('stock_units').insert([
    { org_id: org.id, item_id: mic.id },
    { org_id: org.id, item_id: speaker.id, purchase_date: day(0).slice(0, 8) + '01', purchase_cost: 1200 },
  ]).select())
  ok('Losing the mic', await admin.client.from('stock_units').update({ status: 'lost', disposal_value: 100, disposed_on: day(0) }).eq('id', lostMic.id))
  // Today's gig: the set (€300) and a line typed by hand (€100)
  const gig = await addGig(admin, org.id, { name: `E2E Equipment gig ${s}`, start_date: day(0), end_date: day(0), status: 'confirmed' })
  await acceptedQuote(admin, org, gig, [
    { description: 'PA set', qty: 1, unit_price: 300, item_id: set.id },
    { description: 'Hand-typed extras', qty: 1, unit_price: 100 },
  ])
  // Amps hired in once this year (for "Buy instead?")
  await confirmedSubrental(admin, org, { startsOn: day(0), lines: [{ item_id: amp.id, description: 'Amp', quantity: 1, unit_cost: 40 }] })
  await readBell(account)

  // Inventory → Reports opens Reports → Equipment
  await page.goto(`${org.path}/inventory?tab=reports`)
  await expect(page).toHaveURL(/\/reports\?tab=equipment/)
  await reportLoaded(page, page.getByRole('heading', { name: 'Purchase costs' }))
  await expect(tileValue(page, 'Revenue')).toHaveText(eur(400))
  await expect(tile(page, 'Revenue')).toContainText(`Not linked to an item: 25% (${eur(100)})`)
  await expect(tileValue(page, 'Losses')).toHaveText(eur(300))
  await page.getByLabel('Show details').check()
  const table = page.getByRole('table')
  expect(await tableRow(table, speaker.name)).toMatchObject({ Revenue: eur(150) })
  expect(await tableRow(table, amp.name)).toMatchObject({ Revenue: eur(150), 'Hire-in': eur(40) })
  expect(await tableRow(table, mic.name)).toMatchObject({ Revenue: eur(0), Losses: eur(300), Profit: eur(-300) })
  await expectAccessible(page)

  // Found again: its loss disappears
  ok('Finding the mic', await admin.client.from('stock_units').update({ status: 'available', disposal_value: null, disposed_on: null }).eq('id', lostMic.id))
  await page.reload()
  await reportLoaded(page, page.getByRole('heading', { name: 'Purchase costs' }))
  await expect(tileValue(page, 'Losses')).toHaveText(eur(0))

  // The speaker's page: its Numbers card (€150 so far, 13 % of its €1,200 paid back)
  await page.goto(`${org.path}/inventory/${speaker.id}`)
  const card = page.getByRole('region', { name: 'Numbers' })
  await expect(card).toContainText(`Revenue so far${eur(150)}`, { timeout: 30_000 })
  await expect(card).toContainText('13%')
  await expect(card).toContainText(eur(1200))
  await expectAccessible(page)

  // Inventory → Subrentals: "Buy instead?" opens Buy or hire in with the amp picked
  await page.goto(`${org.path}/inventory?tab=subrentals`)
  await page.getByRole('link', { name: `Buy instead? ${amp.name} (hired in once)` }).click()
  await expect(page).toHaveURL(/tab=equipment&view=buy&item=/)
  await expect(page.getByRole('status').filter({ hasText: amp.name })).toContainText(`${amp.name}: ${eur(40)} hired in over 12 months`, { timeout: 45_000 })
  await expectAccessible(page)
})

// ---- T83: warehouse ----

// covers: T83
test('Reports → Warehouse → Demand: two gigs beyond stock show days over stock; a subrental leaves the other days short; a member sees the same, a viewer no Reports', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  test.slow()
  const { page, world, account } = adminWithOrg
  const { admin, org, member, viewer } = await freshOrg(world, 'Warehouse', ['member', 'viewer'])
  const s = uniq()
  // 2 truss owned; two gigs three days from now, 3 days each, both want 2
  const truss = await addItem(admin, org.id, { name: `E2E Truss ${s}`, unit_price: 20, tracking: 'bulk' })
  const loc = ok('Adding a location', await admin.client.from('stock_locations').insert({ org_id: org.id, name: 'Warehouse' }).select().single())
  ok('Buying truss', await admin.client.from('stock_movements').insert({ org_id: org.id, item_id: truss.id, kind: 'purchase', quantity: 2, to_location_id: loc.id }))
  const client = await addClient(admin, org.id, { name: `E2E Client ${s}` })
  const gigs = []
  for (const n of ['A', 'B']) {
    const gig = await addGig(admin, org.id, { name: `E2E Truss gig ${n} ${s}`, start_date: day(3), end_date: day(5), status: 'confirmed', client_id: client.id })
    ok('Planning truss', await admin.client.from('gig_equipment').insert({ gig_id: gig.id, org_id: org.id, item_id: truss.id, item_name: truss.name, quantity: 2 }))
    gigs.push(gig)
  }
  // A repair (€60) from gig A
  ok('Adding a repair', await admin.client.from('repairs').insert({ org_id: org.id, item_id: truss.id, gig_id: gigs[0].id, problem: 'Bent chord', cost: 60 }))
  await readBell(account, member, viewer)
  const url = `${org.path}/reports?tab=warehouse&period=custom&from=${day(0)}&until=${day(29)}`
  const ready = page.getByText('Items over stock', { exact: true })

  await page.goto(url)
  await reportLoaded(page, ready)
  await expect(tileValue(page, 'Items over stock')).toHaveText('1')
  await expect(tileValue(page, 'Still short after hire-in')).toHaveText('1')
  await page.getByLabel('Show details').check()
  expect(await tableRow(page.getByRole('table'), truss.name)).toMatchObject({ 'Days over stock': '3', 'Days still short': '3', 'Hire-ins': '0' })
  await expectAccessible(page)

  // A confirmed subrental of 2 for the first day: only the other two stay short
  await confirmedSubrental(admin, org, { startsOn: day(3), lines: [{ item_id: truss.id, description: 'Truss', quantity: 2, unit_cost: 10 }] })
  await page.reload()
  await reportLoaded(page, ready)
  expect(await tableRow(page.getByRole('table'), truss.name)).toMatchObject({ 'Days over stock': '3', 'Days still short': '2', 'Hire-ins': '1' })
  await expect(tileValue(page, 'Times hired in')).toHaveText('1')

  // Suppliers: a hire request sent, then confirmed, counts as confirmed with a time to answer
  const supplier = ok('Adding a supplier', await admin.client.from('suppliers').insert({ org_id: org.id, name: `E2E Answering Co ${s}` }).select().single())
  const starts = new Date(`${day(10)}T00:00:00Z`)
  const request = ok('Sending a hire request', await admin.client.from('subrentals').insert({
    org_id: org.id, supplier_id: supplier.id, status: 'requested', starts_at: starts.toISOString(), ends_at: new Date(+starts + 86400e3).toISOString(),
  }).select().single())
  ok('Adding its line', await admin.client.from('subrental_lines').insert({ subrental_id: request.id, org_id: org.id, description: 'Hazer', quantity: 1, unit_cost: 25 }))
  ok('Confirming it', await admin.client.from('subrentals').update({ status: 'confirmed' }).eq('id', request.id))
  await page.getByRole('button', { name: 'Suppliers', exact: true }).click()
  await reportLoaded(page, page.getByText('Time to answer', { exact: true }).first())
  await page.getByLabel('Show details').check()
  const answered = await tableRow(page.getByRole('table'), supplier.name)
  expect(answered).toMatchObject({ Spend: eur(25), Requests: '1', Confirmed: '1', Declined: '0', Waiting: '0' })
  expect(answered['Time to answer']).toMatch(/^\d+(\.\d)? (h|min|days)$/)
  await expectAccessible(page)

  // Damage and loss, by gig: the repair under gig A and its client
  await page.goto(`${url}&view=damage&by=gig`)
  await reportLoaded(page, page.getByText('Repairs', { exact: true }).first())
  await page.getByLabel('Show details').check()
  expect(await tableRow(page.getByRole('table').first(), gigs[0].name)).toMatchObject({ Client: client.name, Repairs: '1', Cost: eur(60) })
  await expectAccessible(page)

  // The K6 tiles on Reports → Overview: one item short in the next 30 days; it opens the demand view
  await page.goto(`${org.path}/reports`)
  const short = page.getByRole('link', { name: /^Items short, next 30 days/ })
  await reportLoaded(page, short)
  await expect(short).toContainText(/^Items short, next 30 days1/)
  await expect(page.getByRole('link', { name: /^Units in repair/ })).toContainText(/^Units in repair0/)
  await expect(page.getByRole('link', { name: /^Inspections overdue/ })).toContainText(/^Inspections overdue0/)
  await short.click()
  await expect(page).toHaveURL(/tab=warehouse&period=custom&.*show=short/)
  await reportLoaded(page, ready)
  await expect(tileValue(page, 'Items over stock')).toHaveText('1')

  // A member: the same counts
  const m = await pageAs(browser, member, { baseURL })
  const v = await pageAs(browser, viewer, { baseURL })
  try {
    await m.goto(url)
    await reportLoaded(m, m.getByText('Items over stock', { exact: true }))
    await m.getByLabel('Show details').check()
    expect(await tableRow(m.getByRole('table'), truss.name)).toMatchObject({ 'Days over stock': '3', 'Days still short': '2', 'Hire-ins': '1' })
    // A viewer: no Reports in the menu, and the page says who it's for
    await v.goto(org.path)
    await expect(v.getByRole('heading', { name: org.name }).first()).toBeVisible({ timeout: 30_000 })
    await expect(v.locator(`a[href*="/org/${org.id}/reports"]`)).toHaveCount(0)
    await v.goto(url)
    await expect(v.getByText("Reports are for the organisation's admins and members.")).toBeVisible({ timeout: 30_000 })
    await expectAccessible(v)
  } finally {
    await m.context().close()
    await v.context().close()
  }
})

// ---- T84: operations and people ----

// covers: T84
test('Reports → Operations: per-person rows for the admin, totals only for a member; a cancelled gig counts as cancelled and frees its crew', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  test.slow()
  const { page, world, account } = adminWithOrg
  const { admin, org, member } = await freshOrg(world, 'Operations', ['member'])
  const crew = await world.account('crew2')
  const s = uniq()
  // Gig A: 2 days ago and yesterday, crew and the admin (PM) on it, 8 h approved for crew.
  // Gig B: in four days, crew on it; gig C the same day, crew on it too: a double booking.
  const a = await addGig(admin, org.id, { name: `E2E Ops A ${s}`, start_date: day(-2), end_date: day(-1), status: 'confirmed' })
  const b = await addGig(admin, org.id, { name: `E2E Ops B ${s}`, start_date: day(4), end_date: day(4), status: 'confirmed' })
  const c = await addGig(admin, org.id, { name: `E2E Ops C ${s}`, start_date: day(4), end_date: day(4), status: 'confirmed' })
  for (const g of [a, b, c]) await addToGig(admin, g.id, crew, { functionTitle: 'Sound' })
  const entry = ok('Logging hours', await crew.client.from('time_entries').insert({ gig_id: a.id, user_id: crew.id, work_date: day(-2), start_time: '09:00', end_time: '17:30', break_minutes: 30 }).select().single())
  ok('Approving hours', await admin.client.rpc('review_time_entry', { p_entry: entry.id, p_approve: true, p_split: { normal: 8 }, p_cost: 0 }))
  await readBell(account, member, crew)

  const crewPage = await pageAs(browser, crew, { baseURL })
  const m = await pageAs(browser, member, { baseURL })
  try {
    // Crew's My work: B and C clash
    // (My work in its simple form: the list with the clash badges is behind "All my gigs")
    const myGigs = async () => {
      await crewPage.goto('/me')
      const all = crewPage.getByRole('button', { name: 'All my gigs' })
      const upcoming = crewPage.getByRole('tab', { name: /^Upcoming/ })
      await expect(all.or(upcoming).first()).toBeVisible({ timeout: 30_000 })
      // The home can re-render while its data arrives: click until the list is there
      await expect(async () => {
        if (await all.isVisible()) await all.click()
        await expect(upcoming).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 20_000 })
    }
    await myGigs()
    const cardB = crewPage.getByRole('button', { name: new RegExp(b.name) })
    await expect(cardB).toContainText('Double booking', { timeout: 30_000 })

    // Cancel C: B no longer clashes, and C leaves the organisation's upcoming gigs
    ok('Cancelling a gig', await admin.client.from('gigs').update({ status: 'cancelled' }).eq('id', c.id))
    await myGigs()
    await expect(cardB).toBeVisible({ timeout: 30_000 })
    await expect(cardB).not.toContainText('Double booking')
    await page.goto(org.path)
    await expect(page.getByRole('button', { name: new RegExp(b.name) })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: new RegExp(c.name) })).toHaveCount(0)

    // Activity: 3 gigs, 1 cancelled
    const range = `period=custom&from=${day(-3)}&until=${day(5)}`
    await page.goto(`${org.path}/reports?tab=operations&${range}`)
    await reportLoaded(page, page.getByText('Gig days', { exact: true }))
    await expect(tileValue(page, 'Gigs')).toHaveText('3')
    await expect(tileValue(page, 'Cancelled')).toHaveText('1')
    await expect(tile(page, 'Cancelled')).toContainText('of 3 gigs')
    await expectAccessible(page)

    // The four K7 tiles on Reports → Overview open their views
    await page.goto(`${org.path}/reports`)
    await reportLoaded(page, page.getByRole('link', { name: /^Crew days this month/ }))
    for (const [label, view] of [['Crew days this month', /tab=operations&view=people$/], ['Open positions, next 14 days', /tab=operations&view=staffing&period=this_month$/],
      ['Overdue tasks', /tab=operations&view=tasks$/], ['Days of hours to approve', /tab=operations&view=people$/]]) {
      await expect(page.getByRole('link', { name: new RegExp(`^${label}`) })).toHaveAttribute('href', view)
    }
    await expect(page.getByRole('link', { name: /^Days of hours to approve/ })).toContainText(/^Days of hours to approve0/)
    await page.getByRole('link', { name: /^Overdue tasks/ }).click()
    await expect(page).toHaveURL(/tab=operations&view=tasks/)
    await reportLoaded(page, page.getByText(/^(Open tasks|No tasks open or done in this period)$/).first())
    await page.goto(`${org.path}/reports?tab=operations&${range}`)
    await reportLoaded(page, page.getByText('Gig days', { exact: true }))

    // People, as the admin: per-person rows. Crew days: the admin (PM of all three, as their
    // creator) and crew are each on A (2 days) and B (1 day): 6; the cancelled gig's day doesn't count
    await page.getByRole('button', { name: 'People', exact: true }).click()
    await reportLoaded(page, page.getByText('Crew days', { exact: true }).first())
    await expect(tileValue(page, 'Crew days')).toHaveText('6')
    await expect(tileValue(page, 'Hours approved')).toHaveText('8 h')
    await page.getByLabel('Show details').check()
    const table = page.getByRole('table', { name: 'Per person' })
    expect(await tableRow(table, crew.name)).toMatchObject({ 'Crew days': '3', 'Hours approved': '8 h' })
    expect(await tableRow(table, admin.name)).toMatchObject({ 'Crew days': '3', 'Hours approved': '0 h' })
    await expectAccessible(page)

    // The person's page, from the table
    await table.getByRole('link', { name: crew.name }).click()
    await expect(page).toHaveURL(new RegExp(`/people/${crew.id}`))
    await expect(page.getByRole('heading', { name: crew.name })).toBeVisible({ timeout: 30_000 })

    // A member: the same totals, no per-person rows, and no person pages
    await m.goto(`${org.path}/reports?tab=operations&view=people&${range}`)
    await reportLoaded(m, m.getByText('Crew days', { exact: true }).first())
    await expect(tileValue(m, 'Crew days')).toHaveText('6')
    await expect(tileValue(m, 'Hours approved')).toHaveText('8 h')
    await m.getByLabel('Show details').check()
    await expect(m.getByText('Figures per person are shown to admins only.')).toBeVisible()
    await expect(m.getByRole('table', { name: 'Per person' })).toHaveCount(0)
    await m.goto(`${org.path}/people/${crew.id}`)
    await expect(m.getByText("A person's days, hours and cost are shown to the organisation's admins only.")).toBeVisible({ timeout: 30_000 })
    await expectAccessible(m)
  } finally {
    await crewPage.context().close()
    await m.context().close()
  }
})

// ---- T61: long lists ----

// covers: T61
test('more than 1000 catalogue items all show in Inventory, with their stock', { tag: TAG }, async ({ adminWithOrg }) => {
  test.slow()
  const { page, world, account } = adminWithOrg
  const { admin, org } = await freshOrg(world, 'Long lists')
  const s = uniq()
  // 1005 items in one request (sorted by name, so the last ones are past the first 1000), then one
  // more at the very end with stock
  const rows = Array.from({ length: 1005 }, (_, i) => ({ org_id: org.id, created_by: admin.id, name: `E2E Bulk ${String(i + 1).padStart(4, '0')}`, kind: 'rental', tracking: 'none', unit_price: 1 }))
  ok('Adding 1005 items', await admin.client.from('price_items').insert(rows))
  const last = await addItem(admin, org.id, { name: `ZZ Last item ${s}`, tracking: 'bulk' })
  const loc = ok('Adding a location', await admin.client.from('stock_locations').insert({ org_id: org.id, name: 'Warehouse' }).select().single())
  ok('Buying stock', await admin.client.from('stock_movements').insert({ org_id: org.id, item_id: last.id, kind: 'purchase', quantity: 7, to_location_id: loc.id }))
  await readBell(account)

  await page.goto(`${org.path}/inventory`)
  const items = page.getByRole('button', { name: /^E2E Bulk \d{4}/ })
  await expect(items).toHaveCount(1005, { timeout: 45_000 })
  const lastRow = page.getByRole('button', { name: new RegExp(`^ZZ Last item ${s}`) })
  await expect(lastRow).toContainText('7')
  await page.getByLabel('Search name, code, brand…').fill('E2E Bulk 1005')
  await expect(items).toHaveCount(1)
  await page.getByLabel('Search name, code, brand…').fill('ZZ Last item')
  await expect(lastRow).toBeVisible()
  await expect(lastRow).toContainText('7')
})

// Hours, leave, expenses, crew rates and fees (AT7): the owner's manual test lines T55, T68–T71
// and T85 (docs/PENDING.md section 2) as signed-in journeys on the TEST project. Data is made
// through the set-up (setup.js); only what a line tests is clicked through. What stays manual is
// in docs/notes/AT7.md.
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addGig, addToGig, pageAs } from './setup.js'
import { RUN } from './accounts.js'
import { readZip, zipText } from './files.js'
import { requireTestSupport, runRecurringExpenses } from './testSupport.js'

test.use({ area: 'hours' })

const TAG = '@hours'
const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const uniq = () => `${RUN}-${Date.now().toString(36)}`
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
// The next Monday at least a week away, so a Monday–Friday request is five working days
const nextMonday = () => {
  const d = new Date(Date.now() + 7 * 86400e3)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return Math.round((d - Date.now()) / 86400e3)
}

// Its own gig per test (so one test's hours or fees never show in another's), with the area's crew
// account on it in a function
async function gigWithCrew(world, { label, functionTitle = 'Sound technician', ...fields } = {}) {
  const [admin, org, crew] = await Promise.all([world.admin(), world.org(), world.account('crew')])
  const gig = await addGig(admin, org.id, { name: `E2E ${label} ${uniq()}`, ...fields })
  await addToGig(admin, gig.id, crew, { functionTitle })
  return { admin, org, crew, gig }
}
const crewTab = (page, gig) => page.goto(`${gig.path}?tab=crew`)
// The person has read their notifications. The bell's name doesn't include its "9+" from ten
// unread on (issue #209, documented by its own test at the end), and the people here collect
// notifications as the file runs, so each test starts with them read.
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}

// covers: T69
test('crew log hours, the admin sends them back and approves them', { tag: ['@smoke', TAG] }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, account } = adminWithOrg
  const { crew, gig } = await gigWithCrew(world, { label: 'Hours' })
  await readBell(account, crew)
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    // Crew: Crew tab → Log hours, a break and travel, send
    await crewTab(crewPage, gig)
    const mine = crewPage.getByRole('region', { name: 'My hours' })
    await expect(mine).toBeVisible({ timeout: 20_000 })
    await mine.getByRole('button', { name: 'Log hours' }).click()
    const form = crewPage.getByRole('dialog', { name: 'Log hours' })
    await expect(form.getByLabel('Day', { exact: true })).toHaveValue(gig.start_date)
    await form.getByLabel('Start', { exact: true }).fill('09:00')
    await form.getByLabel('End', { exact: true }).fill('18:00')
    await form.getByLabel('Break (minutes)').fill('60')
    await form.getByLabel('Travel (minutes)', { exact: true }).fill('30')
    await form.getByLabel('Kilometres').fill('42')
    await expect(form).toContainText('Worked: 8')
    await expectAccessible(crewPage)
    await form.getByRole('button', { name: 'Send hours' }).click()
    await expect(form).toBeHidden()
    await expect(mine).toContainText('Waiting')
    await expect(mine).toContainText('60 min break')

    // Admin: the gig's Hours shows the waiting day; send it back with a note
    await crewTab(page, gig)
    const hours = page.getByRole('region', { name: /^Hours\b/ })
    await expect(hours).toContainText(crew.name, { timeout: 20_000 })
    await expect(hours).toContainText('Waiting')
    await hours.getByRole('button', { name: 'Send back' }).click()
    const back = page.getByRole('dialog', { name: `Send back ${crew.name}'s hours` })
    await back.getByLabel('What should they change?').fill('The break was 30 minutes')
    await back.getByRole('button', { name: 'Send back' }).click()
    await expect(hours).toContainText('Sent back: The break was 30 minutes')

    // Crew: sees the note, changes the break, it waits again
    await crewPage.reload()
    await expect(mine).toContainText('Sent back: The break was 30 minutes', { timeout: 20_000 })
    await mine.getByRole('button', { name: `Change hours for ${gig.start_date}` }).click()
    const edit = crewPage.getByRole('dialog', { name: 'Change hours' })
    await edit.getByLabel('Break (minutes)').fill('30')
    await edit.getByRole('button', { name: 'Save' }).click()
    await expect(edit).toBeHidden()
    await expect(mine).toContainText('Waiting')
    await expect(mine).toContainText('30 min break')

    // Admin: approves; the day locks (no pencil any more)
    await page.reload()
    await expect(hours).toContainText('Waiting', { timeout: 20_000 })
    await hours.getByRole('button', { name: 'Approve' }).click()
    await expect(hours).toContainText('Approved')
    await expect(hours.getByRole('button', { name: `Change hours for ${gig.start_date}` })).toHaveCount(0)
    await expectAccessible(page)

    // Crew: approved, and still can't change it
    await crewPage.reload()
    await expect(mine).toContainText('Approved', { timeout: 20_000 })
    await expect(mine.getByRole('button', { name: `Change hours for ${gig.start_date}` })).toHaveCount(0)
  } finally {
    await crewPage.context().close()
  }
})

// covers: T69
test('crew never see anyone else\'s hours or cost; the month pages list them', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, org } = adminWithOrg
  const { admin, crew, gig } = await gigWithCrew(world, { label: 'Hours others', start_date: day(-3), end_date: day(-2) })
  const extra = await world.account('extra')
  await addToGig(admin, gig.id, extra, { functionTitle: 'Lighting' })
  await readBell(admin, crew)
  // Both log a day through the database API, as the app does
  for (const who of [crew, extra]) {
    ok('Logging hours', await who.client.from('time_entries').insert({
      gig_id: gig.id, user_id: who.id, work_date: gig.start_date, start_time: '10:00', end_time: '16:00',
    }))
  }
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await crewTab(crewPage, gig)
    const mine = crewPage.getByRole('region', { name: 'My hours' })
    await expect(mine).toContainText('Waiting', { timeout: 20_000 })
    // Crew see who else is on the gig, but not their hours
    await expect(mine).not.toContainText(extra.name)
    await expect(crewPage.getByRole('region', { name: /^Hours\b/ })).toHaveCount(0)
    await expect(crewPage.getByRole('region', { name: 'Labour cost' })).toHaveCount(0)
    // The database agrees: crew read only their own days
    const rows = ok('Reading hours as crew', await crew.client.from('time_entries').select('user_id').eq('gig_id', gig.id))
    expect(rows.map(r => r.user_id)).toEqual([crew.id])

    // My work → My hours shows the crew member's own day
    await crewPage.goto('/me/hours')
    await expect(crewPage.getByRole('heading', { name: 'My hours' })).toBeVisible({ timeout: 20_000 })
    await expect(crewPage.getByText(gig.name).first()).toBeVisible({ timeout: 20_000 })
    await expectAccessible(crewPage)
  } finally {
    await crewPage.context().close()
  }
  // Organisation → Hours: the admin sees both people
  await page.goto(`${org.path}/hours`)
  await expect(page.getByText(crew.name).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(extra.name).first()).toBeVisible()
  await expectAccessible(page)
})

// covers: T55
test('crew rates: a function rate gives the labour cost, a fixed fee overrides it, crew see only their own fee', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, org } = adminWithOrg
  const fn = `Sound technician ${uniq()}`
  // Saturday and Sunday: two weekend days
  const sat = (() => { let n = 7; while (new Date(Date.now() + n * 86400e3).getDay() !== 6) n++; return n })()
  const { admin, crew, gig } = await gigWithCrew(world, { label: 'Rates', functionTitle: fn, start_date: day(sat), end_date: day(sat + 1) })
  await readBell(admin)

  // Settings → Crew rates: add a rate for the function, and the weekend factor 1,25
  await page.goto(`${org.path}?panel=settings`)
  const rates = page.getByRole('region', { name: 'Crew rates' })
  await expect(rates).toBeVisible({ timeout: 20_000 })
  await rates.getByLabel('Function').fill(fn)
  await rates.getByLabel('Per day', { exact: true }).fill('200')
  await rates.getByRole('button', { name: 'Add' }).first().click()
  await expect(rates.getByLabel(`Day rate for ${fn}`, { exact: true })).toHaveValue(/^200/)
  await rates.getByLabel('Weekend ×').fill('1,25')
  await rates.getByRole('button', { name: 'Save' }).first().click()
  await expect(page.getByText('Factors saved')).toBeVisible()
  await expectAccessible(page)

  // The gig's Crew tab → Labour cost: from the rate card, two weekend days, 2 × 200 × 1,25 = 500
  await crewTab(page, gig)
  const labour = page.getByRole('region', { name: 'Labour cost' })
  await expect(labour).toContainText(crew.name, { timeout: 20_000 })
  await expect(labour).toContainText('From the rate card')
  await expect(labour).toContainText('(2 weekend days)')
  await expect(labour).toContainText('€500.00')

  // The pencil: a fixed fee, then back to the rate card
  await labour.getByRole('button', { name: `Set the fee for ${crew.name}` }).click()
  let fee = page.getByRole('dialog', { name: `Fee for ${crew.name}` })
  await fee.getByLabel('Charged').selectOption('fixed')
  await fee.getByLabel('Amount (€)').fill('450')
  await expectAccessible(page)
  await fee.getByRole('button', { name: 'Save' }).click()
  await expect(labour).toContainText('Agreed: €450.00 fixed')

  // Crew: only their own fee, no labour cost
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await crewTab(crewPage, gig)
    await expect(crewPage.getByText('Your fee for this gig')).toBeVisible({ timeout: 20_000 })
    await expect(crewPage.getByText('Your fee for this gig').locator('..')).toContainText('€450.00')
    await expect(crewPage.getByRole('region', { name: 'Labour cost' })).toHaveCount(0)
    await expect(crewPage.getByText('Planned labour cost')).toHaveCount(0)
  } finally {
    await crewPage.context().close()
  }

  await labour.getByRole('button', { name: `Set the fee for ${crew.name}` }).click()
  fee = page.getByRole('dialog', { name: `Fee for ${crew.name}` })
  await fee.getByRole('button', { name: 'Use the rate card instead' }).click()
  await expect(labour).toContainText('From the rate card')
  await expect(labour).toContainText('€500.00')
})

// covers: T68
test('crew call: the fee fills in from the rate card and can be put back', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, account, org } = adminWithOrg
  const fn = `Rigger ${uniq()}`
  ok('Adding a rate', await account.client.from('crew_rates').insert({ org_id: org.id, function_title: fn, day_rate: 180 }))
  await readBell(account)
  const { gig } = await gigWithCrew(world, { label: 'Crew call' })

  await crewTab(page, gig)
  await page.getByRole('button', { name: 'Crew call' }).first().click()
  const call = page.getByRole('dialog', { name: 'Crew call' })
  await call.getByLabel(/^Function/).fill(fn)
  // Two weekday-or-weekend days of the gig at 180: the suggestion fills the fee
  await expect(call.getByLabel('Rate (€)')).toHaveValue(/^180/)
  await expect(call).toContainText('The rate card suggests')
  await call.getByLabel('Rate (€)').fill('210')
  await expect(call.getByLabel('Rate (€)')).toHaveValue('210')
  await call.getByRole('button', { name: 'Use the rate card’s fee' }).click()
  await expect(call.getByLabel('Rate (€)')).toHaveValue(/^180/)
  await expectAccessible(page)
})

// covers: T70
test('leave: a member asks, the admin refuses one and approves another, the balance follows', { tag: TAG }, async ({ member, browser, baseURL }) => {
  const { page, world, org, account } = member
  const admin = await world.admin()
  const monday = nextMonday()
  await readBell(account, admin)

  // Member: Organisation → Leave → Ask for leave, a holiday week (Monday–Friday)
  await page.goto(`${org.path}/leave`)
  await page.getByRole('button', { name: 'Ask for leave' }).first().click()
  const ask = page.getByRole('dialog', { name: 'Ask for leave' })
  await ask.getByLabel('Type', { exact: true }).selectOption('holiday')
  await ask.getByLabel('From').fill(day(monday))
  await ask.getByLabel('To').fill(day(monday + 4))
  await expect(ask).toContainText('5 working days')
  await expect(ask).toContainText('an admin approves it')
  await expectAccessible(page)
  await ask.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText("Request sent. You'll get a notification when it's decided.")).toBeVisible()
  // A second request, one day the week after (made through the set-up)
  ok('Asking for leave', await account.client.from('crew_unavailability').insert({
    user_id: account.id, org_id: org.id, type: 'holiday', start_date: day(monday + 7), end_date: day(monday + 7),
  }))

  const year = new Date(Date.now() + (monday + 7) * 86400e3).getFullYear()
  const usedDays = async () => {
    const rows = ok('Reading the balance', await account.client.rpc('leave_balances', { p_org: org.id, p_year: year }))
    const mine = rows.find(r => r.user_id === account.id)
    expect(mine, 'the member has a balance').toBeTruthy()
    return Number(mine.used)
  }
  const usedBefore = await usedDays()

  // Admin: both under "requests waiting for you"; refuse the week with a note, approve the day
  const adminPage = await pageAs(browser, admin, { baseURL })
  try {
    await adminPage.goto(`${org.path}/leave`)
    const waiting = adminPage.getByRole('region', { name: /requests? waiting for you/ })
    await expect(waiting).toContainText(account.name, { timeout: 20_000 })
    const week = waiting.getByRole('listitem').filter({ hasText: '5 days' })
    await week.getByRole('button', { name: 'Refuse' }).click()
    await week.getByLabel('Why (they see this)').fill('Festival week')
    await week.getByRole('button', { name: 'Refuse' }).click()
    await expect(waiting.getByRole('listitem').filter({ hasText: '5 days' })).toHaveCount(0)
    await waiting.getByRole('button', { name: 'Approve' }).click()
    await expect(waiting).toHaveCount(0)
    await expectAccessible(adminPage)
  } finally {
    await adminPage.context().close()
  }

  // Member: the refusal's note, the approved day, and the balance down by one day
  await page.reload()
  const mine = page.getByRole('region', { name: 'Your leave' })
  await expect(mine).toContainText('Refused: Festival week', { timeout: 20_000 })
  await expect(mine).toContainText('Approved')
  expect(await usedDays()).toBe(usedBefore + 1)
})

// covers: T70
test('leave: a sick day counts at once and colleagues see it only as "Away"', { tag: TAG }, async ({ member, browser, baseURL }) => {
  const { page, world, org, account } = member
  const [admin, colleague] = await Promise.all([world.admin(), world.inOrg('extra', 'member')])
  const other = await world.other()
  await readBell(account, colleague)

  await page.goto(`${org.path}/leave`)
  await page.getByRole('button', { name: 'Ask for leave' }).first().click()
  const ask = page.getByRole('dialog', { name: 'Ask for leave' })
  await ask.getByLabel('Type', { exact: true }).selectOption('sick')
  await ask.getByLabel('From').fill(day(0))
  await ask.getByPlaceholder('Note for the admins (optional)').fill('Flu, private')
  await expect(ask).toContainText('counts at once; the admins are told')
  await ask.getByRole('button', { name: 'Save' }).click()
  await expect(ask).toBeHidden()
  await expect(page.getByRole('region', { name: 'Your leave' })).toContainText('Approved', { timeout: 20_000 })

  // The admin is told
  const notes = ok('Reading the admin\'s notifications', await admin.client.from('notifications').select('kind, details').eq('org_id', org.id).order('created_at', { ascending: false }).limit(20))
  expect(notes.some(n => /leave/.test(n.kind))).toBe(true)

  // A colleague sees the day under "Who is away" as Away, without the note
  const colleaguePage = await pageAs(browser, colleague, { baseURL })
  try {
    await colleaguePage.goto(`${org.path}/leave`)
    const away = colleaguePage.getByRole('region', { name: 'Who is away' })
    await expect(away).toContainText(account.name, { timeout: 20_000 })
    await expect(away).toContainText('Away')
    await expect(away).not.toContainText('Sick')
    await expect(colleaguePage.getByText('Flu, private')).toHaveCount(0)
  } finally {
    await colleaguePage.context().close()
  }
  // Someone from another company can't read the organisation's leave at all
  const theirs = ok('Reading leave as another company', await other.client.from('crew_unavailability').select('type, note').eq('org_id', org.id))
  expect(theirs).toEqual([])
})

// covers: T71
test('expenses: a member adds one from the total with VAT; a viewer has no Expenses', { tag: TAG }, async ({ member, viewer }) => {
  const { page, org, account } = member
  const what = `E2E Cables ${uniq()}`
  await readBell(account, viewer.account)
  await page.goto(`${org.path}/expenses`)
  await expect(page.getByRole('heading', { name: 'Expenses' }).first()).toBeVisible({ timeout: 20_000 })
  // The Categories tab is for admins only
  await expect(page.getByRole('tab', { name: 'Categories' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add expense' }).first().click()
  const form = page.getByRole('dialog', { name: 'Add expense' })
  await form.getByLabel('What for').fill(what)
  await form.getByLabel('VAT %').fill('23')
  await form.getByLabel('Total with VAT').fill('123')
  await expect(form.getByLabel('Amount excl. VAT')).toHaveValue('100')
  await expect(form.getByLabel('VAT', { exact: true })).toHaveAttribute('placeholder', '23')
  await expectAccessible(page)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(form).toBeHidden()
  await expect(page.getByText(what)).toBeVisible({ timeout: 20_000 })
  await expectAccessible(page)

  // A viewer: no Expenses in the menu, and the page says it isn't for them
  const v = viewer.page
  await v.goto(viewer.org.path)
  await expect(v.getByTitle(`Workspace: ${viewer.org.name}`)).toBeVisible({ timeout: 20_000 })
  await expect(v.getByRole('link', { name: 'Expenses', exact: true })).toHaveCount(0)
  await v.goto(`${viewer.org.path}/expenses`)
  await expect(v.getByText("Only the organisation's admins and members see expenses.", { exact: false })).toBeVisible({ timeout: 20_000 })
})

// covers: T71
test('expenses: crew claim on a gig, the PM sends it back, crew send again, the PM approves', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world } = adminWithOrg
  const { admin, crew, gig } = await gigWithCrew(world, { label: 'Claims' })
  await readBell(admin, crew)
  const what = `E2E Taxi ${uniq()}`
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await crewTab(crewPage, gig)
    await crewPage.getByRole('button', { name: 'Claim an expense' }).first().click()
    const claim = crewPage.getByRole('dialog', { name: 'Claim an expense' })
    await claim.getByLabel('What for').fill(what)
    await claim.getByLabel('Amount excl. VAT').fill('20')
    await expectAccessible(crewPage)
    await claim.getByRole('button', { name: 'Send claim' }).click()
    await expect(claim).toBeHidden()
    await expect(crewPage.getByText(what)).toBeVisible({ timeout: 20_000 })

    // PM: send it back with a note
    await crewTab(page, gig)
    const expenses = page.getByRole('region', { name: /Expenses/ })
    await expect(expenses).toContainText('1 claim to approve', { timeout: 20_000 })
    await expenses.getByRole('button', { name: 'Send back' }).click()
    const back = page.getByRole('dialog').filter({ has: page.getByLabel('What needs fixing?') })
    await back.getByLabel('What needs fixing?').fill('Add the receipt number')
    await back.getByRole('button', { name: 'Send back' }).click()
    await expect(expenses).not.toContainText('1 claim to approve')

    // Crew: sees the note, opens the claim and sends it again
    await crewPage.reload()
    await expect(crewPage.getByText('Sent back: “Add the receipt number”')).toBeVisible({ timeout: 20_000 })
    await crewPage.getByText(what).click()
    const again = crewPage.getByRole('dialog')
    await again.getByRole('button', { name: 'Send again' }).click()
    await expect(again).toBeHidden()

    // PM: approves
    await page.reload()
    await expect(expenses).toContainText('1 claim to approve', { timeout: 20_000 })
    await expenses.getByRole('button', { name: 'Approve' }).click()
    await expect(expenses).not.toContainText('1 claim to approve')
  } finally {
    await crewPage.context().close()
  }
})

// covers: T71 (recurring costs)
test('expenses: a monthly cost from last month makes two drafts to confirm', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const { rec, what } = await monthlyCostFromLastMonth(account, org)
  const drafts = ok('Reading the drafts', await account.client.from('expenses').select('status').eq('recurrence_id', rec.id))
  expect(drafts.map(d => d.status)).toEqual(['draft', 'draft'])

  // This month shows this month's draft, waiting to be confirmed
  await page.goto(`${org.path}/expenses`)
  const rows = page.getByRole('listitem').filter({ hasText: what })
  await expect(rows).toHaveCount(1, { timeout: 20_000 })
  await expect(rows).toContainText('To confirm')
  await expectAccessible(page)
})

// covers: T71 (recurring costs: "the next morning nothing new until its date"). Needs test_support.
test('expenses: the morning job makes no new draft before the next date', { tag: TAG }, async ({ adminWithOrg }) => {
  const { account, org } = adminWithOrg
  await requireTestSupport(account)
  const { rec } = await monthlyCostFromLastMonth(account, org)
  await runRecurringExpenses(account, org.id)
  const after = ok('Reading the drafts', await account.client.from('expenses').select('id').eq('recurrence_id', rec.id))
  expect(after).toHaveLength(2)
})

// A monthly cost starting on the 1st of last month, added as Expenses → Recurring does (it makes
// the drafts due by today straight away)
async function monthlyCostFromLastMonth(account, org) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const startsOn = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`
  const what = `E2E Rent ${uniq()}`
  const rec = ok('Adding a recurring cost', await account.client.from('expense_recurrences').insert({
    org_id: org.id, description: what, amount_net: 500, vat_rate: 23, every: 'month', starts_on: startsOn,
  }).select().single())
  ok('Making the drafts', await account.client.rpc('draft_recurring_expenses_now', { p_org: org.id }))
  return { rec, what }
}

// covers: T85
test('crew numbers: the admin marks a finished gig\'s fee paid, crew mark it received', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, account, org } = adminWithOrg
  const { crew, gig } = await gigWithCrew(world, { label: 'Paid', start_date: day(-10), end_date: day(-9), status: 'completed' })
  ok('Agreeing a fee', await account.client.from('gig_crew_fees').insert({ gig_id: gig.id, user_id: crew.id, unit: 'day', rate: 150, quantity: 2 }))
  await readBell(account, crew)

  // Expenses → Crew to pay lists the fee
  await page.goto(`${org.path}/expenses`)
  await page.getByRole('tab', { name: 'Crew to pay' }).click()
  const toPay = page.getByRole('region', { name: 'Crew to pay' })
  await expect(toPay).toContainText(gig.name, { timeout: 20_000 })
  await expectAccessible(page)

  // The gig's labour panel → Mark paid
  await crewTab(page, gig)
  const labour = page.getByRole('region', { name: 'Labour cost' })
  await labour.getByRole('button', { name: `Mark paid: ${crew.name}` }).click()
  const paid = page.getByRole('dialog', { name: `Mark ${crew.name}'s fee paid` })
  await expect(paid.getByLabel('Amount excl. VAT (€)')).toHaveValue(/^300/)
  await expectAccessible(page)
  await paid.getByRole('button', { name: 'Mark paid' }).click()
  await expect(paid).toBeHidden({ timeout: 20_000 })
  await expect(labour.getByRole('button', { name: `Paid: ${crew.name}` })).toBeVisible({ timeout: 20_000 })
  await expect(labour).toContainText('Paid on')
  // The expense linked to the fee
  const linked = ok('Reading the linked expense', await account.client.from('expenses').select('status, paid_on, amount_net').eq('gig_id', gig.id).eq('crew_fee_user_id', crew.id))
  expect(linked).toHaveLength(1)
  expect(Number(linked[0].amount_net)).toBe(300)
  // Crew to pay no longer lists it
  await page.goto(`${org.path}/expenses`)
  await page.getByRole('tab', { name: 'Crew to pay' }).click()
  await expect(page.getByRole('region', { name: 'Crew to pay' })).not.toContainText(gig.name, { timeout: 20_000 })

  // Crew: told without the amount; the gig shows Paid on; received and back
  const told = ok('Reading crew notifications', await crew.client.from('notifications').select('kind, details').order('created_at', { ascending: false }).limit(10))
  const paidNote = told.find(n => n.details?.gig_id === gig.id)
  expect(paidNote, 'crew are told the fee was paid').toBeTruthy()
  expect(JSON.stringify(paidNote.details)).not.toContain('300')
  const crewPage = await pageAs(browser, crew, { baseURL })
  try {
    await crewTab(crewPage, gig)
    const fee = crewPage.getByText('Your fee for this gig').locator('..')
    await expect(fee).toContainText('Paid on', { timeout: 20_000 })
    await fee.getByRole('button', { name: 'Mark received' }).click()
    await expect(fee.getByRole('button', { name: 'Not received' })).toBeVisible()
    await fee.getByRole('button', { name: 'Not received' }).click()
    await expect(fee.getByRole('button', { name: 'Mark received' })).toBeVisible()

    // My numbers: the tiles
    await crewPage.goto('/me/numbers')
    await expect(crewPage.getByRole('heading', { name: 'My numbers' })).toBeVisible({ timeout: 20_000 })
    await expect(crewPage.getByText('Earned').first()).toBeVisible()
    await expect(crewPage.getByText('Not yet paid').first()).toBeVisible()
    await expectAccessible(crewPage)
  } finally {
    await crewPage.context().close()
  }
})

// covers: T85 (a member who manages no gig)
test('crew to pay: a member who manages no gig sees an empty list', { tag: TAG }, async ({ member }) => {
  const { page, org } = member
  await page.goto(`${org.path}/expenses`)
  await page.getByRole('tab', { name: 'Crew to pay' }).click()
  await expect(page.getByText('Nobody waiting to be paid')).toBeVisible({ timeout: 20_000 })
})

// covers: T70 (Portuguese wording)
test('leave in Portuguese', { tag: TAG }, async ({ browser, baseURL, world }) => {
  const [account, org] = await Promise.all([world.member(), world.org()])
  await readBell(account)
  const page = await pageAs(browser, account, { baseURL, lang: 'pt' })
  try {
    await page.goto(`${org.path}/leave`)
    await page.getByRole('button', { name: 'Pedir ausência' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAccessible(page)
  } finally {
    await page.context().close()
  }
})



// covers: T55, T69, T70, T71 (the organisation export has their files)
test('the organisation export has the rates, fees, hours, holidays, leave and expenses files', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  await readBell(account)
  const fn = `Export rate ${uniq()}`
  ok('Adding a rate', await account.client.from('crew_rates').insert({ org_id: org.id, function_title: fn, day_rate: 123 }))
  await page.goto(`${org.path}?panel=settings`)
  const button = page.getByRole('button', { name: 'Download everything (zip)' })
  await expect(button).toBeVisible({ timeout: 20_000 })
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), button.click()])
  const files = await readZip(download)
  const named = part => Object.keys(files).find(f => f.endsWith(`-${part}.csv`))
  const parts = ['crew-rates', 'crew-rate-factors', 'gig-crew-fees', 'org-holidays', 'time-entries', 'leave', 'leave-settings',
    'work-weeks', 'leave-years', 'expense-categories', 'expenses', 'expense-recurrences']
  expect(parts.filter(p => !named(p)), `missing from the zip (it has: ${Object.keys(files).join(', ')})`).toEqual([])
  expect(zipText(files, named('crew-rates'))).toContain(fn)
})

// Not about hours: found while writing these tests. From ten unread notifications the bell shows
// "9+", but its accessible name says "10 unread notifications", so the visible text isn't part of
// its name (axe: label-content-name-mismatch, serious). Issue #209. The browser is given ten
// unread notifications (a stand-in answer; the database doesn't change). Remove test.fail() once fixed.
// covers: none (an app bug found by T69–T71's accessibility checks)
test('the bell with ten unread notifications is accessible', { tag: TAG }, async ({ member }) => {
  test.fail(true, 'Issue #209: the bell shows "9+" but its name is "10 unread notifications"')
  const { page, org, account } = member
  await page.route(/\/rest\/v1\/notifications\?/, async route => {
    if (route.request().method() !== 'GET') return route.continue()
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, user_id: account.id, org_id: org.id, actor_id: null,
      kind: 'fee_paid', details: {}, read_at: null, created_at: new Date(Date.now() - i * 60e3).toISOString(),
    }))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.goto(org.path)
  await expect(page.getByRole('button', { name: '10 unread notifications' })).toBeVisible({ timeout: 20_000 })
  await expectAccessible(page)
})

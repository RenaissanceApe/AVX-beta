import { test, expect } from '@playwright/test'
import { RUN, PASSWORD } from './accounts.js'
import AxeBuilder from '@axe-core/playwright'

// Signed-in journeys against the Supabase TEST project (never production).
// Run with E2E_AUTH=1 and the test project's URL/key — see docs/TESTING.md.
// Each run signs up brand-new users and deletes them at the end, so runs don't
// depend on each other and the test project doesn't fill up. If a test fails before that,
// CI's sweep step deletes what this run made (scripts/e2e-sweep.mjs).

// The run tag and password are shared with the sweep step (accounts.js, scripts/e2e-sweep.mjs)
const run = RUN
const pm = { name: `E2E PM ${run}`, email: `e2e-pm-${run}@example.com` }
const tech = { name: `E2E Tech ${run}`, email: `e2e-tech-${run}@example.com` }
// Invited by email before having an account
const newbie = { name: `E2E Newbie ${run}`, email: `e2e-newbie-${run}@example.com` }
const ORG = `E2E Org ${run}`
const GIG = `E2E Gig ${run}`
// After signing in you land in your workspace: My work, or an organisation
const HOME = /\/(me|org\/[0-9a-f-]{36})$/

test.describe.configure({ mode: 'serial' })

async function english(page) {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
}

async function signUp(page, who) {
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Create Account' }).first().click()
  await page.getByPlaceholder('João Silva').fill(who.name)
  await page.getByPlaceholder('you@company.com').fill(who.email)
  await page.getByPlaceholder('At least 8 characters').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click()
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
}

async function signIn(page, who) {
  await page.goto('/auth')
  await page.getByPlaceholder('you@company.com').fill(who.email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
}

// No serious accessibility problems on the page as it is now (docs/HELP.md, H1)
async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

// A report view has finished loading: no loading sign left, and no "couldn't be loaded" message.
// The report functions are heavy for the small test database, so the journey lets each view
// finish before opening the next instead of stacking their calls (which ran into its 8 s limit).
// A report that hits a slow moment on the test database tries once more by itself (selectReport
// in src/lib/selectAll.js), so the wait allows two slow requests; a failure that repeats still
// shows "couldn't be loaded" and fails the test.
async function reportLoaded(page) {
  await expect(page.getByRole('status', { name: 'Loading', exact: true })).toHaveCount(0, { timeout: 45_000 })
  await expect(page.getByText("The report couldn't be loaded. Try again in a moment.")).toHaveCount(0)
}

async function deleteAccount(page) {
  await page.goto('/dashboard')
  // Desktop: the avatar in the top bar. Phones have no avatar (two icons at most, DESIGN.md
  // "PhoneTabBar"): Account is in the More sheet
  await expect(page.locator('.shell-bar')).toBeVisible({ timeout: 15_000 })
  const avatar = page.getByRole('button', { name: /— Account$/ })
  if (await avatar.isVisible()) await avatar.click()
  else {
    await page.locator('.shell-tabs').getByRole('button', { name: 'More' }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Account' }).click()
  }
  await expect(page).toHaveURL(/\/settings/)
  await page.getByRole('link', { name: 'Your data' }).click()
  page.once('dialog', dialog => dialog.accept('DELETE'))
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page).toHaveURL(/\/auth$/, { timeout: 15_000 })
}

let gigUrl

test('a new user sets up an organisation, a gig and a schedule', async ({ page }) => {
  await english(page)
  await signUp(page, pm)

  await page.getByRole('button', { name: 'Create Organisation' }).first().click()
  const orgDialog = page.getByRole('dialog', { name: 'New Organisation' })
  await orgDialog.getByPlaceholder('e.g. SoundWorks Lisboa').fill(ORG)
  await orgDialog.getByRole('button', { name: 'Create Organisation' }).click()
  await expect(page.getByText(ORG).first()).toBeVisible()

  await page.getByRole('button', { name: /Create First Gig|New Gig/ }).first().click()
  const gigDialog = page.getByRole('dialog', { name: 'New Gig' })
  await gigDialog.getByPlaceholder(/Festival NOS Alive/).fill(GIG)
  await gigDialog.getByPlaceholder(/Passeio Marítimo/).fill('E2E Arena')
  await gigDialog.getByRole('button', { name: 'Create Gig' }).click()
  await expect(page).toHaveURL(/\/gig\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  gigUrl = new URL(page.url()).pathname
  await expect(page.getByRole('heading', { name: GIG })).toBeVisible()

  await page.getByRole('tab', { name: /Schedule/ }).click()
  await page.getByRole('button', { name: 'Add item' }).first().click()
  const item = page.getByRole('dialog', { name: 'Add schedule item' })
  await item.getByLabel(/What/).fill('Load-in')
  await item.getByLabel(/Day/).fill(new Date().toISOString().slice(0, 10))
  await item.getByLabel(/Start/).fill('08:00')
  await item.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Load-in')).toBeVisible()
})

test('the organisation builds a quote, saves it as a template and prints it', async ({ page }) => {
  await english(page)
  await signIn(page, pm)
  // Signing in opens the organisation (where they're admin); Quotes is a section menu
  await expect(page.getByTitle(/Workspace: E2E Org/)).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Quotes' }).click()
  await page.getByRole('link', { name: /^Quotes/ }).first().click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}\/quotes$/)
  await page.getByRole('button', { name: 'New quote' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New quote' })
  await dialog.getByPlaceholder(/Annual conference/).fill(`E2E Quote ${run}`)
  await dialog.getByRole('button', { name: 'Create quote' }).click()
  await expect(page).toHaveURL(/\/quote\/[0-9a-f-]{36}$/, { timeout: 15_000 })

  // One rental line: 2 × €100 = €200 excl. VAT, €246 with 23% VAT
  await page.getByRole('button', { name: 'Rental' }).first().click()
  const line = page.locator('.q-line-wrap').last()
  await line.getByPlaceholder(/Line array system/).fill('PA system')
  await line.getByRole('spinbutton', { name: 'Qty' }).fill('2')
  await line.getByRole('spinbutton', { name: 'Unit price' }).fill('100')
  await expect(page.locator('footer')).toContainText('€200.00')
  await expect(page.getByRole('status').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Save as template' }).click()
  await page.getByRole('dialog', { name: 'Save as template' }).getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText(/Template ".*" saved/)).toBeVisible()

  await page.getByRole('button', { name: /Preview/ }).click()
  await expect(page).toHaveURL(/\/print$/)
  await expect(page.getByRole('heading', { name: `E2E Quote ${run}` })).toBeVisible()
  await expect(page.locator('.totals')).toContainText('€246.00')
})

test('a gig opened before stays readable offline', async ({ page, context }) => {
  await english(page)
  await signIn(page, pm)
  await page.goto(gigUrl)
  await expect(page.getByRole('heading', { name: GIG })).toBeVisible()
  // The service worker must control the page before the app shell can load offline
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
    }
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: /offline|saved copy/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: GIG })).toBeVisible()
  await context.setOffline(false)
})

test('adding an existing user to a gig notifies them', async ({ browser }) => {
  // The technician signs up in their own browser
  const techContext = await browser.newContext()
  const techPage = await techContext.newPage()
  await english(techPage)
  await signUp(techPage, tech)

  // The PM adds them to the gig
  const pmContext = await browser.newContext()
  const pmPage = await pmContext.newPage()
  await english(pmPage)
  await signIn(pmPage, pm)
  await pmPage.goto(gigUrl)
  await pmPage.getByRole('tab', { name: /Crew/ }).click()
  await pmPage.getByRole('button', { name: 'Invite crew' }).first().click()
  const invite = pmPage.getByRole('dialog')
  await invite.getByPlaceholder('technician@company.com').fill(tech.email)
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  // First match: the name is also in the gig's labour cost below the crew list
  await expect(pmPage.getByText(tech.name).first()).toBeVisible({ timeout: 15_000 })

  // The technician sees it in the bell (live, or after a reload), on a phone-sized screen: the
  // panel must stay inside the screen (it used to spill off the left edge on phones)
  await techPage.setViewportSize({ width: 390, height: 844 })
  await techPage.reload()
  await expect(techPage.getByRole('button', { name: /1 unread notification/ })).toBeVisible({ timeout: 15_000 })
  await techPage.getByRole('button', { name: /1 unread notification/ }).click()
  await expect(techPage.getByText(new RegExp(`added you to ${GIG}`))).toBeVisible()
  const panel = await techPage.getByRole('dialog', { name: 'Notifications' }).boundingBox()
  expect(panel.x).toBeGreaterThanOrEqual(0)
  expect(panel.x + panel.width).toBeLessThanOrEqual(390)

  // Clean up the technician now; the PM is removed in the last test
  await deleteAccount(techPage)
  await techContext.close()
  await pmContext.close()
})

test('a PM uploads a file and then a new version of it', async ({ page }) => {
  await english(page)
  await signIn(page, pm)
  await page.goto(gigUrl)
  await expect(page.getByRole('tab', { name: /Assets/ })).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('tab', { name: /Assets/ }).click()
  const upload = async (text) => {
    await page.getByRole('button', { name: /Upload (first )?asset/ }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Upload asset' })
    await dialog.getByLabel(/Asset name/).fill('E2E Patch')
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'patch.txt', mimeType: 'text/plain', buffer: Buffer.from(text) })
    await dialog.getByRole('button', { name: 'Upload asset' }).click()
  }
  await upload('ch1 kick')
  await expect(page.getByText('Uploaded "E2E Patch".')).toBeVisible({ timeout: 15_000 })
  await upload('ch1 kick\nch2 snare')
  await expect(page.getByText('Uploaded version 2 of "E2E Patch".')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Open · history/ })).toBeVisible()
})

test('someone invited by email before having an account joins the gig on sign-up', async ({ browser }) => {
  // The PM invites an address with no account yet: it waits as a pending invite
  const pmContext = await browser.newContext()
  const pmPage = await pmContext.newPage()
  await english(pmPage)
  await signIn(pmPage, pm)
  await pmPage.goto(gigUrl)
  await pmPage.getByRole('tab', { name: /Crew/ }).click()
  await pmPage.getByRole('button', { name: 'Invite crew' }).first().click()
  const invite = pmPage.getByRole('dialog')
  await invite.getByPlaceholder('technician@company.com').fill(newbie.email)
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  await expect(pmPage.getByText('Pending — waiting for sign-up')).toBeVisible({ timeout: 15_000 })
  await expect(pmPage.getByText(newbie.email, { exact: true })).toBeVisible()

  // They sign up with that address and find the gig waiting for them
  const newContext = await browser.newContext()
  const newPage = await newContext.newPage()
  await english(newPage)
  await signUp(newPage, newbie)
  await expect(newPage.getByText(GIG).first()).toBeVisible({ timeout: 15_000 })

  // …and the PM sees them on the crew list instead of the pending invite
  await pmPage.reload()
  await pmPage.getByRole('tab', { name: /Crew/ }).click()
  await expect(pmPage.getByText(newbie.name).first()).toBeVisible({ timeout: 15_000 })

  await deleteAccount(newPage)
  await newContext.close()
  await pmContext.close()
})

test('an admin asks for leave, approves it and sees it as approved', async ({ page }) => {
  await english(page)
  await signIn(page, pm)
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  await page.goto(`${page.url()}/leave`)
  await expect(page.getByRole('heading', { level: 1, name: /^Leave\b/ })).toBeVisible()
  await expectAccessible(page)
  const from = new Date(Date.now() + 40 * 86400e3).toISOString().slice(0, 10)
  await page.getByRole('button', { name: 'Ask for leave' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#leave-type').selectOption('holiday')
  await dialog.getByLabel('From', { exact: true }).fill(from)
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Send request' }).click()
  const waiting = page.locator('section[aria-labelledby="leave-requests"]')
  await expect(waiting.getByText('1 request waiting for you')).toBeVisible({ timeout: 15_000 })
  await waiting.getByRole('button', { name: 'Approve' }).click()
  await expect(waiting).toHaveCount(0)
  await expect(page.locator('section[aria-labelledby="leave-mine"]').getByText('Approved', { exact: true })).toBeVisible()
})

test('crew numbers: My numbers, the year statement and Crew to pay open and are accessible', async ({ page }) => {
  await english(page)
  await signIn(page, pm)
  // K8: My numbers and the year statement (the PM has no fees: empty states)
  await page.goto('/me/numbers')
  await expect(page.getByRole('heading', { name: 'My numbers' })).toBeVisible()
  await expect(page.getByText(/^(No gigs this year|Earned)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('link', { name: 'Year statement (CSV, print)' }).click()
  await expect(page).toHaveURL(/\/me\/numbers\/statement/)
  await expect(page.getByRole('heading', { name: /^Year statement \d{4}/ })).toBeVisible()
  await expect(page.getByText(/^(Nothing to show for this year|Per month)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  // Expenses → Crew to pay
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  await page.goto(`${page.url()}/expenses?view=crew`)
  await expect(page.getByRole('heading', { name: 'Crew to pay' })).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
})

test('an admin reads the reports: overview tiles, revenue with details, and the key numbers at home', async ({ page }) => {
  // Many report views in one test, each of which may wait for one retry on a slow database
  test.slow()
  await english(page)
  await signIn(page, pm)
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  const home = page.url()
  // The key numbers on the organisation's Home; hidden and shown again with Arrange home
  const strip = page.locator('section[aria-labelledby="key-numbers"]')
  await expect(strip.getByText('Gigs this month', { exact: true })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Arrange home' }).click()
  const sheet = page.getByRole('dialog', { name: 'Arrange home' })
  await expectAccessible(page)
  await sheet.getByRole('switch', { name: 'Show Key numbers' }).click()
  await expect(strip).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Back to the standard' }).click()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  // Shown again, it reloads the key numbers: let them arrive before Reports loads its own copy
  await expect(strip.getByText('Gigs this month', { exact: true })).toBeVisible({ timeout: 30_000 })
  await strip.getByRole('link', { name: 'All reports' }).click()
  await expect(page).toHaveURL(/\/reports$/)
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible()
  await expect(page.getByText('Equipment use, last 90 days')).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Revenue', exact: true }).click()
  await expect(page).toHaveURL(/tab=revenue/)
  await reportLoaded(page)
  await page.locator('#rp-period').selectOption('last_12_months')
  await expect(page.getByText('Net revenue', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Show details').check()
  await expect(page.locator('#rp-group')).toBeVisible()
  await expectAccessible(page)
  // Step 10: the gig margins report, with its table once details are on
  await page.getByRole('button', { name: 'Gig margins', exact: true }).click()
  await expect(page).toHaveURL(/tab=margins/)
  await reportLoaded(page)
  await expect(page.getByText('Gigs with a negative margin')).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  // K2: Reports → Money, its three views (results, margins, labour)
  await page.getByRole('button', { name: 'Money', exact: true }).click()
  await expect(page).toHaveURL(/tab=money/)
  await reportLoaded(page)
  await page.locator('#rp-period').selectOption('this_year')
  await expect(page.getByText(/^(Operating result|No money in this period yet)$/).first()).toBeVisible({ timeout: 15_000 })
  await reportLoaded(page)
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Margins', exact: true }).click()
  await expect(page).toHaveURL(/view=margins/)
  await reportLoaded(page)
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Labour', exact: true }).click()
  await expect(page).toHaveURL(/view=labour/)
  await reportLoaded(page)
  await expectAccessible(page)
  // K3: cash, spending and forecast (with budgets and targets)
  await page.getByRole('button', { name: 'Cash', exact: true }).click()
  await expect(page).toHaveURL(/view=cash/)
  await reportLoaded(page)
  await expect(page.getByText(/^(Cash position, next 3 months|No invoices or expenses yet)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Spending', exact: true }).click()
  await expect(page).toHaveURL(/view=spending/)
  await reportLoaded(page)
  await expect(page.getByText(/^(Spent in this period|No expenses in this period)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Forecast', exact: true }).click()
  await expect(page).toHaveURL(/view=forecast/)
  await reportLoaded(page)
  await expect(page.getByRole('heading', { name: 'Budgets and targets' })).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  // K4: Reports → Sales, its three views (waiting, win rate, clients)
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await expect(page).toHaveURL(/tab=sales/)
  await reportLoaded(page)
  await expect(page.getByText(/^(Waiting for an answer|No quotes waiting for an answer)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Win rate', exact: true }).click()
  await expect(page).toHaveURL(/view=winrate/)
  await reportLoaded(page)
  await expect(page.getByText(/^(Win rate \(by count\)|No quotes decided in this period)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await expect(page).toHaveURL(/view=clients/)
  await reportLoaded(page)
  await expect(page.getByText(/^(What the top 5 clients bring|No client work in this period)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  // K5: Reports → Equipment (profit with its purchase-cost coverage, payback, buy or hire in)
  await page.getByRole('button', { name: 'Equipment', exact: true }).click()
  await expect(page).toHaveURL(/tab=equipment/)
  await reportLoaded(page)
  await expect(page.getByRole('heading', { name: 'Purchase costs' })).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Payback', exact: true }).click()
  await expect(page).toHaveURL(/view=payback/)
  await reportLoaded(page)
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Buy or hire in', exact: true }).click()
  await expect(page).toHaveURL(/view=buy/)
  await reportLoaded(page)
  await expectAccessible(page)
  // K6: Reports → Warehouse, its four views (demand, suppliers, damage and loss, dispatch)
  await page.getByRole('button', { name: 'Warehouse', exact: true }).click()
  await expect(page).toHaveURL(/tab=warehouse/)
  await reportLoaded(page)
  await expect(page.getByText(/^(Items over stock|No stock items yet)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  for (const [view, ready] of [['Suppliers', /^(Requests|No hire requests in this period)$/], ['Damage and loss', /^(Repairs|No damage, loss or inspections)$/], ['Dispatch', /^(Scanned out|No gear planned or scanned)$/]]) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await reportLoaded(page)
    await expect(page.getByText(ready).first()).toBeVisible({ timeout: 15_000 })
    await expectAccessible(page)
  }
  // K7: Reports → Operations, its four views (the PM is the organisation's admin: per-person rows too)
  await page.getByRole('button', { name: 'Operations', exact: true }).click()
  await expect(page).toHaveURL(/tab=operations/)
  await reportLoaded(page)
  await expect(page.getByText(/^(Gig days|No gigs in this period)$/).first()).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  for (const [view, ready] of [['People', /^(Crew days|No crew days or hours in this period)$/], ['Staffing', /^(Positions open|No positions or crew calls in this period)$/], ['Tasks', /^(Open tasks|No tasks open or done in this period)$/]]) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await reportLoaded(page)
    await expect(page.getByText(ready).first()).toBeVisible({ timeout: 15_000 })
    await expectAccessible(page)
  }
  await page.goto(home)
})

test('an admin saves a report view, sees the monthly pack and the accountant links, and finds the weekly email setting', async ({ page }) => {
  test.slow()
  await english(page)
  await signIn(page, pm)
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  const home = page.url()
  // K9: save Money for this year as a view, pinned to the Overview
  await page.goto(`${home}/reports?tab=money&period=this_year`)
  await reportLoaded(page)
  await page.getByRole('button', { name: 'Save this view' }).click()
  const dialog = page.getByRole('dialog', { name: 'Save this view' })
  await dialog.getByLabel('Name').fill('E2E money this year')
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  const views = page.locator('section[aria-labelledby="rp-views"]')
  await expect(views.getByRole('link', { name: /E2E money this year/ }).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Monthly management pack' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Links for your accountant' })).toBeVisible()
  await expectAccessible(page)
  // The saved view opens the report with its filters
  await views.getByRole('link', { name: /E2E money this year/ }).first().click()
  await expect(page).toHaveURL(/tab=money&period=this_year/)
  // Remove it again (the test runs against a shared project)
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await views.getByRole('button', { name: /^Manage \d+ views?$/ }).click()
  const manage = page.getByRole('dialog', { name: 'Saved views' })
  await expectAccessible(page)
  while (await manage.getByRole('button', { name: 'Remove: E2E money this year' }).count()) {
    await manage.getByRole('button', { name: 'Remove: E2E money this year' }).first().click()
  }
  // Settings → Notifications: the weekly key numbers, for admins (left as it is)
  await page.goto('/settings/notifications')
  await expect(page.getByText('Weekly key numbers (admins)')).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
})

test('the logo goes home and the workspace switcher lists My work and the organisation', async ({ page }) => {
  await english(page)
  await signIn(page, pm)
  await page.goto(gigUrl)
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(HOME)
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: /My work/ }).click()
  await expect(page).toHaveURL(/\/me$/)
  // The PM created the gig, so it is one of their own gigs, labelled with the company and their role
  // (15 s like the other home checks: the test project can be slow to answer, #114)
  await expect(page.getByText(GIG).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(ORG).first()).toBeVisible({ timeout: 15_000 })
})

test('the user can delete their account and everything they created', async ({ page }) => {
  await english(page)
  await signIn(page, pm)
  await deleteAccount(page)
  // Signing in again fails: the account is gone
  await page.getByPlaceholder('you@company.com').fill(pm.email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
  await expect(page.getByText(/Wrong email or password/)).toBeVisible()
})

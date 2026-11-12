import { test, expect } from '@playwright/test'
import { RUN, PASSWORD, recordAccount } from './accounts.js'
import { journeyAccount, signInPage, pageAs } from './setup.js'
import { HOME, english, signUp, signIn, expectAccessible, reportLoaded, changePeriod, deleteAccount, waitForServiceWorker } from './helpers.js'

// Signed-in journeys against the Supabase TEST project (never production).
// Run with E2E_AUTH=1 and the test project's URL/key — see docs/TESTING.md.
// Each run signs up brand-new users and deletes them at the end, so runs don't
// depend on each other and the test project doesn't fill up. If a test fails before that,
// CI's sweep step deletes what this run made (scripts/e2e-sweep.mjs).
// The PM signs up through the form once (the first test) and signs in through it once (the last);
// every other test reuses one API sign-in (signInPage, pageAs), so a run stays well inside the
// test project's sign-in limit.

// The run tag and password are shared with the sweep step (accounts.js, scripts/e2e-sweep.mjs)
const run = RUN
const pm = { role: 'pm', name: `E2E PM ${run}`, email: `e2e-pm-${run}@example.com` }
const tech = { role: 'tech', name: `E2E Tech ${run}`, email: `e2e-tech-${run}@example.com` }
// Invited by email before having an account
const newbie = { role: 'newbie', name: `E2E Newbie ${run}`, email: `e2e-newbie-${run}@example.com` }
const ORG = `E2E Org ${run}`
const GIG = `E2E Gig ${run}`

test.describe.configure({ mode: 'serial' })

// Three of its steps are in the pull requests' smoke run (@smoke: the form sign-up with a gig, a crew
// step and the form sign-in that deletes the account); all of it runs every night (docs/TESTING.md).
// Not indented, to keep its history readable.
test.describe('signed-in journey', () => {

// Every Overview tile loaded: one that couldn't (its source failed) says so instead of a number
const tileFailed = "Couldn't load this number. Try again in a moment."

let gigUrl

test('a new user sets up an organisation, a gig and a schedule', { tag: '@smoke' }, async ({ page }) => {
  await english(page)
  recordAccount('pm')
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
  await signInPage(page, await journeyAccount(pm))
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

  // DR4: past Send, Preview and the gig, the quote's actions are in its ⋯ menu
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Save as template' }).click()
  await page.getByRole('dialog', { name: 'Save as template' }).getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText(/Template ".*" saved/)).toBeVisible()

  await page.getByRole('button', { name: /Preview/ }).click()
  await expect(page).toHaveURL(/\/print$/)
  await expect(page.getByRole('heading', { name: `E2E Quote ${run}` })).toBeVisible()
  await expect(page.locator('.totals')).toContainText('€246.00')
})

// Quote bin (issue 124): Delete moves a quote to Recently deleted, where it can be restored
test('a deleted quote waits in Recently deleted and can be restored', async ({ page }) => {
  const title = `E2E Bin ${run}`
  await english(page)
  await signInPage(page, await journeyAccount(pm))
  await page.getByRole('button', { name: 'Quotes' }).click()
  await page.getByRole('link', { name: /^Quotes/ }).first().click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}\/quotes$/)
  await page.getByRole('button', { name: 'New quote' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New quote' })
  await dialog.getByPlaceholder(/Annual conference/).fill(title)
  await dialog.getByRole('button', { name: 'Create quote' }).click()
  await expect(page).toHaveURL(/\/quote\/[0-9a-f-]{36}$/, { timeout: 15_000 })

  // Delete: a browser confirm, then back to the list without it
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByText('Quote moved to Recently deleted.')).toBeVisible()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}\/quotes$/)
  await expect(page.getByRole('button', { name: new RegExp(title) })).toHaveCount(0)

  // It's in Recently deleted, with the date it will be erased
  await page.getByRole('button', { name: 'Recently deleted' }).click()
  await expect(page).toHaveURL(/tab=bin/)
  const bin = page.getByRole('list', { name: 'Recently deleted' })
  await expect(bin.getByText(title)).toBeVisible({ timeout: 15_000 })
  await expect(bin.getByText(/Erased for good on/)).toBeVisible()
  await expectAccessible(page)

  // Restore: it leaves the bin and is back in the list
  await bin.getByRole('button', { name: new RegExp(`^Restore .*${title}`) }).click()
  await expect(page.getByText('Quote restored.')).toBeVisible()
  await expect(page.getByText('Nothing in Recently deleted')).toBeVisible()
  await page.getByRole('button', { name: 'Back to quotes' }).click()
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible()

  // Only a draft can be deleted: once sent, the ⋯ menu offers Cancel quote instead of Delete
  await page.getByRole('button', { name: new RegExp(title) }).click()
  await expect(page).toHaveURL(/\/quote\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  await page.getByRole('combobox', { name: 'Status' }).selectOption('sent')
  await expect(page.getByRole('status').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
  page.once('dialog', d => d.accept())
  await page.getByRole('menuitem', { name: 'Cancel quote' }).click()
  await expect(page.getByText('Quote cancelled.')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Status' })).toHaveValue('cancelled')
  // It stays in the list, shown as Cancelled
  await page.getByRole('button', { name: 'Back to quotes' }).click()
  await expect(page.getByRole('button', { name: new RegExp(title) })).toContainText('Cancelled')
})

test('a gig opened before stays readable offline', async ({ page, context }) => {
  await english(page)
  await signInPage(page, await journeyAccount(pm))
  await page.goto(gigUrl)
  await expect(page.getByRole('heading', { name: GIG })).toBeVisible()
  // The service worker must control the page before the app shell can load offline (its own
  // bounded wait, with one reload if it doesn't take over: #206)
  await waitForServiceWorker(page)
  await expect(page.getByRole('heading', { name: GIG })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: /offline|saved copy/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: GIG })).toBeVisible()
  await context.setOffline(false)
})

test('adding an existing user to a gig notifies them', { tag: '@smoke' }, async ({ browser, baseURL }) => {
  // The technician has an account (made through the API) and is signed in in their own browser
  const techPage = await pageAs(browser, await journeyAccount(tech, { create: true }), { baseURL })
  const techContext = techPage.context()
  await english(techPage)
  await techPage.goto('/dashboard')
  await expect(techPage).toHaveURL(HOME, { timeout: 15_000 })

  // The PM adds them to the gig
  const pmPage = await pageAs(browser, await journeyAccount(pm), { baseURL })
  const pmContext = pmPage.context()
  await english(pmPage)
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
  await signInPage(page, await journeyAccount(pm))
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

test('someone invited by email before having an account joins the gig on sign-up', async ({ browser, baseURL }) => {
  // The PM invites an address with no account yet: it waits as a pending invite
  const pmPage = await pageAs(browser, await journeyAccount(pm), { baseURL })
  const pmContext = pmPage.context()
  await english(pmPage)
  await pmPage.goto(gigUrl)
  await pmPage.getByRole('tab', { name: /Crew/ }).click()
  await pmPage.getByRole('button', { name: 'Invite crew' }).first().click()
  const invite = pmPage.getByRole('dialog')
  await invite.getByPlaceholder('technician@company.com').fill(newbie.email)
  await invite.getByRole('button', { name: 'Add to gig' }).click()
  await expect(pmPage.getByText('Pending — waiting for sign-up')).toBeVisible({ timeout: 15_000 })
  await expect(pmPage.getByText(newbie.email, { exact: true })).toBeVisible()

  // They sign up with that address (through the API: the gig is claimed by the database on sign-up)
  // and find the gig waiting for them
  const newPage = await pageAs(browser, await journeyAccount(newbie, { create: true }), { baseURL })
  const newContext = newPage.context()
  await english(newPage)
  await newPage.goto('/dashboard')
  await expect(newPage).toHaveURL(HOME, { timeout: 15_000 })
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
  await signInPage(page, await journeyAccount(pm))
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  await page.goto(`${page.url()}/leave`)
  await expect(page.getByRole('heading', { name: 'Leave', exact: true })).toBeVisible()
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

test('an admin plans a site visit, finds it in My work and the calendar, and cancels it', async ({ page }) => {
  await english(page)
  await signInPage(page, await journeyAccount(pm))
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  const orgUrl = page.url()
  await page.goto(`${orgUrl}/appointments`)
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible()
  await expect(page.getByText('No appointments coming up')).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)

  // Today, so it's in this month's calendar (it may already be past: it's listed either way)
  const day = new Date().toISOString().slice(0, 10)
  const title = `Venue walk ${run}`
  await page.getByRole('button', { name: 'New appointment' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#appt-kind').selectOption('site_visit')
  await dialog.getByLabel('Title', { exact: true }).fill(title)
  await dialog.getByLabel('Place', { exact: true }).fill('Coliseu')
  await dialog.getByLabel('Day', { exact: true }).fill(day)
  await dialog.getByLabel('From', { exact: true }).fill('10:00')
  await dialog.getByLabel('Until', { exact: true }).fill('11:30')
  await dialog.getByLabel(pm.name).check()
  await expectAccessible(page)
  await dialog.getByRole('button', { name: 'Add appointment' }).click()
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 })

  // Invited, so it's in My work and in the calendar
  await page.goto('/me/appointments')
  await expect(page.getByRole('button', { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 })
  await page.goto(`${orgUrl}?view=calendar`)
  await expect(page.getByTitle(new RegExp(`${title} · Site visit`)).first()).toBeAttached({ timeout: 15_000 })

  // Cancel it: it leaves the list
  await page.goto(`${orgUrl}/appointments`)
  await page.getByRole('button', { name: new RegExp(title) }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel appointment' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, cancel it' }).click()
  await expect(page.getByText('No appointments coming up')).toBeVisible({ timeout: 15_000 })
})

test('an admin adds a vehicle, records a licence and plans a trip with the licence warning', async ({ page }) => {
  await english(page)
  await signInPage(page, await journeyAccount(pm))
  // Settings → Profile: licence B only
  await page.goto('/settings/profile')
  await page.getByRole('checkbox', { name: 'B', exact: true }).check()
  await page.getByRole('button', { name: 'Save licence' }).click()
  await expect(page.getByText('Licence categories saved.')).toBeVisible()

  // Inventory → Vehicles: a truck that needs C1
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  await page.goto(`${page.url()}/inventory?tab=vehicles`)
  await expect(page.getByText('No vehicles yet')).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Add vehicle' }).first().click()
  const vehicle = page.getByRole('dialog', { name: 'Add vehicle' })
  await vehicle.getByLabel('Name').fill('E2E Truck')
  await vehicle.getByLabel('Plate').fill('12-ab-34')
  await vehicle.getByLabel('Licence needed', { exact: true }).selectOption('C1')
  await vehicle.getByLabel('Max load (kg)', { exact: true }).fill('3500')
  await expectAccessible(page)
  await vehicle.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('E2E Truck')).toBeVisible()
  await expect(page.getByText(/12-AB-34/)).toBeVisible()

  // Gig → Transport: the PM drives the truck; the licence warning waits for "I've checked"
  await page.goto(gigUrl)
  await page.getByRole('tab', { name: /Transport/ }).click()
  await expect(page.getByText('No trips yet')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Add trip' }).first().click()
  const trip = page.getByRole('dialog', { name: 'Add trip' })
  await trip.getByLabel('Vehicle', { exact: true }).selectOption({ label: 'E2E Truck · 12-AB-34 · C1' })
  await trip.getByLabel('Driver', { exact: true }).selectOption({ label: pm.name })
  await trip.getByLabel('From', { exact: true }).fill('Warehouse')
  await expect(trip.getByText(/licence doesn't include C1/)).toBeVisible({ timeout: 15_000 })
  await expect(trip.getByRole('button', { name: 'Save trip' })).toBeDisabled()
  await expectAccessible(page)
  await trip.getByRole('checkbox', { name: /I've checked/ }).check()
  await trip.getByRole('button', { name: 'Save trip' }).click()
  await expect(page.getByText('1 trip', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/E2E Truck · 12-AB-34/).first()).toBeVisible()
  await expect(page.getByText('Licence warning checked by the planner.')).toBeVisible()
  // Step 23 (V4): the admin sees the trip's transport cost under the trips (no km and no rates yet)
  await expect(page.getByRole('heading', { name: 'Transport cost' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('1 trip has no km yet: only its days count.')).toBeVisible()
  await expectAccessible(page)

  // Reports → Vehicle use lists the truck
  const orgId = (await page.getByRole('link', { name: 'Set it in Inventory → Vehicles' }).getAttribute('href')).split('/')[2]
  await page.goto(`/org/${orgId}/reports?tab=vehicles`)
  await expect(page.getByText('Vehicle cost')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('checkbox', { name: 'Show details' }).check()
  await expect(page.getByRole('cell', { name: /E2E Truck/ })).toBeVisible()
  await expectAccessible(page)
})

test('crew numbers: My numbers, the year statement and Crew to pay open and are accessible', async ({ page }) => {
  await english(page)
  await signInPage(page, await journeyAccount(pm))
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
  await signInPage(page, await journeyAccount(pm))
  await page.getByTitle(/Workspace:/).click()
  await page.getByRole('menuitemradio', { name: new RegExp(ORG) }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/)
  const home = page.url()
  // The key numbers on the organisation's Home; hidden and shown again with Arrange home
  const strip = page.locator('section[aria-labelledby="key-numbers"]')
  await expect(strip.getByText('Gigs this month', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(strip.getByText(tileFailed)).toHaveCount(0)
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
  await expect(page.getByText(tileFailed)).toHaveCount(0)
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Revenue', exact: true }).click()
  await expect(page).toHaveURL(/tab=revenue/)
  await reportLoaded(page)
  await changePeriod(page, 'report_revenue_lines', 'last_12_months')
  await expect(page.getByText('Net revenue', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Show details').check()
  await expect(page.locator('#rp-group')).toBeVisible()
  await expectAccessible(page)
  // Step 10: the gig margins report, with its table once details are on
  await page.getByRole('button', { name: 'Gig margins', exact: true }).click()
  await expect(page).toHaveURL(/tab=margins/)
  await reportLoaded(page, page.getByText('Gigs with a negative margin'))
  await expect(page.getByText('Gigs with a negative margin')).toBeVisible()
  await expectAccessible(page)
  // K2: Reports → Money, its three views (results, margins, labour)
  await page.getByRole('button', { name: 'Money', exact: true }).click()
  await expect(page).toHaveURL(/tab=money/)
  await reportLoaded(page)
  await changePeriod(page, 'finance_results', 'this_year', page.getByText(/^(Operating result|No money in this period yet)$/).first())
  await expect(page.getByText(/^(Operating result|No money in this period yet)$/).first()).toBeVisible()
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
  await reportLoaded(page, page.getByText(/^(Cash position, next 3 months|No invoices or expenses yet)$/).first())
  await expect(page.getByText(/^(Cash position, next 3 months|No invoices or expenses yet)$/).first()).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Spending', exact: true }).click()
  await expect(page).toHaveURL(/view=spending/)
  await reportLoaded(page, page.getByText(/^(Spent in this period|No expenses in this period)$/).first())
  await expect(page.getByText(/^(Spent in this period|No expenses in this period)$/).first()).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Forecast', exact: true }).click()
  await expect(page).toHaveURL(/view=forecast/)
  await reportLoaded(page, page.getByRole('heading', { name: 'Budgets and targets' }))
  await expect(page.getByRole('heading', { name: 'Budgets and targets' })).toBeVisible()
  await expectAccessible(page)
  // K4: Reports → Sales, its three views (waiting, win rate, clients)
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await expect(page).toHaveURL(/tab=sales/)
  await reportLoaded(page, page.getByText(/^(Waiting for an answer|No quotes waiting for an answer)$/).first())
  await expect(page.getByText(/^(Waiting for an answer|No quotes waiting for an answer)$/).first()).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Win rate', exact: true }).click()
  await expect(page).toHaveURL(/view=winrate/)
  await reportLoaded(page, page.getByText(/^(Win rate \(by count\)|No quotes decided in this period)$/).first())
  await expect(page.getByText(/^(Win rate \(by count\)|No quotes decided in this period)$/).first()).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Clients', exact: true }).click()
  await expect(page).toHaveURL(/view=clients/)
  await reportLoaded(page, page.getByText(/^(What the top 5 clients bring|No client work in this period)$/).first())
  await expect(page.getByText(/^(What the top 5 clients bring|No client work in this period)$/).first()).toBeVisible()
  await expectAccessible(page)
  // K5: Reports → Equipment (profit with its purchase-cost coverage, payback, buy or hire in)
  await page.getByRole('button', { name: 'Equipment', exact: true }).click()
  await expect(page).toHaveURL(/tab=equipment/)
  await reportLoaded(page, page.getByRole('heading', { name: 'Purchase costs' }))
  await expect(page.getByRole('heading', { name: 'Purchase costs' })).toBeVisible()
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
  await reportLoaded(page, page.getByText(/^(Items over stock|No stock items yet)$/).first())
  await expect(page.getByText(/^(Items over stock|No stock items yet)$/).first()).toBeVisible()
  await expectAccessible(page)
  for (const [view, ready] of [['Suppliers', /^(Requests|No hire requests in this period)$/], ['Damage and loss', /^(Repairs|No damage, loss or inspections)$/], ['Dispatch', /^(Scanned out|No gear planned or scanned)$/]]) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await reportLoaded(page, page.getByText(ready).first())
    await expect(page.getByText(ready).first()).toBeVisible()
    await expectAccessible(page)
  }
  // K7: Reports → Operations, its four views (the PM is the organisation's admin: per-person rows too)
  await page.getByRole('button', { name: 'Operations', exact: true }).click()
  await expect(page).toHaveURL(/tab=operations/)
  await reportLoaded(page, page.getByText(/^(Gig days|No gigs in this period)$/).first())
  await expect(page.getByText(/^(Gig days|No gigs in this period)$/).first()).toBeVisible()
  await expectAccessible(page)
  for (const [view, ready] of [['People', /^(Crew days|No crew days or hours in this period)$/], ['Staffing', /^(Positions open|No positions or crew calls in this period)$/], ['Tasks', /^(Open tasks|No tasks open or done in this period)$/]]) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await reportLoaded(page, page.getByText(ready).first())
    await expect(page.getByText(ready).first()).toBeVisible()
    await expectAccessible(page)
  }
  await page.goto(home)
})

test('an admin saves a report view, sees the monthly pack and the accountant links, and finds the weekly email setting', async ({ page }) => {
  test.slow()
  await english(page)
  await signInPage(page, await journeyAccount(pm))
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

// P1: the power plan's report opens for the gig, says it's an estimate for an electrician and is
// accessible (the tool itself needs 20270106000001 run on the test project to be added to a gig)
test('the power plan report opens, labelled as an estimate', async ({ page }) => {
  await english(page)
  await signInPage(page, await journeyAccount(pm))
  await page.goto(`${gigUrl}/power`)
  await expect(page.getByRole('heading', { name: GIG })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/for a qualified electrician to check/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How these figures are worked out' })).toBeVisible()
  await expectAccessible(page)
  // P2: the distro and cable labels open, empty while the plan has no cables
  await page.goto(`${gigUrl}/power/labels`)
  await expect(page.getByText('No cables in the power plan yet.')).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
})

// U6: every print has a QR in the corner that opens the same page in AVX (the app's own
// address, so it needs a sign-in), with the date it was printed beside it
test('every print shows a QR back to the live page and the print date', async ({ page }) => {
  await english(page)
  await signInPage(page, await journeyAccount(pm))
  for (const print of ['callsheet', 'inputs', 'plot', 'patch', 'dmx', 'lights', 'system', 'power', 'packing']) {
    await page.goto(`${gigUrl}/${print}`)
    const qr = page.getByRole('img', { name: 'QR code that opens this page in AVX' })
    await expect(qr, print).toBeVisible({ timeout: 15_000 })
    await expect(qr.locator('svg'), print).toBeVisible()
    await expect(page.locator('.print-footer').getByText(/^Printed /), print).toBeVisible()
  }
  await expectAccessible(page)
})

test('the logo goes home and the workspace switcher lists My work and the organisation', async ({ page }) => {
  await english(page)
  await signInPage(page, await journeyAccount(pm))
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

// The form sign-in of the smoke run
test('the user can delete their account and everything they created', { tag: '@smoke' }, async ({ page }) => {
  await english(page)
  await signIn(page, pm)
  await deleteAccount(page)
  // Signing in again fails: the account is gone
  await page.getByPlaceholder('you@company.com').fill(pm.email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
  await expect(page.getByText(/Wrong email or password/)).toBeVisible()
})

})

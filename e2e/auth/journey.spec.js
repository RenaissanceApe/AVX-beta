import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Signed-in journeys against the Supabase TEST project (never production).
// Run with E2E_AUTH=1 and the test project's URL/key — see docs/TESTING.md.
// Each run signs up brand-new users and deletes them at the end, so runs don't
// depend on each other and the test project doesn't fill up.

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const PASSWORD = 'e2e-Password-123'
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

async function deleteAccount(page) {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /— Account$/ }).click()
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
  await expect(pmPage.getByText(tech.name)).toBeVisible({ timeout: 15_000 })

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
  await expect(page.getByText('Version 2')).toBeVisible()
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
  await expect(page.getByText(GIG).first()).toBeVisible()
  await expect(page.getByText(ORG).first()).toBeVisible()
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

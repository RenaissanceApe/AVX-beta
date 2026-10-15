import { test, expect } from '@playwright/test'

// Signed-in journeys against the Supabase TEST project (never production).
// Run with E2E_AUTH=1 and the test project's URL/key — see docs/TESTING.md.
// Each run signs up brand-new users and deletes them at the end, so runs don't
// depend on each other and the test project doesn't fill up.

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const PASSWORD = 'e2e-Password-123'
const pm = { name: `E2E PM ${run}`, email: `e2e-pm-${run}@example.com` }
const tech = { name: `E2E Tech ${run}`, email: `e2e-tech-${run}@example.com` }
const ORG = `E2E Org ${run}`
const GIG = `E2E Gig ${run}`

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
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
}

async function signIn(page, who) {
  await page.goto('/auth')
  await page.getByPlaceholder('you@company.com').fill(who.email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
}

async function deleteAccount(page) {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'Account', exact: true }).click()
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

  // The technician sees it in the bell (live, or after a reload)
  await techPage.reload()
  await expect(techPage.getByRole('button', { name: /1 unread notification/ })).toBeVisible({ timeout: 15_000 })
  await techPage.getByRole('button', { name: /1 unread notification/ }).click()
  await expect(techPage.getByText(new RegExp(`added you to ${GIG}`))).toBeVisible()

  // Clean up the technician now; the PM is removed in the last test
  await deleteAccount(techPage)
  await techContext.close()
  await pmContext.close()
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

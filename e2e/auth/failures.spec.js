import { test, expect } from '@playwright/test'

// Signing in when things go wrong, against the Supabase TEST project (never production).
// Run with E2E_AUTH=1 and the test project's URL/key — see docs/TESTING.md.
// The answers must never tell an outsider whether an email has an account, and a broken or
// expired session must send people back to sign in instead of half-loading the app.

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const PASSWORD = 'e2e-Password-123'
const user = { name: `E2E Fail ${run}`, email: `e2e-fail-${run}@example.com` }
const nobody = `e2e-nobody-${run}@example.com`
const HOME = /\/(me|org\/[0-9a-f-]{36})$/

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
})

async function trySignIn(page, email, password) {
  await page.goto('/auth')
  await page.getByPlaceholder('you@company.com').fill(email)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
}

const alertText = page => page.getByRole('alert').first().textContent()

test('set up: a user to try things against', async ({ page }) => {
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Create Account' }).first().click()
  await page.getByPlaceholder('João Silva').fill(user.name)
  await page.getByPlaceholder('you@company.com').fill(user.email)
  await page.getByPlaceholder('At least 8 characters').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click()
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
})

test('a wrong password and an unknown email get the same answer, five times over', async ({ page }) => {
  const answers = []
  for (let i = 0; i < 5; i++) {
    await trySignIn(page, user.email, `wrong-${i}-password`)
    await expect(page.getByRole('alert').first()).toContainText('Wrong email or password')
    answers.push(await alertText(page))
    await expect(page).toHaveURL(/\/auth/)
  }
  await trySignIn(page, nobody, 'whatever-password-1')
  await expect(page.getByRole('alert').first()).toContainText('Wrong email or password')
  answers.push(await alertText(page))
  expect(new Set(answers).size).toBe(1)
  // Five misses don't lock the owner out: the right password still works
  await trySignIn(page, user.email, PASSWORD)
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
})

test('a password reset and a sign-in link for an unknown email look the same as for a real one', async ({ page }) => {
  // Only unknown addresses are tried, so the test project sends no email
  await page.goto('/auth')
  await page.getByRole('button', { name: /Forgot password/ }).click()
  await page.getByPlaceholder('you@company.com').fill(nobody)
  await page.locator('form button[type=submit]').click()
  await expect(page.getByText(`If an account exists for ${nobody}`)).toBeVisible({ timeout: 15_000 })

  await page.goto('/auth')
  await page.getByRole('button', { name: /sign-in link/i }).click()
  await page.getByPlaceholder('you@company.com').fill(nobody)
  await page.locator('form button[type=submit]').click()
  await expect(page.getByText(`If ${nobody} has an AVX account`)).toBeVisible({ timeout: 15_000 })
})

test('sign-up refuses a short password and a malformed email before sending anything', async ({ page }) => {
  let signUps = 0
  page.on('request', r => { if (r.url().includes('/auth/v1/signup')) signUps++ })
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Create Account' }).first().click()
  await page.getByPlaceholder('João Silva').fill('Short Password')
  await page.getByPlaceholder('you@company.com').fill(`e2e-short-${run}@example.com`)
  const password = page.getByPlaceholder('At least 8 characters')
  await password.fill('1234567')
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click()
  expect(await password.evaluate(el => el.validity.tooShort)).toBe(true)

  const email = page.getByPlaceholder('you@company.com')
  await email.fill('not-an-email')
  await page.getByPlaceholder('At least 8 characters').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click()
  expect(await email.evaluate(el => el.validity.valid)).toBe(false)
  expect(signUps).toBe(0)
  await expect(page).toHaveURL(/\/auth/)
})

test('an expired or broken session goes back to sign-in', async ({ page }) => {
  await trySignIn(page, user.email, PASSWORD)
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
  // Break the saved session as if it had expired and its refresh token were no longer valid
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
    const session = JSON.parse(localStorage.getItem(key))
    localStorage.setItem(key, JSON.stringify({ ...session, access_token: 'expired.token.value', refresh_token: 'not-a-real-refresh-token', expires_at: 1 }))
  })
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 })
  await expect(page.getByPlaceholder('you@company.com')).toBeVisible()
})

// Runs even when a test above fails, so the test project doesn't keep the user
test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await trySignIn(page, user.email, PASSWORD)
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /— Account$/ }).click()
  await expect(page).toHaveURL(/\/settings/)
  await page.getByRole('link', { name: 'Your data' }).click()
  page.once('dialog', dialog => dialog.accept('DELETE'))
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page).toHaveURL(/\/auth$/, { timeout: 15_000 })
  await page.close()
})

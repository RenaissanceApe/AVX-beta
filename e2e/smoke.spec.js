import { test, expect } from '@playwright/test'

// Start every test in English with a clean session.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Each test gets a fresh browser context; default to English without overriding later choices
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
})

test('signed-out visitors land on the sign-in page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/auth$/)
  await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible()
})

test('protected and unknown routes redirect to sign-in', async ({ page }) => {
  for (const path of ['/dashboard', '/gig/00000000-0000-0000-0000-000000000000', '/no-such-page']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/auth$/)
  }
})

test('forgot-password and create-account modes', async ({ page }) => {
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('button', { name: /Send Reset Link/ })).toBeVisible()
  await page.getByRole('button', { name: 'Back to Sign In' }).click()
  await page.getByRole('button', { name: 'Create Account' }).first().click()
  await expect(page.getByPlaceholder('At least 8 characters')).toBeVisible()
  await expect(page.getByRole('link', { name: 'beta terms' })).toBeVisible()
})

test('sign-in link mode asks only for an email', async ({ page }) => {
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
  await expect(page.getByRole('button', { name: /Send sign-in link/ })).toBeVisible()
  await expect(page.getByPlaceholder('••••••••')).toHaveCount(0)
  await page.getByRole('button', { name: 'Back to Sign In' }).click()
  await expect(page.getByPlaceholder('••••••••')).toBeVisible()
})

test('switching to Portuguese translates the page and is remembered', async ({ page }) => {
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Português' }).click()
  await expect(page.getByRole('button', { name: 'Esqueceu-se da palavra-passe?' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Esqueceu-se da palavra-passe?' })).toBeVisible()
})

test('legal pages render in both languages', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
  await page.goto('/terms')
  await expect(page.getByRole('heading', { name: 'Beta terms of use' })).toBeVisible()
  await page.evaluate(() => localStorage.setItem('avx.lang', 'pt'))
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Aviso de privacidade' })).toBeVisible()
})

test('expired email links show a helpful message', async ({ page }) => {
  await page.goto('/auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByText(/expired or was already used/)).toBeVisible()
  await expect(page).toHaveURL(/\/auth$/)
})

test('reset-password page without a valid link explains what to do', async ({ page }) => {
  await page.goto('/reset-password')
  await expect(page.getByText(/invalid or has expired/)).toBeVisible()
})

test('installable: manifest and icons are served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBeTruthy()
  const manifest = await res.json()
  expect(manifest.short_name).toBe('AVX')
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBeTruthy()
  }
})

test('no JavaScript errors on public pages', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  for (const path of ['/auth', '/privacy', '/terms', '/reset-password', '/welcome']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => {})
  }
  expect(errors).toEqual([])
})

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
})

test('the app opens without a connection after the first visit', async ({ page, context }) => {
  await page.goto('/auth')
  // Wait until the service worker controls the page (it pre-caches the app)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
    }
  })
  await context.setOffline(true)
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
  await page.goto('/auth')
  await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible()
  await context.setOffline(false)
})

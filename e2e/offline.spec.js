import { test, expect } from '@playwright/test'
import { waitForServiceWorker } from './auth/helpers.js'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
})

test('the app opens without a connection after the first visit', async ({ page, context }) => {
  await page.goto('/auth')
  // Wait until the service worker controls the page (it pre-caches the app); bounded, with one
  // reload if it doesn't take over (#206)
  await waitForServiceWorker(page, { timeout: 12_000 })
  await context.setOffline(true)
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible()
  await page.goto('/auth')
  await expect(page.getByRole('button', { name: 'Sign In', exact: true }).first()).toBeVisible()
  await context.setOffline(false)
})

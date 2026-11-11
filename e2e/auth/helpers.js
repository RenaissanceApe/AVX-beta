// Shared steps for the signed-in journeys (e2e/auth/). docs/TESTING.md, "Automated test suite".
import { expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { PASSWORD } from './accounts.js'

// After signing in you land in your workspace: My work, or an organisation
export const HOME = /\/(me|org\/[0-9a-f-]{36})$/

// The app in English unless the page already chose a language
export async function english(page) {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
}

// Sign up through the form. `who` is { name, email }.
export async function signUp(page, who) {
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Create Account' }).first().click()
  await page.getByPlaceholder('João Silva').fill(who.name)
  await page.getByPlaceholder('you@company.com').fill(who.email)
  await page.getByPlaceholder('At least 8 characters').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click()
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
}

// Sign in through the form. `who` is { email } (or the email itself). Most tests don't need this:
// the fixtures in fixtures.js open a page that is already signed in.
export async function signIn(page, who) {
  await page.goto('/auth')
  await page.getByPlaceholder('you@company.com').fill(typeof who === 'string' ? who : who.email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
}

// No serious accessibility problems on the page as it is now (docs/HELP.md, H1)
export async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

// A report view has finished loading: no loading sign left, and no "couldn't be loaded" message.
// The report functions are heavy for the small test database, so a journey lets each view
// finish before opening the next instead of stacking their calls (which ran into its 8 s limit).
// A report that hits a slow moment on the test database tries once more by itself (selectReport
// in src/lib/selectAll.js), so the wait allows two slow requests; a failure that repeats still
// shows "couldn't be loaded" and fails the test.
export async function reportLoaded(page) {
  await expect(page.getByRole('status', { name: 'Loading', exact: true })).toHaveCount(0, { timeout: 45_000 })
  await expect(page.getByText("The report couldn't be loaded. Try again in a moment.")).toHaveCount(0)
}

// A report's period changed (issue #114): wait for its database call to answer, then for the page to
// settle (a retry on a slow database included) and to show no error; only then look at what it shows.
// A real failure still fails: reportLoaded rejects the error message and a report that never loads.
export async function changePeriod(page, rpc, period) {
  const answered = page.waitForResponse(r => r.url().includes(`/rest/v1/rpc/${rpc}`), { timeout: 45_000 })
  await page.locator('#rp-period').selectOption(period)
  await answered
  await reportLoaded(page)
}

// Delete the signed-in account through Settings → Your data, as a person does
export async function deleteAccount(page) {
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

// The service worker controls the page, so the app shell loads offline (#206). It installs in the
// background and can be slow on a busy machine: wait for it on its own clock with a clear message,
// and if it is active but not yet in control of this page, reload once (a page loaded before the
// worker took over stays uncontrolled until it is loaded again).
export async function waitForServiceWorker(page, { timeout = 30_000 } = {}) {
  const inControl = () => page.evaluate(() => !!navigator.serviceWorker?.controller)
  const ready = () => page.evaluate(async ms => {
    if (!('serviceWorker' in navigator)) return 'unsupported'
    const timer = new Promise(resolve => setTimeout(() => resolve('timeout'), ms))
    const done = (async () => {
      await navigator.serviceWorker.ready
      if (navigator.serviceWorker.controller) return 'controlled'
      await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
      return 'controlled'
    })()
    return Promise.race([done, timer])
  }, timeout)
  let state = await ready()
  if (state === 'timeout' && !(await inControl())) {
    await page.reload()
    state = await ready()
  }
  expect(state, `The service worker didn't take control of the page within ${Math.round(timeout / 1000)} s (after one reload), so the offline copy can't load. Check the build has the PWA (vite-plugin-pwa) and the browser allows service workers.`).toBe('controlled')
}

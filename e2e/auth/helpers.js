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
  await submitAuth(page, /\/auth\/v1\/signup/, /Create Account/)
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
}

// Sign in through the form. `who` is { email } (or the email itself). Most tests don't need this:
// the fixtures in fixtures.js open a page that is already signed in.
export async function signIn(page, who) {
  await page.goto('/auth')
  await page.getByPlaceholder('you@company.com').fill(typeof who === 'string' ? who : who.email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await submitAuth(page, /\/auth\/v1\/token/, /Sign In/)
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
}

// Sends the sign-up or sign-in form. When the test project answers 429 (its sign-in limit, reached
// when several runs use it at once) it waits 2, 4, 8 s and sends it again; any other answer is left
// for the test to check, so a real failure still fails.
async function submitAuth(page, endpoint, button) {
  for (let attempt = 0; ; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse(r => endpoint.test(r.url()) && r.request().method() === 'POST', { timeout: 30_000 })
        .catch(() => { throw new Error('The test project gave no answer to the sign-in form within 30 s (its auth service or database is overloaded)') }),
      page.locator('form').getByRole('button', { name: button }).click(),
    ])
    if (response.status() !== 429) return
    expect(attempt, "The test project's sign-in limit was still reached after 4 tries (HTTP 429)").toBeLessThan(3)
    await page.waitForTimeout(2000 * 2 ** attempt)
  }
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
// `ready` (a locator): what the view shows once its data is in. Pass it when there is one: just
// after a tab is clicked the new view may not have put up its loading sign yet, so "no loading
// sign" alone can pass too early (a margins check then timed out on its own 15 s, #194).
export const REPORT_FAILED = "The report couldn't be loaded. Try again in a moment."
export async function reportLoaded(page, ready, { timeout = 45_000 } = {}) {
  const failed = page.getByText(REPORT_FAILED)
  const secs = Math.round(timeout / 1000)
  if (ready) {
    await expect(ready.or(failed).first(), `The report view didn't show its data or an error within ${secs} s: the test database is slow or the report is stuck loading`)
      .toBeVisible({ timeout })
  }
  await expect(page.getByRole('status', { name: 'Loading', exact: true }), `The report view was still loading after ${secs} s`).toHaveCount(0, { timeout })
  await expect(failed, 'The report view says it couldn\'t be loaded (its database call failed twice)').toHaveCount(0)
}

// A report's period changed (issue #114): wait for its database call to answer, then for the page to
// settle (a retry on a slow database included) and to show no error; only then look at what it shows.
// A real failure still fails: reportLoaded rejects the error message and a report that never loads.
export async function changePeriod(page, rpc, period, ready) {
  const answered = page.waitForResponse(r => r.url().includes(`/rest/v1/rpc/${rpc}`), { timeout: 45_000 })
  await page.locator('#rp-period').selectOption(period)
  await answered
  await reportLoaded(page, ready)
}

// Delete the signed-in account through Settings → Your data, as a person does
// (from My work: an admin's /dashboard is the organisation's Home, whose report calls on a busy test
// database could push the deletion past its 8 s limit)
export async function deleteAccount(page) {
  await page.goto('/me')
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
  // A busy shared test database can cancel the deletion at its 8 s limit; the page then says so
  // ("…statement timeout"), and a person would press Delete again. Only that error is tried once
  // more; any other error, or a second timeout, fails the test (#194).
  const timedOut = page.getByRole('alert').filter({ hasText: /statement timeout/i })
  for (let attempt = 1; ; attempt++) {
    page.once('dialog', dialog => dialog.accept('DELETE'))
    await page.getByRole('button', { name: 'Delete account' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /statement timeout/i }).or(page.getByPlaceholder('you@company.com')).first())
      .toBeVisible({ timeout: 20_000 })
    if (attempt === 1 && await timedOut.count()) continue
    break
  }
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

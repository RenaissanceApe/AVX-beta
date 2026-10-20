import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility checks (docs/HELP.md, H1): screen-reader and keyboard problems on the public
// pages fail the build. Serious and critical findings only; the rest are listed in the report.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
})

const PAGES = ['/auth', '/welcome', '/reset-password', '/privacy', '/terms', '/help']

for (const path of PAGES) {
  test(`no serious accessibility problems on ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle').catch(() => {})
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const blocking = results.violations
      .filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)
    expect(blocking).toEqual([])
  })
}

test('the glossary opens at a word and its search works', async ({ page }) => {
  await page.goto('/help#call-time')
  await expect(page.locator('#term-call-time')).toBeFocused()
  await page.getByRole('searchbox').fill('flight case')
  await expect(page.locator('#term-case')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('1 word')
})

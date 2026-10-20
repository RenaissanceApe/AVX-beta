import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility checks (docs/HELP.md, H1): screen-reader and keyboard problems on the public
// pages fail the build. Serious and critical findings only; the rest are listed in the report.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
})

const PAGES = ['/auth', '/welcome', '/reset-password', '/privacy', '/terms', '/help', '/help/guide/crew-call-time']

async function blockingProblems(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)
}

for (const path of PAGES) {
  test(`no serious accessibility problems on ${path}`, async ({ page }) => {
    await page.goto(path)
    expect(await blockingProblems(page)).toEqual([])
  })
}

// The other themes (H3): the same checks, colour contrast included, in light and high contrast
for (const theme of ['light', 'contrast']) {
  for (const path of ['/auth', '/help', '/help/guide/crew-call-time']) {
    test(`no serious accessibility problems on ${path} in the ${theme} theme`, async ({ page }) => {
      await page.addInitScript(t => { try { localStorage.setItem('avx.appearance', JSON.stringify({ theme: t })) } catch { /* ignore */ } }, theme)
      await page.goto(path)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      expect(await blockingProblems(page)).toEqual([])
    })
  }
}

test('a larger text size and the readable font apply before the page draws', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('avx.appearance', JSON.stringify({ size: 'xlarge', font: 'readable', comfort: true })) } catch { /* ignore */ } })
  await page.goto('/auth')
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-size', 'xlarge')
  await expect(html).toHaveAttribute('data-font', 'readable')
  await expect(html).toHaveAttribute('data-comfort', '')
  expect(await page.evaluate(() => getComputedStyle(document.body).zoom)).toBe('1.3')
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/Atkinson/)
})

test('the glossary opens at a word and its search works', async ({ page }) => {
  await page.goto('/help#call-time')
  await expect(page.locator('#term-call-time')).toBeFocused()
  await page.getByRole('searchbox').fill('flight case')
  await expect(page.locator('#term-case')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('1 word')
})

test('the Help page lists the guides and opens one with its pictures', async ({ page }) => {
  await page.goto('/help')
  await page.getByRole('link', { name: 'Find your call time and the call sheet' }).click()
  await expect(page).toHaveURL(/\/help\/guide\/crew-call-time$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Find your call time and the call sheet' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Your call time is under' }).locator('img')).toHaveAttribute('src', '/help/shots/en/call-time.jpg')
  const loaded = await page.locator('article img').first().evaluate(img => img.decode().then(() => img.naturalWidth > 0, () => false))
  expect(loaded).toBe(true)
  await page.getByRole('link', { name: /All help/ }).click()
  await expect(page).toHaveURL(/\/help$/)
})

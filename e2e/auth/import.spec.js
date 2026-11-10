import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { RUN, PASSWORD, testEmail } from './accounts.js'

// The import's Check step fixes problems on the spot (docs/SWITCHING.md, "Import overhaul: fix it
// here"), against the Supabase TEST project (never production). Run with E2E_AUTH=1 and the test
// project's URL/key — see docs/TESTING.md. The account is e2e-imp-<run>@example.com: it deletes
// itself at the end, and CI's sweep step deletes it if a test fails first.
const who = { name: `E2E Import ${RUN}`, email: testEmail('imp', RUN) }
const ORG = `E2E Import Org ${RUN}`
const HOME = /\/(me|org\/[0-9a-f-]{36})$/

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
})

async function signIn(page) {
  await page.goto('/auth')
  await page.getByPlaceholder('you@company.com').fill(who.email)
  await page.getByPlaceholder('••••••••').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
}

async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

let orgPath

test('set up: a user with an organisation and no locations yet', async ({ page }) => {
  await page.goto('/auth')
  await page.getByRole('button', { name: 'Create Account' }).first().click()
  await page.getByPlaceholder('João Silva').fill(who.name)
  await page.getByPlaceholder('you@company.com').fill(who.email)
  await page.getByPlaceholder('At least 8 characters').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: /Create Account/ }).click()
  await expect(page).toHaveURL(HOME, { timeout: 15_000 })
  await page.getByRole('button', { name: 'Create Organisation' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New Organisation' })
  await dialog.getByPlaceholder('e.g. SoundWorks Lisboa').fill(ORG)
  await dialog.getByRole('button', { name: 'Create Organisation' }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}/, { timeout: 15_000 })
  orgPath = new URL(page.url()).pathname.match(/\/org\/[0-9a-f-]{36}/)[0]
})

test('an equipment file with an unknown location: add it from the check, import, and the stock is there', async ({ page }) => {
  await signIn(page)
  await page.goto(`${orgPath}/inventory/import?kind=items`)
  await page.locator('#imp-paste').fill(`Name\tCode\tQuantity\tLocation\nE2E Cable ${RUN}\tE2E-${RUN}\t12\twarehouse`)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()

  // One group: the location the organisation doesn't have, with fixes on the spot
  const group = page.getByRole('region', { name: /^1 row · .*“warehouse”$/ })
  await expect(group).toBeVisible({ timeout: 15_000 })
  await expect(group.getByRole('radio', { name: 'Add "warehouse" as a new location' })).toBeChecked()
  await expect(page.getByText('1 row waiting for a decision will be left out.')).toBeVisible()
  await expectAccessible(page)
  await group.getByRole('button', { name: 'Apply' }).click()

  // The fix is listed, nothing is saved yet, and the Import button says what it adds
  await expect(page.getByText('New location warehouse')).toBeVisible()
  await expect(page.getByText('will be added')).toBeVisible()
  await expect(page.getByText('No problems: every row can go in.')).toBeVisible()
  const importButton = page.getByRole('button', { name: 'Import 1 row · adds 1 location' })
  await expect(importButton).toBeEnabled()
  await expectAccessible(page)
  await importButton.click()

  await expect(page.getByRole('status').filter({ hasText: '1 added · 0 updated · 0 unchanged · 0 skipped' })).toBeVisible({ timeout: 20_000 })
  // Two imports in Earlier imports: the location (its own batch for now) and the equipment
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(2)

  // The location and the stock are there
  await page.goto(`${orgPath}/inventory?tab=locations`)
  await expect(page.getByText('warehouse', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await page.goto(`${orgPath}/inventory`)
  const row = page.getByText(`E2E Cable ${RUN}`).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.getByText('warehouse').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/\b12\b/).first()).toBeVisible()
})

// IM2, a Choose fix: a title line above the headings is noticed, and the headings row suggested
test('a file with a title line: the headings row is suggested and the rows import', async ({ page }) => {
  await signIn(page)
  await page.goto(`${orgPath}/inventory/import?kind=items`)
  await page.locator('#imp-paste').fill(`Stock list ${RUN}\nName\tCode\tQuantity\tLocation\tColour\nE2E Lamp ${RUN}\tE2E-L-${RUN}\t3\twarehouse\tred`)
  await expect(page.getByRole('spinbutton', { name: 'The headings are on row' })).toHaveValue('2')
  await expect(page.getByText('Suggested: the rows above look like titles.')).toBeVisible()
  await expect(page.getByText('1 rows and 5 columns found.')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Next' }).click()

  // The headings are the file's second line, and the column nothing takes is listed
  await expect(page.getByRole('combobox', { name: /Quantity/ })).toBeVisible()
  await expect(page.getByText('Not imported: Colour')).toBeVisible()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Next' }).click()
  const importButton = page.getByRole('button', { name: 'Import 1 row' })
  await expect(importButton).toBeEnabled({ timeout: 15_000 })
  await importButton.click()
  await expect(page.getByRole('status').filter({ hasText: '1 added · 0 updated · 0 unchanged · 0 skipped' })).toBeVisible({ timeout: 20_000 })
})

// IM2, a Done fix: the rows left out download with the file's own columns and a Problem column
test('rows left out in the check download with their data and the problem', async ({ page }) => {
  await signIn(page)
  await page.goto(`${orgPath}/inventory/import?kind=items`)
  await page.locator('#imp-paste').fill(`Name\tCode\tPrice\nE2E Desk ${RUN}\tE2E-D-${RUN}\t40\nE2E Stand ${RUN}\tE2E-S-${RUN}\tlots`)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  // Nobody decides on the bad price, so that row is left out
  await expect(page.getByText('1 row waiting for a decision will be left out.')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Import 1 row' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 added · 0 updated · 0 unchanged · 0 skipped' })).toBeVisible({ timeout: 20_000 })

  const button = page.getByRole('button', { name: 'Download the row left out' })
  await expect(button).toBeVisible()
  await expectAccessible(page)
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  const csv = (await readFile(await download.path(), 'utf8')).replace(/^\uFEFF/, '').split('\n')
  expect(csv[0]).toBe('Name,Code,Price,Problem')
  expect(csv[1]).toBe(`E2E Stand ${RUN},E2E-S-${RUN},lots,Price: not a number`)
  expect(csv).toHaveLength(2)
})

test('clean up: the user deletes their account', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Your data' }).click()
  page.once('dialog', dialog => dialog.accept('DELETE'))
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page).toHaveURL(/\/auth$/, { timeout: 15_000 })
})

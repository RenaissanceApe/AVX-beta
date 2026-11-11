import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { RUN, testEmail } from './accounts.js'
import { english, signUp, signIn as signInAs, expectAccessible } from './helpers.js'

// The import's Check step fixes problems on the spot (docs/SWITCHING.md, "Import overhaul: fix it
// here"), against the Supabase TEST project (never production). Run with E2E_AUTH=1 and the test
// project's URL/key — see docs/TESTING.md. The account is e2e-imp-<run>@example.com: it deletes
// itself at the end, and CI's sweep step deletes it if a test fails first.
const who = { name: `E2E Import ${RUN}`, email: testEmail('imp', RUN) }
const ORG = `E2E Import Org ${RUN}`

test.describe.configure({ mode: 'serial' })

// Part of the pull requests' smoke run (@smoke; docs/TESTING.md). Not indented, to keep its history readable.
test.describe('import: fix it here', { tag: ['@smoke', '@import'] }, () => {

test.beforeEach(async ({ page }) => {
  await english(page)
})

const signIn = page => signInAs(page, who)

let orgPath

test('set up: a user with an organisation and no locations yet', async ({ page }) => {
  await signUp(page, who)
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
  // One import in Earlier imports: the location the fix added is in the import's own batch (IM3)
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(1)
  await expect(page.getByText('1 added by a fix')).toBeVisible()

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

// IM3: what a fix adds is in the import's batch, so one undo takes back the import and the addition
test('one undo takes back an import and the location its fix added', async ({ page }) => {
  await signIn(page)
  const store = `E2E Store ${RUN}`
  await page.goto(`${orgPath}/inventory/import?kind=items`)
  await page.locator('#imp-paste').fill(`Name\tCode\tQuantity\tLocation\nE2E Crate ${RUN}\tE2E-C-${RUN}\t2\t${store}`)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const group = page.getByRole('region', { name: new RegExp(`“${store}”$`) })
  await expect(group).toBeVisible({ timeout: 15_000 })
  await group.getByRole('button', { name: 'Apply' }).click()
  await page.getByRole('button', { name: 'Import 1 row · adds 1 location' }).click()
  await expect(page.getByRole('status').filter({ hasText: '1 added · 0 updated · 0 unchanged · 0 skipped' })).toBeVisible({ timeout: 20_000 })

  // The newest import is first in Earlier imports; undoing it says the fix's addition goes too
  await page.getByRole('button', { name: /^Undo/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Removes the 1 record a fix added', { exact: false })).toBeVisible()
  await expectAccessible(page)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: /Undo/ }).click()
  await expect(page.getByText(/^Import undone/)).toBeVisible({ timeout: 15_000 })

  // Neither the equipment nor the location is there any more
  await page.goto(`${orgPath}/inventory?tab=locations`)
  await expect(page.getByText(`E2E Store ${RUN}`)).toHaveCount(0)
  await page.goto(`${orgPath}/inventory`)
  await expect(page.getByText(`E2E Crate ${RUN}`)).toHaveCount(0)
})

// IM4: a past job comes in as a done gig when "Import as past jobs" is chosen; importing the file
// again matches it by its number, so nothing doubles
test('past jobs come in as done gigs when chosen, and a second import doesn\'t double them', async ({ page }) => {
  await signIn(page)
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
  const file = `Number\tName\tStart\tEnd\nE2E-P-${RUN}\tE2E Past ${RUN}\t${day(-40)}\t${day(-39)}\nE2E-U-${RUN}\tE2E Next ${RUN}\t${day(30)}\t${day(31)}`
  for (const round of [1, 2]) {
    await page.goto(`${orgPath}/inventory/import?kind=gigs`)
    await page.locator('#imp-paste').fill(file)
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    const purpose = page.locator('section[aria-labelledby="imp-purpose"]')
    await expect(purpose.getByText('1 past job')).toBeVisible({ timeout: 15_000 })
    if (round === 1) await expectAccessible(page)
    await purpose.getByRole('button', { name: 'Import as past jobs' }).click()
    await expect(page.getByText('1 past job imported as done')).toBeVisible()
    await page.getByRole('button', { name: 'Import 2 rows' }).click()
    const result = round === 1 ? '2 added · 0 updated · 0 unchanged · 0 skipped' : '0 added · 0 updated · 2 unchanged · 0 skipped'
    await expect(page.getByRole('status').filter({ hasText: result })).toBeVisible({ timeout: 20_000 })
  }
})

test('clean up: the user deletes their account', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Your data' }).click()
  page.once('dialog', dialog => dialog.accept('DELETE'))
  await page.getByRole('button', { name: 'Delete account' }).click()
  await expect(page).toHaveURL(/\/auth$/, { timeout: 15_000 })
})

})

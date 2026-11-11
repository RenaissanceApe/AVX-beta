// The automated suite's own checks (AT0): each ready-made person opens the app already signed in
// and sees what their role allows, the set-up's data shows up in the app, and the stand-ins and
// test_support work. Also the worked example for area specs (docs/TESTING.md, "Automated test suite").
import { test, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addQuote } from './setup.js'
import { stubTownSearch } from './stubs.js'
import { makeAvxAdmin, emailSummaryCandidates } from './testSupport.js'

test.use({ area: 'foundation' })

// covers: none (the suite's own set-up)
test('the admin opens their organisation already signed in', { tag: ['@smoke', '@foundation'] }, async ({ adminWithOrg }) => {
  const { page, org } = adminWithOrg
  await page.goto(org.path)
  await expect(page.getByTitle(`Workspace: ${org.name}`)).toBeVisible({ timeout: 15_000 })
  await expectAccessible(page)
})

// covers: none (the suite's own set-up)
test('a member is in the organisation', { tag: '@foundation' }, async ({ member }) => {
  const { page, org } = member
  await page.goto(org.path)
  await expect(page.getByTitle(`Workspace: ${org.name}`)).toBeVisible({ timeout: 15_000 })
})

// covers: none (the suite's own set-up)
test('a viewer can\'t open the organisation\'s reports', { tag: '@foundation' }, async ({ viewer }) => {
  const { page, org } = viewer
  await page.goto(`${org.path}/reports`)
  await expect(page.getByText("Reports are for the organisation's admins and members.")).toBeVisible({ timeout: 20_000 })
})

// covers: none (the suite's own set-up)
test('crew on the gig open it, though they aren\'t in the organisation', { tag: '@foundation' }, async ({ crewOnGig }) => {
  const { page, gig } = crewOnGig
  await page.goto(gig.path)
  await expect(page.getByRole('heading', { name: gig.name })).toBeVisible({ timeout: 15_000 })
})

// covers: none (the suite's own set-up)
test('another company can\'t open this organisation\'s gig', { tag: '@foundation' }, async ({ secondCompany }) => {
  const { page, world } = secondCompany
  const gig = await world.gig()
  await page.goto(gig.path)
  await expect(page.getByRole('heading', { name: 'Gig not available' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(gig.name)).toHaveCount(0)
})

// covers: none (the suite's own set-up)
test('a quote made by the set-up prints with the app\'s own totals', { tag: '@foundation' }, async ({ adminWithOrg }) => {
  const { page, account, org } = adminWithOrg
  const quote = await addQuote(account, org, { title: `E2E Setup Quote ${Date.now()}`, lines: [{ description: 'PA system', qty: 2, unit_price: 100 }] })
  await page.goto(`${quote.path}/print`)
  await expect(page.getByRole('heading', { name: quote.title })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.totals')).toContainText('€246.00')
})

// covers: none (the suite's own set-up)
test('town search answers from the stand-in, not LocationIQ', { tag: '@foundation' }, async ({ member }) => {
  const { page } = member
  const calls = await stubTownSearch(page)
  await page.goto('/me/profile')
  await page.getByPlaceholder('Your town or city').fill('Lis')
  await page.getByRole('button', { name: 'Find' }).click()
  const places = page.getByRole('list', { name: 'Matching places' })
  await expect(places.getByRole('button', { name: /Lisboa, Portugal/ })).toBeVisible({ timeout: 15_000 })
  expect(calls.map(c => c?.q)).toEqual(['Lis'])
})

// covers: none (the suite's own set-up). Skips until the owner installs test_support.sql.
test('test_support: the admin becomes an AVX admin and reads the morning summary list', { tag: '@foundation' }, async ({ adminWithOrg }) => {
  const { account, org } = adminWithOrg
  await makeAvxAdmin(account)
  const rows = await emailSummaryCandidates(account, org.id)
  expect(Array.isArray(rows)).toBe(true)
})

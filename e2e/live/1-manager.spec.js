import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { ORG_ID_FILE, ORG_NAME, liveAccount, readOnlyGuard, expectClean, signIn, signOut, openOrg, expectRenders, expectAccessible } from './guard.js'

// Live check, manager (docs/TESTING.md): the company's admin opens every main screen of the live
// app. Read-only: the guard blocks anything that would write, and nothing here saves, sends,
// invites, deletes or creates.

const ORG_SCREENS = ['quotes', 'contacts', 'crew', 'jobs', 'hours', 'appointments', 'leave', 'expenses', 'invoices', 'reports', 'tasks', 'inventory']
const ACCESSIBILITY = new Set(['', '/quotes', '/inventory', '/invoices'])

test('the manager signs in and every main screen renders', async ({ page }, testInfo) => {
  const seen = await readOnlyGuard(page)
  await signIn(page, liveAccount('manager'))

  // The org id comes from the app's own list of organisations, never from this file
  const orgId = await openOrg(page)
  expect(orgId, `the manager isn't in "${ORG_NAME}"`).toBeTruthy()
  writeFileSync(ORG_ID_FILE, orgId)
  await expect(page.getByTitle(`Workspace: ${ORG_NAME}. Switch`).first()).toBeVisible({ timeout: 20_000 })

  const screens = [`/org/${orgId}`, ...ORG_SCREENS.map(s => `/org/${orgId}/${s}`), '/messages', '/settings', '/me']
  for (const path of screens) {
    await test.step(path.replace(orgId, ':org'), async () => {
      await expectRenders(page, path)
      const suffix = path.startsWith(`/org/${orgId}`) ? path.slice(`/org/${orgId}`.length) : null
      if (suffix !== null && ACCESSIBILITY.has(suffix)) await expectAccessible(page, path.replace(orgId, ':org'))
    })
  }

  await signOut(page)
  expectClean(seen, testInfo)
})

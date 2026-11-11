import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { ORG_ID_FILE, liveAccount, readOnlyGuard, expectClean, signIn, signOut, openOrg, expectRenders, expectAccessible, sessionOf } from './guard.js'

// Live check, crew (docs/TESTING.md): a crew member's own screens render, the company's
// manager-only screens and crew rates stay closed to them, and the privacy rules hold.
// Read-only: the guard blocks anything that would write.

const OWN_SCREENS = ['/me', '/me/hours', '/me/appointments', '/me/profile', '/tasks']
const ACCESSIBILITY = new Set(['/me', '/me/hours', '/me/profile'])

// What each manager-only screen says to someone who isn't an admin or member (src/i18n/en.js)
const CLOSED = {
  reports: "Reports are for the organisation's admins and members.",
  invoices: "Only the organisation's admins and members can see invoices.",
  expenses: "Only the organisation's admins and members see expenses.",
  crew: "Only the organisation's admins and members can search for crew.",
  hours: "Only the organisation's admins see everyone's hours.",
}

// A read straight from the database with the crew's own session (never printed)
async function read(page, supabase, token, path, init = {}) {
  return page.evaluate(async ({ url, apikey, token, init }) => {
    const res = await fetch(url, { ...init, headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    let body = null
    try { body = await res.json() } catch { /* empty */ }
    return { status: res.status, body }
  }, { url: `${supabase.origin}${path}`, apikey: supabase.apikey, token, init })
}

test('the crew member sees their own screens and none of the company\'s private data', async ({ page }, testInfo) => {
  const seen = await readOnlyGuard(page)
  await signIn(page, liveAccount('crew'))

  for (const path of OWN_SCREENS) {
    await test.step(path, async () => {
      await expectRenders(page, path)
      if (ACCESSIBILITY.has(path)) await expectAccessible(page, path)
    })
  }

  // The company: from the crew's own list of organisations, or the one the manager test found
  const orgId = (await openOrg(page)) || (existsSync(ORG_ID_FILE) ? readFileSync(ORG_ID_FILE, 'utf8').trim() : null)
  expect(orgId, 'no company to check: the crew isn\'t a member and the manager test found none').toBeTruthy()

  for (const [screen, message] of Object.entries(CLOSED)) {
    await test.step(`${screen} stays closed`, async () => {
      await expectRenders(page, `/org/${orgId}/${screen}`)
      // A non-member gets "Not one of your organisations" instead of the screen's own message
      await expect(page.getByText(message, { exact: false }).or(page.getByText('Not one of your organisations')).first(),
        `the crew can open ${screen}`).toBeVisible({ timeout: 20_000 })
    })
  }

  await test.step('privacy and crew rates, read with the crew\'s own session', async () => {
    const session = await sessionOf(page)
    expect(session?.token, 'no signed-in session found').toBeTruthy()
    expect(seen.supabase, 'the app made no database request').toBeTruthy()
    const { token, userId } = session

    // Phone numbers aren't readable from the profiles table (column grants, 0.82.3)
    const phone = await read(page, seen.supabase, token, '/rest/v1/profiles?select=phone&limit=1')
    expect(phone.status, 'reading profiles.phone was allowed').toBeGreaterThanOrEqual(400)
    expect(phone.body?.code, 'reading profiles.phone failed for another reason').toBe('42501')

    // my_profile() returns only the caller's own row
    const own = await read(page, seen.supabase, token, '/rest/v1/rpc/my_profile', { method: 'POST', body: '{}' })
    expect(own.status).toBe(200)
    expect(own.body.map(r => r.id), 'my_profile() returned other people').toEqual([userId])

    // The company's crew rates
    for (const table of ['crew_rates', 'crew_rate_factors']) {
      const rates = await read(page, seen.supabase, token, `/rest/v1/${table}?select=org_id&org_id=eq.${orgId}`)
      expect(rates.status).toBe(200)
      expect(rates.body, `the crew can read the company's ${table}`).toEqual([])
    }
  })

  await signOut(page)
  expectClean(seen, testInfo)
})

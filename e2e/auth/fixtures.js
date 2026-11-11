// Ready-made signed-in people for the area specs (docs/TESTING.md, "Automated test suite").
//
//   import { test, expect } from './fixtures.js'
//   test.use({ area: 'gigs' })                       // this file's area (accounts.js AREAS)
//   test('…', { tag: ['@smoke', '@gigs'] }, async ({ adminWithOrg }) => {
//     const { page, org } = adminWithOrg               // a page already signed in as the admin
//     await page.goto(org.path)
//   })
//
// Each fixture gives { page, account, world, … }: `page` is a fresh window signed in as that person
// (in English; closed after the test), `account` has { email, name, id, client } (client: the
// database API signed in as them, for set-up and checks), and `world` makes more of this area's
// data (setup.js). Everything is made once per file and shared by its tests.
import { test as base, expect } from '@playwright/test'
import { pageAs, worldFor } from './setup.js'
import { english } from './helpers.js'

export { expect }

async function signedIn({ browser, baseURL }, account, provide, extra) {
  const page = await pageAs(browser, account, { baseURL })
  await english(page)
  await provide({ page, account, ...extra })
  await page.context().close()
}

export const test = base.extend({
  // This file's area: set it with test.use({ area: '<area>' })
  area: ['foundation', { option: true }],
  world: async ({ area }, provide) => { await provide(worldFor(area)) },

  // The organisation's admin (created it), with the organisation
  adminWithOrg: async ({ browser, baseURL, world }, provide) => {
    const [account, org] = await Promise.all([world.admin(), world.org()])
    await signedIn({ browser, baseURL }, account, provide, { org, world })
  },
  // A member of the organisation
  member: async ({ browser, baseURL, world }, provide) => {
    const [account, org] = await Promise.all([world.member(), world.org()])
    await signedIn({ browser, baseURL }, account, provide, { org, world })
  },
  // A viewer of the organisation
  viewer: async ({ browser, baseURL, world }, provide) => {
    const [account, org] = await Promise.all([world.viewer(), world.org()])
    await signedIn({ browser, baseURL }, account, provide, { org, world })
  },
  // Crew on the organisation's gig, not a member of the organisation
  crewOnGig: async ({ browser, baseURL, world }, provide) => {
    const [account, gig, org] = await Promise.all([world.crew(), world.gig(), world.org()])
    await signedIn({ browser, baseURL }, account, provide, { gig, org, world })
  },
  // The admin of another, unrelated company (for "can't see the other company's data")
  secondCompany: async ({ browser, baseURL, world }, provide) => {
    const [account, org] = await Promise.all([world.other(), world.otherOrg()])
    await signedIn({ browser, baseURL }, account, provide, { org, world })
  },
})

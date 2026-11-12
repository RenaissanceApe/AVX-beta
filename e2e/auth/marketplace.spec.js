// Crew marketplace (AT6): the owner's manual test lines T40–T43 and T45, plus the parts of T68 that
// need the marketplace (docs/notes/AT7.md), as signed-in journeys on the TEST project. Data is made
// through the set-up (setup.js); only what a line tests is clicked through. The town search and the
// VIES check always go through the stand-ins (stubs.js). What stays manual is in docs/notes/AT6.md.
//
// Freelancers here are accounts of this area without an organisation, each test with its own one,
// so one test's profile, applications or alerts never show in another's. Every search and job
// post carries this run's tag in a name or title, because the test project holds other runs' too.
//
// Posting jobs needs two-step sign-in (publish_job). The companies that post (this area's admin and
// "other") switch it on through the API the first time (withTwoStep), and switch it off again at the
// end of the file, so the sweep can delete them (it signs in with a password only).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test as base, expect } from './fixtures.js'
import { expectAccessible } from './helpers.js'
import { addGig, addQuote, addToGig, pageAs, worldFor } from './setup.js'
import { MANIFEST_DIR, RUN } from './accounts.js'
import { totpCode } from './files.js'
import { stubCompanyCheck, stubTownSearch } from './stubs.js'
import { makeAvxAdmin, requireTestSupport } from './testSupport.js'

const AREA = 'marketplace'
const TAG = '@marketplace'
const LOAD = 45_000

const day = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// The next Monday at least two weeks away: a Monday–Tuesday gig has no weekend days
const monday = (() => { let n = 14; while (new Date(Date.now() + n * 86400e3).getDay() !== 1) n++; return n })()
const uniq = () => `${RUN}-${Date.now().toString(36)}`
const ok = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
// The stand-in town search answers Lisboa first; profiles and posts are placed there
const LISBOA = { label: 'Lisboa, Portugal', place: 'Lisboa', country: 'PT', lat: 38.72, lng: -9.14 }

// ---- Set-up helpers ----

// Two-step sign-in on for a company account (publish_job needs it). The secret is kept beside the
// run's account list (.e2e-accounts, not committed), so a restarted test worker can sign in at the
// second step again; the session in account.client is then at aal2, and pages opened after it too.
const secretFile = account => join(MANIFEST_DIR, `${RUN}-${account.role}-${AREA}.totp`)
function withTwoStep(world, account) {
  return world.once(`twoStep:${account.role}`, async () => {
    const mfa = account.client.auth.mfa
    const { data: factors } = await mfa.listFactors()
    let factor = factors?.totp?.find(f => f.status === 'verified')
    let secret
    if (factor) secret = readFileSync(secretFile(account), 'utf8').trim()
    else {
      const enrolled = ok('Switching on two-step sign-in', await mfa.enroll({ factorType: 'totp', friendlyName: `e2e ${uniq()}` }))
      factor = enrolled
      secret = enrolled.totp.secret
      mkdirSync(MANIFEST_DIR, { recursive: true })
      writeFileSync(secretFile(account), secret)
    }
    const { data: level } = await mfa.getAuthenticatorAssuranceLevel()
    if (level?.currentLevel !== 'aal2') ok('Signing in with the two-step code', await mfa.challengeAndVerify({ factorId: factor.id, code: await totpCode(secret) }))
    return account
  })
}
// The pages of the two companies, with two-step sign-in on (fixtures.js gives the page; this makes
// sure the session it is opened with is already at the second step)
const test = base.extend({
  company: async ({ browser, baseURL, world }, provide) => {
    const [account, org] = await Promise.all([world.admin(), world.org()])
    await withTwoStep(world, account)
    const page = await pageAs(browser, account, { baseURL })
    await provide({ page, account, org, world })
    await page.context().close()
  },
  otherCompany: async ({ browser, baseURL, world }, provide) => {
    const [account, org] = await Promise.all([world.other(), world.otherOrg()])
    await withTwoStep(world, account)
    const page = await pageAs(browser, account, { baseURL })
    await provide({ page, account, org, world })
    await page.context().close()
  },
})
test.use({ area: AREA })

// …and two-step sign-in off again after the file, so the sweep (password only) can delete the accounts
test.afterAll(async () => {
  const world = worldFor(AREA)
  for (const role of ['admin', 'other']) {
    if (!world.memo.has(`twoStep:${role}`)) continue
    try {
      const account = await world.memo.get(`twoStep:${role}`)
      const { data } = await account.client.auth.mfa.listFactors()
      for (const f of data?.all || []) await account.client.auth.mfa.unenroll({ factorId: f.id })
      rmSync(secretFile(account), { force: true })
    } catch (e) {
      process.stderr.write(`Switching two-step sign-in off for ${role} failed (${e.message}); remove the account in the test project → Authentication → Users.\n`)
    }
  }
})

// A freelancer's crew profile, switched on: a rigger based in Lisboa, as the profile page saves it
async function crewProfile(account, patch = {}) {
  ok('Saving the crew profile', await account.client.from('crew_profiles').upsert({
    user_id: account.id, enabled: true, visibility: 'companies', contact_from: 'any', job_alerts: true,
    headline: `E2E rigger ${RUN}`, functions: ['rigger'], base_place: LISBOA.place, base_country: LISBOA.country,
    base_lat: LISBOA.lat, base_lng: LISBOA.lng, travel_scope: 'km', travel_km: 100, languages: ['pt', 'en'],
    certificates: [], links: [], ...patch,
  }))
  return ok('Reading the crew profile', await account.client.from('crew_profiles').select('*').eq('user_id', account.id).single())
}
// A freelancer of this area (no organisation), with a profile on
async function freelancer(world, role, patch) {
  const account = await world.account(role)
  await crewProfile(account, patch)
  return account
}
// The organisation's rate card: Rigger at 190 a day (once per file)
const RIGGER_DAY = 190
function riggerRate(world) {
  return world.once('riggerRate', async () => {
    const [admin, org] = await Promise.all([world.admin(), world.org()])
    const { data } = await admin.client.from('crew_rates').select('id').eq('org_id', org.id).eq('function_title', 'Rigger').is('removed_at', null)
    if (!data?.length) ok('Adding the Rigger rate', await admin.client.from('crew_rates').insert({ org_id: org.id, function_title: 'Rigger', day_rate: RIGGER_DAY }))
  })
}
// A gig of its own in Lisboa, Monday and Tuesday (no weekend days)
async function lisbonGig(account, orgId, label) {
  return addGig(account, orgId, { name: `E2E ${label} ${uniq()}`, venue: 'Lisboa', start_date: day(monday), end_date: day(monday + 1) })
}
// A job post made the way the app makes it (publish_job, from Post a job); returns its id
async function postJob(account, gig, fields = {}) {
  return ok('Posting the job', await account.client.rpc('publish_job', {
    p_gig: gig.id,
    p_job: {
      position_id: null, title: `E2E Rigger ${uniq()}`, function_key: 'rigger', quantity: 1,
      starts_on: gig.start_date, ends_on: gig.end_date, place: LISBOA.label, country: LISBOA.country, lat: LISBOA.lat, lng: LISBOA.lng,
      languages: [], certificate: null, description: null, pay_mode: 'ask_rate', pay_amount: null, pay_max: null, pay_per: 'day', currency: 'EUR',
      ...fields,
    },
  }))
}
const postId = data => (typeof data === 'object' && data ? data.id : data)
// Closes a post at the end of a test: an organisation that isn't verified can have 3 open at a time
async function closePost(account, id) {
  if (id) await account.client.rpc('close_job', { p_post: id, p_status: 'closed' })
}
// The person has read their notifications: the bell's name doesn't match its "9+" from ten unread
// on (#209), and the people here collect notifications as the file runs
async function readBell(...accounts) {
  const now = new Date().toISOString()
  for (const a of accounts) ok('Reading notifications', await a.client.from('notifications').update({ read_at: now }).eq('user_id', a.id).is('read_at', null))
}
// Opens the bell and returns the notification whose text matches
async function notification(page, text) {
  const bell = page.getByRole('button', { name: /unread notification/ })
  await expect(bell).toBeVisible({ timeout: LOAD })
  await bell.click()
  const item = page.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: text })
  await expect(item.first()).toBeVisible({ timeout: LOAD })
  return item.first()
}
// A direct conversation with someone, in Messages
async function openDirect(page, name) {
  await page.goto('/messages')
  await page.getByRole('navigation', { name: 'Messages' }).getByRole('link', { name: new RegExp(name) }).first().click({ timeout: LOAD })
  await expect(page.getByRole('region', { name })).toBeVisible({ timeout: LOAD })
}
// Accepts the offer of a place on the gig in the person's messages with the company
async function acceptOffer(page, companyName, gig, title) {
  await openDirect(page, companyName)
  const offer = page.getByRole('log').locator('div').filter({ has: page.getByRole('link', { name: gig.name, exact: true }) }).last()
  await expect(offer).toContainText(`${companyName} offers you a place: ${title}`, { timeout: LOAD })
  await offer.getByRole('button', { name: 'Accept' }).click()
  await expect(offer).toContainText('You accepted · you’re on the gig', { timeout: LOAD })
}
// Find crew opened from the gig's Crew tab (⋯ → Find crew), searching for one person by name
async function findCrewFor(page, gig, person, { fn = 'Rigger' } = {}) {
  await page.goto(`${gig.path}?tab=crew`)
  await page.getByRole('button', { name: 'More actions', exact: true }).first().click({ timeout: LOAD })
  await page.getByRole('menuitem', { name: 'Find crew' }).click()
  await expect(page).toHaveURL(new RegExp(`/org/${gig.org_id}/crew\\?gig=${gig.id}`))
  await expect(page.getByLabel('For which gig')).toHaveValue(gig.id, { timeout: LOAD })
  await searchFor(page, person, { fn })
}
async function searchFor(page, person, { fn = 'Rigger', place = true } = {}) {
  const filters = page.getByRole('form', { name: 'Search filters' })
  if (fn) await filters.getByLabel('Function', { exact: true }).selectOption({ label: fn })
  await filters.getByLabel('Name or words').fill(person.name)
  if (place && !(await filters.getByRole('button', { name: 'Search everywhere' }).count())) {
    await filters.getByLabel('Near', { exact: true }).fill('Lisboa')
    await filters.getByRole('button', { name: 'Find', exact: true }).click()
    await filters.getByRole('button', { name: 'Lisboa, Portugal' }).click()
  }
  await filters.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(foundCount(page)).toHaveText(/(person|people) found$/, { timeout: LOAD })
}
// The number found in Find crew (a heading that is also a live status)
const foundCount = page => page.locator('#cs-results')
// The result card of a person in Find crew
const card = (page, person) => page.locator('section[aria-labelledby="cs-results"] > div > *').filter({ hasText: person.name })
// A job post on a list (the Jobs board or Job posts)
const jobRow = (page, title) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

// ---- Tests ----

// covers: T41
test('Find crew lists a switched-on profile with the distance and "free", and "Ask if free" reaches them', { tag: ['@smoke', TAG] }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, account, org } = adminWithOrg
  const person = await freelancer(world, 'crew')
  const gig = await lisbonGig(account, org.id, 'Find crew')
  await readBell(account, person)
  await stubTownSearch(page)

  await findCrewFor(page, gig, person)
  const found = card(page, person)
  await expect(found).toHaveCount(1)
  await expect(found).toContainText('Rigger')
  await expect(found).toContainText(/\d+ km away/)
  await expect(found).toContainText('Free on these dates')
  await expectAccessible(page)

  await found.getByRole('button', { name: `Ask if free: ${person.name}` }).click()
  const ask = page.getByRole('dialog', { name: `Ask ${person.name} if they're free` })
  const question = `Two days in Lisboa? ${uniq()}`
  await ask.getByLabel('Message').fill(question)
  await ask.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText(`Asked ${person.name}. Their answer will show in your messages and on the gig.`)).toBeVisible({ timeout: LOAD })
  await expect(found).toContainText('Asked: the answer arrives in your messages.')

  // The freelancer has the question in their messages with the company
  const theirs = await pageAs(browser, person, { baseURL })
  try {
    await openDirect(theirs, account.name)
    await expect(theirs.getByRole('log').getByText(`“${question}”`)).toBeVisible({ timeout: LOAD })
  } finally {
    await theirs.context().close()
  }
})

// covers: T41, T68
test('Find crew → "Offer a place": the fee comes from the rate card; accepting puts them on the gig with that fee; switched off, they are gone', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, account, org } = adminWithOrg
  await riggerRate(world)
  const person = await freelancer(world, 'crew2')
  const gig = await lisbonGig(account, org.id, 'Offer a place')
  await readBell(account, person)
  await stubTownSearch(page)

  await findCrewFor(page, gig, person)
  const found = card(page, person)
  await found.getByRole('button', { name: `Offer a place: ${person.name}` }).click()
  const offer = page.getByRole('dialog', { name: `Offer ${person.name} a place` })
  await expect(offer.getByLabel('As *')).toHaveValue('Rigger')
  // Two days of the gig at the Rigger day rate
  await expect(offer.getByLabel('Rate (€)')).toHaveValue(new RegExp(`^${RIGGER_DAY}`))
  await expect(offer.getByLabel('Days')).toHaveValue('2')
  await expect(offer).toContainText('The rate card suggests')
  await expect(offer).toContainText('Total €380.00')
  await expectAccessible(page)
  await offer.getByRole('button', { name: 'Send the offer' }).click()
  await expect(page.getByText(`Offer sent to ${person.name}. If they accept, they join the gig.`)).toBeVisible({ timeout: LOAD })

  // They accept in their messages and are on the gig, with the fee agreed
  const theirs = await pageAs(browser, person, { baseURL })
  try {
    // The notification names the fee
    await theirs.goto('/me')
    await expect(await notification(theirs, new RegExp(`offers you a place as Rigger on ${gig.name}.* · fee €380\\.00`))).toBeVisible()
    await theirs.keyboard.press('Escape')
    await acceptOffer(theirs, account.name, gig, 'Rigger')
    await theirs.goto(`${gig.path}?tab=crew`)
    await expect(theirs.getByText('Your fee for this gig')).toBeVisible({ timeout: LOAD })
    await expect(theirs.getByText('Your fee for this gig').locator('..')).toContainText('€380.00')
  } finally {
    await theirs.context().close()
  }
  await page.goto(`${gig.path}?tab=crew`)
  const labour = page.getByRole('region', { name: 'Labour cost' })
  await expect(labour).toContainText(person.name, { timeout: LOAD })
  await expect(labour).toContainText(`Agreed: €${RIGGER_DAY}.00`)

  // Switched off: no longer found
  ok('Switching the profile off', await person.client.from('crew_profiles').update({ enabled: false }).eq('user_id', person.id))
  await page.goto(`/org/${org.id}/crew`)
  await searchFor(page, person)
  await expect(foundCount(page)).toHaveText('0 people found')
  await expect(card(page, person)).toHaveCount(0)
})

// covers: T40
test('crew profile: functions, town, language and certificate, switched on with a preview; who can see it; removed', { tag: TAG }, async ({ browser, baseURL, world }) => {
  const person = await world.account('tech')
  // An empty profile to start from (the same run tried again keeps the account)
  ok('Clearing the profile', await person.client.rpc('clear_crew_profile'))
  const page = await pageAs(browser, person, { baseURL })
  try {
    const calls = await stubTownSearch(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Open your crew profile' }).click({ timeout: LOAD })
    await expect(page).toHaveURL(/\/me\/profile$/)
    await expect(page.getByRole('heading', { name: 'Crew profile', level: 1 })).toBeVisible({ timeout: LOAD })

    const work = page.getByRole('group', { name: 'What you do' })
    await work.getByRole('button', { name: 'Rigger', exact: true }).click()
    await work.getByRole('button', { name: 'Stagehand', exact: true }).click()
    await expect(work.getByRole('button', { name: 'Rigger', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByLabel('One line about you').fill(`Rigger and stagehand ${RUN}`)
    await page.getByLabel("Where you're based", { exact: true }).fill('Lisboa')
    await page.getByRole('button', { name: 'Find', exact: true }).click()
    await page.getByRole('list', { name: 'Matching places' }).getByRole('button', { name: 'Lisboa, Portugal' }).click()
    expect(calls.map(c => c.q)).toEqual(['Lisboa'])
    await page.getByLabel('Languages you work in').selectOption({ label: 'Portuguese' })
    await page.getByRole('button', { name: 'Add a certificate' }).click()
    await page.getByLabel('Certificate', { exact: true }).fill('IPAF 3a')
    await page.getByLabel('Issued by').fill('IPAF')
    await page.getByLabel('Valid until').fill(day(365))
    await page.getByRole('checkbox', { name: /Let people find my profile/ }).check()
    await expect(page.getByText('Changes not saved yet', { exact: true })).toBeVisible()

    // The preview shows what others will see
    const preview = page.locator('section[aria-labelledby="cp-preview"]')
    await expect(preview).toContainText(person.name)
    await expect(preview).toContainText('Rigger')
    await expect(preview).toContainText('Stagehand')
    await expect(preview).toContainText('Lisboa')
    await expect(preview).toContainText('Portuguese')
    await expect(preview).toContainText('IPAF 3a')
    await expect(preview).toContainText('self-declared')
    await expectAccessible(page)

    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved. Your profile is on.')).toBeVisible({ timeout: LOAD })
    await expect(page.getByText('Your profile is on', { exact: true })).toBeVisible()
    let row = ok('Reading the profile', await person.client.from('crew_profiles').select('*').eq('user_id', person.id).single())
    expect(row).toMatchObject({ enabled: true, visibility: 'companies', functions: ['rigger', 'stagehand'], base_place: 'Lisboa', languages: ['pt'] })
    expect(row.certificates.map(c => c.name)).toEqual(['IPAF 3a'])

    // Who can see it: companies and crew
    await page.getByRole('radio', { name: /Companies and crew/ }).check()
    await expect(page.getByText('This is what companies and other crew on AVX will see when your profile is on.')).toBeVisible()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved. Your profile is on.').last()).toBeVisible({ timeout: LOAD })
    await expect.poll(async () => (await person.client.from('crew_profiles').select('visibility').eq('user_id', person.id).single()).data?.visibility,
      { timeout: LOAD }).toBe('crew')

    // Remove it: asks first, then everything is cleared
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Remove my crew profile' }).click()
    await expect(page.getByText('Your crew profile has been removed.')).toBeVisible({ timeout: LOAD })
    await expect(page.getByText('Your profile is off', { exact: true })).toBeVisible()
    await expect(work.getByRole('button', { name: 'Rigger', exact: true })).toHaveAttribute('aria-pressed', 'false')
    row = ok('Reading the profile', await person.client.from('crew_profiles').select('*').eq('user_id', person.id).maybeSingle())
    if (row) {
      expect(row.enabled).toBe(false)
      expect(row.functions || []).toEqual([])
      expect(row.base_place).toBeNull()
      expect(row.certificates || []).toEqual([])
    }
  } finally {
    await page.context().close()
  }
})

// covers: T40
test('crew profile in Portuguese', { tag: TAG }, async ({ browser, baseURL, world }) => {
  const person = await freelancer(world, 'newbie', { certificates: [{ name: 'IPAF 3a', issuer: 'IPAF', expires_on: day(365) }] })
  const page = await pageAs(browser, person, { baseURL, lang: 'pt' })
  try {
    await page.goto('/me/profile')
    await expect(page.getByRole('heading', { name: 'Perfil profissional', level: 1 })).toBeVisible({ timeout: LOAD })
    await expect(page.getByText('O seu perfil está ligado', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Como os outros o veem' })).toBeVisible()
    await expect(page.locator('section[aria-labelledby="cp-preview"]')).toContainText('Rigger')
    await expectAccessible(page)
  } finally {
    await page.context().close()
  }
})

// covers: T42, T68
test('job board: a company with two-step sign-in posts, a freelancer applies, the company offers the place and the post is filled', { tag: TAG }, async ({ company, browser, baseURL }) => {
  const { page, world, account, org } = company
  await riggerRate(world)
  const person = await freelancer(world, 'worker')
  const gig = await lisbonGig(account, org.id, 'Job board')
  await readBell(account, person)
  await stubTownSearch(page)
  const title = `Rigger ${uniq()}`
  let id = null

  // Crew tab → ⋯ → Post a job: the function fills the pay from the day rate; one's own amount stays
  await page.goto(`${gig.path}?tab=crew`)
  await page.getByRole('button', { name: 'More actions', exact: true }).first().click({ timeout: LOAD })
  await page.getByRole('menuitem', { name: 'Post a job' }).click()
  const post = page.getByRole('dialog', { name: 'Post a job' })
  await post.getByLabel('Function').selectOption({ label: 'Rigger' })
  await expect(post.getByRole('radio', { name: /State the fee/ })).toBeChecked()
  await expect(post.getByLabel('Amount *')).toHaveValue(String(RIGGER_DAY))
  await expect(post).toContainText('Filled in from your rate card for this function. You can change it.')
  await post.getByLabel('Amount *').fill('200')
  await post.getByLabel('Title *').fill(title)
  await expect(post.getByLabel('Amount *')).toHaveValue('200')
  await expect(post).not.toContainText('Filled in from your rate card')
  // …then ask for their day rate instead, and the town of the venue
  await post.getByRole('radio', { name: /Ask for their day rate/ }).check()
  await expect(post.getByLabel('From *')).toHaveValue(gig.start_date)
  await post.getByRole('button', { name: 'Find', exact: true }).click()
  await post.getByRole('button', { name: 'Lisboa, Portugal' }).click()
  await expectAccessible(page)
  await post.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText("Posted. You'll be told when someone applies.")).toBeVisible({ timeout: LOAD })
  id = ok('Finding the post', await account.client.from('job_posts').select('id').eq('org_id', org.id).eq('title', title).single()).id

  try {
    // The freelancer: Jobs → For you → Apply with a message and a day rate
    const theirs = await pageAs(browser, person, { baseURL })
    const message = `I rigged the last three tours ${uniq()}`
    try {
      await theirs.goto('/jobs')
      await expect(theirs.getByRole('tab', { name: 'For you' })).toHaveAttribute('aria-selected', 'true', { timeout: LOAD })
      const job = jobRow(theirs, title)
      await expect(job).toBeVisible({ timeout: LOAD })
      await expect(job).toContainText(org.name)
      await expect(job).toContainText('Lisboa')
      await expect(job).toContainText('Send your day rate')
      await expect(job).not.toContainText(gig.name)
      await expectAccessible(theirs)
      await job.getByRole('button', { name: `Apply: ${title}` }).click()
      const apply = theirs.getByRole('dialog', { name: `Apply: ${title}` })
      await apply.getByLabel('Message').fill(message)
      await apply.getByLabel('Your day rate *').fill('210')
      await apply.getByRole('checkbox', { name: /^I'm free on/ }).check()
      await expectAccessible(theirs)
      await apply.getByRole('button', { name: 'Send the application' }).click()
      await expect(theirs.getByText(`Application sent to ${org.name}. Their answer will arrive in your messages.`)).toBeVisible({ timeout: LOAD })
      await expect(job).toContainText('Applied', { timeout: LOAD })
    } finally {
      await theirs.context().close()
    }

    // The company: a notification and a message
    const told = await notification(page, new RegExp(`${person.name} applied for ${title}`))
    await expect(told).toBeVisible()
    await page.keyboard.press('Escape')
    await openDirect(page, person.name)
    await expect(page.getByRole('log')).toContainText(message, { timeout: LOAD })

    // Job posts → Applicants → Offer the place: the fee starts from the rate they sent
    await page.goto(`/org/${org.id}/jobs`)
    const row = jobRow(page, title)
    await expect(row).toContainText('Open', { timeout: LOAD })
    await row.getByRole('button', { name: 'Applicants', exact: true }).click()
    const applicants = row.getByRole('list', { name: 'Applicants' })
    await expect(applicants).toContainText(person.name, { timeout: LOAD })
    await expect(applicants).toContainText('day rate €210.00')
    await expect(applicants).toContainText(message)
    await expectAccessible(page)
    await applicants.getByRole('button', { name: `Offer the place: ${person.name}` }).click()
    const offer = page.getByRole('dialog', { name: `Offer the place to ${person.name}` })
    await expect(offer).toContainText('From the day rate they sent (€210.00) for the post’s days.')
    await expect(offer.getByLabel('Rate (€)')).toHaveValue(/^210/)
    await expect(offer.getByLabel('Days')).toHaveValue('2')
    // The fee can be changed before it's sent
    await offer.getByLabel('Rate (€)').fill('220')
    await expect(offer).toContainText('Total €440.00')
    await expectAccessible(page)
    await offer.getByRole('button', { name: 'Offer the place' }).click()
    await expect(page.getByText(`Offer sent to ${person.name}.`)).toBeVisible({ timeout: LOAD })
    await expect(applicants).toContainText('Offered')

    // The freelancer accepts the crew call: on the gig, and the post is filled
    const again = await pageAs(browser, person, { baseURL })
    try {
      await acceptOffer(again, account.name, gig, title)
    } finally {
      await again.context().close()
    }
    await page.reload()
    await expect(jobRow(page, title)).toContainText('Filled', { timeout: LOAD })
    await page.goto(`${gig.path}?tab=crew`)
    const labour = page.getByRole('region', { name: 'Labour cost' })
    await expect(labour).toContainText(person.name, { timeout: LOAD })
    await expect(labour).toContainText('Agreed: €220.00')
  } finally {
    await closePost(account, id)
  }
})

// covers: T42
test('an organisation that isn\'t verified can\'t have a fourth open post', { tag: TAG }, async ({ otherCompany }) => {
  const { page, account, org } = otherCompany
  const gig = await lisbonGig(account, org.id, 'Fourth post')
  const ids = []
  try {
    // Three open posts already (closing any left from an earlier try first)
    const { data: open } = await account.client.from('job_posts').select('id').eq('org_id', org.id).eq('status', 'open')
    for (const p of open || []) await closePost(account, p.id)
    for (let i = 0; i < 3; i++) ids.push(postId(await postJob(account, gig)))

    await page.goto(`/org/${org.id}/jobs`)
    await expect(page.getByText('Not verified yet: up to 3 open posts at a time.')).toBeVisible({ timeout: LOAD })
    await expect(page.getByRole('listitem').filter({ hasText: 'Open' })).toHaveCount(3)
    await page.getByRole('button', { name: 'Post a job' }).click()
    const post = page.getByRole('dialog', { name: 'Post a job' })
    await post.getByLabel('Gig *').selectOption(gig.id)
    await post.getByLabel('Title *').fill(`E2E Fourth ${uniq()}`)
    await expectAccessible(page)
    await post.getByRole('button', { name: 'Publish' }).click()
    await expect(page.getByText('Organisations not verified yet can have 3 open posts. Close one, or wait for verification.')).toBeVisible({ timeout: LOAD })
    const { count } = await account.client.from('job_posts').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'open')
    expect(count).toBe(3)
  } finally {
    for (const id of ids) await closePost(account, id)
  }
})

// covers: T43
test('verification: the VIES check (stand-in) answers verified, or not valid', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, org } = adminWithOrg
  const checks = await stubCompanyCheck(page, { status: 'verified', name: 'E2E COMPANY LDA' })
  await page.goto(`${org.path}?panel=settings`)
  const verify = page.locator('section[aria-labelledby="org-verify-title"]')
  await expect(verify.getByRole('heading', { name: 'Verification' })).toBeVisible({ timeout: LOAD })
  await verify.getByLabel('Country').selectOption('PT')
  await verify.getByLabel('VAT number').fill('PT 501 964 843')
  await expectAccessible(page)
  await verify.getByRole('button', { name: 'Check with VIES' }).click()
  await expect(page.getByText('Verified. Your job posts now show the badge.')).toBeVisible({ timeout: LOAD })
  expect(checks).toEqual([{ org: org.id, country: 'PT', number: 'PT 501 964 843' }])

  // A number VIES doesn't know (the stand-in answering after this replaces the first)
  await stubCompanyCheck(page, { status: 'rejected' })
  await verify.getByRole('button', { name: 'Check with VIES' }).click()
  await expect(verify.getByRole('alert')).toHaveText("VIES says this number isn't a valid VAT number for that country. Check it, or ask AVX to check the company.", { timeout: LOAD })
})

// covers: T43
test('a company that had the freelancer on a gig confirms their certificate, and the profile says so', { tag: TAG }, async ({ adminWithOrg, browser, baseURL }) => {
  const { page, world, account, org } = adminWithOrg
  const person = await freelancer(world, 'extra', { certificates: [{ name: 'IPAF 3a', issuer: 'IPAF', expires_on: day(365) }] })
  const gig = await lisbonGig(account, org.id, 'Confirm certificate')
  await addToGig(account, gig.id, person, { functionTitle: 'Rigger' })
  await readBell(account)
  await stubTownSearch(page)

  await page.goto(`/org/${org.id}/crew`)
  await searchFor(page, person, { place: false })
  const found = card(page, person)
  await expect(found).toContainText(/Worked with you (once|\d+ times)/)
  await expect(found).toContainText('IPAF 3a')
  await expect(found).toContainText('self-declared')
  await found.getByRole('button', { name: 'Confirm the certificate IPAF 3a' }).click()
  await expect(page.getByText('You confirmed IPAF 3a')).toBeVisible({ timeout: LOAD })
  await expect(found).toContainText(`confirmed by ${org.name}`)
  await expectAccessible(page)

  const theirs = await pageAs(browser, person, { baseURL })
  try {
    await theirs.goto('/me/profile')
    await expect(theirs.getByText(`confirmed by ${org.name}`).first()).toBeVisible({ timeout: LOAD })
  } finally {
    await theirs.context().close()
  }
})

// covers: T43
test('a freelancer reports a job post and it disappears for them', { tag: TAG }, async ({ company, browser, baseURL }) => {
  const { account, org, world } = company
  const person = await freelancer(world, 'extra2')
  const gig = await lisbonGig(account, org.id, 'Report post')
  const title = `E2E Report me ${uniq()}`
  const id = postId(await postJob(account, gig, { title }))
  const page = await pageAs(browser, person, { baseURL })
  try {
    await page.goto('/jobs')
    const job = jobRow(page, title)
    await expect(job).toBeVisible({ timeout: LOAD })
    await job.getByRole('button', { name: `Report the job post ${title}` }).click()
    const report = page.getByRole('dialog', { name: `Report “${title}”` })
    await report.getByRole('radio', { name: 'Spam or advertising' }).check()
    await report.getByLabel('Anything AVX should know (optional)').fill('E2E: not a real job')
    await expectAccessible(page)
    await report.getByRole('button', { name: 'Send report' }).click()
    await expect(page.getByText('Thanks. AVX will look into it.')).toBeVisible({ timeout: LOAD })
    await expect(job).toHaveCount(0)
    // Still gone after a reload, on every tab
    await page.reload()
    await expect(page.locator('#jobs-found')).toHaveText(/open jobs?$/, { timeout: LOAD })
    await expect(jobRow(page, title)).toHaveCount(0)
    await page.getByRole('tab', { name: 'All open jobs' }).click()
    await expect(page.locator('#jobs-found')).toHaveText(/open jobs?$/, { timeout: LOAD })
    await expect(jobRow(page, title)).toHaveCount(0)
  } finally {
    await page.context().close()
    await closePost(account, id)
  }
})

// covers: T43
test('"Only companies I\'ve worked with": another company sees the profile but can\'t contact them', { tag: TAG }, async ({ secondCompany }) => {
  const { page, account, org, world } = secondCompany
  const person = await freelancer(world, 'worker2', { contact_from: 'known' })
  const gig = await lisbonGig(account, org.id, 'Only known')
  await stubTownSearch(page)

  await findCrewFor(page, gig, person)
  const found = card(page, person)
  await expect(found).toContainText("Only takes contact from companies they've worked with")
  await expect(found.getByRole('button', { name: `Ask if free: ${person.name}` })).toHaveCount(0)
  await expect(found.getByRole('button', { name: `Offer a place: ${person.name}` })).toHaveCount(0)
  await expectAccessible(page)
  // …and the database refuses it too
  const { error } = await account.client.rpc('contact_crew', { p_gig: gig.id, p_user: person.id, p_kind: 'availability', p_title: null, p_message: null })
  expect(error?.message).toMatch(/only takes contact from companies they have worked with/i)
})

// covers: T43
test('AVX reviews: an AVX admin approves a certificate proof and decides a reported post', { tag: TAG }, async ({ company, browser, baseURL }) => {
  const { page, account, org, world } = company
  await requireTestSupport(account)
  await makeAvxAdmin(account)
  const person = await freelancer(world, 'imp', { certificates: [{ name: 'Rigging L2', issuer: 'E2E', expires_on: day(365) }] })
  const gig = await lisbonGig(account, org.id, 'Reviews')
  const title = `E2E Reviewed ${uniq()}`
  const id = postId(await postJob(account, gig, { title }))
  try {
    // The freelancer sends a proof of the certificate and reports the post
    const theirs = await pageAs(browser, person, { baseURL })
    try {
      await theirs.goto('/me/profile')
      const [chooser] = await Promise.all([
        theirs.waitForEvent('filechooser', { timeout: LOAD }),
        theirs.getByRole('button', { name: 'Upload proof of Rigging L2' }).click({ timeout: LOAD }),
      ])
      await chooser.setFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% E2E proof\n%%EOF\n') })
      await expect(theirs.getByText('Proof sent. AVX will check it.')).toBeVisible({ timeout: LOAD })
      await expect(theirs.getByText(/proof waiting for AVX/)).toBeVisible()
      ok('Reporting the post', await person.client.rpc('report_network', { p_kind: 'job', p_id: id, p_reason: 'fake', p_note: 'E2E' }))
    } finally {
      await theirs.context().close()
    }

    // Account → AVX reviews
    await page.goto('/admin/trust')
    await expect(page.getByRole('heading', { name: 'AVX reviews' })).toBeVisible({ timeout: LOAD })
    await page.getByRole('button', { name: 'Approve Rigging L2' }).first().click()
    await expect(page.getByText('Approved').first()).toBeVisible({ timeout: LOAD })
    const reported = page.locator('article').filter({ hasText: title })
    await expect(reported).toContainText('Job post')
    await expectAccessible(page)
    await reported.getByRole('button', { name: 'Remove the post' }).click()
    await expect(page.getByText('Removed').first()).toBeVisible({ timeout: LOAD })

    const after = await pageAs(browser, person, { baseURL })
    try {
      await after.goto('/me/profile')
      await expect(after.getByText('proof checked by AVX').first()).toBeVisible({ timeout: LOAD })
    } finally {
      await after.context().close()
    }
  } finally {
    await closePost(account, id)
  }
})

// covers: T45
test('job alerts: a post that fits tells the freelancer, naming the company and not the gig; with alerts off nothing arrives', { tag: TAG }, async ({ company, browser, baseURL }) => {
  const { account, org, world } = company
  const person = await freelancer(world, 'short')
  const gig = await lisbonGig(account, org.id, 'Alerts')
  await readBell(person)
  const ids = []
  const page = await pageAs(browser, person, { baseURL })
  try {
    // On by default
    await page.goto('/me/profile')
    const alerts = page.getByRole('checkbox', { name: /Tell me about new jobs that fit me/ })
    await expect(alerts).toBeChecked({ timeout: LOAD })

    const first = `E2E Alert ${uniq()}`
    ids.push(postId(await postJob(account, gig, { title: first })))
    const told = await notification(page, new RegExp(`New job for you: ${first} at ${org.name}`))
    await expect(told).not.toContainText(gig.name)
    await expectAccessible(page)
    await told.click()
    await expect(page).toHaveURL(/\/jobs$/)
    await expect(jobRow(page, first)).toBeVisible({ timeout: LOAD })

    // Alerts off: the next post doesn't arrive
    await page.goto('/me/profile')
    await alerts.uncheck({ timeout: LOAD })
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Saved. Your profile is on.')).toBeVisible({ timeout: LOAD })
    const second = `E2E No alert ${uniq()}`
    const secondId = postId(await postJob(account, gig, { title: second }))
    ids.push(secondId)
    const { data: rows } = await person.client.from('notifications').select('id, details').eq('user_id', person.id).eq('kind', 'job_match')
    expect(rows.map(r => r.details?.title)).toContain(first)
    expect(rows.map(r => r.details?.title)).not.toContain(second)
  } finally {
    await page.context().close()
    for (const id of ids) await closePost(account, id)
  }
})

// covers: T45
test('saved search: a freelancer switching on tells the company "matches your saved search", which opens it; removing asks first', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, account, org } = adminWithOrg
  // The freelancer's profile is there, but off
  const person = await freelancer(world, 'fail', { enabled: false })
  await readBell(account)
  await stubTownSearch(page)
  const name = `E2E Riggers ${uniq()}`

  await page.goto(`/org/${org.id}/crew`)
  await searchFor(page, person)
  await expect(foundCount(page)).toHaveText('0 people found')
  await page.getByRole('button', { name: 'Save this search' }).click()
  await page.getByLabel('Name', { exact: true }).fill(name)
  await expect(page.getByRole('checkbox', { name: 'Tell me when someone new fits' })).toBeChecked()
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(`Search “${name}” saved`)).toBeVisible({ timeout: LOAD })
  await expect(page.getByRole('button', { name: `Alerts for ${name}` })).toHaveAttribute('aria-pressed', 'true')

  // The freelancer switches the profile on: the company is told, and the alert opens the search
  ok('Switching the profile on', await person.client.from('crew_profiles').update({ enabled: true }).eq('user_id', person.id))
  await page.goto('/me')
  const told = await notification(page, new RegExp(`${person.name} matches your saved search “${name}”`))
  await told.click()
  await expect(page).toHaveURL(new RegExp(`/org/${org.id}/crew\\?search=`), { timeout: LOAD })
  await expect(foundCount(page)).toHaveText('1 person found', { timeout: LOAD })
  await expect(card(page, person)).toHaveCount(1)
  await expect(page.getByLabel('Name or words')).toHaveValue(person.name)

  // Removing it asks first
  let asked = ''
  page.once('dialog', dialog => { asked = dialog.message(); dialog.accept() })
  await page.getByRole('button', { name: `Remove the saved search ${name}` }).click()
  await expect(page.getByText(`“${name}” removed`)).toBeVisible({ timeout: LOAD })
  expect(asked).toBe(`Remove the saved search “${name}”? Its alerts stop.`)
  await expect(page.getByRole('button', { name: `Run the saved search ${name}` })).toHaveCount(0)
})

// covers: T68
test('a quote\'s crew line shows the rate card cost and margin, and the Summary the crew margin; the printed quote doesn\'t', { tag: TAG }, async ({ adminWithOrg }) => {
  const { page, world, account, org } = adminWithOrg
  await riggerRate(world)
  await readBell(account)
  // 2 days of Rigger at 250 = 500; the rate card says 2 × 190 = 380, margin 120 (24 %)
  const quote = await addQuote(account, org, { title: `E2E Margins ${uniq()}`, lines: [{ kind: 'crew', description: 'Rigger', qty: 2, unit: 'day', unit_price: 250 }] })
  await page.goto(quote.path)
  await page.getByRole('tab', { name: /^Phase 1/ }).click({ timeout: LOAD })
  await expect(page.getByText('Rate card cost €380.00 · margin €120.00 (24%)')).toBeVisible({ timeout: LOAD })
  await page.getByRole('tab', { name: 'Summary' }).click()
  const margin = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'Crew margin' }) }).last()
  await expect(page.getByRole('heading', { name: 'Crew margin' })).toBeVisible()
  await expect(margin).toContainText('€380.00')
  await expect(margin).toContainText('€120.00 (24%)')
  await expectAccessible(page)

  await page.goto(`${quote.path}/print`)
  await expect(page.getByText('Rigger').first()).toBeVisible({ timeout: LOAD })
  await expect(page.getByText(/Rate card cost/)).toHaveCount(0)
  await expect(page.getByText('Crew margin')).toHaveCount(0)
})

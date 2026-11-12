// Fast set-up for the signed-in journeys: accounts, an organisation with members, a gig with crew,
// items and quotes, made straight through the database API with the public (anon) key and each
// account's own sign-in, the same calls the app makes. The access rules apply exactly as in the app;
// there is no service role here. A test then opens a page already signed in (pageAs), instead of
// clicking through sign-up and the forms every time. docs/TESTING.md, "Automated test suite".
//
// Each spec file uses its own area (accounts.js AREAS): its accounts are
// e2e-<role>-<run>-<area>@example.com and its organisation "E2E <Area> <run>", so files never share
// data and the sweep can remove one run, one shard or one area.

import { createClient } from '@supabase/supabase-js'
import { AREAS, PASSWORD, RUN, areaEmail, recordAccount, ROLES } from './accounts.js'
import { emptyLine, emptyPhase, quoteTotals } from '../../src/lib/quotes.js'

const PRODUCTION_REF = 'otmulrlslecgyezpcqxy'
const url = () => process.env.VITE_SUPABASE_URL
const key = () => process.env.VITE_SUPABASE_ANON_KEY

export function apiClient() {
  if (!url() || !key()) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must point at the TEST project (docs/TESTING.md)')
  if (url().includes(PRODUCTION_REF)) throw new Error('Refusing to set up test data on the production project')
  return createClient(url(), key(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

// Where the app keeps its sign-in in the browser (supabase-js: sb-<project ref>-auth-token)
export const authStorageKey = () => `sb-${new URL(url()).hostname.split('.')[0]}-auth-token`

const check = (what, { data, error }) => {
  if (error) throw new Error(`${what} failed: ${error.message}`)
  return data
}
const localDate = (days = 0) => {
  const d = new Date(Date.now() + days * 86400e3)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const title = area => area.charAt(0).toUpperCase() + area.slice(1)

// The test project limits sign-ups and sign-ins (HTTP 429) when several runs use it at once. Only
// that answer is tried again, after 2, 4, 8 and 16 s; any other error is returned at once.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const rateLimited = error => error?.status === 429 || /rate limit|too many requests/i.test(error?.message || '')
export async function authCall(what, call) {
  for (let attempt = 0; ; attempt++) {
    const result = await call()
    if (!rateLimited(result.error) || attempt >= 4) {
      if (rateLimited(result.error)) result.error.message = `${what}: the test project's sign-in limit was still reached after 5 tries (${result.error.message})`
      return result
    }
    await sleep(2000 * 2 ** attempt)
  }
}

// A new account (sign-up with the anon key; the test project doesn't ask to confirm the email).
// If it already exists (the same E2E_RUN run again locally) it signs in instead.
// Returns { role, area, email, name, id, client } — client is signed in as that account.
export async function createAccount(role, area, { name } = {}) {
  if (!ROLES.includes(role)) throw new Error(`Unknown test role "${role}": add it to ROLES in e2e/auth/accounts.js so the sweep removes it`)
  if (!AREAS.includes(area)) throw new Error(`Unknown test area "${area}": add it to AREAS in e2e/auth/accounts.js so the sweep removes it`)
  const email = areaEmail(role, area)
  const fullName = name || `E2E ${title(role)} ${title(area)} ${RUN}`
  const client = apiClient()
  recordAccount(role, area)
  const id = await signUpOrIn(client, { email, name: fullName }, role)
  return { role, area, email, name: fullName, id, client }
}

// Signs the client up (or in, if the address already has an account); returns the user's id
async function signUpOrIn(client, { email, name }, role) {
  const { data, error } = await authCall(`Signing up the ${role} account`,
    () => client.auth.signUp({ email, password: PASSWORD, options: { data: { full_name: name } } }))
  if (error && !/already registered|already exists/i.test(error.message)) throw new Error(`Signing up the ${role} account failed: ${error.message}`)
  if (error || !data.session) {
    if (!error && !data.session) throw new Error('Sign-up gave no session: turn off "Confirm email" on the test project (docs/TESTING.md, One-time setup)')
    check(`Signing in the ${role} account`, await authCall(`Signing in the ${role} account`,
      () => client.auth.signInWithPassword({ email, password: PASSWORD })))
  }
  const { data: { session } } = await client.auth.getSession()
  return session.user.id
}

// The older journeys' accounts (journey, import, failures: e2e-<role>-<run>@example.com, no area).
// `who` is { role, name, email }. create: sign up through the API (signs in if it already exists);
// otherwise sign in to an account made earlier (e.g. through the form). One sign-in per account and
// test worker: the tests reuse its session (signInPage, pageAs) instead of the sign-in form.
const known = new Map()
export function journeyAccount(who, { create = false } = {}) {
  if (!ROLES.includes(who.role)) throw new Error(`Unknown test role "${who.role}": add it to ROLES in e2e/auth/accounts.js so the sweep removes it`)
  if (!known.has(who.email)) {
    const p = (async () => {
      const client = apiClient()
      let id
      if (create) {
        recordAccount(who.role)
        id = await signUpOrIn(client, who, who.role)
      } else {
        const data = check(`Signing in the ${who.role} account`, await authCall(`Signing in the ${who.role} account`,
          () => client.auth.signInWithPassword({ email: who.email, password: PASSWORD })))
        id = data.user.id
      }
      return { ...who, id, client }
    })()
    p.catch(() => known.delete(who.email))
    known.set(who.email, p)
  }
  return known.get(who.email)
}

// Deletes an older journey's account at the end of its file, the way the app does (Settings → Your
// data calls the same two functions) but without opening pages that load reports first: on a busy
// test database those ran delete_my_account into its 8 s limit. Tried twice; if it still fails it
// is left for the sweep (CI runs it after every run) and the test result isn't changed by it.
export async function removeAccount(account) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { data: plan, error: planError } = await account.client.rpc('account_deletion_plan')
    const { error } = planError ? { error: planError } : await removeFilesAndAccount(account.client, plan)
    if (!error) return true
    if (attempt === 2) {
      process.stderr.write(`Deleting the ${account.role} account failed (${error.message}); the sweep will remove it.\n`)
      return false
    }
    await sleep(3000)
  }
}
async function removeFilesAndAccount(client, plan) {
  for (const gigId of plan?.gig_ids || []) {
    const { data: files } = await client.storage.from('gig-assets').list(gigId, { limit: 1000 })
    const paths = (files || []).filter(f => f.id).map(f => `${gigId}/${f.name}`)
    if (paths.length) await client.storage.from('gig-assets').remove(paths)
  }
  return client.rpc('delete_my_account')
}

// Opens the app in an existing page already signed in as the account (for tests that use the
// `page` fixture; pageAs opens a new window instead). The session is put in once per tab, so a
// later sign-out or account deletion in the same tab stays signed out.
export async function signInPage(page, account) {
  const { data: { session } } = await account.client.auth.getSession()
  if (!session) throw new Error(`The ${account.role} account has no session`)
  await page.addInitScript(([key, value]) => {
    try {
      if (sessionStorage.getItem('e2e.session')) return
      sessionStorage.setItem('e2e.session', '1')
      localStorage.setItem(key, value)
    } catch { /* not the app's page */ }
  }, [authStorageKey(), JSON.stringify(session)])
  await page.goto('/auth')
  await page.waitForURL(/\/(me|org\/[0-9a-f-]{36})$/, { timeout: 15_000 })
}

// The browser's stored sign-in for an account, plus the language, for browser.newContext({ storageState })
export async function storageStateFor(account, { baseURL, lang = 'en' }) {
  const { data: { session } } = await account.client.auth.getSession()
  if (!session) throw new Error(`The ${account.role} account has no session`)
  return {
    cookies: [],
    origins: [{
      origin: new URL(baseURL).origin,
      localStorage: [
        { name: authStorageKey(), value: JSON.stringify(session) },
        { name: 'avx.lang', value: lang },
      ],
    }],
  }
}

// A new browser window (its own context) signed in as the account. Close it with page.context().close().
export async function pageAs(browser, account, { baseURL, lang = 'en', ...contextOptions } = {}) {
  const context = await browser.newContext({ ...contextOptions, storageState: await storageStateFor(account, { baseURL, lang }) })
  return context.newPage()
}

// ---- Data, made the way the app makes it (the account's own client, so its access rules apply) ----

// An organisation; the database makes its creator the admin (handle_new_org)
export async function addOrg(account, { name } = {}) {
  const org = check('Creating the organisation', await account.client.from('organisations')
    .insert({ name: name || `E2E ${title(account.area)} ${RUN}`, created_by: account.id }).select().single())
  return { ...org, path: `/org/${org.id}` }
}

// Adds an existing account to the organisation (what Members → Invite does through send-invite,
// which calls this same function as the inviting admin). role: admin, member or viewer.
export async function addToOrg(admin, orgId, account, role) {
  const result = check(`Adding the ${account.role} account to the organisation`,
    await admin.client.rpc('invite_to_org', { p_org: orgId, p_email: account.email, p_role: role }))
  if (result !== 'added' && result !== 'already_member') throw new Error(`Adding the ${account.role} account: expected "added", got "${result}"`)
}

// A gig in the organisation; its creator becomes its PM (handle_new_gig)
export async function addGig(account, orgId, fields = {}) {
  const gig = check('Creating the gig', await account.client.from('gigs').insert({
    name: `E2E Gig ${title(account.area)} ${RUN}`, venue: 'E2E Arena', start_date: localDate(7), end_date: localDate(8),
    ...fields, org_id: orgId, created_by: account.id,
  }).select().single())
  return { ...gig, path: `/gig/${gig.id}` }
}

// Puts an existing account on a gig (Crew → Invite crew). role: crew or pm.
export async function addToGig(pm, gigId, account, { role = 'crew', functionTitle = 'Sound', callTime = null } = {}) {
  const result = check(`Adding the ${account.role} account to the gig`, await pm.client.rpc('invite_to_gig', {
    p_gig: gigId, p_email: account.email, p_role: role, p_function_title: functionTitle, p_call_time: callTime,
  }))
  if (result !== 'added' && result !== 'already_member') throw new Error(`Adding the ${account.role} account to the gig: expected "added", got "${result}"`)
}

// An equipment / price-list item (Inventory → Add item)
export async function addItem(account, orgId, fields = {}) {
  return check('Creating the item', await account.client.from('price_items').insert({
    name: `E2E Item ${RUN}`, kind: 'rental', tracking: 'bulk', unit_price: 100, ...fields, org_id: orgId, created_by: account.id,
  }).select().single())
}

// A client in Contacts
export async function addClient(account, orgId, fields = {}) {
  return check('Creating the client', await account.client.from('clients')
    .insert({ name: `E2E Client ${RUN}`, ...fields, org_id: orgId }).select().single())
}

// A quote with rental lines: lines = [{ description, qty, unit_price }]. Priced with the app's own
// quote maths (src/lib/quotes.js), like Quotes → New quote and the editor.
export async function addQuote(account, org, { title: quoteTitle, lines = [], vatRate = 23, ...fields } = {}) {
  const phase = emptyPhase('Phase 1')
  phase.sections[0].lines = lines.map(l => ({ ...emptyLine(l.kind || 'rental', vatRate), ...l }))
  const body = { phases: [phase] }
  const quote = check('Creating the quote', await account.client.from('quotes').insert({
    org_id: org.id, title: quoteTitle || `E2E Quote ${RUN}`, language: 'en', issue_date: localDate(0), valid_until: localDate(30),
    vat_rate: vatRate, body, total_net: quoteTotals({ body, vat_rate: vatRate, discount_pct: 0 }).net, ...fields,
  }).select().single())
  return { ...quote, path: `/quote/${quote.id}` }
}

// ---- One world per area: made on first use, then shared by that file's tests ----

class World {
  constructor(area) {
    this.area = area
    this.memo = new Map()
  }

  once(name, make) {
    if (!this.memo.has(name)) {
      const p = make()
      // A failed step can be tried again by the next test instead of failing every test after it
      p.catch(() => this.memo.delete(name))
      this.memo.set(name, p)
    }
    return this.memo.get(name)
  }

  account(role) { return this.once(`account:${role}`, () => createAccount(role, this.area)) }
  admin() { return this.account('admin') }
  // Found again by name if the test worker restarted after a failure (the accounts sign in again)
  org() {
    return this.once('org', async () => {
      const admin = await this.admin()
      const name = `E2E ${title(this.area)} ${RUN}`
      const { data } = await admin.client.from('organisations').select().eq('name', name).eq('created_by', admin.id).limit(1)
      return data?.[0] ? { ...data[0], path: `/org/${data[0].id}` } : addOrg(admin, { name })
    })
  }
  // An account in the organisation with this role (member, viewer; or 'extra' as another member)
  inOrg(role, orgRole = role) {
    return this.once(`inOrg:${role}`, async () => {
      const [admin, org, account] = await Promise.all([this.admin(), this.org(), this.account(role)])
      await addToOrg(admin, org.id, account, orgRole)
      return account
    })
  }
  member() { return this.inOrg('member', 'member') }
  viewer() { return this.inOrg('viewer', 'viewer') }
  gig() {
    return this.once('gig', async () => {
      const [admin, org] = await Promise.all([this.admin(), this.org()])
      const name = `E2E Gig ${title(this.area)} ${RUN}`
      const { data } = await admin.client.from('gigs').select().eq('org_id', org.id).eq('name', name).limit(1)
      return data?.[0] ? { ...data[0], path: `/gig/${data[0].id}` } : addGig(admin, org.id, { name })
    })
  }
  // Crew on the gig only: not a member of the organisation
  crew() {
    return this.once('crew', async () => {
      const [admin, gig, crew] = await Promise.all([this.admin(), this.gig(), this.account('crew')])
      await addToGig(admin, gig.id, crew)
      return crew
    })
  }
  // Another company: its own admin and organisation, unrelated to this area's organisation
  other() { return this.account('other') }
  otherOrg() {
    return this.once('otherOrg', async () => {
      const other = await this.other()
      const name = `E2E Other ${title(this.area)} ${RUN}`
      const { data } = await other.client.from('organisations').select().eq('name', name).eq('created_by', other.id).limit(1)
      return data?.[0] ? { ...data[0], path: `/org/${data[0].id}` } : addOrg(other, { name })
    })
  }
}

const worlds = new Map()
export function worldFor(area) {
  if (!AREAS.includes(area)) throw new Error(`Unknown test area "${area}": add it to AREAS in e2e/auth/accounts.js`)
  if (!worlds.has(area)) worlds.set(area, new World(area))
  return worlds.get(area)
}

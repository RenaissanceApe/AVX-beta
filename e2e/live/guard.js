// The live check's read-only guard and helpers (docs/TESTING.md, "Live check").
//
// The live check signs two dedicated accounts in to the PRODUCTION app. Nothing it does may
// create, change or delete anything there, so every test routes the browser's requests through
// readOnlyGuard(): a request that would write is aborted before it leaves the browser and
// recorded, and the test fails at the end naming it (method + path only, never the query
// string or body).
//
// Log nothing personal: no emails, tokens, phone numbers or signed URLs. Messages here name
// roles, screens, methods and paths only.

import { expect } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'

// The company id the manager test found, for the crew test if the crew account isn't a member
// (the files run in order: 1-manager, then 2-crew)
export const ORG_ID_FILE = join(tmpdir(), 'avx-live-check-org-id')

export const ORG_NAME = process.env.LIVE_ORG_NAME || 'AVX TEST CO.'

// The accounts come from GitHub Actions secrets. A missing one fails the run clearly instead of
// skipping the tests (a skipped live check would look like a passing one).
export function liveAccount(role) {
  const email = process.env[role === 'manager' ? 'LIVE_MANAGER_EMAIL' : 'LIVE_CREW_EMAIL']
  const password = process.env.LIVE_PASSWORD
  const missing = [
    !email && (role === 'manager' ? 'LIVE_MANAGER_EMAIL' : 'LIVE_CREW_EMAIL'),
    !password && 'LIVE_PASSWORD',
  ].filter(Boolean)
  if (missing.length) throw new Error(`Live check: missing ${missing.join(' and ')} (GitHub Actions secrets)`)
  return { email, password }
}

// Database functions the app calls through POST /rest/v1/rpc/<name> that can WRITE. This is every
// function in the public schema marked VOLATILE (the ones Postgres lets write) that a signed-in
// person may call, read from the test project's catalogue on 2026-11-11 with:
//   select proname from pg_proc join pg_namespace n on n.oid = pronamespace
//    where nspname = 'public' and provolatile = 'v' and prokind = 'f'
//      and has_function_privilege('authenticated', pg_proc.oid, 'execute')
// Every other function is STABLE or IMMUTABLE, so Postgres refuses to let it write. A new
// volatile function the app calls on a screen this check opens must be added here.
export const WRITE_RPCS = new Set(`
  ack_message add_from_network add_gig_member_to_org answer_application answer_crew_call
  answer_hire_request apply_job block_user calendar_feed cancel_quote claim_send clear_crew_profile
  clients_from_quotes close_crew_call close_job confirm_certificate contact_crew context_conversation
  create_report_link create_supplier_link decide_expense_claim decide_leave decide_network_report
  decide_verification delete_my_account department_channel dispatch_scan draft_recurring_expenses_now
  edit_message ensure_expense_categories gig_conversation guest_post guest_thread import_crew
  import_jobs invite_to_gig invite_to_org lift_suspension link_supplier mark_crew_fee_paid
  mark_fee_received mark_speaker_rigging_checked mark_units_lost moderate_message order_inputs
  partner_code pin_message publish_call_sheet publish_job react read_conversation remove_message
  remove_push_subscription remove_quote report_damage report_message report_network
  request_manual_verification restore_quote review_certificate_proof review_time_entry revise_quote
  revoke_report_link revoke_supplier_link revoke_verification run_import save_org_channel
  save_push_subscription search_crew send_crew_call set_message_retention set_vehicle_loads
  start_direct start_vies_check step_scan submit_certificate_proof toggle_saved track_usage
  undo_import undo_scan withdraw_application
`.trim().split(/\s+/))

// Writes the app makes by itself when one of the opened screens loads (not because the check
// clicked anything). They are blocked like every other write, so they never reach production,
// and listed in the test's annotations, but they don't fail the check: they would fail every run.
//  - ensure_expense_categories: Expenses adds the starter categories the first time it opens
//    (src/lib/expenses.js loadCategories); blocked, the screen still loads the list
//  - track_usage: anonymous screen counts; the check also sends Global Privacy Control, which
//    switches them off in the app (src/lib/usage.js), so it shouldn't appear at all
export const ON_LOAD_WRITES = new Set(['ensure_expense_categories', 'track_usage'])

// Edge Function calls that only read, by function and the body's action. Invoices (admins) asks
// the invoicing function which programs are switched on: { action: 'providers' } reads nothing else.
const READ_FUNCTION_ACTIONS = { invoicing: ['providers'] }

// What a request would do, or null when it only reads. body: the request's JSON body, if any.
export function writeKind(method, url, body = null) {
  const { pathname } = new URL(url)
  const m = method.toUpperCase()
  const reading = m === 'GET' || m === 'HEAD' || m === 'OPTIONS'
  if (pathname.startsWith('/auth/v1/')) {
    // Signing in and out is allowed; signing up, changing the account or a password is not
    if (reading || pathname === '/auth/v1/token' || pathname === '/auth/v1/logout') return null
    return 'auth'
  }
  if (pathname.startsWith('/rest/v1/rpc/')) {
    const name = pathname.slice('/rest/v1/rpc/'.length)
    if (reading || !WRITE_RPCS.has(name)) return null
    return ON_LOAD_WRITES.has(name) ? 'on-load' : 'rpc'
  }
  if (pathname.startsWith('/rest/v1/')) return reading ? null : 'table'
  if (pathname.startsWith('/storage/v1/')) return reading ? null : 'storage'
  // Edge Functions send email and push, talk to invoicing programs and mark quotes viewed: only
  // the calls listed above (and the calendar feed file, a GET) are let through
  if (pathname.startsWith('/functions/v1/')) {
    const name = pathname.slice('/functions/v1/'.length)
    if (m === 'GET' && name === 'calendar-feed') return null
    if (m === 'POST' && READ_FUNCTION_ACTIONS[name]?.includes(body?.action)) return null
    return 'function'
  }
  return null
}

// Route every request of the page's context through the guard. Returns what it saw.
export async function readOnlyGuard(page) {
  // supabase: the project's address and public (anon) key, taken from the app's own requests for
  // the privacy reads; never printed
  const seen = { blocked: [], onLoad: [], serverErrors: [], pageErrors: [], supabase: null }
  // The app skips its anonymous usage counts when the browser asks not to be tracked
  await page.addInitScript(() => {
    try { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }) } catch { /* ignore */ }
    try { if (!localStorage.getItem('avx.lang')) localStorage.setItem('avx.lang', 'en') } catch { /* ignore */ }
  })
  await page.context().route('**/*', async route => {
    const request = route.request()
    if (!seen.supabase && new URL(request.url()).pathname.startsWith('/rest/v1/') && request.headers().apikey) {
      seen.supabase = { origin: new URL(request.url()).origin, apikey: request.headers().apikey }
    }
    let body = null
    try { body = request.postDataJSON() } catch { /* not JSON */ }
    const kind = writeKind(request.method(), request.url(), body)
    if (!kind) return route.continue()
    const what = `${request.method()} ${new URL(request.url()).pathname}`
    if (kind === 'on-load') seen.onLoad.push(what)
    else seen.blocked.push(what)
    return route.abort('blockedbyclient')
  })
  page.on('response', response => {
    if (response.status() < 500) return
    const { host, pathname } = new URL(response.url())
    seen.serverErrors.push(`${response.status()} ${response.request().method()} ${host}${pathname}`)
  })
  // Uncaught errors in the app (the message only: it holds no personal data)
  page.on('pageerror', error => seen.pageErrors.push(String(error.message).slice(0, 200)))
  return seen
}

// At the end of a test: nothing was written, nothing crashed, no server failed
export function expectClean(seen, testInfo) {
  const onLoad = [...new Set(seen.onLoad)]
  if (onLoad.length) testInfo.annotations.push({ type: 'blocked on-load writes', description: onLoad.join(', ') })
  expect(seen.blocked, 'requests that would have written to production (blocked)').toEqual([])
  expect(seen.pageErrors, 'uncaught errors in the app').toEqual([])
  expect(seen.serverErrors, '5xx answers from Supabase or Vercel').toEqual([])
}

// Sign in through the real form
export async function signIn(page, account) {
  await page.goto('/auth')
  await page.getByPlaceholder('you@company.com').fill(account.email)
  await page.getByPlaceholder('••••••••').fill(account.password)
  await page.locator('form').getByRole('button', { name: /Sign In/ }).click()
  await expect(page, 'signing in failed (check the LIVE_* secrets)').toHaveURL(/\/(me|org\/[0-9a-f-]{36})$/, { timeout: 30_000 })
}

// Sign out from Settings (ends the session on the server too)
export async function signOut(page) {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page).toHaveURL(/\/auth$/, { timeout: 15_000 })
}

// Open the test company from the app's own list of organisations; returns its id, or null if
// this account isn't a member
export async function openOrg(page) {
  await page.goto('/orgs')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  const card = page.locator('.org-card', { has: page.getByText(ORG_NAME, { exact: true }) })
  // The list loads after the heading; give it time before deciding this account isn't a member
  if (!(await card.first().waitFor({ timeout: 20_000 }).then(() => true, () => false))) return null
  await card.first().getByRole('button', { name: 'Open' }).click()
  await expect(page).toHaveURL(/\/org\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  return new URL(page.url()).pathname.split('/')[2]
}

const BROKEN = /Something went wrong|couldn.t be loaded/i

// A screen opened and drew: no loading sign left, no error boundary or error message
export async function expectRenders(page, path) {
  await page.goto(path)
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await expect(page.locator('main, [role="main"], h1').first(), `${path} drew nothing`).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('status', { name: 'Loading', exact: true }), `${path} kept loading`).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByText(BROKEN), `${path} shows an error`).toHaveCount(0)
}

// The same check the PR e2e tests use: serious or critical accessibility findings fail
export async function expectAccessible(page, path) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`), `accessibility on ${path}`).toEqual([])
}

// The signed-in session as the app keeps it (Supabase's sb-<ref>-auth-token in localStorage),
// for the privacy reads. Never printed.
export async function sessionOf(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => /^sb-.+-auth-token$/.test(k))
    const session = key && JSON.parse(localStorage.getItem(key))
    return session ? { token: session.access_token, userId: session.user?.id } : null
  })
}

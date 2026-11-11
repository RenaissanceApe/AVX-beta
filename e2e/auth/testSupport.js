// The test-only database functions (supabase/tests/support/test_support.sql), which the owner
// installs by hand on the TEST project. Until they are there, a test that needs them skips with
// "test_support not installed". docs/TESTING.md, "Automated test suite".
import { test } from '@playwright/test'

const NOT_INSTALLED = 'test_support not installed: run supabase/tests/support/test_support.sql on the TEST project and add test_support to its exposed schemas (docs/TESTING.md)'
const known = new Map()

// Skip this test unless test_support is installed. `account` is a set-up account (setup.js).
export async function requireTestSupport(account) {
  if (!known.has('installed')) {
    const { data, error } = await account.client.schema('test_support').rpc('installed')
    known.set('installed', !error && !!data)
  }
  test.skip(!known.get('installed'), NOT_INSTALLED)
}

// Call one function as the account; throws with the database's message if it refuses
export async function callTestSupport(account, fn, args = {}) {
  await requireTestSupport(account)
  const { data, error } = await account.client.schema('test_support').rpc(fn, args)
  if (error) throw new Error(`test_support.${fn} failed: ${error.message}`)
  return data
}

// The account becomes an AVX admin (private.avx_admins); removed with the account
export const makeAvxAdmin = account => callTestSupport(account, 'make_me_avx_admin')
// Put something's expiry in the past. kind: held_invite, quote_share, report_link, certificate_proof,
// certificate_confirmation, inspection (see the SQL file for what each moves)
export const expire = (account, kind, id, days = 1) => callTestSupport(account, 'expire', { p_kind: kind, p_id: id, p_days: days })
// The daily jobs, for the account's own organisation only (the account must be its admin and every
// member a test account)
export const runRecurringExpenses = (account, orgId) => callTestSupport(account, 'run_recurring_expenses', { p_org: orgId })
export const runOverdueInvoiceReminders = (account, orgId) => callTestSupport(account, 'run_overdue_invoice_reminders', { p_org: orgId })
export const runHeldInviteReminders = (account, orgId) => callTestSupport(account, 'run_held_invite_reminders', { p_org: orgId })
export const runMaintenanceReminders = (account, orgId) => callTestSupport(account, 'run_maintenance_reminders', { p_org: orgId })
// What the morning email summary would hold for each member: [{ user_id, kind, notifications, opted_out, muted }]
export const emailSummaryCandidates = (account, orgId) => callTestSupport(account, 'email_summary_candidates', { p_org: orgId })

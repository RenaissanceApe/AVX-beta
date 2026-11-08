#!/usr/bin/env node
// Deletes the test accounts one run created on the Supabase TEST project, and what they own
// (organisations they're the only member of, their gigs' files), the same way a person deletes
// their own account in Settings → Your data. It only signs in to e2e-<role>-<tag>@example.com
// for the roles in e2e/auth/accounts.js, so nothing made by another run or a person is touched.
// Refuses the production project. Logs roles and counts only, never emails.
//
//   VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node scripts/e2e-sweep.mjs <tag>
//
// CI runs it after the signed-in tests with the run's tag (E2E_RUN). A worker who made accounts
// by hand on the test project (docs/PARALLEL.md) runs it with their own tag before the PR.

import { createClient } from '@supabase/supabase-js'
import { ROLES, PASSWORD, testEmail } from '../e2e/auth/accounts.js'

const PRODUCTION_REF = 'otmulrlslecgyezpcqxy'
const BUCKET = 'gig-assets'
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const tag = (process.argv[2] || '').toLowerCase()

if (!url || !key || !/^[a-z0-9-]{3,40}$/.test(tag)) {
  console.error('Usage: VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node scripts/e2e-sweep.mjs <tag>  (tag: 3–40 of a-z, 0-9, -)')
  process.exit(2)
}
if (url.includes(PRODUCTION_REF)) {
  console.error('Refusing to sweep: this is the production project.')
  process.exit(2)
}

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function removeGigFiles(supabase, gigIds) {
  for (const gigId of gigIds || []) {
    for (;;) {
      const { data: files, error } = await supabase.storage.from(BUCKET).list(gigId, { limit: 1000 })
      if (error) throw new Error(`listing a gig's files failed: ${error.message}`)
      const paths = (files || []).filter(f => f.id).map(f => `${gigId}/${f.name}`)
      if (!paths.length) break
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths)
      if (removeError) throw new Error(`removing a gig's files failed: ${removeError.message}`)
      if (files.length < 1000) break
    }
  }
}

// 'gone' (no such account), 'deleted', or 'blocked' (still the only admin of an organisation
// with other members: try again after those members are deleted)
async function sweep(role) {
  const supabase = client()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: testEmail(role, tag), password: PASSWORD })
  if (signInError) {
    if (/invalid login credentials/i.test(signInError.message)) return 'gone'
    throw new Error(`${role}: signing in failed: ${signInError.message}`)
  }
  const { data: plan, error: planError } = await supabase.rpc('account_deletion_plan')
  if (planError) throw new Error(`${role}: reading the deletion plan failed: ${planError.message}`)
  if (plan?.blocking_orgs?.length) {
    await supabase.auth.signOut({ scope: 'local' })
    return 'blocked'
  }
  await removeGigFiles(supabase, plan?.gig_ids)
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw new Error(`${role}: deleting the account failed: ${error.message}`)
  await supabase.auth.signOut({ scope: 'local' })
  return 'deleted'
}

let left = [...ROLES]
const deleted = []
for (let pass = 0; pass < 3 && left.length; pass++) {
  const next = []
  for (const role of left) {
    const result = await sweep(role)
    if (result === 'deleted') deleted.push(role)
    if (result === 'blocked') next.push(role)
  }
  if (next.length === left.length) break
  left = next
}

console.log(`Sweep for run ${tag}: ${deleted.length} test account(s) deleted${deleted.length ? ` (${deleted.join(', ')})` : ''}.`)
if (left.length) {
  console.error(`Still there, blocked by another member: ${left.join(', ')}. Delete it by hand (docs/TESTING.md).`)
  process.exit(1)
}

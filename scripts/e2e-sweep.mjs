#!/usr/bin/env node
// Deletes the test accounts one run created on the Supabase TEST project, and what they own
// (organisations they're the only member of, their gigs' files), the same way a person deletes
// their own account in Settings → Your data. It only signs in to e2e-<role>-<tag>@example.com and
// e2e-<role>-<tag>-<area>@example.com for the roles and areas in e2e/auth/accounts.js, so nothing
// made by another run or a person is touched. Refuses the production project. Logs roles, areas and
// counts only, never emails.
//
//   VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node scripts/e2e-sweep.mjs <tag>
//
// <tag> is a run (E2E_RUN: every account it made, in every area), or <run>-<area> for one area
// only. When the run left its list of accounts (.e2e-accounts/<tag>.txt, written by the set-up),
// only those are tried; without it every role in every area is (slower: each try is a sign-in).
// CI runs it after the signed-in tests with the run's (or shard's) tag. A worker who made accounts
// by hand on the test project (docs/PARALLEL.md) runs it with their own tag before the PR.

import { readFileSync, rmSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { PASSWORD, manifestPath, sweepTargets } from '../e2e/auth/accounts.js'

const PRODUCTION_REF = 'otmulrlslecgyezpcqxy'
const BUCKET = 'gig-assets'
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const tag = (process.argv[2] || '').toLowerCase()

if (!url || !key || !/^[a-z0-9-]{2,60}$/.test(tag)) {
  console.error('Usage: VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node scripts/e2e-sweep.mjs <tag>  (tag: 2–60 of a-z, 0-9, -)')
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const rateLimited = error => error?.status === 429 || /rate limit|too many/i.test(error?.message || '')

// The test project limits sign-ins per address in a few minutes: wait and try again
async function signIn(supabase, target) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await supabase.auth.signInWithPassword({ email: target.email, password: PASSWORD })
    if (!error || !rateLimited(error) || attempt >= 6) return error
    console.log(`Sign-in limit reached; waiting a minute (try ${attempt} of 5).`)
    await sleep(60_000)
  }
}

// A busy test database cancels a call at its 8 s limit (57014) or answers 5xx: worth another pass
const busy = (error, status) => error?.code === '57014' || status >= 500 || /statement timeout/i.test(error?.message || '')

// 'gone' (no such account), 'deleted', 'blocked' (still the only admin of an organisation
// with other members: try again after those members are deleted) or 'busy' (the database
// was too busy: try again on the next pass)
async function sweep(target) {
  const role = target.area ? `${target.role} (${target.area})` : target.role
  const supabase = client()
  const signInError = await signIn(supabase, target)
  if (signInError) {
    if (/invalid login credentials/i.test(signInError.message)) return 'gone'
    throw new Error(`${role}: signing in failed: ${signInError.message}`)
  }
  const { data: plan, error: planError, status: planStatus } = await supabase.rpc('account_deletion_plan')
  if (busy(planError, planStatus)) return 'busy'
  if (planError) throw new Error(`${role}: reading the deletion plan failed: ${planError.message}`)
  if (plan?.blocking_orgs?.length) {
    await supabase.auth.signOut({ scope: 'local' })
    return 'blocked'
  }
  await removeGigFiles(supabase, plan?.gig_ids)
  const { error, status } = await supabase.rpc('delete_my_account')
  if (busy(error, status)) return 'busy'
  if (error) throw new Error(`${role}: deleting the account failed: ${error.message}`)
  await supabase.auth.signOut({ scope: 'local' })
  return 'deleted'
}

let manifest = null
try { manifest = readFileSync(manifestPath(tag), 'utf8') } catch { /* no list: try every role and area */ }

const label = t => (t.area ? `${t.role} (${t.area})` : t.role)
let left = sweepTargets(tag, manifest)
console.log(`Sweep for run ${tag}: trying ${left.length} address(es)${manifest == null ? ' (no account list from the run)' : ''}.`)
const deleted = []
let busyNow = false
for (let pass = 0; pass < 4 && left.length; pass++) {
  const next = []
  for (const target of left) {
    const result = await sweep(target)
    if (result === 'deleted') deleted.push(label(target))
    if (result === 'blocked' || result === 'busy') next.push(target)
    if (result === 'busy') busyNow = true
  }
  if (next.length === left.length && !busyNow) break
  left = next
  // The database was busy: give it a moment before the next pass
  if (busyNow && left.length) { console.log('The test database was busy; trying again in 20 s.'); await sleep(20_000) }
  busyNow = false
}

console.log(`Sweep for run ${tag}: ${deleted.length} test account(s) deleted${deleted.length ? ` (${deleted.join(', ')})` : ''}.`)
if (left.length) {
  console.error(`Still there (blocked by another member, or the database stayed busy): ${left.map(label).join(', ')}. Delete it by hand (docs/TESTING.md).`)
  process.exit(1)
}
if (manifest != null) rmSync(manifestPath(tag), { force: true })

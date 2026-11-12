// Test accounts for the signed-in journeys, shared with scripts/e2e-sweep.mjs.
//
// Every account a run creates is e2e-<role>-<run>@example.com, or e2e-<role>-<run>-<area>@example.com
// for the accounts the set-up makes per spec file (e2e/auth/setup.js), all with the same password.
// The run tag comes from E2E_RUN (CI sets it to the GitHub run and shard, so the sweep step after the
// tests knows exactly which accounts this run made); without it a random tag is used. The sweep signs
// in only to these addresses, so it can never touch an account another run or a person created.

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const RUN = (process.env.E2E_RUN || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`).toLowerCase()
export const PASSWORD = 'e2e-Password-123'

// Members first: an organisation's only admin can't delete their account while others are in it.
// The set-up's roles (member … extra2, admin) come after the older journeys' own roles.
export const ROLES = ['tech', 'newbie', 'fail', 'short', 'imp', 'worker', 'worker2', 'worker3',
  'member', 'viewer', 'crew', 'crew2', 'extra', 'extra2', 'other', 'pm', 'admin']

// One per spec file that uses the set-up (e2e/auth/<area>.spec.js). A new area goes here first, so
// the sweep knows its accounts. Lower case letters only.
export const AREAS = ['foundation', 'gigs', 'messages', 'quotes', 'inventory', 'import', 'marketplace',
  'hours', 'reports', 'fieldtools', 'vehicles', 'settings']

export const testEmail = (role, run = RUN) => `e2e-${role}-${run}@example.com`
export const areaEmail = (role, area, run = RUN) => testEmail(role, `${run}-${area}`)

// Each account a run creates is written down here before it's made, one "role area" per line (no
// area for the older journeys' accounts), so the sweep tries exactly those instead of every role in every area (each try is a sign-in, and
// the test project limits sign-ins per address). Not committed (.gitignore).
export const MANIFEST_DIR = '.e2e-accounts'
export const manifestPath = (run = RUN) => join(MANIFEST_DIR, `${run}.txt`)

export function recordAccount(role, area = '', run = RUN) {
  try {
    mkdirSync(MANIFEST_DIR, { recursive: true })
    appendFileSync(manifestPath(run), `${role} ${area}\n`)
  } catch { /* the sweep falls back to trying every role and area */ }
}

// Which addresses the sweep tries for a tag, members before admins. `manifest` is the text of the
// run's manifest file, or null when there's none (then every role in every area is tried).
// A tag that already names an area (<run>-<area>) is swept on its own, without areas added to it.
export function sweepTargets(tag, manifest) {
  const order = role => (ROLES.indexOf(role) < 0 ? ROLES.length : ROLES.indexOf(role))
  const seen = new Set()
  const targets = []
  const add = (role, area) => {
    const email = area ? areaEmail(role, area, tag) : testEmail(role, tag)
    if (!seen.has(email)) { seen.add(email); targets.push({ role, area, email }) }
  }
  // With the run's list, exactly the accounts on it: every account a run makes is written down first
  // (the area set-up and the older journeys' journeyAccount, the journey's form sign-up). Without
  // one (an older run, or a worker's hand-made accounts) every role is tried with no area too.
  const namesArea = AREAS.some(a => tag.endsWith(`-${a}`))
  if (manifest == null) for (const role of ROLES) add(role, '')
  if (manifest != null) {
    for (const line of manifest.split('\n')) {
      const [role, area = ''] = line.trim().split(/\s+/)
      if (role && /^[a-z0-9]+$/.test(role) && /^[a-z]*$/.test(area)) add(role, area)
    }
  } else if (!namesArea) {
    for (const area of AREAS) for (const role of ROLES) add(role, area)
  }
  return targets.sort((a, b) => order(a.role) - order(b.role))
}

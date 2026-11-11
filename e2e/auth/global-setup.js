// Before a signed-in run (playwright.config.js, E2E_AUTH=1): start this run's account list
// (.e2e-accounts/<run>.txt), even if no test adds to it, so the sweep afterwards knows the run was
// here and tries only the accounts listed plus the older journeys' own, instead of every role in
// every area.
import { mkdirSync, appendFileSync } from 'node:fs'
import { MANIFEST_DIR, manifestPath } from './accounts.js'

export default function globalSetup() {
  mkdirSync(MANIFEST_DIR, { recursive: true })
  appendFileSync(manifestPath(), '')
}

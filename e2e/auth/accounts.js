// Test accounts for the signed-in journeys, shared with scripts/e2e-sweep.mjs.
//
// Every account a run creates is e2e-<role>-<run>@example.com with the same password. The run tag
// comes from E2E_RUN (CI sets it to the GitHub run, so the sweep step after the tests knows exactly
// which accounts this run made); without it a random tag is used. The sweep signs in only to
// these addresses, so it can never touch an account another run or a person created.

export const RUN = (process.env.E2E_RUN || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`).toLowerCase()
export const PASSWORD = 'e2e-Password-123'

// Members first: an organisation's only admin can't delete their account while others are in it
export const ROLES = ['tech', 'newbie', 'fail', 'short', 'imp', 'worker', 'worker2', 'worker3', 'pm']

export const testEmail = (role, run = RUN) => `e2e-${role}-${run}@example.com`

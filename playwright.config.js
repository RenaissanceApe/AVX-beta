import { defineConfig, devices } from '@playwright/test'

// Browser tests against the production build (`npm run build` first).
// - default: smoke tests that need no account (e2e/*.spec.js)
// - E2E_AUTH=1: signed-in journeys in e2e/auth/, against the Supabase TEST project.
//   Build with that project's URL/key first — see docs/TESTING.md.
const authRun = !!process.env.E2E_AUTH

export default defineConfig({
  testDir: authRun ? 'e2e/auth' : 'e2e',
  // e2e/live is the read-only check of the live app (playwright.live.config.js), never run here
  testIgnore: authRun ? ['live/**'] : ['auth/**', 'live/**'],
  // Signed-in runs start their list of test accounts for the sweep (e2e/auth/global-setup.js)
  globalSetup: authRun ? './e2e/auth/global-setup.js' : undefined,
  timeout: authRun ? 90_000 : 30_000,
  // Signed-in runs share the test project with other runs: a save there can take up to the
  // database's 8 s statement limit and still succeed, so a check waits 10 s instead of 5 (#194).
  // A save that fails still shows its error and fails the test; there are no retries.
  expect: { timeout: authRun ? 10_000 : 5_000 },
  retries: process.env.CI && !authRun ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Use a pre-installed Chromium when provided (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium)
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  // Signed-in journeys create real users, so they run once (desktop) and in order
  projects: authRun
    ? [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
      ],
  workers: authRun ? 1 : undefined,
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/auth',
    reuseExistingServer: !process.env.CI,
  },
})

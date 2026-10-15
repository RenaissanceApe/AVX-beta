import { defineConfig, devices } from '@playwright/test'

// Browser tests against the production build (`npm run build` first).
// - default: smoke tests that need no account (e2e/*.spec.js)
// - E2E_AUTH=1: signed-in journeys in e2e/auth/, against the Supabase TEST project.
//   Build with that project's URL/key first — see docs/TESTING.md.
const authRun = !!process.env.E2E_AUTH

export default defineConfig({
  testDir: authRun ? 'e2e/auth' : 'e2e',
  testIgnore: authRun ? [] : ['auth/**'],
  timeout: authRun ? 90_000 : 30_000,
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

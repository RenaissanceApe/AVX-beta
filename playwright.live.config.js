import { defineConfig, devices } from '@playwright/test'

// Live check (docs/TESTING.md): read-only tests against the LIVE app, started by hand from the
// "Live check" workflow after a release. Never part of PR CI (playwright.config.js ignores e2e/live).
// LIVE_BASE_URL defaults to production; a local address (http://localhost:4173) starts the
// preview of the current build instead, for trying the specs against the TEST project.
const baseURL = process.env.LIVE_BASE_URL || 'https://avx-beta.vercel.app'
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseURL)

export default defineConfig({
  testDir: 'e2e/live',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  // manager first: it records the company's id for the crew test
  projects: [{ name: 'live' }],
  webServer: local
    ? { command: `npx vite preview --port ${new URL(baseURL).port || 4173} --strictPort`, url: `${baseURL.replace(/\/$/, '')}/auth`, reuseExistingServer: true }
    : undefined,
})

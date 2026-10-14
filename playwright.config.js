import { defineConfig, devices } from '@playwright/test'

// Browser smoke tests against the production build (`npm run build` first).
// They cover what works without a signed-in user; flows that need accounts and data
// (sign-up, invites, uploads) need a separate Supabase test project — see ROADMAP.md.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Use a pre-installed Chromium when provided (e.g. PW_CHROMIUM_PATH=/opt/pw-browsers/chromium)
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/auth',
    reuseExistingServer: !process.env.CI,
  },
})

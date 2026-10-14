import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Unit tests only; browser tests in e2e/ run with Playwright (npm run test:e2e)
  test: { include: ['src/**/*.test.{js,jsx}'] },
})

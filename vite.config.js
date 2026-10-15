import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Service worker: caches the app itself so it opens without a connection.
    // Gig data and files are cached by the app (src/lib/offline.js), not here,
    // so nothing user-specific ends up in the service worker cache.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // we ship public/manifest.webmanifest
      injectRegister: null, // registered in src/main.jsx
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/assets\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  // Unit tests only; browser tests in e2e/ run with Playwright (npm run test:e2e)
  test: { include: ['src/**/*.test.{js,jsx}'] },
})

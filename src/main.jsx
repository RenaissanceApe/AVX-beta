import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring'
import { themeCss } from './theme/tokens'
import { applyAppearance } from './lib/appearance'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/500.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'

initMonitoring()

// The colour themes as CSS variables, then the person's appearance choices (docs/HELP.md, H3)
const themeStyle = document.createElement('style')
themeStyle.id = 'avx-themes'
themeStyle.textContent = themeCss()
document.head.appendChild(themeStyle)
applyAppearance()

// Service worker (production builds only): lets the app open without a connection.
// A new version is looked for when the app starts and each time it comes back to the screen
// (an installed app or a tab left open is often never restarted); once found, the page
// reloads into it. Not while it's on screen, so nobody is interrupted mid-edit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {})
      })
    },
  }))
}

const root = document.getElementById('root')
createRoot(root).render(<StrictMode><App /></StrictMode>)

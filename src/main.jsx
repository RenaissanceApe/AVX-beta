import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { initMonitoring } from './lib/monitoring'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-sans/800.css'

initMonitoring()

// Service worker (production builds only): lets the app open without a connection
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }))
}

const root = document.getElementById('root')
createRoot(root).render(<StrictMode><App /></StrictMode>)

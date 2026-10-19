// App-wide settings. Values that differ per deployment come from VITE_* env vars.

export const APP_NAME = 'AVX'
export const COMPANY_NAME = 'Lumen and Pixel, Lda.'
export const COMPANY_COUNTRY = 'Portugal'

// Contact for privacy / support requests shown on the legal pages.
// Set VITE_CONTACT_EMAIL in Vercel (and .env) — the pages hide the line if it's empty.
export const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || ''

// Optional error monitoring (https://sentry.io). Leave unset to disable.
export const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || ''

export const LEGAL_LAST_UPDATED = '2026-10-19'

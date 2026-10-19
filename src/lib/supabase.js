import { createClient } from '@supabase/supabase-js'

// Injected at build time from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).
// Database schema and access rules: supabase/migrations/
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — see SETUP.md')
}

// With no connection, fail at once. The database client retries failed reads three times
// (1 s, 2 s, 4 s) before giving up, which kept the app on a spinner for ~7 s offline instead
// of showing the saved copies. An "AbortError" isn't retried; isNetworkError() still sees it.
function offlineAwareFetch(input, init) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new DOMException('Failed to fetch (offline)', 'AbortError'))
  }
  return fetch(input, init)
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: offlineAwareFetch } })

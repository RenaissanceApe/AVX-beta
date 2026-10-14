import { createClient } from '@supabase/supabase-js'

// Injected at build time from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example).
// Database schema and access rules: supabase/migrations/
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — see SETUP.md')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

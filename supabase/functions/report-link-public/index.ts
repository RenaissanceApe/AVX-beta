// report-link-public: the accountant's read-only page (/r/<token>, K9). No sign-in: the random token
// in the link is the only key, and it is looked up by its SHA-256 hash (like quote links).
//
// POST { t } → the numbers of the link's period (public.report_link_view), or { state: 'not_found' }.
// Unknown, revoked and expired links all answer the same way and show nothing, so the page gives
// nobody a hint about which links exist. JWT verification is off for this function.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

const ALLOWED_ORIGINS = [
  'https://avx-beta.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
const PREVIEW_ORIGIN = /^https:\/\/avx-beta-[a-z0-9-]+\.vercel\.app$/

function corsHeaders(origin: string | null) {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin))
  return {
    'Access-Control-Allow-Origin': ok ? origin! : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  })
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400, origin)
  }
  const token = String(body.t ?? '')
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return json({ state: 'not_found' }, 404, origin)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    global: { fetch: fetchWithTimeout }, auth: { persistSession: false },
  })
  const { data, error } = await admin.rpc('report_link_view', { p_hash: await sha256Hex(token) })
  if (error) {
    console.error(JSON.stringify({ fn: 'report-link-public', step: 'load', code: error.code, timeout: isTimeout(error) }))
    return json({ error: isTimeout(error) ? 'timeout' : 'failed' }, isTimeout(error) ? 504 : 500, origin)
  }
  if (!data) return json({ state: 'not_found' }, 404, origin)
  console.log(JSON.stringify({ fn: 'report-link-public', step: 'view' }))
  return json({ state: 'ok', report: data }, 200, origin)
})

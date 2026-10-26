// vies-check: checks an organisation's EU VAT number against the EU's VIES service and, when it
// is valid, marks the organisation verified (docs/CREW_NETWORK.md, N4).
// POST { org, country, number } from an organisation admin (JWT verification on).
//   1. start_vies_check, as the admin: checks they're an admin with two-step sign-in where they
//      have it, cleans the number, limits checks to 5 a day, and records the request
//   2. VIES's REST API, from here
//   3. record_vies_result, with the service role (no person can record an answer)
// Answers { status: verified | rejected | error, name }. Logs carry the outcome only.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { readVies } from '../_shared/vies.ts'

const ALLOWED_ORIGINS = [
  'https://avx-beta.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
const PREVIEW_ORIGIN = /^https:\/\/avx-beta-[a-z0-9-]+\.vercel\.app$/
const allowedOrigin = (origin: string | null) =>
  origin && (ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin)) ? origin : ALLOWED_ORIGINS[0]

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': allowedOrigin(origin),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
})
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const VIES = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number'

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)
  const body = await req.json().catch(() => ({}))

  // As the person: their rights, their two-step sign-in, their limits
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
  })
  const { data: started, error } = await asUser.rpc('start_vies_check', {
    p_org: String(body?.org ?? ''), p_country: String(body?.country ?? ''), p_number: String(body?.number ?? ''),
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '54000' ? 429 : 400
    return json({ error: error.message, code: error.code }, status, origin)
  }

  let result: { valid: boolean, name: string | null, address: string | null, error: string | null }
  try {
    const res = await fetch(VIES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ countryCode: started.country, vatNumber: started.vat_number }),
      signal: AbortSignal.timeout(20000),
    })
    result = readVies(res.ok ? await res.json() : { errorWrappers: [{ error: `HTTP_${res.status}` }] })
  } catch {
    result = { valid: false, name: null, address: null, error: 'UNREACHABLE' }
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: status, error: recordError } = await admin.rpc('record_vies_result', {
    p_id: started.id, p_valid: result.valid, p_name: result.name, p_address: result.address, p_error: result.error,
  })
  if (recordError) {
    console.error(JSON.stringify({ fn: 'vies-check', step: 'record', code: recordError.code }))
    return json({ error: 'Could not record the answer' }, 500, origin)
  }
  console.log(JSON.stringify({ fn: 'vies-check', step: 'done', status, country: started.country }))
  return json({ status, name: result.name, reason: result.error }, 200, origin)
})

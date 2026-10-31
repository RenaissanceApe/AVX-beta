// geocode: a typed city → a few matching places with coordinates, for the crew profile's base
// (docs/CREW_NETWORK.md, N1). GET ?q=Porto&lang=pt. Signed-in people only (JWT verification on).
// Asks LocationIQ (OpenStreetMap data, Nominatim-style answers, its EU servers) from here, so the
// person's browser doesn't contact it and the service sees AVX, not them. OpenStreetMap's own
// Nominatim server refuses requests from Supabase's servers (403), hence LocationIQ. Function
// secret LOCATIONIQ_KEY (an access token; one per project). Free plan: 2 requests a second, 5,000
// a day, and a visible "Search by LocationIQ.com" link in the app (PlaceFinder). At most one
// request a second from here, and the app only asks when the person presses Find. Coordinates are
// rounded to about 1 km before they leave this function.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { toPlaces } from '../_shared/places.ts'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
})
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } })

let last = 0

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })
  // A signed-in person (the app's public key alone isn't enough)
  const auth = req.headers.get('Authorization') ?? ''
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth }, fetch: fetchWithTimeout }, auth: { persistSession: false },
  })
  const { data: who, error: whoError } = await client.auth.getUser()
  if (isTimeout(whoError)) return json({ error: 'timeout' }, 504, origin)
  if (!who?.user) return json({ error: 'Not signed in' }, 401, origin)
  let q = '', lang = 'en'
  if (req.method === 'GET') {
    const url = new URL(req.url)
    q = url.searchParams.get('q') ?? ''
    lang = url.searchParams.get('lang') ?? 'en'
  } else if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}))
    q = String(body?.q ?? '')
    lang = String(body?.lang ?? 'en')
  } else {
    return json({ error: 'Method not allowed' }, 405, origin)
  }
  q = q.trim().slice(0, 120)
  if (q.length < 2) return json({ places: [] }, 200, origin)
  if (!/^[a-z]{2}$/.test(lang)) lang = 'en'

  const key = Deno.env.get('LOCATIONIQ_KEY')
  if (!key) {
    console.error(JSON.stringify({ fn: 'geocode', step: 'config', reason: 'LOCATIONIQ_KEY not set' }))
    return json({ error: 'Place search not available right now' }, 503, origin)
  }

  // One request a second to LocationIQ from this instance
  const wait = last + 1100 - Date.now()
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  last = Date.now()

  // toPlaces keeps only towns and at most 6 of them, so ask for a few more than that
  const url = `https://eu1.locationiq.com/v1/search?key=${encodeURIComponent(key)}&format=json&addressdetails=1&limit=10&accept-language=${lang}&q=${encodeURIComponent(q)}`
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'AVX-beta/1.0 (https://avx-beta.vercel.app)' } })
    // LocationIQ answers 404 when nothing matches
    if (res.status === 404) return json({ places: [] }, 200, origin)
    if (!res.ok) {
      console.error(JSON.stringify({ fn: 'geocode', step: 'locationiq', status: res.status }))
      return json({ error: 'Place search not available right now' }, 503, origin)
    }
    const places = toPlaces(await res.json())
    return json({ places }, 200, origin)
  } catch (err) {
    console.error(JSON.stringify({ fn: 'geocode', step: 'locationiq', timeout: isTimeout(err) }))
    return json({ error: 'Place search not available right now' }, 503, origin)
  }
})

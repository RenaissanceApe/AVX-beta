// quote-public: the client side of a quote link (/q/<token>). No sign-in: the random
// token in the link is the only key, and it is looked up by its SHA-256 hash.
//
// POST { t, action: 'view' }                         → the quote as it was sent
// POST { t, action: 'accept' | 'decline', name, note } → records the answer once,
//      sets the quote's status and notifies the sender, the quote's author and the
//      organisation's admins in the app.
//
// Revoked links show nothing; expired links show a short notice only. JWT
// verification is off for this function (the client has no account).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

const ALLOWED_ORIGINS = [
  'https://avx-beta.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
const PREVIEW_ORIGIN = /^https:\/\/avx-beta-[a-z0-9-]+\.vercel\.app$/

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  return ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin) ? origin : null
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin) ?? ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max)

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
  const action = String(body.action ?? 'view')
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token) || !['view', 'accept', 'decline'].includes(action)) {
    return json({ state: 'not_found' }, 404, origin)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    global: { fetch: fetchWithTimeout }, auth: { persistSession: false },
  })
  const { data: share, error: shareError } = await admin.from('quote_shares')
    .select('id, quote_id, org_id, status, expires_at, viewed_at, responded_at, responder_name, created_by, quote_versions(snapshot), quotes(number, title, created_by)')
    .eq('token_hash', await sha256Hex(token)).maybeSingle()
  // Slow, not missing: the page says something went wrong rather than "link not found"
  if (isTimeout(shareError)) {
    console.error(JSON.stringify({ fn: 'quote-public', step: 'load', timeout: true }))
    return json({ error: 'timeout' }, 504, origin)
  }
  if (!share || share.status === 'revoked') return json({ state: 'not_found' }, 404, origin)

  const { data: org } = await admin.from('organisations')
    .select('name, legal_name, email, phone, quote_number_prefix').eq('id', share.org_id).maybeSingle()
  const expired = share.status === 'open' && new Date(share.expires_at).getTime() < Date.now()
  if (expired) return json({ state: 'expired', org: { name: org?.name ?? '', email: org?.email ?? '' } }, 410, origin)

  const quote = share.quotes as { number: number; title: string; created_by: string | null } | null
  const snapshot = (share.quote_versions as { snapshot: Record<string, unknown> } | null)?.snapshot
  if (!quote || !snapshot) return json({ state: 'not_found' }, 404, origin)

  if (action === 'view') {
    if (!share.viewed_at) await admin.from('quote_shares').update({ viewed_at: new Date().toISOString() }).eq('id', share.id)
    const { data: branding } = await admin.from('org_branding').select('header_image, brand_color').eq('org_id', share.org_id).maybeSingle()
    return json({
      state: share.status,
      quote: { ...snapshot, number: snapshot.number ?? quote.number },
      org: org ?? {},
      branding: branding ?? {},
      expires_at: share.expires_at,
      responded_at: share.responded_at,
      responder_name: share.responder_name,
    }, 200, origin)
  }

  // Accept / decline: only once, only while the link is open
  const name = clean(body.name, 200)
  const note = clean(body.note, 1000)
  if (!name) return json({ error: 'name_required' }, 400, origin)
  if (share.status !== 'open') return json({ state: share.status, error: 'already_answered' }, 409, origin)

  const status = action === 'accept' ? 'accepted' : 'declined'
  const respondedAt = new Date().toISOString()
  const { data: updated, error: updErr } = await admin.from('quote_shares')
    .update({ status, responded_at: respondedAt, responder_name: name, responder_note: note || null })
    .eq('id', share.id).eq('status', 'open').select('id')
  if (updErr) {
    console.error(JSON.stringify({ fn: 'quote-public', step: 'respond', message: updErr.message }))
    return json({ error: 'Could not save your answer' }, 500, origin)
  }
  if (!updated?.length) return json({ error: 'already_answered' }, 409, origin)

  const { error: quoteErr } = await admin.from('quotes').update({ status }).eq('id', share.quote_id)
  if (quoteErr) console.error(JSON.stringify({ fn: 'quote-public', step: 'quote_status', message: quoteErr.message }))

  // Tell the team: whoever sent it, whoever wrote the quote, and the org's admins
  const { data: admins } = await admin.from('org_members').select('user_id').eq('org_id', share.org_id).eq('role', 'admin')
  const recipients = new Set([share.created_by, quote.created_by, ...(admins ?? []).map(a => a.user_id)].filter(Boolean) as string[])
  const prefix = org?.quote_number_prefix ?? 'Q'
  const details = {
    quote_id: share.quote_id,
    quote_title: String(snapshot.title ?? quote.title).slice(0, 200),
    number: prefix ? `${prefix}${String(quote.number).padStart(4, '0')}` : String(quote.number),
    client_name: name,
    ...(note ? { note: note.slice(0, 300) } : {}),
  }
  if (recipients.size) {
    const { error: notifErr } = await admin.from('notifications').insert([...recipients].map(user_id => ({
      user_id, org_id: share.org_id, kind: `quote_${status}`, details,
    })))
    if (notifErr) console.error(JSON.stringify({ fn: 'quote-public', step: 'notify', message: notifErr.message }))
  }
  console.log(JSON.stringify({ fn: 'quote-public', step: status }))
  return json({ state: status, responded_at: respondedAt, responder_name: name }, 200, origin)
})

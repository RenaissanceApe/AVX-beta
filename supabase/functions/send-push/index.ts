// send-push: push notifications on phones and computers (web push), docs/MESSAGING.md M5a.
//
// POST { id }                  → from the database (trigger on notifications): delivers that
//                                notification to its person's devices. Only notifications from the
//                                last 10 minutes, at most once every 2 minutes each (grouped
//                                notifications count up), so calling it again changes nothing.
// POST { action: 'key' }       → signed-in user: the public key a device subscribes with. The keys
//                                are made here on first use and kept in push_keys (no user reads it).
// POST { action: 'test' }      → signed-in user: a test notification to their own devices.
//
// Same rules as the email summary: nothing from an organisation the person muted, except things
// addressed to them. Devices the push service no longer knows are turned off. JWT verification is
// off (the database calls it); user actions check the caller's token here. Logs carry counts only.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { type Lang, type Notification, DIRECT_KINDS, STRINGS, describe, linkFor } from '../_shared/notification-text.ts'

const ALLOWED_ORIGINS = ['https://avx-beta.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
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

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})
const SUBJECT = `mailto:${Deno.env.get('DIGEST_FROM') ?? 'info@lumenandpixel.com'}`

// The keys, made once per project
async function keys() {
  const { data } = await admin.from('push_keys').select('public_key, private_key').eq('id', 1).maybeSingle()
  if (data) return data
  const made = webpush.generateVAPIDKeys()
  const row = {
    id: 1, public_key: made.publicKey, private_key: made.privateKey,
    function_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`,
  }
  // Two first uses at once: keep whichever was stored first
  await admin.from('push_keys').upsert(row, { onConflict: 'id', ignoreDuplicates: true })
  const { data: stored } = await admin.from('push_keys').select('public_key, private_key').eq('id', 1).single()
  return stored!
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }

// Sends to each device; turns off the ones that are gone. Returns how many got it.
async function deliver(subs: Sub[], payload: Record<string, unknown>) {
  const k = await keys()
  webpush.setVapidDetails(SUBJECT, k.public_key, k.private_key)
  let sent = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' })
      sent++
      await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id)
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) await admin.from('push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('id', s.id)
      else console.error(JSON.stringify({ fn: 'send-push', step: 'send', status: status ?? 'error' }))
    }
  }
  return sent
}

async function devicesOf(userId: string) {
  const { data } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId).is('revoked_at', null)
  return (data ?? []) as Sub[]
}

async function caller(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await admin.auth.getUser(token)
  return data.user ?? null
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid request' }, 400) }

  // ── From the app: the public key, or a test ─────────────────────────────────
  if (body.action === 'key' || body.action === 'test') {
    const user = await caller(req)
    if (!user) return json({ error: 'Not signed in' }, 401)
    if (body.action === 'key') return json({ publicKey: (await keys()).public_key })
    const { data: profile } = await admin.from('profiles').select('language').eq('id', user.id).maybeSingle()
    const lang: Lang = profile?.language === 'pt' ? 'pt' : 'en'
    const sent = await deliver(await devicesOf(user.id), { title: 'AVX', body: STRINGS[lang].pushTest, url: '/dashboard', tag: 'avx-test' })
    return json({ sent })
  }

  // ── From the database: one notification ─────────────────────────────────────
  const id = Number(body.id)
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid request' }, 400)
  const { data: n } = await admin.from('notifications')
    .select('id, user_id, gig_id, org_id, actor_id, kind, details, created_at, read_at, pushed_at').eq('id', id).maybeSingle()
  if (!n || n.read_at) return json({ skipped: 'not found or read' })
  const created = new Date(n.created_at).getTime()
  if (Date.now() - created > 10 * 60e3) return json({ skipped: 'old' })
  if (n.pushed_at && created - new Date(n.pushed_at).getTime() < 2 * 60e3) return json({ skipped: 'recent' })
  if (n.org_id && !DIRECT_KINDS.has(n.kind)) {
    const { data: mute } = await admin.from('org_mutes').select('org_id').eq('user_id', n.user_id).eq('org_id', n.org_id).maybeSingle()
    if (mute) return json({ skipped: 'muted' })
  }
  const subs = await devicesOf(n.user_id)
  if (!subs.length) return json({ skipped: 'no devices' })
  // Claim it first, so a second call at the same moment doesn't send it twice
  const { data: claimed } = await admin.from('notifications').update({ pushed_at: new Date().toISOString() })
    .eq('id', id).or(`pushed_at.is.null,pushed_at.lt.${new Date(created - 2 * 60e3).toISOString()}`).select('id')
  if (!claimed?.length) return json({ skipped: 'changed' })

  const [{ data: profile }, { data: actor }] = await Promise.all([
    admin.from('profiles').select('language').eq('id', n.user_id).maybeSingle(),
    n.actor_id ? admin.from('profiles').select('full_name').eq('id', n.actor_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const lang: Lang = profile?.language === 'pt' ? 'pt' : 'en'
  const text = describe(n as Notification, lang, actor?.full_name || undefined)
  const conv = (n.details as Record<string, unknown> | null)?.conversation_id
  const sent = await deliver(subs, {
    title: 'AVX', body: text, url: linkFor(n as Notification, ''),
    // One notification per conversation (or per item) on the device; a new one replaces it
    tag: conv ? `c-${conv}` : `n-${n.id}`,
  })
  console.log(JSON.stringify({ fn: 'send-push', step: 'done', devices: subs.length, sent }))
  return json({ sent })
})

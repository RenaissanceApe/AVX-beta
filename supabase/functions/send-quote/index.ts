// send-quote: create a link to an online copy of a saved quote version, and email it
// to the client when an address is given and Brevo is configured.
//
// The app saves the version first (quote_versions, as the user) and passes its id.
// Access is checked by reading the quote and the version with the caller's own
// token: if RLS hides them, nothing happens. Only then does the service role store the
// new link and revoke the quote's previous open ones. The link carries a random
// token; only its SHA-256 hash is stored, so the link is shown once.
//
// The app may send a PDF of the same version (base64, made in the browser); it is
// attached to the email as is and never stored.
//
// Function secrets: BREVO_API_KEY and DIGEST_FROM (same as the email digest) to send
// email; without them the link is returned for the user to copy. Optional: APP_URL.
//
// The app sends a request_key per send, and the same key again on a retry. It is stored with the
// link (unique per quote), so a second request with that key creates no link and sends no email:
// it answers { duplicate: true, share_id, emailed } instead.
//
// Each email counts against the send limits (claim_send, as the user). Over a limit the link is
// still made and returned with email_error: 'rate_limited', for the user to send it themselves.
//
// Every call out has a time limit (_shared/timeout.ts). If Brevo doesn't answer in time the link
// is returned with email_error: 'timeout' and the email is not tried again: it may have gone out.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { claimSend } from '../_shared/send-limits.ts'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

const ALLOWED_ORIGINS = [
  'https://avx-beta.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
const PREVIEW_ORIGIN = /^https:\/\/avx-beta-[a-z0-9-]+\.vercel\.app$/
const LINK_DAYS = 30
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
// Base64 of a PDF (starts with "%PDF-"), at most about 3 MB
const PDF_BASE64 = /^JVBERi0[A-Za-z0-9+/]+={0,2}$/
const MAX_PDF_CHARS = 4_000_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// Supabase didn't answer in time; the app shows its "took too long" message
function timedOut(step: string, origin: string | null) {
  console.error(JSON.stringify({ fn: 'send-quote', step, timeout: true }))
  return json({ error: 'timeout' }, 504, origin)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const STRINGS = {
  en: {
    subject: 'Quote {number} · {title}',
    greeting: 'Hello{name},',
    body: '{org} has sent you a quote: {title}. You can read it, print it and accept or decline it online.',
    open: 'View the quote',
    expires: 'This link works until {date}.',
    footer: 'Sent with AVX on behalf of {org}. Reply to this email to contact them.',
  },
  pt: {
    subject: 'Orçamento {number} · {title}',
    greeting: 'Olá{name},',
    body: '{org} enviou-lhe um orçamento: {title}. Pode consultá-lo, imprimi-lo e aceitá-lo ou recusá-lo online.',
    open: 'Ver o orçamento',
    expires: 'Este link é válido até {date}.',
    footer: 'Enviado com o AVX em nome de {org}. Responda a este email para os contactar.',
  },
}

function fill(text: string, vars: Record<string, unknown>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Not signed in' }, 401, origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request' }, 400, origin)
  }
  const quoteId = String(body.quote_id ?? '')
  const versionId = String(body.version_id ?? '')
  const email = String(body.email ?? '').trim().toLowerCase()
  const sendEmail = body.send_email === true && email !== ''
  const requestKey = body.request_key == null ? null : String(body.request_key)
  if (!quoteId || !versionId || (email && (!EMAIL.test(email) || email.length > 200)) || (requestKey && !UUID.test(requestKey))) {
    return json({ error: 'Invalid request' }, 400, origin)
  }
  const pdf = typeof body.pdf === 'string' && body.pdf.length <= MAX_PDF_CHARS && PDF_BASE64.test(body.pdf) ? body.pdf : null
  const pdfName = `${String(body.pdf_name ?? 'quote').replace(/[^\w .-]+/g, ' ').replace(/\.pdf$/i, '').trim().slice(0, 80) || 'quote'}.pdf`

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization }, fetch: fetchWithTimeout },
    auth: { persistSession: false },
  })
  const { data: userRes, error: userErr } = await userClient.auth.getUser()
  if (isTimeout(userErr)) return timedOut('user', origin)
  const user = userRes?.user
  if (!user) return json({ error: 'Not signed in' }, 401, origin)

  // Both reads run under RLS: only org admins and members get rows back
  const [{ data: quote, error: quoteErr }, { data: version, error: versionErr }] = await Promise.all([
    userClient.from('quotes').select('id, org_id, number, title, language, client_name, organisations(name, email, quote_number_prefix)').eq('id', quoteId).maybeSingle(),
    userClient.from('quote_versions').select('id, quote_id, snapshot').eq('id', versionId).eq('quote_id', quoteId).maybeSingle(),
  ])
  if (isTimeout(quoteErr) || isTimeout(versionErr)) return timedOut('read', origin)
  if (!quote || !version) return json({ error: 'Quote not found' }, 404, origin)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { global: { fetch: fetchWithTimeout }, auth: { persistSession: false } })
  const token = randomToken()
  const expiresAt = new Date(Date.now() + LINK_DAYS * 24 * 3600e3)

  const { data: share, error: shareErr } = await admin.from('quote_shares').insert({
    quote_id: quoteId, org_id: quote.org_id, version_id: versionId, token_hash: await sha256Hex(token),
    sent_to: email || null, expires_at: expiresAt.toISOString(), created_by: user.id, request_key: requestKey,
  }).select('id').single()
  // Same key as an earlier request (a retry or a double-click): that one already made the link
  if (shareErr?.code === '23505' && requestKey) {
    const { data: earlier } = await admin.from('quote_shares').select('id, emailed').eq('quote_id', quoteId).eq('request_key', requestKey).maybeSingle()
    if (earlier) {
      console.log(JSON.stringify({ fn: 'send-quote', step: 'duplicate' }))
      return json({ duplicate: true, share_id: earlier.id, emailed: earlier.emailed }, 200, origin)
    }
  }
  // The link may have been stored after all; the app's retry carries the same key and is answered
  // as a duplicate
  if (isTimeout(shareErr)) return timedOut('insert', origin)
  if (shareErr || !share) {
    console.error(JSON.stringify({ fn: 'send-quote', step: 'insert', message: shareErr?.message }))
    return json({ error: 'Could not create the link' }, 500, origin)
  }

  // One live link per quote: sending again replaces the previous one (only after the new link is
  // made, so a duplicate request never revokes the link that was just sent)
  const { error: revokeErr } = await admin.from('quote_shares').update({ status: 'revoked' }).eq('quote_id', quoteId).eq('status', 'open').neq('id', share.id)
  if (revokeErr) console.error(JSON.stringify({ fn: 'send-quote', step: 'revoke', message: revokeErr.message }))

  const appUrl = (allowedOrigin(origin) ?? Deno.env.get('APP_URL') ?? ALLOWED_ORIGINS[0]).replace(/\/$/, '')
  const link = `${appUrl}/q/${token}`
  if (!sendEmail) return json({ link, share_id: share.id, emailed: false }, 200, origin)

  const apiKey = Deno.env.get('BREVO_API_KEY')
  const from = Deno.env.get('DIGEST_FROM')
  if (!apiKey || !from) return json({ link, share_id: share.id, emailed: false, email_error: 'not_configured' }, 200, origin)

  const claim = await claimSend(userClient, 'claim_send', { p_kind: 'quote', p_org: quote.org_id, p_recipient: email })
  if (claim !== 'ok') {
    return json({ link, share_id: share.id, emailed: false, email_error: claim === 'limited' ? 'rate_limited' : 'send_failed' }, 200, origin)
  }

  const org = (quote.organisations ?? {}) as { name?: string; email?: string; quote_number_prefix?: string | null }
  const snap = (version.snapshot ?? {}) as Record<string, unknown>
  const lang = snap.language === 'en' ? 'en' : 'pt'
  const s = STRINGS[lang]
  const prefix = org.quote_number_prefix ?? 'Q'
  const number = prefix ? `${prefix}${String(quote.number).padStart(4, '0')}` : String(quote.number)
  const title = String(snap.title ?? quote.title)
  const clientName = String(snap.client_name ?? '').trim()
  const orgName = org.name ?? 'AVX'
  const expires = expiresAt.toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const vars = { number, title, org: orgName, name: clientName ? ` ${clientName}` : '', date: expires }

  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:800;padding-bottom:14px">${escapeHtml(orgName)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:8px">${escapeHtml(fill(s.greeting, vars))}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:20px">${escapeHtml(fill(s.body, vars))}</td></tr>
<tr><td><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;font-weight:700;font-size:15px;padding:13px 22px;border-radius:8px;text-decoration:none">${escapeHtml(s.open)}</a></td></tr>
<tr><td style="padding-top:16px;font-size:13px;color:#666">${escapeHtml(fill(s.expires, vars))}</td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#888;line-height:1.5">${escapeHtml(fill(s.footer, vars))}</td></tr>
</table></td></tr></table></body></html>`
  const text = [fill(s.greeting, vars), '', fill(s.body, vars), '', `${s.open}: ${link}`, '', fill(s.expires, vars), '', fill(s.footer, vars)].join('\n')

  const replyTo = org.email && EMAIL.test(org.email) ? org.email : user.email
  let res: Response
  try {
    res = await fetchWithTimeout('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: orgName.slice(0, 70), email: from },
        to: [{ email, ...(clientName ? { name: clientName.slice(0, 70) } : {}) }],
        ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        subject: fill(s.subject, vars),
        htmlContent: html,
        textContent: text,
        ...(pdf ? { attachment: [{ content: pdf, name: pdfName }] } : {}),
        tags: ['quote'],
      }),
    })
  } catch (err) {
    console.error(JSON.stringify({ fn: 'send-quote', step: 'brevo', timeout: isTimeout(err) }))
    return json({ link, share_id: share.id, emailed: false, email_error: isTimeout(err) ? 'timeout' : 'send_failed' }, 200, origin)
  }
  if (!res.ok) {
    console.error(JSON.stringify({ fn: 'send-quote', step: 'brevo', status: res.status }))
    return json({ link, share_id: share.id, emailed: false, email_error: 'send_failed' }, 200, origin)
  }
  await admin.from('quote_shares').update({ emailed: true }).eq('id', share.id)
  console.log(JSON.stringify({ fn: 'send-quote', step: 'emailed', pdf: !!pdf }))
  return json({ link, share_id: share.id, emailed: true }, 200, origin)
})

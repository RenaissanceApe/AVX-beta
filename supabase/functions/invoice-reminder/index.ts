// invoice-reminder: emails a client a reminder of an overdue invoice (step 11), with the link to
// its PDF, in the invoice's language. Works whatever invoicing program the organisation uses: the
// invoice must be issued (its program's number and PDF link typed into AVX) and unpaid.
//
// POST { invoice_id } with the user's Authorization header. The invoice is read with the caller's
// own token (only the organisation's admins and members get it back); the email counts against
// the send limits as a quote email (claim_send 'quote'); only then the service role records when.
//
// Function secrets: BREVO_API_KEY and DIGEST_FROM (the same as the email digest). Optional:
// APP_URL. Verify JWT can stay on. Logs carry step names and ids only.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { claimSend } from '../_shared/send-limits.ts'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

const ALLOWED_ORIGINS = ['https://avx-beta.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
const PREVIEW_ORIGIN = /^https:\/\/avx-beta-[a-z0-9-]+\.vercel\.app$/
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
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
}
const log = (step: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ fn: 'invoice-reminder', step, ...extra }))
const logErr = (step: string, extra: Record<string, unknown> = {}) => console.error(JSON.stringify({ fn: 'invoice-reminder', step, ...extra }))
const env = (k: string) => Deno.env.get(k) ?? ''

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// An error the app shows in plain words (the code picks the message)
class Refusal extends Error {
  constructor(public code: string, public status = 400) { super(code) }
}

type Invoice = {
  id: string; org_id: string; number: number; kind: string; status: string; client_name: string; client_email: string | null;
  language: string; total: number; currency: string; due_date: string | null; legal_number: string | null; pdf_url: string | null
}

const REMINDER = {
  en: {
    subject: 'Payment reminder · invoice {number}',
    body: 'Hello{name},<br><br>This is a reminder from {org} that invoice {number} of {amount} was due on {due}. If you have already paid it, please ignore this message.',
    open: 'View the invoice', footer: 'Sent with AVX on behalf of {org}. Reply to this email to contact them.',
  },
  pt: {
    subject: 'Lembrete de pagamento · fatura {number}',
    body: 'Olá{name},<br><br>A {org} lembra que a fatura {number}, de {amount}, venceu a {due}. Se já a pagou, ignore esta mensagem.',
    open: 'Ver a fatura', footer: 'Enviado com o AVX em nome de {org}. Responda a este email para os contactar.',
  },
}
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '')

async function remind(user: SupabaseClient, admin: SupabaseClient, inv: Invoice) {
  const email = (inv.client_email || '').trim().toLowerCase()
  if (inv.kind !== 'invoice' || inv.status !== 'issued' || !inv.pdf_url) throw new Refusal('not_issued', 409)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Refusal('no_email', 400)
  const apiKey = env('BREVO_API_KEY'), from = env('DIGEST_FROM')
  if (!apiKey || !from) throw new Refusal('email_not_configured', 400)
  const claim = await claimSend(user, 'claim_send', { p_kind: 'quote', p_org: inv.org_id, p_recipient: email })
  if (claim !== 'ok') throw new Refusal(claim === 'limited' ? 'rate_limited' : 'send_failed', 429)
  const { data: org } = await admin.from('organisations').select('name, email').eq('id', inv.org_id).maybeSingle()
  const lang = inv.language === 'en' ? 'en' : 'pt'
  const s = REMINDER[lang]
  const amount = new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { style: 'currency', currency: inv.currency || 'EUR' }).format(Number(inv.total))
  const due = inv.due_date ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pt-PT', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${inv.due_date}T00:00:00Z`)) : ''
  const vars = { number: inv.legal_number || String(inv.number), org: escapeHtml(org?.name || 'AVX'), amount, due, name: inv.client_name ? ` ${escapeHtml(inv.client_name)}` : '' }
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>${fill(s.body, vars)}</p>
<p><a href="${escapeHtml(inv.pdf_url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;text-decoration:none">${s.open}</a></p>
<p style="font-size:12px;color:#666">${fill(s.footer, vars)}</p></div>`
  const res = await fetchWithTimeout('https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: from, name: org?.name || 'AVX' }, to: [{ email }],
      ...(org?.email ? { replyTo: { email: org.email } } : {}),
      subject: fill(s.subject, { number: vars.number }), htmlContent: html,
    }),
  }).catch(err => { if (isTimeout(err)) throw new Refusal('timeout', 504); throw err })
  if (!res.ok) { logErr('brevo', { status: res.status }); throw new Refusal('send_failed', 502) }
  await admin.from('invoices').update({ client_reminded_at: new Date().toISOString() }).eq('id', inv.id)
  log('reminded', { invoice: inv.id })
  return { emailed: true }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)
  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Not signed in' }, 401, origin)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid' }, 400, origin) }
  const id = String(body.invoice_id ?? '')
  if (!UUID.test(id)) return json({ error: 'invalid' }, 400, origin)

  const url = env('SUPABASE_URL')
  const user = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization }, fetch: fetchWithTimeout }, auth: { persistSession: false } })
  const { data: me, error: meErr } = await user.auth.getUser()
  if (isTimeout(meErr)) return json({ error: 'timeout' }, 504, origin)
  if (!me?.user) return json({ error: 'Not signed in' }, 401, origin)
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { global: { fetch: fetchWithTimeout }, auth: { persistSession: false } })

  try {
    // Read as the user: only admins and members of the invoice's organisation get it
    const { data: inv, error } = await user.from('invoices').select('*').eq('id', id).is('removed_at', null).maybeSingle()
    if (isTimeout(error)) throw new Refusal('timeout', 504)
    if (!inv) throw new Refusal('not_found', 404)
    return json(await remind(user, admin, inv as Invoice), 200, origin)
  } catch (e) {
    if (e instanceof Refusal) return json({ error: e.code }, e.status, origin)
    if (isTimeout(e)) return json({ error: 'timeout' }, 504, origin)
    logErr('unexpected')
    return json({ error: 'send_failed' }, 500, origin)
  }
})

// moloni: hands AVX invoices to Moloni, the certified invoicing program (step 11). AVX never issues a
// legal invoice: it creates a DRAFT in Moloni; you check and finalise it in Moloni; then "Check
// Moloni" reads back the number, dates and PDF link. Docs: docs/BUSINESS.md "How invoices work".
//
// Function secrets (added by the owner in Supabase, never pasted anywhere else):
//   MOLONI_CLIENT_ID      the Developer ID from Moloni's developer area
//   MOLONI_CLIENT_SECRET  its Client Secret
// Optional: MOLONI_REDIRECT_URI (default <SUPABASE_URL>/functions/v1/moloni, which must be the
// redirect address registered with Moloni), APP_URL, and BREVO_API_KEY + DIGEST_FROM for the
// optional email reminder to the client.
//
// Verify JWT must be OFF for this function: Moloni's sign-in comes back here as a plain browser
// visit (GET with ?code&state). Every POST checks the caller's own token itself (RLS decides what
// they can read), and only then uses the service role.
//
// POST { action, ... } with the user's Authorization header:
//   connect { org_id }                         admin → { url } to Moloni's sign-in
//   setup { org_id, company_id? }              admin → companies and invoice series to choose from
//   save_setup { org_id, company_id, document_set_id }   admin
//   disconnect { org_id }                      admin
//   push { invoice_id }                        a draft invoice or credit note → a draft in Moloni
//   sync { invoice_id }                        reads it back once finalised in Moloni → issued
//   remind { invoice_id }                      emails the client a reminder with the PDF link
// Tokens live in public.moloni_connections, which only the service role can read. Logs carry
// step names and ids only.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { claimSend } from '../_shared/send-limits.ts'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

const ALLOWED_ORIGINS = ['https://avx-beta.vercel.app', 'http://localhost:5173', 'http://localhost:4173']
const PREVIEW_ORIGIN = /^https:\/\/avx-beta-[a-z0-9-]+\.vercel\.app$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const API = 'https://api.moloni.pt/v1'
const AUTHORIZE = 'https://www.moloni.pt/ac/root/oauth/'
const REFRESH_DAYS = 14
const CONSUMER_VAT = '999999990'   // AT's "final consumer" tax number, for clients without one

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
const log = (step: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ fn: 'moloni', step, ...extra }))
const logErr = (step: string, extra: Record<string, unknown> = {}) => console.error(JSON.stringify({ fn: 'moloni', step, ...extra }))

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// An error the app shows in plain words (the code picks the message; detail is Moloni's own text)
class Refusal extends Error {
  constructor(public code: string, public status = 400, public detail?: string) { super(code) }
}

const env = (k: string) => Deno.env.get(k) ?? ''
const redirectUri = () => env('MOLONI_REDIRECT_URI') || `${env('SUPABASE_URL')}/functions/v1/moloni`

// ── Moloni calls ──────────────────────────────────────────────────────────────
async function grant(params: Record<string, string>) {
  const q = new URLSearchParams({ client_id: env('MOLONI_CLIENT_ID'), client_secret: env('MOLONI_CLIENT_SECRET'), ...params })
  const res = await fetchWithTimeout(`${API}/grant/?${q}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    logErr('grant', { status: res.status, error: body.error })
    throw new Refusal(params.grant_type === 'refresh_token' ? 'moloni_reconnect' : 'moloni_connect_failed', 400)
  }
  return body as { access_token: string; refresh_token: string; expires_in: number }
}

// POST with a JSON body, as Moloni documents it (json=true in the address)
async function call(token: string, path: string, body: Record<string, unknown>) {
  const res = await fetchWithTimeout(`${API}/${path}/?access_token=${encodeURIComponent(token)}&json=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || out == null) {
    logErr('call', { path, status: res.status })
    throw new Refusal('moloni_error', 502)
  }
  // Insert calls answer { valid: 1, ... }; a refused one answers a list of field errors
  if (Array.isArray(out) && path.endsWith('/insert')) {
    logErr('refused', { path, count: out.length })
    throw new Refusal('moloni_refused', 400, JSON.stringify(out).slice(0, 500))
  }
  if (out && typeof out === 'object' && !Array.isArray(out) && out.error) {
    logErr('error', { path, error: String(out.error).slice(0, 80) })
    throw new Refusal(out.error === 'invalid_token' ? 'moloni_reconnect' : 'moloni_error', 400)
  }
  return out
}

type Conn = {
  org_id: string; access_token: string | null; access_expires_at: string | null; refresh_token: string | null;
  refresh_expires_at: string | null; company_id: number | null; document_set_id: number | null; product_id: number | null;
  company_name: string | null; document_set_name: string | null
}

async function connection(admin: SupabaseClient, orgId: string): Promise<Conn> {
  const { data, error } = await admin.from('moloni_connections').select('*').eq('org_id', orgId).maybeSingle()
  if (error) throw new Refusal('read_failed', 500)
  if (!data?.refresh_token) throw new Refusal('moloni_not_connected', 400)
  return data as Conn
}

// A working access token, refreshed when it has (nearly) run out. Each refresh also gives a new
// refresh token, valid 14 days: an organisation that doesn't use Moloni for 14 days connects again.
async function accessToken(admin: SupabaseClient, conn: Conn) {
  if (conn.access_token && conn.access_expires_at && new Date(conn.access_expires_at).getTime() > Date.now() + 60_000) return conn.access_token
  if (!conn.refresh_expires_at || new Date(conn.refresh_expires_at).getTime() <= Date.now()) throw new Refusal('moloni_reconnect', 400)
  const t = await grant({ grant_type: 'refresh_token', refresh_token: conn.refresh_token! })
  const patch = {
    access_token: t.access_token, refresh_token: t.refresh_token,
    access_expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + REFRESH_DAYS * 864e5).toISOString(), updated_at: new Date().toISOString(),
  }
  await admin.from('moloni_connections').update(patch).eq('org_id', conn.org_id)
  Object.assign(conn, patch)
  return t.access_token
}

// ── The OAuth callback (a browser visit from Moloni) ──────────────────────────
async function callback(req: Request) {
  const u = new URL(req.url)
  const appUrl = (env('APP_URL') || ALLOWED_ORIGINS[0]).replace(/\/$/, '')
  const state = u.searchParams.get('state') ?? ''
  const code = u.searchParams.get('code') ?? ''
  const orgId = state.split('.')[0]
  const back = (result: string) => Response.redirect(`${appUrl}/org/${UUID.test(orgId) ? orgId : ''}/invoices?moloni=${result}`, 302)
  if (!UUID.test(orgId) || !code) return back('error')
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { global: { fetch: fetchWithTimeout }, auth: { persistSession: false } })
  const { data: row } = await admin.from('moloni_connections').select('state_hash, state_user, state_expires_at').eq('org_id', orgId).maybeSingle()
  if (!row?.state_hash || row.state_hash !== await sha256Hex(state) || !row.state_expires_at || new Date(row.state_expires_at).getTime() < Date.now()) {
    log('callback_state_refused')
    return back('error')
  }
  try {
    const t = await grant({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() })
    await admin.from('moloni_connections').update({
      access_token: t.access_token, refresh_token: t.refresh_token,
      access_expires_at: new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(),
      refresh_expires_at: new Date(Date.now() + REFRESH_DAYS * 864e5).toISOString(),
      state_hash: null, state_expires_at: null, connected_by: row.state_user, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('org_id', orgId)
    log('connected')
    return back('connected')
  } catch {
    return back('error')
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function requireAdmin(user: SupabaseClient, me: string, orgId: string) {
  if (!UUID.test(orgId)) throw new Refusal('invalid', 400)
  const { data } = await user.from('org_members').select('role').eq('org_id', orgId).eq('user_id', me).maybeSingle()
  if (data?.role !== 'admin') throw new Refusal('not_allowed', 403)
}

async function setupLists(token: string, companyId: number | null) {
  const companies = ((await call(token, 'companies/getAll', {})) as { company_id: number; name: string }[])
    .map(c => ({ company_id: c.company_id, name: c.name }))
  const company = companyId ?? companies[0]?.company_id ?? null
  const sets = company
    ? ((await call(token, 'documentSets/getAll', { company_id: company })) as { document_set_id: number; name: string }[])
        .map(s => ({ document_set_id: s.document_set_id, name: s.name }))
    : []
  return { companies, company_id: company, document_sets: sets }
}

// The one "AVX service" product every invoice line uses (each line sends its own name, price and VAT)
async function ensureProduct(token: string, companyId: number, taxes: Tax[]) {
  const found = await call(token, 'products/getByReference', { company_id: companyId, reference: 'AVX-SERVICE', exact: 1 }) as { product_id: number }[]
  if (Array.isArray(found) && found[0]?.product_id) return found[0].product_id
  const categories = await call(token, 'productCategories/getAll', { company_id: companyId, parent_id: 0 }) as { category_id: number }[]
  let categoryId = categories?.[0]?.category_id
  if (!categoryId) categoryId = (await call(token, 'productCategories/insert', { company_id: companyId, parent_id: 0, name: 'AVX' }) as { category_id: number }).category_id
  const units = await call(token, 'measurementUnits/getAll', { company_id: companyId }) as { unit_id: number }[]
  const standard = taxes.sort((a, b) => b.value - a.value)[0]
  const out = await call(token, 'products/insert', {
    company_id: companyId, category_id: categoryId, type: 2, name: 'AVX service', reference: 'AVX-SERVICE', price: 0,
    unit_id: units?.[0]?.unit_id, has_stock: 0, stock: 0,
    ...(standard ? { taxes: [{ tax_id: standard.tax_id, value: standard.value, order: 1, cumulative: 0 }] } : { exemption_reason: 'M99' }),
  }) as { product_id: number }
  return out.product_id
}

type Tax = { tax_id: number; value: number; type?: number; saft_type?: number | string; fiscal_zone?: string }
async function vatTaxes(token: string, companyId: number): Promise<Tax[]> {
  const all = await call(token, 'taxes/getAll', { company_id: companyId }) as Tax[]
  // VAT (SAF-T type 1), as a percentage (type 1), for mainland Portugal when the zone is given
  return (all || []).filter(t => String(t.saft_type ?? '1') === '1' && (t.type == null || Number(t.type) === 1))
    .sort((a, b) => (a.fiscal_zone === 'PT' ? -1 : 0) - (b.fiscal_zone === 'PT' ? -1 : 0))
}

type Line = { id: string; description: string; details?: string; qty: number; unit_price: number; discount_pct: number; vat_rate: number; vat_exemption?: string; source_id?: string }
type Invoice = {
  id: string; org_id: string; number: number; kind: string; status: string; credited_invoice_id: string | null; quote_id: string | null;
  client_name: string; client_tax_id: string | null; client_address: string | null; client_email: string | null; language: string;
  lines: Line[]; total: number; notes: string | null; issue_date: string | null; due_date: string | null; moloni_document_id: number | null;
  legal_number: string | null; pdf_url: string | null; currency: string
}

async function customerId(token: string, companyId: number, inv: Invoice) {
  const vat = (inv.client_tax_id || '').replace(/\s+/g, '').replace(/^PT/i, '') || CONSUMER_VAT
  const found = await call(token, 'customers/getByVat', { company_id: companyId, vat }) as { customer_id: number }[]
  if (Array.isArray(found) && found[0]?.customer_id) return found[0].customer_id
  if (vat === CONSUMER_VAT) throw new Refusal('moloni_customer', 400)
  // A new client: Moloni's own defaults for payment, and Portugal unless the number says otherwise
  const [maturity, methods] = await Promise.all([
    call(token, 'maturityDates/getAll', { company_id: companyId }) as Promise<{ maturity_date_id: number }[]>,
    call(token, 'paymentMethods/getAll', { company_id: companyId }) as Promise<{ payment_method_id: number }[]>,
  ])
  const [address, ...rest] = (inv.client_address || '').split(/\n|,/).map(s => s.trim()).filter(Boolean)
  try {
    const out = await call(token, 'customers/insert', {
      company_id: companyId, vat, number: vat.slice(0, 20), name: inv.client_name.slice(0, 120),
      language_id: inv.language === 'en' ? 2 : 1, address: address || '—', city: rest.at(-1) || '—', country_id: 1,
      email: inv.client_email || '', maturity_date_id: maturity?.[0]?.maturity_date_id ?? 0,
      payment_method_id: methods?.[0]?.payment_method_id ?? 0, copies: [], delivery_method_id: 0,
    }) as { customer_id: number }
    return out.customer_id
  } catch (e) {
    if (e instanceof Refusal && e.code === 'moloni_refused') throw new Refusal('moloni_customer', 400, e.detail)
    throw e
  }
}

function productsFor(lines: Line[], productId: number, taxIdFor: (rate: number) => number) {
  return lines.map((l, i) => ({
    product_id: productId, name: l.description.slice(0, 250), ...(l.details ? { summary: l.details.slice(0, 1000) } : {}),
    qty: l.qty, price: l.unit_price, discount: l.discount_pct || 0, order: i + 1,
    ...(l.vat_rate > 0
      ? { taxes: [{ tax_id: taxIdFor(l.vat_rate), value: l.vat_rate, order: 1, cumulative: 0 }] }
      : { taxes: [], exemption_reason: l.vat_exemption || 'M99' }),
  }))
}

async function push(admin: SupabaseClient, inv: Invoice) {
  if (inv.status !== 'draft') throw new Refusal('not_draft', 409)
  if (!inv.client_name.trim() || !inv.lines.length) throw new Refusal('incomplete', 400)
  if (inv.lines.some(l => l.vat_rate === 0 && !l.vat_exemption)) throw new Refusal('exemption_missing', 400)
  if (inv.currency !== 'EUR') throw new Refusal('currency', 400)
  const conn = await connection(admin, inv.org_id)
  if (!conn.company_id || !conn.document_set_id) throw new Refusal('moloni_setup', 400)
  const token = await accessToken(admin, conn)
  const taxes = await vatTaxes(token, conn.company_id)
  const taxIdFor = (rate: number) => {
    const t = taxes.find(x => Number(x.value) === rate)
    if (!t) throw new Refusal('moloni_tax_missing', 400, String(rate))
    return t.tax_id
  }
  inv.lines.forEach(l => { if (l.vat_rate > 0) taxIdFor(l.vat_rate) })
  let productId = conn.product_id
  if (!productId) {
    productId = await ensureProduct(token, conn.company_id, taxes)
    await admin.from('moloni_connections').update({ product_id: productId }).eq('org_id', inv.org_id)
  }
  const customer = await customerId(token, conn.company_id, inv)
  const today = new Date().toISOString().slice(0, 10)
  const date = inv.issue_date || today
  const base = {
    company_id: conn.company_id, date, document_set_id: conn.document_set_id, customer_id: customer,
    our_reference: `AVX ${inv.number}`, notes: inv.notes || '', status: 0,
  }
  let documentId: number
  if (inv.kind === 'credit_note') {
    const { data: original } = await admin.from('invoices').select('moloni_document_id, lines').eq('id', inv.credited_invoice_id!).maybeSingle()
    if (!original?.moloni_document_id) throw new Refusal('moloni_credit_manual', 400)
    const doc = await call(token, 'invoices/getOne', { company_id: conn.company_id, document_id: original.moloni_document_id }) as { products?: { document_product_id?: number; taxes?: { value?: number }[] }[] }
    const theirs = doc?.products ?? []
    if (!theirs.length || theirs.some(p => !p.document_product_id)) throw new Refusal('moloni_credit_manual', 400)
    const ours = (original.lines ?? []) as Line[]
    const related = (l: Line) => {
      const i = ours.findIndex(o => o.id === l.source_id)
      if (i >= 0 && theirs[i]) return theirs[i].document_product_id
      const byRate = theirs.find(p => Number(p.taxes?.[0]?.value ?? 0) === l.vat_rate)
      if (!byRate) throw new Refusal('moloni_credit_manual', 400)
      return byRate.document_product_id
    }
    const products = productsFor(inv.lines, productId, taxIdFor).map((p, i) => ({ ...p, related_id: related(inv.lines[i]) }))
    const out = await call(token, 'creditNotes/insert', {
      ...base, associated_documents: [{ associated_id: original.moloni_document_id, value: inv.total }], products,
    }) as { document_id: number }
    documentId = out.document_id
  } else {
    const out = await call(token, 'invoices/insert', {
      ...base, expiration_date: inv.due_date || date, products: productsFor(inv.lines, productId, taxIdFor),
    }) as { document_id: number }
    documentId = out.document_id
  }
  const { error } = await admin.from('invoices').update({ moloni_document_id: documentId, status: 'sent' }).eq('id', inv.id)
  if (error) logErr('mark_sent', { invoice: inv.id, code: error.code })
  log('pushed', { invoice: inv.id })
  return { document_id: documentId }
}

async function sync(admin: SupabaseClient, inv: Invoice) {
  if (inv.status !== 'sent' || !inv.moloni_document_id) throw new Refusal('not_sent', 409)
  const conn = await connection(admin, inv.org_id)
  const token = await accessToken(admin, conn)
  const path = inv.kind === 'credit_note' ? 'creditNotes/getOne' : 'invoices/getOne'
  const doc = await call(token, path, { company_id: conn.company_id, document_id: inv.moloni_document_id }) as
    { document_id?: number; status?: number; number?: number; date?: string; expiration_date?: string | null; document_set?: { name?: string }; document_set_name?: string }
  if (!doc?.document_id) return { state: 'missing' }
  if (Number(doc.status) !== 1) return { state: 'draft' }
  const series = doc.document_set?.name ?? doc.document_set_name ?? ''
  const legal = `${inv.kind === 'credit_note' ? 'NC' : 'FT'} ${series ? `${series}/` : ''}${doc.number}`
  let pdf: string | null = null
  try {
    const link = await call(token, 'documents/getPDFLink', { company_id: conn.company_id, document_id: inv.moloni_document_id }) as { url?: string }
    pdf = typeof link?.url === 'string' && /^https:\/\//i.test(link.url) ? link.url.slice(0, 2000) : null
  } catch { pdf = null }
  const issue = doc.date ? String(doc.date).slice(0, 10) : null
  const due = doc.expiration_date ? String(doc.expiration_date).slice(0, 10) : null
  const { error } = await admin.from('invoices').update({
    status: 'issued', legal_number: legal, pdf_url: pdf, ...(issue ? { issue_date: issue } : {}), ...(due && (!issue || due >= issue) ? { due_date: due } : {}),
  }).eq('id', inv.id)
  if (error) { logErr('mark_issued', { invoice: inv.id, code: error.code }); throw new Refusal('save_failed', 500) }
  log('issued', { invoice: inv.id })
  return { state: 'issued', legal_number: legal, pdf_url: pdf }
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
  if (req.method === 'GET') return callback(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)
  if (!env('MOLONI_CLIENT_ID') || !env('MOLONI_CLIENT_SECRET')) return json({ error: 'moloni_not_configured' }, 400, origin)

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Not signed in' }, 401, origin)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'invalid' }, 400, origin) }
  const action = String(body.action ?? '')

  const url = env('SUPABASE_URL')
  const user = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization }, fetch: fetchWithTimeout }, auth: { persistSession: false } })
  const { data: me, error: meErr } = await user.auth.getUser()
  if (isTimeout(meErr)) return json({ error: 'timeout' }, 504, origin)
  if (!me?.user) return json({ error: 'Not signed in' }, 401, origin)
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { global: { fetch: fetchWithTimeout }, auth: { persistSession: false } })

  try {
    if (['connect', 'setup', 'save_setup', 'disconnect'].includes(action)) {
      const orgId = String(body.org_id ?? '')
      await requireAdmin(user, me.user.id, orgId)
      if (action === 'connect') {
        const state = `${orgId}.${randomToken()}`
        await admin.from('moloni_connections').upsert({
          org_id: orgId, state_hash: await sha256Hex(state), state_user: me.user.id,
          state_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id' })
        const q = new URLSearchParams({ response_type: 'code', client_id: env('MOLONI_CLIENT_ID'), redirect_uri: redirectUri(), state })
        return json({ url: `${AUTHORIZE}?${q}` }, 200, origin)
      }
      if (action === 'disconnect') {
        await admin.from('moloni_connections').update({
          access_token: null, refresh_token: null, access_expires_at: null, refresh_expires_at: null, updated_at: new Date().toISOString(),
        }).eq('org_id', orgId)
        log('disconnected')
        return json({ ok: true }, 200, origin)
      }
      const conn = await connection(admin, orgId)
      const token = await accessToken(admin, conn)
      const wanted = body.company_id == null ? conn.company_id : Number(body.company_id)
      const lists = await setupLists(token, wanted)
      if (action === 'setup') return json({ ...lists, document_set_id: conn.document_set_id }, 200, origin)
      // save_setup: only a company and series Moloni listed
      const company = lists.companies.find(c => c.company_id === Number(body.company_id))
      const set = lists.document_sets.find(s => s.document_set_id === Number(body.document_set_id))
      if (!company || !set) throw new Refusal('invalid', 400)
      await admin.from('moloni_connections').update({
        company_id: company.company_id, company_name: company.name, document_set_id: set.document_set_id, document_set_name: set.name,
        product_id: company.company_id === conn.company_id ? conn.product_id : null, updated_at: new Date().toISOString(),
      }).eq('org_id', orgId)
      return json({ ok: true }, 200, origin)
    }

    if (['push', 'sync', 'remind'].includes(action)) {
      const id = String(body.invoice_id ?? '')
      if (!UUID.test(id)) throw new Refusal('invalid', 400)
      // Read as the user: only admins and members of the invoice's organisation get it
      const { data: inv, error } = await user.from('invoices').select('*').eq('id', id).is('removed_at', null).maybeSingle()
      if (isTimeout(error)) throw new Refusal('timeout', 504)
      if (!inv) throw new Refusal('not_found', 404)
      const result = action === 'push' ? await push(admin, inv as Invoice) : action === 'sync' ? await sync(admin, inv as Invoice) : await remind(user, admin, inv as Invoice)
      return json(result, 200, origin)
    }
    return json({ error: 'invalid' }, 400, origin)
  } catch (e) {
    if (e instanceof Refusal) return json({ error: e.code, detail: e.detail }, e.status, origin)
    if (isTimeout(e)) return json({ error: 'timeout' }, 504, origin)
    logErr('unexpected', { action })
    return json({ error: 'moloni_error' }, 500, origin)
  }
})

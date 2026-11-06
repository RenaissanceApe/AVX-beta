// invoicing: connects an organisation's certified invoicing program (step 11b). AVX never issues a
// legal invoice: it sends a DRAFT to the program; you check and finalise it there; then "Check"
// reads back the number, dates and PDF link. Manual (typing the number) stays available always.
// One adapter per program: moloni.ts, invoicexpress.ts, toconline.ts (common.ts: what they share).
// Docs: docs/BUSINESS.md "How invoicing connectors work".
//
// Function secrets (added by the owner in Supabase, never pasted anywhere else):
//   INVOICING_PROVIDERS   the programs switched on, e.g. "moloni,invoicexpress,toconline". Each one is
//                         added only after an end-to-end test with a real account. Empty: none.
//   MOLONI_CLIENT_ID      Moloni's Developer ID (Moloni's developer area)
//   MOLONI_CLIENT_SECRET  its Client Secret
// Optional: INVOICING_REDIRECT_URI (default <SUPABASE_URL>/functions/v1/invoicing: the address to
// register with Moloni, and to give TOConline when making the API details) and APP_URL.
// InvoiceXpress and TOConline need no developer key: each organisation's admin types its own, which
// are kept in public.invoicing_connections (only the service role can read it).
//
// Verify JWT must be OFF: an OAuth sign-in comes back here as a plain browser visit (GET with
// ?code&state). Every POST checks the caller's own token itself (RLS decides what they can read),
// and only then uses the service role.
//
// POST { action, ... } with the user's Authorization header:
//   providers                                    → { providers: [...] } switched on
//   connect { org_id, provider, ...keys }        admin → { url } to sign in, or { ok }
//   setup { org_id, company_id? }                admin → companies and series to choose from
//   save_setup { org_id, company_id?, document_set_id }   admin
//   disconnect { org_id }                        admin → back to manual
//   push { invoice_id }                          a draft invoice or credit note → a draft in the program
//   sync { invoice_id }                          reads it back once finalised there → issued
// Logs carry step names and ids only.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'
import { type Adapter, type Conn, type Ctx, type Invoice, type Original, type Provider, PROVIDERS, Refusal } from './common.ts'
import { moloni } from './moloni.ts'
import { invoicexpress } from './invoicexpress.ts'
import { toconline } from './toconline.ts'

const ADAPTERS: Record<Provider, Adapter> = { moloni, invoicexpress, toconline }
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
const log = (step: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ fn: 'invoicing', step, ...extra }))
const logErr = (step: string, extra: Record<string, unknown> = {}) => console.error(JSON.stringify({ fn: 'invoicing', step, ...extra }))

const env = (k: string) => Deno.env.get(k) ?? ''
const redirectUri = () => env('INVOICING_REDIRECT_URI') || `${env('SUPABASE_URL')}/functions/v1/invoicing`

// The programs switched on (and, for Moloni, with its developer keys added)
function enabled(): Provider[] {
  const listed = env('INVOICING_PROVIDERS').split(',').map(s => s.trim().toLowerCase())
  return PROVIDERS.filter(p => listed.includes(p) && (p !== 'moloni' || (env('MOLONI_CLIENT_ID') && env('MOLONI_CLIENT_SECRET'))))
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Everything a connection holds, emptied: switching program or going back to manual starts clean
const BLANK = {
  provider: null, account: null, api_key: null, settings: {}, access_token: null, access_expires_at: null,
  refresh_token: null, refresh_expires_at: null, company_id: null, company_name: null, document_set_id: null,
  document_set_name: null, product_id: null, state_hash: null, state_user: null, state_expires_at: null,
  connected_by: null, connected_at: null,
}

async function readConn(admin: SupabaseClient, orgId: string): Promise<Conn & { state_hash?: string; state_user?: string; state_expires_at?: string }> {
  const { data, error } = await admin.from('invoicing_connections').select('*').eq('org_id', orgId).maybeSingle()
  if (error) throw new Refusal('read_failed', 500)
  if (!data?.provider) throw new Refusal('not_connected', 400)
  return { ...data, settings: data.settings ?? {} } as Conn
}

function context(admin: SupabaseClient, conn: Conn): Ctx {
  return {
    conn, env, redirectUri: redirectUri(),
    http: (url, init) => fetchWithTimeout(url, init),
    save: async patch => {
      const { error } = await admin.from('invoicing_connections').update({ ...patch, updated_at: new Date().toISOString() }).eq('org_id', conn.org_id)
      if (error) logErr('save_connection', { org: conn.org_id, code: error.code })
    },
  }
}

// ── The OAuth sign-in coming back (a browser visit) ───────────────────────────
async function callback(req: Request) {
  const u = new URL(req.url)
  const appUrl = (env('APP_URL') || ALLOWED_ORIGINS[0]).replace(/\/$/, '')
  const state = u.searchParams.get('state') ?? ''
  const code = u.searchParams.get('code') ?? ''
  const orgId = state.split('.')[0]
  const back = (result: string) => Response.redirect(`${appUrl}/org/${UUID.test(orgId) ? orgId : ''}/invoices?invoicing=${result}`, 302)
  if (!UUID.test(orgId) || !code) return back('error')
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { global: { fetch: fetchWithTimeout }, auth: { persistSession: false } })
  try {
    const conn = await readConn(admin, orgId)
    const row = conn as unknown as { state_hash?: string; state_user?: string; state_expires_at?: string }
    if (!row.state_hash || row.state_hash !== await sha256Hex(state) || !row.state_expires_at || new Date(row.state_expires_at).getTime() < Date.now()) {
      log('callback_state_refused')
      return back('error')
    }
    const adapter = ADAPTERS[conn.provider!]
    if (!adapter.callback || !enabled().includes(conn.provider!)) return back('error')
    const patch = await adapter.callback(context(admin, conn), code)
    await admin.from('invoicing_connections').update({
      ...patch, state_hash: null, state_expires_at: null, connected_by: row.state_user, connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('org_id', orgId)
    log('connected', { org: orgId, provider: conn.provider })
    return back('connected')
  } catch {
    logErr('callback_failed', { org: orgId })
    return back('error')
  }
}

async function requireAdmin(user: SupabaseClient, me: string, orgId: string) {
  if (!UUID.test(orgId)) throw new Refusal('invalid', 400)
  const { data } = await user.from('org_members').select('role').eq('org_id', orgId).eq('user_id', me).maybeSingle()
  if (data?.role !== 'admin') throw new Refusal('not_allowed', 403)
}

const INVOICE_COLUMNS = 'id, org_id, number, kind, status, credited_invoice_id, client_id, client_name, client_tax_id, client_address, client_email, language, currency, lines, total, notes, issue_date, due_date, provider, provider_document_id, legal_number'

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method === 'GET') return callback(req)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)

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
    if (action === 'providers') return json({ providers: enabled() }, 200, origin)

    if (['connect', 'setup', 'save_setup', 'disconnect'].includes(action)) {
      const orgId = String(body.org_id ?? '')
      await requireAdmin(user, me.user.id, orgId)
      const now = new Date().toISOString()

      if (action === 'connect') {
        const provider = String(body.provider ?? '') as Provider
        if (!enabled().includes(provider)) throw new Refusal('not_enabled', 400)
        const state = `${orgId}.${randomToken()}`
        const fresh = { ...BLANK, org_id: orgId, provider } as unknown as Conn
        const { patch, url: signIn } = await ADAPTERS[provider].connect(context(admin, fresh), body, state)
        const row: Record<string, unknown> = {
          ...BLANK, org_id: orgId, provider, ...patch, updated_at: now,
          ...(signIn
            ? { state_hash: await sha256Hex(state), state_user: me.user.id, state_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }
            : { connected_by: me.user.id, connected_at: now }),
        }
        const { error } = await admin.from('invoicing_connections').upsert(row, { onConflict: 'org_id' })
        if (error) { logErr('connect_save', { org: orgId, code: error.code }); throw new Refusal('save_failed', 500) }
        log('connect', { org: orgId, provider, sign_in: !!signIn })
        return json(signIn ? { url: signIn } : { ok: true }, 200, origin)
      }
      if (action === 'disconnect') {
        await admin.from('invoicing_connections').update({ ...BLANK, updated_at: now }).eq('org_id', orgId)
        log('disconnected', { org: orgId })
        return json({ ok: true }, 200, origin)
      }
      const conn = await readConn(admin, orgId)
      const ctx = context(admin, conn)
      const adapter = ADAPTERS[conn.provider!]
      if (action === 'setup') return json(await adapter.setup(ctx, body), 200, origin)
      await ctx.save(await adapter.saveSetup(ctx, body))
      return json({ ok: true }, 200, origin)
    }

    if (['push', 'sync'].includes(action)) {
      const id = String(body.invoice_id ?? '')
      if (!UUID.test(id)) throw new Refusal('invalid', 400)
      // Read as the user: only admins and members of the invoice's organisation get it
      const { data: inv, error } = await user.from('invoices').select(INVOICE_COLUMNS).eq('id', id).is('removed_at', null).maybeSingle()
      if (isTimeout(error)) throw new Refusal('timeout', 504)
      if (!inv) throw new Refusal('not_found', 404)
      const invoice = inv as unknown as Invoice
      const conn = await readConn(admin, invoice.org_id)
      const ctx = context(admin, conn)
      const adapter = ADAPTERS[conn.provider!]

      if (action === 'push') {
        let original: Original | null = null
        if (invoice.kind === 'credit_note' && invoice.credited_invoice_id) {
          const { data } = await user.from('invoices').select('provider, provider_document_id, legal_number, lines').eq('id', invoice.credited_invoice_id).maybeSingle()
          original = (data as Original | null) ?? null
        }
        const { document_id } = await adapter.push(ctx, invoice, original)
        const { error: upErr } = await admin.from('invoices')
          .update({ status: 'sent', provider: conn.provider, provider_document_id: document_id }).eq('id', id).eq('status', 'draft')
        if (upErr) logErr('mark_sent', { invoice: id, code: upErr.code })
        log('pushed', { invoice: id, provider: conn.provider })
        return json({ state: 'sent', provider: conn.provider }, 200, origin)
      }

      // sync
      if (invoice.status !== 'sent' || !invoice.provider || !invoice.provider_document_id) throw new Refusal('not_sent', 409)
      if (invoice.provider !== conn.provider) throw new Refusal('provider_changed', 409)
      const back = await adapter.sync(ctx, invoice)
      if (back.state !== 'issued') return json(back, 200, origin)
      const issue = back.issue_date
      const due = back.due_date && (!issue || back.due_date >= issue) ? back.due_date : null
      const { error: upErr } = await admin.from('invoices').update({
        status: 'issued', legal_number: back.legal_number, pdf_url: back.pdf_url, ...(issue ? { issue_date: issue } : {}), ...(due ? { due_date: due } : {}),
      }).eq('id', id).eq('status', 'sent')
      if (upErr) { logErr('mark_issued', { invoice: id, code: upErr.code }); throw new Refusal('save_failed', 500) }
      log('issued', { invoice: id, provider: conn.provider })
      return json(back, 200, origin)
    }
    return json({ error: 'invalid' }, 400, origin)
  } catch (e) {
    if (e instanceof Refusal) return json({ error: e.code, detail: e.detail }, e.status, origin)
    if (isTimeout(e)) return json({ error: 'timeout' }, 504, origin)
    logErr('unexpected', { action })
    return json({ error: 'program_error' }, 500, origin)
  }
})

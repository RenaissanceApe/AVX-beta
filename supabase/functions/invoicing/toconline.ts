// TOConline adapter (step 11b). Each company makes its own API details in TOConline (Empresa →
// Configurações → Dados API): a client id, a secret, an OAuth address and an API address. The admin
// types them in AVX, then signs in to TOConline. No developer key from AVX's owner.
// Drafts use TOConline's older API (/api/commercial_sales_documents, then one call per line); the
// newer /api/v1 one finalises on creation, so it is never used. Docs: https://api-docs.toconline.pt
import { type Adapter, type Ctx, type Invoice, type Line, type ReadBack, Refusal, checkSendable, cleanVat, httpsOrNull, singleExemption, splitAddress, todayIso } from './common.ts'

// ── Mapping (unit-tested) ───────────────────────────────────────────────────
// Only TOConline's own https addresses: the secret is never sent anywhere else
export function tocUrl(u: unknown) {
  try {
    const url = new URL(String(u ?? '').trim())
    if (url.protocol !== 'https:' || !(url.hostname === 'toconline.pt' || url.hostname.endsWith('.toconline.pt'))) return null
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch { return null }
}

export function tocHeader(inv: Invoice, opts: { seriesId: number | null; seriesPrefix: string | null; exemptionId: string | null; parentReference: string | null }) {
  const date = inv.issue_date || todayIso()
  const vat = cleanVat(inv.client_tax_id)
  const a = splitAddress(inv.client_address)
  return {
    type: 'commercial_sales_documents',
    attributes: {
      document_type: inv.kind === 'credit_note' ? 'NC' : 'FT',
      date,
      ...(inv.due_date && inv.due_date >= date ? { due_date: inv.due_date } : {}),
      // A credit note goes in the NC series with the same prefix
      ...(inv.kind === 'invoice' && opts.seriesId ? { document_series_id: opts.seriesId } : opts.seriesPrefix ? { document_series_prefix: opts.seriesPrefix } : {}),
      // With a NIF, TOConline finds the client or creates it
      ...(vat ? { customer_tax_registration_number: vat } : {}),
      customer_business_name: inv.client_name.slice(0, 200),
      ...(a.street ? { customer_address_detail: a.street } : {}),
      ...(a.postcode ? { customer_postcode: a.postcode } : {}),
      ...(a.city ? { customer_city: a.city } : {}),
      customer_country: 'PT',
      vat_included_prices: false,
      currency_iso_code: 'EUR',
      ...(opts.exemptionId ? { tax_exemption_reason_id: Number(opts.exemptionId) } : {}),
      ...(opts.parentReference ? { parent_document_reference: opts.parentReference } : {}),
      notes: inv.notes || '',
      external_reference: `AVX ${inv.number}`,
    },
  }
}

export function tocLine(l: Line, documentId: string, serviceId: string, taxId: string) {
  return {
    type: 'commercial_sales_document_lines',
    attributes: {
      document_id: Number(documentId),
      item_type: 'Service',
      item_id: Number(serviceId),
      description: (l.details ? `${l.description} — ${l.details}` : l.description).slice(0, 500),
      quantity: l.qty,
      unit_price: l.unit_price,
      ...(l.discount_pct ? { settlement_expression: String(l.discount_pct) } : {}),
      tax_id: Number(taxId),
    },
  }
}

// TOConline's VAT ids by rate (mainland Portugal; 0 % is the "ISE" one)
export function tocTaxIdFor(taxes: { id: string; attributes?: { tax_code?: string; tax_percentage?: number | string; tax_country_region?: string } }[]) {
  const pt = (taxes || []).filter(t => (t.attributes?.tax_country_region ?? 'PT') === 'PT')
  return (rate: number) => {
    const t = rate === 0
      ? pt.find(x => x.attributes?.tax_code === 'ISE')
      : pt.find(x => Number(x.attributes?.tax_percentage) === rate && x.attributes?.tax_code !== 'ISE')
    if (!t) throw new Refusal('tax_missing', 400, String(rate))
    return String(t.id)
  }
}

export function tocReadBack(attrs: { status?: number | string; document_no?: string; date?: string; due_date?: string; public_link?: string } | null, pdf: unknown): ReadBack {
  if (!attrs) return { state: 'missing' }
  if (Number(attrs.status) !== 1 || !attrs.document_no) return { state: 'draft' }
  return {
    state: 'issued', legal_number: String(attrs.document_no).slice(0, 60), pdf_url: httpsOrNull(pdf) ?? httpsOrNull(attrs.public_link),
    issue_date: attrs.date ? String(attrs.date).slice(0, 10) : null, due_date: attrs.due_date ? String(attrs.due_date).slice(0, 10) : null,
  }
}

// ── Calls ───────────────────────────────────────────────────────────────────
const settings = (ctx: Ctx) => ctx.conn.settings as { oauth_url?: string; api_url?: string; service_id?: string }

async function tokenCall(ctx: Ctx, params: Record<string, string>) {
  const s = settings(ctx)
  if (!s.oauth_url || !ctx.conn.account || !ctx.conn.api_key) throw new Refusal('not_connected', 400)
  const res = await ctx.http(`${s.oauth_url}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
      Authorization: `Basic ${btoa(`${ctx.conn.account}:${ctx.conn.api_key}`)}`,
    },
    body: new URLSearchParams({ ...params, scope: 'commercial' }).toString(),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Refusal(params.grant_type === 'refresh_token' ? 'reconnect' : 'connect_failed', 400)
  return {
    access_token: body.access_token as string, refresh_token: (body.refresh_token as string) || ctx.conn.refresh_token,
    access_expires_at: new Date(Date.now() + (body.expires_in || 14400) * 1000).toISOString(),
  }
}

async function token(ctx: Ctx) {
  const c = ctx.conn
  if (!c.refresh_token) throw new Refusal('not_connected', 400)
  if (c.access_token && c.access_expires_at && new Date(c.access_expires_at).getTime() > Date.now() + 60_000) return c.access_token
  const t = await tokenCall(ctx, { grant_type: 'refresh_token', refresh_token: c.refresh_token })
  await ctx.save(t)
  Object.assign(c, t)
  return t.access_token
}

async function call(ctx: Ctx, method: string, path: string, data?: unknown) {
  const s = settings(ctx)
  const tok = await token(ctx)
  const res = await ctx.http(`${s.api_url}/api/${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Content-Type': 'application/vnd.api+json' },
    ...(data ? { body: JSON.stringify({ data }) } : {}),
  })
  if (res.status === 401) throw new Refusal('reconnect', 400)
  if (res.status === 404) return null
  if (res.status === 400 || res.status === 422) throw new Refusal('refused', 400, (await res.text().catch(() => '')).slice(0, 500))
  if (!res.ok) throw new Refusal('program_error', 502)
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

async function series(ctx: Ctx) {
  const out = await call(ctx, 'GET', 'commercial_document_series?filter[document_type]=FT')
  return ((out?.data ?? []) as { id: string; attributes?: { prefix?: string } }[]).map(s => ({ document_set_id: Number(s.id), name: String(s.attributes?.prefix ?? s.id) }))
}

// The one "AVX-SERVICE" service every line uses (each line sends its own description, price and VAT)
async function serviceId(ctx: Ctx) {
  const s = settings(ctx)
  if (s.service_id) return s.service_id
  const found = await call(ctx, 'GET', 'services?filter[item_code]=AVX-SERVICE')
  let id = found?.data?.[0]?.id
  if (!id) {
    const made = await call(ctx, 'POST', 'services', { type: 'services', attributes: { item_code: 'AVX-SERVICE', item_description: 'AVX service', sales_price: 0, tax_code: 'NOR' } })
    id = made?.data?.id
  }
  if (!id) throw new Refusal('program_error', 502)
  await ctx.save({ settings: { ...s, service_id: String(id) } })
  return String(id)
}

export const toconline: Adapter = {
  async connect(ctx, input, state) {
    const oauth = tocUrl(input.oauth_url)
    const api = tocUrl(input.api_url)
    const clientId = String(input.client_id ?? '').trim()
    const secret = String(input.client_secret ?? '').trim()
    if (!oauth || !api || !/^[\w.-]{1,200}$/.test(clientId) || secret.length < 8 || secret.length > 500) throw new Refusal('invalid_keys', 400)
    const q = new URLSearchParams({ client_id: clientId, redirect_uri: ctx.redirectUri, response_type: 'code', scope: 'commercial', state })
    return { patch: { account: clientId, api_key: secret, settings: { oauth_url: oauth, api_url: api } }, url: `${oauth}/auth?${q}` }
  },

  async callback(ctx, code) {
    const t = await tokenCall(ctx, { grant_type: 'authorization_code', code, redirect_uri: ctx.redirectUri })
    return { ...t, refresh_expires_at: null }
  },

  async setup(ctx) {
    return { document_sets: await series(ctx), document_set_id: ctx.conn.document_set_id }
  },

  async saveSetup(ctx, input) {
    const set = (await series(ctx)).find(s => s.document_set_id === Number(input.document_set_id))
    if (!set) throw new Refusal('invalid', 400)
    return { document_set_id: set.document_set_id, document_set_name: set.name }
  },

  async push(ctx, inv, original) {
    checkSendable(inv)
    let parentReference: string | null = null
    if (inv.kind === 'credit_note') {
      if (!original?.legal_number) throw new Refusal('credit_manual', 400)
      parentReference = original.legal_number
    }
    const exemption = singleExemption(inv.lines)
    const taxes = await call(ctx, 'GET', 'taxes?filter[tax_country_region]=PT')
    const taxIdFor = tocTaxIdFor(taxes?.data ?? [])
    const taxIds = inv.lines.map(l => taxIdFor(l.vat_rate))
    let exemptionId: string | null = null
    if (exemption) {
      const r = await call(ctx, 'GET', `tax_exemption_reasons?filter[code]=${encodeURIComponent(exemption)}`)
      exemptionId = r?.data?.[0]?.id ?? null
      if (!exemptionId) throw new Refusal('tax_missing', 400, exemption)
    }
    const service = await serviceId(ctx)
    const head = await call(ctx, 'POST', 'commercial_sales_documents', tocHeader(inv, {
      seriesId: ctx.conn.document_set_id, seriesPrefix: ctx.conn.document_set_name, exemptionId, parentReference,
    }))
    const docId = head?.data?.id
    if (!docId) throw new Refusal('program_error', 502)
    try {
      for (let i = 0; i < inv.lines.length; i++) {
        await call(ctx, 'POST', 'commercial_sales_document_lines', tocLine(inv.lines[i], String(docId), service, taxIds[i]))
      }
    } catch (e) {
      // Don't leave half a draft in TOConline (a draft can be removed there; a finalised one can't)
      await call(ctx, 'DELETE', `commercial_sales_documents/${encodeURIComponent(docId)}`).catch(() => null)
      throw e
    }
    return { document_id: String(docId) }
  },

  async sync(ctx, inv) {
    const out = await call(ctx, 'GET', `commercial_sales_documents/${encodeURIComponent(inv.provider_document_id!)}`)
    const attrs = out?.data?.attributes ?? null
    if (!attrs || Number(attrs.status) !== 1) return tocReadBack(attrs, null)
    let pdf: string | null = null
    try {
      const p = await call(ctx, 'GET', `url_for_print/${encodeURIComponent(inv.provider_document_id!)}?filter[type]=Document&filter[copies]=1`)
      const u = p?.data?.attributes?.url
      if (u?.host && u?.path) pdf = `${u.scheme || 'https'}://${u.host}${u.path}`
    } catch { pdf = null }
    return tocReadBack(attrs, pdf)
  },
}

// Moloni adapter (step 11b; written in step 11 as the moloni function). OAuth sign-in with the
// developer app's MOLONI_CLIENT_ID / MOLONI_CLIENT_SECRET (Supabase secrets). Docs: https://www.moloni.pt/dev/
// Every invoice line uses one "AVX service" product and sends its own name, price and VAT.
import { type Adapter, type Ctx, type Invoice, type Line, type Original, type ReadBack, CONSUMER_VAT, Refusal, checkSendable, cleanVat, docPrefix, httpsOrNull, splitAddress, todayIso } from './common.ts'

const API = 'https://api.moloni.pt/v1'
const AUTHORIZE = 'https://www.moloni.pt/ac/root/oauth/'
const REFRESH_DAYS = 14

type Tax = { tax_id: number; value: number; type?: number; saft_type?: number | string; fiscal_zone?: string }

// ── Mapping (unit-tested) ───────────────────────────────────────────────────
export function moloniProducts(lines: Line[], productId: number, taxIdFor: (rate: number) => number) {
  return lines.map((l, i) => ({
    product_id: productId, name: l.description.slice(0, 250), ...(l.details ? { summary: l.details.slice(0, 1000) } : {}),
    qty: l.qty, price: l.unit_price, discount: l.discount_pct || 0, order: i + 1,
    ...(l.vat_rate > 0
      ? { taxes: [{ tax_id: taxIdFor(l.vat_rate), value: l.vat_rate, order: 1, cumulative: 0 }] }
      : { taxes: [], exemption_reason: l.vat_exemption || 'M99' }),
  }))
}

// VAT (SAF-T type 1) as a percentage, mainland Portugal first
export function moloniVatTaxes(all: Tax[]) {
  return (all || []).filter(t => String(t.saft_type ?? '1') === '1' && (t.type == null || Number(t.type) === 1))
    .sort((a, b) => (a.fiscal_zone === 'PT' ? -1 : 0) - (b.fiscal_zone === 'PT' ? -1 : 0))
}

export function moloniTaxIdFor(taxes: Tax[]) {
  return (rate: number) => {
    const t = taxes.find(x => Number(x.value) === rate)
    if (!t) throw new Refusal('tax_missing', 400, String(rate))
    return t.tax_id
  }
}

// The credited invoice's line in Moloni for each credit-note line: by our line id (credit lines keep
// it in source_id), else the first line at the same VAT rate
export function moloniRelated(ours: Line[], theirs: { document_product_id?: number; taxes?: { value?: number }[] }[], l: Line) {
  const i = ours.findIndex(o => o.id === l.source_id)
  if (i >= 0 && theirs[i]?.document_product_id) return theirs[i].document_product_id!
  const byRate = theirs.find(p => Number(p.taxes?.[0]?.value ?? 0) === l.vat_rate)
  if (!byRate?.document_product_id) throw new Refusal('credit_manual', 400)
  return byRate.document_product_id
}

export function moloniReadBack(kind: Invoice['kind'], doc: { document_id?: number; status?: number; number?: number; date?: string; expiration_date?: string | null; document_set?: { name?: string }; document_set_name?: string } | null, pdf: unknown): ReadBack {
  if (!doc?.document_id) return { state: 'missing' }
  if (Number(doc.status) !== 1) return { state: 'draft' }
  const series = doc.document_set?.name ?? doc.document_set_name ?? ''
  return {
    state: 'issued', legal_number: `${docPrefix(kind)} ${series ? `${series}/` : ''}${doc.number}`, pdf_url: httpsOrNull(pdf),
    issue_date: doc.date ? String(doc.date).slice(0, 10) : null,
    due_date: doc.expiration_date ? String(doc.expiration_date).slice(0, 10) : null,
  }
}

// ── Calls ───────────────────────────────────────────────────────────────────
async function grant(ctx: Ctx, params: Record<string, string>) {
  const q = new URLSearchParams({ client_id: ctx.env('MOLONI_CLIENT_ID'), client_secret: ctx.env('MOLONI_CLIENT_SECRET'), ...params })
  const res = await ctx.http(`${API}/grant/?${q}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Refusal(params.grant_type === 'refresh_token' ? 'reconnect' : 'connect_failed', 400)
  return {
    access_token: body.access_token as string, refresh_token: body.refresh_token as string,
    access_expires_at: new Date(Date.now() + (body.expires_in || 3600) * 1000).toISOString(),
    refresh_expires_at: new Date(Date.now() + REFRESH_DAYS * 864e5).toISOString(),
  }
}

// POST with a JSON body, as Moloni documents it (json=true in the address)
async function call(ctx: Ctx, token: string, path: string, body: Record<string, unknown>) {
  const res = await ctx.http(`${API}/${path}/?access_token=${encodeURIComponent(token)}&json=true`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || out == null) throw new Refusal('program_error', 502)
  // Insert calls answer { valid: 1, ... }; a refused one answers a list of field errors
  if (Array.isArray(out) && path.endsWith('/insert')) throw new Refusal('refused', 400, JSON.stringify(out).slice(0, 500))
  if (out && typeof out === 'object' && !Array.isArray(out) && out.error) throw new Refusal(out.error === 'invalid_token' ? 'reconnect' : 'program_error', 400)
  return out
}

// A working access token, refreshed when it has (nearly) run out. Each refresh also gives a new
// refresh token, valid 14 days: an organisation that doesn't use Moloni for 14 days signs in again.
async function token(ctx: Ctx) {
  const c = ctx.conn
  if (!c.refresh_token) throw new Refusal('not_connected', 400)
  if (c.access_token && c.access_expires_at && new Date(c.access_expires_at).getTime() > Date.now() + 60_000) return c.access_token
  if (!c.refresh_expires_at || new Date(c.refresh_expires_at).getTime() <= Date.now()) throw new Refusal('reconnect', 400)
  const t = await grant(ctx, { grant_type: 'refresh_token', refresh_token: c.refresh_token })
  await ctx.save(t)
  Object.assign(c, t)
  return t.access_token
}

async function setupLists(ctx: Ctx, tok: string, companyId: number | null) {
  const companies = ((await call(ctx, tok, 'companies/getAll', {})) as { company_id: number; name: string }[])
    .map(c => ({ company_id: c.company_id, name: c.name }))
  const company = companyId ?? companies[0]?.company_id ?? null
  const sets = company
    ? ((await call(ctx, tok, 'documentSets/getAll', { company_id: company })) as { document_set_id: number; name: string }[])
        .map(s => ({ document_set_id: s.document_set_id, name: s.name }))
    : []
  return { companies, company_id: company, document_sets: sets }
}

async function ensureProduct(ctx: Ctx, tok: string, companyId: number, taxes: Tax[]) {
  const found = await call(ctx, tok, 'products/getByReference', { company_id: companyId, reference: 'AVX-SERVICE', exact: 1 }) as { product_id: number }[]
  if (Array.isArray(found) && found[0]?.product_id) return found[0].product_id
  const categories = await call(ctx, tok, 'productCategories/getAll', { company_id: companyId, parent_id: 0 }) as { category_id: number }[]
  let categoryId = categories?.[0]?.category_id
  if (!categoryId) categoryId = (await call(ctx, tok, 'productCategories/insert', { company_id: companyId, parent_id: 0, name: 'AVX' }) as { category_id: number }).category_id
  const units = await call(ctx, tok, 'measurementUnits/getAll', { company_id: companyId }) as { unit_id: number }[]
  const standard = [...taxes].sort((a, b) => b.value - a.value)[0]
  const out = await call(ctx, tok, 'products/insert', {
    company_id: companyId, category_id: categoryId, type: 2, name: 'AVX service', reference: 'AVX-SERVICE', price: 0,
    unit_id: units?.[0]?.unit_id, has_stock: 0, stock: 0,
    ...(standard ? { taxes: [{ tax_id: standard.tax_id, value: standard.value, order: 1, cumulative: 0 }] } : { exemption_reason: 'M99' }),
  }) as { product_id: number }
  return out.product_id
}

async function customerId(ctx: Ctx, tok: string, companyId: number, inv: Invoice) {
  const vat = cleanVat(inv.client_tax_id) || CONSUMER_VAT
  const found = await call(ctx, tok, 'customers/getByVat', { company_id: companyId, vat }) as { customer_id: number }[]
  if (Array.isArray(found) && found[0]?.customer_id) return found[0].customer_id
  if (vat === CONSUMER_VAT) throw new Refusal('customer', 400)
  // A new client: Moloni's own defaults for payment, Portugal
  const [maturity, methods] = await Promise.all([
    call(ctx, tok, 'maturityDates/getAll', { company_id: companyId }) as Promise<{ maturity_date_id: number }[]>,
    call(ctx, tok, 'paymentMethods/getAll', { company_id: companyId }) as Promise<{ payment_method_id: number }[]>,
  ])
  const a = splitAddress(inv.client_address)
  try {
    const out = await call(ctx, tok, 'customers/insert', {
      company_id: companyId, vat, number: vat.slice(0, 20), name: inv.client_name.slice(0, 120),
      language_id: inv.language === 'en' ? 2 : 1, address: a.street || '—', zip_code: a.postcode || '', city: a.city || '—', country_id: 1,
      email: inv.client_email || '', maturity_date_id: maturity?.[0]?.maturity_date_id ?? 0,
      payment_method_id: methods?.[0]?.payment_method_id ?? 0, copies: [], delivery_method_id: 0,
    }) as { customer_id: number }
    return out.customer_id
  } catch (e) {
    if (e instanceof Refusal && e.code === 'refused') throw new Refusal('customer', 400, e.detail)
    throw e
  }
}

export const moloni: Adapter = {
  async connect(ctx, _input, state) {
    if (!ctx.env('MOLONI_CLIENT_ID') || !ctx.env('MOLONI_CLIENT_SECRET')) throw new Refusal('not_configured', 400)
    const q = new URLSearchParams({ response_type: 'code', client_id: ctx.env('MOLONI_CLIENT_ID'), redirect_uri: ctx.redirectUri, state })
    return { patch: {}, url: `${AUTHORIZE}?${q}` }
  },

  async callback(ctx, code) {
    return await grant(ctx, { grant_type: 'authorization_code', code, redirect_uri: ctx.redirectUri })
  },

  async setup(ctx, input) {
    const tok = await token(ctx)
    const wanted = input.company_id == null ? ctx.conn.company_id : Number(input.company_id)
    return { ...(await setupLists(ctx, tok, wanted)), document_set_id: ctx.conn.document_set_id }
  },

  async saveSetup(ctx, input) {
    const tok = await token(ctx)
    const lists = await setupLists(ctx, tok, Number(input.company_id))
    const company = lists.companies.find(c => c.company_id === Number(input.company_id))
    const set = lists.document_sets.find(s => s.document_set_id === Number(input.document_set_id))
    if (!company || !set) throw new Refusal('invalid', 400)
    return {
      company_id: company.company_id, company_name: company.name, document_set_id: set.document_set_id, document_set_name: set.name,
      product_id: company.company_id === ctx.conn.company_id ? ctx.conn.product_id : null,
    }
  },

  async push(ctx, inv, original) {
    checkSendable(inv)
    const c = ctx.conn
    if (!c.company_id || !c.document_set_id) throw new Refusal('setup', 400)
    const tok = await token(ctx)
    const taxes = moloniVatTaxes(await call(ctx, tok, 'taxes/getAll', { company_id: c.company_id }) as Tax[])
    const taxIdFor = moloniTaxIdFor(taxes)
    inv.lines.forEach(l => { if (l.vat_rate > 0) taxIdFor(l.vat_rate) })
    let productId = c.product_id
    if (!productId) {
      productId = await ensureProduct(ctx, tok, c.company_id, taxes)
      await ctx.save({ product_id: productId })
    }
    const customer = await customerId(ctx, tok, c.company_id, inv)
    const date = inv.issue_date || todayIso()
    const base = {
      company_id: c.company_id, date, document_set_id: c.document_set_id, customer_id: customer,
      our_reference: `AVX ${inv.number}`, notes: inv.notes || '', status: 0,
    }
    if (inv.kind === 'credit_note') {
      if (original?.provider !== 'moloni' || !original.provider_document_id) throw new Refusal('credit_manual', 400)
      const docId = Number(original.provider_document_id)
      const doc = await call(ctx, tok, 'invoices/getOne', { company_id: c.company_id, document_id: docId }) as { products?: { document_product_id?: number; taxes?: { value?: number }[] }[] }
      const theirs = doc?.products ?? []
      if (!theirs.length) throw new Refusal('credit_manual', 400)
      const products = moloniProducts(inv.lines, productId, taxIdFor).map((p, i) => ({ ...p, related_id: moloniRelated(original.lines, theirs, inv.lines[i]) }))
      const out = await call(ctx, tok, 'creditNotes/insert', { ...base, associated_documents: [{ associated_id: docId, value: inv.total }], products }) as { document_id: number }
      return { document_id: String(out.document_id) }
    }
    const out = await call(ctx, tok, 'invoices/insert', { ...base, expiration_date: inv.due_date || date, products: moloniProducts(inv.lines, productId, taxIdFor) }) as { document_id: number }
    return { document_id: String(out.document_id) }
  },

  async sync(ctx, inv) {
    const tok = await token(ctx)
    const id = Number(inv.provider_document_id)
    const path = inv.kind === 'credit_note' ? 'creditNotes/getOne' : 'invoices/getOne'
    const doc = await call(ctx, tok, path, { company_id: ctx.conn.company_id, document_id: id })
    if (!doc?.document_id || Number(doc.status) !== 1) return moloniReadBack(inv.kind, doc, null)
    let pdf: unknown = null
    try { pdf = (await call(ctx, tok, 'documents/getPDFLink', { company_id: ctx.conn.company_id, document_id: id }) as { url?: string })?.url } catch { pdf = null }
    return moloniReadBack(inv.kind, doc, pdf)
  },
}

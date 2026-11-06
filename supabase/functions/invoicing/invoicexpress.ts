// InvoiceXpress adapter (step 11b). The organisation's admin types the account name (the part
// before .app.invoicexpress.com) and the API key (InvoiceXpress: Account → API). New documents are
// created as drafts; you finalise them in InvoiceXpress. Docs: https://invoicexpress.com/api-v2/
import { type Adapter, type Ctx, type Invoice, type Original, type ReadBack, Refusal, checkSendable, cleanVat, docPrefix, httpsOrNull, singleExemption, splitAddress, todayIso } from './common.ts'

type Tax = { id: number; name: string; value: number; region?: string }

// ── Mapping (unit-tested) ───────────────────────────────────────────────────
export const ACCOUNT = /^[a-z0-9][a-z0-9-]{0,62}$/i

// 2027-03-05 ⇄ 05/03/2027
export const ixDate = (iso: string) => iso.split('-').reverse().join('/')
export function ixIso(d: unknown) {
  const m = String(d ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

// The account's tax name for each rate ("IVA23"), mainland Portugal first
export function ixTaxNameFor(taxes: Tax[]) {
  const sorted = [...(taxes || [])].sort((a, b) => (a.region === 'PT' ? -1 : 0) - (b.region === 'PT' ? -1 : 0))
  return (rate: number) => {
    const t = sorted.find(x => Number(x.value) === rate)
    if (!t) throw new Refusal('tax_missing', 400, String(rate))
    return t.name
  }
}

// The document type in the address and the key of the body
export const ixType = (kind: Invoice['kind']) => kind === 'credit_note' ? { path: 'credit_notes', key: 'credit_note' } : { path: 'invoices', key: 'invoice' }

export function ixDocument(inv: Invoice, opts: { taxName: (rate: number) => string; sequenceId: number | null; ownerId: string | null }) {
  // InvoiceXpress takes no negative amounts: a "less deposits" line is done by hand there
  if (inv.lines.some(l => l.qty < 0 || l.unit_price < 0)) throw new Refusal('negative_line', 400)
  const date = inv.issue_date || todayIso()
  const vat = cleanVat(inv.client_tax_id)
  const a = splitAddress(inv.client_address)
  const exemption = singleExemption(inv.lines)
  return {
    date: ixDate(date),
    due_date: ixDate(inv.due_date && inv.due_date >= date ? inv.due_date : date),
    reference: `AVX ${inv.number}`,
    observations: inv.notes || '',
    ...(opts.sequenceId ? { sequence_id: opts.sequenceId } : {}),
    ...(exemption ? { tax_exemption: exemption } : {}),
    ...(opts.ownerId ? { owner_invoice_id: Number(opts.ownerId) } : {}),
    client: {
      name: inv.client_name.slice(0, 200),
      // An existing client with this code is used as it is; a new one is created
      code: vat || `AVX-${(inv.client_id || inv.id).slice(0, 8)}`,
      ...(vat ? { fiscal_id: vat } : {}),
      ...(inv.client_email ? { email: inv.client_email } : {}),
      ...(a.street ? { address: a.street } : {}),
      ...(a.postcode ? { postal_code: a.postcode } : {}),
      ...(a.city ? { city: a.city } : {}),
      country: 'Portugal',
      language: inv.language === 'en' ? 'en' : 'pt',
    },
    items: inv.lines.map(l => ({
      name: l.description.slice(0, 100),
      description: (l.details || l.description).slice(0, 1000),
      unit_price: l.unit_price,
      quantity: l.qty,
      discount: l.discount_pct || 0,
      tax: { name: opts.taxName(l.vat_rate) },
    })),
  }
}

export function ixReadBack(kind: Invoice['kind'], doc: { id?: number; status?: string; inverted_sequence_number?: string; sequence_number?: string; date?: string; due_date?: string; permalink?: string } | null, pdf: unknown): ReadBack {
  if (!doc?.id || doc.status === 'deleted' || doc.status === 'canceled') return { state: 'missing' }
  if (doc.status === 'draft') return { state: 'draft' }
  const seq = doc.inverted_sequence_number || doc.sequence_number?.split('/').reverse().join('/') || ''
  return {
    state: 'issued', legal_number: `${docPrefix(kind)} ${seq}`.trim(), pdf_url: httpsOrNull(pdf) ?? httpsOrNull(doc.permalink),
    issue_date: ixIso(doc.date), due_date: ixIso(doc.due_date),
  }
}

// ── Calls ───────────────────────────────────────────────────────────────────
async function call(ctx: Ctx, method: string, path: string, body?: unknown) {
  const { account, api_key } = ctx.conn
  if (!account || !api_key) throw new Refusal('not_connected', 400)
  const res = await ctx.http(`https://${account}.app.invoicexpress.com/${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(api_key)}`, {
    method, headers: { accept: 'application/json', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (res.status === 401) throw new Refusal('reconnect', 400)
  if (res.status === 404) return { status: 404, body: null }
  if (res.status === 422) throw new Refusal('refused', 400, (await res.text().catch(() => '')).slice(0, 500))
  if (!res.ok) throw new Refusal('program_error', 502)
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function sequences(ctx: Ctx) {
  const { body } = await call(ctx, 'GET', 'sequences.json')
  return ((body?.sequences ?? []) as { id: number; serie: string; default_sequence?: number }[])
}

export const invoicexpress: Adapter = {
  async connect(ctx, input) {
    const account = String(input.account ?? '').trim().toLowerCase().replace(/\.app\.invoicexpress\.com.*$/, '').replace(/^https?:\/\//, '')
    const apiKey = String(input.api_key ?? '').trim()
    if (!ACCOUNT.test(account) || apiKey.length < 10 || apiKey.length > 200) throw new Refusal('invalid_keys', 400)
    // Try the key before keeping it
    ctx.conn.account = account
    ctx.conn.api_key = apiKey
    const seqs = await sequences(ctx)
    const def = seqs.find(s => s.default_sequence) ?? seqs[0]
    return { patch: { account, api_key: apiKey, document_set_id: def?.id ?? null, document_set_name: def?.serie ?? null, connected_at: new Date().toISOString() } }
  },

  async setup(ctx) {
    const seqs = await sequences(ctx)
    return { document_sets: seqs.map(s => ({ document_set_id: s.id, name: s.serie })), document_set_id: ctx.conn.document_set_id }
  },

  async saveSetup(ctx, input) {
    const set = (await sequences(ctx)).find(s => s.id === Number(input.document_set_id))
    if (!set) throw new Refusal('invalid', 400)
    return { document_set_id: set.id, document_set_name: set.serie }
  },

  async push(ctx, inv, original: Original | null) {
    checkSendable(inv)
    let ownerId: string | null = null
    if (inv.kind === 'credit_note') {
      if (original?.provider !== 'invoicexpress' || !original.provider_document_id) throw new Refusal('credit_manual', 400)
      ownerId = original.provider_document_id
    }
    const { body: taxes } = await call(ctx, 'GET', 'taxes.json')
    const doc = ixDocument(inv, { taxName: ixTaxNameFor(taxes?.taxes ?? []), sequenceId: ctx.conn.document_set_id, ownerId })
    const t = ixType(inv.kind)
    const { body } = await call(ctx, 'POST', `${t.path}.json`, { [t.key]: doc })
    const id = body?.[t.key]?.id ?? body?.invoice?.id
    if (!id) throw new Refusal('program_error', 502)
    return { document_id: String(id) }
  },

  async sync(ctx, inv) {
    const t = ixType(inv.kind)
    const { body } = await call(ctx, 'GET', `${t.path}/${encodeURIComponent(inv.provider_document_id!)}.json`)
    const doc = body?.[t.key] ?? body?.invoice ?? null
    if (!doc || doc.status === 'draft' || doc.status === 'deleted' || doc.status === 'canceled') return ixReadBack(inv.kind, doc, null)
    // The PDF can take a moment to be made (202): ask once more, else keep the document's page
    let pdf: unknown = null
    for (let i = 0; i < 2 && !pdf; i++) {
      const r = await call(ctx, 'GET', `api/pdf/${encodeURIComponent(inv.provider_document_id!)}.json`).catch(() => null)
      pdf = r?.status === 200 ? r.body?.output?.pdfUrl : null
      if (!pdf && i === 0) await new Promise(res => setTimeout(res, 1500))
    }
    return ixReadBack(inv.kind, doc, pdf)
  },
}

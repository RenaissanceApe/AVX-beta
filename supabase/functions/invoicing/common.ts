// What every invoicing-program adapter shares (step 11b). Pure code only (no Deno or npm imports),
// so the Vitest unit tests in src/lib/invoicingAdapters.test.js can load it.

export const PROVIDERS = ['moloni', 'invoicexpress', 'toconline'] as const
export type Provider = typeof PROVIDERS[number]

// AT's "final consumer" tax number, for a client without one
export const CONSUMER_VAT = '999999990'

// An error the app shows in plain words: `code` picks the message (i18n invoices.err.*), `detail`
// is the program's own text, shown under it
export class Refusal extends Error {
  constructor(public code: string, public status = 400, public detail?: string) { super(code) }
}

export type Line = {
  id: string; description: string; details?: string; qty: number; unit_price: number; discount_pct?: number
  vat_rate: number; vat_exemption?: string; source_id?: string; kind?: string
}
export type Invoice = {
  id: string; org_id: string; number: number; kind: 'invoice' | 'credit_note'; status: string
  credited_invoice_id: string | null; client_id: string | null
  client_name: string; client_tax_id: string | null; client_address: string | null; client_email: string | null
  language: string; currency: string; lines: Line[]; total: number; notes: string | null
  issue_date: string | null; due_date: string | null
  provider: string | null; provider_document_id: string | null; legal_number: string | null
}
// The credited invoice, for a credit note
export type Original = { provider: string | null; provider_document_id: string | null; legal_number: string | null; lines: Line[] }

// One row of invoicing_connections (only the Edge Function reads it)
export type Conn = {
  org_id: string; provider: Provider | null
  account: string | null; api_key: string | null; settings: Record<string, unknown>
  access_token: string | null; access_expires_at: string | null; refresh_token: string | null; refresh_expires_at: string | null
  company_id: number | null; company_name: string | null; document_set_id: number | null; document_set_name: string | null
  product_id: number | null
}

// What "Check" reads back from the program
export type ReadBack =
  | { state: 'missing' }
  | { state: 'draft' }
  | { state: 'issued'; legal_number: string; pdf_url: string | null; issue_date: string | null; due_date: string | null }

export type Setup = {
  companies?: { company_id: number; name: string }[]; company_id?: number | null
  document_sets: { document_set_id: number; name: string }[]; document_set_id: number | null
}

export type Ctx = {
  conn: Conn
  http: (url: string, init?: RequestInit) => Promise<Response>
  save: (patch: Partial<Conn>) => Promise<void>       // writes this organisation's connection
  env: (k: string) => string
  redirectUri: string                                 // where an OAuth program sends the browser back
}

export interface Adapter {
  // Starts a connection with what the admin typed. Returns the row to store and, for a program with
  // a sign-in, the address to send the browser to.
  connect(ctx: Ctx, input: Record<string, unknown>, state: string): Promise<{ patch: Partial<Conn>; url?: string }>
  // OAuth programs: the sign-in came back with a code
  callback?(ctx: Ctx, code: string): Promise<Partial<Conn>>
  setup(ctx: Ctx, input: Record<string, unknown>): Promise<Setup>
  saveSetup(ctx: Ctx, input: Record<string, unknown>): Promise<Partial<Conn>>
  push(ctx: Ctx, inv: Invoice, original: Original | null): Promise<{ document_id: string }>
  sync(ctx: Ctx, inv: Invoice): Promise<ReadBack>
}

// ── Checks every program shares ─────────────────────────────────────────────
export function checkSendable(inv: Invoice) {
  if (inv.status !== 'draft') throw new Refusal('not_draft', 409)
  if (!inv.client_name?.trim() || !inv.lines?.length) throw new Refusal('incomplete', 400)
  if (inv.lines.some(l => l.vat_rate === 0 && !l.vat_exemption)) throw new Refusal('exemption_missing', 400)
  if (inv.currency !== 'EUR') throw new Refusal('currency', 400)
}

// "PT 501 234 567" → "501234567"; none → null
export function cleanVat(v: string | null | undefined) {
  const s = (v || '').replace(/[\s.-]+/g, '').replace(/^PT/i, '')
  return s || null
}

// The one exemption code of an invoice's 0 % lines, for programs that take one per document
// (InvoiceXpress, TOConline). Two different codes can't be sent: the app says to do it by hand.
export function singleExemption(lines: Line[]) {
  const codes = [...new Set(lines.filter(l => l.vat_rate === 0).map(l => l.vat_exemption || 'M99'))]
  if (codes.length > 1) throw new Refusal('mixed_exemptions', 400, codes.join(', '))
  return codes[0] ?? null
}

// "Rua 1\n1000-001 Lisboa" → { street: 'Rua 1', postcode: '1000-001', city: 'Lisboa' }
export function splitAddress(address: string | null | undefined) {
  const parts = (address || '').split(/\n|,/).map(s => s.trim()).filter(Boolean)
  let postcode: string | null = null
  let city: string | null = null
  const rest: string[] = []
  for (const p of parts) {
    const m = p.match(/^(\d{4}-\d{3})\s*(.*)$/)
    if (m && !postcode) { postcode = m[1]; city = m[2] || city }
    else rest.push(p)
  }
  if (!city && rest.length > 1) city = rest.pop()!
  return { street: rest.join(', ') || null, postcode, city }
}

// The program's legal number: "FT A/6" for an invoice, "NC A/2" for a credit note
export const docPrefix = (kind: Invoice['kind']) => kind === 'credit_note' ? 'NC' : 'FT'

// Only https links are kept (the database refuses others)
export const httpsOrNull = (u: unknown) => typeof u === 'string' && /^https:\/\//i.test(u) ? u.slice(0, 2000) : null

export const todayIso = () => new Date().toISOString().slice(0, 10)

// Invoices (step 11, docs/BUSINESS.md "How invoices work"). AVX prepares an invoice and hands it to
// a certified program (Moloni), which issues the legal invoice. Everything here is pure, so the
// invoice window, the list and the tests price an invoice the same way. invoiceTotals is the twin
// of the totals the database works out on every save (private.invoices_before_write).
import { normalizeBody, lineVatRate, quoteTotals, round2, localISODate, addDays } from './quotes'

export const INVOICE_STATUSES = ['draft', 'sent', 'issued', 'paid']
export const INVOICE_SCOPES = ['all', 'phases', 'deposit', 'rest']

const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}
const clampPct = v => Math.min(100, Math.max(0, num(v)))
const round4 = v => Math.round((v + Number.EPSILON) * 10000) / 10000

// A line's amount excl. VAT: qty × unit price, less its discount, to the cent
export const invoiceLineNet = l => round2(num(l.qty) * num(l.unit_price) * (1 - clampPct(l.discount_pct) / 100))

// Net, VAT per rate (on the sum of each rate's lines) and total
export function invoiceTotals(lines = []) {
  const map = new Map()
  for (const l of lines) {
    const rate = clampPct(l.vat_rate)
    const cur = map.get(rate) || { rate, base: 0, exemptions: new Set() }
    cur.base = round2(cur.base + invoiceLineNet(l))
    if (rate === 0 && l.vat_exemption) cur.exemptions.add(l.vat_exemption)
    map.set(rate, cur)
  }
  const byRate = [...map.values()].sort((a, b) => b.rate - a.rate)
    .map(r => ({ rate: r.rate, base: r.base, vat: round2(r.base * r.rate / 100), exemptions: [...r.exemptions] }))
  const net = round2(byRate.reduce((s, r) => s + r.base, 0))
  const vat = round2(byRate.reduce((s, r) => s + r.vat, 0))
  return { net, vat, total: round2(net + vat), byRate }
}

// The quote's priced lines as invoice lines. The line, phase and quote discounts become one
// discount %, and qty × factor one quantity, so each line keeps its own VAT rate and the invoice
// prints like a normal invoice. phaseIds: only those phases (optional ones included when chosen);
// otherwise every phase that isn't optional. fallback(kind) names a line with no description.
export function quoteInvoiceLines(quote, { phaseIds = null, fallback = k => k } = {}) {
  const body = normalizeBody(quote.body)
  const quoteFactor = 1 - clampPct(quote.discount_pct) / 100
  const out = []
  for (const p of body.phases) {
    if (phaseIds ? !phaseIds.includes(p.id) : p.optional) continue
    const factor = (1 - p.discount_pct / 100) * quoteFactor
    for (const s of p.sections) {
      for (const l of s.lines) {
        if (l.kind === 'comment') continue
        const discount = round4(100 * (1 - (1 - l.discount_pct / 100) * factor))
        const rate = lineVatRate(l, quote)
        const qty = round4(num(l.qty) * num(l.factor, 1))
        out.push({
          id: l.id, source_id: l.id, kind: l.kind,
          description: (l.description || '').trim().slice(0, 300) || fallback(l.kind),
          ...(l.details?.trim() ? { details: l.details.trim().slice(0, 1000) } : {}),
          qty, unit_price: num(l.unit_price), discount_pct: Math.min(100, Math.max(0, discount)), vat_rate: rate,
          ...(rate === 0 && l.vat_exemption ? { vat_exemption: l.vat_exemption } : {}),
        })
      }
    }
  }
  return out
}

// What the quote's lines come to on an invoice, and what the quote itself says (they can differ
// by a cent, because an invoice rounds each line and the quote each phase)
export function quoteInvoiceGap(quote, lines) {
  return round2(invoiceTotals(lines).net - quoteTotals(quote).net)
}

// A deposit: pct % of the quote's total, one line per VAT rate (each rate's share of the net)
// label(rate) names the line, e.g. "Deposit 30% · Quote Q0012"
export function depositLines(quote, pct, { label = () => 'Deposit', phaseIds = null } = {}) {
  const p = clampPct(pct)
  if (!p) return []
  const rows = phaseIds ? invoiceTotals(quoteInvoiceLines(quote, { phaseIds })).byRate : quoteTotals(quote).vatByRate
  return rows.filter(r => r.base > 0).map(r => ({
    id: `deposit-${r.rate}`, kind: 'deposit', description: label(r.rate).slice(0, 300), qty: 1,
    unit_price: round2(r.base * p / 100), discount_pct: 0, vat_rate: r.rate,
    ...(r.rate === 0 && r.exemptions?.[0] ? { vat_exemption: r.exemptions[0] } : {}),
  }))
}

// The rest after deposits: the whole quote, less each earlier deposit invoice (not removed), line by
// line at the deposit's own rate. label(deposit) names the line, e.g. "Less deposit FT 2026/3".
export function restLines(quote, deposits = [], { fallback, label = d => `Deposit ${d.legal_number || d.number}` } = {}) {
  const lines = quoteInvoiceLines(quote, { fallback })
  for (const d of deposits) {
    if (d.removed_at || d.kind === 'credit_note' || d.scope !== 'deposit') continue
    for (const l of d.lines || []) {
      lines.push({
        id: `less-${d.id}-${l.id}`, kind: 'deposit', description: label(d).slice(0, 300), qty: 1,
        unit_price: -invoiceLineNet(l), discount_pct: 0, vat_rate: clampPct(l.vat_rate),
        ...(l.vat_exemption ? { vat_exemption: l.vat_exemption } : {}),
      })
    }
  }
  return lines
}

// A credit note starts as a copy of what is left to credit: the invoice's lines when nothing has
// been credited yet, else one line per rate for what is left.
export function creditLines(invoice, credits = [], { label = () => 'Credit' } = {}) {
  const live = credits.filter(c => !c.removed_at)
  if (!live.length) return (invoice.lines || []).map(l => ({ ...l, id: `cr-${l.id}`, source_id: l.id }))
  const left = new Map()
  for (const r of invoiceTotals(invoice.lines).byRate) left.set(r.rate, { base: r.base, exemptions: r.exemptions })
  for (const c of live) for (const r of invoiceTotals(c.lines).byRate) {
    const cur = left.get(r.rate)
    if (cur) cur.base = round2(cur.base - r.base)
  }
  return [...left.entries()].filter(([, v]) => v.base > 0).map(([rate, v]) => ({
    id: `cr-${rate}`, kind: 'other', description: label(rate).slice(0, 300), qty: 1, unit_price: v.base, discount_pct: 0, vat_rate: rate,
    ...(rate === 0 && v.exemptions[0] ? { vat_exemption: v.exemptions[0] } : {}),
  }))
}

// What is left on an invoice after its (issued) credit notes
export function creditedTotal(invoice, credits = []) {
  return round2(credits.filter(c => !c.removed_at && c.credited_invoice_id === invoice.id && ['issued', 'paid'].includes(c.status))
    .reduce((s, c) => s + num(c.total), 0))
}

// The state shown on an invoice: its status, or overdue (issued, unpaid, past its due date), or
// credited (issued credit notes cover all of it)
export function invoiceState(invoice, { today = localISODate(), credits = [] } = {}) {
  if (invoice.removed_at) return 'removed'
  if (invoice.kind === 'invoice' && ['issued', 'paid'].includes(invoice.status) && credits.length && creditedTotal(invoice, credits) >= num(invoice.total) && num(invoice.total) > 0) return 'credited'
  if (invoice.kind === 'invoice' && invoice.status === 'issued' && invoice.due_date && invoice.due_date < today) return 'overdue'
  return invoice.status
}

export const dueDateFor = (issueDate, days = 30) => (issueDate ? addDays(issueDate, Math.max(0, Math.round(num(days, 30)))) : null)

// Days past due (0 when not overdue)
export function daysOverdue(invoice, today = localISODate()) {
  if (!invoice.due_date || invoice.due_date >= today) return 0
  return Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${invoice.due_date}T00:00:00Z`)) / 86400000)
}

// A quote's client as an invoice's client fields (from Contacts when linked, else the quote's copy)
export function invoiceClient(quote, client = null) {
  if (client) {
    return { client_id: client.id, client_name: client.name || '', client_tax_id: client.tax_id || null, client_address: client.address || null, client_email: client.email || null }
  }
  return {
    client_id: quote.client_id || null,
    client_name: (quote.client_company || '').trim() || (quote.client_name || '').trim(),
    client_tax_id: quote.client_tax_id || null, client_address: quote.client_address || null, client_email: quote.client_email || null,
  }
}

// What is still missing before an invoice can go to the certified program
export function invoiceProblems(invoice) {
  const problems = []
  if (!(invoice.client_name || '').trim()) problems.push('client')
  if (!(invoice.lines || []).length) problems.push('lines')
  if ((invoice.lines || []).some(l => clampPct(l.vat_rate) === 0 && !l.vat_exemption)) problems.push('exemption')
  if (invoiceTotals(invoice.lines).total < 0) problems.push('negative')
  return problems
}

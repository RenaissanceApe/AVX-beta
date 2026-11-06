// Payments against invoices and repairs charged to the client (step 12, docs/BUSINESS.md "How
// payments work"). Pure, so the invoice window, the list and the tests agree with the database:
// an invoice asks for its total less its issued credit notes (private.invoice_due), and turns paid
// when its payments cover that (private.sync_invoice_paid).
import { round2 } from './quotes'
import { creditedTotal } from './invoices'

export const PAYMENT_METHODS = ['transfer', 'mbway', 'multibanco', 'card', 'cash', 'cheque', 'other']

const num = v => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

// What an invoice asks for: its total less its issued credit notes
export const invoiceDue = (invoice, credits = []) => round2(num(invoice.total) - creditedTotal(invoice, credits))

// Received so far: the payments not removed
export const paidSoFar = (payments = []) => round2(payments.filter(p => !p.removed_at).reduce((s, p) => s + num(p.amount), 0))

// Left to pay (never below zero)
export const leftToPay = (invoice, { credits = [], payments = [] } = {}) => Math.max(0, round2(invoiceDue(invoice, credits) - paidSoFar(payments)))

// Partly paid: issued, something received, something left
export const isPartlyPaid = (invoice, { credits = [], payments = [] } = {}) =>
  invoice.kind === 'invoice' && invoice.status === 'issued' && paidSoFar(payments) > 0 && leftToPay(invoice, { credits, payments }) > 0

// Why a payment can't be recorded, or null: amount above zero and not above what is left, a date
// not in the future
export function paymentProblem({ amount, paid_on: paidOn }, left, today) {
  const a = num(amount)
  if (!(a > 0)) return 'amount'
  if (round2(a) > round2(left)) return 'tooMuch'
  if (!paidOn) return 'date'
  if (paidOn > today) return 'future'
  return null
}

// Payments per invoice: { [invoice_id]: [payment, …] }
export function paymentsByInvoice(payments = []) {
  const out = {}
  for (const p of payments) if (!p.removed_at) (out[p.invoice_id] = out[p.invoice_id] || []).push(p)
  return out
}

// A repair charged to the client as an invoice line (kind "repair", pointing to the repair so the
// database bills it once). The price starts at the repair's cost and can be changed in the draft.
export const repairLine = (repair, { vatRate = 23, label = r => r.problem } = {}) => ({
  id: `repair-${repair.id}`, kind: 'repair', repair_id: repair.id,
  description: String(label(repair) || '').trim().slice(0, 300) || 'Repair',
  qty: 1, unit_price: round2(num(repair.cost)), discount_pct: 0, vat_rate: vatRate,
})

// The gig's charged repairs not yet on another live invoice (those on this draft count as free,
// and are left out when already among its lines)
export function repairsToBill(repairs = [], { invoiceId = null, lines = [] } = {}) {
  const onDraft = new Set(lines.map(l => l.repair_id).filter(Boolean))
  return repairs.filter(r => r.charge_client && (!r.invoice_id || r.invoice_id === invoiceId) && !onDraft.has(r.id))
}

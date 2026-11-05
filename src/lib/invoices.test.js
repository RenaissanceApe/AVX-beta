import { describe, it, expect } from 'vitest'
import {
  invoiceLineNet, invoiceTotals, quoteInvoiceLines, quoteInvoiceGap, depositLines, restLines, creditLines,
  invoiceState, dueDateFor, daysOverdue, invoiceClient, invoiceProblems, creditedTotal,
} from './invoices'
import { quoteTotals } from './quotes'

const line = (over = {}) => ({ id: over.id || `l${Math.random()}`, kind: 'rental', description: 'Item', qty: 1, factor: 1, unit_price: 100, discount_pct: 0, ...over })
const quote = (phases, over = {}) => ({ vat_rate: 23, discount_pct: 0, body: { phases }, ...over })
const phase = (lines, over = {}) => ({ id: over.id || 'p1', name: 'Show', discount_pct: 0, sections: [{ id: 's', name: '', lines }], ...over })

describe('invoice totals (twin of the database)', () => {
  it('rounds each line, then VAT per rate on its lines', () => {
    const t = invoiceTotals([
      { qty: 2, unit_price: 100, discount_pct: 10, vat_rate: 23 },
      { qty: 1, unit_price: 50, vat_rate: 6 },
      { qty: 1, unit_price: 20, vat_rate: 0, vat_exemption: 'M40' },
    ])
    // the same numbers as supabase/tests/invoices.sql
    expect(t).toEqual({ net: 250, vat: 44.4, total: 294.4, byRate: [
      { rate: 23, base: 180, vat: 41.4, exemptions: [] }, { rate: 6, base: 50, vat: 3, exemptions: [] }, { rate: 0, base: 20, vat: 0, exemptions: ['M40'] },
    ] })
    expect(invoiceLineNet({ qty: 3, unit_price: 0.335, discount_pct: 0 })).toBe(1.01)
    expect(invoiceTotals([])).toEqual({ net: 0, vat: 0, total: 0, byRate: [] })
  })
})

describe('invoice lines from a quote', () => {
  const q = quote([
    phase([line({ id: 'a', qty: 2, factor: 3, unit_price: 100, discount_pct: 10 }), line({ id: 'b', kind: 'crew', unit_price: 250, vat_rate: 6 }),
      line({ id: 'c', kind: 'comment', description: 'Note' }), line({ id: 'd', kind: 'transport', description: '', unit_price: 40, vat_rate: 0, vat_exemption: 'M40' })], { discount_pct: 20 }),
    phase([line({ id: 'e', unit_price: 500 })], { id: 'opt', optional: true }),
  ], { discount_pct: 5 })

  it('keeps each line with its own VAT, one combined discount and qty × factor', () => {
    const lines = quoteInvoiceLines(q, { fallback: k => `(${k})` })
    expect(lines.map(l => l.source_id)).toEqual(['a', 'b', 'd'])
    expect(lines[0]).toMatchObject({ qty: 6, unit_price: 100, discount_pct: 31.6, vat_rate: 23 })
    expect(lines[1]).toMatchObject({ vat_rate: 6, discount_pct: 24 })
    expect(lines[2]).toMatchObject({ description: '(transport)', vat_rate: 0, vat_exemption: 'M40' })
  })
  it('comes to the quote total (to the cent here)', () => {
    const lines = quoteInvoiceLines(q)
    expect(invoiceTotals(lines).net).toBe(quoteTotals(q).net)
    expect(invoiceTotals(lines).vat).toBe(quoteTotals(q).vat)
    expect(quoteInvoiceGap(q, lines)).toBe(0)
  })
  it('chosen phases, optional ones included', () => {
    expect(quoteInvoiceLines(q, { phaseIds: ['opt'] }).map(l => l.source_id)).toEqual(['e'])
    // the quote discount still applies to a chosen phase
    expect(invoiceTotals(quoteInvoiceLines(q, { phaseIds: ['opt'] })).net).toBe(475)
  })
  it('lines saved before VAT per line use the quote rate', () => {
    expect(quoteInvoiceLines(quote([phase([line()])], { vat_rate: 13 }))[0].vat_rate).toBe(13)
  })
})

describe('deposits and the rest', () => {
  const q = quote([phase([line({ unit_price: 1000, vat_rate: 23 }), line({ kind: 'other', unit_price: 200, vat_rate: 6 })])])

  it('a deposit is pct % of each rate', () => {
    const lines = depositLines(q, 30, { label: r => `Deposit 30% (${r}%)` })
    expect(lines.map(l => [l.vat_rate, l.unit_price, l.qty])).toEqual([[23, 300, 1], [6, 60, 1]])
    expect(invoiceTotals(lines)).toMatchObject({ net: 360, vat: 72.6, total: 432.6 })
    expect(depositLines(q, 0)).toEqual([])
  })
  it('rounds a deposit to the cent per rate', () => {
    const odd = quote([phase([line({ unit_price: 333.33, vat_rate: 23 })])])
    expect(depositLines(odd, 33.3)[0].unit_price).toBe(111)
  })
  it('the rest is the quote less each deposit, at its rate', () => {
    const deposit = { id: 'd1', scope: 'deposit', kind: 'invoice', legal_number: 'FT 2026/3', lines: depositLines(q, 30) }
    const lines = restLines(q, [deposit, { id: 'gone', scope: 'deposit', removed_at: '2026-01-01', lines: depositLines(q, 50) }], { label: d => `Less ${d.legal_number}` })
    const t = invoiceTotals(lines)
    expect(t.net).toBe(840)
    expect(t.byRate.map(r => [r.rate, r.base])).toEqual([[23, 700], [6, 140]])
    expect(lines.filter(l => l.kind === 'deposit').map(l => [l.description, l.unit_price])).toEqual([['Less FT 2026/3', -300], ['Less FT 2026/3', -60]])
    // deposit + rest = the whole quote, VAT included
    expect(invoiceTotals(deposit.lines).total + t.total).toBe(quoteTotals(q).total)
  })
})

describe('credit notes', () => {
  const inv = { id: 'i1', total: 294.4, lines: [{ id: 'a', qty: 2, unit_price: 100, discount_pct: 10, vat_rate: 23 }, { id: 'b', qty: 1, unit_price: 50, vat_rate: 6 }] }
  it('starts as a copy of the invoice, then what is left per rate', () => {
    expect(creditLines(inv).map(l => l.source_id)).toEqual(['a', 'b'])
    const first = { credited_invoice_id: 'i1', status: 'issued', total: 61.5, lines: [{ qty: 1, unit_price: 50, vat_rate: 23 }] }
    expect(creditLines(inv, [first], { label: r => `Rest ${r}` }).map(l => [l.vat_rate, l.unit_price])).toEqual([[23, 130], [6, 50]])
    expect(creditedTotal(inv, [first, { ...first, status: 'draft' }])).toBe(61.5)
  })
})

describe('state, dates and checks', () => {
  it('overdue, credited, removed', () => {
    const base = { id: 'i', kind: 'invoice', status: 'issued', total: 100, due_date: '2026-11-01' }
    expect(invoiceState(base, { today: '2026-11-05' })).toBe('overdue')
    expect(invoiceState(base, { today: '2026-11-01' })).toBe('issued')
    expect(invoiceState({ ...base, status: 'paid' }, { today: '2026-12-01' })).toBe('paid')
    expect(invoiceState(base, { today: '2026-11-05', credits: [{ credited_invoice_id: 'i', status: 'issued', total: 100 }] })).toBe('credited')
    expect(invoiceState({ ...base, removed_at: 'x' })).toBe('removed')
    expect(daysOverdue(base, '2026-11-05')).toBe(4)
    expect(daysOverdue(base, '2026-10-05')).toBe(0)
  })
  it('due date from the payment term', () => {
    expect(dueDateFor('2026-11-05', 30)).toBe('2026-12-05')
    expect(dueDateFor(null, 30)).toBe(null)
  })
  it('client from contacts, else the quote', () => {
    expect(invoiceClient({ client_company: 'Acme', client_tax_id: '5' })).toMatchObject({ client_name: 'Acme', client_tax_id: '5', client_id: null })
    expect(invoiceClient({ client_company: 'Old name' }, { id: 'c', name: 'Acme Lda', tax_id: '501', address: 'Rua' })).toMatchObject({ client_id: 'c', client_name: 'Acme Lda', client_tax_id: '501' })
  })
  it('what is missing before sending', () => {
    expect(invoiceProblems({ client_name: '', lines: [] })).toEqual(['client', 'lines'])
    expect(invoiceProblems({ client_name: 'A', lines: [{ qty: 1, unit_price: 5, vat_rate: 0 }] })).toEqual(['exemption'])
  })
})

import { describe, it, expect } from 'vitest'
import { invoiceDue, paidSoFar, leftToPay, isPartlyPaid, paymentProblem, paymentsByInvoice, repairLine, repairsToBill, PAYMENT_METHODS } from './payments'

const inv = { id: 'i1', kind: 'invoice', status: 'issued', total: 307.5 }
const credit = { id: 'c1', kind: 'credit_note', credited_invoice_id: 'i1', status: 'issued', total: 207.5 }

describe('payments', () => {
  it('works out what is due, paid and left, as the database does', () => {
    expect(invoiceDue(inv)).toBe(307.5)
    expect(invoiceDue(inv, [credit])).toBe(100)
    expect(invoiceDue(inv, [{ ...credit, status: 'draft' }])).toBe(307.5)
    const payments = [{ amount: 100 }, { amount: '50,25' }, { amount: 999, removed_at: '2026-10-01' }]
    expect(paidSoFar(payments)).toBe(150.25)
    expect(leftToPay(inv, { payments })).toBe(157.25)
    expect(leftToPay(inv, { credits: [credit], payments })).toBe(0)
  })

  it('knows a partly paid invoice', () => {
    expect(isPartlyPaid(inv, { payments: [{ amount: 1 }] })).toBe(true)
    expect(isPartlyPaid(inv, { payments: [] })).toBe(false)
    expect(isPartlyPaid({ ...inv, status: 'paid' }, { payments: [{ amount: 307.5 }] })).toBe(false)
  })

  it('refuses a payment of nothing, over what is left, or in the future', () => {
    const today = '2026-11-06'
    expect(paymentProblem({ amount: '0', paid_on: today }, 10, today)).toBe('amount')
    expect(paymentProblem({ amount: '10.01', paid_on: today }, 10, today)).toBe('tooMuch')
    expect(paymentProblem({ amount: '10', paid_on: '' }, 10, today)).toBe('date')
    expect(paymentProblem({ amount: '10', paid_on: '2026-11-07' }, 10, today)).toBe('future')
    expect(paymentProblem({ amount: '10', paid_on: today }, 10, today)).toBe(null)
  })

  it('groups payments per invoice, leaving removed ones out', () => {
    const g = paymentsByInvoice([{ invoice_id: 'a', amount: 1 }, { invoice_id: 'a', amount: 2 }, { invoice_id: 'b', amount: 3, removed_at: 'x' }])
    expect(g.a).toHaveLength(2)
    expect(g.b).toBeUndefined()
    expect(PAYMENT_METHODS).toContain('mbway')
  })

  it('turns a charged repair into an invoice line, once', () => {
    const r = { id: 'r1', problem: ' Lens cracked ', cost: '150', charge_client: true }
    expect(repairLine(r, { vatRate: 6, label: x => `Repair: ${x.problem.trim()}` })).toEqual({
      id: 'repair-r1', kind: 'repair', repair_id: 'r1', description: 'Repair: Lens cracked', qty: 1, unit_price: 150, discount_pct: 0, vat_rate: 6,
    })
    const repairs = [r, { id: 'r2', charge_client: false }, { id: 'r3', charge_client: true, invoice_id: 'other' }, { id: 'r4', charge_client: true, invoice_id: 'me' }]
    expect(repairsToBill(repairs, { invoiceId: 'me' }).map(x => x.id)).toEqual(['r1', 'r4'])
    expect(repairsToBill(repairs, { invoiceId: 'me', lines: [{ repair_id: 'r4' }] }).map(x => x.id)).toEqual(['r1'])
  })
})

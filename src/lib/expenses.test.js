import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import {
  vatOf, netFromTotal, costOf, monthlyShare, recurrenceDate, upcomingDates, monthBounds, toReimburse, isUnpaid, isOverdue,
  linkOf, linkColumns, totalsByCurrency, byCategory, categoryName, expenseFromForm, csvRows, receiptProblem, receiptPath,
} from './expenses'

const t = (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k)

describe('VAT maths', () => {
  it('works out VAT to the cent', () => {
    expect(vatOf(100, 23)).toBe(23)
    expect(vatOf('12,35', 23)).toBe(2.84)
    expect(vatOf(10.05, 6)).toBe(0.6)
    expect(vatOf(-50, 23)).toBe(-11.5)
    expect(vatOf('', 23)).toBe(0)
  })
  it('goes back from a total with VAT', () => {
    expect(netFromTotal(123, 23)).toBe(100)
    expect(netFromTotal('24,60', 23)).toBe(20)
    expect(netFromTotal(106, 6)).toBe(100)
  })
  it('counts VAT as cost only when it is not recovered', () => {
    const e = { amount_net: 100, vat_amount: 23 }
    expect(costOf(e, { vat_recoverable: true }, true)).toBe(100)
    expect(costOf(e, { vat_recoverable: false }, true)).toBe(123)
    expect(costOf(e, { vat_recoverable: true }, false)).toBe(123)
    expect(costOf(e, null, true)).toBe(100)
  })
  it('spreads a capital cost over its months', () => {
    expect(monthlyShare(6000, 60)).toBe(100)
    expect(monthlyShare(1000, 3)).toBe(333.33)
    expect(monthlyShare(500, 0)).toBe(500)
  })
})

describe('recurrence', () => {
  it('adds months, quarters and years', () => {
    expect(recurrenceDate('2026-01-15', 'month', 0)).toBe('2026-01-15')
    expect(recurrenceDate('2026-01-15', 'month', 1)).toBe('2026-02-15')
    expect(recurrenceDate('2026-11-15', 'month', 2)).toBe('2027-01-15')
    expect(recurrenceDate('2026-01-15', 'quarter', 3)).toBe('2026-10-15')
    expect(recurrenceDate('2026-03-01', 'year', 2)).toBe('2028-03-01')
  })
  it('keeps the 31st, using the last day of shorter months', () => {
    expect(recurrenceDate('2026-01-31', 'month', 1)).toBe('2026-02-28')
    expect(recurrenceDate('2026-01-31', 'month', 2)).toBe('2026-03-31')
    expect(recurrenceDate('2028-01-31', 'month', 1)).toBe('2028-02-29')
    expect(recurrenceDate('2026-08-31', 'quarter', 1)).toBe('2026-11-30')
    expect(recurrenceDate('2028-02-29', 'year', 1)).toBe('2029-02-28')
  })
  it('lists the next dates and stops at the end date', () => {
    expect(upcomingDates({ starts_on: '2026-01-10', every: 'month', drafted: 2 }, 3)).toEqual(['2026-03-10', '2026-04-10', '2026-05-10'])
    expect(upcomingDates({ starts_on: '2026-01-10', every: 'quarter', drafted: 0, ends_on: '2026-06-30' }, 5)).toEqual(['2026-01-10', '2026-04-10'])
  })
  it('gives a month\'s first and last day', () => {
    expect(monthBounds('2026-02')).toEqual(['2026-02-01', '2026-02-28'])
    expect(monthBounds('2028-02')).toEqual(['2028-02-01', '2028-02-29'])
  })
})

describe('states and links', () => {
  it('knows what is unpaid, overdue and to reimburse', () => {
    const claim = { claimed_by: 'u', status: 'confirmed', paid_on: null }
    expect(toReimburse(claim)).toBe(true)
    expect(toReimburse({ ...claim, paid_on: '2026-11-01' })).toBe(false)
    expect(toReimburse({ ...claim, status: 'claimed' })).toBe(false)
    expect(isUnpaid({ status: 'confirmed' })).toBe(true)
    expect(isUnpaid({ status: 'draft' })).toBe(false)
    expect(isOverdue({ status: 'confirmed', due_on: '2026-11-01' }, '2026-11-05')).toBe(true)
    expect(isOverdue({ status: 'confirmed', due_on: '2026-11-05' }, '2026-11-05')).toBe(false)
  })
  it('reads and writes one link', () => {
    expect(linkOf({ repair_id: 'r' })).toEqual({ kind: 'repair', id: 'r' })
    expect(linkOf({})).toBe(null)
    expect(linkColumns('crew_fee', 'u')).toEqual({ subrental_id: null, repair_id: null, crew_fee_user_id: 'u', stock_movement_id: null, stock_unit_id: null })
    expect(linkColumns('', '').subrental_id).toBe(null)
  })
})

describe('totals', () => {
  const list = [
    { amount_net: 100, vat_amount: 23, currency: 'EUR', category_id: 'a' },
    { amount_net: 50.1, vat_amount: 11.52, currency: 'EUR', category_id: 'b' },
    { amount_net: 200, vat_amount: 0, currency: 'GBP', category_id: 'a' },
  ]
  it('adds up per currency, never across', () => {
    expect(totalsByCurrency(list)).toEqual({
      EUR: { net: 150.1, vat: 34.52, total: 184.62, count: 2 },
      GBP: { net: 200, vat: 0, total: 200, count: 1 },
    })
  })
  it('groups by category and currency, biggest first', () => {
    const cats = [{ id: 'a', kind: 'direct', name: 'Hire' }, { id: 'b', kind: 'overhead', starter_key: 'rent_utilities' }]
    const rows = byCategory(list, cats)
    expect(rows.map(r => [r.id, r.currency, r.net])).toEqual([['a', 'GBP', 200], ['a', 'EUR', 100], ['b', 'EUR', 50.1]])
    expect(categoryName(cats[1], t)).toBe('expenses.cat.rent_utilities')
    expect(categoryName(cats[0], t)).toBe('Hire')
    expect(categoryName(null, t)).toBe('expenses.noCategory')
  })
})

describe('form and CSV', () => {
  const base = { description: ' Fuel ', spent_on: '2026-11-04', amount_net: '40', vat_rate: '23', vat_amount: '' }
  it('works out the VAT unless typed', () => {
    expect(expenseFromForm(base).row).toMatchObject({ description: 'Fuel', amount_net: 40, vat_amount: 9.2, currency: 'EUR' })
    expect(expenseFromForm({ ...base, vat_amount: '9,19' }).row.vat_amount).toBe(9.19)
  })
  it('says what is missing', () => {
    expect(expenseFromForm({ ...base, description: '' }).error).toBe('expenses.needDescription')
    expect(expenseFromForm({ ...base, amount_net: 'x' }).error).toBe('expenses.needAmount')
    expect(expenseFromForm({ ...base, vat_rate: '120' }).error).toBe('expenses.badVat')
    expect(expenseFromForm({ ...base, paid_on: '2026-11-04' }).error).toBe('expenses.needPaidHow')
    expect(expenseFromForm({ ...base, paid_on: '2026-11-04', claim: true }).error).toBeUndefined()
  })
  it('keeps either a supplier from Contacts or a typed one', () => {
    expect(expenseFromForm({ ...base, supplier_id: 's', supplier_name: 'X' }).row).toMatchObject({ supplier_id: 's', supplier_name: null })
    expect(expenseFromForm({ ...base, supplier_name: ' Galp ' }).row).toMatchObject({ supplier_id: null, supplier_name: 'Galp' })
  })
  it('lays out the accountant\'s rows', () => {
    const [row] = csvRows([{ spent_on: '2026-11-04', supplier: { name: 'Galp', tax_id: '500' }, description: 'Fuel', amount_net: 40, vat_rate: 23,
      vat_amount: 9.2, currency: 'EUR', category_id: 'c', paid_how: 'card', paid_on: '2026-11-04', claimed_by: 'u' }],
    { categories: [{ id: 'c', kind: 'direct', starter_key: 'transport_fuel' }], t, names: { u: 'Carla' } })
    expect(row).toMatchObject({ supplier: 'Galp', supplier_tax_id: '500', total: 49.2, category: 'expenses.cat.transport_fuel',
      kind: 'expenses.kind.direct', paid_how: 'expenses.paidHow.card', claimed_by: 'Carla' })
  })
  it('checks receipts and files them under the expense', () => {
    expect(receiptProblem({ type: 'image/jpeg', name: 'a.jpg', size: 1000 })).toBe(null)
    expect(receiptProblem({ type: '', name: 'scan.PDF', size: 1000 })).toBe(null)
    expect(receiptProblem({ type: 'text/plain', name: 'a.txt', size: 10 })).toBe('expenses.receiptType')
    expect(receiptProblem({ type: 'application/pdf', name: 'a.pdf', size: 11 * 1024 * 1024 })).toBe('expenses.receiptTooBig')
    expect(receiptPath('o', 'e', { name: 'Talão.JPG' })).toMatch(/^o\/e\/[^/]+\.jpg$/)
  })
})

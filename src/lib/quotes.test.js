import { describe, it, expect } from 'vitest'
import {
  lineTotal, phaseTotals, quoteTotals, normalizeBody, cloneBody, quoteDateRange, quoteNumber, move, formatMoney,
} from './quotes'

const line = (over = {}) => ({ id: 'l', kind: 'rental', description: 'x', qty: 1, factor: 1, unit_price: 0, discount_pct: 0, ...over })
const quote = (phases, over = {}) => ({ vat_rate: 23, discount_pct: 0, body: { phases }, ...over })
const phase = (lines, over = {}) => ({ id: 'p', name: 'P', discount_pct: 0, optional: false, sections: [{ id: 's', name: 'S', lines }], ...over })

describe('lineTotal', () => {
  it('multiplies quantity, factor and price, then applies the discount', () => {
    expect(lineTotal(line({ qty: 2, factor: 3, unit_price: 50 }))).toBe(300)
    expect(lineTotal(line({ qty: 2, factor: 3, unit_price: 50, discount_pct: 10 }))).toBe(270)
  })
  it('rounds to cents and accepts comma decimals', () => {
    expect(lineTotal(line({ qty: 3, unit_price: '10,333' }))).toBe(31)
    expect(lineTotal(line({ qty: 1, unit_price: 0.1 + 0.2 }))).toBe(0.3)
  })
  it('comments and empty values cost nothing', () => {
    expect(lineTotal(line({ kind: 'comment', qty: 5, unit_price: 100 }))).toBe(0)
    expect(lineTotal(line({ qty: '', unit_price: '' }))).toBe(0)
  })
  it('clamps silly discounts', () => {
    expect(lineTotal(line({ unit_price: 100, discount_pct: 150 }))).toBe(0)
    expect(lineTotal(line({ unit_price: 100, discount_pct: -20 }))).toBe(100)
  })
})

describe('phaseTotals', () => {
  it('applies the phase discount to the sum of its lines', () => {
    const p = phase([line({ unit_price: 100 }), line({ unit_price: 50 })], { discount_pct: 20 })
    expect(phaseTotals(normalizeBody({ phases: [p] }).phases[0])).toEqual({ gross: 150, discount: 30, net: 120 })
  })
})

describe('quoteTotals', () => {
  it('adds phases, applies the quote discount, then VAT', () => {
    const q = quote([
      phase([line({ unit_price: 1000 })]),
      phase([line({ kind: 'crew', qty: 2, factor: 2, unit_price: 250 })], { id: 'p2' }),
    ], { discount_pct: 10 })
    const totals = quoteTotals(q)
    expect(totals.subtotal).toBe(2000)
    expect(totals.discount).toBe(200)
    expect(totals.net).toBe(1800)
    expect(totals.vat).toBe(414)
    expect(totals.total).toBe(2214)
    expect(totals.byKind).toMatchObject({ rental: 1000, crew: 1000, transport: 0 })
  })
  it('prices optional phases separately, outside the total', () => {
    const q = quote([phase([line({ unit_price: 100 })]), phase([line({ unit_price: 40 })], { id: 'opt', optional: true })])
    const totals = quoteTotals(q)
    expect(totals.net).toBe(100)
    expect(totals.optional).toBe(40)
    expect(totals.byKind.rental).toBe(100)
  })
  it('copes with an empty or broken body', () => {
    expect(quoteTotals({ vat_rate: 23, body: null }).total).toBe(0)
    expect(quoteTotals({ body: { phases: [{ sections: [{ lines: [{ qty: 'x' }] }] }] } }).total).toBe(0)
  })
})

describe('templates and helpers', () => {
  it('normalizes unknown kinds and units', () => {
    const b = normalizeBody({ phases: [{ sections: [{ lines: [{ kind: 'weird', unit: 'parsec' }] }] }] })
    expect(b.phases[0].sections[0].lines[0]).toMatchObject({ kind: 'other', unit: 'unit', qty: 1, factor: 1 })
  })
  it('cloneBody gives fresh ids and drops dates unless asked', () => {
    const src = { phases: [{ id: 'a', name: 'Show', start_date: '2026-11-01', end_date: '2026-11-02', sections: [{ id: 'b', lines: [line({ id: 'c', unit_price: 9 })] }] }] }
    const copy = cloneBody(src)
    expect(copy.phases[0].id).not.toBe('a')
    expect(copy.phases[0].sections[0].lines[0].id).not.toBe('c')
    expect(copy.phases[0].start_date).toBeNull()
    expect(copy.phases[0].sections[0].lines[0].unit_price).toBe(9)
    expect(cloneBody(src, { keepDates: true }).phases[0].end_date).toBe('2026-11-02')
  })
  it('quoteDateRange spans all phases', () => {
    expect(quoteDateRange({ phases: [
      { start_date: '2026-11-03', end_date: '2026-11-04' }, { start_date: '2026-11-01' }, { start_date: null },
    ] })).toEqual({ start: '2026-11-01', end: '2026-11-04' })
  })
  it('formats numbers and moves items', () => {
    expect(quoteNumber({ number: 7 })).toBe('Q0007')
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(move(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(formatMoney(1234.5, 'EUR', 'en')).toBe('€1,234.50')
  })
})

describe('dates', () => {
  it('adds days in local time', async () => {
    const { addDays, localISODate } = await import('./quotes')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(localISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

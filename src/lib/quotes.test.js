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

describe('print helpers', () => {
  it('numbers with or without a prefix', async () => {
    const { quoteNumber } = await import('./quotes')
    expect(quoteNumber({ number: 143 }, '')).toBe('143')
    expect(quoteNumber({ number: 7 }, 'LP-')).toBe('LP-0007')
  })
  it('groups totals into equipment, crew, transport and other', async () => {
    const { groupTotals } = await import('./quotes')
    expect(groupTotals({ rental: 100, sale: 20.5, crew: 50, transport: 0, other: 3 }))
      .toEqual([{ key: 'equipment', amount: 120.5 }, { key: 'crew', amount: 50 }, { key: 'transport', amount: 0 }, { key: 'other', amount: 3 }])
  })
  it('splits numbered terms into headings and paragraphs', async () => {
    const { termsBlocks } = await import('./quotes')
    expect(termsBlocks('1. Definições\nTexto um.\n\nMais texto.\n2. Validade\nVálida 15 dias.')).toEqual([
      { type: 'h', text: '1. Definições' }, { type: 'p', text: 'Texto um.' }, { type: 'p', text: 'Mais texto.' },
      { type: 'h', text: '2. Validade' }, { type: 'p', text: 'Válida 15 dias.' },
    ])
    expect(termsBlocks('Plain terms only.')).toEqual([{ type: 'p', text: 'Plain terms only.' }])
  })
  it('keeps valid phase times and drops junk', () => {
    const b = normalizeBody({ phases: [{ start_time: '09:00', end_time: '25:00' }] })
    expect(b.phases[0]).toMatchObject({ start_time: '09:00', end_time: null })
  })
})

describe('price list import', () => {
  it('reads prices in Portuguese and English formats', async () => {
    const { parsePrice } = await import('./quotes')
    expect(parsePrice('1 234,50 €')).toBe(1234.5)
    expect(parsePrice('1,234.50')).toBe(1234.5)
    expect(parsePrice('60€')).toBe(60)
    expect(parsePrice('0,45')).toBe(0.45)
    expect(Number.isNaN(parsePrice(''))).toBe(true)
  })
  it('parses lines with optional category, type and unit, and reports bad lines', async () => {
    const { parsePriceImport } = await import('./quotes')
    const { items, errors } = parsePriceImport('Coluna Top NEXT LA210x; 60€; Som\nTécnico de Som\t200\tEquipa\tequipa\tdia\n# comment\n\nsem preço;\nCarrinha; 0,45; ; transporte; km')
    expect(items).toEqual([
      { name: 'Coluna Top NEXT LA210x', unit_price: 60, category: 'Som', kind: 'rental', unit: 'unit' },
      { name: 'Técnico de Som', unit_price: 200, category: 'Equipa', kind: 'crew', unit: 'day' },
      { name: 'Carrinha', unit_price: 0.45, category: null, kind: 'transport', unit: 'km' },
    ])
    expect(errors).toEqual([5])
  })
  it('turns a price item into a quote line', async () => {
    const { lineFromPriceItem } = await import('./quotes')
    expect(lineFromPriceItem({ name: 'Sub', kind: 'rental', unit: 'unit', unit_price: '80.00', details: null }))
      .toMatchObject({ kind: 'rental', description: 'Sub', unit_price: 80, qty: 1, factor: 1, details: '' })
  })
})

describe('versions and gig plan', () => {
  it('snapshots only client-facing fields and restores them', async () => {
    const { quoteSnapshot, snapshotFields } = await import('./quotes')
    const snap = quoteSnapshot({ title: 'Gala', status: 'sent', gig_id: 'g', number: 7, vat_rate: 23, body: { phases: [phase([line()])] } })
    expect(snap).toMatchObject({ title: 'Gala', number: 7, vat_rate: 23 })
    expect(snap).not.toHaveProperty('status')
    expect(snap).not.toHaveProperty('gig_id')
    expect(snap.body.phases).toHaveLength(1)
    const back = snapshotFields(snap)
    expect(back).toMatchObject({ title: 'Gala', vat_rate: 23 })
    expect(back).not.toHaveProperty('number')
    expect(back).not.toHaveProperty('body')
  })

  it('turns dated phases into one schedule item per day', async () => {
    const { quoteToGigPlan } = await import('./quotes')
    const { schedule } = quoteToGigPlan({ phases: [
      phase([], { id: 'a', name: 'Load-in', start_date: '2026-11-03', start_time: '08:00', end_time: '20:00' }),
      phase([], { id: 'b', name: 'Show', start_date: '2026-11-04', end_date: '2026-11-06', start_time: '14:00', end_time: '23:30' }),
      phase([], { id: 'c', name: 'Undated' }),
      phase([], { id: 'd', name: 'Option', optional: true, start_date: '2026-11-07' }),
    ] })
    expect(schedule.map(s => [s.day, s.start_time, s.end_time, s.phase, s.dayIndex, s.dayCount])).toEqual([
      ['2026-11-03', '08:00', '20:00', 'Load-in', 1, 1],
      ['2026-11-04', '14:00', null, 'Show', 1, 3],
      ['2026-11-05', '09:00', null, 'Show', 2, 3],
      ['2026-11-06', '09:00', '23:30', 'Show', 3, 3],
    ])
  })

  it('crosses midnight without an end time and caps long phases', async () => {
    const { quoteToGigPlan } = await import('./quotes')
    const { schedule } = quoteToGigPlan({ phases: [
      phase([], { start_date: '2026-11-03', start_time: '22:00', end_time: '02:00' }),
      phase([], { id: 'long', start_date: '2026-01-01', end_date: '2026-12-31' }),
    ] })
    expect(schedule[0]).toMatchObject({ start_time: '22:00', end_time: null })
    expect(schedule.filter(s => s.dayCount === 31)).toHaveLength(31)
  })

  it('merges crew lines into positions', async () => {
    const { quoteToGigPlan } = await import('./quotes')
    const { positions } = quoteToGigPlan({ phases: [
      phase([line({ kind: 'crew', description: 'Sound technician', qty: 2, unit: 'unit' }), line({ kind: 'rental', description: 'Speaker' })], { name: 'Day 1' }),
      phase([line({ kind: 'crew', description: 'sound technician ', qty: 3, unit: 'unit' }), line({ kind: 'crew', description: 'Rigger', qty: 10, unit: 'hour' }), line({ kind: 'crew', description: '' })], { id: 'p2', name: 'Day 2' }),
      phase([line({ kind: 'crew', description: 'Spare', qty: 1 })], { id: 'p3', optional: true }),
    ] })
    expect(positions).toEqual([
      { title: 'Sound technician', quantity: 3, phases: ['Day 1', 'Day 2'] },
      { title: 'Rigger', quantity: 1, phases: ['Day 2'] },
    ])
  })
})

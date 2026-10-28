import { describe, it, expect } from 'vitest'
import { resolveRate, bookedDays, suggestFee, feeTotal, labourLines, labourSummary, quoteCrewRevenue, parseAmount, amountInput } from './crewRates'

const rates = [
  { id: 'fn', function_title: 'FOH engineer', user_id: null, day_rate: 300, half_day_rate: 180 },
  { id: 'person', function_title: null, user_id: 'k', day_rate: 280 },
  { id: 'both', function_title: 'foh engineer', user_id: 'k', day_rate: 350 },
  { id: 'gone', function_title: 'Rigger', user_id: null, day_rate: 1, removed_at: '2026-01-01' },
  { id: 'half', function_title: 'Runner', user_id: null, half_day_rate: 60 },
]

describe('crew rates', () => {
  it('picks the most specific rate', () => {
    expect(resolveRate(rates, { userId: 'k', functionTitle: ' FOH Engineer ' }).id).toBe('both')
    expect(resolveRate(rates, { userId: 'k', functionTitle: 'Rigger' }).id).toBe('person')
    expect(resolveRate(rates, { userId: 'z', functionTitle: 'FOH engineer' }).id).toBe('fn')
    expect(resolveRate(rates, { userId: 'z', functionTitle: 'Rigger' })).toBe(null)
    expect(resolveRate(rates, { userId: 'z', functionTitle: '' })).toBe(null)
  })

  it('counts booked days from the booking, else the gig', () => {
    expect(bookedDays({}, { start_date: '2026-12-04', end_date: '2026-12-06' })).toEqual(['2026-12-04', '2026-12-05', '2026-12-06'])
    expect(bookedDays({ booked_from: '2026-12-05T08:00:00Z', booked_until: '2026-12-05T23:00:00Z' }, { start_date: '2026-12-04' })).toEqual(['2026-12-05'])
    expect(bookedDays({}, { start_date: '2026-12-04' })).toEqual(['2026-12-04'])
    expect(bookedDays({}, {})).toEqual([])
  })

  it('suggests a fee with the weekend factor', () => {
    // 4 Dec 2026 is a Friday: Fri at 300, Sat and Sun at 300 × 1.5
    const s = suggestFee(rates[0], ['2026-12-04', '2026-12-05', '2026-12-06'], { weekend: 1.5 })
    expect(s).toEqual({ unit: 'day', rate: 300, quantity: 3, weekendDays: 2, total: 1200 })
    expect(suggestFee(rates[4], ['2026-12-04'], {}).unit).toBe('half_day')
    expect(suggestFee(null, ['2026-12-04'])).toBe(null)
    expect(suggestFee(rates[0], [])).toBe(null)
  })

  it('totals agreed fees; a fixed fee counts once', () => {
    expect(feeTotal({ unit: 'day', rate: 350, quantity: 3 })).toBe(1050)
    expect(feeTotal({ unit: 'fixed', rate: 500, quantity: 4 })).toBe(500)
    expect(feeTotal({ unit: 'day', rate: null, quantity: 3 })).toBe(null)
  })

  it('works out the gig labour cost and margin', () => {
    const gig = { start_date: '2026-12-07', end_date: '2026-12-08' } // Mon–Tue
    const members = [
      { user_id: 'k', function_title: 'FOH engineer' },
      { user_id: 'r', function_title: 'Runner' },
      { user_id: 'x', function_title: 'Clown' },
    ]
    const fees = [{ user_id: 'r', unit: 'fixed', rate: 100, quantity: 1 }]
    const lines = labourLines({ members, gig, rates, factors: { weekend: 1 }, fees })
    expect(lines.map(l => [l.source, l.total])).toEqual([['card', 700], ['agreed', 100], [null, null]])
    expect(labourSummary(lines, 1000)).toEqual({ cost: 800, missing: 1, revenue: 1000, margin: 200, marginPct: 20 })
    expect(labourSummary(lines, null).margin).toBe(null)
  })

  it('takes crew revenue from the accepted quote, after its discount', () => {
    const body = { phases: [{ id: 'p', name: '', sections: [{ id: 's', name: '', lines: [
      { id: 'a', kind: 'crew', description: 'FOH', qty: 1, factor: 2, unit: 'day', unit_price: 300 },
      { id: 'b', kind: 'rental', description: 'Desk', qty: 1, factor: 1, unit: 'day', unit_price: 500 },
    ] }] }] }
    const quotes = [
      { id: 'old', status: 'sent', body, discount_pct: 0, updated_at: '2026-01-02' },
      { id: 'yes', status: 'accepted', body, discount_pct: 10, updated_at: '2026-01-01' },
    ]
    expect(quoteCrewRevenue(quotes)).toMatchObject({ quote: { id: 'yes' }, revenue: 540 })
    expect(quoteCrewRevenue([{ ...quotes[0], status: 'declined' }])).toBe(null)
  })

  it('reads amounts typed with commas and spaces', () => {
    expect(parseAmount('1 200,5')).toBe(1200.5)
    expect(parseAmount('')).toBe(null)
    expect(parseAmount('abc')).toBeNaN()
    expect(amountInput(12.5)).toBe('12,5')
  })
})

import { describe, it, expect } from 'vitest'
import { resolveRate, bookedDays, suggestFee, feeTotal, labourLines, labourSummary, quoteCrewRevenue, parseAmount, amountInput,
  functionRate, callFee, jobPay, quoteLineCost, quoteCrewMargin } from './crewRates'

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

  it('finds a function rate under any of its names, never a person rate', () => {
    expect(functionRate(rates, ['Técnico FOH', 'foh engineer']).id).toBe('fn')
    expect(functionRate(rates, 'Runner').id).toBe('half')
    expect(functionRate(rates, ['', null])).toBe(null)
    expect(functionRate([{ id: 'p', function_title: 'Rigger', user_id: 'k', day_rate: 9 }], 'Rigger')).toBe(null)
  })

  it('turns a suggestion into a crew call fee', () => {
    expect(callFee({ unit: 'day', rate: 200, quantity: 3, weekendDays: 0, total: 600 })).toEqual({ unit: 'day', rate: 200, quantity: 3 })
    // Weekend days at a higher rate: offered as one fixed amount
    expect(callFee({ unit: 'day', rate: 300, quantity: 3, weekendDays: 2, total: 1200 })).toEqual({ unit: 'fixed', rate: 1200, quantity: 1 })
    // Weekend factor 1: still per day
    expect(callFee({ unit: 'day', rate: 300, quantity: 3, weekendDays: 2, total: 900 })).toEqual({ unit: 'day', rate: 300, quantity: 3 })
    expect(callFee(null)).toBe(null)
  })

  it('prefills a job post from the day rate, else the hour rate', () => {
    expect(jobPay({ day_rate: 250.5 })).toEqual({ pay_mode: 'fixed', pay_amount: '250,5', pay_per: 'day' })
    expect(jobPay({ hour_rate: 30 })).toEqual({ pay_mode: 'fixed', pay_amount: '30', pay_per: 'hour' })
    expect(jobPay({ half_day_rate: 60 })).toBe(null)
    expect(jobPay(null)).toBe(null)
  })

  it('costs quote crew lines by the rate card and totals the margin', () => {
    const card = [...rates, { id: 'hr', function_title: 'Rigger', user_id: null, hour_rate: 40 }]
    const foh = { id: 'a', kind: 'crew', description: 'FOH engineer', qty: 2, factor: 3, unit: 'day', unit_price: 400, discount_pct: 0 }
    expect(quoteLineCost(foh, card)).toEqual({ rate: 300, cost: 1800, price: 2400, margin: 600, marginPct: 25 })
    expect(quoteLineCost({ ...foh, description: 'Rigger', unit: 'hour', qty: 1, factor: 10, unit_price: 35 }, card)).toMatchObject({ cost: 400, margin: -50 })
    expect(quoteLineCost({ ...foh, unit: 'lump' }, card)).toBe(null)
    expect(quoteLineCost({ ...foh, kind: 'rental' }, card)).toBe(null)
    const body = { phases: [
      { id: 'p', sections: [{ id: 's', lines: [foh, { ...foh, id: 'b', description: 'Clown' }, { ...foh, id: 'c', kind: 'rental' }] }] },
      { id: 'o', optional: true, sections: [{ id: 's2', lines: [foh] }] },
    ] }
    expect(quoteCrewMargin(body, card)).toEqual({ lines: 2, missing: 1, price: 2400, cost: 1800, margin: 600, marginPct: 25 })
    expect(quoteCrewMargin({ phases: [] }, card)).toMatchObject({ lines: 0, marginPct: null })
  })
})

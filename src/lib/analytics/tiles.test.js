import { describe, it, expect } from 'vitest'
import { OVERVIEW_TILES, moneyLines } from './tiles'

const overview = {
  today: '2026-11-05', gigs_this_month: { total: 4, confirmed: 3 }, revenue_next_30: { EUR: 155, USD: 1250 },
  waiting: { count: 2, totals: { EUR: 700 } }, equipment_use_90: 0.42,
  margin_this_month: { EUR: 1749 }, margin_pct_this_month: 32.2, negative_margin: 1,
}

describe('overview tiles', () => {
  it('reads the four first tiles from report_overview', () => {
    const by = Object.fromEntries(OVERVIEW_TILES.map(t => [t.key, t]))
    expect(Object.keys(by)).toEqual(['gigsThisMonth', 'revenueNext30', 'waitingQuotes', 'equipmentUse90', 'marginThisMonth', 'negativeMargin'])
    expect(by.gigsThisMonth.value(overview)).toBe(4)
    expect(by.gigsThisMonth.sub(overview).vars.count).toBe(3)
    expect(by.revenueNext30.value(overview)).toEqual({ EUR: 155, USD: 1250 })
    expect(by.waitingQuotes.sub(overview).vars.count).toBe(2)
    expect(by.equipmentUse90.value(overview)).toBe(0.42)
    expect(by.equipmentUse90.value({})).toBe(null)
    expect(by.revenueNext30.to('/org/x')).toBe('/org/x/reports?tab=revenue')
  })
  it('reads the gig margin tiles (step 10)', () => {
    const by = Object.fromEntries(OVERVIEW_TILES.map(t => [t.key, t]))
    expect(by.marginThisMonth.value(overview)).toEqual({ EUR: 1749 })
    expect(by.marginThisMonth.sub(overview)).toEqual({ key: 'reports.tileSub.marginPct', vars: { pct: 32.2 } })
    expect(by.marginThisMonth.sub({ ...overview, margin_pct_this_month: null })).toBe(null)
    expect(by.negativeMargin.value(overview)).toBe(1)
    expect(by.negativeMargin.value({})).toBe(0)
    expect(by.negativeMargin.to('/org/x')).toBe('/org/x/reports?tab=margins')
  })
  it('lists money per currency, never added', () => {
    expect(moneyLines({ EUR: 155, USD: 1250 })).toEqual([{ currency: 'USD', amount: 1250 }, { currency: 'EUR', amount: 155 }])
    expect(moneyLines({})).toEqual([{ currency: 'EUR', amount: 0 }])
  })
})

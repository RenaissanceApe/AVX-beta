import { describe, it, expect } from 'vitest'
import { OVERVIEW_TILES, moneyLines, lastYearSub } from './tiles'

const overview = {
  today: '2026-11-05', gigs_this_month: { total: 4, confirmed: 3 }, revenue_next_30: { EUR: 155, USD: 1250 },
  waiting: { count: 2, totals: { EUR: 700 } }, equipment_use_90: 0.42,
  margin_this_month: { EUR: 1749 }, margin_pct_this_month: 32.2, negative_margin: 1,
  revenue_this_month: { EUR: 430, USD: 200 }, revenue_month_last_year: { EUR: 300 }, margin_pct_year: 7.9,
  operating_result_year: { EUR: -3508.33, USD: 190 }, negative_margin_year: 2,
}

describe('overview tiles', () => {
  it('reads the four first tiles from report_overview', () => {
    const by = Object.fromEntries(OVERVIEW_TILES.map(t => [t.key, t]))
    expect(Object.keys(by)).toEqual(['gigsThisMonth', 'revenueNext30', 'waitingQuotes', 'equipmentUse90', 'revenueThisMonth', 'marginPctYear', 'operatingResultYear', 'negativeMarginYear'])
    expect(by.gigsThisMonth.value(overview)).toBe(4)
    expect(by.gigsThisMonth.sub(overview).vars.count).toBe(3)
    expect(by.revenueNext30.value(overview)).toEqual({ EUR: 155, USD: 1250 })
    expect(by.waitingQuotes.sub(overview).vars.count).toBe(2)
    expect(by.equipmentUse90.value(overview)).toBe(0.42)
    expect(by.equipmentUse90.value({})).toBe(null)
    expect(by.revenueNext30.to('/org/x')).toBe('/org/x/reports?tab=revenue')
  })
  it('reads the K2 money tiles (they took the place of step 10\'s two)', () => {
    const by = Object.fromEntries(OVERVIEW_TILES.map(t => [t.key, t]))
    expect(by.marginThisMonth).toBeUndefined()
    expect(by.revenueThisMonth.value(overview)).toEqual({ EUR: 430, USD: 200 })
    expect(by.revenueThisMonth.sub(overview)).toEqual({ key: 'reports.tileSub.lastYear', vars: { amount: 300, currency: 'EUR' } })
    expect(by.marginPctYear.value(overview)).toBe(7.9)
    expect(by.marginPctYear.value({})).toBe(null)
    expect(by.operatingResultYear.value(overview)).toEqual({ EUR: -3508.33, USD: 190 })
    expect(by.negativeMarginYear.value(overview)).toBe(2)
    expect(by.negativeMarginYear.value({})).toBe(0)
    expect(by.revenueThisMonth.to('/org/x')).toBe('/org/x/reports?tab=money&compare=last_year')
  })
  it('says when last year has nothing in the same currency', () => {
    expect(lastYearSub({ revenue_this_month: { USD: 5 }, revenue_month_last_year: { EUR: 3 } })).toEqual({ key: 'reports.tileSub.noLastYear', vars: {} })
    expect(lastYearSub({})).toEqual({ key: 'reports.tileSub.noLastYear', vars: {} })
  })
  it('lists money per currency, never added', () => {
    expect(moneyLines({ EUR: 155, USD: 1250 })).toEqual([{ currency: 'USD', amount: 1250 }, { currency: 'EUR', amount: 155 }])
    expect(moneyLines({})).toEqual([{ currency: 'EUR', amount: 0 }])
  })
})

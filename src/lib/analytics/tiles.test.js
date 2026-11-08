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
    expect(Object.keys(by).slice(0, 12)).toEqual(['gigsThisMonth', 'revenueNext30', 'waitingQuotes', 'equipmentUse90', 'revenueThisMonth', 'marginPctYear', 'operatingResultYear', 'negativeMarginYear',
      'overdueNow', 'cashIn30', 'expensesDue14', 'revenueNext3m'])
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
  it('reads the K3 cash tiles', () => {
    const by = Object.fromEntries(OVERVIEW_TILES.map(t => [t.key, t]))
    const o = { overdue_now: { EUR: 1738, GBP: 123 }, overdue_count: 4, cash_in_30: { EUR: 246 }, expenses_due_14: { EUR: 725.7 }, revenue_next_3m: { EUR: 1500 } }
    expect(by.overdueNow.value(o)).toEqual({ EUR: 1738, GBP: 123 })
    expect(by.overdueNow.sub(o)).toEqual({ key: 'reports.tileSub.invoices', vars: { count: 4 } })
    expect(by.cashIn30.value(o)).toEqual({ EUR: 246 })
    expect(by.expensesDue14.value({})).toEqual({})
    expect(by.revenueNext3m.value(o)).toEqual({ EUR: 1500 })
    expect(by.overdueNow.to('/org/x')).toBe('/org/x/invoices?view=unpaid')
    expect(by.expensesDue14.to('/org/x')).toBe('/org/x/expenses?view=unpaid')
  })
  it('says when last year has nothing in the same currency', () => {
    expect(lastYearSub({ revenue_this_month: { USD: 5 }, revenue_month_last_year: { EUR: 3 } })).toEqual({ key: 'reports.tileSub.noLastYear', vars: {} })
    expect(lastYearSub({})).toEqual({ key: 'reports.tileSub.noLastYear', vars: {} })
  })
  it('lists money per currency, never added', () => {
    expect(moneyLines({ EUR: 155, USD: 1250 })).toEqual([{ currency: 'USD', amount: 1250 }, { currency: 'EUR', amount: 155 }])
    expect(moneyLines({})).toEqual([{ currency: 'EUR', amount: 0 }])
  })
  it('reads the K4 sales tiles from report_overview_k4', () => {
    const by = Object.fromEntries(OVERVIEW_TILES.map(t => [t.key, t]))
    const o = { follow_up: { count: 1, totals: { EUR: 400 } }, win_rate_90: { decided: 4, by_count: 0.5, by_value: 0.6316, currency: 'EUR' },
      top_client_year: { key: 'a', name: 'Alpha Lda', currency: 'EUR', amount: 900, share: 0.75 } }
    expect(by.followUp.source).toBe('report_overview_k4')
    expect(by.followUp.value(o)).toBe(1)
    expect(by.followUp.sub(o)).toEqual({ key: 'reports.tileSub.worth', vars: { amount: 400, currency: 'EUR' } })
    expect(by.followUp.to('/org/x')).toBe('/org/x/quotes?status=follow_up')
    expect(by.winRate90.value(o)).toBe(0.5)
    expect(by.winRate90.sub(o)).toEqual({ key: 'reports.tileSub.byValue', vars: { pct: 63 } })
    expect(by.winRate90.sub({ win_rate_90: { decided: 0 } }).key).toBe('reports.tileSub.noDecided')
    expect(by.winRate90.value({})).toBe(null)
    expect(by.topClientYear.value(o)).toEqual({ EUR: 900 })
    expect(by.topClientYear.sub(o)).toEqual({ key: 'reports.tileSub.topClient', vars: { name: 'Alpha Lda', pct: 75 } })
    expect(by.topClientYear.value({ top_client_year: null })).toEqual({})
    expect(by.topClientYear.sub({}).key).toBe('reports.tileSub.noTopClient')
    expect(by.waitingQuotes.to('/org/x')).toBe('/org/x/reports?tab=sales')
  })
})

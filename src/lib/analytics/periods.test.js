import { describe, it, expect } from 'vitest'
import { periodRange, comparisonRange, change, monthsOf, todayIn, addMonthsIso, isIsoDate, periodKey } from './periods'

describe('periods', () => {
  it('works out today in the organisation\'s time zone', () => {
    const now = new Date('2026-11-01T02:30:00Z') // 1 Nov in Lisbon, still 31 Oct in New York
    expect(todayIn('Europe/Lisbon', now)).toBe('2026-11-01')
    expect(todayIn('America/New_York', now)).toBe('2026-10-31')
    expect(todayIn('Not/AZone', now)).toBe('2026-11-01')
  })

  it('makes each period from today', () => {
    const today = '2026-11-05'
    expect(periodRange('this_month', { today })).toMatchObject({ from: '2026-11-01', until: '2026-12-01', asOf: '2026-11-06', partial: true })
    expect(periodRange('last_month', { today })).toMatchObject({ from: '2026-10-01', until: '2026-11-01', asOf: '2026-11-01', partial: false })
    expect(periodRange('this_quarter', { today })).toMatchObject({ from: '2026-10-01', until: '2027-01-01' })
    expect(periodRange('this_year', { today })).toMatchObject({ from: '2026-01-01', until: '2027-01-01' })
    expect(periodRange('last_12_months', { today })).toMatchObject({ from: '2025-12-01', until: '2026-12-01' })
    expect(periodRange('custom', { today, from: '2026-03-10', until: '2026-03-20' })).toMatchObject({ from: '2026-03-10', until: '2026-03-21', partial: false })
    expect(periodRange('custom', { today, from: '2026-03-20', until: '2026-03-10' })).toBe(null)
    expect(periodRange('custom', { today, from: '2026-02-30', until: '2026-03-10' })).toBe(null)
    expect(periodRange('nonsense', { today })).toBe(null)
  })

  it('compares a period not yet over day for day', () => {
    const r = periodRange('this_month', { today: '2026-11-05' })
    expect(comparisonRange(r, 'previous')).toMatchObject({ from: '2026-10-01', until: '2026-10-06' })
    expect(comparisonRange(r, 'last_year')).toMatchObject({ from: '2025-11-01', until: '2025-11-06' })
  })

  it('never runs a comparison past the end of its own month', () => {
    const r = periodRange('this_month', { today: '2026-03-31' })
    expect(comparisonRange(r, 'previous')).toMatchObject({ from: '2026-02-01', until: '2026-03-01' })
  })

  it('compares whole periods whole', () => {
    expect(comparisonRange(periodRange('last_month', { today: '2026-11-05' }))).toMatchObject({ from: '2026-09-01', until: '2026-10-01' })
    expect(comparisonRange(periodRange('this_quarter', { today: '2026-12-31' }))).toMatchObject({ from: '2026-07-01', until: '2026-10-01' })
    const custom = periodRange('custom', { today: '2026-11-05', from: '2026-03-10', until: '2026-03-19' })
    expect(comparisonRange(custom, 'previous')).toMatchObject({ from: '2026-02-28', until: '2026-03-10' })
    expect(comparisonRange(custom, 'last_year')).toMatchObject({ from: '2025-03-10', until: '2025-03-20' })
    const leap = periodRange('custom', { today: '2029-01-01', from: '2028-02-29', until: '2028-02-29' })
    expect(comparisonRange(leap, 'last_year')).toMatchObject({ from: '2027-02-28' })
  })

  it('works out change', () => {
    expect(change(125, 100)).toBe(0.25)
    expect(change(50, 100)).toBe(-0.5)
    expect(change(10, 0)).toBe(null)
    expect(change(10, -20)).toBe(1.5)
  })

  it('lists the months of a range', () => {
    expect(monthsOf({ from: '2026-01-15', until: '2026-03-10' })).toEqual([
      { key: '2026-01', from: '2026-01-15', until: '2026-02-01' },
      { key: '2026-02', from: '2026-02-01', until: '2026-03-01' },
      { key: '2026-03', from: '2026-03-01', until: '2026-03-10' },
    ])
    expect(monthsOf(periodRange('last_12_months', { today: '2026-11-05' }))).toHaveLength(12)
  })

  it('checks dates and keys', () => {
    expect(addMonthsIso('2026-12-15', 1)).toBe('2027-01-01')
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(periodKey('bogus')).toBe('this_month')
  })
})

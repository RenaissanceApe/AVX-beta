import { describe, it, expect } from 'vitest'
import { demandRows, demandTotals, peakBars, confirmRate, dispatchLeadBars, scanBars, outShare, damageRows } from './warehouse'

// The items the database test (supabase/tests/warehouse_numbers.sql) gets for October 2026
const items = [
  { item_id: 'mic', name: 'Mic', peak_booked: 9, owned_at_peak: 6, hired_at_peak: 3, days_over: 4, days_short: 3, hire_ins: 1, idle: false, book_value: 0 },
  { item_id: 'spk', name: 'Speaker', peak_booked: 0, owned_at_peak: null, days_over: 0, days_short: 0, hire_ins: 0, idle: true, book_value: 770.32 },
  { item_id: 'cab', name: 'Old cable', peak_booked: 0, owned_at_peak: null, days_over: 0, days_short: 0, hire_ins: 0, idle: true, book_value: 6.42 },
]

describe('warehouse demand', () => {
  it('filters short and idle items', () => {
    expect(demandRows(items, 'short').map(r => r.item_id)).toEqual(['mic'])
    expect(demandRows(items, 'idle').map(r => r.item_id)).toEqual(['spk', 'cab'])
    expect(demandRows(items, 'all')).toHaveLength(3)
    expect(demandRows(null)).toEqual([])
  })
  it('adds up the totals', () => {
    expect(demandTotals(items)).toEqual({ over: 1, short: 1, hireIns: 1, idle: 2, idleValue: 776.74 })
    expect(demandTotals([{ idle: true, book_value: null }]).idleValue).toBe(null)
  })
  it('charts the busiest items, the most over stock first', () => {
    expect(peakBars(items).map(r => r.item_id)).toEqual(['mic'])
    expect(peakBars([{ name: 'A', peak_booked: 2, owned_at_peak: 5 }, { name: 'B', peak_booked: 6, owned_at_peak: 4 }]).map(r => r.name)).toEqual(['B', 'A'])
  })
})

describe('warehouse suppliers and dispatch', () => {
  it('counts confirmed of answered', () => {
    expect(confirmRate({ confirmed: 1, declined: 1 })).toBe(0.5)
    expect(confirmRate({ confirmed: 0, declined: 0 })).toBe(null)
  })
  it('keeps lead buckets in order', () => {
    expect(dispatchLeadBars({ same_day: 1, two_three: 1 }).map(b => b.value)).toEqual([0, 1, 0, 1, 0])
  })
  it('makes one bar per day for a month and per month for longer', () => {
    const rows = [{ day: '2026-10-03', scans: 2 }, { day: '2026-10-07', scans: 1 }, { day: '2026-10-12', scans: 1 }]
    const days = scanBars(rows, { from: '2026-10-01', until: '2026-11-01' })
    expect(days).toHaveLength(31)
    expect(days[2]).toEqual({ key: '2026-10-03', value: 2 })
    const months = scanBars(rows, { from: '2026-01-01', until: '2027-01-01' })
    expect(months).toHaveLength(12)
    expect(months[9]).toEqual({ key: '2026-10', value: 4 })
    expect(scanBars(rows, null)).toEqual([])
  })
  it('shares out against planned', () => {
    expect(outShare({ planned: 24, out: 15 })).toBe(0.625)
    expect(outShare({ planned: 0, out: 3 })).toBe(null)
    expect(outShare({ planned: 2, out: 3 })).toBe(1)
  })
  it('picks the damage rows for a grouping', () => {
    const data = { by_item: [{ item_id: 'mic' }], by_gig: [{ gig_id: 'g1' }], by_client: [{ client_id: null }] }
    expect(damageRows(data, 'item')[0].id).toBe('mic')
    expect(damageRows(data, 'gig')[0].id).toBe('g1')
    expect(damageRows(data, 'client')[0].id).toBe('none')
    expect(damageRows(null)).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import {
  statusKeyOf, typeKeyOf, stackByMonth, sumField, leadBars, share, hoursVariance, hoursText, pctText,
  durationParts, positionsByMonth, answerRows, onTimeShare, leaveText,
} from './ops'

const months = [{ key: '2026-10' }, { key: '2026-11' }]

describe('operations report helpers', () => {
  it('keys a gig by its own status, else the built-in one, and by type', () => {
    expect(statusKeyOf({ status: 'confirmed' })).toBe('base:confirmed')
    expect(statusKeyOf({ status: 'confirmed', custom_status_id: 's1' })).toBe('own:s1')
    expect(typeKeyOf({ gig_type_id: 't1' })).toBe('type:t1')
    expect(typeKeyOf({})).toBe('type:none')
  })

  it('stacks rows by month, biggest series first, ignoring months outside the period', () => {
    const rows = [
      { month: '2026-10', status: 'confirmed', gigs: 2 }, { month: '2026-10', status: 'cancelled', gigs: 1 },
      { month: '2026-11', status: 'confirmed', gigs: 3 }, { month: '2026-12', status: 'draft', gigs: 9 },
    ]
    const { data, series } = stackByMonth(rows, months, 'gigs', statusKeyOf, k => k.toUpperCase())
    expect(series).toEqual([{ key: 'base:confirmed', label: 'BASE:CONFIRMED' }, { key: 'base:cancelled', label: 'BASE:CANCELLED' }])
    expect(data).toEqual([
      { key: '2026-10', values: { 'base:confirmed': 2, 'base:cancelled': 1 } },
      { key: '2026-11', values: { 'base:confirmed': 3 } },
    ])
    expect(sumField(rows, 'gigs')).toBe(15)
  })

  it('orders the lead-time buckets and works out shares', () => {
    expect(leadBars({ under_7: 1, d30_89: 2 }).map(b => b.value)).toEqual([1, 0, 2, 0])
    expect(share(4, 8)).toBe(0.5)
    expect(share(1, 0)).toBeNull()
  })

  it('compares planned and approved hours', () => {
    expect(hoursVariance(76, 22)).toEqual({ planned: 76, approved: 22, diff: -54, pct: -54 / 76 })
    expect(hoursVariance(0, 5).pct).toBeNull()
  })

  it('formats hours, percentages and durations in both languages', () => {
    expect(hoursText(1234.56, 'en')).toBe('1,234.6 h')
    expect(hoursText(1234.56, 'pt')).toMatch(/^1\s?234,6 h$/)
    expect(pctText(0.1)).toBe('10%')
    expect(pctText(null)).toBe('—')
    expect(durationParts(30)).toEqual({ unit: 'hours', value: 30 })
    expect(durationParts(72)).toEqual({ unit: 'days', value: 3 })
    expect(durationParts(null)).toBeNull()
  })

  it('groups positions by the month of the gig', () => {
    const gigs = [{ start_date: '2026-10-05', filled: 2, open: 1 }, { start_date: '2026-10-27', filled: 1, open: 2 }, { start_date: '2027-01-01', filled: 5, open: 5 }]
    expect(positionsByMonth(gigs, months)).toEqual([
      { key: '2026-10', values: { filled: 3, open: 3 } },
      { key: '2026-11', values: { filled: 0, open: 0 } },
    ])
  })

  it('lists crew-call answers with their share, tasks on time, leave per type', () => {
    expect(answerRows({ invited: 3, accepted: 1, declined: 1, none: 1, full: 0 }).map(r => [r.key, r.value])).toEqual([
      ['accepted', 1], ['declined', 1], ['none', 1], ['full', 0],
    ])
    expect(answerRows({ invited: 4, accepted: 1 })[0].share).toBe(0.25)
    expect(onTimeShare({ on_time: 1, late: 1 })).toBe(0.5)
    expect(onTimeShare({ on_time: 0, late: 0 })).toBeNull()
    expect(leaveText({ holiday: 3, sick: 0, training: 1 }, k => k)).toBe('holiday 3, training 1')
  })
})

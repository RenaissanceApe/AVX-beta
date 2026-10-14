import { describe, it, expect } from 'vitest'
import { monthMatrix, gigsOnDay } from './calendar'

describe('monthMatrix', () => {
  it('starts on the Monday on or before the 1st and spans 6 weeks', () => {
    const m = monthMatrix(2026, 10) // November 2026: the 1st is a Sunday
    expect(m).toHaveLength(6)
    expect(m[0][0]).toBe('2026-10-26')
    expect(m[0][6]).toBe('2026-11-01')
    expect(m[5][6]).toBe('2026-12-06')
  })
  it('handles a month starting on Monday', () => {
    expect(monthMatrix(2026, 5)[0][0]).toBe('2026-06-01')
  })
})

describe('gigsOnDay', () => {
  const gigs = [
    { id: 'a', start_date: '2026-11-01', end_date: '2026-11-03' },
    { id: 'b', start_date: '2026-11-03', end_date: null },
    { id: 'c', start_date: null },
  ]
  it('includes multi-day gigs on every day', () => {
    expect(gigsOnDay(gigs, '2026-11-02').map(g => g.id)).toEqual(['a'])
    expect(gigsOnDay(gigs, '2026-11-03').map(g => g.id)).toEqual(['a', 'b'])
    expect(gigsOnDay(gigs, '2026-11-04')).toEqual([])
  })
})

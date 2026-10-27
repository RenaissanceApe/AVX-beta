import { describe, it, expect } from 'vitest'
import { isGigDay, onSiteState, switchOnSite, todaysSchedule, localDay } from './onSite'

const gig = { id: 'g1', start_date: '2026-11-10', end_date: '2026-11-12' }

describe('on-site mode', () => {
  it('knows a gig day', () => {
    expect(isGigDay(gig, '2026-11-10')).toBe(true)
    expect(isGigDay(gig, '2026-11-12')).toBe(true)
    expect(isGigDay(gig, '2026-11-13')).toBe(false)
    expect(isGigDay({ start_date: '2026-11-10' }, '2026-11-10')).toBe(true)
    expect(isGigDay({}, '2026-11-10')).toBe(false)
  })
  it('turns on by itself on gig days unless switched off', () => {
    const on = { auto: true, gigs: {} }
    expect(onSiteState(gig, on, '2026-11-11')).toBe('auto')
    expect(onSiteState(gig, on, '2026-11-20')).toBe(null)
    expect(onSiteState(gig, { auto: false, gigs: {} }, '2026-11-11')).toBe(null)
  })
  it('a switch by hand lasts the day it was made', () => {
    const off = switchOnSite({ auto: true, gigs: {} }, 'g1', false, '2026-11-11')
    expect(onSiteState(gig, off, '2026-11-11')).toBe(null)
    expect(onSiteState(gig, off, '2026-11-12')).toBe('auto')
    const manual = switchOnSite({ auto: false, gigs: {} }, 'g1', true, '2026-11-20')
    expect(onSiteState(gig, manual, '2026-11-20')).toBe('manual')
    expect(Object.keys(switchOnSite(manual, 'g2', true, '2026-11-21').gigs)).toEqual(['g2'])
  })
  it('marks what is happening now and next', () => {
    const items = [
      { id: 'b', day: '2026-11-11', start_time: '14:00:00', end_time: '16:00:00' },
      { id: 'a', day: '2026-11-11', start_time: '08:00:00', end_time: '12:00:00' },
      { id: 'c', day: '2026-11-11', start_time: '20:00:00', end_time: null },
      { id: 'x', day: '2026-11-12', start_time: '09:00:00' },
    ]
    expect(todaysSchedule(items, '2026-11-11', '15:00').map(s => [s.id, s.now, s.next])).toEqual([['a', false, false], ['b', true, false], ['c', false, true]])
  })
  it('gives today in local time', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

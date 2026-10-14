import { describe, it, expect } from 'vitest'
import { gigBucket, filterGigs, countByBucket } from './gigs'

const today = '2026-10-15'
const gigs = [
  { id: 'a', name: 'Festival', venue: 'Algés', status: 'confirmed', start_date: '2026-11-01', end_date: '2026-11-03' },
  { id: 'b', name: 'Corporate', venue: 'Lisboa', status: 'completed', start_date: '2026-09-01', end_date: null },
  { id: 'c', name: 'Tour', status: 'archived', start_date: '2026-12-01' },
  { id: 'd', name: 'TBC show', status: 'draft', start_date: null },
  { id: 'e', name: 'Ends today', status: 'active', start_date: '2026-10-13', end_date: '2026-10-15' },
  { id: 'f', name: 'Older', status: 'completed', start_date: '2026-08-01' },
]

describe('gigBucket', () => {
  it('uses the last day of the gig', () => {
    expect(gigBucket(gigs[4], today)).toBe('upcoming')
    expect(gigBucket(gigs[1], today)).toBe('past')
  })
  it('archived wins over dates; undated gigs are upcoming', () => {
    expect(gigBucket(gigs[2], today)).toBe('archived')
    expect(gigBucket(gigs[3], today)).toBe('upcoming')
  })
})

describe('filterGigs', () => {
  it('filters by bucket and search', () => {
    expect(filterGigs(gigs, 'upcoming', '', today).map(g => g.id)).toEqual(['a', 'd', 'e'])
    expect(filterGigs(gigs, 'all', 'lisb', today).map(g => g.id)).toEqual(['b'])
  })
  it('lists past gigs most recent first', () => {
    expect(filterGigs(gigs, 'past', '', today).map(g => g.id)).toEqual(['b', 'f'])
  })
})

describe('countByBucket', () => {
  it('counts each bucket', () => {
    expect(countByBucket(gigs, today)).toEqual({ upcoming: 3, past: 2, archived: 1, all: 6 })
  })
})

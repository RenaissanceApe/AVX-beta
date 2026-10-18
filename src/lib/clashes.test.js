import { describe, it, expect, beforeEach } from 'vitest'
import { rangeText, clashText, groupByUser, dayRange, overlaps, findOverlaps, parseRange, clashingGigIds } from './clashes'
import { setCurrentLanguage } from '../i18n'

// Local times, so the tests pass in any time zone
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString()

describe('clash text', () => {
  beforeEach(() => setCurrentLanguage('en'))

  it('shows whole days without times, the end being the next midnight', () => {
    expect(rangeText(local(2026, 11, 10), local(2026, 11, 11))).toBe('10 Nov')
    expect(rangeText(local(2026, 11, 10), local(2026, 11, 13))).toBe('10–12 Nov')
  })
  it('shows shifts with times', () => {
    expect(rangeText(local(2026, 11, 10, 9), local(2026, 11, 10, 18))).toBe('10 Nov 09:00–18:00')
    expect(rangeText(local(2026, 11, 10, 22), local(2026, 11, 11, 4))).toBe('10 Nov 22:00 – 11 Nov 04:00')
  })
  it('names the gig only when the database gave its details', () => {
    const base = { starts_at: local(2026, 11, 10), ends_at: local(2026, 11, 11), status: 'confirmed' }
    expect(clashText({ ...base, kind: 'booked' })).toBe('Booked 10 Nov (another gig)')
    expect(clashText({ ...base, kind: 'booked', label: 'Festival', company: 'Other Co' })).toBe('Booked 10 Nov (Festival · Other Co)')
    expect(clashText({ ...base, kind: 'unavailable' })).toBe('Not available 10 Nov')
    expect(clashText({ ...base, kind: 'booked', status: 'hold' })).toContain('(provisional)')
  })
  it('translates', () => {
    setCurrentLanguage('pt')
    expect(clashText({ kind: 'unavailable', starts_at: local(2026, 11, 10), ends_at: local(2026, 11, 11) })).toMatch(/^Indisponível/)
  })
})

describe('ranges and overlaps', () => {
  it('groups clash rows by person', () => {
    const map = groupByUser([{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'a' }])
    expect(map.a).toHaveLength(2)
    expect(map.b).toHaveLength(1)
  })
  it('turns form dates into a range ending the day after', () => {
    expect(dayRange('', '')).toBeNull()
    expect(dayRange('2026-11-10', '')).toEqual({ from: local(2026, 11, 10), until: local(2026, 11, 11) })
    expect(dayRange('2026-11-10', '2026-11-12')).toEqual({ from: local(2026, 11, 10), until: local(2026, 11, 13) })
    // An end before the start is ignored (the form shows its own error)
    expect(dayRange('2026-11-10', '2026-11-01')).toEqual({ from: local(2026, 11, 10), until: local(2026, 11, 11) })
  })
  it('treats touching ranges as not overlapping', () => {
    const a = { from: local(2026, 11, 10, 9), until: local(2026, 11, 10, 13) }
    expect(overlaps(a, { from: local(2026, 11, 10, 13), until: local(2026, 11, 10, 18) })).toBe(false)
    expect(overlaps(a, { from: local(2026, 11, 10, 12), until: local(2026, 11, 10, 18) })).toBe(true)
  })
  it('finds every item that overlaps another', () => {
    const items = [
      { id: 'morning', from: local(2026, 11, 10, 8), until: local(2026, 11, 10, 12) },
      { id: 'evening', from: local(2026, 11, 10, 18), until: local(2026, 11, 10, 23) },
      { id: 'allday', from: local(2026, 11, 10), until: local(2026, 11, 11) },
      { id: 'later', from: local(2026, 11, 12), until: local(2026, 11, 13) },
      { id: 'nodates' },
    ]
    expect([...findOverlaps(items)].sort()).toEqual(['allday', 'evening', 'morning'])
  })
  it('does not count one item twice as a clash with itself', () => {
    const one = { id: 'g', from: local(2026, 11, 10), until: local(2026, 11, 11) }
    expect(findOverlaps([one, { ...one }]).size).toBe(0)
  })
})

describe('reservations from the database', () => {
  it('parses ranges as PostgREST returns them', () => {
    expect(parseRange('["2026-11-10 00:00:00+00","2026-11-12 00:00:00+00")')).toEqual({
      from: '2026-11-10T00:00:00.000Z', until: '2026-11-12T00:00:00.000Z',
    })
    expect(parseRange('["2026-11-10 09:30:00+01:00","2026-11-10 18:00:00+01:00")').from).toBe('2026-11-10T08:30:00.000Z')
    expect(parseRange('empty')).toBeNull()
  })
  it('flags gigs that overlap another booking or unavailable dates', () => {
    const r = (id, gig, from, until, status = 'confirmed') => ({ id, gig_id: gig, status, period: `["${from}","${until}")` })
    const ids = clashingGigIds([
      r('1', 'a', '2026-11-10 00:00:00+00', '2026-11-11 00:00:00+00'),
      r('2', 'b', '2026-11-10 18:00:00+00', '2026-11-10 23:00:00+00'),
      r('3', 'c', '2026-11-20 00:00:00+00', '2026-11-21 00:00:00+00'),
      r('4', null, '2026-11-20 00:00:00+00', '2026-11-22 00:00:00+00'), // unavailable
      r('5', 'd', '2026-11-10 00:00:00+00', '2026-11-11 00:00:00+00', 'cancelled'),
    ])
    expect([...ids].sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('ranges across months', () => {
  it('names both months', () => {
    setCurrentLanguage('en')
    expect(rangeText(local(2026, 11, 30), local(2026, 12, 3))).toBe('30 Nov–2 Dec')
  })
})

import { describe, it, expect } from 'vitest'
import { licenceCovers, licenceStatus, tidyCategories, drivingMinutes, drivingDays, tripProblems, returnLeg, tripMinutes } from './transport'

describe('licenceCovers', () => {
  it('needs nothing when the vehicle needs no category', () => {
    expect(licenceCovers([], null)).toBe(true)
  })
  it('accepts the category itself', () => {
    expect(licenceCovers(['B'], 'B')).toBe(true)
    expect(licenceCovers(['C1'], 'C1')).toBe(true)
  })
  it('accepts higher categories that include it', () => {
    expect(licenceCovers(['C'], 'C1')).toBe(true)
    expect(licenceCovers(['CE'], 'C')).toBe(true)
    expect(licenceCovers(['CE'], 'C1E')).toBe(true)
    expect(licenceCovers(['CE'], 'BE')).toBe(true)
    expect(licenceCovers(['C1E'], 'BE')).toBe(true)
    expect(licenceCovers(['D'], 'D1')).toBe(true)
    expect(licenceCovers(['C1'], 'B')).toBe(true)
  })
  it('refuses what the categories do not include', () => {
    expect(licenceCovers(['B'], 'C1')).toBe(false)
    expect(licenceCovers(['B'], 'BE')).toBe(false)
    expect(licenceCovers(['C1'], 'C')).toBe(false)
    expect(licenceCovers(['C'], 'CE')).toBe(false)
    expect(licenceCovers(['BE'], 'C1E')).toBe(false)
    expect(licenceCovers(['D'], 'C')).toBe(false)
    expect(licenceCovers(null, 'B')).toBe(false)
  })
})

describe('licenceStatus', () => {
  it('is null with nothing to check, unknown with nothing recorded', () => {
    expect(licenceStatus(['B'], null)).toBe(null)
    expect(licenceStatus([], 'B')).toBe('unknown')
    expect(licenceStatus(undefined, 'C1')).toBe('unknown')
  })
  it('says ok or missing', () => {
    expect(licenceStatus(['B', 'C1'], 'C1')).toBe('ok')
    expect(licenceStatus(['B'], 'C1')).toBe('missing')
  })
})

describe('tidyCategories', () => {
  it('keeps known categories once, in order', () => {
    expect(tidyCategories(['CE', 'B', 'B', 'X', 'C1'])).toEqual(['B', 'C1', 'CE'])
    expect(tidyCategories(null)).toEqual([])
  })
})

describe('drivingMinutes', () => {
  const tz = 'Europe/Lisbon'
  const trips = [
    { driver_id: 'k', departs_at: '2027-02-10T08:00:00Z', arrives_at: '2027-02-10T11:30:00Z' },
    { driver_id: 'x', co_driver_id: 'k', departs_at: '2027-02-10T20:00:00Z', arrives_at: '2027-02-11T01:00:00Z' },
    { driver_id: 'k', departs_at: '2027-02-12T08:00:00Z', arrives_at: '2027-02-12T09:00:00Z', removed_at: '2027-02-01T00:00:00Z' },
    { driver_id: 'x', departs_at: '2027-02-10T12:00:00Z', arrives_at: '2027-02-10T13:00:00Z' },
  ]
  it('adds the driver and co-driver legs on that day', () => {
    // 3 h 30 + 20:00–24:00 (4 h) on the 10th, Lisbon is UTC in February
    expect(drivingMinutes(trips, 'k', '2027-02-10', tz)).toBe(210 + 240)
  })
  it('counts the part after midnight on the next day', () => {
    expect(drivingMinutes(trips, 'k', '2027-02-11', tz)).toBe(60)
  })
  it('leaves out removed trips and other people', () => {
    expect(drivingMinutes(trips, 'k', '2027-02-12', tz)).toBe(0)
    expect(drivingMinutes(trips, 'x', '2027-02-10', tz)).toBe(240 + 60)
    expect(drivingMinutes(trips, null, '2027-02-10', tz)).toBe(0)
  })
  it('reads the day on the organisation clock', () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in Lisbon (summer time)
    const summer = [{ driver_id: 'k', departs_at: '2027-06-30T23:30:00Z', arrives_at: '2027-07-01T01:00:00Z' }]
    expect(drivingMinutes(summer, 'k', '2027-07-01', tz)).toBe(90)
    expect(drivingMinutes(summer, 'k', '2027-06-30', tz)).toBe(0)
  })
})

describe('drivingDays', () => {
  it('lists each day a person drives on', () => {
    const trips = [
      { driver_id: 'k', departs_at: '2027-02-10T20:00:00Z', arrives_at: '2027-02-11T01:00:00Z' },
      { driver_id: 'k', departs_at: '2027-02-13T08:00:00Z', arrives_at: '2027-02-14T00:00:00Z' },
    ]
    expect(drivingDays(trips, 'k', 'Europe/Lisbon')).toEqual(['2027-02-10', '2027-02-11', '2027-02-13'])
  })
})

describe('tripProblems', () => {
  const ok = { departs_at: '2027-02-10T08:00:00Z', arrives_at: '2027-02-10T11:00:00Z', driver_id: 'a', co_driver_id: 'b', km: '120' }
  it('accepts a good trip', () => {
    expect(tripProblems(ok)).toEqual([])
    expect(tripProblems({ ...ok, km: '' })).toEqual([])
  })
  it('finds missing or reversed times, long trips, one person twice, bad km', () => {
    expect(tripProblems({ ...ok, arrives_at: '' })).toEqual(['transport.problem.times'])
    expect(tripProblems({ ...ok, arrives_at: ok.departs_at })).toEqual(['transport.problem.order'])
    expect(tripProblems({ ...ok, arrives_at: '2027-02-20T08:00:00Z' })).toEqual(['transport.problem.long'])
    expect(tripProblems({ ...ok, co_driver_id: 'a' })).toEqual(['transport.problem.sameDriver'])
    expect(tripProblems({ ...ok, km: '-3' })).toEqual(['transport.problem.km'])
  })
})

describe('returnLeg and tripMinutes', () => {
  it('swaps the places and keeps the vehicle and people', () => {
    const out = { id: 't1', direction: 'out', vehicle_id: 'v', driver_id: 'a', from_place: 'Warehouse', to_place: 'Venue', km: 120 }
    const back = returnLeg(out, { departs_at: '2027-02-11T01:00:00Z', arrives_at: '2027-02-11T03:00:00Z' })
    expect(back).toMatchObject({ id: undefined, direction: 'back', vehicle_id: 'v', driver_id: 'a', from_place: 'Venue', to_place: 'Warehouse', km: 120 })
    expect(tripMinutes(back)).toBe(120)
    expect(tripMinutes({})).toBe(0)
  })
})

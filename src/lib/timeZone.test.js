import { describe, it, expect } from 'vitest'
import { DEFAULT_TIME_ZONE, isTimeZone, timeZoneList, zonedParts, wallClock, zonedInstant, toZonedInput, fromZonedInput } from './timeZone'

describe('time zones', () => {
  it('knows real zones and refuses made-up ones', () => {
    expect(DEFAULT_TIME_ZONE).toBe('Europe/Lisbon')
    expect(isTimeZone('Europe/London')).toBe(true)
    expect(isTimeZone('America/New_York')).toBe(true)
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isTimeZone('')).toBe(false)
    expect(isTimeZone(null)).toBe(false)
  })

  it('lists zones sorted, with Lisbon and the current one', () => {
    const list = timeZoneList('America/New_York')
    expect(list).toContain('Europe/Lisbon')
    expect(list).toContain('America/New_York')
    expect([...list].sort()).toEqual(list)
  })
})

describe('wall clocks', () => {
  it('reads an instant in New York and London', () => {
    expect(zonedParts('2027-01-10T05:00:00Z', 'America/New_York')).toMatchObject({ year: 2027, month: 1, day: 10, hour: 0, minute: 0 })
    expect(zonedParts('2027-07-10T05:00:00Z', 'America/New_York')).toMatchObject({ day: 10, hour: 1 }) // summer time
    expect(zonedParts('2027-07-10T05:00:00Z', 'Europe/London')).toMatchObject({ day: 10, hour: 6 })
    const d = wallClock('2027-01-10T05:00:00Z', 'America/New_York')
    expect([d.getDate(), d.getHours()]).toEqual([10, 0])
  })

  it('finds the instant of a day and time in a zone', () => {
    expect(zonedInstant('2027-01-10', '00:00', 'America/New_York').toISOString()).toBe('2027-01-10T05:00:00.000Z')
    expect(zonedInstant('2027-07-10', '09:30', 'America/New_York').toISOString()).toBe('2027-07-10T13:30:00.000Z')
    expect(zonedInstant('2027-07-10', '00:00', 'Europe/London').toISOString()).toBe('2027-07-09T23:00:00.000Z')
    expect(zonedInstant('2027-01-10', '00:00', 'Europe/Lisbon').toISOString()).toBe('2027-01-10T00:00:00.000Z')
    // The day the clocks go forward in New York (14 March 2027)
    expect(zonedInstant('2027-03-14', '12:00', 'America/New_York').toISOString()).toBe('2027-03-14T16:00:00.000Z')
  })

  it('round-trips a booking time typed in the organisation\'s zone', () => {
    expect(fromZonedInput('2027-01-10T09:00', 'America/New_York')).toBe('2027-01-10T14:00:00.000Z')
    expect(toZonedInput('2027-01-10T14:00:00.000Z', 'America/New_York')).toBe('2027-01-10T09:00')
    expect(toZonedInput('2027-07-10T08:00:00.000Z', 'Europe/London')).toBe('2027-07-10T09:00')
    expect(fromZonedInput('', 'Europe/London')).toBe(null)
  })
})

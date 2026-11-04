import { describe, it, expect } from 'vitest'
import { easter, ptHolidays, isHoliday, toMinutes, spanMinutes, splitEntry, pricing, entryCost, personActual, totals,
  prefillTimes, csvRows } from './timeRegistration'

const factors = { overtime: 1.5, overtime_after_hours: 10, weekend: 1, night: 1.25, holiday: 2, night_from: '22:00', night_until: '07:00', km_rate: 0.36 }

describe('holidays', () => {
  it('finds Easter', () => {
    expect(easter(2026)).toBe('2026-04-05')
    expect(easter(2027)).toBe('2027-03-28')
    expect(easter(2024)).toBe('2024-03-31')
  })
  it('lists the 13 Portuguese national holidays with the Easter-based ones', () => {
    const h = ptHolidays(2026)
    expect(Object.keys(h)).toHaveLength(13)
    expect(h['2026-04-03']).toBe('good_friday')
    expect(h['2026-06-04']).toBe('corpus_christi')
    expect(h['2026-12-25']).toBe('christmas')
  })
  it("adds the organisation's own live days", () => {
    expect(isHoliday('2026-06-13', [{ day: '2026-06-13' }])).toBe(true)
    expect(isHoliday('2026-06-13', [{ day: '2026-06-13', removed_at: '2026-01-01' }])).toBe(false)
    expect(isHoliday('2026-06-12')).toBe(false)
  })
})

describe('times', () => {
  it('reads times and spans past midnight', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes('09:30:00')).toBe(570)
    expect(toMinutes('25:00')).toBe(null)
    expect(toMinutes('')).toBe(null)
    expect(spanMinutes('14:00', '02:00')).toBe(720)
    expect(spanMinutes('08:00', '08:00')).toBe(1440)
  })
})

describe('split', () => {
  it('a plain weekday', () => {
    // 2026-12-02 is a Wednesday
    expect(splitEntry({ work_date: '2026-12-02', start_time: '09:00', end_time: '18:00', break_minutes: 60 }, factors))
      .toMatchObject({ normal: 8, overtime: 0, night: 0, weekend: 0, holiday: 0, worked: 8 })
  })
  it('overtime and night across midnight into a Saturday', () => {
    // Friday 4 Dec 14:00 to Saturday 02:00, 1 h break: 11 h worked, the last hour overtime (1.5 beats
    // night 1.25), 22:00–01:00 night (night 1.25 beats weekend 1), the break taken from normal time
    const s = splitEntry({ work_date: '2026-12-04', start_time: '14:00', end_time: '02:00', break_minutes: 60 }, factors)
    expect(s).toMatchObject({ normal: 7, night: 3, overtime: 1, weekend: 0, holiday: 0, worked: 11 })
  })
  it('weekend hours when the weekend factor is highest', () => {
    const s = splitEntry({ work_date: '2026-12-05', start_time: '10:00', end_time: '20:00' }, { ...factors, weekend: 1.5 })
    expect(s).toMatchObject({ weekend: 10, normal: 0 })
  })
  it('holiday hours, including a holiday reached after midnight', () => {
    expect(splitEntry({ work_date: '2026-12-25', start_time: '09:00', end_time: '17:00' }, factors)).toMatchObject({ holiday: 8 })
    // 24 Dec 20:00 → 25 Dec 01:00: 2 h night on the 24th, then 1 h on Christmas (holiday 2 beats night)
    expect(splitEntry({ work_date: '2026-12-24', start_time: '20:00', end_time: '01:00' }, factors))
      .toMatchObject({ normal: 2, night: 2, holiday: 1 })
  })
  it('counts travel and km apart, refuses a break longer than the shift', () => {
    expect(splitEntry({ work_date: '2026-12-02', start_time: '09:00', end_time: '10:00', travel_minutes: 90, km: 42.5 }, factors))
      .toMatchObject({ worked: 1, travel: 1.5, km: 42.5 })
    expect(splitEntry({ work_date: '2026-12-02', start_time: '09:00', end_time: '10:00', break_minutes: 60 }, factors)).toBe(null)
    expect(splitEntry({ work_date: '2026-12-02', start_time: '', end_time: '10:00' }, factors)).toBe(null)
  })
})

describe('cost', () => {
  const split = { normal: 7, night: 3, overtime: 1, weekend: 0, holiday: 0, worked: 11, travel: 1, km: 50 }
  it('prices from the agreed fee first, else the card', () => {
    expect(pricing({ unit: 'day', rate: 300 }, { hour_rate: 20 })).toMatchObject({ unit: 'day', rate: 300, source: 'agreed' })
    expect(pricing(null, { hour_rate: 20, day_rate: 300 })).toMatchObject({ unit: 'hour', rate: 20 })
    expect(pricing(null, { half_day_rate: 100 })).toMatchObject({ unit: 'half_day' })
    expect(pricing(null, null)).toBe(null)
  })
  it('hour fee: hours × rate × factor, travel plain, km at the km rate', () => {
    // 7×20 + 3×20×1.25 + 1×20×1.5 + 1×20 + 50×0.36
    expect(entryCost(split, { unit: 'hour', rate: 20 }, factors).cost).toBe(140 + 75 + 30 + 20 + 18)
  })
  it('day fee: the day rate plus extras at the hourly equivalent', () => {
    // 300 + 1×30×1.5 + 3×30×0.25 + 1×30 + 18
    const c = entryCost(split, { unit: 'day', rate: 300 }, factors)
    expect(c.hourly).toBe(30)
    expect(c.cost).toBe(300 + 45 + 22.5 + 30 + 18)
  })
  it('fixed fee: hours change nothing, km still paid; counted once per gig', () => {
    expect(entryCost(split, { unit: 'fixed', rate: 900 }, factors).cost).toBe(18)
    const entries = [{ status: 'approved', cost: 18 }, { status: 'approved', cost: 0 }, { status: 'submitted', cost: 99 }]
    expect(personActual(entries, { unit: 'fixed', rate: 900 })).toBe(918)
    expect(personActual([{ status: 'submitted' }], null)).toBe(null)
  })
})

describe('totals, prefill and CSV', () => {
  it('adds up stored splits for approved days and live ones for the rest', () => {
    const t = totals([
      { status: 'approved', split: { normal: 8, worked: 8 }, cost: 240 },
      { status: 'submitted', work_date: '2026-12-02', start_time: '09:00', end_time: '13:00' },
      { status: 'approved', split: { normal: 5, worked: 5 }, cost: 1, removed_at: 'x' },
    ], factors)
    expect(t).toMatchObject({ normal: 12, worked: 12, cost: 240 })
    const two = [{ status: 'submitted', work_date: '2026-12-02', start_time: '09:00', end_time: '10:00', travel_minutes: 40 },
      { status: 'submitted', work_date: '2026-12-03', start_time: '09:00', end_time: '10:00', travel_minutes: 40 }]
    expect(totals(two, factors).travel).toBe(1.33)
  })
  it('prefills from the schedule for the day', () => {
    const schedule = [{ day: '2026-12-04', start_time: '10:00:00', end_time: '12:00:00' }, { day: '2026-12-04', start_time: '20:00:00', end_time: '23:30:00' }]
    expect(prefillTimes({}, schedule, '2026-12-04')).toEqual({ start_time: '10:00', end_time: '23:30' })
    expect(prefillTimes({}, schedule, '2026-12-05')).toEqual({ start_time: '', end_time: '' })
  })
  it('writes one CSV row per day', () => {
    const rows = csvRows([{ user_id: 'a', work_date: '2026-12-02', start_time: '09:00:00', end_time: '18:00:00', status: 'approved', split: { normal: 8 }, cost: 240 }], { a: 'Ana' })
    expect(rows[0]).toMatchObject({ name: 'Ana', start: '09:00', normal: 8, cost: 240 })
  })
})

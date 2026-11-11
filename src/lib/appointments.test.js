import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { appointmentRange, appointmentDays, toForm, toRow, formError, peopleChanges, sortAppointments, calendarItems, addDays } from './appointments'

const NY = 'America/New_York'

describe('appointments', () => {
  it('reads all-day appointments on the organisation clock', () => {
    const a = { all_day: true, start_date: '2027-01-10', end_date: '2027-01-11' }
    expect(appointmentRange(a, NY)).toEqual({ from: '2027-01-10T05:00:00.000Z', until: '2027-01-12T05:00:00.000Z' })
    expect(appointmentDays(a, NY)).toEqual({ start_date: '2027-01-10', end_date: '2027-01-11' })
  })

  it('places timed appointments on their local days', () => {
    // 22:00–02:00 New York time crosses midnight there
    const a = { all_day: false, starts_at: '2027-01-11T03:00:00Z', ends_at: '2027-01-11T07:00:00Z' }
    expect(appointmentDays(a, NY)).toEqual({ start_date: '2027-01-10', end_date: '2027-01-11' })
    // Ending exactly at midnight stays on one day
    const b = { all_day: false, starts_at: '2027-01-11T03:00:00Z', ends_at: '2027-01-11T05:00:00Z' }
    expect(appointmentDays(b, NY)).toEqual({ start_date: '2027-01-10', end_date: '2027-01-10' })
  })

  it('turns the form into a row and back', () => {
    const f = { ...toForm(null, NY, '2027-01-10'), title: ' Site visit ', from: '09:30', until: '11:00' }
    const row = toRow(f, NY)
    expect(row).toMatchObject({ title: 'Site visit', all_day: false, starts_at: '2027-01-10T14:30:00.000Z', ends_at: '2027-01-10T16:00:00.000Z', start_date: null })
    expect(toForm({ ...row, id: 'x' }, NY, '2027-01-01')).toMatchObject({ day: '2027-01-10', from: '09:30', until: '11:00', allDay: false })
  })

  it('runs past midnight when the end time is earlier', () => {
    const row = toRow({ ...toForm(null, 'UTC', '2027-01-10'), title: 'Load-out', from: '22:00', until: '02:00' }, 'UTC')
    expect(row.ends_at).toBe('2027-01-11T02:00:00.000Z')
  })

  it('keeps an all-day end on or after the start', () => {
    const row = toRow({ ...toForm(null, NY, '2027-01-10'), title: 'Warehouse', allDay: true, endDay: '2027-01-08' }, NY)
    expect(row).toMatchObject({ start_date: '2027-01-10', end_date: '2027-01-10', starts_at: null })
  })

  it('checks the form', () => {
    const f = toForm(null, NY, '2027-01-10')
    expect(formError(f)).toBe('appointments.errTitle')
    expect(formError({ ...f, title: 'x', until: '09:00' })).toBe('appointments.errTimes')
    expect(formError({ ...f, title: 'x', allDay: true, endDay: '2027-01-09' })).toBe('appointments.errEnd')
    expect(formError({ ...f, title: 'x' })).toBeNull()
  })

  it('works out who to add, take off and bring back', () => {
    const existing = [{ user_id: 'a', removed_at: null }, { user_id: 'b', removed_at: '2027-01-01' }, { user_id: 'c', removed_at: null }]
    expect(peopleChanges(existing, ['a', 'b', 'd'])).toEqual({ add: ['d'], revive: ['b'], remove: ['c'] })
  })

  it('sorts upcoming first and the past after', () => {
    const now = new Date('2027-01-10T12:00:00Z')
    const list = [
      { id: 'past', all_day: true, start_date: '2027-01-01', end_date: '2027-01-01' },
      { id: 'later', all_day: true, start_date: '2027-01-20', end_date: '2027-01-20' },
      { id: 'soon', all_day: false, starts_at: '2027-01-10T13:00:00Z', ends_at: '2027-01-10T14:00:00Z' },
    ]
    const { upcoming, past } = sortAppointments(list, 'UTC', now)
    expect(upcoming.map(a => a.id)).toEqual(['soon', 'later'])
    expect(past.map(a => a.id)).toEqual(['past'])
  })

  it('makes calendar items, leaving out removed ones', () => {
    const items = calendarItems([{ id: '1', title: 'Visit', kind: 'site_visit', all_day: true, start_date: '2027-01-10', end_date: '2027-01-10' },
      { id: '2', title: 'Gone', all_day: true, start_date: '2027-01-10', end_date: '2027-01-10', removed_at: 'x' }], () => 'UTC')
    expect(items).toEqual([{ id: '1', name: 'Visit', kind: 'site_visit', start_date: '2027-01-10', end_date: '2027-01-10' }])
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
  })
})

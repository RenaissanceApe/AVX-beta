import { describe, it, expect, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
import { leaveDays, leaveRange, awayByDay, monthBounds, isoWeekday, leaveError } from './leave'

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key)
const fmt = (d, p) => (p === 'd' ? String(d.getDate()) : `${d.getDate()} ${['Jan', 'Feb', 'Mar'][d.getMonth()] || d.getMonth() + 1}`)

describe('leave days', () => {
  it('counts working weekdays, as the database does', () => {
    // Mon 1 – Fri 5 March 2027
    expect(leaveDays({ from: '2027-03-01', to: '2027-03-05' })).toBe(5)
    // Over a weekend: Fri 5 – Mon 8
    expect(leaveDays({ from: '2027-03-05', to: '2027-03-08' })).toBe(2)
    // Four-day week
    expect(leaveDays({ from: '2027-03-01', to: '2027-03-05', week: [1, 2, 3, 4] })).toBe(4)
  })
  it('counts half days as 0.5', () => {
    expect(leaveDays({ from: '2027-03-08', to: '2027-03-08', endHalf: true })).toBe(0.5)
    expect(leaveDays({ from: '2027-03-01', to: '2027-03-05', startHalf: true, endHalf: true })).toBe(4)
  })
  it('leaves out national and organisation holidays', () => {
    // 25 April 2028 is a Tuesday (Freedom Day); Good Friday 2027 is 26 March
    expect(leaveDays({ from: '2028-04-24', to: '2028-04-28' })).toBe(4)
    expect(leaveDays({ from: '2027-03-22', to: '2027-03-26' })).toBe(4)
    expect(leaveDays({ from: '2027-06-14', to: '2027-06-14', holidays: [{ day: '2027-06-14' }] })).toBe(0)
  })
  it('counts every day for a freelancer', () => {
    expect(leaveDays({ from: '2027-07-01', to: '2027-07-14', org: false })).toBe(14)
    expect(leaveDays({ from: '' })).toBe(0)
  })
  it('knows ISO weekdays', () => {
    expect(isoWeekday('2027-03-01')).toBe(1)
    expect(isoWeekday('2027-03-07')).toBe(7)
  })
})

describe('leave range text', () => {
  it('reads like people say it', () => {
    expect(leaveRange({ start_date: '2027-03-01', end_date: '2027-03-01' }, t, fmt)).toBe('1 Mar')
    expect(leaveRange({ start_date: '2027-03-01', end_date: '2027-03-05' }, t, fmt)).toBe('1–5 Mar')
    expect(leaveRange({ start_date: '2027-02-26', end_date: '2027-03-02' }, t, fmt)).toBe('26 Feb – 2 Mar')
    expect(leaveRange({ start_date: '2027-03-08', end_date: '2027-03-08', end_half: true }, t, fmt)).toBe('8 Mar (leave.morning)')
    expect(leaveRange({ start_date: '2027-03-08', end_date: '2027-03-08', start_half: true }, t, fmt)).toBe('8 Mar (leave.afternoon)')
    expect(leaveRange({ start_date: '2027-03-01', end_date: '2027-03-05', start_half: true }, t, fmt)).toBe('1–5 Mar (leave.fromAfternoon)')
  })
})

describe('calendar', () => {
  it('lists who is away each day of the month, without refused or cancelled leave', () => {
    const days = awayByDay([
      { id: 'a', start_date: '2027-02-27', end_date: '2027-03-02', status: 'approved' },
      { id: 'b', start_date: '2027-03-02', end_date: '2027-03-02', status: 'requested' },
      { id: 'c', start_date: '2027-03-03', end_date: '2027-03-03', status: 'refused' },
      { id: 'd', start_date: '2027-03-30', end_date: '2027-04-04', status: 'approved' },
    ], '2027-03')
    expect(Object.keys(days)).toHaveLength(31)
    expect(days['2027-03-01'].map(e => e.id)).toEqual(['a'])
    expect(days['2027-03-02'].map(e => e.id)).toEqual(['a', 'b'])
    expect(days['2027-03-03']).toEqual([])
    expect(days['2027-03-31'].map(e => e.id)).toEqual(['d'])
  })
  it('knows a month\'s first and last day', () => {
    expect(monthBounds('2028-02')).toEqual(['2028-02-01', '2028-02-29'])
  })
})

describe('leave errors', () => {
  it('turns database rules into readable text', () => {
    expect(leaveError({ message: 'Leave can only be asked for from today' }, t)).toBe('leave.error.past')
    expect(leaveError({ message: 'Remove this leave and ask again to change it' }, t)).toBe('leave.error.locked')
    expect(leaveError({ message: 'A note is needed' }, t)).toBe('leave.error.note')
    expect(leaveError({ message: 'something else' }, t)).toBe(null)
  })
})

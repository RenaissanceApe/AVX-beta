import { describe, it, expect } from 'vitest'
import { crewTotals, notYetPaid, myWorkTiles, byCompany, byMonth, busiestMonths, functionsWorked, yearStatement, summaryCompanies, addDays, hoursAndMinutes } from './crewNumbers'

// The same gigs as supabase/tests/crew_numbers.sql, seen by Carla on 2026-11-08
const rows = [
  { gig_id: 'g1', org_id: 'a', org_name: 'Stage Co', start_date: '2026-10-19', end_date: '2026-10-20', function_title: 'Sound', days: 2,
    fee_total: 600, earned: 600, upcoming: null, finished: true, hours_approved: 0, hours_waiting: 0, overtime_hours: 0, km: 0, travel_minutes: 0, paid_on: '2026-11-07' },
  { gig_id: 'g2', org_id: 'a', org_name: 'Stage Co', start_date: '2026-11-18', end_date: '2026-11-18', function_title: 'sound ', days: 1,
    fee_total: 250, earned: null, upcoming: 250, finished: false, hours_approved: 0, hours_waiting: 0, overtime_hours: 0, km: 0, travel_minutes: 0, paid_on: null },
  { gig_id: 'gb', org_id: 'b', org_name: 'Other Co', start_date: '2026-10-24', end_date: '2026-10-24', function_title: 'Stagehand', days: 1,
    fee_total: null, earned: 200, upcoming: null, finished: true, hours_approved: 8, hours_waiting: 8, overtime_hours: 1, km: 30, travel_minutes: 60, paid_on: null },
  { gig_id: 'g3', org_id: 'a', org_name: 'Stage Co', start_date: '2026-11-02', end_date: '2026-11-03', function_title: '', days: 2,
    fee_total: 300, earned: 300, upcoming: null, finished: true, hours_approved: 20, hours_waiting: 0, overtime_hours: 0, km: 12.5, travel_minutes: 15, paid_on: null },
]

describe('crew numbers', () => {
  it('adds up the totals', () => {
    expect(crewTotals(rows)).toEqual({ gigs: 4, days: 6, hoursApproved: 28, hoursWaiting: 8, overtime: 1, earned: 1100, upcoming: 250, km: 42.5, travelMinutes: 75, paid: 600 })
    expect(crewTotals([])).toMatchObject({ gigs: 0, earned: 0 })
  })

  it('counts what is earned and not paid', () => {
    expect(notYetPaid(rows)).toEqual({ amount: 500, count: 2 })
  })

  it('works out the My work tiles', () => {
    expect(myWorkTiles(rows, '2026-11-08')).toEqual({ earnedThisMonth: 300, notYetPaid: { amount: 500, count: 2 }, nextDays: 1, nextDate: '2026-11-18' })
    expect(myWorkTiles(rows, '2026-12-25')).toMatchObject({ earnedThisMonth: 0, nextDays: 0, nextDate: null })
  })

  it('groups per company, month and function', () => {
    expect(byCompany(rows).map(c => [c.label, c.earned, c.gigs])).toEqual([['Stage Co', 900, 3], ['Other Co', 200, 1]])
    expect(byMonth(rows).map(m => [m.key, m.days])).toEqual([['2026-10', 3], ['2026-11', 3]])
    expect(busiestMonths(rows, 1).map(m => m.key)).toEqual(['2026-10'])
    // "Sound" and "sound " are one function; an empty one is left out
    expect(functionsWorked(rows).map(f => [f.label, f.gigs, f.days])).toEqual([['Sound', 2, 3], ['Stagehand', 1, 1]])
  })

  it('builds a year statement with every month', () => {
    const summary = [
      { org_id: 'a', org_name: 'Stage Co', month: '2026-10-01', gigs: 1, days: 2, hours_approved: 0, overtime_hours: 0, earned: 600, paid: 600, km: 0, reimbursements: 0 },
      { org_id: 'b', org_name: 'Other Co', month: '2026-10-01', gigs: 1, days: 1, hours_approved: 8, overtime_hours: 1, earned: 200, paid: 0, km: 30, reimbursements: 20 },
      { org_id: 'a', org_name: 'Stage Co', month: '2026-11-01', gigs: 2, days: 3, hours_approved: 20, overtime_hours: 0, earned: 300, paid: 0, km: 12.5, reimbursements: 0 },
    ]
    const s = yearStatement(summary, 2026, 'a')
    expect(s.months).toHaveLength(12)
    expect(s.months[0]).toMatchObject({ month: '2026-01', gigs: 0, earned: 0 })
    expect(s.months[9]).toMatchObject({ month: '2026-10', earned: 600, paid: 600 })
    expect(s.total).toEqual({ gigs: 3, days: 5, hours: 20, overtime: 0, earned: 900, paid: 600, km: 12.5, reimbursements: 0 })
    expect(yearStatement(summary, 2026).total.earned).toBe(1100)
    expect(summaryCompanies(summary)).toEqual([{ id: 'b', name: 'Other Co' }, { id: 'a', name: 'Stage Co' }])
  })

  it('has small date and time helpers', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(hoursAndMinutes(75)).toEqual({ h: 1, m: 15 })
  })
})

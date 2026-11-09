import { describe, expect, it } from 'vitest'
import {
  currenciesIn, sectionSum, cashByMonth, agedOverdue, monthsAhead, recurringList, spendingChanges, forecastOf, targetState, balancesOf,
} from './cash'

// The same fixture as supabase/tests/finance_cash.sql, as cash_report returns it on 15 Oct 2026
const rows = [
  { section: 'invoiced', month: '2026-09-01', group_key: '', currency: 'EUR', amount: 246, items: 1 },
  { section: 'invoiced', month: '2026-09-01', group_key: 'deposit', currency: 'EUR', amount: 369, items: 1 },
  { section: 'invoiced', month: '2026-09-01', group_key: '', currency: 'GBP', amount: 123, items: 1 },
  { section: 'credited', month: '2026-09-01', group_key: '', currency: 'EUR', amount: 123, items: 1 },
  { section: 'received', month: '2026-09-01', group_key: '', currency: 'EUR', amount: 599, items: 2 },
  { section: 'paid_out', month: '2026-09-01', group_key: '', currency: 'EUR', amount: 369, items: 2 },
  { section: 'overdue', month: null, group_key: '0_30', currency: 'EUR', amount: 123, items: 1 },
  { section: 'overdue', month: null, group_key: '31_60', currency: 'EUR', amount: 1000, items: 1 },
  { section: 'overdue', month: null, group_key: '90_plus', currency: 'EUR', amount: 615, items: 1 },
  { section: 'overdue', month: null, group_key: '0_30', currency: 'GBP', amount: 123, items: 1 },
  { section: 'expected_in', month: '2026-10-01', group_key: 'overdue', currency: 'EUR', amount: 1738, items: 3 },
  { section: 'expected_in', month: '2026-10-01', group_key: 'due', currency: 'EUR', amount: 246, items: 1 },
  { section: 'expected_in', month: '2026-11-01', group_key: 'due', currency: 'EUR', amount: 123, items: 1 },
  { section: 'expected_out', month: '2026-10-01', group_key: 'unpaid', currency: 'EUR', amount: 676.5, items: 2 },
  { section: 'expected_out', month: '2026-10-01', group_key: 'claims', currency: 'EUR', amount: 49.2, items: 1 },
  { section: 'expected_out', month: '2026-10-01', group_key: 'recurring', currency: 'EUR', amount: 123, items: 1 },
  { section: 'expected_out', month: '2026-11-01', group_key: 'unpaid', currency: 'EUR', amount: 123, items: 1 },
  { section: 'expected_out', month: '2026-11-01', group_key: 'recurring', currency: 'EUR', amount: 123, items: 1 },
  { section: 'expected_out', month: '2026-12-01', group_key: 'recurring', currency: 'EUR', amount: 123, items: 1 },
  { section: 'recurring', month: '2026-10-01', group_key: 'r1', label: 'Cloud storage', currency: 'EUR', amount: 123, items: 1 },
  { section: 'recurring', month: '2026-11-01', group_key: 'r1', label: 'Cloud storage', currency: 'EUR', amount: 123, items: 1 },
  { section: 'recurring', month: '2026-12-01', group_key: 'r1', label: 'Cloud storage', currency: 'EUR', amount: 123, items: 1 },
  { section: 'position', month: '2026-10-01', group_key: '', currency: 'EUR', amount: 1135.3, items: 0 },
  { section: 'position', month: '2026-11-01', group_key: '', currency: 'EUR', amount: -123, items: 0 },
  { section: 'position', month: '2026-12-01', group_key: '', currency: 'EUR', amount: -123, items: 0 },
]

describe('cash report helpers', () => {
  it('lists currencies, biggest first', () => {
    expect(currenciesIn(rows)).toEqual(['EUR', 'GBP'])
    expect(currenciesIn([])).toEqual([])
  })
  it('adds a section by month and group, one currency only', () => {
    expect(sectionSum(rows, 'invoiced', 'EUR', { month: '2026-09' })).toBe(615)
    expect(sectionSum(rows, 'invoiced', 'EUR', { month: '2026-09', group: 'deposit' })).toBe(369)
    expect(sectionSum(rows, 'invoiced', 'GBP')).toBe(123)
  })
  it('gives cash in and out per month', () => {
    const [sep, oct] = cashByMonth(rows, 'EUR', [{ key: '2026-09' }, { key: '2026-10' }])
    expect(sep).toEqual({ key: '2026-09', invoiced: 615, deposits: 369, credited: 123, received: 599, paidOut: 369 })
    expect(oct.invoiced).toBe(0)
  })
  it('ages overdue invoices', () => {
    expect(agedOverdue(rows, 'EUR')).toEqual({ '0_30': 123, '31_60': 1000, '61_90': 0, '90_plus': 615, total: 1738, count: 3 })
    expect(agedOverdue(rows, 'GBP').total).toBe(123)
  })
  it('gives the months ahead from today, with the position', () => {
    const ahead = monthsAhead(rows, 'EUR', '2026-10-15')
    expect(ahead.map(m => m.key)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(ahead[0]).toMatchObject({ in: 1984, inOverdue: 1738, out: 848.7, unpaid: 676.5, claims: 49.2, recurring: 123, position: 1135.3 })
    expect(ahead[2]).toMatchObject({ in: 0, out: 123, position: -123 })
    expect(monthsAhead(rows, 'EUR', '2026-12-31', 2).map(m => m.key)).toEqual(['2026-12', '2027-01'])
    // K8: crew fees to pay with no invoice yet are their own part of what goes out
    const withCrew = [...rows, { section: 'expected_out', month: '2026-10-01', group_key: 'crew', currency: 'EUR', amount: 400, items: 1 }]
    expect(monthsAhead(withCrew, 'EUR', '2026-10-15')[0]).toMatchObject({ crew: 400, out: 1248.7 })
    expect(ahead[0].crew).toBe(0)
  })
  it('lists recurring costs once each', () => {
    expect(recurringList(rows, 'EUR')).toEqual([{ id: 'r1', label: 'Cloud storage', amount: 369, dates: 3 }])
  })
  it('orders spending changes by their size', () => {
    const now = [{ group_key: 'rent', amount: 500, currency: 'EUR' }, { group_key: 'soft', amount: 200, currency: 'EUR' }, { group_key: 'x', amount: 9, currency: 'GBP' }]
    const before = [{ group_key: 'rent', amount: 450, currency: 'EUR' }, { group_key: 'hire', amount: 300, currency: 'EUR' }]
    const c = spendingChanges(now, before, 'EUR')
    expect(c.map(x => x.id)).toEqual(['hire', 'soft', 'rent'])
    expect(c[0]).toMatchObject({ now: 0, before: 300, diff: -300, change: -1 })
    expect(c[1]).toMatchObject({ now: 200, before: 0, diff: 200, change: null })
  })
  it('sums the forecast and keeps the win rate apart', () => {
    const f = forecastOf([
      { month: '2026-11-01', currency: 'EUR', confirmed: 1000, waiting: 500, waiting_quotes: 2, win_rate_count: 0.75, win_rate_value: 0.9565 },
      { month: '2026-12-01', currency: 'EUR', confirmed: 500, waiting: 0, waiting_quotes: 0, win_rate_count: 0.75, win_rate_value: 0.9565 },
    ], 'EUR')
    expect(f).toMatchObject({ confirmed: 1500, waiting: 500, quotes: 2, winCount: 0.75, winValue: 0.9565 })
    expect(forecastOf([{ month: '2026-11-01', currency: 'EUR', confirmed: 1, waiting: 0, waiting_quotes: 0, win_rate_count: null }], 'EUR').winCount).toBe(null)
  })
  it('works out a target\'s progress', () => {
    expect(targetState({ kind: 'budget', target: 400, actual: 500 })).toMatchObject({ share: 1.25, over: true, left: -100 })
    expect(targetState({ kind: 'revenue', target: 1000, actual: 1200 })).toMatchObject({ over: false })
    expect(targetState({ kind: 'budget', target: 0, actual: 5 }).share).toBe(null)
  })
  it('keeps client balances of one currency', () => {
    const b = balancesOf([{ client_key: 'a', currency: 'EUR', invoiced: 10, balance: 5 }, { client_key: 'b', currency: 'GBP', invoiced: 1, balance: 1 },
      { client_key: 'c', currency: 'EUR', invoiced: 0, balance: 0 }], 'EUR')
    expect(b.map(r => r.id)).toEqual(['a'])
  })
})

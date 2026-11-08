import { describe, expect, it } from 'vitest'
import { needsFollowUp, dayIn, ageBuckets, waitingTotals, currenciesBy, winTotals, topClients, clientMix, clientRows } from './sales'

// The same quotes as supabase/tests/sales_clients.sql, on 15 October 2026
const today = '2026-10-15'

describe('needsFollowUp (twin of sales_waiting.follow_up)', () => {
  it('flags a sent quote 7 or more days old that is still valid', () => {
    expect(needsFollowUp({ status: 'sent', sent_at: '2026-10-01T09:00:00Z', valid_until: '2026-10-20' }, today)).toBe(true) // Q6
    expect(needsFollowUp({ status: 'sent', sent_at: '2026-10-08T09:00:00Z' }, today)).toBe(true) // exactly 7 days
    expect(needsFollowUp({ status: 'sent', sent_at: '2026-10-12T10:00:00Z' }, today)).toBe(false) // Q7, 3 days
    expect(needsFollowUp({ status: 'sent', sent_at: '2026-10-12T10:00:00Z' }, today, { days: 3 })).toBe(true)
  })
  it('leaves out expired, decided and draft quotes', () => {
    expect(needsFollowUp({ status: 'sent', sent_at: '2026-09-01T10:00:00Z', valid_until: '2026-10-01' }, today)).toBe(false) // Q5
    expect(needsFollowUp({ status: 'accepted', sent_at: '2026-09-01T10:00:00Z' }, today)).toBe(false)
    expect(needsFollowUp({ status: 'draft', issue_date: '2026-09-01' }, today)).toBe(false)
  })
  it('a quote valid until today still counts; falls back to the issue date', () => {
    expect(needsFollowUp({ status: 'sent', sent_at: '2026-10-01T09:00:00Z', valid_until: today }, today)).toBe(true)
    expect(needsFollowUp({ status: 'sent', issue_date: '2026-10-01' }, today)).toBe(true)
  })
  it('uses the sent day in the organisation\'s time zone', () => {
    // 7 Oct 23:30 UTC is 8 Oct in Lisbon: 7 days on 15 Oct there
    expect(dayIn('2026-10-07T23:30:00Z', 'Europe/Lisbon')).toBe('2026-10-08')
    expect(needsFollowUp({ status: 'sent', sent_at: '2026-10-08T23:30:00Z' }, today, { sentDay: dayIn('2026-10-08T23:30:00Z', 'Europe/Lisbon') })).toBe(false)
  })
})

const waiting = [
  { quote_id: 'q5', currency: 'EUR', value: 700, days_waiting: 44, expired: true, follow_up: false },
  { quote_id: 'q6', currency: 'EUR', value: 400, days_waiting: 14, opened: true, expiring: true, follow_up: true },
  { quote_id: 'q7', currency: 'EUR', value: 100, days_waiting: 3 },
  { quote_id: 'g1', currency: 'GBP', value: 50, days_waiting: 40, follow_up: true },
]

describe('waiting quotes', () => {
  it('buckets by age in one currency, expired ones apart', () => {
    expect(ageBuckets(waiting, 'EUR')).toEqual([
      { key: '0_7', count: 1, value: 100 }, { key: '8_14', count: 1, value: 400 },
      { key: '15_30', count: 0, value: 0 }, { key: '30_plus', count: 0, value: 0 }])
  })
  it('totals', () => {
    expect(waitingTotals(waiting, 'EUR')).toEqual({ waiting: 2, value: 500, opened: 1, expiring: 1, followUp: 1, followUpValue: 400, expired: 1, expiredValue: 700 })
  })
  it('currencies by value', () => {
    expect(currenciesBy(waiting)).toEqual(['EUR', 'GBP'])
  })
})

describe('winTotals', () => {
  const rows = [
    { currency: 'EUR', decided: 4, accepted: 2, declined: 2, value_accepted: 1200, value_declined: 700, gross_accepted: 1300, discount_accepted: 100 },
    { currency: 'USD', decided: 2, accepted: 2, declined: 0, value_accepted: 50, value_declined: 0, gross_accepted: 50, discount_accepted: 0 },
  ]
  it('counts across currencies, money in one', () => {
    const t = winTotals(rows, 'EUR')
    expect(t.decided).toBe(6)
    expect(t.byCount).toBeCloseTo(4 / 6)
    expect(t.byValue).toBeCloseTo(1200 / 1900)
    expect(t.discount).toBe(100)
    expect(t.discountPct).toBeCloseTo(100 / 1300)
  })
  it('nothing decided → no rate', () => {
    expect(winTotals([], 'EUR').byCount).toBeNull()
    expect(winTotals([], 'EUR').byValue).toBeNull()
  })
})

describe('clients', () => {
  const rows = [
    { client_key: 'a', currency: 'EUR', revenue: 900, gigs: 2, is_returning: true },
    { client_key: 'b', currency: 'EUR', revenue: 300, gigs: 1, is_new: true },
    { client_key: 'b', currency: 'USD', revenue: 10, gigs: 1, is_new: true },
    { client_key: 'name:gamma ltd', currency: 'EUR', revenue: 0, gigs: 0 },
    { client_key: '', currency: 'EUR', revenue: 300, gigs: 0 },
  ]
  it('top clients and their share, the no-client row in the total only', () => {
    const t = topClients(rows, 'EUR', 1)
    expect(t.top.map(r => r.client_key)).toEqual(['a'])
    expect(t.amount).toBe(900)
    expect(t.total).toBe(1500)
    expect(t.share).toBeCloseTo(0.6)
  })
  it('new and returning, each client once', () => {
    expect(clientMix(rows)).toEqual({ new: 1, returning: 1, withGigs: 2 })
  })
  it('rows of one currency, real clients only', () => {
    expect(clientRows(rows, 'EUR').map(r => r.client_key)).toEqual(['a', 'b', 'name:gamma ltd'])
  })
})

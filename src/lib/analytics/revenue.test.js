import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import fixtures from './fixtures.json'
import { reportRevenueLines, quoteReportDate, totalsByCurrency, groupRevenue, gigRevenue } from './revenue'

describe('the revenue rule (shared fixtures)', () => {
  for (const c of fixtures.cases) {
    it(`counts ${c.from} to ${c.until}`, () => {
      const rows = reportRevenueLines({ quotes: fixtures.quotes, gigs: fixtures.gigs, from: c.from, until: c.until })
      expect(rows).toHaveLength(c.expect.lines)
      expect(totalsByCurrency(rows)).toEqual(c.expect.totals)
      for (const [line, amount] of Object.entries(c.expect.amounts)) expect(rows.find(r => r.line_id === line)?.amount).toBe(amount)
      for (const [quote, date] of Object.entries(c.expect.dates)) {
        expect(rows.filter(r => r.quote_id === quote).every(r => r.report_date === date)).toBe(true)
      }
      for (const [line, date] of Object.entries(c.expect.phase_start || {})) expect(rows.find(r => r.line_id === line)?.phase_start).toBe(date)
    })
  }

  it('is copied verbatim into the database test', () => {
    const sql = readFileSync(new URL('../../../supabase/tests/reports_k1.sql', import.meta.url), 'utf8')
    const m = /\$fixtures\$([\s\S]*?)\$fixtures\$/.exec(sql)
    expect(m).not.toBe(null)
    expect(JSON.parse(m[1])).toEqual(fixtures)
  })
})

describe('revenue helpers', () => {
  it('dates a quote by its gig, else its first dated phase, else its issue date', () => {
    const body = { phases: [{ optional: true, start_date: '2026-01-01' }, { start_date: '2026-03-02' }, { start_date: '2026-02-10' }] }
    expect(quoteReportDate({ body, issue_date: '2025-12-01' }, { start_date: '2026-05-05' })).toBe('2026-05-05')
    expect(quoteReportDate({ body, issue_date: '2025-12-01' }, { start_date: null })).toBe('2026-02-10')
    expect(quoteReportDate({ body: { phases: [] }, issue_date: '2025-12-01' })).toBe('2025-12-01')
  })

  it('groups per key and currency, biggest first', () => {
    const rows = [
      { quote_id: 'a', kind: 'rental', currency: 'EUR', amount: 10 },
      { quote_id: 'b', kind: 'rental', currency: 'EUR', amount: 5 },
      { quote_id: 'a', kind: 'crew', currency: 'EUR', amount: 30 },
      { quote_id: 'c', kind: 'rental', currency: 'USD', amount: 1 },
    ]
    expect(groupRevenue(rows, r => [r.kind, r.kind])).toEqual([
      { key: 'crew', label: 'crew', currency: 'EUR', amount: 30, lines: 1, quotes: 1 },
      { key: 'rental', label: 'rental', currency: 'EUR', amount: 15, lines: 2, quotes: 2 },
      { key: 'rental', label: 'rental', currency: 'USD', amount: 1, lines: 1, quotes: 1 },
    ])
  })

  it('counts every accepted quote of a gig, else the newest sent one as an estimate', () => {
    const body = { phases: [{ id: 'p', discount_pct: 50, sections: [{ id: 's', lines: [
      { id: 'a', kind: 'crew', qty: 1, factor: 2, unit_price: 300 },
      { id: 'b', kind: 'rental', qty: 1, factor: 1, unit_price: 500 },
    ] }] }] }
    const accepted = { id: 'yes', status: 'accepted', body, discount_pct: 10 }
    const second = { id: 'also', status: 'accepted', body, discount_pct: 0 }
    const sentOld = { id: 'old', status: 'sent', body, discount_pct: 0, sent_at: '2026-01-01' }
    const sentNew = { id: 'new', status: 'sent', body, discount_pct: 20, sent_at: '2026-02-01' }
    const draft = { id: 'draft', status: 'draft', body, discount_pct: 0 }
    expect(gigRevenue([accepted, second, sentOld], { kinds: ['crew'] })).toMatchObject({ estimate: false, revenue: 570 })
    expect(gigRevenue([sentOld, sentNew, draft], { kinds: ['crew'] })).toMatchObject({ estimate: true, revenue: 240, quotes: [{ id: 'new' }] })
    expect(gigRevenue([draft, { ...accepted, status: 'declined' }])).toBe(null)
    expect(gigRevenue([{ ...accepted, currency: 'USD' }], { currency: 'EUR' })).toBe(null)
  })
})

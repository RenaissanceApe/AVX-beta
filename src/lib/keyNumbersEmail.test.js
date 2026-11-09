import { describe, it, expect } from 'vitest'
import { renderKeyNumbersEmail, keyNumberLines, moneyText, weekStart } from '../../supabase/functions/_shared/key-numbers-email.ts'

const NUMBERS = {
  gigs_this_month: { total: 4, confirmed: 3 },
  revenue_this_month: { EUR: 1200.5, USD: 300 },
  revenue_next_30: {},
  waiting: { count: 1, totals: { EUR: 900 } },
  follow_up: { count: 2 },
  overdue_now: { EUR: 50 }, overdue_count: 3,
  crew_to_pay: { EUR: 400 },
  open_positions_14: 5,
}
const OPTS = { lang: 'en', orgName: 'Show <Co>', orgId: 'org-1', appUrl: 'https://app.test', week: '2026-11-02' }

describe('weekly key-numbers email', () => {
  it('starts weeks on Monday (UTC)', () => {
    expect(weekStart(new Date('2026-11-09T07:41:00Z'))).toBe('2026-11-09') // a Monday
    expect(weekStart(new Date('2026-11-08T23:00:00Z'))).toBe('2026-11-02') // a Sunday
    expect(weekStart(new Date('2026-11-04T12:00:00Z'))).toBe('2026-11-02')
  })

  it('never adds currencies and shows a zero when there is nothing', () => {
    expect(moneyText({ EUR: 1200.5, USD: 300 }, 'en')).toBe('€1,200.50 · US$300.00')
    expect(moneyText({}, 'en')).toBe('€0.00')
    expect(moneyText({ EUR: 5 }, 'pt')).toMatch(/5,00\s€/)
  })

  it('lists the numbers with counts and links', () => {
    const lines = keyNumberLines(NUMBERS, 'en')
    const by = Object.fromEntries(lines.map(l => [l.key, l]))
    expect(by.gigsThisMonth.value).toBe('4')
    expect(by.waitingQuotes.extra).toBe('1 quote')
    expect(by.overdueNow.extra).toBe('3 invoices')
    expect(by.itemsShort30.value).toBe('0')
    expect(by.followUp.path).toBe('/quotes?status=follow_up')
    expect(lines.every(l => l.label)).toBe(true)
    expect(keyNumberLines(NUMBERS, 'pt').map(l => l.key)).toEqual(lines.map(l => l.key))
  })

  it('escapes the organisation name and links to its reports', () => {
    const { subject, html, text } = renderKeyNumbersEmail(NUMBERS, OPTS)
    expect(subject).toBe('Show <Co>: key numbers for the week of 2 November 2026')
    expect(html).toContain('Show &lt;Co&gt;')
    expect(html).not.toContain('Show <Co>')
    expect(html).toContain('https://app.test/org/org-1/reports')
    expect(text).toContain('Revenue this month: €1,200.50 · US$300.00')
    expect(renderKeyNumbersEmail(NUMBERS, { ...OPTS, lang: 'pt' }).subject).toContain('números-chave')
  })
})

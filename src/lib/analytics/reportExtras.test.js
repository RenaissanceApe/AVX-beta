import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase', () => ({ supabase: {} }))

const { viewQuery, viewHref, viewParams, cleanViewName, sortViews } = await import('./reportViews')
const { linkPeriod, linkStatus, reportLinkUrl, linkMonths, linkTables } = await import('./reportLinks')
const { packMonths, packRange, packSections, packFileName } = await import('./managementPack')

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key)

describe('saved views', () => {
  it('saves the filters without the tab or empty values', () => {
    expect(viewQuery(new URLSearchParams('tab=money&view=cash&period=this_year&client='))).toBe('view=cash&period=this_year')
    expect(viewQuery('tab=sales')).toBe('')
    expect(viewQuery(new URLSearchParams({ tab: 'money', q: 'a b#c' }))).toBe('q=a+b%23c') // no spaces or # (the table refuses them)
  })

  it('opens where it was saved', () => {
    expect(viewHref('o1', { tab: 'money', query: 'view=cash' })).toBe('/org/o1/reports?tab=money&view=cash')
    expect(viewHref('o1', { tab: 'sales', query: '' })).toBe('/org/o1/reports?tab=sales')
    expect(viewParams({ tab: 'money', query: 'view=cash' }).toString()).toBe('view=cash&tab=money')
  })

  it('cleans names and lists pinned views first', () => {
    expect(cleanViewName('  Cash   this year ')).toBe('Cash this year')
    expect(cleanViewName('x'.repeat(100))).toHaveLength(80)
    const sorted = sortViews([{ name: 'B', pinned: false }, { name: 'C', pinned: true }, { name: 'A', pinned: true }])
    expect(sorted.map(v => v.name)).toEqual(['A', 'C', 'B'])
  })
})

describe('accountant links', () => {
  it('works out the period from today', () => {
    expect(linkPeriod('last_year', '2026-11-08')).toEqual({ from: '2025-01-01', until: '2026-01-01' })
    expect(linkPeriod('this_year', '2026-11-08')).toEqual({ from: '2026-01-01', until: '2027-01-01' })
    expect(linkPeriod('last_12_months', '2026-11-08')).toEqual({ from: '2025-12-01', until: '2026-12-01' })
  })

  it('knows when a link is active, expired or revoked', () => {
    const now = new Date('2026-11-08T12:00:00Z')
    expect(linkStatus({ expires_at: '2026-11-09T00:00:00Z' }, now)).toBe('active')
    expect(linkStatus({ expires_at: '2026-11-08T11:00:00Z' }, now)).toBe('expired')
    expect(linkStatus({ expires_at: '2026-12-01T00:00:00Z', revoked_at: '2026-11-01T00:00:00Z' }, now)).toBe('revoked')
    expect(reportLinkUrl('abc', 'https://app.test')).toBe('https://app.test/r/abc')
  })

  it('lays the answer out by currency, with every month of the period', () => {
    expect(linkMonths('2026-01-01', '2026-04-01')).toEqual(['2026-01', '2026-02', '2026-03'])
    const tables = linkTables({
      from: '2026-01-01', until: '2026-03-01',
      months: [{ month: '2026-02', currency: 'EUR', revenue: 1000, direct_costs: 400, gross_margin: 600, operating_result: 500, estimated: 50 }],
      total: [{ currency: 'EUR', revenue: 1000 }],
      cash: [
        { section: 'invoiced', month: '2026-02-01', currency: 'EUR', amount: 1230 },
        { section: 'received', month: '2026-02-01', currency: 'EUR', amount: 600 },
        { section: 'received', month: '2026-01-01', currency: 'USD', amount: 10 },
      ],
      spending: [{ category: 'Rent', currency: 'EUR', amount: 300 }],
    })
    expect(tables.map(tb => tb.currency)).toEqual(['EUR', 'USD'])
    const eur = tables[0]
    expect(eur.months.map(m => m.month)).toEqual(['2026-01', '2026-02'])
    expect(eur.months[0]).toMatchObject({ revenue: 0, invoiced: 0 })
    expect(eur.months[1]).toMatchObject({ revenue: 1000, gross_margin: 600, invoiced: 1230, received: 600, estimated: 50 })
    expect(eur.total.revenue).toBe(1000)
    expect(eur.spending).toHaveLength(1)
    expect(tables[1].months[0].received).toBe(10)
    expect(tables[1].total).toBe(null)
    expect(linkTables(null)).toEqual([])
  })
})

describe('management pack', () => {
  it('offers the whole months before this one', () => {
    expect(packMonths('2026-01-15', 3)).toEqual(['2025-12', '2025-11', '2025-10'])
    expect(packRange('2026-02')).toEqual({ from: '2026-02-01', until: '2026-03-01' })
  })

  it('builds its sections from the report answers', () => {
    const sections = packSections({
      overview: { gigs_this_month: { total: 3 }, revenue_this_month: { EUR: 100 } },
      money: [{ currency: 'EUR', revenue: 1000, direct_costs: 300, gross_margin: 700, margin_pct: 70, overheads: 100, depreciation: 50, operating_result: 550, estimated: 0 }],
      moneyPrev: [{ currency: 'EUR', revenue: 500, margin_pct: null }],
      sales: [{ currency: 'EUR', decided: 4, accepted: 3, declined: 1, win_rate_count: 0.75, win_rate_value: 0.5, value_accepted: 900 }],
      clients: [{ client_name: 'B', revenue: 100, currency: 'EUR', gigs: 1 }, { client_name: 'A', revenue: 900, currency: 'EUR', gigs: 2 }, { client_name: 'Z', revenue: 0, currency: 'EUR' }],
      equipment: Array.from({ length: 10 }, (_, i) => ({ name: `Item ${i}`, revenue: 10 * i, profit: i - 3 })),
    }, { t, lang: 'en' })
    expect(sections.map(s => s.title)).toEqual(['reports.pack.keyNumbers', 'reports.pack.money', 'reports.pack.sales', 'reports.pack.topClients', 'reports.pack.equipment'])
    expect(sections[0].body.find(r => r[0] === 'reports.tile.gigsThisMonth')[1]).toBe('3')
    const money = sections[1].body
    expect(money[0]).toEqual(['reports.pack.row.revenue (EUR)', '€1,000.00', '€500.00'])
    expect(money.find(r => r[0].startsWith('reports.pack.row.margin_pct'))).toEqual(['reports.pack.row.margin_pct (EUR)', '70%', '—'])
    expect(money.some(r => r[0].startsWith('reports.pack.row.estimated'))).toBe(false) // nothing estimated: no row
    expect(sections[2].body[1][1]).toBe('75%')
    expect(sections[3].body.map(r => r[0])).toEqual(['A', 'B']) // biggest first, no zero rows
    const items = sections[4].body.map(r => r[0])
    expect(items.slice(0, 5)).toEqual(['Item 9', 'Item 8', 'Item 7', 'Item 6', 'Item 5'])
    expect(items.slice(5)).toEqual(['Item 2', 'Item 1', 'Item 0']) // the three worst
    sections.forEach(s => s.body.forEach(r => expect(r).toHaveLength(s.head.length)))
  })

  it('says so when a month has nothing', () => {
    const sections = packSections({ overview: {}, money: [], moneyPrev: [], sales: [], clients: [], equipment: [] }, { t, lang: 'pt' })
    sections.slice(1).forEach(s => expect(s.body[0][0]).toBe('reports.pack.nothing'))
    expect(packFileName('Lúmen & Pixel', '2026-10')).toBe('Lumen Pixel 2026-10.pdf')
  })
})

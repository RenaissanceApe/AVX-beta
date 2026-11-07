import { describe, it, expect } from 'vitest'
import { emptyRow, currenciesOf, rowFor, share, statementLines, estimates, labourVariance, groupName, expensesLink } from './money'

// November of supabase/tests/finance_results.sql, as public.finance_results returns it
const nov = {
  ...emptyRow('EUR'), revenue: 430, revenue_rental: 100, revenue_sale: 230, revenue_transport: 60, revenue_other: 40,
  labour: 480, labour_estimated: 200, labour_planned: 500, labour_actual: 280, days_planned: 4, hours_planned: 40, hours_actual: 8,
  subrentals: 300, repairs: 50, gig_expenses: 100, other_direct: 545, cogs: 60, cogs_missing: 1, direct_costs: 1535,
  gross_margin: -1105, margin_pct: -257, overheads: 1070, depreciation: 340, depreciation_estimated: 30, operating_result: -2515,
  estimated: 230, gigs: 2, gigs_negative: 2, gigs_without_accepted: 1,
  overheads_by_category: [{ category_id: 'c1', name: 'Rent', amount: 1000 }, { category_id: 'c2', name: 'Software', amount: 50 }, { category_id: 'c3', name: 'Fees', amount: 20 }],
}
const usd = { ...emptyRow('USD'), revenue: 200, revenue_rental: 200, gross_margin: 200, overheads: 10, operating_result: 190 }
const t = (k, v) => (v ? `${k} ${JSON.stringify(v)}` : k)

describe('money rows', () => {
  it('orders currencies by size, euros first on a tie', () => {
    expect(currenciesOf([usd, nov])).toEqual(['EUR', 'USD'])
    expect(currenciesOf([{ currency: 'USD', revenue: 5 }, { currency: 'EUR', revenue: 5 }])).toEqual(['EUR', 'USD'])
    expect(currenciesOf([])).toEqual([])
  })
  it('gives a zero row for a currency with nothing', () => {
    expect(rowFor([nov], 'EUR')).toBe(nov)
    expect(rowFor([nov], 'GBP')).toMatchObject({ currency: 'GBP', revenue: 0, operating_result: 0, margin_pct: null })
  })
  it('works out shares, and none without a whole', () => {
    expect(share(200, 480)).toBeCloseTo(0.4167, 3)
    expect(share(5, 0)).toBeNull()
  })
})

describe('the statement', () => {
  it('is short by default and adds up from revenue to the operating result', () => {
    const lines = statementLines(nov)
    expect(lines.map(l => l.key)).toEqual(['revenue', 'directCosts', 'grossMargin', 'overheads', 'depreciation', 'operatingResult'])
    const sum = lines.filter(l => !['grossMargin', 'operatingResult'].includes(l.key)).reduce((s, l) => s + l.value, 0)
    expect(sum).toBe(nov.operating_result)
    expect(lines.find(l => l.key === 'directCosts').estimate).toBe(true)
    expect(lines.find(l => l.key === 'depreciation').estimate).toBe(true)
  })
  it('adds the kinds, each cost and the overhead categories in details', () => {
    const lines = statementLines(nov, { details: true })
    expect(lines.filter(l => l.key.startsWith('kind.')).map(l => l.key)).toEqual(['kind.rental', 'kind.sale', 'kind.transport', 'kind.other'])
    const costs = lines.filter(l => l.level === 1 && !l.key.startsWith('kind.') && l.key !== 'category')
    expect(costs.reduce((s, l) => s + l.value, 0)).toBe(-nov.direct_costs)
    expect(lines.filter(l => l.key === 'category').map(l => l.value)).toEqual([-1000, -50, -20])
  })
})

describe('estimates and labour', () => {
  it('says what part is estimated', () => {
    const e = estimates(nov)
    expect(e).toMatchObject({ labour: 200, depreciation: 30, cogsMissing: 1, withoutAccepted: 1, any: true })
    expect(e.labourShare).toBeCloseTo(0.4167, 3)
    expect(estimates(usd).any).toBe(false)
  })
  it('compares planned with actual labour', () => {
    expect(labourVariance(nov)).toEqual({ hoursPlanned: 40, hoursActual: 8, hours: -32, planned: 500, counted: 480, actual: 280, money: -20 })
    expect(labourVariance(emptyRow()).actual).toBeNull()
  })
})

describe('labels and links', () => {
  const labels = { types: [{ id: 'ty', name: 'Concert' }], statuses: [{ id: 'st', name: 'Pencilled' }] }
  it('names each kind of group', () => {
    expect(groupName({ group_key: null }, 'client', { t })).toBe('money.none.client')
    expect(groupName({ group_key: 'sale' }, 'kind', { t })).toBe('lineKind.sale')
    expect(groupName({ group_key: 'base:confirmed' }, 'status', { t })).toBe('status.confirmed')
    expect(groupName({ group_key: 'own:st' }, 'status', { t, labels })).toBe('Pencilled')
    expect(groupName({ group_key: 'ty', group_label: 'Old' }, 'gig_type', { t, labels })).toBe('Concert')
    expect(groupName({ group_key: 'u1', group_label: '' }, 'pm', { t })).toBe('money.unnamed')
    expect(groupName({ group_key: '2026-11', group_label: null }, 'month', { t })).toBe('2026-11')
  })
  it('opens a category in Expenses for the period\'s first month', () => {
    expect(expensesLink('o1', { from: '2026-10-01', until: '2027-01-01' }, 'c1')).toBe('/org/o1/expenses?month=2026-10&category=c1')
  })
})

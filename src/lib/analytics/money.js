// Reports → Money (K2, docs/ANALYTICS.md). Every figure comes from public.finance_results, which
// counts in the database; these helpers only pick, order and label its rows for the screen.
// One row per group and currency: money is never added across currencies.

export const MONEY_VIEWS = ['results', 'margins', 'labour']
export const MARGIN_GROUPS = ['gig_type', 'status', 'client', 'kind', 'pm', 'month', 'quarter']
export const LABOUR_GROUPS = ['gig', 'month']
export const KINDS = ['rental', 'sale', 'crew', 'transport', 'other']

const NUMBERS = ['revenue', 'revenue_rental', 'revenue_sale', 'revenue_crew', 'revenue_transport', 'revenue_other',
  'labour', 'labour_estimated', 'labour_planned', 'days_planned', 'hours_planned', 'hours_actual',
  'subrentals', 'repairs', 'gig_expenses', 'other_direct', 'cogs', 'cogs_missing', 'direct_costs', 'gross_margin',
  'overheads', 'depreciation', 'depreciation_estimated', 'operating_result', 'estimated', 'gigs', 'gigs_negative',
  'gigs_without_accepted']

// A row with every figure at zero, for a currency or period that has nothing
export function emptyRow(currency = 'EUR') {
  const row = { group_key: 'total', group_label: null, currency, margin_pct: null, labour_actual: null, overheads_by_category: [] }
  for (const k of NUMBERS) row[k] = 0
  return row
}

const num = v => Number(v) || 0

// The currencies in the rows, the one with most revenue first (euros first on a tie, as costs
// such as labour are always in euros)
export function currenciesOf(rows) {
  const by = new Map()
  for (const r of rows || []) by.set(r.currency, (by.get(r.currency) || 0) + Math.abs(num(r.revenue)) + Math.abs(num(r.direct_costs)))
  return [...by.entries()].sort((a, b) => b[1] - a[1] || (a[0] === 'EUR' ? -1 : b[0] === 'EUR' ? 1 : a[0].localeCompare(b[0])))
    .map(([c]) => c)
}

// The one row of a currency (from a 'total' call), or a zero row
export function rowFor(rows, currency) {
  return (rows || []).find(r => r.currency === currency) || emptyRow(currency)
}

// Part of a whole as a fraction (0.25), or null when there's no whole
export function share(part, whole) {
  const w = num(whole)
  return w === 0 ? null : num(part) / Math.abs(w)
}

// The results statement, simple first: { key, value, level (0 = total, 1 = part), estimate?, sign }
// "details" adds revenue by kind, each direct cost and the overheads by category.
export function statementLines(row, { details = false } = {}) {
  const r = row || emptyRow()
  const out = [{ key: 'revenue', value: num(r.revenue), level: 0 }]
  if (details) for (const k of KINDS) if (num(r[`revenue_${k}`])) out.push({ key: `kind.${k}`, value: num(r[`revenue_${k}`]), level: 1 })
  out.push({ key: 'directCosts', value: -num(r.direct_costs), level: 0, estimate: num(r.labour_estimated) > 0 })
  if (details) {
    for (const k of ['labour', 'subrentals', 'repairs', 'gig_expenses', 'other_direct', 'cogs']) {
      if (num(r[k])) out.push({ key: k, value: -num(r[k]), level: 1, estimate: k === 'labour' && num(r.labour_estimated) > 0 })
    }
  }
  out.push({ key: 'grossMargin', value: num(r.gross_margin), level: 0, strong: true, pct: r.margin_pct })
  out.push({ key: 'overheads', value: -num(r.overheads), level: 0 })
  if (details) {
    for (const c of r.overheads_by_category || []) out.push({ key: 'category', category: c, value: -num(c.amount), level: 1 })
  }
  out.push({ key: 'depreciation', value: -num(r.depreciation), level: 0, estimate: num(r.depreciation_estimated) > 0 })
  out.push({ key: 'operatingResult', value: num(r.operating_result), level: 0, strong: true })
  return out
}

// What is estimated, as parts of their totals: labour from the rate card, depreciation of units
// with no purchase cost, sale lines whose item has no cost price
export function estimates(row) {
  const r = row || emptyRow()
  return {
    labour: num(r.labour_estimated), labourShare: share(r.labour_estimated, r.labour),
    depreciation: num(r.depreciation_estimated), depreciationShare: share(r.depreciation_estimated, r.depreciation),
    cogsMissing: num(r.cogs_missing), withoutAccepted: num(r.gigs_without_accepted),
    any: num(r.estimated) > 0 || num(r.cogs_missing) > 0,
  }
}

// Planned against actual labour: hours (approved − planned) and money (counted − planned)
export function labourVariance(row) {
  const r = row || emptyRow()
  return {
    hoursPlanned: num(r.hours_planned), hoursActual: num(r.hours_actual), hours: num(r.hours_actual) - num(r.hours_planned),
    planned: num(r.labour_planned), counted: num(r.labour), actual: r.labour_actual == null ? null : num(r.labour_actual),
    money: Math.round((num(r.labour) - num(r.labour_planned)) * 100) / 100,
  }
}

// The name of a group's row. labels: { types, statuses } from useGigLabels; t from useI18n
export function groupName(row, group, { t, labels = {} }) {
  const k = row.group_key
  if (k == null) return t(`money.none.${group}`)
  if (group === 'kind') return t(`lineKind.${k}`)
  if (group === 'status') {
    if (k.startsWith('base:')) return t(`status.${k.slice(5)}`)
    return (labels.statuses || []).find(s => `own:${s.id}` === k)?.name || row.group_label || k
  }
  if (group === 'gig_type') return (labels.types || []).find(x => x.id === k)?.name || row.group_label || k
  if (group === 'pm') return row.group_label || t('money.unnamed')
  return row.group_label || k
}

// Expenses → that month's list filtered to a category: the period's first month
export function expensesLink(orgId, range, categoryId) {
  const month = (range?.from || '').slice(0, 7)
  const q = new URLSearchParams()
  if (month) q.set('month', month)
  if (categoryId) q.set('category', categoryId)
  return `/org/${orgId}/expenses?${q.toString()}`
}

// Reports → Equipment (K5, docs/ANALYTICS.md). Every figure is counted in the database
// (public.equipment_money, equipment_unit_money, equipment_payback, equipment_buy_or_hire); these
// helpers only add up item rows into categories and totals, and label them for the screen.

export const EQUIPMENT_VIEWS = ['profit', 'payback', 'buy', 'coverage', 'use']
export const PROFIT_GROUPS = ['item', 'category', 'unit']
const COSTS = ['depreciation', 'repairs', 'inspections', 'hire_in', 'losses']
const NUMBERS = ['revenue', 'revenue_sets', 'depreciation_estimated', ...COSTS, 'profit']

const num = v => Number(v) || 0
const round2 = v => Math.round(v * 100) / 100

// A row of equipment_money with numbers as numbers, its costs added up, and an id for tables
export function toProfitRow(r) {
  const row = { ...r, id: r.item_id || 'not-linked' }
  for (const k of NUMBERS) row[k] = num(r[k])
  row.costs = round2(COSTS.reduce((s, k) => s + row[k], 0))
  return row
}

// Totals of the period: revenue (and how much of it isn't linked to an item), each cost, profit
export function profitTotals(rows) {
  const t = { notLinked: 0, notLinkedShare: null, costs: 0 }
  for (const k of NUMBERS) t[k] = 0
  for (const r of rows || []) {
    for (const k of NUMBERS) t[k] += num(r[k])
    if (!r.item_id) t.notLinked += num(r.revenue)
  }
  for (const k of [...NUMBERS, 'notLinked']) t[k] = round2(t[k])
  t.costs = round2(COSTS.reduce((s, k) => s + t[k], 0))
  t.notLinkedShare = t.revenue > 0 ? t.notLinked / t.revenue : null
  return t
}

// Item rows added up by category (an empty category is its own group, labelled by the screen).
// The "not linked to an item" row stays out of the groups: its share is shown under the total.
export function groupByCategory(rows) {
  const by = new Map()
  for (const r of rows || []) {
    if (!r.item_id) continue
    const key = r.category || ''
    if (!by.has(key)) {
      const g = { id: `cat:${key}`, category: key, items: 0, costs: 0 }
      for (const k of NUMBERS) g[k] = 0
      by.set(key, g)
    }
    const g = by.get(key)
    g.items += 1
    for (const k of [...NUMBERS, 'costs']) g[k] = round2(g[k] + num(r[k]))
  }
  return [...by.values()]
}

// Items worth showing in the profit table: anything owned, or with money in the period
export const hasActivity = r => !r.item_id || num(r.owned) > 0 || NUMBERS.some(k => num(r[k]) !== 0)

// How many stock items and units have a purchase cost, and which items are missing one
export function coverage(rows) {
  const items = (rows || []).filter(r => r.item_id && (num(r.owned) > 0 || num(r.units) > 0))
  const missing = items.filter(r => !r.has_cost).sort((a, b) => num(b.owned) - num(a.owned) || String(a.name).localeCompare(String(b.name)))
  return {
    items: items.length,
    itemsWithCost: items.length - missing.length,
    units: items.reduce((s, r) => s + num(r.units), 0),
    unitsWithCost: items.reduce((s, r) => s + num(r.units_with_cost), 0),
    missing,
  }
}

// Where a payback row stands: 'paid' (with the date), 'expected' (a date at the current pace) or
// 'noPace' (no revenue in the last 12 months, or a unit lost or retired before paying back)
export function paybackState(r) {
  if (r.paid_back_on) return 'paid'
  if (r.expected_on) return 'expected'
  return 'noPace'
}

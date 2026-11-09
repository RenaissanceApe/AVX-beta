// Reports → Money: cash, spending and forecast (K3, docs/ANALYTICS.md). Every figure comes from
// public.cash_report, spending, client_balance, revenue_forecast and target_progress, which count
// in the database; these helpers only pick, order and label their rows. Money is never added
// across currencies.

export const CASH_VIEWS = ['cash', 'spending', 'forecast']
export const SPENDING_GROUPS = ['category', 'supplier', 'gig', 'month']
export const AGE_BANDS = ['0_30', '31_60', '61_90', '90_plus']
export const OUT_PARTS = ['unpaid', 'claims', 'recurring', 'crew'] // crew: fees to pay with no invoice yet (K8)
// Months ahead for the cash position and the forecast (decided with the owner, 2026-11-07)
export const MONTHS_AHEAD = 3

const num = v => Number(v) || 0
const round2 = v => Math.round(v * 100) / 100

// The currencies in rows, the one with most money first (euros first on a tie)
export function currenciesIn(rows, value = r => r.amount) {
  const by = new Map()
  for (const r of rows || []) by.set(r.currency, (by.get(r.currency) || 0) + Math.abs(num(value(r))))
  return [...by.entries()].sort((a, b) => b[1] - a[1] || (a[0] === 'EUR' ? -1 : b[0] === 'EUR' ? 1 : a[0].localeCompare(b[0])))
    .map(([c]) => c)
}

// The sum of a cash_report section in one currency, optionally one month and one group
export function sectionSum(rows, section, currency, { month, group } = {}) {
  let s = 0
  for (const r of rows || []) {
    if (r.section !== section || r.currency !== currency) continue
    if (month !== undefined && String(r.month || '').slice(0, 7) !== month) continue
    if (group !== undefined && r.group_key !== group) continue
    s += num(r.amount)
  }
  return round2(s)
}

// Cash in and out per month of the period: [{ key: 'YYYY-MM', invoiced, deposits, credited, received, paidOut }]
export function cashByMonth(rows, currency, months) {
  return (months || []).map(m => ({
    key: m.key,
    invoiced: sectionSum(rows, 'invoiced', currency, { month: m.key }),
    deposits: sectionSum(rows, 'invoiced', currency, { month: m.key, group: 'deposit' }),
    credited: sectionSum(rows, 'credited', currency, { month: m.key }),
    received: sectionSum(rows, 'received', currency, { month: m.key }),
    paidOut: sectionSum(rows, 'paid_out', currency, { month: m.key }),
  }))
}

// Overdue by age: { '0_30': n, …, total, count }
export function agedOverdue(rows, currency) {
  const out = { total: 0, count: 0 }
  for (const b of AGE_BANDS) out[b] = 0
  for (const r of rows || []) {
    if (r.section !== 'overdue' || r.currency !== currency || !(r.group_key in out)) continue
    out[r.group_key] = round2(out[r.group_key] + num(r.amount))
    out.total = round2(out.total + num(r.amount))
    out.count += num(r.items)
  }
  return out
}

// The months ahead, from this month: [{ key, in, inOverdue, out, unpaid, claims, recurring, crew, position }]
export function monthsAhead(rows, currency, today, count = MONTHS_AHEAD) {
  const out = []
  const [y, m] = String(today).split('-').map(Number)
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    const key = d.toISOString().slice(0, 7)
    const row = {
      key,
      in: sectionSum(rows, 'expected_in', currency, { month: key }),
      inOverdue: sectionSum(rows, 'expected_in', currency, { month: key, group: 'overdue' }),
      out: sectionSum(rows, 'expected_out', currency, { month: key }),
      position: sectionSum(rows, 'position', currency, { month: key }),
    }
    for (const p of OUT_PARTS) row[p] = sectionSum(rows, 'expected_out', currency, { month: key, group: p })
    out.push(row)
  }
  return out
}

// Upcoming recurring costs, one row per cost: [{ id, label, amount, dates }]
export function recurringList(rows, currency) {
  const by = new Map()
  for (const r of rows || []) {
    if (r.section !== 'recurring' || r.currency !== currency) continue
    const x = by.get(r.group_key) || { id: r.group_key, label: r.label || '', amount: 0, dates: 0 }
    x.amount = round2(x.amount + num(r.amount))
    x.dates += num(r.items)
    by.set(r.group_key, x)
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
}

// Spending against the comparison period, joined by group: [{ id, row, now, before, diff, change }]
// sorted by the size of the difference (the biggest changes first)
export function spendingChanges(current, previous, currency) {
  const by = new Map()
  for (const r of current || []) if (r.currency === currency) by.set(r.group_key, { id: r.group_key, row: r, now: num(r.amount), before: 0 })
  for (const r of previous || []) {
    if (r.currency !== currency) continue
    const x = by.get(r.group_key) || { id: r.group_key, row: r, now: 0, before: 0 }
    x.before = num(r.amount)
    by.set(r.group_key, x)
  }
  return [...by.values()].map(x => ({
    ...x, diff: round2(x.now - x.before), change: x.before === 0 ? null : (x.now - x.before) / Math.abs(x.before),
  })).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.now - a.now)
}

// Forecast rows of one currency, with totals: { months: [...], confirmed, waiting, quotes, winCount, winValue }
export function forecastOf(rows, currency) {
  const months = (rows || []).filter(r => r.currency === currency)
    .map(r => ({ key: String(r.month).slice(0, 7), confirmed: num(r.confirmed), waiting: num(r.waiting), quotes: num(r.waiting_quotes) }))
  const first = (rows || []).find(r => r.currency === currency)
  return {
    months,
    confirmed: round2(months.reduce((s, m) => s + m.confirmed, 0)),
    waiting: round2(months.reduce((s, m) => s + m.waiting, 0)),
    quotes: months.reduce((s, m) => s + m.quotes, 0),
    winCount: first?.win_rate_count == null ? null : num(first.win_rate_count),
    winValue: first?.win_rate_value == null ? null : num(first.win_rate_value),
  }
}

// A target's progress: share of the target used (budgets) or reached (revenue), and whether a
// budget is over. share is null when the target is zero for the period.
export function targetState(row) {
  const target = num(row?.target)
  const actual = num(row?.actual)
  const share = target > 0 ? actual / target : null
  return { target, actual, share, over: row?.kind === 'budget' && share != null && share > 1, left: round2(target - actual) }
}

// Client balances of one currency, those with something to pay first
export function balancesOf(rows, currency) {
  return (rows || []).filter(r => r.currency === currency && (num(r.balance) || num(r.invoiced)))
    .map(r => ({ ...r, id: r.client_key }))
}

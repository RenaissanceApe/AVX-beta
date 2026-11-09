// The Overview tiles of the Reports area, also shown as the key-numbers strip on the
// organisation's Home (docs/ANALYTICS.md, K1). Later K steps add their tiles here.
//
// Each tile: { key, kind, value(overview), sub?(overview), to(base) }. A sub with a count picks
// its .one/.other form; without one it is a plain key. `overview` is what
// public.report_overview returns. kind: 'count' | 'money' (per currency, never added) | 'pct' (a
// fraction, 0.42) | 'pctValue' (already a percentage, 42.5).
// Labels are i18n keys reports.tile.<key> and reports.tileHint.<key>.
// A tile with `source: '<function>'` reads that function's answer instead (useOverview calls each
// function in OVERVIEW_SOURCES and merges them), so a K step can add tiles without changing
// report_overview.

import { todayIn, addDaysIso } from './periods'

export const OVERVIEW_TILES = [
  { key: 'gigsThisMonth', kind: 'count', value: o => o?.gigs_this_month?.total ?? 0,
    sub: o => ({ key: 'reports.tileSub.confirmed', vars: { count: o?.gigs_this_month?.confirmed ?? 0 } }), to: base => `${base}?view=calendar` },
  { key: 'revenueNext30', kind: 'money', value: o => o?.revenue_next_30 || {}, to: base => `${base}/reports?tab=revenue` },
  { key: 'waitingQuotes', kind: 'money', value: o => o?.waiting?.totals || {},
    sub: o => ({ key: 'reports.tileSub.quotes', vars: { count: o?.waiting?.count ?? 0 } }), to: base => `${base}/reports?tab=sales` },
  { key: 'equipmentUse90', kind: 'pct', value: o => o?.equipment_use_90 ?? null, to: base => `${base}/reports?tab=equipment&view=use` },
  // K2 (public.finance_results through report_overview): these four took the place of step 10's two
  // monthly margin tiles, which live on in Reports → Gig margins
  { key: 'revenueThisMonth', kind: 'money', value: o => o?.revenue_this_month || {},
    sub: o => lastYearSub(o), to: base => `${base}/reports?tab=money&compare=last_year` },
  { key: 'marginPctYear', kind: 'pctValue', value: o => o?.margin_pct_year ?? null, to: base => `${base}/reports?tab=money&period=this_year` },
  { key: 'operatingResultYear', kind: 'money', value: o => o?.operating_result_year || {}, to: base => `${base}/reports?tab=money&period=this_year` },
  { key: 'negativeMarginYear', kind: 'count', value: o => o?.negative_margin_year ?? 0, to: base => `${base}/reports?tab=margins&period=this_year` },
  // K3 (public.report_overview → private.open_invoices, expenses, the revenue rule). A fifth tile,
  // crew fees to pay, comes with K8.
  { key: 'overdueNow', kind: 'money', value: o => o?.overdue_now || {},
    sub: o => ({ key: 'reports.tileSub.invoices', vars: { count: o?.overdue_count ?? 0 } }), to: base => `${base}/invoices?view=unpaid` },
  { key: 'cashIn30', kind: 'money', value: o => o?.cash_in_30 || {}, to: base => `${base}/reports?tab=money&view=cash` },
  { key: 'expensesDue14', kind: 'money', value: o => o?.expenses_due_14 || {}, to: base => `${base}/expenses?view=unpaid` },
  { key: 'revenueNext3m', kind: 'money', value: o => o?.revenue_next_3m || {}, to: base => `${base}/reports?tab=money&view=forecast` },
  // K4 (public.report_overview_k4, its own function next to report_overview). K1's "Quotes waiting"
  // tile above is the waiting value; it now opens Reports → Sales.
  { key: 'followUp', source: 'report_overview_k4', kind: 'count', value: o => o?.follow_up?.count ?? 0,
    sub: o => followUpSub(o), to: base => `${base}/quotes?status=follow_up` },
  { key: 'winRate90', source: 'report_overview_k4', kind: 'pct', value: o => o?.win_rate_90?.by_count ?? null,
    sub: o => winRateSub(o), to: base => `${base}/reports?tab=sales&view=winrate` },
  { key: 'topClientYear', source: 'report_overview_k4', kind: 'money',
    value: o => (o?.top_client_year ? { [o.top_client_year.currency]: o.top_client_year.amount } : {}),
    sub: o => (o?.top_client_year ? { key: 'reports.tileSub.topClient', vars: { name: o.top_client_year.name || '—', pct: Math.round(Number(o.top_client_year.share || 0) * 100) } }
      : { key: 'reports.tileSub.noTopClient', vars: {} }), to: base => `${base}/reports?tab=sales&view=clients&period=this_year` },
  // K5 (public.report_overview_k5): equipment profit this year, by item, and hire-in spend
  { key: 'bestEarnerYear', kind: 'money', source: 'report_overview_k5', value: o => earner(o?.best_earner_year),
    sub: o => earnerSub(o?.best_earner_year), to: base => `${base}/reports?tab=equipment&period=this_year` },
  { key: 'worstEarnerYear', kind: 'money', source: 'report_overview_k5', value: o => earner(o?.worst_earner_year),
    sub: o => earnerSub(o?.worst_earner_year), to: base => `${base}/reports?tab=equipment&period=this_year&sort=profit_asc` },
  { key: 'hireInYear', kind: 'money', source: 'report_overview_k5', value: o => o?.hire_in_year || {}, to: base => `${base}/reports?tab=equipment&view=buy` },
  // K6 (public.report_overview_k6, its own function next to report_overview)
  { key: 'itemsShort30', source: 'report_overview_k6', kind: 'count', value: o => o?.items_short_30 ?? 0,
    to: base => next30Link(base) },
  { key: 'unitsInRepair', source: 'report_overview_k6', kind: 'count', value: o => o?.units_in_repair ?? 0, to: base => `${base}/inventory?tab=maintenance` },
  { key: 'inspectionsOverdue', source: 'report_overview_k6', kind: 'count', value: o => o?.inspections_overdue ?? 0,
    sub: o => (Number(o?.never_inspected) ? { key: 'reports.tileSub.neverInspected', vars: { count: Number(o.never_inspected) } } : null),
    to: base => `${base}/reports?tab=warehouse&view=damage` },
  // K7 (public.report_overview_k7, its own function next to report_overview)
  { key: 'crewDaysMonth', source: 'report_overview_k7', kind: 'count', value: o => o?.crew_days_month ?? 0, to: base => `${base}/reports?tab=operations&view=people` },
  { key: 'openPositions14', source: 'report_overview_k7', kind: 'count', value: o => o?.open_positions_14 ?? 0, to: base => `${base}/reports?tab=operations&view=staffing&period=this_month` },
  { key: 'overdueTasks', source: 'report_overview_k7', kind: 'count', value: o => o?.overdue_tasks ?? 0, to: base => `${base}/reports?tab=operations&view=tasks` },
  { key: 'hoursWaiting', source: 'report_overview_k7', kind: 'count', value: o => o?.hours_waiting?.days ?? 0,
    sub: o => ({ key: 'reports.tileSub.hoursWaiting', vars: { hours: Math.round((Number(o?.hours_waiting?.hours) || 0) * 10) / 10 } }), to: base => `${base}/reports?tab=operations&view=people` },
  // K8 (public.report_overview_k8, its own call): agreed crew fees on gigs that are over, not marked paid
  { key: 'crewToPay', kind: 'money', source: 'report_overview_k8', value: o => o?.crew_to_pay || {},
    sub: o => ({ key: 'reports.tileSub.people', vars: { count: o?.crew_to_pay_count ?? 0 } }), to: base => `${base}/expenses?view=crew` },
]

// The functions the tiles read (each tile's `source`, report_overview when it has none); their
// answers are merged into one object (each function uses its own keys)
export const OVERVIEW_SOURCES = [...new Set(OVERVIEW_TILES.map(t => t.source || 'report_overview'))]

// "Worth 1 200,00 €" under the follow-up count, in the biggest currency
export function followUpSub(o) {
  const lines = moneyLines(o?.follow_up?.totals)
  return { key: 'reports.tileSub.worth', vars: { amount: lines[0].amount, currency: lines[0].currency } }
}

// "By value: 63%" under the win rate, or how many were decided when there's no value
export function winRateSub(o) {
  const w = o?.win_rate_90
  if (!w || !Number(w.decided)) return { key: 'reports.tileSub.noDecided', vars: {} }
  if (w.by_value == null) return { key: 'reports.tileSub.decided', vars: { count: Number(w.decided) } }
  return { key: 'reports.tileSub.byValue', vars: { pct: Math.round(Number(w.by_value) * 100) } }
}

// Reports → Warehouse → Demand over the next 30 days (today in the browser's time zone), items over stock
// (a custom period's `until` is its last day, so today + 29)
export function next30Link(base, now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const from = todayIn(timeZone, now)
  return `${base}/reports?tab=warehouse&period=custom&from=${from}&until=${addDaysIso(from, 29)}&show=short`
}

// An item's profit as a tile's money, and its name as the line under it (K5)
const earner = e => (e ? { EUR: Number(e.amount) || 0 } : {})
const earnerSub = e => (e ? { key: 'reports.tileSub.item', vars: { name: e.name } } : { key: 'reports.tileSub.noItem', vars: {} })

// Money per currency as display lines, the biggest first: [{ currency, amount }]. Empty → one zero
// line in the fallback currency, so a tile never shows a blank.
export function moneyLines(byCurrency, fallback = 'EUR') {
  const lines = Object.entries(byCurrency || {}).map(([currency, amount]) => ({ currency, amount: Number(amount) || 0 }))
    .sort((a, b) => b.amount - a.amount)
  return lines.length ? lines : [{ currency: fallback, amount: 0 }]
}

// "Same days last year: 1 200,00 €" under this month's revenue, in the biggest currency
export function lastYearSub(o) {
  const now = moneyLines(o?.revenue_this_month)[0]
  const before = o?.revenue_month_last_year || {}
  if (!(now.currency in before)) return { key: 'reports.tileSub.noLastYear', vars: {} }
  return { key: 'reports.tileSub.lastYear', vars: { amount: Number(before[now.currency]) || 0, currency: now.currency } }
}

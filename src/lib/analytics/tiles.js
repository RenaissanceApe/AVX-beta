// The Overview tiles of the Reports area, also shown as the key-numbers strip on the
// organisation's Home (docs/ANALYTICS.md, K1). Later K steps add their tiles here.
//
// Each tile: { key, kind, value(overview), sub?(overview), hide?(overview), to(base) }. A sub with a count picks
// its .one/.other form; without one it is a plain key. `overview` is what
// public.report_overview returns. kind: 'count' | 'money' (per currency, never added) | 'pct' (a
// fraction, 0.42) | 'pctValue' (already a percentage, 42.5).
// Labels are i18n keys reports.tile.<key> and reports.tileHint.<key>.

export const OVERVIEW_TILES = [
  { key: 'gigsThisMonth', kind: 'count', value: o => o?.gigs_this_month?.total ?? 0,
    sub: o => ({ key: 'reports.tileSub.confirmed', vars: { count: o?.gigs_this_month?.confirmed ?? 0 } }), to: base => `${base}?view=calendar` },
  { key: 'revenueNext30', kind: 'money', value: o => o?.revenue_next_30 || {}, to: base => `${base}/reports?tab=revenue` },
  { key: 'waitingQuotes', kind: 'money', value: o => o?.waiting?.totals || {},
    sub: o => ({ key: 'reports.tileSub.quotes', vars: { count: o?.waiting?.count ?? 0 } }), to: base => `${base}/quotes` },
  { key: 'equipmentUse90', kind: 'pct', value: o => o?.equipment_use_90 ?? null, to: base => `${base}/inventory?tab=reports` },
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
  // K7 (public.report_overview_k7, merged in as `k7` by useOverview; hidden when it didn't load)
  { key: 'crewDaysMonth', kind: 'count', hide: o => !o?.k7, value: o => o?.k7?.crew_days_month ?? 0, to: base => `${base}/reports?tab=operations&view=people` },
  { key: 'openPositions14', kind: 'count', hide: o => !o?.k7, value: o => o?.k7?.open_positions_14 ?? 0, to: base => `${base}/reports?tab=operations&view=staffing&period=this_month` },
  { key: 'overdueTasks', kind: 'count', hide: o => !o?.k7, value: o => o?.k7?.overdue_tasks ?? 0, to: base => `${base}/reports?tab=operations&view=tasks` },
  { key: 'hoursWaiting', kind: 'count', hide: o => !o?.k7, value: o => o?.k7?.hours_waiting?.days ?? 0,
    sub: o => ({ key: 'reports.tileSub.hoursWaiting', vars: { hours: Math.round((Number(o?.k7?.hours_waiting?.hours) || 0) * 10) / 10 } }), to: base => `${base}/reports?tab=operations&view=people` },
]

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

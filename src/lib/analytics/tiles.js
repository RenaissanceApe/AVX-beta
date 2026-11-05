// The Overview tiles of the Reports area, also shown as the key-numbers strip on the
// organisation's Home (docs/ANALYTICS.md, K1). Later K steps add their tiles here.
//
// Each tile: { key, kind, value(overview), sub?(overview), to(base) }. A sub with a count picks
// its .one/.other form; without one it is a plain key. `overview` is what
// public.report_overview returns. kind: 'count' | 'money' (per currency, never added) | 'pct'.
// Labels are i18n keys reports.tile.<key> and reports.tileHint.<key>.

export const OVERVIEW_TILES = [
  { key: 'gigsThisMonth', kind: 'count', value: o => o?.gigs_this_month?.total ?? 0,
    sub: o => ({ key: 'reports.tileSub.confirmed', vars: { count: o?.gigs_this_month?.confirmed ?? 0 } }), to: base => `${base}?view=calendar` },
  { key: 'revenueNext30', kind: 'money', value: o => o?.revenue_next_30 || {}, to: base => `${base}/reports?tab=revenue` },
  { key: 'waitingQuotes', kind: 'money', value: o => o?.waiting?.totals || {},
    sub: o => ({ key: 'reports.tileSub.quotes', vars: { count: o?.waiting?.count ?? 0 } }), to: base => `${base}/quotes` },
  { key: 'equipmentUse90', kind: 'pct', value: o => o?.equipment_use_90 ?? null, to: base => `${base}/inventory?tab=reports` },
  // Step 10: gigs starting this month that have a quote (public.gig_finance, in euros)
  { key: 'marginThisMonth', kind: 'money', value: o => o?.margin_this_month || {},
    sub: o => (o?.margin_pct_this_month != null ? { key: 'reports.tileSub.marginPct', vars: { pct: o.margin_pct_this_month } } : null), to: base => `${base}/reports?tab=margins` },
  { key: 'negativeMargin', kind: 'count', value: o => o?.negative_margin ?? 0, to: base => `${base}/reports?tab=margins` },
]

// Money per currency as display lines, the biggest first: [{ currency, amount }]. Empty → one zero
// line in the fallback currency, so a tile never shows a blank.
export function moneyLines(byCurrency, fallback = 'EUR') {
  const lines = Object.entries(byCurrency || {}).map(([currency, amount]) => ({ currency, amount: Number(amount) || 0 }))
    .sort((a, b) => b.amount - a.amount)
  return lines.length ? lines : [{ currency: fallback, amount: 0 }]
}

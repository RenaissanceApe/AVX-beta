// Reports → Warehouse (K6): helpers that pick and label what the database counted
// (public.warehouse_demand, warehouse_suppliers, warehouse_damage, warehouse_dispatch;
// docs/ANALYTICS.md, "How K6 works"). The browser never adds up raw rows; it only sorts, filters
// and shapes the database's small result sets for tables and charts.

export const WAREHOUSE_VIEWS = ['demand', 'suppliers', 'damage', 'dispatch']
export const DEMAND_FILTERS = ['short', 'idle', 'all']
export const DAMAGE_GROUPS = ['item', 'gig', 'client']

// Demand rows for one filter: "short" = booked more than owned on some day (days over stock),
// most days first; "idle" = owned, no confirmed booking in 12 months (the "sell?" candidates), the
// highest book value first; "all" as the database sorted them.
export function demandRows(items, filter = 'short') {
  const rows = items || []
  if (filter === 'short') {
    return rows.filter(r => Number(r.days_over) > 0)
      .sort((a, b) => Number(b.days_short) - Number(a.days_short) || Number(b.days_over) - Number(a.days_over) || String(a.name).localeCompare(String(b.name)))
  }
  if (filter === 'idle') {
    return rows.filter(r => r.idle)
      .sort((a, b) => (Number(b.book_value) || 0) - (Number(a.book_value) || 0) || String(a.name).localeCompare(String(b.name)))
  }
  return rows
}

// The four numbers above the demand table
export function demandTotals(items) {
  const rows = items || []
  const idle = rows.filter(r => r.idle)
  return {
    over: rows.filter(r => Number(r.days_over) > 0).length,
    short: rows.filter(r => Number(r.days_short) > 0).length,
    hireIns: rows.reduce((s, r) => s + (Number(r.hire_ins) || 0), 0),
    idle: idle.length,
    idleValue: idle.some(r => r.book_value != null) ? idle.reduce((s, r) => s + (Number(r.book_value) || 0), 0) : null,
  }
}

// The busiest items for the chart: booked at the busiest moment against owned then (10 at most)
export function peakBars(items, limit = 10) {
  return (items || []).filter(r => Number(r.peak_booked) > 0)
    .sort((a, b) => (Number(b.peak_booked) - Number(b.owned_at_peak)) - (Number(a.peak_booked) - Number(a.owned_at_peak)) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit)
}

// Confirmed as a share of requests answered (confirmed + declined), or null with none answered
export function confirmRate(t) {
  const c = Number(t?.confirmed) || 0
  const d = Number(t?.declined) || 0
  return c + d > 0 ? c / (c + d) : null
}

// How many days before the gig gear left, in a fixed order, for a bar chart
export const LEAD_KINDS = ['after', 'same_day', 'one', 'two_three', 'more']
export const dispatchLeadBars = lead => LEAD_KINDS.map(key => ({ key, value: Number(lead?.[key]) || 0 }))

// Scans per day as bars: one per day for up to 62 days, else one per month (YYYY-MM)
export function scanBars(rows, range) {
  const list = rows || []
  if (!range) return []
  const days = Math.round((new Date(`${range.until}T00:00:00Z`) - new Date(`${range.from}T00:00:00Z`)) / 86400000)
  if (days <= 62) {
    const by = new Map(list.map(r => [r.day, Number(r.scans) || 0]))
    const out = []
    for (let d = new Date(`${range.from}T00:00:00Z`); d < new Date(`${range.until}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      out.push({ key, value: by.get(key) || 0 })
    }
    return out
  }
  const by = new Map()
  for (const r of list) {
    const key = String(r.day).slice(0, 7)
    by.set(key, (by.get(key) || 0) + (Number(r.scans) || 0))
  }
  const out = []
  for (let d = new Date(`${range.from.slice(0, 7)}-01T00:00:00Z`); d < new Date(`${range.until}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) {
    const key = d.toISOString().slice(0, 7)
    out.push({ key, value: by.get(key) || 0 })
  }
  return out
}

// Scanned out as a share of planned on one gig (or the totals), or null with nothing planned
export const outShare = r => (Number(r?.planned) > 0 ? Math.min(1, (Number(r?.out) || 0) / Number(r.planned)) : null)

// Damage grouped by item, gig or client, with the rows the database sent for it
export function damageRows(data, by = 'item') {
  if (!data) return []
  if (by === 'gig') return (data.by_gig || []).map(r => ({ ...r, id: r.gig_id }))
  if (by === 'client') return (data.by_client || []).map(r => ({ ...r, id: r.client_id || 'none' }))
  return (data.by_item || []).map(r => ({ ...r, id: r.item_id }))
}

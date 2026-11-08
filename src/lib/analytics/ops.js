// Reports → Operations (K7): helpers that pick and label what the database counted
// (public.ops_activity, ops_people, ops_staffing, ops_tasks; docs/ANALYTICS.md, "How K7 works").
// The browser never adds up raw rows; it only groups the database's small result sets for charts.

export const OPS_VIEWS = ['activity', 'people', 'staffing', 'tasks']
export const ACTIVITY_GROUPS = ['status', 'type']

// A row's status key: the organisation's own status when the gig has one, else the built-in one
export const statusKeyOf = r => (r.custom_status_id ? `own:${r.custom_status_id}` : `base:${r.status}`)
export const typeKeyOf = r => (r.gig_type_id ? `type:${r.gig_type_id}` : 'type:none')

// Months × series for a stacked bar: rows are [{ month, …, [field] }]; months [{ key }].
// Returns { data: [{ key, values }], series: [{ key, label }] } with series in the order first seen,
// biggest total first.
export function stackByMonth(rows, months, field, keyOf, labelOf) {
  const totals = new Map()
  const byMonth = new Map(months.map(m => [m.key, {}]))
  for (const r of rows || []) {
    const values = byMonth.get(r.month)
    if (!values) continue
    const k = keyOf(r)
    const n = Number(r[field]) || 0
    values[k] = (values[k] || 0) + n
    totals.set(k, (totals.get(k) || 0) + n)
  }
  const series = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => ({ key, label: labelOf(key) }))
  return { data: months.map(m => ({ key: m.key, values: byMonth.get(m.key) })), series }
}

export const sumField = (rows, field) => (rows || []).reduce((s, r) => s + (Number(r[field]) || 0), 0)

// Booking lead time buckets in a fixed order, for a bar chart
export const LEAD_BUCKETS = ['under_7', 'd7_29', 'd30_89', 'd90_plus']
export const leadBars = lead => LEAD_BUCKETS.map(key => ({ key, value: Number(lead?.[key]) || 0 }))

// Share of a part in a whole as a fraction (null when the whole is 0)
export const share = (part, whole) => (Number(whole) > 0 ? (Number(part) || 0) / Number(whole) : null)

// Planned against approved hours: the difference and its sign, for words next to the numbers
export function hoursVariance(planned, approved) {
  const p = Number(planned) || 0
  const a = Number(approved) || 0
  return { planned: p, approved: a, diff: Math.round((a - p) * 100) / 100, pct: p > 0 ? (a - p) / p : null }
}

// Hours shown as "1 234,5 h" in the reader's language
export function hoursText(v, lang = 'en') {
  const n = Number(v) || 0
  return `${n.toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 1 })} h`
}

// A fraction as a whole percentage in the reader's language ("42%"), or a dash
export function pctText(v, lang = 'en') {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `${Math.round(Number(v) * 100).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%`
}

// A number of hours as days when it is long ("3 d" from 72 h), else hours, for "how long" figures
export function durationParts(hours) {
  if (hours == null) return null
  const h = Number(hours)
  return h >= 48 ? { unit: 'days', value: Math.round(h / 24 * 10) / 10 } : { unit: 'hours', value: Math.round(h * 10) / 10 }
}

// Positions by gig date: open and filled per month of the gigs' start dates
export function positionsByMonth(gigs, months) {
  const byMonth = new Map(months.map(m => [m.key, { filled: 0, open: 0 }]))
  for (const g of gigs || []) {
    const v = byMonth.get(String(g.start_date || '').slice(0, 7))
    if (!v) continue
    v.filled += Number(g.filled) || 0
    v.open += Number(g.open) || 0
  }
  return months.map(m => ({ key: m.key, values: byMonth.get(m.key) }))
}

// Crew-call answers in a fixed order, with their share of everyone asked
export const ANSWER_KINDS = ['accepted', 'declined', 'none', 'full']
export const answerRows = calls => ANSWER_KINDS.map(key => ({ key, value: Number(calls?.[key]) || 0, share: share(calls?.[key], calls?.invited) }))

// Tasks done on time as a share of tasks done that had a due date
export const onTimeShare = t => share(t?.on_time, (Number(t?.on_time) || 0) + (Number(t?.late) || 0))

// Leave per type as a short text ("holiday 3, sick 1"), with labels from the caller
export function leaveText(leave, labelOf) {
  return Object.entries(leave || {}).filter(([, d]) => Number(d) > 0)
    .map(([type, d]) => `${labelOf(type)} ${Number(d).toLocaleString()}`).join(', ')
}

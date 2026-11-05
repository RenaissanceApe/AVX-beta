// Report periods (docs/ANALYTICS.md, "Periods"). Report dates are calendar dates
// ('YYYY-MM-DD'), so a period is a pair of dates: `from` (first day) and `until` (the day after
// the last, exclusive). The organisation's time zone only decides what "today" is.

export const PERIODS = ['this_month', 'last_month', 'this_quarter', 'this_year', 'last_12_months', 'custom']
export const COMPARISONS = ['previous', 'last_year']

const ISO = /^\d{4}-\d{2}-\d{2}$/
const pad = n => String(n).padStart(2, '0')
const toIso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const toDate = iso => new Date(`${iso}T00:00:00Z`)
export const isIsoDate = v => typeof v === 'string' && ISO.test(v) && toIso(toDate(v)) === v

export function addDaysIso(iso, n) {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}
// First day of the month n months after iso's month
export function addMonthsIso(iso, n) {
  const d = toDate(iso)
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)))
}
export const daysBetween = (from, until) => Math.round((toDate(until) - toDate(from)) / 86400000)
const monthStart = iso => `${iso.slice(0, 7)}-01`

// Today's date in a time zone (never a hard-coded one; falls back to UTC if the name is unknown)
export function todayIn(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return toIso(now)
  }
}

// The whole period, plus `asOf`: the day after the last day that has happened (today + 1, or
// `until` if the period is over). `partial` when the period hasn't ended yet. `months` is the
// length used to step back for the comparison (null for a custom period: stepped back by days).
export function periodRange(key, { today, from, until } = {}) {
  const t = today
  const m = monthStart(t)
  let r
  if (key === 'this_month') r = { from: m, until: addMonthsIso(m, 1), months: 1 }
  else if (key === 'last_month') r = { from: addMonthsIso(m, -1), until: m, months: 1 }
  else if (key === 'this_quarter') {
    const q = toDate(m)
    const start = toIso(new Date(Date.UTC(q.getUTCFullYear(), Math.floor(q.getUTCMonth() / 3) * 3, 1)))
    r = { from: start, until: addMonthsIso(start, 3), months: 3 }
  } else if (key === 'this_year') r = { from: `${t.slice(0, 4)}-01-01`, until: `${Number(t.slice(0, 4)) + 1}-01-01`, months: 12 }
  else if (key === 'last_12_months') r = { from: addMonthsIso(m, -11), until: addMonthsIso(m, 1), months: 12 }
  else if (key === 'custom') {
    if (!isIsoDate(from) || !isIsoDate(until) || until < from) return null
    r = { from, until: addDaysIso(until, 1), months: null } // custom `until` is the last day, inclusive
  } else return null
  const tomorrow = addDaysIso(t, 1)
  const asOf = r.until > tomorrow ? (r.from > tomorrow ? r.from : tomorrow) : r.until
  return { key, ...r, asOf, partial: asOf < r.until }
}

// The period to compare with. A period not yet over is compared day for day: 1–5 November with
// 1–5 October, not all of October. 'previous' steps back one period of the same length;
// 'last_year' twelve months. The comparison never runs past the end of its own period.
export function comparisonRange(range, mode = 'previous') {
  if (!range) return null
  const elapsed = daysBetween(range.from, range.asOf)
  let from, until
  if (range.months == null) {
    const len = daysBetween(range.from, range.until)
    if (mode === 'last_year') {
      from = shiftYear(range.from, -1)
      until = shiftYear(range.until, -1)
    } else {
      from = addDaysIso(range.from, -len)
      until = range.from
    }
  } else {
    const step = mode === 'last_year' ? 12 : range.months
    from = addMonthsIso(range.from, -step)
    until = addMonthsIso(range.until, -step)
  }
  const asOf = range.partial ? minIso(addDaysIso(from, elapsed), until) : until
  return { key: `${range.key}:${mode}`, from, until: asOf, asOf, partial: false, months: range.months }
}

const minIso = (a, b) => (a < b ? a : b)
// Same day a year earlier (29 February → 28 February)
function shiftYear(iso, n) {
  const d = toDate(iso)
  const y = d.getUTCFullYear() + n
  const last = new Date(Date.UTC(y, d.getUTCMonth() + 1, 0)).getUTCDate()
  return toIso(new Date(Date.UTC(y, d.getUTCMonth(), Math.min(d.getUTCDate(), last))))
}

// Change between two numbers, as a fraction (0.25 = +25 %); null when there's nothing to compare
export function change(current, previous) {
  const c = Number(current) || 0
  const p = Number(previous) || 0
  if (p === 0) return null
  return (c - p) / Math.abs(p)
}

// The months of a range, for monthly bars and lines: [{ from, until, key: 'YYYY-MM' }]
export function monthsOf(range) {
  if (!range) return []
  const out = []
  for (let m = monthStart(range.from); m < range.until; m = addMonthsIso(m, 1)) {
    out.push({ key: m.slice(0, 7), from: m < range.from ? range.from : m, until: minIso(addMonthsIso(m, 1), range.until) })
  }
  return out
}

// A period chosen in the URL or remembered on the device → a valid key
export const periodKey = v => (PERIODS.includes(v) ? v : 'this_month')
export const comparisonKey = v => (COMPARISONS.includes(v) ? v : 'previous')

// Reports → Sales (K4, docs/ANALYTICS.md): helpers for public.sales_waiting, sales_win_rate and
// sales_clients. The database counts; these only pick, bucket and label rows.

export const SALES_VIEWS = ['waiting', 'winrate', 'clients']
// Win rate groupings; a custom field of kind "choice" is added as `field:<id>`
export const WIN_GROUPS = ['month', 'quarter', 'gig_type', 'client', 'author', 'lost_reason']
// Owner's answer (2026-11-08): a quote needs a follow-up after 7 days with no answer
export const FOLLOW_UP_DAYS = 7
// "Expiring soon": valid until today up to 7 days ahead (the same in SQL)
export const EXPIRING_DAYS = 7
// Age buckets of quotes waiting, in days since sent
export const AGE_BUCKETS = [{ key: '0_7', max: 7 }, { key: '8_14', max: 14 }, { key: '15_30', max: 30 }, { key: '30_plus', max: Infinity }]

const num = v => Number(v) || 0
const DAY = 86400000
const isoDay = v => (typeof v === 'string' ? v.slice(0, 10) : '')
const dayDiff = (a, b) => Math.round((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / DAY)

// The quote list's follow-up filter, the twin of sales_waiting's follow_up: sent, no answer, sent
// FOLLOW_UP_DAYS or more days ago (by the sent date, else the issue date) and not past its validity.
// sentDay: the sent date in the organisation's time zone when known (YYYY-MM-DD).
export function needsFollowUp(quote, today, { days = FOLLOW_UP_DAYS, sentDay } = {}) {
  if (!quote || quote.status !== 'sent' || !today) return false
  if (quote.valid_until && quote.valid_until < today) return false
  const sent = sentDay || isoDay(quote.sent_at) || quote.issue_date
  if (!sent) return false
  return dayDiff(today, sent) >= days
}

// The sent date of a quote in a time zone (YYYY-MM-DD), for needsFollowUp
export function dayIn(timestamp, timeZone) {
  if (!timestamp) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp))
  } catch {
    return isoDay(timestamp)
  }
}

// Waiting quotes of one currency in age buckets: [{ key, count, value }], expired ones left out
export function ageBuckets(rows, currency) {
  const out = AGE_BUCKETS.map(b => ({ key: b.key, count: 0, value: 0 }))
  for (const r of rows || []) {
    if (r.expired || (currency && r.currency !== currency)) continue
    const i = AGE_BUCKETS.findIndex(b => num(r.days_waiting) <= b.max)
    out[i].count += 1
    out[i].value += num(r.value)
  }
  return out
}

// Totals of waiting quotes in one currency: { waiting, value, opened, expiring, followUp, followUpValue, expired, expiredValue }
export function waitingTotals(rows, currency) {
  const t = { waiting: 0, value: 0, opened: 0, expiring: 0, followUp: 0, followUpValue: 0, expired: 0, expiredValue: 0 }
  for (const r of rows || []) {
    if (currency && r.currency !== currency) continue
    if (r.expired) { t.expired += 1; t.expiredValue += num(r.value); continue }
    t.waiting += 1
    t.value += num(r.value)
    if (r.opened) t.opened += 1
    if (r.expiring) t.expiring += 1
    if (r.follow_up) { t.followUp += 1; t.followUpValue += num(r.value) }
  }
  return t
}

// The currencies in rows, the one with the most value first (euros first on a tie)
export function currenciesBy(rows, value = r => r.value) {
  const by = new Map()
  for (const r of rows || []) by.set(r.currency, (by.get(r.currency) || 0) + Math.abs(num(value(r))))
  return [...by.entries()].sort((a, b) => b[1] - a[1] || (a[0] === 'EUR' ? -1 : b[0] === 'EUR' ? 1 : a[0].localeCompare(b[0])))
    .map(([c]) => c)
}

// Win rate over the rows of one currency, or of every currency for counts (counts can be added up;
// money never is). Returns { decided, accepted, declined, byCount, byValue, valueAccepted,
// valueDeclined, gross, discount, discountPct }
export function winTotals(rows, currency) {
  const all = rows || []
  const cur = currency ? all.filter(r => r.currency === currency) : all
  const decided = all.reduce((s, r) => s + num(r.decided), 0)
  const accepted = all.reduce((s, r) => s + num(r.accepted), 0)
  const valueAccepted = cur.reduce((s, r) => s + num(r.value_accepted), 0)
  const valueDeclined = cur.reduce((s, r) => s + num(r.value_declined), 0)
  const gross = cur.reduce((s, r) => s + num(r.gross_accepted), 0)
  const discount = cur.reduce((s, r) => s + num(r.discount_accepted), 0)
  return {
    decided, accepted, declined: all.reduce((s, r) => s + num(r.declined), 0),
    byCount: decided ? accepted / decided : null,
    byValue: valueAccepted + valueDeclined > 0 ? valueAccepted / (valueAccepted + valueDeclined) : null,
    valueAccepted, valueDeclined, gross, discount, discountPct: gross > 0 ? discount / gross : null,
  }
}

// What the biggest clients bring in one currency: { top: [rows], amount, total, share } (share 0–1).
// The row with no client ('') counts in the total, never as a client.
export function topClients(rows, currency, n = 5) {
  const cur = (rows || []).filter(r => r.currency === currency)
  const total = cur.reduce((s, r) => s + num(r.revenue), 0)
  const top = cur.filter(r => r.client_key && num(r.revenue) > 0).sort((a, b) => num(b.revenue) - num(a.revenue)).slice(0, n)
  const amount = top.reduce((s, r) => s + num(r.revenue), 0)
  return { top, amount, total, share: total > 0 ? amount / total : null }
}

// New and returning clients (each client once, whatever its currencies): { new, returning, withGigs }
export function clientMix(rows) {
  const seen = new Map()
  for (const r of rows || []) if (r.client_key && !seen.has(r.client_key)) seen.set(r.client_key, r)
  let fresh = 0; let returning = 0; let withGigs = 0
  for (const r of seen.values()) {
    if (r.is_new) fresh += 1
    if (r.is_returning) returning += 1
    if (num(r.gigs) > 0) withGigs += 1
  }
  return { new: fresh, returning, withGigs }
}

// The client rows to list for one currency: real clients only, and a client with no money in this
// currency still shows (on its euro row) when it has quotes or gigs
export function clientRows(rows, currency) {
  return (rows || []).filter(r => r.client_key && r.currency === currency)
}

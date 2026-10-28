// Crew rates and labour cost (docs/TOOLS_PLAN.md build order step 7). The organisation's rate card
// (crew_rates), its factors (crew_rate_factors) and the fee agreed with each person on a gig
// (gig_crew_fees). Pure helpers, unit tested.
import { quoteTotals, round2 } from './quotes'

export const FEE_UNITS = ['day', 'half_day', 'hour', 'fixed']
export const FACTOR_KEYS = ['overtime', 'weekend', 'night', 'holiday']
export const DEFAULT_FACTORS = { overtime: 1.5, overtime_after_hours: 10, weekend: 1, night: 1, holiday: 1 }

const norm = s => String(s ?? '').trim().toLowerCase()

// The rate that applies to someone on a gig, most specific first: this person for this function,
// this person for any function, then anyone in this function
export function resolveRate(rates, { userId, functionTitle }) {
  const live = (rates || []).filter(r => !r.removed_at)
  const fn = norm(functionTitle)
  return live.find(r => r.user_id && r.user_id === userId && r.function_title && norm(r.function_title) === fn)
    || live.find(r => r.user_id && r.user_id === userId && !r.function_title)
    || (fn ? live.find(r => !r.user_id && norm(r.function_title) === fn) : null)
    || null
}

const isoDay = d => d.toISOString().slice(0, 10)
// Calendar days someone is booked for: their own booking, else the gig's dates
export function bookedDays(member, gig) {
  const from = member?.booked_from ? isoDay(new Date(member.booked_from)) : gig?.start_date
  let until = member?.booked_until ? isoDay(new Date(member.booked_until)) : (gig?.end_date || gig?.start_date)
  if (!from) return []
  if (!until || until < from) until = from
  const out = []
  for (let d = new Date(`${from}T12:00:00Z`); isoDay(d) <= until && out.length < 366; d.setUTCDate(d.getUTCDate() + 1)) out.push(isoDay(d))
  return out
}
const isWeekend = day => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())

// What the rate card suggests for someone: their day rate (or half-day rate) for each booked day,
// weekend days times the weekend factor. Null when there is no rate or no dates.
export function suggestFee(rate, days, factors = DEFAULT_FACTORS) {
  if (!rate || !days?.length) return null
  const per = rate.day_rate != null ? { unit: 'day', rate: Number(rate.day_rate) }
    : rate.half_day_rate != null ? { unit: 'half_day', rate: Number(rate.half_day_rate) } : null
  if (!per) return null
  const weekend = Number(factors?.weekend) || 1
  const weekendDays = days.filter(isWeekend).length
  const total = round2(per.rate * (days.length - weekendDays) + per.rate * weekend * weekendDays)
  return { ...per, quantity: days.length, weekendDays, total }
}

export const feeTotal = fee => (fee && fee.rate != null ? round2(Number(fee.rate) * (fee.unit === 'fixed' ? 1 : Number(fee.quantity) || 0)) : null)

// One line per person on the gig: the agreed fee if there is one, else the rate card's suggestion
export function labourLines({ members, gig, rates, factors, fees }) {
  const byUser = new Map((fees || []).filter(f => f.rate != null).map(f => [f.user_id, f]))
  return (members || []).map(m => {
    const fee = byUser.get(m.user_id) || null
    const rate = resolveRate(rates, { userId: m.user_id, functionTitle: m.function_title })
    const suggestion = suggestFee(rate, bookedDays(m, gig), factors)
    const total = fee ? feeTotal(fee) : suggestion?.total ?? null
    return { member: m, fee, rate, suggestion, total, source: fee ? 'agreed' : suggestion ? 'card' : null }
  })
}

export function labourSummary(lines, revenue) {
  const cost = round2(lines.reduce((sum, l) => sum + (l.total || 0), 0))
  const missing = lines.filter(l => l.total == null).length
  const margin = revenue == null ? null : round2(revenue - cost)
  return { cost, missing, revenue, margin, marginPct: revenue ? Math.round((margin / revenue) * 100) : null }
}

// Crew lines of the quote that counts for a gig (the accepted one, else the newest that isn't
// declined), after the quote's discount
export function quoteCrewRevenue(quotes) {
  const list = (quotes || []).filter(q => q.status !== 'declined')
  const q = list.find(x => x.status === 'accepted') || [...list].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0]
  if (!q) return null
  const { byKind } = quoteTotals(q)
  const pct = Math.min(100, Math.max(0, Number(q.discount_pct) || 0))
  return { quote: q, revenue: round2((byKind.crew || 0) * (1 - pct / 100)) }
}

// What a form field holds → a number or null ("1 200,50" works)
export const parseAmount = raw => {
  const s = String(raw ?? '').replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? round2(n) : NaN
}
export const amountInput = v => (v == null ? '' : String(v).replace('.', ','))

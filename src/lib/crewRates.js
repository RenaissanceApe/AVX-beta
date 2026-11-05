// Crew rates and labour cost (docs/TOOLS_PLAN.md build order step 7). The organisation's rate card
// (crew_rates), its factors (crew_rate_factors) and the fee agreed with each person on a gig
// (gig_crew_fees). Pure helpers, unit tested.
import { lineTotal, round2 } from './quotes'
import { gigRevenue } from './analytics/revenue'

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

// Crew lines of a gig's quotes by the revenue rule (docs/ANALYTICS.md): every accepted quote,
// after line, phase and quote discounts; with none accepted, the newest sent quote, marked as an
// estimate. Drafts and declined quotes never count. In euros, as the rest of the panel.
export function quoteCrewRevenue(quotes) {
  const r = gigRevenue(quotes, { kinds: ['crew'], currency: 'EUR' })
  return r && { quote: r.quotes[0], quotes: r.quotes, revenue: r.revenue, estimate: r.estimate }
}

// What a form field holds → a number or null ("1 200,50" works)
export const parseAmount = raw => {
  const s = String(raw ?? '').replace(/\s/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? round2(n) : NaN
}
export const amountInput = v => (v == null ? '' : String(v).replace('.', ','))

// ── Step 7b: the rate card in crew calls, job posts and quotes ─────────────────────────────────

// The rate for a function whoever does it (no person rates), trying each name in turn: a job
// post's function is a key whose name differs per language
export function functionRate(rates, names) {
  for (const n of [names].flat()) {
    const r = n && String(n).trim() ? resolveRate(rates, { userId: null, functionTitle: n }) : null
    if (r) return r
  }
  return null
}

// A crew call's fee from the rate card's suggestion for the gig's days. With weekend days the day
// rate isn't the same every day, so the call offers the total as a fixed fee.
export function callFee(suggestion) {
  if (!suggestion) return null
  if (suggestion.weekendDays && suggestion.total !== round2(suggestion.rate * suggestion.quantity)) {
    return { unit: 'fixed', rate: suggestion.total, quantity: 1 }
  }
  return { unit: suggestion.unit, rate: suggestion.rate, quantity: suggestion.quantity }
}

// A job post's pay from the rate card: the day rate per day, else the hour rate per hour
export function jobPay(rate) {
  if (rate?.day_rate != null) return { pay_mode: 'fixed', pay_amount: amountInput(Number(rate.day_rate)), pay_per: 'day' }
  if (rate?.hour_rate != null) return { pay_mode: 'fixed', pay_amount: amountInput(Number(rate.hour_rate)), pay_per: 'hour' }
  return null
}

const numOr = (v, d) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d }
// What a quote's crew line costs by the rate card: its description is the function, priced per
// day (day rate) or per hour (hour rate) × quantity × factor. Null for other lines or units.
export function quoteLineCost(line, rates) {
  if (line?.kind !== 'crew') return null
  const rate = functionRate(rates, line.description)
  const per = line.unit === 'day' ? rate?.day_rate : line.unit === 'hour' ? rate?.hour_rate : null
  if (per == null) return null
  const cost = round2(numOr(line.qty, 0) * numOr(line.factor, 1) * Number(per))
  const price = lineTotal(line)
  const margin = round2(price - cost)
  return { rate: Number(per), cost, price, margin, marginPct: price ? Math.round((margin / price) * 100) : null }
}

// The crew lines of a quote (optional phases left out) against the rate card. Price and cost
// count only lines with a rate; missing counts crew lines without one.
export function quoteCrewMargin(body, rates) {
  let price = 0, cost = 0, missing = 0, lines = 0
  for (const p of body?.phases || []) {
    if (p.optional) continue
    for (const s of p.sections || []) for (const l of s.lines || []) {
      if (l.kind !== 'crew') continue
      lines++
      const c = quoteLineCost(l, rates)
      if (!c) { missing++; continue }
      price += c.price; cost += c.cost
    }
  }
  price = round2(price); cost = round2(cost)
  const margin = round2(price - cost)
  return { lines, missing, price, cost, margin, marginPct: price ? Math.round((margin / price) * 100) : null }
}

// What a fee form holds → the fee to send: { fee: { unit, rate, quantity } | null, total, bad }.
// An empty rate means no fee; a fixed fee counts once.
export function feeFromForm(form) {
  const rate = parseAmount(form?.rate)
  if (rate == null) return { fee: null, total: null, bad: false }
  const quantity = form.unit === 'fixed' ? 1 : parseAmount(form.quantity)
  if (Number.isNaN(rate) || !FEE_UNITS.includes(form.unit) || !(quantity > 0 && quantity <= 1000)) return { fee: null, total: null, bad: true }
  const fee = { unit: form.unit, rate, quantity }
  return { fee, total: feeTotal(fee), bad: false }
}

// The fee a job board offer starts from: the day rate the applicant sent, else the post's own pay
// (per day × the post's days, per job as a fixed amount, per hour with the hours left to fill in).
// Only in euros; a pay range starts from its lower figure.
export function offerFee(post, application) {
  const days = bookedDays(null, { start_date: post?.starts_on, end_date: post?.ends_on }).length || 1
  if (application?.day_rate != null && (application.currency || post?.currency || 'EUR') === 'EUR') {
    return { unit: 'day', rate: Number(application.day_rate), quantity: days }
  }
  if (post?.pay_mode !== 'fixed' || post.pay_amount == null || (post.currency || 'EUR') !== 'EUR') return null
  const rate = Number(post.pay_amount)
  if (post.pay_per === 'job') return { unit: 'fixed', rate, quantity: 1 }
  if (post.pay_per === 'hour') return { unit: 'hour', rate, quantity: null }
  return { unit: 'day', rate, quantity: days }
}

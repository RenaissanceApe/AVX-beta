import { round2 } from '../quotes'
import { resolveRate, bookedDays, suggestFee, feeTotal, callFee } from '../crewRates'
import { quoteRevenueLines } from './revenue'
import { gigTransport } from '../transportCost'

// Gig finance (step 10, docs/BUSINESS.md). The JS twin of public.gig_finance
// (supabase/migrations/20261221000000_gig_finance.sql); both are checked against the same fixtures
// (gigFinanceFixtures.json) by gigFinance.test.js and supabase/tests/gig_finance.sql, so change
// both together. The screens read the numbers from the database; this twin pins the rule down and
// holds the helpers the screens share.
//
// In euros (D42 c); other currencies are listed apart, never added in.
//   revenue     every accepted quote of the gig (the K1 rule); none accepted: the newest sent quote
//               ('estimate'); none: 'none'. Drafts never count.
//   labour      per person: the actual (an expense linked to their fee, else their approved days
//               plus a fixed fee once), else the planned (agreed fee, else the rate card: estimate)
//   subrentals  confirmed or returned (supplier's price, else the lines); a linked expense replaces it
//   repairs     on the gig, not charged to the client; a linked expense replaces the cost
//   other costs confirmed gig expenses not linked to anything above, capital ones left out
//               (an expense linked to a vehicle or trip counts here too)
//   transport   the gig's trips: km × cost per km + days used × cost per day, per vehicle (step 23,
//               V4: src/lib/transportCost.js, the twin of private.gig_transport; wrapped around
//               this body by 20270123000000_vehicle_costs.sql)
//   margin      revenue − cost; margin % when there is revenue

const EUR = 'EUR'
const round1 = v => Math.sign(v) * Math.round(Math.abs(v) * 10) / 10
const sum = (list, f = x => x) => round2(list.reduce((s, x) => s + (Number(f(x)) || 0), 0))
const by = (list, key) => (list || []).filter(Boolean).reduce((m, x) => m.set(x[key], x), new Map())

// The quotes that count for a gig: every accepted one; none: the newest sent one (an estimate)
export function countedQuotes(quotes) {
  const accepted = (quotes || []).filter(q => q.status === 'accepted')
  if (accepted.length) return { quotes: accepted, estimate: false }
  const sent = (quotes || []).filter(q => q.status === 'sent')
    .sort((a, b) => String(b.sent_at || b.updated_at || b.created_at || '').localeCompare(String(a.sent_at || a.updated_at || a.created_at || '')))
  return sent.length ? { quotes: [sent[0]], estimate: true } : { quotes: [], estimate: false }
}

// One gig's labour totals from its people, fees, rate card, approved days and crew-fee expenses
export function gigLabour({ gig, members, fees, rates, factors, entries, invoices }) {
  const feeOf = by((fees || []).filter(f => f.rate != null), 'user_id')
  const people = (members || []).map(m => {
    const fee = feeOf.get(m.user_id) || null
    const suggestion = suggestFee(resolveRate(rates, { userId: m.user_id, functionTitle: m.function_title }), bookedDays(m, gig), factors)
    const planned = fee ? feeTotal(fee) : suggestion?.total ?? null
    const invoice = (invoices || []).find(i => i.crew_fee_user_id === m.user_id)
    const approved = (entries || []).filter(e => e.user_id === m.user_id && e.status === 'approved' && !e.removed_at)
    const actual = invoice ? invoice.cost
      : approved.length ? round2(sum(approved, e => e.cost) + (fee?.unit === 'fixed' ? Number(fee.rate) : 0)) : null
    return { planned, actual, fromCard: !fee && suggestion != null }
  })
  const actuals = people.filter(p => p.actual != null)
  return {
    planned: sum(people, p => p.planned),
    actual: actuals.length ? sum(actuals, p => p.actual) : null,
    labour: sum(people, p => p.actual ?? p.planned),
    estimated: sum(people.filter(p => p.actual == null && p.fromCard), p => p.planned),
    people: people.length,
    missing: people.filter(p => p.actual == null && p.planned == null).length,
  }
}

// One gig's finance row, from its records (each list holds only this gig's rows, as the database
// reads them; expenses carry their category and the organisation's VAT setting through `cost`)
export function gigFinanceRow({ gig, quotes, members, fees, rates, factors, entries, subrentals, repairs, expenses, trips, vehicles, timeZone }) {
  const counted = countedQuotes(quotes)
  const lines = counted.quotes.flatMap(q => quoteRevenueLines(q, gig))
  const revenue = sum(lines.filter(l => l.currency === EUR), l => l.amount)
  const other = { revenue: {}, costs: {} }
  const addOther = (kind, currency, amount) => { other[kind][currency] = round2((other[kind][currency] || 0) + Number(amount)) }
  for (const l of lines) if (l.currency !== EUR) addOther('revenue', l.currency, l.amount)

  const live = (expenses || []).filter(e => e.status === 'confirmed' && !e.removed_at)
  const linkedTo = (key, id) => live.find(e => e[key] === id)
  const memberIds = new Set((members || []).map(m => m.user_id))
  const labour = gigLabour({ gig, members, fees, rates, factors, entries,
    invoices: live.filter(e => e.crew_fee_user_id && e.currency === EUR) })

  // A linked expense replaces the planned amount; in another currency it is listed apart
  const replaced = (planned, e) => {
    if (!e) return planned
    if (e.currency === EUR) return e.cost
    addOther('costs', e.currency, e.cost)
    return 0
  }
  const subrentals_ = (subrentals || [])
    .map(s => ({ s, e: linkedTo('subrental_id', s.id) }))
    .filter(({ s, e }) => ['confirmed', 'returned'].includes(s.status) || e)
    .map(({ s, e }) => replaced(s.quoted_total != null ? Number(s.quoted_total)
      : sum(s.lines || [], l => (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0)), e))
  const repairsAll = (repairs || []).map(r => {
    const e = linkedTo('repair_id', r.id)
    if (r.charge_client) return { charged: true, amount: e ? (e.currency === EUR ? e.cost : 0) : Number(r.cost) || 0 }
    return { charged: false, amount: replaced(Number(r.cost) || 0, e) }
  })
  const others = live.filter(e => !e.subrental_id && !e.repair_id && !e.stock_purchase && e.kind !== 'capital'
    && (!e.crew_fee_user_id || !memberIds.has(e.crew_fee_user_id)))
  for (const e of others) if (e.currency !== EUR) addOther('costs', e.currency, e.cost)

  const subTotal = sum(subrentals_)
  const repairTotal = sum(repairsAll.filter(r => !r.charged), r => r.amount)
  const otherTotal = sum(others.filter(e => e.currency === EUR), e => e.cost)
  const transport = gigTransport({ trips: (trips || []).filter(t => !t.gig_id || t.gig_id === gig.id), vehicles, timeZone })
  const cost = round2(labour.labour + subTotal + repairTotal + otherTotal + transport.transport)
  const margin = round2(revenue - cost)
  const otherCurrencies = Object.fromEntries(Object.entries(other).filter(([, v]) => Object.keys(v).length))
  return {
    gig_id: gig.id, gig_name: gig.name, start_date: gig.start_date ?? null, end_date: gig.end_date ?? null, gig_status: gig.status,
    revenue, revenue_source: counted.quotes.length ? (counted.estimate ? 'estimate' : 'accepted') : 'none', quotes: counted.quotes.length,
    labour_planned: labour.planned, labour_actual: labour.actual, labour: labour.labour, labour_estimated: labour.estimated,
    people: labour.people, people_missing: labour.missing,
    subrentals: subTotal, repairs: repairTotal, repairs_charged: sum(repairsAll.filter(r => r.charged), r => r.amount),
    other_costs: otherTotal, cost, estimated_cost: labour.estimated, margin,
    margin_pct: revenue > 0 ? round1((margin * 100) / revenue) : null,
    other_currencies: Object.keys(otherCurrencies).length ? otherCurrencies : null,
    transport: transport.transport, transport_km: transport.transport_km, transport_trips: transport.transport_trips,
    transport_km_missing: transport.transport_km_missing,
  }
}

// ── Helpers the screens share ────────────────────────────────────────────────

// Whether any part of a row is an estimate (the newest sent quote, rate-card labour)
export const isEstimate = row => row?.revenue_source === 'estimate' || Number(row?.estimated_cost) > 0

// Whether a row has a margin worth showing (gigs with no quote yet have costs only)
export const hasMargin = row => row?.revenue_source && row.revenue_source !== 'none'

// The organisation list's totals: revenue, cost, margin and margin %, how much is estimated, and
// how many gigs lose money (gigs without a quote count in cost but not in the negative count)
export function financeTotals(rows) {
  const list = rows || []
  const revenue = sum(list, r => r.revenue)
  const cost = sum(list, r => r.cost)
  const margin = round2(revenue - cost)
  return {
    gigs: list.length, revenue, cost, margin, marginPct: revenue > 0 ? round1((margin * 100) / revenue) : null,
    estimated: round2(sum(list.filter(r => r.revenue_source === 'estimate'), r => r.revenue) + sum(list, r => r.estimated_cost)),
    negative: list.filter(r => hasMargin(r) && Number(r.margin) < 0).length,
  }
}

// Report filters: status ('base:<status>' or 'own:<custom status id>'), gig type (an id, or
// 'none'), client (by name); the same as the revenue report's
export function filterFinanceRows(rows, { status = '', type = '', client = '' } = {}) {
  return (rows || []).filter(r => {
    if (status) {
      const [kind, value] = status.split(':')
      if (kind === 'base' && r.gig_status !== value) return false
      if (kind === 'own' && r.gig_custom_status_id !== value) return false
    }
    if (type === 'none' ? r.gig_type_id : type && r.gig_type_id !== type) return false
    if (client && r.client_name !== client) return false
    return true
  })
}

// "Save as agreed fees" on a completed gig: the rate card's suggestion for each person without an
// agreed fee, as the fee to store (with weekend days at a higher rate, one fixed amount, as a crew
// call offers it). People with no rate are left out.
export function cardFees({ gig, members, rates, factors, fees }) {
  const agreed = new Set((fees || []).filter(f => f.rate != null).map(f => f.user_id))
  return (members || [])
    .filter(m => !agreed.has(m.user_id))
    .map(m => ({ m, fee: callFee(suggestFee(resolveRate(rates, { userId: m.user_id, functionTitle: m.function_title }), bookedDays(m, gig), factors)) }))
    .filter(x => x.fee)
    .map(({ m, fee }) => ({ gig_id: gig.id, user_id: m.user_id, unit: fee.unit, rate: fee.rate, quantity: fee.quantity }))
}

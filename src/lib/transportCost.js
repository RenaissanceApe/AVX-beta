// Transport costs (step 23, V4; docs/BUSINESS.md, "How transport costs work"). The JS twin of
// private.gig_transport and public.vehicle_use (supabase/migrations/20270123000000_vehicle_costs.sql);
// both are checked against transportCostFixtures.json by transportCost.test.js and, copied
// verbatim, by supabase/tests/vehicle_costs.sql. Change both together.
//
// Per vehicle: km × cost_per_km + days used × cost_per_day. A day is used when at least one live
// trip with the vehicle is under way on it, on the organisation's clock: a trip over midnight uses
// both days, several trips on one day use it once (an arrival at exactly midnight doesn't use the
// next day). Trips without a vehicle cost nothing; a trip without km counts its days only.
import { round2 } from './quotes'
import { wallClock } from './timeZone'

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const nextDay = day => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }

// The days (YYYY-MM-DD on the organisation's clock) a trip is under way on, inside [from, until)
// when given
export function tripDays(trip, timeZone, from = null, until = null) {
  if (!trip?.departs_at || !trip?.arrives_at) return []
  let day = ymd(wallClock(trip.departs_at, timeZone))
  let last = ymd(wallClock(new Date(new Date(trip.arrives_at) - 1), timeZone))
  if (from && day < from) day = from
  if (until && last >= until) last = prevDay(until)
  if (last < day) last = day
  const out = []
  for (let d = day; d <= last && out.length < 400; d = nextDay(d)) out.push(d)
  return out
}
function prevDay(day) { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }

const live = trips => (trips || []).filter(t => !t.removed_at && t.vehicle_id)
const num = v => (v == null || v === '' ? 0 : Number(v) || 0)

// Running cost of a set of trips per vehicle: [{ vehicle_id, trips, km, km_missing, days, running }]
function perVehicle(trips, vehicles, timeZone, from, until) {
  const byId = new Map((vehicles || []).map(v => [v.id, v]))
  const groups = new Map()
  for (const t of trips) {
    const g = groups.get(t.vehicle_id) || { vehicle_id: t.vehicle_id, trips: 0, km: 0, km_missing: 0, days: new Set(), gigs: new Set() }
    g.trips += 1
    if (t.km == null || t.km === '') g.km_missing += 1
    else g.km += Number(t.km)
    if (t.gig_id) g.gigs.add(t.gig_id)
    for (const d of tripDays(t, timeZone, from, until)) g.days.add(d)
    groups.set(t.vehicle_id, g)
  }
  return [...groups.values()].map(g => {
    const v = byId.get(g.vehicle_id) || {}
    const km = Math.round(g.km * 10) / 10
    return {
      vehicle_id: g.vehicle_id, trips: g.trips, gigs: g.gigs.size, km, km_missing: g.km_missing, days: g.days.size,
      running: round2(km * num(v.cost_per_km) + g.days.size * num(v.cost_per_day)),
    }
  })
}

// A gig's transport: its total (the gig finance line) and the parts per vehicle
export function gigTransport({ trips, vehicles, timeZone }) {
  const rows = perVehicle(live(trips), vehicles, timeZone)
  return {
    transport: round2(rows.reduce((s, r) => s + r.running, 0)),
    transport_km: Math.round(rows.reduce((s, r) => s + r.km, 0) * 10) / 10,
    transport_trips: rows.reduce((s, r) => s + r.trips, 0),
    transport_km_missing: rows.reduce((s, r) => s + r.km_missing, 0),
    vehicles: rows,
  }
}

// The vehicle-use report for a period [from, until): trips departing in it, days used inside it
// (across gigs, each day once per vehicle), running cost, confirmed expenses spent in it (euros;
// `cost` as private.expense_costs gives it). Live vehicles always have a row; removed ones only
// when they were used or had expenses.
export function vehicleUse({ vehicles, trips, expenses, timeZone, from, until }) {
  const inPeriod = live(trips).filter(t => { const d = ymd(wallClock(t.departs_at, timeZone)); return d >= from && d < until })
  const rows = new Map(perVehicle(inPeriod, vehicles, timeZone, from, until).map(r => [r.vehicle_id, r]))
  const spent = new Map()
  const other = new Map()
  for (const e of expenses || []) {
    if (!e.vehicle_id || e.removed_at || e.status !== 'confirmed' || e.spent_on < from || e.spent_on >= until) continue
    if ((e.currency || 'EUR') === 'EUR') spent.set(e.vehicle_id, round2((spent.get(e.vehicle_id) || 0) + num(e.cost)))
    else {
      const o = other.get(e.vehicle_id) || {}
      o[e.currency] = round2((o[e.currency] || 0) + num(e.cost))
      other.set(e.vehicle_id, o)
    }
  }
  return (vehicles || [])
    .filter(v => !v.removed_at || rows.has(v.id) || spent.has(v.id) || other.has(v.id))
    .map(v => {
      const r = rows.get(v.id) || { trips: 0, gigs: 0, km: 0, km_missing: 0, days: 0, running: 0 }
      const exp = spent.get(v.id) || 0
      return {
        vehicle_id: v.id, vehicle_name: v.name, plate: v.plate ?? null, removed_at: v.removed_at ?? null,
        max_load_kg: v.max_load_kg ?? null, volume_m3: v.volume_m3 ?? null,
        trips: r.trips, gigs: r.gigs, km: r.km, km_missing: r.km_missing, days: r.days, running: r.running,
        expenses: exp, total: round2(r.running + exp), load_kg: null, other_currencies: other.get(v.id) || null,
      }
    })
    .sort((a, b) => (!!a.removed_at - !!b.removed_at) || a.vehicle_name.localeCompare(b.vehicle_name))
}

// Report totals (euros): trips, km, days, running cost, expenses, total
export function vehicleUseTotals(rows) {
  const list = rows || []
  const add = k => list.reduce((s, r) => s + num(r[k]), 0)
  return {
    vehicles: list.filter(r => r.trips > 0).length, trips: add('trips'), km: Math.round(add('km') * 10) / 10, days: add('days'),
    running: round2(add('running')), expenses: round2(add('expenses')), total: round2(add('total')),
    kmMissing: add('km_missing'),
  }
}

// Load against capacity, as a share of max_load_kg (null when either is unknown)
export const loadShare = row => (row?.load_kg != null && Number(row?.max_load_kg) > 0 ? Math.round((Number(row.load_kg) * 100) / Number(row.max_load_kg)) : null)

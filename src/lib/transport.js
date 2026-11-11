// Vehicles and trips (step 23, V1; docs/BUSINESS.md, "How vehicles and trips work"): licence
// rules, the driving minutes a trip adds to someone's day, and checks before saving a trip.
// The database has the same licence rule (private.licence_covers).
import { wallClock, zonedInstant } from './timeZone'

export const LICENCE_CATEGORIES = ['B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE']
export const TRIP_DIRECTIONS = ['out', 'back', 'one_way']

// Holding these categories also lets you drive (EU licence rules): C covers C1, CE covers C, C1E
// and BE, D covers D1, and any C or D category means B is held.
const COVERED_BY = {
  B: ['BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE'],
  BE: ['C1E', 'CE', 'D1E', 'DE'],
  C1: ['C1E', 'C', 'CE'],
  C1E: ['CE'],
  C: ['CE'],
  D1: ['D1E', 'D', 'DE'],
  D1E: ['DE'],
  D: ['DE'],
}

export function licenceCovers(held, needed) {
  if (!needed) return true
  const list = held || []
  return list.includes(needed) || (COVERED_BY[needed] || []).some(c => list.includes(c))
}

// ok | missing | unknown (nothing recorded) | null (nothing to check)
export function licenceStatus(held, needed) {
  if (!needed) return null
  if (!held || !held.length) return 'unknown'
  return licenceCovers(held, needed) ? 'ok' : 'missing'
}

// Categories as stored: known ones only, once each, in the usual order
export function tidyCategories(list) {
  const set = new Set(list || [])
  return LICENCE_CATEGORIES.filter(c => set.has(c))
}

const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000))

// Minutes a person drove (as driver or co-driver) on a day of the organisation's clock, from
// the gig's trips. A trip across midnight counts on each day for the part driven on it.
export function drivingMinutes(trips, userId, day, timeZone) {
  if (!userId || !day) return 0
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const dayStart = zonedInstant(day, '00:00', timeZone)
  const dayEnd = zonedInstant(next.toISOString().slice(0, 10), '00:00', timeZone)
  let total = 0
  for (const trip of trips || []) {
    if (trip.removed_at || (trip.driver_id !== userId && trip.co_driver_id !== userId)) continue
    const from = Math.max(new Date(trip.departs_at), dayStart)
    const until = Math.min(new Date(trip.arrives_at), dayEnd)
    if (until > from) total += minutesBetween(from, until)
  }
  return Math.min(total, 1440)
}

// The days (on the organisation's clock) a person drives on, from the gig's trips
export function drivingDays(trips, userId, timeZone) {
  const days = new Set()
  for (const trip of trips || []) {
    if (trip.removed_at || (trip.driver_id !== userId && trip.co_driver_id !== userId)) continue
    const day = d => { const w = wallClock(d, timeZone); return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}` }
    days.add(day(trip.departs_at))
    days.add(day(new Date(new Date(trip.arrives_at) - 1)))
  }
  return [...days].sort()
}

// What's wrong with a trip before saving: a list of i18n keys (empty when it can be saved)
export function tripProblems(trip) {
  const out = []
  if (!trip.departs_at || !trip.arrives_at) out.push('transport.problem.times')
  else if (new Date(trip.arrives_at) <= new Date(trip.departs_at)) out.push('transport.problem.order')
  else if (new Date(trip.arrives_at) - new Date(trip.departs_at) > 7 * 24 * 3600 * 1000) out.push('transport.problem.long')
  if (trip.driver_id && trip.co_driver_id && trip.driver_id === trip.co_driver_id) out.push('transport.problem.sameDriver')
  const km = trip.km === '' || trip.km == null ? null : Number(trip.km)
  if (km != null && (!Number.isFinite(km) || km < 0 || km > 20000)) out.push('transport.problem.km')
  return out
}

// The return leg that goes with an outward trip: same vehicle and people, the other way round
export function returnLeg(trip, back) {
  return {
    ...trip, id: undefined, direction: 'back',
    from_place: trip.to_place || '', to_place: trip.from_place || '',
    departs_at: back?.departs_at || '', arrives_at: back?.arrives_at || '',
  }
}

// Duration in minutes (0 when the times are missing or reversed)
export const tripMinutes = trip => (trip?.departs_at && trip?.arrives_at ? minutesBetween(trip.departs_at, trip.arrives_at) : 0)

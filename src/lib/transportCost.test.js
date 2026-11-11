import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import fx from './transportCostFixtures.json'
import { costOf } from './expenses'
import { gigFinanceRow } from './analytics/gigFinance'
import { tripDays, gigTransport, vehicleUse, vehicleUseTotals, loadShare } from './transportCost'

// The fixtures as the database reads them: keys become ids
const tz = fx.time_zone
const categories = new Map(fx.categories.map(c => [c.key, c]))
const vehicles = fx.vehicles.map(v => ({ ...v, id: v.key, removed_at: v.removed ? '2027-03-01T00:00:00Z' : null }))
const trips = fx.trips.map(t => ({ ...t, id: t.key, gig_id: t.gig, vehicle_id: t.vehicle, removed_at: t.removed ? '2027-03-01T00:00:00Z' : null }))
const tripGig = new Map(fx.trips.map(t => [t.key, t.gig]))
const expenses = fx.expenses.map(e => ({
  ...e, id: e.key, vehicle_id: e.vehicle, trip_id: e.trip || null, gig_id: e.trip ? tripGig.get(e.trip) : null,
  status: 'confirmed', removed_at: e.removed ? '2027-03-16T00:00:00Z' : null,
  kind: categories.get(e.category)?.kind ?? null, cost: costOf(e, categories.get(e.category), fx.recovers_vat),
}))

describe('transport costs (shared fixtures)', () => {
  for (const [gigKey, expected] of Object.entries(fx.expect_gigs)) {
    it(`adds the transport line to ${gigKey}'s finance`, () => {
      const gig = { ...fx.gigs.find(g => g.key === gigKey), id: gigKey, status: 'confirmed' }
      const row = gigFinanceRow({
        gig, quotes: [], members: [], fees: [], rates: [], factors: {}, entries: [], subrentals: [], repairs: [],
        expenses: expenses.filter(e => e.gig_id === gigKey), trips, vehicles, timeZone: tz,
      })
      for (const [key, value] of Object.entries(expected)) expect([key, row[key]]).toEqual([key, value])
    })
  }

  for (const [gigKey, perVehicle] of Object.entries(fx.expect_gig_vehicles)) {
    it(`splits ${gigKey}'s transport per vehicle`, () => {
      const got = gigTransport({ trips: trips.filter(t => t.gig_id === gigKey), vehicles, timeZone: tz }).vehicles
      expect(got.map(r => r.vehicle_id).sort()).toEqual(Object.keys(perVehicle).sort())
      for (const [vehicle, expected] of Object.entries(perVehicle)) {
        const row = got.find(r => r.vehicle_id === vehicle)
        for (const [key, value] of Object.entries(expected)) expect([vehicle, key, row[key]]).toEqual([vehicle, key, value])
      }
    })
  }

  for (const p of fx.periods) {
    it(`reports vehicle use from ${p.from} to ${p.until}`, () => {
      const rows = vehicleUse({ vehicles, trips, expenses, timeZone: tz, from: p.from, until: p.until })
      expect(rows.map(r => r.vehicle_id).sort()).toEqual([...p.vehicles].sort())
      for (const [vehicle, expected] of Object.entries(p.expect)) {
        const row = rows.find(r => r.vehicle_id === vehicle)
        for (const [key, value] of Object.entries(expected)) expect([vehicle, key, row[key]]).toEqual([vehicle, key, value])
      }
    })
  }

  it('is copied verbatim into the database test', () => {
    const sql = readFileSync(new URL('../../supabase/tests/vehicle_costs.sql', import.meta.url), 'utf8')
    const m = /\$fixtures\$([\s\S]*?)\$fixtures\$/.exec(sql)
    expect(m).not.toBe(null)
    expect(JSON.parse(m[1])).toEqual(fx)
  })
})

describe('transport cost helpers', () => {
  it('counts the days a trip is under way on the organisation clock', () => {
    const t = { departs_at: '2027-03-12T22:00:00Z', arrives_at: '2027-03-13T01:30:00Z' }
    expect(tripDays(t, 'Europe/Lisbon')).toEqual(['2027-03-12', '2027-03-13'])
    // In New York the same trip is still on the 12th
    expect(tripDays(t, 'America/New_York')).toEqual(['2027-03-12'])
    // Arriving at midnight doesn't use the next day
    expect(tripDays({ departs_at: '2027-03-20T20:00:00Z', arrives_at: '2027-03-21T00:00:00Z' }, 'UTC')).toEqual(['2027-03-20'])
    // Clipped to a period
    expect(tripDays({ departs_at: '2027-03-01T08:00:00Z', arrives_at: '2027-03-04T08:00:00Z' }, 'UTC', '2027-03-02', '2027-03-04'))
      .toEqual(['2027-03-02', '2027-03-03'])
    expect(tripDays({ departs_at: '', arrives_at: '' }, 'UTC')).toEqual([])
  })

  it('costs nothing without trips, vehicles or rates', () => {
    expect(gigTransport({ trips: [], vehicles: [], timeZone: 'UTC' })).toMatchObject({ transport: 0, transport_trips: 0 })
    const one = gigTransport({ trips: [{ vehicle_id: 'x', departs_at: '2027-01-01T08:00:00Z', arrives_at: '2027-01-01T09:00:00Z', km: 10 }], vehicles: [], timeZone: 'UTC' })
    expect(one).toMatchObject({ transport: 0, transport_km: 10, transport_trips: 1 })
  })

  it('adds up the report', () => {
    const rows = vehicleUse({ vehicles, trips, expenses, timeZone: tz, from: '2027-03-01', until: '2027-04-01' })
    expect(vehicleUseTotals(rows)).toEqual({ vehicles: 3, trips: 6, km: 430, days: 6, running: 420, expenses: 62.5, total: 482.5, kmMissing: 1 })
    expect(vehicleUseTotals([])).toMatchObject({ trips: 0, total: 0 })
  })

  it('shows load against capacity only when both are known', () => {
    expect(loadShare({ load_kg: 600, max_load_kg: 1200 })).toBe(50)
    expect(loadShare({ load_kg: null, max_load_kg: 1200 })).toBe(null)
    expect(loadShare({ load_kg: 600, max_load_kg: null })).toBe(null)
  })
})

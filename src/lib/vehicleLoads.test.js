import { describe, it, expect } from 'vitest'
import {
  parseDimensionsM3, itemVolume, buildGroups, loadsByTrip, loadRows, unassigned, tripTotals,
  suggestSplit, moveLoad, vehicleItems, loadTrips,
} from './vehicleLoads'

const line = (item_id, quantity, extra = {}) => ({ item_id, item_name: item_id, category: 'Audio', quantity, kit_type: null, weight_kg: null, volume_m3: null, dimensions: null, ...extra })

describe('parseDimensionsM3', () => {
  it('reads three numbers and a unit', () => {
    expect(parseDimensionsM3('60 x 40 x 50 cm')).toBe(0.12)
    expect(parseDimensionsM3('600×400×500mm')).toBe(0.12)
    expect(parseDimensionsM3('0,6 x 0,4 x 0,5 m')).toBe(0.12)
    expect(parseDimensionsM3('60cm x 40cm x 50cm')).toBe(0.12)
  })
  it('gives unknown when the unit is missing, mixed or the text is something else', () => {
    expect(parseDimensionsM3('60 x 40 x 50')).toBeNull()
    expect(parseDimensionsM3('60mm x 40cm x 50cm')).toBeNull()
    expect(parseDimensionsM3('19" 2U')).toBeNull()
    expect(parseDimensionsM3('')).toBeNull()
    expect(parseDimensionsM3(null)).toBeNull()
    expect(parseDimensionsM3('0 x 40 x 50 cm')).toBeNull()
  })
  it('prefers the volume entered on the item', () => {
    expect(itemVolume({ volume_m3: '0.2', dimensions: '60 x 40 x 50 cm' })).toBe(0.2)
    expect(itemVolume({ volume_m3: null, dimensions: '60 x 40 x 50 cm' })).toBe(0.12)
    expect(itemVolume({ volume_m3: null, dimensions: null })).toBeNull()
    expect(itemVolume({ volume_m3: 0 })).toBe(0)
  })
})

describe('buildGroups', () => {
  const lines = [
    line('case', 2, { kit_type: 'case', weight_kg: 20, volume_m3: 0.5 }),
    line('mic', 10, { weight_kg: 0.5, volume_m3: 0.001 }),
    line('stand', 3, { weight_kg: 3 }),
  ]
  const parts = [{ case_id: 'case', child_id: 'mic', quantity: 4 }]

  it('keeps cases whole with their contents, and leaves the rest of a line loose', () => {
    const groups = buildGroups(lines, parts)
    const c = groups.find(g => g.item_id === 'case')
    expect(c).toMatchObject({ kind: 'case', count: 2, kg: 22, m3: 0.5 })
    expect(c.contents).toEqual([{ item_id: 'mic', quantity: 4 }])
    expect(groups.find(g => g.item_id === 'mic')).toMatchObject({ kind: 'item', count: 2 })
    expect(groups[0].kind).toBe('case')
  })
  it('drops a line the cases hold completely', () => {
    const groups = buildGroups([line('case', 3, { kit_type: 'case', weight_kg: 20 }), line('mic', 10, { weight_kg: 0.5 })], parts)
    expect(groups.find(g => g.item_id === 'mic')).toBeUndefined()
  })
  it('never treats a missing weight as zero', () => {
    const groups = buildGroups([line('case', 1, { kit_type: 'case', weight_kg: 20 }), line('di', 1)], [{ case_id: 'case', child_id: 'di', quantity: 2 }])
    expect(groups.find(g => g.item_id === 'case').kg).toBeNull()
    expect(buildGroups([line('x', 1)])[0]).toMatchObject({ kg: null, m3: null })
  })
  it('weighs contents that are not on the list from the items given', () => {
    const groups = buildGroups([line('case', 1, { kit_type: 'case', weight_kg: 10 })], [{ case_id: 'case', child_id: 'cable', quantity: 5 }], { cable: { weight_kg: 1 } })
    expect(groups[0].kg).toBe(15)
  })
})

describe('loads', () => {
  const groups = buildGroups([line('a', 5, { weight_kg: 10 }), line('b', 2, { weight_kg: 1 })])

  it('reads stored rows, ignoring other trips and anything beyond what the line has', () => {
    const rows = [
      { trip_id: 't1', item_id: 'a', quantity: 4 },
      { trip_id: 't2', item_id: 'a', quantity: 4 },
      { trip_id: 'gone', item_id: 'b', quantity: 1 },
      { trip_id: 't1', item_id: 'removed', quantity: 1 },
      { trip_id: 't2', item_id: 'b', quantity: 0 },
    ]
    const byTrip = loadsByTrip(rows, groups, ['t1', 't2'])
    expect(byTrip).toEqual({ t1: { a: 4 }, t2: { a: 1 } })
    expect(unassigned(groups, byTrip)).toEqual({ b: 2 })
    expect(loadRows(byTrip)).toEqual([{ trip_id: 't1', item_id: 'a', quantity: 4 }, { trip_id: 't2', item_id: 'a', quantity: 1 }])
  })

  it('moves between vehicles and back off, never more than there is', () => {
    let byTrip = { t1: { a: 4 }, t2: {} }
    byTrip = moveLoad(byTrip, 'a', 't1', 't2', 3, groups)
    expect(byTrip).toEqual({ t1: { a: 1 }, t2: { a: 3 } })
    byTrip = moveLoad(byTrip, 'a', 't2', null, 10, groups)
    expect(byTrip).toEqual({ t1: { a: 1 }, t2: {} })
    byTrip = moveLoad(byTrip, 'a', null, 't2', 10, groups)
    expect(byTrip).toEqual({ t1: { a: 1 }, t2: { a: 4 } })
    expect(moveLoad(byTrip, 'nope', null, 't1', 1, groups)).toEqual(byTrip)
  })

  it('totals a vehicle, counting unknowns apart and flagging over capacity', () => {
    const g = buildGroups([line('a', 5, { weight_kg: 300, volume_m3: 1 }), line('u', 3)])
    const tot = tripTotals(g, { a: 4, u: 3 }, { max_load_kg: 1000, volume_m3: 10 })
    expect(tot).toMatchObject({ kg: 1200, m3: 4, units: 7, unknownKg: 3, unknownM3: 3, overKg: true, overM3: false })
    expect(tripTotals(g, { a: 4 }, { max_load_kg: null, volume_m3: null })).toMatchObject({ overKg: false, overM3: false, maxKg: null })
  })

  it('lists what a vehicle carries with its cases\' contents, for scanning out', () => {
    const g = buildGroups([line('case', 2, { kit_type: 'case' }), line('mic', 10)], [{ case_id: 'case', child_id: 'mic', quantity: 4 }])
    expect(vehicleItems(g, { case: 1, mic: 2 })).toEqual({ case: 1, mic: 6 })
  })

  it('only offers outward trips with a vehicle, in time order', () => {
    const trips = [
      { id: '3', vehicle_id: 'v', direction: 'out', departs_at: '2027-02-02T08:00:00Z' },
      { id: '1', vehicle_id: 'v', direction: 'back', departs_at: '2027-02-01T08:00:00Z' },
      { id: '2', vehicle_id: null, direction: 'out', departs_at: '2027-02-01T08:00:00Z' },
      { id: '4', vehicle_id: 'w', direction: 'one_way', departs_at: '2027-02-01T09:00:00Z' },
    ]
    expect(loadTrips(trips).map(t => t.id)).toEqual(['4', '3'])
  })
})

describe('suggestSplit', () => {
  const total = (byTrip, id) => Object.values(byTrip).reduce((s, items) => s + (items[id] || 0), 0)

  it('places everything, keeps cases whole and stays within capacity when it can', () => {
    const groups = buildGroups([
      line('amp-rack', 2, { kit_type: 'case', weight_kg: 400, volume_m3: 2 }),
      line('sub', 4, { weight_kg: 100, volume_m3: 1 }),
      line('cable', 20, { weight_kg: 5, volume_m3: 0.02 }),
    ])
    const trips = [{ id: 'van', max_load_kg: 800, volume_m3: 6 }, { id: 'truck', max_load_kg: 1500, volume_m3: 12 }]
    const { byTrip, over, unknownUnits } = suggestSplit(groups, trips)
    expect(over).toEqual([])
    expect(unknownUnits).toBe(0)
    for (const g of groups) expect(total(byTrip, g.item_id)).toBe(g.count)
    for (const t of trips) {
      const tot = tripTotals(groups, byTrip[t.id], t)
      expect(tot.overKg || tot.overM3).toBe(false)
    }
  })

  it('balances by how full each vehicle gets, not by raw weight', () => {
    const groups = buildGroups([line('box', 9, { weight_kg: 100, volume_m3: 0.1 })])
    const { byTrip } = suggestSplit(groups, [{ id: 'small', max_load_kg: 300 }, { id: 'big', max_load_kg: 600 }])
    expect(byTrip).toEqual({ small: { box: 3 }, big: { box: 6 } })
  })

  it('reports the vehicle that ends up over when nothing fits', () => {
    const groups = buildGroups([line('stage', 3, { weight_kg: 500 })])
    const { byTrip, over } = suggestSplit(groups, [{ id: 'van', max_load_kg: 600 }, { id: 'car', max_load_kg: 400 }])
    expect(total(byTrip, 'stage')).toBe(3)
    expect(over.length).toBeGreaterThan(0)
  })

  it('never splits a case, even when a vehicle is too small for it', () => {
    const groups = buildGroups([line('rack', 1, { kit_type: 'case', weight_kg: 900 }), line('in-rack', 4, { weight_kg: 10 })], [{ case_id: 'rack', child_id: 'in-rack', quantity: 4 }])
    expect(groups).toHaveLength(1)
    const { byTrip, over } = suggestSplit(groups, [{ id: 'a', max_load_kg: 500 }, { id: 'b', max_load_kg: 600 }])
    expect(Object.values(byTrip).filter(items => items.rack).map(items => items.rack)).toEqual([1])
    expect(over).toEqual(['b'])
  })

  it('counts units without weight or volume and spreads them instead of piling them up', () => {
    const groups = buildGroups([line('mystery', 4), line('half', 2, { weight_kg: 10 })])
    const { byTrip, unknownUnits } = suggestSplit(groups, [{ id: 'a', max_load_kg: 100 }, { id: 'b', max_load_kg: 100 }])
    expect(unknownUnits).toBe(6)
    expect(byTrip.a.mystery).toBe(2)
    expect(byTrip.b.mystery).toBe(2)
  })

  it('spreads the load when no capacity is known', () => {
    const groups = buildGroups([line('box', 4, { weight_kg: 50 })])
    const { byTrip, over } = suggestSplit(groups, [{ id: 'a' }, { id: 'b' }])
    expect(byTrip).toEqual({ a: { box: 2 }, b: { box: 2 } })
    expect(over).toEqual([])
  })

  it('handles no trips and an empty list', () => {
    expect(suggestSplit(buildGroups([line('box', 1, { weight_kg: 1 })]), [])).toEqual({ byTrip: {}, over: [], unknownUnits: 0 })
    expect(suggestSplit([], [{ id: 'a', max_load_kg: 10 }])).toEqual({ byTrip: { a: {} }, over: [], unknownUnits: 0 })
  })
})

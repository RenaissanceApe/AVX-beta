import { describe, it, expect } from 'vitest'
import { suggestPlacement, inrushGroups, inrushWarnings, outputPhases } from './powerBalance'
import { supplyOf, distrosOf, gatherLoads, manualOf, powerPlan } from './power'

// A 63 A three-phase supply and one distro with an output on each phase (16 A breakers)
const power = {
  supply: { phases: 3, amps: 63 },
  distros: [{ id: 'd', name: 'Rack', input: 'cee32_3', feed: 'supply', outputs: [
    { id: 'a', connector: 'schuko', phase: 'L1', breaker_a: 16 },
    { id: 'b', connector: 'schuko', phase: 'L2', breaker_a: 16 },
    { id: 'c', connector: 'schuko', phase: 'L3', breaker_a: 16 },
  ] }],
}
const supply = supplyOf(power)
const distros = distrosOf(power)
const manual = watts => manualOf({ manual: watts.map((w, i) => ({ id: `m${i}`, name: `L${i}`, watts: w })) })

describe('phase balancing suggestion', () => {
  it('spreads loads so the phases end up close', () => {
    const loads = gatherLoads({ manual: manual([1610, 1150, 1150, 690, 690, 460]) })
    const plan = powerPlan({ supply, distros, loads, assign: {} })
    const s = suggestPlacement({ loads, distros, supply, assign: {}, plan })
    expect(s.unplaced).toEqual([])
    expect(s.moves).toHaveLength(6)
    // 7 + 5 + 5 + 3 + 3 + 2 = 25 A: biggest first gives 9 / 8 / 8
    expect(Math.max(...s.after) - Math.min(...s.after)).toBeLessThanOrEqual(1.01)
  })
  it('never fills an output above the reserve (80 % of 16 A = 12.8 A)', () => {
    const loads = gatherLoads({ manual: manual([1610, 1610, 1610, 1610]) }) // 7 A each
    const plan = powerPlan({ supply, distros, loads, assign: {} })
    const s = suggestPlacement({ loads, distros, supply, assign: {}, plan })
    for (const o of ['a', 'b', 'c']) expect(Math.max(...s.plan.distros.d.outputs[o].amps)).toBeLessThanOrEqual(12.8)
    expect(s.unplaced).toHaveLength(1) // three fit (one per output), the fourth doesn't
  })
  it('fill to a reserve uses the first output until it is full', () => {
    const loads = gatherLoads({ manual: manual([1150, 1150, 230]) }) // 5 + 5 + 1 A
    const plan = powerPlan({ supply, distros, loads, assign: {} })
    const s = suggestPlacement({ loads, distros, supply, assign: {}, plan, mode: 'reserve', reserve: 80 })
    expect(Object.values(s.assign).every(a => a.output === 'a')).toBe(true) // 11 A ≤ 12.8 A
    const strict = suggestPlacement({ loads, distros, supply, assign: {}, plan, mode: 'reserve', reserve: 50 }) // 8 A
    expect(new Set(Object.values(strict.assign).map(a => a.output)).size).toBe(2)
  })
  it('leaves loads already plugged in unless asked to move them', () => {
    const loads = gatherLoads({ manual: manual([2300, 230]) })
    const assign = { 'm:m0': { distro: 'd', output: 'a' } }
    const plan = powerPlan({ supply, distros, loads, assign })
    const keep = suggestPlacement({ loads, distros, supply, assign, plan })
    expect(keep.assign['m:m0']).toEqual({ distro: 'd', output: 'a' })
    expect(keep.moves.map(m => m.key)).toEqual(['m:m1'])
    expect(keep.assign['m:m1'].output).not.toBe('a')
  })
  it('without distros it places loads straight on the supply phases', () => {
    const loads = gatherLoads({ manual: manual([2300, 2300, 2300]) })
    const plan = powerPlan({ supply, distros: [], loads, assign: {} })
    const s = suggestPlacement({ loads, distros: [], supply, assign: {}, plan })
    expect(s.after).toEqual([10, 10, 10])
  })
  it('three-phase loads only go on three-phase places', () => {
    const loads = gatherLoads({ manual: manualOf({ manual: [{ id: 'x', name: 'Kitchen', watts: 6900, three: true }] }) })
    const plan = powerPlan({ supply, distros, loads, assign: {} })
    const s = suggestPlacement({ loads, distros, supply, assign: {}, plan })
    expect(s.unplaced).toEqual(['m:x']) // the distro has no 3P output
  })
  it('works out which phases each output carries', () => {
    expect(outputPhases(distros, supply)).toEqual({ 'd/a': [0], 'd/b': [1], 'd/c': [2] })
  })
})

describe('inrush groups', () => {
  const figures = { led: { w: 200, in: 20 }, old: { w: 500 } }
  const fixtures = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, name: `Wash ${i}`, item_id: 'led' }))
  const loads = gatherLoads({ fixtures: [...fixtures, { id: 'g', name: 'Old', item_id: 'old' }], figures })
  it('carries the datasheet inrush on each load', () => {
    expect(loads[0].inrush).toBe(20)
    expect(loads[5].inrush).toBeNull()
  })
  it('adds up the inrush on an output and flags it above 5 × the breaker', () => {
    const assign = Object.fromEntries(loads.map(l => [l.key, { distro: 'd', output: 'a' }]))
    const [g] = inrushGroups({ loads, distros, supply, assign })
    expect(g).toMatchObject({ key: 'd/a', inrush: 100, count: 6, missing: 1, rating: 16, state: 'over' }) // 100 A > 80 A
    const w = inrushWarnings([g], () => 'Rack · A')
    expect(w[0].key).toBe('power.warn.inrushOver')
  })
  it('between 3 and 5 × the breaker it may trip a B-curve breaker', () => {
    const assign = Object.fromEntries(loads.slice(0, 3).map(l => [l.key, { distro: 'd', output: 'b' }]))
    const [g] = inrushGroups({ loads, distros, supply, assign }) // 60 A on 16 A = 3.75 ×
    expect(g.state).toBe('near')
  })
  it('spread over the outputs, each stays under 3 ×', () => {
    const assign = { [loads[0].key]: { distro: 'd', output: 'a' }, [loads[1].key]: { distro: 'd', output: 'b' }, [loads[2].key]: { distro: 'd', output: 'c' } }
    expect(inrushGroups({ loads, distros, supply, assign }).every(g => g.state === 'ok')).toBe(true)
  })
})

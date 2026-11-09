import { describe, it, expect } from 'vitest'
import {
  CABLE_DATA, CABLE_TYPES, resistancePerM, voltageDrop, capacity, tableFactor, specOf, cablesOf, cableChecks, cableWarnings,
  cableList, nameKey, matchItems, cablesToEquipment, DRUM, BUNDLED, AMBIENT,
} from './cables'
import { supplyOf, distrosOf, manualOf, gatherLoads, powerPlan } from './power'

const close = (a, b, d = 0.01) => expect(Math.abs(a - b)).toBeLessThan(d)

describe('resistance at the running temperature', () => {
  it('copper at 20 °C is the datasheet value', () => {
    close(resistancePerM(7.98, 20), 0.00798, 1e-9)
  })
  it('at 60 °C it is 1 + 0.00393 × 40 = 1.1572 times higher', () => {
    close(resistancePerM(7.98, 60), 0.00798 * 1.1572, 1e-7)
  })
})

describe('voltage drop', () => {
  it('single-phase: 2 × R × L × I (out and back)', () => {
    // 3G2.5, 25 m, 16 A at 230 V: 2 × 0.00798 × 1.1572 × 25 × 16 = 7.39 V = 3.21 %
    const d = voltageDrop({ amps: 16, lengthM: 25, r20: 7.98, three: false, volts: 230 })
    close(d.volts, 7.39)
    close(d.pct, 3.21)
  })
  it('three-phase balanced: R × L × I, phase to neutral', () => {
    // 5G6, 50 m, 32 A at 230 V: 0.0033 × 1.1572 × 50 × 32 = 6.11 V = 2.66 %
    const d = voltageDrop({ amps: 32, lengthM: 50, r20: 3.30, three: true, volts: 230 })
    close(d.volts, 6.11)
    close(d.pct, 2.66)
  })
  it('doubles with twice the length or twice the current', () => {
    const a = voltageDrop({ amps: 10, lengthM: 10, r20: 4.95, three: false, volts: 230 })
    const b = voltageDrop({ amps: 10, lengthM: 20, r20: 4.95, three: false, volts: 230 })
    const c = voltageDrop({ amps: 20, lengthM: 10, r20: 4.95, three: false, volts: 230 })
    close(b.volts, a.volts * 2, 0.02)
    close(c.volts, a.volts * 2, 0.02)
  })
  it('is zero with no current or no length', () => {
    expect(voltageDrop({ amps: 0, lengthM: 10, r20: 7.98, three: false, volts: 230 })).toEqual({ volts: 0, pct: 0 })
    expect(voltageDrop({ amps: 10, lengthM: 0, r20: 7.98, three: false, volts: 230 })).toEqual({ volts: 0, pct: 0 })
  })
})

describe('current capacity', () => {
  it('in free air at 30 °C is the datasheet figure', () => {
    expect(capacity({ cores: '5G', mm2: 6 })).toEqual({ amps: 38, base: 38, factor: 1 })
    expect(capacity({ cores: '3G', mm2: 2.5 }).amps).toBe(25)
  })
  it('left on a drum: 0.80 for one layer, 0.49 for three', () => {
    expect(capacity({ cores: '5G', mm2: 16 }, { laying: 'drum', group: 1 }).amps).toBe(56.8)
    expect(capacity({ cores: '5G', mm2: 16 }, { laying: 'drum', group: 3 }).amps).toBe(34.8)
  })
  it('bundled with others takes the next row up when between rows (5 cables → the row for 6)', () => {
    expect(tableFactor(BUNDLED, 5)).toBe(0.57)
    close(capacity({ cores: '3G', mm2: 2.5 }, { laying: 'bundled', group: 5 }).amps, 14.25, 0.06)
  })
  it('a hotter ambient lowers it, and above 50 °C there is no figure', () => {
    expect(capacity({ cores: '3G', mm2: 2.5 }, { ambient: 40 }).amps).toBe(20.5)
    expect(capacity({ cores: '3G', mm2: 2.5 }, { ambient: 60 })).toBeNull()
  })
  it('factors multiply (drum and heat)', () => {
    const c = capacity({ cores: '5G', mm2: 35 }, { laying: 'drum', group: 2, ambient: 50 })
    close(c.amps, 114 * DRUM[2] * AMBIENT[50], 0.06)
  })
  it('a Socapex with 12 loaded cores is derated for many cores', () => {
    expect(capacity(specOf({ kind: 'power', type: 'socapex' })).amps).toBe(10)
  })
  it('unknown cable: null', () => {
    expect(capacity({ cores: '3G', mm2: 7 })).toBeNull()
  })
  it('every power type in the proposed set has datasheet figures', () => {
    for (const t of CABLE_TYPES.filter(x => x.kind === 'power')) expect(CABLE_DATA[t.cores][t.mm2]).toBeTruthy()
  })
})

describe('runs as saved', () => {
  it('keeps the limits and drops what is not a cable', () => {
    const list = cablesOf({ cables: [
      { id: 'a', kind: 'power', type: 'cee32_3', length: 9999, qty: 0, laying: 'drum', group: 9, link: 'd:x' },
      { id: 'b', kind: 'dmx', type: 'cee32_3', length: '5,5' },
      { id: 'c', kind: 'power', cores: '3G', mm2: 4, link: 'bad link with spaces/x/y' },
      { kind: 'power' },
    ] })
    expect(list).toHaveLength(3)
    expect(list[0]).toMatchObject({ length: 500, qty: 1, group: 5, link: 'd:x' })
    expect(list[1]).toMatchObject({ type: null, length: 5.5 })
    expect(list[2]).toMatchObject({ cores: '3G', mm2: 4, link: null })
  })
})

// A 63 A supply → a distro on 25 m of 5G16 → an output on 50 m of 3G2.5 with a 16 A breaker
function setup(watts, { feedLen = 25, outLen = 50, outType = 'cee16_1', laying = 'air' } = {}) {
  const power = {
    supply: { phases: 3, amps: 63 },
    distros: [{ id: 'd1', name: 'Rack', input: 'cee63_3', feed: 'supply', outputs: [{ id: 'o1', label: 'A', connector: 'cee16_1', phase: 'L1', breaker_a: 16 }] }],
    manual: [{ id: 'm', name: 'Heater', watts }],
    assign: { 'm:m': { distro: 'd1', output: 'o1' } },
    cables: [
      { id: 'f', kind: 'power', type: 'cee63_3', length: feedLen, link: 'd:d1' },
      { id: 'c', kind: 'power', type: outType, length: outLen, link: 'o:d1/o1', laying },
    ],
  }
  const supply = supplyOf(power)
  const distros = distrosOf(power)
  const plan = powerPlan({ supply, distros, loads: gatherLoads({ manual: manualOf(power) }), assign: power.assign })
  const cables = cablesOf(power)
  return { cables, checks: cableChecks({ cables, plan, distros, supply }) }
}

describe('cable checks on the plan', () => {
  it('adds the drop from the supply down: the output cable includes the distro feed', () => {
    const { checks } = setup(2300) // 10 A on L1
    const feed = checks.f, out = checks.c
    // feed: 5G16, 25 m, 10 A, three-phase: 0.00121 × 1.1572 × 25 × 10 = 0.35 V = 0.15 %
    close(feed.drop.pct, 0.15)
    close(out.drop.pct, 4.02) // 2 × 0.00798 × 1.1572 × 50 × 10 = 9.23 V
    close(out.total, feed.total + out.drop.pct, 0.02)
    expect(out.state).toBe('near') // above 3 %
  })
  it('flags a run above 5 % as over', () => {
    const { checks } = setup(3450, { outLen: 50 }) // 15 A → about 6 %
    expect(checks.c.total).toBeGreaterThan(5)
    expect(checks.c.state).toBe('over')
  })
  it('flags a cable that carries more than it may (left on a drum)', () => {
    const { checks, cables } = setup(3450, { outLen: 5, laying: 'drum' }) // 15 A on 3G2.5 on a drum: 20 A max
    expect(checks.c.cap.amps).toBe(20)
    expect(checks.c.overCurrent).toBe(false)
    const hot = setup(4830, { outLen: 5, laying: 'drum' }) // 21 A
    expect(hot.checks.c.overCurrent).toBe(true)
    expect(hot.checks.c.state).toBe('over')
    const w = cableWarnings(hot.checks, hot.cables, c => c.id)
    expect(w.some(x => x.key === 'power.warn.cableOver')).toBe(true)
    expect(cables).toHaveLength(2)
  })
  it('warns when the breaker in front is larger than the cable can carry', () => {
    const { checks } = setup(230, { outLen: 5, laying: 'bundled' }) // 3G2.5 bundled with one other: 20 A < 16 A breaker? no
    expect(checks.c.unprotected).toBe(false)
    const thin = setup(230, { outLen: 5, outType: 'schuko_15' }) // 3G1.5: 16 A, breaker 16 A: fine
    expect(thin.checks.c.unprotected).toBe(false)
    const drum = setup(230, { outLen: 5, outType: 'schuko_15', laying: 'drum' }) // 12.8 A < 16 A breaker
    expect(drum.checks.c.unprotected).toBe(true)
    expect(drum.checks.c.state).toBe('near')
  })
  it('a run not linked to the plan is not checked', () => {
    const supply = supplyOf({})
    const cables = cablesOf({ cables: [{ id: 'x', kind: 'power', type: 'cee32_3', length: 10 }] })
    const checks = cableChecks({ cables, plan: powerPlan({ supply, distros: [], loads: [], assign: {} }), distros: [], supply })
    expect(checks.x.state).toBe('unknown')
  })
})

describe('the cable list', () => {
  const cables = cablesOf({ cables: [
    { id: '1', kind: 'dmx', type: 'dmx5', length: 10, qty: 4 },
    { id: '2', kind: 'power', type: 'cee32_3', length: 25 },
    { id: '3', kind: 'power', type: 'cee32_3', length: 25, qty: 2 },
    { id: '4', kind: 'power', type: 'cee32_3', length: 10 },
    { id: '5', kind: 'power', cores: '3G', mm2: 4, length: 10 },
  ] })
  const lines = cableList(cables)
  it('groups runs by cable and length, power first', () => {
    expect(lines.map(l => [l.type || `${l.cores}${l.mm2}`, l.length, l.qty])).toEqual([
      ['3G4', 10, 1], ['cee32_3', 10, 1], ['cee32_3', 25, 3], ['dmx5', 10, 4],
    ])
  })
  it('matches catalogue items by name, ignoring case, spaces and the m of metres', () => {
    expect(nameKey('CEE 32A 5G6 – 25 m')).toBe(nameKey('cee32a 5g6-25m'))
    const items = [{ id: 'i1', name: 'DMX 5-pin 10 m' }, { id: 'i2', name: 'CEE 32 A three-phase 25m' }, { id: 'i3', name: 'Other' }]
    const nameOf = l => (l.type === 'dmx5' ? `DMX 5-pin ${l.length} m` : l.type === 'cee32_3' ? `CEE 32 A three-phase ${l.length} m` : 'x')
    const m = matchItems(lines, items, { 'power:cee32_3:10': 'i3' }, nameOf)
    expect(m['dmx:dmx5:10'].id).toBe('i1')
    expect(m['power:cee32_3:25'].id).toBe('i2')
    expect(m['power:cee32_3:10'].id).toBe('i3') // picked by hand
    expect(m['power:3G4:10']).toBeNull()
  })
  it('adds to the gig equipment only what is missing', () => {
    const matched = { a: { id: 'i1' }, b: { id: 'i1' }, c: { id: 'i2' } }
    const out = cablesToEquipment([{ key: 'a', qty: 2 }, { key: 'b', qty: 3 }, { key: 'c', qty: 1 }], matched, [{ id: 'e1', item_id: 'i1', quantity: 4 }])
    expect(out).toEqual([
      { item_id: 'i1', needed: 5, have: 4, add: 1, line_id: 'e1' },
      { item_id: 'i2', needed: 1, have: 0, add: 1, line_id: null },
    ])
  })
})

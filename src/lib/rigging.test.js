import { describe, it, expect } from 'vitest'
import { solveBeam, settingsOf, linesOf, analyseLine, fixturesOnBar, fingerprint, barRigging, defaultPoints, nextLineName, modelsById, looksLikeHoist, hoistCopy, DEFAULTS } from './rigging'

// Each expected value is a hand calculation (statics for determinate beams; the standard
// three-moment results for continuous beams of equal spans)
const close = (got, want) => want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 6))

describe('structural solver: simply supported', () => {
  it('point load: R1 = P·b/L, R2 = P·a/L', () => {
    // 100 kg at 3 m on a 10 m span → 100·7/10 = 70, 100·3/10 = 30
    close(solveBeam({ length: 10, supports: [0, 10], points: [{ at: 3, kg: 100 }] }), [70, 30])
  })
  it('uneven point loads', () => {
    // 60 kg at 2 m and 40 kg at 9 m on 10 m → R2 = (60·2 + 40·9)/10 = 48, R1 = 52
    close(solveBeam({ length: 10, supports: [0, 10], points: [{ at: 2, kg: 60 }, { at: 9, kg: 40 }] }), [52, 48])
  })
  it('distributed load: wL/2 each end', () => {
    // 10 kg/m on 8 m → 40 and 40
    close(solveBeam({ length: 8, supports: [0, 8], spans: [{ from: 0, to: 8, kg_m: 10 }] }), [40, 40])
  })
  it('part-length distributed load', () => {
    // 10 kg/m over the first 4 m of 10 m: 40 kg at 2 m → R2 = 40·2/10 = 8, R1 = 32
    close(solveBeam({ length: 10, supports: [0, 10], spans: [{ from: 0, to: 4, kg_m: 10 }] }), [32, 8])
  })
  it('a load right on a support goes straight into it', () => {
    close(solveBeam({ length: 6, supports: [0, 6], points: [{ at: 0, kg: 25 }] }), [25, 0])
  })
})

describe('structural solver: continuous', () => {
  it('two equal spans, distributed: 3/8 wL, 10/8 wL, 3/8 wL', () => {
    // w = 10 kg/m, spans of 5 m → 18.75, 62.5, 18.75
    close(solveBeam({ length: 10, supports: [0, 5, 10], spans: [{ from: 0, to: 10, kg_m: 10 }] }), [18.75, 62.5, 18.75])
  })
  it('three equal spans, distributed: 0.4 wL, 1.1 wL, 1.1 wL, 0.4 wL', () => {
    // w = 10 kg/m, spans of 4 m → 16, 44, 44, 16
    close(solveBeam({ length: 12, supports: [0, 4, 8, 12], spans: [{ from: 0, to: 12, kg_m: 10 }] }), [16, 44, 44, 16])
  })
  it('two equal spans, point load mid first span: 13/32, 22/32, −3/32 P', () => {
    // P = 100 kg at 2.5 m, spans of 5 m → 40.625, 68.75, −9.375 (the far end lifts)
    close(solveBeam({ length: 10, supports: [0, 5, 10], points: [{ at: 2.5, kg: 100 }] }), [40.625, 68.75, -9.375])
  })
  it('two equal spans, point load mid each span: 5/16, 22/16, 5/16 P', () => {
    // P = 100 kg at 2.5 m and 7.5 m → 31.25, 137.5, 31.25
    close(solveBeam({ length: 10, supports: [0, 5, 10], points: [{ at: 2.5, kg: 100 }, { at: 7.5, kg: 100 }] }), [31.25, 137.5, 31.25])
  })
  it('unequal spans and mixed loads stay in equilibrium', () => {
    const points = [{ at: 1.3, kg: 35 }, { at: 4.4, kg: 22 }, { at: 9.1, kg: 51 }]
    const spans = [{ from: 0, to: 11, kg_m: 7 }, { from: 2, to: 6, kg_m: 12 }]
    const supports = [0.5, 3.75, 10]
    const r = solveBeam({ length: 11, supports, points, spans })
    const total = 35 + 22 + 51 + 7 * 11 + 12 * 4
    const moment = 35 * 1.3 + 22 * 4.4 + 51 * 9.1 + 7 * 11 * 5.5 + 12 * 4 * 4
    expect(r.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 6)
    expect(r.reduce((a, b, i) => a + b * supports[i], 0)).toBeCloseTo(moment, 6)
  })
})

describe('structural solver: cantilevers', () => {
  it('point load at the tip of an overhang', () => {
    // 8 m line on points at 0 and 6 m, 100 kg at 8 m → R2 = 100·8/6 = 133.33, R1 = −33.33 (lifts)
    close(solveBeam({ length: 8, supports: [0, 6], points: [{ at: 8, kg: 100 }] }), [-100 / 3, 400 / 3])
  })
  it('distributed load with an overhang', () => {
    // 10 kg/m on 8 m, points at 0 and 6 m: 80 kg at 4 m → R2 = 80·4/6 = 53.33, R1 = 26.67
    close(solveBeam({ length: 8, supports: [0, 6], spans: [{ from: 0, to: 8, kg_m: 10 }] }), [80 / 3, 160 / 3])
  })
  it('overhang at both ends', () => {
    // 10 m line, points at 1 and 9 m, 10 kg/m → symmetrical, 50 and 50
    close(solveBeam({ length: 10, supports: [1, 9], spans: [{ from: 0, to: 10, kg_m: 10 }] }), [50, 50])
  })
})

describe('structural solver: what it refuses', () => {
  it('needs two points on the line at different places', () => {
    expect(solveBeam({ length: 6, supports: [3], points: [{ at: 3, kg: 10 }] })).toBe(null)
    expect(solveBeam({ length: 6, supports: [2, 2] })).toBe(null)
    expect(solveBeam({ length: 6, supports: [0, 7] })).toBe(null)
    expect(solveBeam({ length: 0, supports: [0, 1] })).toBe(null)
  })
  it('gives zero reactions with no load', () => {
    close(solveBeam({ length: 6, supports: [0, 3, 6] }), [0, 0, 0])
  })
})

describe('rigging lines', () => {
  const bar = { id: 'b1', name: 'Truss 1', kind: 'truss', x: 5, y: 4, length: 10, rotation: 0, height: null, phase: null }
  const fixtures = [
    { id: 'f1', name: 'Spot 1', position: 'Truss 1', universe: 1, address: 1, plot_x: 2, plot_y: 4, weight_kg: 30 },
    { id: 'f2', name: 'Spot 2', position: 'Truss 1', universe: 1, address: 20, plot_x: 8, plot_y: 4, weight_kg: 30 },
    { id: 'f3', name: 'Wash', position: 'Truss 1', universe: 1, address: 40, plot_x: 5, plot_y: 4, weight_kg: null },
  ]
  const models = modelsById([
    { id: 'm1', brand: 'X', model: '500', class: 'D8+', wll_kg: 500, self_weight_kg: 20 },
    { id: 'm2', brand: 'X', model: '250', class: 'D8', wll_kg: 100, self_weight_kg: 10 },
    { id: 'm3', brand: 'X', model: 'unknown', class: 'D8+', wll_kg: null },
    { id: 'gone', brand: 'X', model: 'old', class: 'C1', wll_kg: 1000, removed_at: '2026-01-01' },
  ])

  it('cleans settings and lines', () => {
    expect(settingsOf({})).toEqual(DEFAULTS)
    expect(settingsOf({ settings: { cable_kg_m: 500, dynamic_factor: 0.5 } })).toEqual({ cable_kg_m: 100, dynamic_factor: 1 })
    const [l] = linesOf({ lines: [{ id: 'l1', name: 'A', length_m: 99, points: [{ id: 'p', at_m: -2 }, { no: 'id' }], loads: [{ id: 'x', kg: 5, at_m: 1, to_m: '' }] }, { name: 'no id' }] })
    expect(l.length_m).toBe(40)
    expect(l.points).toEqual([{ id: 'p', at_m: 0, hoist_model_id: null, hoist: null, over_people: true, motor_on_line: false }])
    expect(l.loads[0].to_m).toBe(null)
    expect(l.cable_kg_m).toBe(null)
    expect(Object.keys(models)).toEqual(['m1', 'm2', 'm3'])
  })

  it('reads the fixtures off the light plot', () => {
    const on = fixturesOnBar(bar, [bar], fixtures)
    expect(on.map(f => [f.id, f.kg, f.at_m, f.known])).toEqual([['f1', 30, 2, true], ['f2', 30, 8, true], ['f3', 0, 5, false]])
    expect(fingerprint(bar, on)).toBe('10|f1:30:2,f2:30:8,f3:0:5')
  })

  it('adds up the loads and checks each point', () => {
    const on = fixturesOnBar(bar, [bar], fixtures)
    const [line] = linesOf({ lines: [{
      id: 'l1', bar_id: 'b1', truss_kg_m: 6, cable_kg_m: 4, accessories_kg: 10,
      loads: [{ id: 'x', name: 'Banner', kg: 20, at_m: 0, to_m: 10 }],
      points: [{ id: 'p1', at_m: 0, hoist_model_id: 'm1', motor_on_line: true }, { id: 'p2', at_m: 10, hoist_model_id: 'm2' }],
    }] })
    const a = analyseLine(line, { bar, onBar: on, models, settings: { cable_kg_m: 5, dynamic_factor: 1.2 } })
    // fixtures 60, truss 60, cable 40 (the line's own 4 kg/m), accessories 10, banner 20, motor 20
    expect(a.loads).toEqual({ fixtures: 60, truss: 60, cable: 40, accessories: 10, extra: 20, motors: 20 })
    expect(a.total).toBe(210)
    expect(a.unknownWeights).toBe(1)
    // Symmetrical except the motor at p1: p1 = 95 + 20 = 115, p2 = 95; ×1.2 → 138 and 114
    expect(a.results.map(r => [r.kg, r.dynamic_kg])).toEqual([[115, 138], [95, 114]])
    expect(a.results[0].status).toBe('ok')
    expect(a.results[0].use).toBeCloseTo(0.276, 3)
    // 114 kg on a 100 kg WLL, and a D8 over people
    expect(a.results[1].status).toBe('over')
    expect(a.results[1].peopleOk).toBe(false)
    expect(a.over).toBe(true)
  })

  it('flags points it can\'t check', () => {
    const [line] = linesOf({ lines: [{ id: 'l', length_m: 6, cable_kg_m: 0, truss_kg_m: 10,
      points: [{ id: 'a', at_m: 0, hoist_model_id: 'm3' }, { id: 'b', at_m: 6, over_people: false, hoist_model_id: 'm2' }, { id: 'c', at_m: 3 }] }] })
    const a = analyseLine(line, { models })
    expect(a.results.map(r => r.status)).toEqual(['noWll', 'noHoist', 'ok'])
    expect(a.results[2].peopleOk).toBe(true) // D8 not over people is fine
    const [few] = linesOf({ lines: [{ id: 'l', length_m: 6, points: [{ id: 'a', at_m: 1 }] }] })
    expect(analyseLine(few, {}).problem).toBe('fewPoints')
    const [offLine] = linesOf({ lines: [{ id: 'l', length_m: 6, points: [{ id: 'a', at_m: 1 }, { id: 'b', at_m: 9 }] }] })
    expect(analyseLine(offLine, {}).problem).toBe('pointOffLine')
  })

  it('uses the copy kept with the point when the model can\'t be read', () => {
    const copy = hoistCopy({ id: 'org1', brand: 'Acme', model: 'D8 250', class: 'D8', wll_kg: '250', self_weight_kg: '' })
    expect(copy).toEqual({ id: 'org1', brand: 'Acme', model: 'D8 250', class: 'D8', wll_kg: 250, self_weight_kg: null, needs_check: true })
    const [line] = linesOf({ lines: [{ id: 'l', length_m: 4, cable_kg_m: 0, truss_kg_m: 50,
      points: [{ id: 'a', at_m: 0, hoist_model_id: 'org1', hoist: copy, over_people: false }, { id: 'b', at_m: 4, hoist_model_id: 'org1', hoist: copy, over_people: false }] }] })
    const a = analyseLine(line, { settings: { cable_kg_m: 0, dynamic_factor: 1.2 } })
    // 200 kg of truss → 100 kg per point, ×1.2 = 120 kg of 250 kg
    expect(a.results.map(r => [r.status, r.use])).toEqual([['ok', 0.48], ['ok', 0.48]])
  })

  it('flags a point the line lifts off', () => {
    const [line] = linesOf({ lines: [{ id: 'l', length_m: 8, cable_kg_m: 0, loads: [{ id: 'x', kg: 100, at_m: 8 }],
      points: [{ id: 'a', at_m: 0, hoist_model_id: 'm1' }, { id: 'b', at_m: 6, hoist_model_id: 'm1' }] }] })
    const a = analyseLine(line, { models, settings: { cable_kg_m: 0, dynamic_factor: 1 } })
    expect(a.results[0].status).toBe('uplift')
    expect(a.over).toBe(true)
  })

  it('tells the light plot what to show', () => {
    const empty = { lines: [] }
    expect(barRigging(bar, [bar], [], empty, models)).toEqual({ state: 'none' })
    expect(barRigging(bar, [bar], fixtures, empty, models).state).toBe('notChecked')
    const on = fixturesOnBar(bar, [bar], fixtures)
    const line = { id: 'l1', bar_id: 'b1', truss_kg_m: 6, points: [{ id: 'a', at_m: 0, hoist_model_id: 'm1' }, { id: 'b', at_m: 10, hoist_model_id: 'm1' }] }
    expect(barRigging(bar, [bar], fixtures, { lines: [line] }, models).state).toBe('notChecked')
    const checked = { lines: [{ ...line, checked: { at: '2026-11-09', fingerprint: fingerprint(bar, on) } }] }
    expect(barRigging(bar, [bar], fixtures, checked, models).state).toBe('checked')
    // A fixture moved: not checked again
    const moved = fixtures.map(f => (f.id === 'f1' ? { ...f, plot_x: 3 } : f))
    expect(barRigging(bar, [bar], moved, checked, models).state).toBe('notChecked')
    // Overloaded shows whether checked or not
    const heavy = fixtures.map(f => ({ ...f, weight_kg: 400 }))
    expect(barRigging(bar, [bar], heavy, checked, models).state).toBe('over')
  })

  it('names and places new lines', () => {
    expect(nextLineName([{ name: 'Line 1' }], 'Line')).toBe('Line 2')
    expect(defaultPoints(10, i => `p${i}`).map(p => p.at_m)).toEqual([0.25, 9.75])
    expect(defaultPoints(2, i => `p${i}`).map(p => p.at_m)).toEqual([0, 2])
  })

  it('spots hoists in the gig\'s equipment', () => {
    expect(looksLikeHoist('CM Lodestar 1t D8+')).toBe(true)
    expect(looksLikeHoist('Chainmaster D8 Plus 500 kg')).toBe(true)
    expect(looksLikeHoist('Talha elétrica 1 t')).toBe(true)
    expect(looksLikeHoist('LED8 par')).toBe(false)
    expect(looksLikeHoist('Shure SM58')).toBe(false)
  })
})

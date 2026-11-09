import { describe, it, expect } from 'vitest'
import {
  loadCurrents, neutralCurrent, phaseBalance, generatorSuggestion, distroStatuses, feedChoices, outputPhaseIdx,
  supplyOf, distrosOf, manualOf, assignOf, gatherLoads, powerPlan, planWarnings, electricalProblems, electricalRow,
  electricalForm, figuresOf, stateOf,
} from './power'

const close = (a, b, d = 0.05) => expect(Math.abs(a - b)).toBeLessThan(d)

describe('single-phase and three-phase currents', () => {
  it('puts a single-phase load on one phase: I = VA / V', () => {
    expect(loadCurrents(2300, 230, [1])).toEqual([0, 10, 0])
  })
  it('spreads a three-phase load evenly: I = VA / (3 × V)', () => {
    const c = loadCurrents(6900, 230, [0, 1, 2])
    c.forEach(x => close(x, 10))
  })
  it('a 3 kW single-phase load at power factor 0.9 draws more current than at 1', () => {
    const plan = p => powerPlan({
      supply: supplyOf({ supply: { phases: 1 } }), distros: [],
      loads: gatherLoads({ manual: manualOf({ manual: [{ id: 'a', name: 'Oven', watts: 3000, pf: p }] }) }), assign: { 'm:a': { phase: 'L1' } },
    })
    close(plan(1).supply.amps[0], 13.0)
    close(plan(0.9).supply.amps[0], 14.5)
  })
})

describe('neutral current', () => {
  it('is zero on a balanced three-phase load', () => {
    close(neutralCurrent([10, 10, 10]), 0, 1e-6)
  })
  it('equals the phase current when only one phase is loaded', () => {
    close(neutralCurrent([16, 0, 0]), 16)
  })
  it('two equal phases and nothing on the third: the neutral carries the same current', () => {
    close(neutralCurrent([10, 10, 0]), 10)
  })
  it('matches √(a² + b² + c² − ab − bc − ca) for an unbalanced resistive load', () => {
    const [a, b, c] = [20, 10, 5]
    close(neutralCurrent([a, b, c]), Math.sqrt(a * a + b * b + c * c - a * b - b * c - c * a))
  })
  it('equal currents at different power factors no longer cancel', () => {
    expect(neutralCurrent([10, 10, 10], [0, 30, 0])).toBeGreaterThan(1)
  })
  it('the plan works out the neutral from the loads on each phase', () => {
    const loads = gatherLoads({ manual: manualOf({ manual: [
      { id: 'a', name: 'A', watts: 4600 }, { id: 'b', name: 'B', watts: 2300 },
    ] }) })
    const plan = powerPlan({ supply: supplyOf({}), distros: [], loads, assign: { 'm:a': { phase: 'L1' }, 'm:b': { phase: 'L2' } } })
    expect(plan.supply.amps).toEqual([20, 10, 0])
    close(plan.supply.neutral, Math.sqrt(400 + 100 - 200))
  })
  it('on a single-phase supply the neutral carries the whole current', () => {
    const loads = gatherLoads({ manual: manualOf({ manual: [{ id: 'a', name: 'A', watts: 2300 }] }) })
    const plan = powerPlan({ supply: supplyOf({ supply: { phases: 1 } }), distros: [], loads, assign: { 'm:a': { phase: 'L2' } } })
    expect(plan.supply.amps[0]).toBe(10)
    expect(plan.supply.neutral).toBe(10)
  })
})

describe('headroom, balance and the generator', () => {
  it('warns at 80% and above, over above 100%', () => {
    expect(stateOf(0.79)).toBe('ok')
    expect(stateOf(0.8)).toBe('near')
    expect(stateOf(1.01)).toBe('over')
  })
  it('measures the phase balance as the gap over the largest', () => {
    expect(phaseBalance([20, 10, 10])).toBe(0.5)
    expect(phaseBalance([0, 0, 0])).toBe(0)
  })
  it('sizes the generator from the busiest phase plus the margin, rounded up to a common size', () => {
    const g = generatorSuggestion([40, 20, 20], 230, 3, 25)
    close(g.kva, 27.6)
    close(g.needed, 34.5)
    expect(g.size).toBe(45)
    expect(generatorSuggestion([0, 0, 0], 230, 3).size).toBe(null)
    expect(generatorSuggestion([5000, 0, 0], 230, 3).size).toBe(null)
  })
})

describe('distros, outputs and statuses', () => {
  const power = {
    distros: [
      { id: 'main', name: 'Main', input: 'cee63_3', feed: 'supply', outputs: [
        { id: 'o1', connector: 'cee32_3', phase: '3P' }, { id: 'o2', connector: 'schuko', phase: 'L2', breaker_a: 16 },
      ] },
      { id: 'sub', name: 'Sub', input: 'cee32_3', feed: { distro: 'main', output: 'o1' }, outputs: [
        { id: 'a', connector: 'schuko', phase: 'L1', breaker_a: 16 }, { id: 'b', connector: 'schuko', phase: 'L3', breaker_a: 16 },
      ] },
      { id: 'loose', name: 'Loose', feed: null, outputs: [{ id: 'x', connector: 'schuko', phase: 'L1' }] },
      { id: 'hang', name: 'Hanging', feed: { distro: 'loose', output: 'x' }, outputs: [{ id: 'y', connector: 'schuko', phase: 'L1' }] },
    ],
  }
  const distros = distrosOf(power)

  it('says which distros reach the supply', () => {
    expect(distroStatuses(distros)).toEqual({ main: 'connected', sub: 'connected', loose: 'none', hang: 'partly' })
  })
  it('treats a loop as partly connected', () => {
    const loop = distrosOf({ distros: [
      { id: 'a', feed: { distro: 'b', output: 'o1' }, outputs: [{ id: 'o1' }] },
      { id: 'b', feed: { distro: 'a', output: 'o1' }, outputs: [{ id: 'o1' }] },
    ] })
    expect(distroStatuses(loop)).toEqual({ a: 'partly', b: 'partly' })
  })
  it('offers as feeds only distros not plugged into this one', () => {
    expect(feedChoices(distros, 'main').map(d => d.id)).toEqual(['loose', 'hang'])
    expect(feedChoices(distros, 'loose').map(d => d.id)).toEqual(['main', 'sub'])
  })
  it('maps output phases through single-phase and three-phase feeds', () => {
    expect(outputPhaseIdx({ phase: 'L2' }, [0, 1, 2])).toEqual([1])
    expect(outputPhaseIdx({ phase: '3P' }, [0, 1, 2])).toEqual([0, 1, 2])
    expect(outputPhaseIdx({ phase: 'L3' }, [1])).toEqual([1])
  })
  it('adds loads up per output, per distro and on the supply, with statuses', () => {
    const loads = gatherLoads({ manual: manualOf({ manual: [
      { id: 'p1', name: 'Bar fridge', watts: 2300 }, { id: 'p2', name: 'Kettle', watts: 3450 },
      { id: 'p3', name: 'Office', watts: 1150 }, { id: 'p4', name: 'Nowhere', watts: 500 }, { id: 'p5', name: 'Dangling', watts: 230 },
    ] }) })
    const assign = assignOf({ assign: {
      'm:p1': { distro: 'sub', output: 'a' }, 'm:p2': { distro: 'sub', output: 'b' }, 'm:p3': { distro: 'main', output: 'o2' },
      'm:p5': { distro: 'hang', output: 'y' },
    } })
    const plan = powerPlan({ supply: supplyOf({}), distros, loads, assign })
    expect(plan.distros.sub.outputs.a.amps).toEqual([10, 0, 0])
    expect(plan.distros.sub.outputs.b.amps).toEqual([0, 0, 15])
    expect(plan.distros.main.outputs.o1.amps).toEqual([10, 0, 15])
    expect(plan.distros.main.outputs.o2.amps).toEqual([0, 5, 0])
    expect(plan.supply.amps).toEqual([10, 5, 15])
    expect(plan.loads['m:p1'].status).toBe('connected')
    expect(plan.loads['m:p5'].status).toBe('partly')
    expect(plan.loads['m:p4'].status).toBe('none')
    expect(plan.unplugged).toEqual({ count: 2, watts: 730 })
    // the Sub distro's rating is its input connector (32 A) and the 32 A output feeding it
    expect(plan.distros.sub.rating).toBe(32)
  })
  it('warns when an output passes 80% of its breaker, and when it is over', () => {
    const loads = gatherLoads({ manual: manualOf({ manual: [{ id: 'k', name: 'Heater', watts: 3000 }, { id: 'h', name: 'Heater 2', watts: 4000 }] }) })
    const plan = powerPlan({ supply: supplyOf({}), distros, loads, assign: { 'm:k': { distro: 'sub', output: 'a' }, 'm:h': { distro: 'sub', output: 'b' } } })
    expect(plan.distros.sub.outputs.a.state).toBe('near') // 13 A of 16
    expect(plan.distros.sub.outputs.b.state).toBe('over') // 17.4 A of 16
    const keys = planWarnings(plan, distros, supplyOf({})).map(w => w.key)
    expect(keys[0]).toBe('power.warn.outputOver')
    expect(keys).toContain('power.warn.outputNear')
    expect(keys).toContain('power.warn.balance')
  })
})

describe('loads from the gig', () => {
  const figures = {
    spot: { w: 700, pf: 0.95, cin: 'powercon' },
    amp: { a: 8, v: 230, cin: 'cee16_1' },
    rack: { w: 9000, cin: 'cee32_3' },
    dist: { cin: 'cee63_3', distro: { inputs: [], outputs: [{ id: 'o1', connector: 'schuko', phase: 'L1' }] } },
    cable: {},
  }
  it('takes fixtures, sources, powered equipment not already counted, and typed loads', () => {
    const loads = gatherLoads({
      figures,
      fixtures: [{ id: 'f1', name: 'Spot 1', item_id: 'spot', power_w: 700 }, { id: 'f2', name: 'Par', power_w: null }],
      sources: [{ id: 's1', name: 'Main L', count: 3, item_id: 'amp' }],
      equipment: [
        { item_id: 'spot', item_name: 'Spot', quantity: 4 }, { item_id: 'amp', item_name: 'Amp', quantity: 3 },
        { item_id: 'rack', item_name: 'Video rack', quantity: 1 }, { item_id: 'dist', item_name: 'Distro', quantity: 2 },
        { item_id: 'cable', item_name: 'Cable', quantity: 30 },
      ],
      manual: manualOf({ manual: [{ id: 'm1', name: 'Catering', watts: 2000, qty: 2 }] }),
    })
    const by = Object.fromEntries(loads.map(l => [l.key, l]))
    expect(Object.keys(by)).toEqual(['fx:f1', 'fx:f2', 'sp:s1', 'eq:spot', 'eq:rack', 'm:m1'])
    expect(by['fx:f2'].unknown).toBe(true)
    // D77: amps from the datasheet count as amps × volts, and no watt figure is made up
    expect(by['sp:s1']).toMatchObject({ watts: null, va: 3 * 8 * 230, fromAmps: true })
    expect(by['eq:spot'].qty).toBe(3)
    expect(by['eq:rack'].three).toBe(true)
    expect(by['m:m1'].watts).toBe(4000)
  })
  it('counts unknown and amps-only loads in the totals', () => {
    const loads = gatherLoads({ figures, sources: [{ id: 's1', name: 'Sub', count: 1, item_id: 'amp' }], fixtures: [{ id: 'f', name: 'Par' }] })
    const plan = powerPlan({ supply: supplyOf({}), distros: [], loads, assign: {} })
    expect(plan.total).toMatchObject({ unknown: 1, fromAmps: 1, va: 1840 })
    // not plugged in: spread over the three phases for the generator
    close(plan.generator.kva, 1.84)
  })
})

describe('catalogue electrical fields', () => {
  it('checks the limits, the volts for datasheet amps and typical not above max', () => {
    expect(electricalProblems({ power_factor: '1.2', current_a: '8', connector_in: 'usb', power_w: '500', power_typical_w: '600' }))
      .toEqual({ power_factor: 'range', current_v: 'needVolts', connector_in: 'connector', power_typical_w: 'overMax' })
    expect(electricalProblems({ power_factor: '0,95', current_a: '8', current_v: '230', connector_in: 'cee16_1' })).toEqual({})
  })
  it('round-trips a distro through the form', () => {
    const item = { power_factor: 0.95, connector_in: 'cee63_3', distro: { inputs: [{ connector: 'cee63_3' }], outputs: [
      { id: 'o1', connector: 'cee32_3', phase: '3P', breaker_a: 32, rcd_ma: 30 }, { id: 'o2', connector: 'schuko', phase: 'L1' },
    ] } }
    const form = electricalForm(item)
    expect(form.is_distro).toBe(true)
    const row = electricalRow(form)
    expect(row.distro.outputs).toHaveLength(2)
    expect(row.distro.outputs[1]).toMatchObject({ connector: 'schuko', phase: 'L1', breaker_a: null })
    expect(row.power_factor).toBe(0.95)
    expect(electricalRow({ ...form, is_distro: false }).distro).toBe(null)
  })
  it('keeps what the power tool needs from an item', () => {
    expect(figuresOf({ name: 'Amp', power_w: null, current_a: 8, current_v: 230, connector_in: 'cee16_1' }))
      .toEqual({ a: 8, v: 230, cin: 'cee16_1', name: 'Amp' })
  })
})

describe('the light plot from the power plan', () => {
  it('shows only the fixtures, where they are plugged in', async () => {
    const { fixtureShare } = await import('./power')
    const power = { supply: { phases: 3, amps: 32 }, manual: [{ id: 'm', name: 'Bar', watts: 9000 }], assign: { 'fx:a': { phase: 'L2' }, 'm:m': { phase: 'L1' } } }
    const s = fixtureShare(power, [{ id: 'a', name: 'Spot', power_w: 2300 }, { id: 'b', name: 'Wash', power_w: 460 }])
    expect(s.amps).toEqual([0, 10, 0])
    expect(s).toMatchObject({ count: 2, unplugged: 1, watts: 2760, state: 'ok' })
  })
})

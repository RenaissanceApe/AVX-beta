import { describe, it, expect } from 'vitest'
import { guessSymbol, symbolOf, barsOf, supplyOf, barEnds, nextBarName, newBar, layoutFixtures, snapToBar, powerSummary, lightArea, viewArea } from './lightPlot'

const truss = { id: 'b1', name: 'Truss 1', kind: 'truss', x: 5, y: 4, length: 8, rotation: 0, height: 6, phase: 1 }
const ladder = { id: 'b2', name: 'Ladder SL', kind: 'ladder', x: -1, y: 3, length: 3, rotation: 90, height: null, phase: null }

describe('light plot', () => {
  it('guesses a symbol from the fixture type, unless one was chosen', () => {
    expect(guessSymbol('MAC Aura XB')).toBe('wash')
    expect(guessSymbol('Robe Pointe')).toBe('spot')
    expect(guessSymbol('Clay Paky Sharpy')).toBe('beam')
    expect(guessSymbol('ETC Source Four 26°')).toBe('profile')
    expect(guessSymbol('LED Par 64')).toBe('par')
    expect(guessSymbol('Hazer MDG')).toBe('haze')
    expect(guessSymbol('Molefay 4-lite')).toBe('blinder')
    expect(guessSymbol('Atomic 3000 strobe')).toBe('strobe')
    expect(guessSymbol('Mystery box')).toBe('other')
    expect(symbolOf({ fixture_type: 'MAC Aura', symbol: 'beam' })).toBe('beam')
    expect(symbolOf({ fixture_type: 'MAC Aura', symbol: 'nonsense' })).toBe('wash')
  })

  it('cleans bars and supply from the show model', () => {
    const bars = barsOf({ bars: [{ ...truss, length: 99, phase: 7, kind: 'rope' }, { name: 'no id' }, { ...ladder, rotation: 45 }] })
    expect(bars).toHaveLength(2)
    expect(bars[0]).toMatchObject({ length: 40, phase: null, kind: 'truss' })
    expect(bars[1].rotation).toBe(0)
    expect(barsOf(null)).toEqual([])
    expect(supplyOf({})).toEqual({ volts: 230, phases: 3, amps: 32 })
    expect(supplyOf({ supply: { volts: 120, phases: 1, amps: 20 } })).toEqual({ volts: 120, phases: 1, amps: 20 })
  })

  it('finds the ends of a bar and names the next one', () => {
    expect(barEnds(truss)).toEqual({ x1: 1, y1: 4, x2: 9, y2: 4 })
    expect(barEnds(ladder)).toEqual({ x1: -1, y1: 1.5, x2: -1, y2: 4.5 })
    expect(nextBarName([truss], 'Truss')).toBe('Truss 2')
    expect(nextBarName([], 'Pipe')).toBe('Pipe 1')
  })

  it('adds bars across the stage, one in front of the other', () => {
    const stage = { width_m: 10, depth_m: 6 }
    const one = newBar([], stage, 'truss', 'Truss 1', 'x1')
    expect(one).toMatchObject({ x: 5, y: 5, length: 10, rotation: 0 })
    const two = newBar([one], stage, 'truss', 'Truss 2', 'x2')
    expect(two.y).toBe(3.5)
    expect(newBar([], stage, 'ladder', 'Ladder 1', 'x3')).toMatchObject({ rotation: 90, length: 3, x: -1 })
    expect(newBar([], stage, 'floor', 'Floor 1', 'x4')).toMatchObject({ y: 0.5, height: 0 })
    expect(lightArea(stage)).toEqual({ x0: -3, x1: 13, y0: -8, y1: 9 })
    // The view fits the stage and what's on the plot, 1.5 m around, within those limits
    expect(viewArea(stage, [], {})).toEqual({ x0: -1.5, x1: 11.5, y0: -1.5, y1: 7.5 })
    expect(viewArea(stage, [{ ...truss, y: -3 }], { a: { x: 12.5, y: 0 } })).toEqual({ x0: -1.5, x1: 13, y0: -4.5, y1: 7.5 })
  })

  it('spaces fixtures along their bar and keeps the ones placed by hand', () => {
    const fixtures = [
      { id: 'a', name: 'Spot 1', universe: 1, address: 1, position: 'Truss 1' },
      { id: 'b', name: 'Spot 2', universe: 1, address: 15, position: 'truss 1' },
      { id: 'c', name: 'Spot 3', universe: 1, address: 29, position: 'Truss 1', plot_x: 2, plot_y: 4 },
      { id: 'd', name: 'Side', universe: 1, address: 40, position: 'Ladder SL' },
      { id: 'e', name: 'Lost', universe: 1, address: 50, position: 'Somewhere' },
      { id: 'f', name: 'Floor', universe: 1, address: 60, plot_x: 3, plot_y: 0.5 },
    ]
    const at = layoutFixtures([truss, ladder], fixtures)
    expect(at.a).toEqual({ x: 3.67, y: 4, bar: 'Truss 1', auto: true })
    expect(at.b).toEqual({ x: 6.33, y: 4, bar: 'Truss 1', auto: true })
    expect(at.c).toEqual({ x: 2, y: 4, bar: 'Truss 1', auto: false })
    expect(at.d).toEqual({ x: -1, y: 3, bar: 'Ladder SL', auto: true })
    expect(at.e).toBeUndefined()
    expect(at.f).toEqual({ x: 3, y: 0.5, bar: null, auto: false })
  })

  it('snaps a dropped fixture onto a bar close by', () => {
    expect(snapToBar([truss, ladder], 3.1, 4.4)).toEqual({ bar: truss, x: 3, y: 4 })
    expect(snapToBar([truss, ladder], -0.6, 2.1)).toEqual({ bar: ladder, x: -1, y: 2 })
    expect(snapToBar([truss, ladder], 5, 2)).toBe(null)
    // Past the end of a bar is measured to its end
    expect(snapToBar([truss], 9.5, 4)).toEqual({ bar: truss, x: 9, y: 4 })
  })

  it('adds up power and weight per bar and per phase, as estimates', () => {
    const fixtures = [
      { id: 'a', position: 'Truss 1', power_w: 460, weight_kg: 13.5 },
      { id: 'b', position: 'Truss 1', power_w: 460, weight_kg: 13.5 },
      { id: 'c', position: 'Ladder SL', power_w: null, weight_kg: null },
      { id: 'd', position: null, power_w: 1380, weight_kg: 20 },
    ]
    const p = powerSummary(fixtures, [truss, ladder], { volts: 230, phases: 3, amps: 16 })
    expect(p.bars[0]).toMatchObject({ name: 'Truss 1', count: 2, watts: 920, amps: 4, kg: 27, unknown: 0 })
    expect(p.bars[1]).toMatchObject({ count: 1, watts: 0, unknown: 1 })
    expect(p.loose).toMatchObject({ count: 1, watts: 1380, amps: 6 })
    expect(p.total).toMatchObject({ count: 4, watts: 2300, amps: 10, kg: 47, unknown: 1 })
    // Truss 1 is on phase 1; the floor hazer is shared over the three
    expect(p.phases.map(x => x.watts)).toEqual([1380, 460, 460])
    expect(p.over).toBe(false)
    expect(p.near).toBe(false)
    const small = powerSummary(fixtures, [truss, ladder], { volts: 230, phases: 1, amps: 9 })
    expect(small.phases).toHaveLength(1)
    expect(small.over).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { SYMBOLS, stageSize, place, nextRotation, newSpot, plotToInputs, plotChannelCount, snap } from './stagePlot'

const tr = key => key.split('.').pop()

describe('stage plot', () => {
  it('uses a sensible stage when the size is missing or silly', () => {
    expect(stageSize({})).toEqual({ width_m: 10, depth_m: 6 })
    expect(stageSize({ width_m: 1, depth_m: 50 })).toEqual({ width_m: 10, depth_m: 30 })
    expect(stageSize({ width_m: '12.5', depth_m: 8 })).toEqual({ width_m: 12.5, depth_m: 8 })
  })

  it('keeps things on the stage and on the 25 cm grid', () => {
    expect(snap(1.13)).toBe(1.25)
    expect(place(-3, 2.1, { width_m: 10, depth_m: 6 })).toEqual({ x: 0, y: 2 })
    expect(place(11, 9, { width_m: 10, depth_m: 6 })).toEqual({ x: 10, y: 6 })
    expect(nextRotation(270)).toBe(0)
    expect(newSpot([], {})).toEqual({ x: 3.5, y: 3 })
  })

  it('turns sound sources into channels, drums first, without repeating what is already there', () => {
    const items = [
      { id: 'v', kind: 'vocal_mic', x: 5, label: 'Ana' },
      { id: 'd', kind: 'drum_kit', x: 5 },
      { id: 'w', kind: 'wedge', x: 5 },
    ]
    const rows = plotToInputs(items, [{ channel: 3, plot_ref: 'd:0' }], tr)
    expect(rows.map(r => r.plot_ref)).toEqual(['d:1', 'd:2', 'd:3', 'd:4', 'd:5', 'd:6', 'v:0'])
    expect(rows[0].channel).toBe(4)
    expect(rows.at(-1)).toMatchObject({ channel: 10, source: 'vocal (Ana)', mic: 'SM58', stand: 'boom', phantom: false })
    expect(rows.find(r => r.plot_ref === 'd:2').phantom).toBe(true)
    expect(plotChannelCount(items)).toBe(SYMBOLS.drum_kit.inputs.length + 1)
  })
})

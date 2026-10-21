import { describe, it, expect } from 'vitest'
import { parseSocket, socketCode, boxesOf, nextBoxName, patchView, autoAssign } from './patch'
import { overlaps, nextFree, packAddresses, bulkFixtures, universeUse, dmxRange } from './dmx'

describe('audio patch', () => {
  it('reads and writes socket codes', () => {
    expect(parseSocket('SB1-03')).toEqual({ box: 'SB1', socket: 3 })
    expect(parseSocket('Drum box 12')).toEqual({ box: 'Drum box', socket: 12 })
    expect(parseSocket('SB1')).toBe(null)
    expect(socketCode('SB2', 7)).toBe('SB2-07')
  })

  it('cleans the boxes and names the next one', () => {
    const boxes = boxesOf({ boxes: [{ name: 'SB1', inputs: 32 }, { name: 'sb1', inputs: 8 }, { name: '', inputs: 4 }, { name: 'SB2', inputs: 500, split: 1 }] })
    expect(boxes).toEqual([{ name: 'SB1', inputs: 32, split: false }, { name: 'SB2', inputs: 128, split: true }])
    expect(nextBoxName(boxes)).toBe('SB3')
    expect(boxesOf(null)).toEqual([])
  })

  it('places lines in their sockets, spots clashes and fills free sockets in channel order', () => {
    const boxes = [{ name: 'SB1', inputs: 3, split: false }]
    const inputs = [
      { id: 'a', channel: 1, stage_box: 'SB1-01' }, { id: 'b', channel: 2, stage_box: 'sb1-01' },
      { id: 'c', channel: 3, stage_box: null }, { id: 'd', channel: 4, stage_box: 'SB9-01' }, { id: 'e', channel: 5 },
    ]
    const view = patchView(boxes, inputs)
    expect(view.clashes).toEqual(['SB1-01'])
    expect(view.loose.map(l => l.id)).toEqual(['c', 'd', 'e'])
    expect(autoAssign(boxes, inputs)).toEqual([{ id: 'c', stage_box: 'SB1-02' }, { id: 'd', stage_box: 'SB1-03' }])
  })
})

describe('DMX patch', () => {
  const fx = [
    { id: 'a', universe: 1, address: 1, footprint: 14 },
    { id: 'b', universe: 1, address: 10, footprint: 7 },
    { id: 'c', universe: 1, address: 30, footprint: 7 },
    { id: 'd', universe: 2, address: 1, footprint: 2 },
    { id: 'e', universe: 1, address: null, footprint: 7 },
  ]
  it('spots overlapping fixtures on the same universe only', () => {
    expect([...overlaps(fx)].sort()).toEqual(['a', 'b'])
  })

  it('finds the first gap that fits', () => {
    expect(nextFree(fx, 1, 7)).toBe(17)
    expect(nextFree(fx, 1, 14)).toBe(37)
    expect(nextFree(fx, 3, 512)).toBe(1)
    expect(nextFree([{ universe: 1, address: 1, footprint: 510 }], 1, 7)).toBe(null)
  })

  it('packs addresses and moves to the next universe when one is full', () => {
    const big = [{ id: 'x', footprint: 500 }, { id: 'y', footprint: 14 }, { id: 'z', footprint: 7 }]
    expect(packAddresses(big)).toEqual([
      { id: 'x', universe: 1, address: 1 }, { id: 'y', universe: 2, address: 1 }, { id: 'z', universe: 2, address: 15 },
    ])
  })

  it('adds fixtures in bulk on free addresses', () => {
    const rows = bulkFixtures(fx, { name: 'Wash', fixture_type: 'LED par', footprint: 7, count: 3 })
    expect(rows.map(r => [r.name, r.universe, r.address])).toEqual([['Wash 1', 1, 17], ['Wash 2', 1, 37], ['Wash 3', 1, 44]])
  })

  it('sums what each universe uses', () => {
    expect(universeUse(fx)).toEqual([{ universe: 1, channels: 28, fixtures: 4 }, { universe: 2, channels: 2, fixtures: 1 }])
    expect(dmxRange(fx[0])).toBe('1–14')
    expect(dmxRange(fx[4], 'n/a')).toBe('n/a')
  })
})

import { describe, it, expect } from 'vitest'
import {
  switchValues, addressToSwitches, switchesToAddress, switchesOn, toAbsolute, fromAbsolute, blockAddresses,
  percentToDmx, dmxToPercent, toCoarseFine, fromCoarseFine, toHex, fromHex,
} from './dmxCalc'

describe('dipswitches', () => {
  it('gives each switch its value', () => {
    expect(switchValues()).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256])
    expect(switchValues({ switches: 9, msbFirst: true })).toEqual([256, 128, 64, 32, 16, 8, 4, 2, 1])
    expect(switchValues({ switches: 10 })).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 0])
  })
  it('converts addresses both ways', () => {
    expect(switchesOn(1)).toEqual([1])
    expect(switchesOn(97)).toEqual([1, 6, 7]) // 1 + 32 + 64
    expect(switchesOn(511)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(switchesOn(97, { switches: 9, msbFirst: true })).toEqual([3, 4, 9])
    for (const a of [1, 2, 100, 256, 300, 511]) {
      for (const opts of [{ switches: 9 }, { switches: 10 }, { switches: 9, msbFirst: true }]) {
        expect(switchesToAddress(addressToSwitches(a, opts), opts)).toBe(a)
      }
    }
  })
  it('never sets the 10th switch', () => {
    expect(addressToSwitches(511, { switches: 10 })[9]).toBe(false)
  })
})

describe('addresses', () => {
  it('converts universe and address to an absolute channel and back', () => {
    expect(toAbsolute(1, 1)).toBe(1)
    expect(toAbsolute(2, 1)).toBe(513)
    expect(toAbsolute(0, 1, { zeroBased: true })).toBe(1)
    expect(toAbsolute(3, 513)).toBeNull()
    expect(toAbsolute(0, 1)).toBeNull()
    expect(fromAbsolute(1024)).toEqual({ universe: 2, address: 512 })
    expect(fromAbsolute(1025, { zeroBased: true })).toEqual({ universe: 2, address: 1 })
  })
  it('addresses a block and never splits a fixture across universes', () => {
    const rows = blockAddresses({ count: 4, footprint: 200, universe: 1, start: 1 })
    expect(rows.map(r => [r.universe, r.address, r.end, r.jumped])).toEqual([[1, 1, 200, false], [1, 201, 400, false], [2, 1, 200, true], [2, 201, 400, false]])
    expect(blockAddresses({ count: 3, footprint: 16, start: 481 }).map(r => r.address)).toEqual([481, 497, 1])
  })
})

describe('values', () => {
  it('converts percent, 16-bit and hex', () => {
    expect(percentToDmx(50)).toBe(128)
    expect(percentToDmx(100)).toBe(255)
    expect(dmxToPercent(128)).toBe(50.2)
    expect(toCoarseFine(32768)).toEqual({ coarse: 128, fine: 0 })
    expect(toCoarseFine(1000)).toEqual({ coarse: 3, fine: 232 })
    expect(fromCoarseFine(3, 232)).toBe(1000)
    expect(toHex(255)).toBe('FF')
    expect(toHex(10)).toBe('0A')
    expect(fromHex('0x1f')).toBe(31)
    expect(fromHex('zz')).toBeNull()
  })
})

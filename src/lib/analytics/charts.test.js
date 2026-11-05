import { describe, it, expect } from 'vitest'
import { niceScale, yOf, linePoints, shortNumber, seriesColour } from './charts'

describe('chart scales', () => {
  it('picks nice steps', () => {
    expect(niceScale([0, 87])).toEqual({ min: 0, max: 100, step: 25, ticks: [0, 25, 50, 75, 100] })
    expect(niceScale([1234])).toMatchObject({ min: 0, max: 1500, step: 500 })
    expect(niceScale([0.3])).toMatchObject({ max: 0.3, step: 0.1, ticks: [0, 0.1, 0.2, 0.3] })
    expect(niceScale([-40, 90])).toMatchObject({ min: -50, max: 100, step: 50 })
  })
  it('copes with nothing to show', () => {
    expect(niceScale([])).toMatchObject({ min: 0, max: 1 })
    expect(niceScale([0, 0])).toMatchObject({ min: 0, max: 1 })
  })
  it('places values', () => {
    const s = niceScale([0, 100])
    expect(yOf(0, s, 200)).toBe(200)
    expect(yOf(100, s, 200)).toBe(0)
    expect(yOf(50, s, 200)).toBe(100)
    expect(linePoints([0, 100], 10, 20, s)).toBe('0,20.0 10,0.0')
    expect(linePoints([5], 10, 20, s)).toBe('5,19.0')
    expect(linePoints([], 10, 20)).toBe('')
  })
  it('shortens numbers and cycles colours', () => {
    expect(shortNumber(1200)).toBe('1.2k')
    expect(shortNumber(3400000)).toBe('3.4M')
    expect(shortNumber(12.345)).toBe('12.35')
    expect(seriesColour(0)).toBe(seriesColour(6))
  })
})

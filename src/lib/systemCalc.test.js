import { describe, it, expect } from 'vitest'
import { offAxis, aimLoss, speedOfSound, travelMs, distance3, splAt, sumSpl, coverageWidth, settingsOf, sourcesOf, listenersOf, nearestMain, delays, listenerReport, coverage, newSource, newListener, nextName } from './systemCalc'

const settings = { temp_c: 20, haas_ms: 10, ear_m: 1.2 }
const mainL = { id: 'mL', name: 'Main L', kind: 'main', x: -1, y: 0, height: 1.2, spl: 136, angle: 100, count: 1, extra_ms: 0 }
const mainR = { ...mainL, id: 'mR', name: 'Main R', x: 11 }
const sub = { id: 'sb', name: 'Subs', kind: 'sub', x: 5, y: -0.5, height: 1.2, spl: 135, angle: 180, count: 2, extra_ms: 0 }
const delayL = { id: 'dL', name: 'Delay L', kind: 'delay', x: -1, y: -34.3, height: 1.2, spl: 128, angle: 90, count: 1, extra_ms: 0 }
const foh = { id: 'foh', name: 'FOH', x: 5, y: -25 }

describe('sound system calculator', () => {
  it('knows the speed of sound and travel times', () => {
    expect(speedOfSound(20)).toBeCloseTo(343.4, 1)
    expect(speedOfSound(0)).toBeCloseTo(331.3, 1)
    expect(travelMs(34.34, 20)).toBeCloseTo(100, 0)
    expect(distance3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 })).toBe(13)
  })

  it('estimates levels and coverage', () => {
    expect(splAt(130, 1)).toBe(130)
    expect(splAt(130, 2)).toBeCloseTo(124, 0)
    expect(splAt(130, 0.5)).toBe(130) // closer than 1 m counts as 1 m
    expect(splAt(130, 10, 4)).toBeCloseTo(116, 0)
    expect(sumSpl([100, 100])).toBeCloseTo(103, 0)
    expect(sumSpl([])).toBe(null)
    expect(coverageWidth(90, 10)).toBeCloseTo(20, 5)
    expect(coverageWidth(60, 10)).toBeCloseTo(11.55, 2)
  })

  it('cleans what the show model holds', () => {
    expect(settingsOf({})).toEqual({ temp_c: 20, haas_ms: 10, ear_m: 1.2 })
    expect(settingsOf({ temp_c: 99, haas_ms: -4 })).toMatchObject({ temp_c: 50, haas_ms: 0 })
    const [s] = sourcesOf({ sources: [{ id: 'a', kind: 'laser', x: 500, y: -999, spl: 300, angle: 0, count: 0 }, { name: 'no id' }] })
    expect(s).toMatchObject({ kind: 'main', x: 100, y: -250, spl: 160, angle: 1, count: 1, extra_ms: 0 })
    expect(listenersOf({ listeners: [{ id: 'l', name: 'FOH', x: '5', y: '-20' }] })).toEqual([{ id: 'l', name: 'FOH', x: 5, y: -20 }])
    expect(sourcesOf(null)).toEqual([])
  })

  it('delays a delay tower to its nearest main, plus the Haas offset', () => {
    const all = [mainL, mainR, delayL]
    expect(nearestMain(delayL, all).main.id).toBe('mL')
    const set = delays(all, [foh], settings)
    expect(set.mL).toEqual({ ms: 0, from: null, reason: 'main' })
    // 34.3 m ≈ 99.9 ms, plus 10
    expect(set.dL).toMatchObject({ ms: 109.9, from: 'mL', reason: 'follow' })
    expect(delays([delayL], [], settings).dL.reason).toBe('noMain')
  })

  it('lines the subs up with the mains at the first listener', () => {
    // At FOH the subs (nearer) arrive first: they wait for the mains
    const set = delays([mainL, mainR, sub], [foh], settings)
    expect(set.sb.reason).toBe('subLate')
    const dMain = Math.hypot(6, 25), dSub = 24.5
    expect(set.sb.ms).toBeCloseTo(Math.round(((dMain - dSub) / speedOfSound(20)) * 10000) / 10, 1)
    // Subs further back than the mains: the mains would wait instead
    const back = delays([mainL, { ...sub, y: 3 }], [foh], settings)
    expect(back.sb.reason).toBe('mainLate')
    expect(back.sb.ms).toBe(0)
    expect(delays([mainL, sub], [], settings).sb.reason).toBe('noListener')
  })

  it('checks how a delay arrives against its main at each listener', () => {
    const all = [mainL, delayL]
    const set = delays(all, [foh], settings)
    // Right behind the delay: the main arrives first, the delay ~10 ms later
    const back = listenerReport({ id: 'b', x: -1, y: -40 }, all, settings, set)
    const check = back.checks[0]
    expect(check.state).toBe('ok')
    expect(check.gap).toBeGreaterThan(9)
    expect(check.gap).toBeLessThan(11)
    // 40 ms more makes it an echo; 30 ms less makes it arrive before the main
    const stateWith = extra => { const list = [mainL, { ...delayL, extra_ms: extra }]; return listenerReport({ id: 'b', x: -1, y: -40 }, list, settings, delays(list, [foh], settings)).checks[0].state }
    expect(stateWith(40)).toBe('echo')
    expect(stateWith(-30)).toBe('early')
    expect(back.total).toBeGreaterThan(back.mains)
  })

  it('takes off level outside the angle and behind the box, but not for subs', () => {
    expect(offAxis({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe(0)
    expect(offAxis({ x: 0, y: 0 }, { x: 10, y: -10 })).toBeCloseTo(45, 5)
    expect(offAxis({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(180)
    expect(aimLoss({ kind: 'main', x: 0, y: 0, angle: 100 }, { x: 10, y: -10 })).toBe(0)
    expect(aimLoss({ kind: 'main', x: 0, y: 0, angle: 60 }, { x: 10, y: -10 })).toBe(12)
    expect(aimLoss({ kind: 'delay', x: 0, y: -30, angle: 90 }, { x: 0, y: -20 })).toBe(20)
    expect(aimLoss({ kind: 'sub', x: 0, y: 0, angle: 180 }, { x: 0, y: 10 })).toBe(0)
    // So at FOH, in front of a delay tower facing away, the tower is quiet and not checked
    const set = delays([mainL, delayL], [foh], settings)
    expect(listenerReport(foh, [mainL, delayL], settings, set).checks).toEqual([])
  })

  it('says how wide each source covers at the farthest listener', () => {
    const c = coverage([{ ...mainL, angle: 90, x: 0, y: 0, height: 1.2 }], [{ id: 'l', x: 0, y: -10 }, { id: 'm', x: 0, y: -20 }], settings)
    expect(c.mL).toEqual({ d: 20, width: 40 })
    expect(coverage([sub], [foh], settings).sb).toBe(null)
    // A listener behind a source doesn't count
    expect(coverage([{ ...delayL, angle: 90 }], [{ id: 'l', x: -1, y: -20 }], settings).dL).toBe(null)
    expect(coverage([mainL], [], settings).mL).toBe(null)
  })

  it('adds sources and listeners in sensible places with the next name', () => {
    expect(newSource([], 10, 'main', 'Main 1', 'a')).toMatchObject({ x: -1, kind: 'main' })
    expect(newSource([mainL], 10, 'main', 'Main 2', 'b')).toMatchObject({ x: 11 })
    expect(newSource([], 10, 'delay', 'Delay 1', 'c').y).toBe(-25)
    expect(newListener([], 10, 'FOH', 'l').y).toBe(-20)
    expect(nextName([mainL, mainR], 'Main')).toBe('Main 1')
    expect(nextName([{ name: 'Main 1' }], 'Main')).toBe('Main 2')
  })
})

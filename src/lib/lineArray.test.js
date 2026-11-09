import { describe, it, expect } from 'vitest'
import {
  framesFor, frameOf, arraysOf, arrayWeight, bumperCheck, pickLoads, analyseArray, sideView, arrayLoadsOnLine,
  framesFingerprint, dataCheckState, fromSource, differsFromSource, softwareFor,
} from './lineArray'
import { ARRAY_DATA } from '../data/lineArrays'
import { PRESETS } from '../data/speakers'
import { analyseLine, linesOf } from './rigging'

const preset = id => PRESETS.find(p => p.id === id)
const make = (over = {}) => arraysOf({ arrays: [{ id: 'a1', name: 'Main L', count: 8, ...over }] })[0]
const withPreset = (id, frameId, count, over = {}) => make({ preset: id, element_kg: preset(id).values.weight_kg, frame_id: frameId, count, ...over })

describe('the manufacturers\' data', () => {
  it('every frame has its document, page and wording, and belongs to a preset', () => {
    for (const [id, d] of Object.entries(ARRAY_DATA)) {
      expect(preset(id), id).toBeTruthy()
      for (const f of d.frames) {
        expect(d.source?.url, f.id).toMatch(/^https:\/\//)
        expect(d.source.version, f.id).toBeTruthy()
        expect(f.page, f.id).toBeGreaterThan(0)
        expect(f.quote.length, f.id).toBeGreaterThan(10)
        for (const p of f.parts) expect(p.quote, `${f.id} ${p.name}`).toBeTruthy()
        if (f.safe !== null && f.max !== null) expect(f.safe).toBeLessThanOrEqual(f.max)
      }
    }
  })
  it('a frame weighs the sum of its parts, and is unknown when a part isn\'t printed', () => {
    expect(framesFor('l-acoustics-k2').find(f => f.id === 'k2-bump-bar').kg).toBe(59.3)
    expect(framesFor('meyer-leopard')[0].kg).toBeNull()
    expect(framesFor('rcf-hdl-30-a')).toEqual([])
  })
  it('names the software that decides', () => {
    expect(softwareFor('l-acoustics-k2')).toBe('Soundvision')
    expect(softwareFor('db-v8')).toBe('ArrayCalc')
    expect(softwareFor('nexo-geo-m1220')).toBe('NS-1')
    expect(softwareFor('meyer-leopard')).toBe('MAPP')
  })
})

// The manufacturer's published example: d&b V-Series Rigging manual 1.12 en (10/2023), §1.3, opened
// 2026-11-09: "The Z5380 V Flying frame is designed to support a total system weight of 860 kg – SWL.
// This allows the suspension of a maximum of 24 x V-TOP cabinets or a SUB column consisting of a
// maximum of 13 x V-SUB cabinets. … arrays of up to 10 x V-TOP cabinets with a total system weight
// of 340 kg … in any vertical splay angle configuration." V8 34 kg, V-SUB 64 kg, frame 25.4 kg.
describe('d&b V-Series: the rigging manual\'s own limits', () => {
  it('10 V8 weigh the 340 kg the manual prints and pass in any splay', () => {
    const arr = withPreset('db-v8', 'z5380', 10, { splays: [0, 14, 14, 14, 14, 14, 14, 14, 14, 14] })
    const w = arrayWeight(arr)
    expect(w.elements).toBe(340)
    expect(w.total).toBe(365.4)
    expect(bumperCheck(arr).status).toBe('pass')
  })
  it('24 V8 stay under the 860 kg SWL but need ArrayCalc; 25 fail', () => {
    const arr = withPreset('db-v8', 'z5380', 24)
    expect(arrayWeight(arr).total).toBe(841.4)
    expect(bumperCheck(arr)).toEqual({ status: 'check', reasons: ['overSafe'] })
    expect(bumperCheck(withPreset('db-v8', 'z5380', 25)).status).toBe('fail')
  })
  it('10 V8 with extra load over 340 kg are no longer "any angle"', () => {
    expect(bumperCheck(withPreset('db-v8', 'z5380', 10, { extra_kg: 5 }))).toEqual({ status: 'check', reasons: ['overSafeKg'] })
  })
  it('13 V-SUB weigh 857.4 kg with the frame, inside the SWL; 3 kg more fails it; 14 fail', () => {
    const arr = withPreset('db-v-sub', 'z5380-sub', 13)
    expect(arrayWeight(arr).total).toBe(857.4)
    expect(bumperCheck(arr).status).toBe('check')
    expect(bumperCheck(withPreset('db-v-sub', 'z5380-sub', 13, { extra_kg: 3 }))).toEqual({ status: 'fail', reasons: ['overSwl'] })
    expect(bumperCheck(withPreset('db-v-sub', 'z5380-sub', 14)).reasons).toEqual(['overMax', 'overSwl'])
  })
})

// L-Acoustics K2 owner's manual (EN) v4.0, p. 30: flown, K2-BUMP, safe limit 16, maximum limit 24
describe('L-Acoustics: safe and maximum limits', () => {
  it('K2-BUMP: 16 pass, 17 to 24 need Soundvision, 25 fail', () => {
    expect(bumperCheck(withPreset('l-acoustics-k2', 'k2-bump', 16)).status).toBe('pass')
    expect(bumperCheck(withPreset('l-acoustics-k2', 'k2-bump', 17)).status).toBe('check')
    expect(bumperCheck(withPreset('l-acoustics-k2', 'k2-bump', 24)).status).toBe('check')
    expect(bumperCheck(withPreset('l-acoustics-k2', 'k2-bump', 25)).status).toBe('fail')
  })
  it('16 K2 on K2-BUMP weigh 16 × 56 + 42.3 kg', () => {
    expect(arrayWeight(withPreset('l-acoustics-k2', 'k2-bump', 16)).total).toBe(938.3)
  })
  it('KS28-BUMP: 16 (safe = maximum) pass, 17 fail', () => {
    expect(bumperCheck(withPreset('l-acoustics-ks28', 'ks28-bump', 16)).status).toBe('pass')
    expect(bumperCheck(withPreset('l-acoustics-ks28', 'ks28-bump', 17)).status).toBe('fail')
  })
  it('a maximum with no safe limit (NEXO, Meyer) is always for the software to confirm', () => {
    expect(bumperCheck(withPreset('nexo-geo-m1220', 'vnt-bumpm12', 6)).reasons).toEqual(['noSafe'])
    expect(bumperCheck(withPreset('nexo-geo-m1220', 'vnt-bumpm12', 13)).status).toBe('fail')
  })
  it('no frame, or a frame typed without limits', () => {
    expect(bumperCheck(make()).status).toBe('none')
    expect(bumperCheck(make({ frame: { name: 'Fly bar', kg: 20 } })).status).toBe('none')
    expect(bumperCheck(make({ frame: { name: 'Fly bar', kg: 20, max: 20 }, count: 21 })).status).toBe('fail')
    expect(frameOf(make({ frame: { name: 'Fly bar' } })).hand).toBe(true)
  })
})

// No manufacturer's example of point loads could be reached in this session (they come from the
// manufacturers' software), so these are checked against hand calculations (lever rule)
describe('pick loads (hand calculations)', () => {
  it('two picks: the lever rule from the centre of gravity', () => {
    // 1000 kg, centre of gravity 300 mm behind the front pick, picks 1000 mm apart:
    // rear = 1000 × 300 / 1000 = 300 kg, front = 700 kg
    const arr = make({ element_kg: 100, count: 10, cog_mm: 300, spacing_mm: 1000 })
    expect(pickLoads(arr, 1000)).toMatchObject({ front: 700, rear: 300, problem: null })
  })
  it('a centre of gravity in front of the front pick pulls the rear pick up', () => {
    const arr = make({ element_kg: 100, count: 10, cog_mm: -100, spacing_mm: 1000 })
    const l = pickLoads(arr, 1000)
    expect(l.rear).toBe(-100)
    expect(l.front).toBe(1100)
    expect(l.problem).toBe('cogOutside')
    expect(analyseArray(arr).status).toBe('fail')
  })
  it('without a centre of gravity there are no loads to split', () => {
    expect(pickLoads(make({ element_kg: 50 }), 400).problem).toBe('needCog')
  })
  it('one pick carries the whole weight', () => {
    expect(pickLoads(make({ picks: 1 }), 512)).toMatchObject({ front: 512, rear: null })
  })
  it('typed loads must add up to the weight (within 5%)', () => {
    expect(pickLoads(make({ mode: 'loads', front_kg: 300, rear_kg: 210 }), 512).problem).toBeNull()
    expect(pickLoads(make({ mode: 'loads', front_kg: 300, rear_kg: 150 }), 512).problem).toBe('loadsDontAdd')
    expect(pickLoads(make({ mode: 'loads', front_kg: 300 }), 512).problem).toBe('needLoads')
  })
  it('a pullback frame needs the software\'s loads', () => {
    const arr = withPreset('l-acoustics-k2', 'k2-pullback', 12, { cog_mm: 300, spacing_mm: 1000 })
    expect(pickLoads(arr, arrayWeight(arr).total).problem).toBe('pullbackNeedsLoads')
    const typed = withPreset('l-acoustics-k2', 'k2-pullback', 12, { mode: 'loads', front_kg: 500, rear_kg: 300, pullback_kg: 120 })
    expect(pickLoads(typed, arrayWeight(typed).total)).toMatchObject({ front: 500, rear: 300, pull: 120, problem: null })
  })
})

describe('each pick against its hoist', () => {
  const hoist = { id: 'h1', brand: 'Acme', model: 'D8+ 500', class: 'D8+', wll_kg: 500 }
  it('loads × the dynamic factor against the WLL', () => {
    const arr = make({ element_kg: 100, count: 10, cog_mm: 300, spacing_mm: 1000, front: { hoist_model_id: 'h1', hoist }, rear: { hoist_model_id: 'h1', hoist } })
    const a = analyseArray(arr, { models: { h1: hoist }, settings: { dynamic_factor: 1.2 } })
    const [front, rear] = a.picks
    expect(front).toMatchObject({ kg: 700, dynamic_kg: 840, status: 'over' })
    expect(rear).toMatchObject({ kg: 300, dynamic_kg: 360, status: 'ok' })
    expect(a.status).toBe('fail')
  })
  it('a D8 hoist over people is flagged', () => {
    const d8 = { ...hoist, class: 'D8', wll_kg: 2000 }
    const arr = make({ element_kg: 10, count: 4, picks: 1, front: { hoist_model_id: 'h2', hoist: d8, over_people: true } })
    expect(analyseArray(arr, { models: { h2: d8 } }).picks[0].peopleOk).toBe(false)
  })
  it('passes only when the bumper passes and every pick is fine', () => {
    const big = { ...hoist, wll_kg: 2000 }
    const arr = withPreset('l-acoustics-k2', 'k2-bump', 12, { picks: 1, front: { hoist_model_id: 'h3', hoist: big } })
    const a = analyseArray(arr, { models: { h3: big } })
    expect(a.status).toBe('pass')
    expect(a.needsCheck).toBe(true) // the rigging data isn't checked by a second person
    expect(a.software).toBe('Soundvision')
  })
})

describe('hanging from a truss line (RG1)', () => {
  it('the picks become point loads on the line, which its points carry', () => {
    const arr = make({ element_kg: 50, count: 8, cog_mm: 250, spacing_mm: 1000, front: { line_id: 'l1', at_m: 2 }, rear: { line_id: 'l1', at_m: 3 } })
    // 400 kg: front 300, rear 100
    const loads = arrayLoadsOnLine([arr], 'l1')
    expect(loads.map(l => [l.at_m, l.kg])).toEqual([[2, 300], [3, 100]])
    const [line] = linesOf({ lines: [{ id: 'l1', name: 'Truss', length_m: 4, points: [{ id: 'p1', at_m: 0 }, { id: 'p2', at_m: 4 }] }] })
    const a = analyseLine({ ...line, loads: [...line.loads, ...loads] }, { settings: { cable_kg_m: 0, dynamic_factor: 1 } })
    // reactions by hand: p2 = (300×2 + 100×3) / 4 = 225, p1 = 400 − 225 = 175
    expect(a.results.map(r => r.kg)).toEqual([175, 225])
    expect(analyseArray(arr, { lines: [line] }).picks[0].status).toBe('onLine')
  })
})

describe('side view', () => {
  it('straight array: boxes stacked under each other', () => {
    const v = sideView(make({ count: 3, splays: [0, 0, 0] }))
    expect(v.elements.map(e => e.corners[0])).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }])
    expect(v.bottomAngle).toBe(0)
  })
  it('splays add up down the array; the tilt turns all of it', () => {
    const v = sideView(make({ count: 3, splays: [0, 2, 5], tilt_deg: 3 }))
    expect(v.elements.map(e => e.angle)).toEqual([-3, -1, 4])
  })
})

describe('the sign-off and the system calculator', () => {
  it('a check covers the frame data it saw', () => {
    const fp = framesFingerprint('l-acoustics-k2')
    expect(dataCheckState({ checked: true, checked_frames: fp }, 'l-acoustics-k2')).toBe('checked')
    expect(dataCheckState({ checked: true, checked_frames: 'old' }, 'l-acoustics-k2')).toBe('outdated')
    expect(dataCheckState({ checked: false }, 'l-acoustics-k2')).toBe('notChecked')
    expect(dataCheckState({ checked: true }, null)).toBe('checked')
  })
  it('takes the count and speaker from a source', () => {
    const src = { id: 's1', name: 'Main L', count: 12, item_id: 'i1', item_name: 'K2' }
    expect(fromSource(src)).toEqual({ source_id: 's1', name: 'Main L', count: 12, item_id: 'i1', element_name: 'K2' })
    expect(differsFromSource(make({ count: 12, item_id: 'i1' }), src)).toBe(false)
    expect(differsFromSource(make({ count: 10, item_id: 'i1' }), src)).toBe(true)
  })
  it('keeps one splay per element and clamps them', () => {
    const a = make({ count: 3, splays: [0, 40, -2, 7] })
    expect(a.splays).toEqual([0, 15, 0])
  })
})

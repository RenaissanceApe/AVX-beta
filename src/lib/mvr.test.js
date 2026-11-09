import { describe, it, expect } from 'vitest'
import { parseXml, parseGdtf, parseMvr, readAddress, absoluteAddress, parseMatrix, typeFromSpec, fixtureTypes, suggestItem,
  planImport, barsFor, buildMvr, uuidFrom, toPlot, fromPlot } from './mvr'
import { sampleGdtf, SAMPLE_TYPES, sampleMvrVectorworks, sampleMvrGrandMA3, sampleMvrCapture } from './mvrSamples'

const stage = { width_m: 10, depth_m: 8 }

describe('xml', () => {
  it('reads elements, attributes, text, entities and CDATA', () => {
    const doc = parseXml('<?xml version="1.0"?><!-- c --><a x="1 &amp; 2"><b y=\'z\'/>Hi &lt;3<![CDATA[<raw>]]></a>')
    expect(doc.name).toBe('a')
    expect(doc.attrs.x).toBe('1 & 2')
    expect(doc.children[0]).toMatchObject({ name: 'b', attrs: { y: 'z' } })
    expect(doc.text).toBe('Hi <3<raw>')
  })
})

describe('addresses and matrices', () => {
  it('reads absolute and dotted addresses', () => {
    expect(readAddress('1')).toEqual({ universe: 1, address: 1 })
    expect(readAddress('513')).toEqual({ universe: 2, address: 1 })
    expect(readAddress('1024')).toEqual({ universe: 2, address: 512 })
    expect(readAddress('3.017')).toEqual({ universe: 3, address: 17 })
    expect(readAddress('')).toBeNull()
    expect(readAddress('0')).toBeNull()
    expect(readAddress('1.600')).toBeNull()
    expect(absoluteAddress(2, 1)).toBe(513)
  })
  it('reads a matrix, or gives the identity', () => {
    expect(parseMatrix('{1,0,0}{0,1,0}{0,0,1}{100,200,300}').o).toEqual([100, 200, 300])
    expect(parseMatrix('nonsense').o).toEqual([0, 0, 0])
  })
  it('names a type from the GDTF file name', () => {
    expect(typeFromSpec('Robe Lighting@Robin 600 LEDWash@v2.gdtf')).toBe('Robe Lighting Robin 600 LEDWash')
    expect(typeFromSpec('Generic.gdtf')).toBe('Generic')
  })
})

describe('GDTF', () => {
  it('reads weight, power and the footprint of each mode', () => {
    const spot = parseGdtf(sampleGdtf(SAMPLE_TYPES.spot))
    expect(spot).toMatchObject({ manufacturer: 'Sample', name: 'Spot 300', gdtfId: SAMPLE_TYPES.spot.id, weightKg: 21.5, powerW: 450 })
    expect(spot.modes).toEqual([{ name: 'Standard', footprint: 18 }, { name: 'Basic', footprint: 12 }])
  })
  it('counts each pixel cell at its own offset', () => {
    const wash = parseGdtf(sampleGdtf(SAMPLE_TYPES.wash))
    expect(wash.modes).toEqual([{ name: 'Simple', footprint: 8 }, { name: 'Pixel', footprint: 16 }])
  })
  it('refuses a file that is not a fixture type', () => {
    expect(() => parseGdtf('<Nope/>')).toThrow()
  })
})

describe('MVR import', () => {
  it('reads a Vectorworks-style file: positions, unit numbers, absolute addresses', () => {
    const mvr = parseMvr(sampleMvrVectorworks())
    expect(mvr.provider).toBe('Vectorworks')
    expect(mvr.fixtures).toHaveLength(6)
    const s1 = mvr.fixtures[0]
    expect(s1).toMatchObject({ name: 'Spot 1', type: 'Sample Spot 300', mode: 'Standard', footprint: 18, universe: 1, address: 1, fixtureNo: 101, position: 'LX1', x: -3, y: 4, z: 7 })
    const w2 = mvr.fixtures[5]
    expect(w2).toMatchObject({ name: 'Wash 2', footprint: 16, universe: 2, address: 17, position: 'FOH', y: -5 })
    expect(Object.keys(mvr.gdtf)).toHaveLength(2)
  })
  it('reads a grandMA3-style file: groups as positions, parts of a fixture left out, transforms added up', () => {
    const mvr = parseMvr(sampleMvrGrandMA3())
    expect(mvr.fixtures.map(f => f.name)).toEqual(['Spot 1', 'Spot 2', 'Wash 1'])
    expect(mvr.fixtures[1]).toMatchObject({ position: 'Back truss', x: 1, y: 5, z: 8, footprint: 12, address: 13, fixtureNo: 2 })
    expect(mvr.fixtures[2]).toMatchObject({ position: 'Floor', universe: 3, address: 1, footprint: 8 })
  })
  it('reads a Capture-style file: the truss as position, dotted addresses, a type without its file', () => {
    const mvr = parseMvr(sampleMvrCapture())
    expect(mvr.fixtures).toHaveLength(3)
    expect(mvr.fixtures[0]).toMatchObject({ position: 'Truss A', x: -1.5, y: 4, z: 7, address: 1, footprint: 18 })
    expect(mvr.fixtures[2]).toMatchObject({ name: 'Strobe 1', type: 'Other Strobe X', footprint: null, address: 100 })
  })
  it('refuses a zip without a scene', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    expect(() => parseMvr(zipSync({ 'x.txt': strToU8('hi') }))).toThrow()
  })
})

describe('matching and planning', () => {
  const catalogue = [{ id: 'i-spot', name: 'Spot 300' }, { id: 'i-wash', name: 'Sample Pixel Wash LED' }, { id: 'i-par', name: 'LED Par' }]
  it('lists the types in a file and suggests catalogue items', () => {
    const types = fixtureTypes(parseMvr(sampleMvrCapture()))
    expect(types.map(t => [t.type, t.count, t.missingFootprint])).toEqual([['Sample Spot 300', 2, 0], ['Other Strobe X', 1, 1]])
    expect(suggestItem(types[0], catalogue)).toBe('i-spot')
    expect(suggestItem(types[1], catalogue)).toBeNull()
    // The same GDTF fixture type wins over names
    expect(suggestItem(types[0], [...catalogue, { id: 'i-other', name: 'Mover' }], [{ item_id: 'i-other', gdtf_id: SAMPLE_TYPES.spot.id }])).toBe('i-other')
  })
  it('plans rows with plot places, footprints from choices, new positions and updates by MVR id', () => {
    const mvr = parseMvr(sampleMvrCapture())
    const types = fixtureTypes(mvr)
    const choices = { [types[0].key]: { item_id: 'i-spot' }, [types[1].key]: { footprint: '4' } }
    const plan = planImport(mvr, { stage, choices, existing: [{ id: 'f1', mvr_uuid: mvr.fixtures[0].uuid, item_id: null }] })
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0]).toMatchObject({ id: 'f1', item_id: 'i-spot', plot_x: 3.5, plot_y: 4, height_m: 7 })
    expect(plan.inserts).toHaveLength(2)
    expect(plan.inserts[1]).toMatchObject({ name: 'Strobe 1', footprint: 4, item_id: null, address: 100 })
    expect(plan.newBars).toHaveLength(1)
    expect(plan.newBars[0]).toMatchObject({ name: 'Truss A', kind: 'truss', rotation: 0, x: 5, y: 4, height: 7 })
  })
  it('leaves out fixtures without a footprint and takes footprints from the catalogue fixture type', () => {
    const mvr = parseMvr(sampleMvrCapture())
    const types = fixtureTypes(mvr)
    expect(planImport(mvr, { stage }).noFootprint).toBe(1)
    const plan = planImport(mvr, { stage, choices: { [types[1].key]: { item_id: 'i-strobe' } }, fixtureTypeRows: [{ item_id: 'i-strobe', modes: [{ name: '4ch', footprint: 4 }] }] })
    expect(plan.noFootprint).toBe(0)
  })
  it('clears an address that would run past channel 512, and stops at the fixture limit', () => {
    const mvr = { fixtures: [{ uuid: null, name: 'A', type: 'X', footprint: 20, universe: 1, address: 500, x: 0, y: 0, z: 0 }, { uuid: null, name: 'B', type: 'X', footprint: 1, universe: 1, address: 1, x: 0, y: 0, z: 0 }], gdtf: {} }
    const plan = planImport(mvr, { stage, limit: 1 })
    expect(plan.inserts).toEqual([expect.objectContaining({ name: 'A', address: null })])
    expect(plan.unaddressed).toBe(1)
    expect(plan.tooMany).toBe(1)
  })
  it('makes up-and-down positions and floor positions', () => {
    const bars = barsFor([
      { position: 'Ladder', plot_x: 1, plot_y: 1, height_m: 2 }, { position: 'Ladder', plot_x: 1, plot_y: 4, height_m: 2 },
      { position: 'Floor', plot_x: 2, plot_y: 0, height_m: 0 }, { position: 'Taken', plot_x: 0, plot_y: 0, height_m: 5 },
    ], [{ name: 'taken' }], stage)
    expect(bars.map(b => [b.name, b.kind, b.rotation])).toEqual([['Ladder', 'truss', 90], ['Floor', 'floor', 0]])
    expect(bars[0].length).toBe(4)
  })
  it('maps stage coordinates both ways', () => {
    expect(toPlot({ x: -5, y: 2, z: 6 }, stage)).toEqual({ plot_x: 0, plot_y: 2, height_m: 6 })
    expect(fromPlot(0, 2, 6, stage)).toEqual([-5, 2, 6])
  })
})

describe('MVR export and the round trip', () => {
  it('gives stable UUIDs', () => {
    expect(uuidFrom('a')).toBe(uuidFrom('a'))
    expect(uuidFrom('a')).not.toBe(uuidFrom('b'))
    expect(uuidFrom('a')).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-8[0-9A-F]{3}-[0-9A-F]{12}$/)
  })
  it('import → export → import keeps fixtures, addresses, positions and places', () => {
    for (const sample of [sampleMvrVectorworks, sampleMvrGrandMA3, sampleMvrCapture]) {
      const first = parseMvr(sample())
      const types = fixtureTypes(first)
      const choices = Object.fromEntries(types.map(t => [t.key, { footprint: 4 }]))
      const plan = planImport(first, { stage, choices })
      // As the gig would hold them
      const fixtures = plan.inserts.map((r, i) => ({ id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, ...r }))
      const bars = plan.newBars
      const { bytes, count } = buildMvr({ fixtures, bars, stage, gdtfFiles: first.gdtfFiles })
      expect(count).toBe(fixtures.length)
      const second = parseMvr(bytes)
      expect(second.provider).toBe('AVX')
      const again = planImport(second, { stage, existing: fixtures })
      expect(again.inserts).toHaveLength(0)
      expect(again.updates).toHaveLength(fixtures.length)
      for (const f of fixtures) {
        const u = again.updates.find(x => x.id === f.id)
        expect(u).toMatchObject({ name: f.name, fixture_type: f.fixture_type, mode: f.mode, footprint: f.footprint, universe: f.universe, address: f.address,
          position: f.position, fixture_no: f.fixture_no, plot_x: f.plot_x, plot_y: f.plot_y, height_m: f.height_m, gdtf_spec: f.gdtf_spec })
      }
    }
  })
  it('exports fixtures hung on a position without a place of their own, and unaddressed ones', () => {
    const bars = [{ id: 'b1', name: 'Truss 1', kind: 'truss', x: 5, y: 4, length: 8, rotation: 0, height: 7, phase: null }]
    const fixtures = [
      { id: '00000000-0000-4000-8000-000000000201', name: 'P1', fixture_type: 'LED Par', footprint: 7, universe: 1, address: 1, position: 'Truss 1', plot_x: null, plot_y: null },
      { id: '00000000-0000-4000-8000-000000000202', name: 'P2', fixture_type: 'LED Par', footprint: 7, universe: 1, address: null, position: null, plot_x: null, plot_y: null },
    ]
    const back = parseMvr(buildMvr({ fixtures, bars, stage }).bytes)
    expect(back.fixtures[0]).toMatchObject({ name: 'P1', type: 'LED Par', footprint: 7, address: 1, position: 'Truss 1', x: 0, y: 4, z: 7, gdtfSpec: 'LED Par.gdtf' })
    expect(back.fixtures[1]).toMatchObject({ name: 'P2', address: null, position: null })
  })
})

import { describe, it, expect } from 'vitest'
import { SPEC_FIELDS, SPEAKER_TYPES, inRange, specProblems, riggingOf, specsForm, specsRow, hasSpecs, findPreset, presetPatch, presetSource, fillFromPreset, sourceSpecs, specsChanged, speakerFacts, normaliseName } from './speakers'
import { PRESETS } from '../data/speakers'

const field = k => SPEC_FIELDS.find(f => f.key === k)
const demo = {
  id: 'acme-a10', brand: 'Acme', model: 'A10', type: 'line_array',
  values: { max_spl_db: 140, dispersion_h: 110, freq_low_hz: 60, freq_high_hz: 18000, weight_kg: 30.5, power_w: null },
  rigging: { cog: 'As printed', frame_limits: '12 boxes' },
  source: { url: 'https://acme.example/a10.pdf', document: 'A10 spec sheet', version: 'EN 1.0', opened: '2026-11-09' },
}

describe('limits', () => {
  it('follows the database check', () => {
    expect(inRange(field('sensitivity_db'), 130)).toBe(true)
    expect(inRange(field('sensitivity_db'), 131)).toBe(false)
    expect(inRange(field('dispersion_h'), 0)).toBe(false)
    expect(inRange(field('dispersion_h'), 360)).toBe(true)
    expect(inRange(field('amp_channels'), 1.5)).toBe(false)
    expect(inRange(field('impedance_ohm'), null)).toBe(true)
    expect(inRange(field('impedance_ohm'), NaN)).toBe(false)
  })
  it('names what is wrong', () => {
    expect(specProblems({ sensitivity_db: '200', freq_low_hz: '20', freq_high_hz: '20' })).toEqual({ sensitivity_db: 'range', freq_high_hz: 'order' })
    expect(specProblems({ sensitivity_db: '98,5', dispersion_h: '' })).toEqual({})
    expect(specProblems({ speaker_type: 'horn' })).toEqual({ speaker_type: 'range' })
  })
})

describe('rigging data', () => {
  it('keeps the texts, never marks them checked by itself', () => {
    expect(riggingOf({ cog: ' 12 cm ', extra: 'x' })).toEqual({ cog: '12 cm', checked: false })
    expect(riggingOf({ source: 'only a source' })).toBeNull()
    expect(riggingOf([1])).toBeNull()
    expect(riggingOf({ frame_limits: 'a'.repeat(2000) }).frame_limits).toHaveLength(900)
  })
})

describe('the item form', () => {
  it('goes from an item to the columns and back', () => {
    const item = { speaker_type: 'monitor', sensitivity_db: 99, dispersion_h: 90, rigging: { cog: 'C' } }
    const form = specsForm(item)
    expect(form.sensitivity_db).toBe(99)
    expect(form.rig_cog).toBe('C')
    const row = specsRow({ ...form, impedance_ohm: '8', amp_channels: '' })
    expect(row).toMatchObject({ speaker_type: 'monitor', sensitivity_db: 99, impedance_ohm: 8, amp_channels: null, rigging: { cog: 'C', checked: false } })
    expect(specsRow(specsForm(null))).toMatchObject({ speaker_type: null, rigging: null, spec_source: null })
  })
  it('knows a speaker', () => {
    expect(hasSpecs({ speaker_type: 'subwoofer' })).toBe(true)
    expect(hasSpecs({ max_spl_db: 130 })).toBe(true)
    expect(hasSpecs({ name: 'Cable' })).toBe(false)
  })
})

describe('presets', () => {
  it('are found by brand and model as people write them', () => {
    expect(findPreset('ACME a-10', [demo])).toBe(demo)
    expect(findPreset('acme-a10', [demo])).toBe(demo)
    expect(findPreset('A10', [demo])).toBe(demo)
    expect(findPreset('A10', [demo, { ...demo, id: 'other-a10', brand: 'Other' }])).toBeNull()
    expect(findPreset('', [demo])).toBeNull()
    expect(normaliseName('d&b V-8')).toBe('dbv8')
  })
  it('write only what the datasheet gives, with the source', () => {
    const patch = presetPatch(demo)
    expect(patch).toMatchObject({ speaker_type: 'line_array', speaker_preset: 'acme-a10', max_spl_db: 140, weight_kg: 30.5 })
    expect(patch).not.toHaveProperty('sensitivity_db')
    expect(patch).not.toHaveProperty('power_w')
    expect(patch.spec_source).toBe('A10 spec sheet · EN 1.0 · https://acme.example/a10.pdf')
    expect(patch.rigging).toMatchObject({ cog: 'As printed', checked: false, source: patch.spec_source })
  })
  it('fill only the empty cells of an imported row', () => {
    const row = fillFromPreset({ name: 'My A10', max_spl_db: 139, weight_kg: null }, demo)
    expect(row).toMatchObject({ name: 'My A10', max_spl_db: 139, weight_kg: 30.5, dispersion_h: 110 })
  })
})

// The hard rule (docs/TOOLS_PLAN.md §6): every preset value is typed from the manufacturer's
// datasheet, with the document, its version and the exact wording that gives it
describe('the preset data', () => {
  it('has one entry per model', () => {
    expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length)
  })
  const ids = new Set()
  for (const p of PRESETS) {
    it(`${p.brand} ${p.model} is complete and in range`, () => {
      expect(p.id).toMatch(/^[a-z0-9][a-z0-9-]{0,59}$/)
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      expect(SPEAKER_TYPES).toContain(p.type)
      expect(p.source.url).toMatch(/^https:\/\//)
      expect(p.source.document).toBeTruthy()
      expect(p.source.version).toBeTruthy()
      expect(p.source.opened).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(specProblems(p.values)).toEqual({})
      for (const [k, v] of Object.entries(p.values)) if (v != null) expect(p.quotes?.[k], `${p.id}.${k} needs the datasheet's wording`).toBeTruthy()
      if (p.rigging) expect(p.rigging.checked).not.toBe(true)
      // Nothing is cut short when it's saved (900 characters per rigging text, 4 KB in all)
      for (const v of Object.values(p.rigging || {})) if (typeof v === 'string') expect(v.length).toBeLessThanOrEqual(900)
      const patch = presetPatch(p)
      expect(new TextEncoder().encode(JSON.stringify(patch.rigging || {})).length).toBeLessThanOrEqual(4000)
      expect(presetSource(p).length).toBeLessThan(500)
    })
  }
})

describe('the sound system calculator', () => {
  const item = { id: 'i1', name: 'Top', max_spl_db: 141.5, dispersion_h: 200 }
  it('takes max SPL and dispersion within its own limits', () => {
    expect(sourceSpecs(item)).toEqual({ item_id: 'i1', item_name: 'Top', spl: 141.5, angle: 180 })
    expect(sourceSpecs({ id: 'i2', name: 'Bare' })).toEqual({ item_id: 'i2', item_name: 'Bare' })
    expect(sourceSpecs(null)).toBeNull()
  })
  it('sees when the catalogue changed', () => {
    expect(specsChanged({ spl: 141.5, angle: 180 }, item)).toBe(false)
    expect(specsChanged({ spl: 130, angle: 180 }, item)).toBe(true)
    expect(specsChanged({ spl: 130 }, { id: 'x' })).toBe(false)
  })
})

describe('the item page', () => {
  it('lists only what is filled in', () => {
    const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k)
    const facts = speakerFacts({ speaker_type: 'line_array', dispersion_h: 110, freq_low_hz: 60, freq_high_hz: 18000 }, t)
    expect(facts).toEqual([
      ['spk.type', 'spk.typeOpt.line_array'],
      ['spk.dispersion', '110° × —'],
      ['spk.freq', '60–18000 Hz'],
    ])
    expect(speakerFacts({ name: 'Cable' }, t)).toEqual([])
  })
})

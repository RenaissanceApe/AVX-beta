import { describe, it, expect, vi } from 'vitest'

// A fixed preset list, so the import's preset matching is tested whatever src/data/speakers.js holds
vi.mock('../data/speakers', () => ({
  PRESETS: [{
    id: 'acme-a10', brand: 'Acme', model: 'A10', type: 'line_array',
    values: { max_spl_db: 140, dispersion_h: 110, weight_kg: 30.5 },
    rigging: { frame_limits: '12 boxes' },
    source: { url: 'https://acme.example/a10.pdf', document: 'A10 spec sheet', version: 'EN 1.0', opened: '2026-11-09' },
  }],
}))
const { guessMapping, buildRows, serverMessage } = await import('./importer')

describe('import wizard: speaker specs (A1)', () => {
  const headers = ['Name', 'Speaker preset', 'Speaker type', 'Sensitivity', 'Max SPL', 'Horizontal dispersion', 'Vertical dispersion',
    'Low frequency', 'High frequency', 'Impedance', 'Amp channels', 'Datasheet', 'Weight']
  const mapping = guessMapping(headers, 'items')

  it('guesses the new columns', () => {
    expect(mapping).toMatchObject({
      'Speaker preset': 'speaker_preset', 'Speaker type': 'speaker_type', Sensitivity: 'sensitivity_db', 'Max SPL': 'max_spl_db',
      'Horizontal dispersion': 'dispersion_h', 'Vertical dispersion': 'dispersion_v', 'Low frequency': 'freq_low_hz',
      'High frequency': 'freq_high_hz', Impedance: 'impedance_ohm', 'Amp channels': 'amp_channels', Datasheet: 'spec_source',
    })
  })

  it('fills from a preset only what the file leaves empty, and refuses values out of range', () => {
    const rows = buildRows({ headers, rows: [
      ['Array box', 'Acme A10', '', '', '139', '', '', '', '', '', '', '', ''],
      ['Mystery box', 'Nobody X1', '', '', '', '', '', '', '', '', '', '', ''],
      ['Loud box', '', 'wedge', '200', '', '0', '', '20000', '50', '8', '2', 'Sheet v2', ''],
    ] }, mapping, 'items')
    expect(rows[0]).toMatchObject({ speaker_preset: 'acme-a10', speaker_type: 'line_array', max_spl_db: 139, dispersion_h: 110, weight_kg: 30.5, _errors: [] })
    expect(rows[0].rigging).toMatchObject({ frame_limits: '12 boxes', checked: false })
    expect(rows[1]._errors).toEqual([{ field: 'speaker_preset', error: 'unknownPreset' }])
    expect(rows[2].speaker_type).toBe('monitor')
    expect(rows[2]._errors).toEqual([
      { field: 'sensitivity_db', error: 'speakerRange' },
      { field: 'dispersion_h', error: 'speakerRange' },
      { field: 'freq_high_hz', error: 'freqOrder' },
    ])
  })

  it('reads the database’s refusal', () => {
    expect(serverMessage('new row for relation "price_items" violates check constraint "price_items_speaker_check"')).toEqual({ key: 'speakerSpec', name: undefined })
  })
})

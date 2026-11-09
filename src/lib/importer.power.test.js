import { describe, it, expect } from 'vitest'
import { guessMapping, buildRows, serverMessage } from './importer'

describe('import wizard: electrical fields (P1)', () => {
  const headers = ['Name', 'Power', 'Typical power', 'Power factor', 'Inrush', 'Amps', 'Voltage', 'Connector', 'Connector out']
  const mapping = guessMapping(headers, 'items')

  it('guesses the electrical columns', () => {
    expect(mapping).toMatchObject({
      Power: 'power_w', 'Typical power': 'power_typical_w', 'Power factor': 'power_factor', Inrush: 'inrush_a',
      Amps: 'current_a', Voltage: 'current_v', Connector: 'connector_in', 'Connector out': 'connector_out',
    })
  })

  it('reads connectors as written in rental lists', () => {
    const rows = buildRows({ headers, rows: [
      ['Spot', '700', '450', '0,95', '40', '', '', 'powerCON TRUE1', 'True1'],
      ['Dimmer', '', '', '', '', '', '', 'CEE 32A 5P', 'Socapex'],
      ['Distro', '', '', '', '', '', '', 'CEE 63/3', ''],
      ['Wall', '', '', '', '', '', '', 'CEE 16A blue', 'Schuko'],
    ] }, mapping, 'items')
    expect(rows[0]).toMatchObject({ power_w: 700, power_typical_w: 450, power_factor: 0.95, inrush_a: 40, connector_in: 'powercon_true1', connector_out: 'powercon_true1', _errors: [] })
    expect(rows[1]).toMatchObject({ connector_in: 'cee32_3', connector_out: 'socapex' })
    expect(rows[2].connector_in).toBe('cee63_3')
    expect(rows[3]).toMatchObject({ connector_in: 'cee16_1', connector_out: 'schuko' })
  })

  it('refuses values out of range, amps without volts and typical above max', () => {
    const rows = buildRows({ headers, rows: [
      ['Amp', '', '', '1.5', '', '8', '', 'USB', ''],
      ['Light', '500', '600', '', '', '', '', '', ''],
    ] }, mapping, 'items')
    expect(rows[0]._errors).toEqual([
      { field: 'connector_in', error: 'choice' },
      { field: 'power_factor', error: 'powerRange' },
      { field: 'current_v', error: 'powerNeedVolts' },
    ])
    expect(rows[1]._errors).toEqual([{ field: 'power_typical_w', error: 'powerTypical' }])
  })

  it('reads the database’s refusal', () => {
    expect(serverMessage('new row for relation "price_items" violates check constraint "price_items_power_check"')).toEqual({ key: 'powerSpec', name: undefined })
  })
})

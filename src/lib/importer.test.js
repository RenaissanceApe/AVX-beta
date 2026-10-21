import { describe, it, expect } from 'vitest'
import { detectDelimiter, parseTable, guessMapping, applyPreset, missingFields, parseNumber, parseDate, parseChoice, cleanValue, buildRows, dryRun, toPayload, reportCsv, normalise, FIELDS } from './importer'

describe('import wizard: reading files', () => {
  it('finds the separator', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t')
    // Commas inside prices don't fool it
    expect(detectDelimiter('Name;Price\nSpot;1,50\nWash;2,75')).toBe(';')
  })

  it('reads quoted cells, empty cells and a byte-order mark', () => {
    const t = parseTable('\uFEFFName,Notes,Price\n"Cable, 10 m","He said ""hi""",2\nSpot,,"1.200,00"\n\n')
    expect(t.headers).toEqual(['Name', 'Notes', 'Price'])
    expect(t.rows).toEqual([['Cable, 10 m', 'He said "hi"', '2'], ['Spot', '', '1.200,00']])
  })

  it('keeps line breaks inside quotes and pads short rows', () => {
    const t = parseTable('a;b;c\n"two\nlines";x\n1;2;3')
    expect(t.rows).toEqual([['two\nlines', 'x', ''], ['1', '2', '3']])
  })

  it('numbers the columns when there is no heading row', () => {
    const t = parseTable('Spot;10\nWash;5', { headerRow: false })
    expect(t.headers).toEqual(['Column 1', 'Column 2'])
    expect(t.rows).toHaveLength(2)
  })
})

describe('import wizard: matching columns', () => {
  it('guesses English, Dutch (Rentman) and Portuguese headings', () => {
    expect(guessMapping(['Naam', 'Code', 'Categorie', 'Verhuurprijs', 'Gewicht', 'Aantal', 'Magazijn'], 'items')).toEqual({
      Naam: 'name', Code: 'code', Categorie: 'category', Verhuurprijs: 'unit_price', Gewicht: 'weight_kg', Aantal: 'quantity', Magazijn: 'location',
    })
    expect(guessMapping(['Nome', 'Preço', 'Peso', 'Potência'], 'items')).toEqual({ Nome: 'name', 'Preço': 'unit_price', Peso: 'weight_kg', 'Potência': 'power_w' })
    expect(guessMapping(['Item', 'Barcode', 'Serial number', 'Purchase date', 'Mystery'], 'units')).toEqual({
      Item: 'item', Barcode: 'code', 'Serial number': 'serial', 'Purchase date': 'purchase_date',
    })
  })

  it('uses each field once, and matches longer headings that contain a name', () => {
    expect(guessMapping(['Name', 'Display name'], 'items')).toEqual({ Name: 'name' })
    expect(guessMapping(['Rental price (€)', 'Article'], 'items')).toEqual({ 'Rental price (€)': 'unit_price', Article: 'name' })
  })

  it('applies a saved preset to the columns that exist and says what is missing', () => {
    expect(applyPreset(['A', 'B'], { A: 'name', C: 'code' })).toEqual({ A: 'name' })
    expect(missingFields({}, 'items')).toEqual(['name'])
    expect(missingFields({ X: 'code' }, 'items')).toEqual([])
    expect(missingFields({ X: 'serial' }, 'units')).toEqual(['item'])
    expect(missingFields({ X: 'name' }, 'locations')).toEqual([])
  })

  it('every field has a unique key and a lowercase plain name list', () => {
    for (const fields of Object.values(FIELDS)) {
      expect(new Set(fields.map(f => f.key)).size).toBe(fields.length)
      for (const f of fields) for (const n of f.names) expect(normalise(n)).toBe(n)
    }
  })
})

describe('import wizard: cleaning values', () => {
  it('reads numbers and dates written the European way', () => {
    expect(parseNumber('1.234,50')).toBe(1234.5)
    expect(parseNumber('€ 80')).toBe(80)
    expect(parseNumber('13,5 kg')).toBe(13.5)
    expect(parseNumber('abc')).toBeNaN()
    expect(parseDate('2024-03-01')).toBe('2024-03-01')
    expect(parseDate('01-03-2024')).toBe('2024-03-01')
    expect(parseDate('1/3/2024')).toBe('2024-03-01')
    expect(parseDate('31/02/2024')).toBe(null)
    expect(parseDate('March 1')).toBe(null)
  })

  it('understands the words for choices', () => {
    expect(parseChoice('Verhuur', 'itemKind')).toBe('rental')
    expect(parseChoice('Aluguer', 'itemKind')).toBe('rental')
    expect(parseChoice('Serienummers', 'tracking')).toBe('serial')
    expect(parseChoice('Carrinha', 'locationKind')).toBe('vehicle')
    expect(parseChoice('in repair', 'unitStatus')).toBe('repair')
    expect(parseChoice('banana', 'unit')).toBe(undefined)
    expect(parseChoice('', 'unit')).toBe(null)
  })

  it('flags values that would be refused', () => {
    const f = key => FIELDS.items.find(x => x.key === key)
    expect(cleanValue('2,5', f('unit_price'))).toEqual({ value: 2.5 })
    expect(cleanValue('-3', f('unit_price'))).toEqual({ error: 'number' })
    expect(cleanValue('2.5', f('quantity'))).toEqual({ error: 'whole' })
    expect(cleanValue('AB 12', f('code'))).toEqual({ error: 'code' })
    expect(cleanValue('x'.repeat(201), f('name'))).toEqual({ error: 'long' })
    expect(cleanValue('  ', f('name'))).toEqual({ value: null })
  })
})

describe('import wizard: rows and the dry run', () => {
  const table = parseTable('Naam;Code;Prijs;Aantal;Magazijn\nXLR 10 m;;2,50;40;Warehouse\nSpot;SP1;80;;\n;;;;\n;;5;;\nWash;W 1;10;;\nCable;;1;5;')
  const mapping = guessMapping(table.headers, 'items')
  const rows = buildRows(table, mapping, 'items')

  it('builds rows with their line numbers and problems, leaving empty lines out', () => {
    expect(rows.map(r => r._row)).toEqual([2, 3, 5, 6, 7])
    expect(rows[0]).toMatchObject({ name: 'XLR 10 m', unit_price: 2.5, quantity: 40, location: 'Warehouse', _errors: [] })
    expect(rows[2]._errors).toEqual([{ field: 'name', error: 'missing' }])
    expect(rows[3]._errors).toEqual([{ field: 'code', error: 'code' }])
    expect(rows[4]._errors).toEqual([{ field: 'location', error: 'needLocation' }])
  })

  it('predicts new, matched and skipped rows', () => {
    const existing = { locations: [{ name: 'Warehouse' }], items: [{ name: 'Spot', code: 'SP1' }] }
    const { plan, counts } = dryRun(rows, 'items', existing)
    expect(plan.map(p => p.action)).toEqual(['create', 'match', 'skip', 'skip', 'skip'])
    expect(counts).toEqual({ create: 1, match: 1, skip: 3 })
    expect(dryRun([{ _row: 2, name: 'A', quantity: 1, location: 'Moon', _errors: [] }], 'items', existing).plan[0]).toEqual({ action: 'skip', reason: 'unknownLocation', value: 'Moon' })
  })

  it('checks units against their items', () => {
    const existing = { locations: [], items: [{ name: 'Aura', code: 'AURA', tracking: 'serial' }, { name: 'XLR', code: 'XLR', tracking: 'bulk' }], units: [{ code: 'LP-1' }] }
    const units = [
      { _row: 2, item_code: 'aura', code: 'lp-1', _errors: [] },
      { _row: 3, item: 'Aura', code: 'LP-2', _errors: [] },
      { _row: 4, item: 'XLR', code: 'LP-3', _errors: [] },
      { _row: 5, item: 'Nope', _errors: [] },
    ]
    expect(dryRun(units, 'units', existing).plan.map(p => p.action + (p.reason ? `:${p.reason}` : ''))).toEqual(['match', 'create', 'skip:bulkItem', 'skip:unknownItem'])
  })

  it('sends only good rows, and writes a report', () => {
    expect(toPayload(rows).map(r => r._row)).toEqual([2, 3])
    expect(toPayload(rows)[0]._errors).toBeUndefined()
    const csv = reportCsv([{ row: 4, level: 'skip', message: 'The name is "missing"' }], { row: 'Line', level: 'Result', message: 'Message', skip: 'Skipped' })
    expect(csv).toBe('"Line","Result","Message"\n"4","Skipped","The name is ""missing"""')
  })
})

describe('import wizard: the database’s reasons', () => {
  it('turns them into keys the app translates', async () => {
    const { serverMessage } = await import('./importer')
    expect(serverMessage('Unknown location: Moon base')).toEqual({ key: 'unknownLocation', name: 'Moon base' })
    expect(serverMessage('Several items are called Spot: add their codes to the file')).toEqual({ key: 'sameName', name: 'Spot' })
    expect(serverMessage('duplicate key value violates unique constraint "x"')).toEqual({ key: 'duplicate', name: undefined })
    expect(serverMessage('Something else')).toBe(null)
  })
})

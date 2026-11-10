import { describe, it, expect } from 'vitest'
import { parseTable, firstLine, suggestHeaderRow, decodeText, guessKind, unusedColumns, openDefaults, missingFields, parseDate, dateOrder, cleanValue, customFieldDefs,
  buildRows, checkImport, refusedRows, splitParts, mergeResults, leftOutCsv, FIXES, MAX_ROWS } from './importer'

// IM2: before and after the check (docs/SWITCHING.md, "Import overhaul: fix it here")
const ex = { locations: [{ id: 'l1', name: 'Main' }], items: [], units: [], parts: [], stocked: [] }

describe('the heading row', () => {
  const text = 'Stock list March 2026\n\nName,Code,Quantity\nCable,C1,4\nLamp,L1,2'
  it('is suggested below title lines', () => {
    expect(suggestHeaderRow(text)).toBe(1)
    expect(suggestHeaderRow('Name,Code\nCable,C1')).toBe(0)
    expect(suggestHeaderRow('just one line')).toBe(0)
  })
  it('leaves the lines above out and keeps the line numbers of the file', () => {
    const table = parseTable(text, { headerAt: 1 })
    expect(table.headers).toEqual(['Name', 'Code', 'Quantity'])
    expect(table.rows).toEqual([['Cable', 'C1', '4'], ['Lamp', 'L1', '2']])
    expect(table.offset).toBe(1)
    expect(firstLine(table)).toBe(3)
    expect(buildRows(table, { Name: 'name', Code: 'code' }, 'items').map(r => r._row)).toEqual([3, 4])
  })
  it('never skips past the last line', () => {
    expect(parseTable('a,b\n1,2', { headerAt: 9 }).offset).toBe(1)
  })
})

describe('the text encoding', () => {
  it('reads UTF-8 as UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('Armazém,1'))).toEqual({ text: 'Armazém,1', encoding: 'utf-8', noticed: false })
  })
  it('notices a file saved by Excel on Windows and reads it as Windows-1252', () => {
    const bytes = new Uint8Array([0x41, 0x72, 0x6d, 0x61, 0x7a, 0xe9, 0x6d, 0x2c, 0x80]) // "Armazém,€" in Windows-1252
    expect(decodeText(bytes)).toEqual({ text: 'Armazém,€', encoding: 'windows-1252', noticed: true })
  })
  it('can be switched', () => {
    const bytes = new Uint8Array([0x41, 0xe9])
    expect(decodeText(bytes, 'utf-8').text).toBe('A�')
    expect(decodeText(bytes, 'windows-1252').noticed).toBe(false)
  })
  it('reads UTF-16 by its mark', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00])).text).toBe('Aé')
  })
})

describe('this looks like another kind of file', () => {
  it('suggests Units for a units file chosen as equipment', () => {
    expect(guessKind(['Item', 'Barcode', 'Serial number', 'Location'], 'items')).toBe('units')
  })
  it('suggests Clients for a contacts file chosen as equipment', () => {
    expect(guessKind(['Company', 'E-mail', 'Phone', 'VAT number'], 'items')).toBe('clients')
  })
  it('stays quiet when the chosen kind fits', () => {
    expect(guessKind(['Name', 'Code', 'Price', 'Quantity', 'Location'], 'items')).toBe(null)
    expect(guessKind(['Company', 'E-mail'], 'suppliers')).toBe(null)
    expect(guessKind(['Company', 'E-mail'], 'items', ['items', 'locations'])).toBe(null)
  })
})

describe('the match step', () => {
  it('lists the columns with data that won\'t be imported', () => {
    const table = parseTable('Name,Remarks,Colour,Empty\nCable,ok,red,\nLamp,,blue,')
    expect(unusedColumns(table, { Name: 'name' })).toEqual(['Remarks', 'Colour'])
  })
  it('offers "same for every row" for the fields no column gives', () => {
    expect(openDefaults({ Barcode: 'code' }, 'units')).toEqual([['item_code', 'item'], ['location'], ['status']])
    expect(openDefaults({ Barcode: 'code', Item: 'item', Where: 'location' }, 'units')).toEqual([['status']])
    expect(missingFields({ Barcode: 'code' }, 'units')).toEqual(['item'])
    expect(missingFields({ Barcode: 'code' }, 'units', { item_code: 'MAC-1' })).toEqual([])
  })
  it('fills a "same for every row" value in every row', () => {
    const table = parseTable('Barcode,Serial\nB1,S1\nB2,S2')
    const rows = buildRows(table, { Barcode: 'code', Serial: 'serial' }, 'units', { defaults: { item_code: 'MAC-1', location: 'Main', status: 'repair' } })
    expect(rows.map(r => [r.item_code, r.location, r.status])).toEqual([['MAC-1', 'Main', 'repair'], ['MAC-1', 'Main', 'repair']])
  })
  it('puts equipment quantities in the "same for every row" location (as "Where is this stock?" did)', () => {
    const table = parseTable('Name,Quantity\nCable,4\nLamp,')
    const rows = buildRows(table, { Name: 'name', Quantity: 'quantity' }, 'items', { defaults: { location: 'Main' } })
    expect(rows.map(r => r.location ?? null)).toEqual(['Main', null])
  })
  it('a column wins over its "same for every row" value', () => {
    const table = parseTable('Barcode,Status\nB1,lost')
    expect(buildRows(table, { Barcode: 'code', Status: 'status' }, 'units', { defaults: { status: 'repair', item: 'X' } })[0].status).toBe('lost')
  })
})

describe('the date order', () => {
  it('is noticed per column', () => {
    expect(dateOrder(['31/12/2025', '01/02/2026'])).toBe('dmy')
    expect(dateOrder(['12/31/2025', '01/02/2026'])).toBe('mdy')
    expect(dateOrder(['01/02/2026', '03/04/2026'])).toBe('ask')
    expect(dateOrder(['31/12/2025', '12/31/2025'])).toBe('ask')
    expect(dateOrder(['2026-02-01', '01/01/2026', ''])).toBe(null)
  })
  it('reads month first when told', () => {
    expect(parseDate('3/1/2024', 'mdy')).toBe('2024-03-01')
    expect(parseDate('3/1/2024')).toBe('2024-01-03')
    expect(parseDate('2024-03-01', 'mdy')).toBe('2024-03-01')
    expect(parseDate('31/12/2024', 'mdy')).toBe(null)
  })
  it('is used per field when building rows', () => {
    const table = parseTable('Name,Start,End\nShow,12/31/2026,01/02/2027')
    const rows = buildRows(table, { Name: 'name', Start: 'start_date', End: 'end_date' }, 'gigs', { dateOrders: { start_date: 'mdy', end_date: 'mdy' } })
    expect([rows[0].start_date, rows[0].end_date]).toEqual(['2026-12-31', '2027-01-02'])
  })
})

describe('custom fields', () => {
  const custom = [
    { id: 'f1', kind: 'text', label: 'Colour' }, { id: 'f2', kind: 'number', label: 'Height' }, { id: 'f3', kind: 'date', label: 'Checked' },
    { id: 'f4', kind: 'yes_no', label: 'Insured' }, { id: 'f5', kind: 'choice', label: 'Grade', choices: ['A', 'B grade'] }, { id: 'f6', kind: 'link', label: 'Manual' },
  ]
  const defs = Object.fromEntries(customFieldDefs(custom).map(d => [d.label, d]))
  it('checks each value by the field\'s kind', () => {
    expect(cleanValue('-2,5', defs.Height)).toEqual({ value: -2.5 })
    expect(cleanValue('tall', defs.Height)).toEqual({ error: 'number' })
    expect(cleanValue('01-03-2024', defs.Checked)).toEqual({ value: '2024-03-01' })
    expect(cleanValue('ja', defs.Insured)).toEqual({ value: true })
    expect(cleanValue('no', defs.Insured)).toEqual({ value: false })
    expect(cleanValue('maybe', defs.Insured)).toEqual({ error: 'choice' })
    expect(cleanValue('b  GRADE', defs.Grade)).toEqual({ value: 'B grade' })
    expect(cleanValue('C', defs.Grade)).toEqual({ error: 'choice' })
    expect(cleanValue('https://x.example/m.pdf', defs.Manual)).toEqual({ value: 'https://x.example/m.pdf' })
    expect(cleanValue('see drawer', defs.Manual)).toEqual({ error: 'link' })
    expect(cleanValue('x'.repeat(1001), defs.Colour)).toEqual({ error: 'long' })
    expect(FIXES.link.fixes).toContain('edit')
  })
  it('puts the values in custom_values, keyed by field id', () => {
    const table = parseTable('Name,Colour,Height,Grade\nCable,red,2,b grade\nLamp,,x,')
    const rows = buildRows(table, { Name: 'name', Colour: 'cf:f1', Height: 'cf:f2', Grade: 'cf:f5' }, 'items', { custom })
    expect(rows[0].custom_values).toEqual({ f1: 'red', f2: 2, f5: 'B grade' })
    expect(rows[1].custom_values).toBeUndefined()
    expect(rows[1]._errors).toEqual([{ field: 'cf:f2', error: 'number' }])
  })
  it('only for gigs, clients, suppliers and items', () => {
    const table = parseTable('Name,Colour\nMain,red')
    expect(buildRows(table, { Name: 'name', Colour: 'cf:f1' }, 'locations', { custom })[0].custom_values).toBeUndefined()
  })
})

describe('fix and try again', () => {
  const table = parseTable('Name,Code\nCable,C1\nLamp,L1\nDesk,D1')
  const mapping = { Name: 'name', Code: 'code' }
  const first = checkImport({ table, mapping, kind: 'items', existing: ex })
  const refused = refusedRows([
    { row: 3, level: 'skip', message: 'duplicate key value violates unique constraint "price_items_code"' },
    { row: 4, level: 'skip', message: 'Something new went wrong' },
    { row: 2, level: 'note', message: 'Quantity not added' },
  ], first.sendable)

  it('keeps the refused rows with what was sent', () => {
    expect(Object.keys(refused)).toEqual(['3', '4'])
  })
  it('brings back only those rows, each as a problem with a way forward', () => {
    const again = checkImport({ table, mapping, kind: 'items', existing: ex, only: [3, 4], refused })
    expect(again.rows.map(r => r._row)).toEqual([3, 4])
    expect(again.counts.problems).toBe(2)
    const dup = again.groups.find(g => g.reason === 'duplicate')
    expect(dup).toMatchObject({ field: 'code', refused: true, lines: [{ line: 3, raw: 'L1' }] })
    expect(dup.fixes.map(f => f.id)).toEqual(['edit', 'skip'])
    expect(again.groups.find(g => g.reason === 'refused')).toMatchObject({ value: 'Something new went wrong', fixes: [{ id: 'skip', im3: false }] })
  })
  it('lets a row go once it changed', () => {
    const fixes = [{ type: 'cells', key: 'x', edits: { 3: { code: 'L2' } } }]
    const again = checkImport({ table, mapping, kind: 'items', existing: ex, only: [3, 4], refused, fixes })
    expect(again.sendable.map(r => [r._row, r.code])).toEqual([[3, 'L2']])
  })
  it('does not bring back rows left out on purpose', () => {
    expect(refusedRows([{ row: 2, level: 'skip', message: 'Past job left out: Old show' }], [{ _row: 2, name: 'Old show' }])).toEqual({})
  })
})

describe('more than 5000 rows', () => {
  it('go in parts of 5000', () => {
    const rows = Array.from({ length: MAX_ROWS * 2 + 1 }, (_, n) => ({ _row: n + 2 }))
    expect(splitParts(rows, 'items').map(p => p.length)).toEqual([MAX_ROWS, MAX_ROWS, 1])
    expect(splitParts(rows.slice(0, 3), 'items')).toEqual([rows.slice(0, 3)])
  })
  it('never split a quote\'s lines', () => {
    const rows = [{ quote_ref: 'Q1' }, { quote_ref: 'Q1' }, { quote_ref: 'Q2' }, { quote_ref: 'q1' }, { quote_ref: 'Q2' }, { title: 'Party' }]
    const parts = splitParts(rows, 'quotes', 3)
    expect(parts.map(p => p.map(r => r.quote_ref || r.title))).toEqual([['Q1', 'Q1', 'q1'], ['Q2', 'Q2', 'Party']])
  })
  it('add up the results of the parts', () => {
    expect(mergeResults([{ batch: 'a', created: 2, updated: 1, unchanged: 0, skipped: 1, problems: [{ row: 3 }] }, { batch: 'b', created: 1, updated: 0, unchanged: 2, skipped: 0, problems: [] }]))
      .toEqual({ batch: 'b', created: 3, updated: 1, unchanged: 2, skipped: 1, added: 0, problems: [{ row: 3 }] })
  })
})

describe('the left-out file', () => {
  it('has the file\'s own columns and a Problem column, one line per row left out', () => {
    const table = parseTable('Title line\nName,Price\n"Cable, 5m",n/a\nLamp,2\nDesk,"say ""hi"""', { headerAt: 1 })
    const csv = leftOutCsv(table, [{ line: 5, problem: 'Code: too long' }, { line: 3, problem: 'Price: not a number' }, { line: 3, problem: 'Price: not a number' }, { line: 3, problem: 'Name: missing' }, { line: 99, problem: 'x' }], { problem: 'Problem' })
    expect(csv.split('\n')).toEqual(['Name,Price,Problem', '"Cable, 5m",n/a,"Price: not a number; Name: missing"', 'Desk,"say ""hi""",Code: too long'])
  })
  it('has no heading line when the file had none', () => {
    const table = parseTable('Cable,4\nLamp,x', { headerRow: false })
    expect(leftOutCsv(table, [{ line: 2, problem: 'not a number' }], { headerRow: false })).toBe('Lamp,x,not a number')
  })
})

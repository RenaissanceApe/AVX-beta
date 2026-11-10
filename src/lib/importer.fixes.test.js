import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { FIXES, SERVER_KEYS, fixesFor, fixTable, withPending, groupProblems, closest, checkImport, buildRows, dryRun, parseTable } from './importer'

const future = days => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10)

describe('import fixes: every reason has a way forward', () => {
  // The reasons the check gives, read from the importer itself, so a new one can't ship without an entry
  const source = readFileSync(new URL('./importer.js', import.meta.url), 'utf8')
  const checkReasons = new Set([
    ...[...source.matchAll(/(?:reason|error|note): '(\w+)'/g)].map(m => m[1]),
    ...[...source.matchAll(/'(power(?:NeedVolts|Typical|Range))'/g)].map(m => m[1]),
    ...[...source.matchAll(/missingItem\([^)']*'(\w+)'/g)].map(m => m[1]),
  ])
  checkReasons.delete('leftOut') // the user's own choice, not a problem

  it('finds the reasons in the source (the scan works)', () => {
    for (const r of ['unknownLocation', 'archivedLocation', 'unknownKit', 'number', 'choice', 'powerNeedVolts', 'serialQuantity', 'quantityKept', 'inactive']) expect(checkReasons.has(r)).toBe(true)
  })
  it('has a FIXES entry for every reason the check gives', () => {
    expect([...checkReasons].filter(r => !FIXES[r])).toEqual([])
  })
  it('has a FIXES entry for every reason the database gives', () => {
    expect(SERVER_KEYS.filter(r => !FIXES[r])).toEqual([])
  })
  it('offers at least one fix besides leaving the rows out, unless left out on purpose', () => {
    for (const [reason, entry] of Object.entries(FIXES)) {
      if (entry.purpose) { expect(fixesFor(reason)).toEqual([]); continue }
      if (entry.note && !entry.fixes) continue
      const offered = fixesFor(reason).filter(f => f.id !== 'skip' && !f.im3)
      expect(offered.length, reason).toBeGreaterThan(0)
    }
  })
  it('ends problems with "leave these rows out", but not heads-ups', () => {
    expect(fixesFor('unknownLocation').at(-1)).toEqual({ id: 'skip', im3: false })
    expect(fixesFor('clientUnknown').map(f => f.id)).toEqual(['addContact', 'linkContact'])
    expect(fixesFor('archived')[0]).toEqual({ id: 'restoreItem', im3: false })
  })
  it('covers the speaker and power refusals (D80, D93)', () => {
    expect(FIXES.unknownPreset.fixes).toEqual(['pickPreset', 'leaveEmpty'])
    for (const r of ['speakerRange', 'freqOrder', 'speakerSpec', 'powerRange', 'powerTypical', 'powerSpec']) expect(FIXES[r].fixes).toContain('edit')
    expect(FIXES.powerNeedVolts.fixes).toEqual(['fillVolts', 'edit'])
  })
})

describe('import fixes: fixTable', () => {
  const table = parseTable('Name;Location;Qty\nXLR;warehouse;4\nDI;Warehouse ;2\nAmp;Main;1')
  const mapping = { Name: 'name', Location: 'location', Qty: 'quantity' }

  it('replaces a value in every row that has it, ignoring capitals and spaces around', () => {
    const { table: out } = fixTable(table, mapping, [{ type: 'replace', field: 'location', from: 'warehouse', set: { location: 'Main' } }])
    expect(out.rows.map(r => r[1])).toEqual(['Main', 'Main', 'Main'])
    expect(table.rows[0][1]).toBe('warehouse') // the file itself isn't changed
  })
  it('edits single cells by line, and adds a column for a field the file lacks', () => {
    const { table: out, mapping: map } = fixTable(table, mapping, [{ type: 'cells', edits: { 3: { quantity: '5', current_v: '230' } } }])
    expect(out.rows[1][2]).toBe('5')
    const col = Object.keys(map).find(h => map[h] === 'current_v')
    expect(out.rows.map(r => r[out.headers.indexOf(col)])).toEqual(['', '230', ''])
    expect(Object.keys(mapping)).toHaveLength(3)
  })
  it('counts lines from 1 when the file has no heading row', () => {
    const plain = parseTable('XLR;warehouse;4', { headerRow: false })
    const { table: out } = fixTable(plain, { 'Column 1': 'name' }, [{ type: 'cells', edits: { 1: { name: 'XLR 10 m' } } }], { headerRow: false })
    expect(out.rows[0][0]).toBe('XLR 10 m')
  })
})

describe('import fixes: the new predictions', () => {
  it('tells an archived location and an archived item code from an unknown one', () => {
    const existing = { locations: [{ name: 'Old store', archived_at: '2026-01-01' }], items: [{ id: 'a', name: 'Old', code: 'OLD-1', tracking: 'serial', archived_at: '2026-01-01' }], units: [] }
    const rows = [
      { _row: 2, item_code: 'OLD-1', code: 'U1', _errors: [] },
      { _row: 3, item_code: 'X', location: 'old store', _errors: [] },
    ]
    expect(dryRun(rows, 'units', existing).plan.map(p => p.reason)).toEqual(['archived', 'archivedLocation'])
  })
  it('predicts a quantity on a new per-unit item, a tracking change on stocked items and quantities kept', () => {
    const existing = { locations: [{ name: 'Main' }], items: [{ id: 'i1', name: 'Speaker', code: 'SPK', tracking: 'bulk' }], stocked: ['i1'] }
    const rows = [
      { _row: 2, name: 'Mic', tracking: 'serial', quantity: 3, location: 'Main', _errors: [] },
      { _row: 3, code: 'SPK', tracking: 'serial', _errors: [] },
      { _row: 4, code: 'SPK', quantity: 4, location: 'Main', _errors: [] },
    ]
    const { plan } = dryRun(rows, 'items', existing)
    expect(plan.map(p => p.reason || p.note)).toEqual(['serialQuantity', 'trackingLocked', 'quantityKept'])
    expect(plan[2].action).toBe('match')
  })
  it('predicts a unit code already on another item', () => {
    const existing = { locations: [], items: [{ id: 'a', name: 'A', code: 'A', tracking: 'serial' }, { id: 'b', name: 'B', code: 'B', tracking: 'serial' }], units: [{ code: 'u-1', item_id: 'b' }] }
    expect(dryRun([{ _row: 2, item_code: 'A', code: 'U-1', _errors: [] }], 'units', existing).plan[0]).toMatchObject({ reason: 'otherItem', field: 'code' })
  })
  it('predicts gigs that share a name, for jobs and their equipment', () => {
    const gigs = [{ id: 'g1', name: 'Gala', start_date: future(3) }, { id: 'g2', name: 'Gala', start_date: future(3) }]
    expect(dryRun([{ _row: 2, name: 'Gala', start_date: future(3), _errors: [] }], 'gigs', { gigs }).plan[0].reason).toBe('sameGig')
    expect(dryRun([{ _row: 2, name: 'Gala', start_date: future(9), _errors: [] }], 'gigs', { gigs }).plan[0].action).toBe('create')
    expect(dryRun([{ _row: 2, name: 'Gala', start_date: future(3), _errors: [] }], 'gigs', { gigs }).plan[0].reason).toBe('sameGig')
    expect(dryRun([{ _row: 2, gig: 'gala', item: 'X', _errors: [] }], 'gig_equipment', { gigs, items: [] }).plan[0].reason).toBe('sameGig')
  })
  it('gives a heads-up for a client not in Contacts, and leaves a sent quote out on purpose', () => {
    const job = dryRun([{ _row: 2, name: 'Show', start_date: future(3), client: 'Nova', _errors: [] }], 'gigs', { gigs: [], clients: [{ name: 'Other' }] }).plan[0]
    expect(job).toMatchObject({ action: 'create', note: 'clientUnknown', value: 'Nova' })
    const quote = dryRun([{ _row: 2, quote_ref: 'Q-1', description: 'A', _errors: [] }], 'quotes', { quotes: [{ import_ref: 'q-1', status: 'sent' }] }).plan[0]
    expect(quote).toMatchObject({ action: 'skip', reason: 'quoteSent', purpose: true })
  })
})

describe('import fixes: groupProblems', () => {
  const existing = { locations: [{ name: 'Main' }], items: [] }
  const table = parseTable('Name;Qty;Location;Price\nXLR;4;warehouse;n/a\nDI;2;Warehouse;n/a\nAmp;1;Van;3\nCable;x;Main;1')
  const mapping = { Name: 'name', Qty: 'quantity', Location: 'location', Price: 'unit_price' }

  it('groups by cause and value, and cell problems by field', () => {
    const rows = buildRows(table, mapping, 'items')
    const { plan } = dryRun(rows, 'items', existing)
    const groups = groupProblems(rows, plan, 'items', (line, field) => table.rows[line - 2][Object.values(mapping).indexOf(field)])
    expect(groups.map(g => [g.reason, g.field, g.value, g.lines.map(l => l.line)])).toEqual([
      ['number', 'unit_price', null, [2, 3]],
      ['unknownLocation', 'location', 'Van', [4]],
      ['whole', 'quantity', null, [5]],
    ])
    expect(groups[0].lines[0].raw).toBe('n/a')
  })
  it('keeps the check whole: fixes, pending additions, rows left out and the counts', () => {
    const fixes = [
      { type: 'replace', field: 'unit_price', from: 'n/a', set: { unit_price: '' } },
      { type: 'add', what: 'location', record: { name: 'Van', kind: 'vehicle' } },
      { type: 'skip', lines: [5] },
    ]
    const check = checkImport({ table, mapping, kind: 'items', existing, fixes })
    expect(check.groups.map(g => [g.reason, g.value])).toEqual([['unknownLocation', 'warehouse']])
    expect(check.counts).toMatchObject({ create: 1, problems: 2, leftOut: 1 })
    expect(check.adds).toEqual({ location: 1, item: 0, client: 0 })
    expect(check.sendable.map(r => r.name)).toEqual(['Amp'])
  })
  it('adds an item for units with the form\'s details, so its rows go in', () => {
    const units = parseTable('Item;Barcode\nMic 58;M1\nmic 58;M2')
    const fixes = [{ type: 'add', what: 'item', record: { name: 'Mic 58', code: 'MIC58', tracking: 'serial' } }]
    expect(withPending({ items: [] }, fixes).items[0]).toMatchObject({ name: 'Mic 58', tracking: 'serial', pending: true })
    const check = checkImport({ table: units, mapping: { Item: 'item', Barcode: 'code' }, kind: 'units', existing: { locations: [], items: [], units: [] }, fixes })
    expect(check.counts.create).toBe(2)
  })
})

describe('import fixes: closest names', () => {
  it('puts the same name first, then one inside the other, then the fewest letters apart', () => {
    expect(closest('warehouse', ['Van', 'Main warehouse', 'Warehose', 'WAREHOUSE'])).toEqual(['WAREHOUSE', 'Main warehouse', 'Warehose', 'Van'])
  })
})

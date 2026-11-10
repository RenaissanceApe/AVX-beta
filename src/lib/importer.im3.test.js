import { describe, it, expect } from 'vitest'
import { PICKS, FIXES, fixesFor, checkImport, buildRows, dryRun, parseTable, fixRows, presetFixes, liveFixes, withPresetFixes, withPending, mergeResults, PRESET_FIXES_MAX } from './importer'

// IM3 (docs/SWITCHING.md, "How IM3 works"): exact picks, additions sent with the import, restoring
// an archived item, switching a bulk item to per unit, fixes remembered with a saved matching
const two = [
  { id: 'a1', name: 'Shure SM58', code: null, tracking: 'none', kind: 'rental', archived_at: null },
  { id: 'a2', name: 'Shure SM58', code: null, tracking: 'none', kind: 'rental', archived_at: null },
]

describe('exact picks', () => {
  it('are read from a pick column but never make an empty row count', () => {
    const table = parseTable('Name;Pick\nShure SM58;a2\n;a1')
    const rows = buildRows(table, { Name: 'name', Pick: '_item_id' }, 'items')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Shure SM58', _item_id: 'a2' })
    expect(PICKS).toContain('_contact_id')
  })

  it('choose which one of two same-named items without codes', () => {
    const table = parseTable('Name;Price\nShure SM58;12')
    const existing = { items: two, locations: [] }
    const before = checkImport({ table, mapping: { Name: 'name', Price: 'unit_price' }, kind: 'items', existing, fixes: [] })
    expect(before.groups[0].reason).toBe('sameName')
    const fixes = [{ key: before.groups[0].key, fix: 'chooseItem', type: 'replace', field: 'name', from: 'shure sm58', set: { _item_id: 'a2' } }]
    const after = checkImport({ table, mapping: { Name: 'name', Price: 'unit_price' }, kind: 'items', existing, fixes })
    expect(after.groups).toEqual([])
    expect(after.plan[0].action).toBe('match')
    expect(after.sendable[0]._item_id).toBe('a2')
  })

  it('find the item, kit and gig of units, kit contents and equipment on jobs', () => {
    const items = [...two.map(i => ({ ...i, tracking: 'serial' })), { id: 'k1', name: 'Case', code: null, tracking: 'bulk', kit_type: 'case', kind: 'rental' }]
    const gigs = [{ id: 'g1', name: 'Festival', start_date: '2099-01-01' }, { id: 'g2', name: 'Festival', start_date: '2099-02-01' }]
    const unit = dryRun([{ _row: 2, _errors: [], item: 'Shure SM58', _item_id: 'a1', code: 'U1' }], 'units', { items, locations: [] })
    expect(unit.plan[0].action).toBe('create')
    const kit = dryRun([{ _row: 2, _errors: [], kit: 'Case', item: 'Shure SM58', _kit_id: 'k1', _item_id: 'a2' }], 'kits', { items, parts: [] })
    expect(kit.plan[0].action).toBe('create')
    const line = dryRun([{ _row: 2, _errors: [], gig: 'Festival', _gig_id: 'g2', item: 'Shure SM58', _item_id: 'a2' }], 'gig_equipment', { gigs, items, lines: [] })
    expect(line.plan[0].action).toBe('create')
    const noPick = dryRun([{ _row: 2, _errors: [], gig: 'Festival', item: 'Shure SM58', _item_id: 'a2' }], 'gig_equipment', { gigs, items, lines: [] })
    expect(noPick.plan[0].reason).toBe('sameGig')
  })

  it('a pick of a record that is gone falls back to the name (and its problem)', () => {
    const r = dryRun([{ _row: 2, _errors: [], name: 'Shure SM58', _item_id: 'gone' }], 'items', { items: two, locations: [] })
    expect(r.plan[0].reason).toBe('sameName')
  })

  it('choose a contact by id, or add the row as a new contact', () => {
    const contacts = [{ id: 'c1', name: 'Acme', email: null, tax_id: null }, { id: 'c2', name: 'Acme', email: null, tax_id: null }]
    expect(dryRun([{ _row: 2, _errors: [], name: 'Acme' }], 'clients', { contacts }).plan[0].reason).toBe('sameContact')
    expect(dryRun([{ _row: 2, _errors: [], name: 'Acme', _contact_id: 'c2' }], 'clients', { contacts }).plan[0].action).toBe('match')
    const fresh = dryRun([{ _row: 2, _errors: [], name: 'Acme', _new: 'yes' }, { _row: 3, _errors: [], name: 'Acme', _new: 'yes' }], 'clients', { contacts })
    expect(fresh.plan.map(p => p.action)).toEqual(['create', 'create'])
  })

  it('no fix waits for the database part any more', () => {
    for (const reason of Object.keys(FIXES)) expect(fixesFor(reason).filter(f => f.im3), reason).toEqual([])
    expect(FIXES.bulkItem.fixes[0]).toBe('perUnit')
    expect(FIXES.sameContact.fixes).toContain('newContact')
  })
})

describe('what the fixes add, sent with the import', () => {
  it('in the order the database applies them, with empty values left out', () => {
    const fixes = [
      { type: 'replace', field: 'status', from: 'gepland', set: { status: 'confirmed' } },
      { type: 'perUnit', id: 'i9' },
      { type: 'add', what: 'item', record: { name: 'DI', code: null, tracking: 'bulk' } },
      { type: 'track', id: 'i3' },
      { type: 'add', what: 'location', record: { name: 'Van', kind: 'vehicle' } },
      { type: 'restore', id: 'l1', name: 'Old store' },
      { type: 'restore', what: 'item', id: 'i2', name: 'Amp' },
      { type: 'add', what: 'client', record: { name: 'Acme' } },
      { type: 'skip', lines: [3] },
    ]
    expect(fixRows(fixes)).toEqual([
      { _fix: 'restore_location', id: 'l1' },
      { _fix: 'restore_item', id: 'i2' },
      { _fix: 'add_location', name: 'Van', kind: 'vehicle' },
      { _fix: 'add_item', name: 'DI', tracking: 'bulk' },
      { _fix: 'add_client', name: 'Acme' },
      { _fix: 'track', id: 'i3' },
      { _fix: 'per_unit', id: 'i9' },
    ])
  })

  it('a restored item and a switched item count in the check', () => {
    const items = [{ id: 'i2', name: 'Amp', code: 'AMP1', tracking: 'bulk', archived_at: '2026-01-01' }, { id: 'i9', name: 'Mic', code: 'M1', tracking: 'bulk' }]
    const ex = withPending({ items, locations: [] }, [{ type: 'restore', what: 'item', id: 'i2' }, { type: 'perUnit', id: 'i9' }])
    expect(ex.items.find(i => i.id === 'i2').archived_at).toBeNull()
    expect(ex.items.find(i => i.id === 'i9').tracking).toBe('serial')
    const table = parseTable('Item code;Code\nM1;U1')
    const before = checkImport({ table, mapping: { 'Item code': 'item_code', Code: 'code' }, kind: 'units', existing: { items, locations: [], units: [] }, fixes: [] })
    expect(before.groups[0].reason).toBe('bulkItem')
    const after = checkImport({ table, mapping: { 'Item code': 'item_code', Code: 'code' }, kind: 'units', existing: { items, locations: [], units: [] }, fixes: [{ type: 'perUnit', id: 'i9', key: before.groups[0].key }] })
    expect(after.groups).toEqual([])
    expect(after.plan[0].action).toBe('create')
  })

  it('the parts\' results add up what the fixes added', () => {
    expect(mergeResults([{ created: 1, added: 2 }, { created: 1 }]).added).toBe(2)
  })
})

describe('fixes remembered with a saved matching', () => {
  it('keep what does not depend on the file\'s lines', () => {
    const fixes = [
      { key: 'a', type: 'replace', field: 'status', from: 'gepland', set: { status: 'confirmed' }, count: 4 },
      { key: 'b', type: 'cells', edits: { 3: { name: 'x' } } },
      { key: 'c', type: 'skip', lines: [5, 6] },
      { key: 'd', type: 'add', what: 'location', record: { name: 'Van' }, edits: { 2: { kind: 'vehicle' } } },
    ]
    const saved = presetFixes(fixes)
    expect(saved.map(f => f.key)).toEqual(['a', 'd'])
    expect(saved[0].count).toBeUndefined()
    expect(saved[1].edits).toBeUndefined()
  })

  it('stay within the size the database takes', () => {
    const many = Array.from({ length: 2000 }, (_, n) => ({ key: `k${n}`, type: 'replace', field: 'status', from: `word ${n}`, set: { status: 'confirmed' } }))
    const saved = presetFixes(many)
    expect(saved.length).toBeLessThan(many.length)
    expect(JSON.stringify(saved).length).toBeLessThanOrEqual(PRESET_FIXES_MAX)
  })

  it('come back without replacing a fix already made for the same group', () => {
    const now = [{ key: 'a', type: 'skip', lines: [2] }]
    const saved = [{ key: 'a', type: 'replace' }, { key: 'b', type: 'replace' }, null]
    expect(withPresetFixes(now, saved).map(f => f.key)).toEqual(['a', 'b'])
    expect(withPresetFixes(now, null)).toEqual(now)
  })

  it('are dropped when they no longer fit what the organisation has', () => {
    const existing = {
      items: [{ id: 'i1', name: 'Amp', tracking: 'none' }, { id: 'i2', name: 'Old', archived_at: '2026-01-01' }, { id: 'i3', name: 'Mic', tracking: 'serial' }],
      locations: [{ id: 'l1', name: 'Van' }],
      gigs: [{ id: 'g1', name: 'Festival' }],
      contacts: [],
    }
    const fixes = [
      { key: 'pick-ok', type: 'replace', set: { item: 'Amp', _item_id: 'i1' } },
      { key: 'pick-archived', type: 'replace', set: { _item_id: 'i2' } },
      { key: 'pick-gone', type: 'replace', set: { _gig_id: 'g9' } },
      { key: 'gig-ok', type: 'replace', set: { _gig_id: 'g1' } },
      { key: 'new-ok', type: 'replace', set: { _new: 'yes' } },
      { key: 'add-there', type: 'add', what: 'location', record: { name: 'van' } },
      { key: 'add-ok', type: 'add', what: 'location', record: { name: 'Store' } },
      { key: 'restore-ok', type: 'restore', what: 'item', id: 'i2' },
      { key: 'restore-done', type: 'restore', id: 'l1' },
      { key: 'track-ok', type: 'track', id: 'i1' },
      { key: 'perunit-done', type: 'perUnit', id: 'i3' },
    ]
    expect(liveFixes(fixes, existing).map(f => f.key)).toEqual(['pick-ok', 'gig-ok', 'new-ok', 'add-ok', 'restore-ok', 'track-ok'])
  })
})

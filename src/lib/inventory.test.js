import { describe, it, expect } from 'vitest'
import { levelsByItem, isLowStock, countCorrection, bookValue, parseStockImport, matchItem, scanUrl, expandPlan, kitsFree, alternativesOf } from './inventory'

describe('stock levels', () => {
  it('adds up per item and location', () => {
    const map = levelsByItem([
      { item_id: 'a', location_id: 'w', quantity: 28, in_repair: 0 },
      { item_id: 'a', location_id: 'v', quantity: 2, in_repair: 0 },
      { item_id: 'b', location_id: null, quantity: 3, in_repair: 1 },
    ])
    expect(map.a).toEqual({ total: 30, inRepair: 0, byLocation: { w: 28, v: 2 } })
    expect(map.b).toEqual({ total: 3, inRepair: 1, byLocation: { none: 3 } })
  })
  it('flags low stock only for tracked items with a minimum', () => {
    expect(isLowStock({ tracking: 'bulk', min_stock: 10 }, 9)).toBe(true)
    expect(isLowStock({ tracking: 'bulk', min_stock: 10 }, 10)).toBe(false)
    expect(isLowStock({ tracking: 'bulk', min_stock: null }, 0)).toBe(false)
    expect(isLowStock({ tracking: 'none', min_stock: 5 }, 0)).toBe(false)
    expect(isLowStock({ tracking: 'serial', min_stock: 2 }, undefined)).toBe(true)
  })
  it('turns a count into a correction', () => {
    expect(countCorrection(30, 28)).toEqual({ direction: 'out', quantity: 2 })
    expect(countCorrection(0, 12)).toEqual({ direction: 'in', quantity: 12 })
    expect(countCorrection(5, 5)).toBeNull()
    expect(countCorrection(undefined, 3)).toEqual({ direction: 'in', quantity: 3 })
  })
})

describe('book value', () => {
  const on = new Date(2026, 0, 1)
  it('depreciates in a straight line', () => {
    expect(bookValue({ purchase_cost: 1200, purchase_date: '2024-01-01', depreciation_months: 48 }, on)).toBe(600)
    expect(bookValue({ purchase_cost: 1200, purchase_date: '2024-01-01' }, on)).toBe(720) // 60 months by default
    expect(bookValue({ purchase_cost: 1200, purchase_date: '2020-01-01', depreciation_months: 12 }, on)).toBe(0)
  })
  it('handles missing data', () => {
    expect(bookValue({ purchase_cost: null }, on)).toBeNull()
    expect(bookValue({ purchase_cost: 500 }, on)).toBe(500)
    expect(bookValue({ purchase_cost: 500, purchase_date: '2026-06-01' }, on)).toBe(500) // bought later
  })
})

describe('import', () => {
  it('reads pasted rows and reports bad lines', () => {
    const { rows, errors } = parseStockImport([
      '# name; category; code; qty; price; location',
      'XLR 10m;Cables;XLR10;50;2,50;Warehouse',
      'Shure SM58\tMics\t\t12',
      'DI box',
      ';no name',
      'Bad qty;;;-3',
      'Bad code;;has space;1',
    ].join('\n'))
    expect(rows).toEqual([
      { name: 'XLR 10m', category: 'Cables', code: 'XLR10', quantity: 50, unit_price: 2.5, location: 'Warehouse' },
      { name: 'Shure SM58', category: 'Mics', code: null, quantity: 12, unit_price: null, location: null },
      { name: 'DI box', category: null, code: null, quantity: 0, unit_price: null, location: null },
    ])
    expect(errors).toEqual([5, 6, 7])
  })
  it('matches existing items by code, then by name', () => {
    const items = [{ id: '1', name: 'XLR 10m', code: 'C-1' }, { id: '2', name: 'DI box', code: null }]
    expect(matchItem(items, { name: 'Other', code: 'c-1' }).id).toBe('1')
    expect(matchItem(items, { name: 'di BOX', code: null }).id).toBe('2')
    expect(matchItem(items, { name: 'New', code: 'X' })).toBeNull()
  })
  it('builds the address a label opens', () => {
    expect(scanUrl('https://avx.app/', 'U-7KQ2M9XA')).toBe('https://avx.app/scan/U-7KQ2M9XA')
  })
})

describe('availability', () => {
  const at = (d, h = 0) => new Date(2026, 10, d, h).toISOString()
  it('works out when a gig\'s equipment is out', async () => {
    const { equipmentWindow, quoteWindow } = await import('./inventory')
    expect(equipmentWindow({ start_date: null })).toBeNull()
    expect(equipmentWindow({ start_date: '2026-11-10', end_date: '2026-11-11' })).toEqual({ from: at(10), until: at(12) })
    expect(equipmentWindow({ start_date: '2026-11-10' }, { equipment_prep_days: 1, equipment_return_days: 2 })).toEqual({ from: at(9), until: at(13) })
    expect(quoteWindow({ from: '2026-11-10', until: '2026-11-10' }, {})).toEqual({ from: at(10), until: at(11) })
    expect(quoteWindow(null, {})).toBeNull()
  })
  it('says how many are missing', async () => {
    const { shortBy } = await import('./inventory')
    expect(shortBy({ quantity: 6, available: 4 })).toBe(2)
    expect(shortBy({ quantity: 6, available: -3 })).toBe(6)
    expect(shortBy({ quantity: 2, available: 10 })).toBe(0)
  })
  it('counts the busiest moment of each day', async () => {
    const { dailyAvailability } = await import('./inventory')
    const days = dailyAvailability(10, [
      { starts_at: at(10), ends_at: at(12), quantity: 6 },
      { starts_at: at(11, 18), ends_at: at(11, 23), quantity: 3 },
      { starts_at: at(11, 8), ends_at: at(11, 12), quantity: 4 }, // morning, gone before the evening one
    ], '2026-11-09', 4)
    expect(days.map(d => [d.day, d.booked, d.free])).toEqual([
      ['2026-11-09', 0, 10], ['2026-11-10', 6, 4], ['2026-11-11', 10, 0], ['2026-11-12', 0, 10],
    ])
  })
})

describe('warehouse', () => {
  it('reads codes from our labels and from other barcodes', async () => {
    const { codeFromScan } = await import('./inventory')
    expect(codeFromScan('https://avx.app/scan/U-7KQ2M9XA')).toBe('U-7KQ2M9XA')
    expect(codeFromScan('https://avx.app/scan/XLR%2010')).toBeNull() // spaces aren't codes
    expect(codeFromScan('  SPK-02 ')).toBe('SPK-02')
    expect(codeFromScan('4006381333931')).toBe('4006381333931')
    expect(codeFromScan('')).toBeNull()
    expect(codeFromScan('not a code')).toBeNull()
  })
  it('measures packing and returns', async () => {
    const { dispatchProgress } = await import('./inventory')
    const p = dispatchProgress([
      { item_id: 'a', planned: 2, out_qty: 3, back_qty: 1 },
      { item_id: 'b', planned: 10, out_qty: 6, back_qty: 6 },
      { item_id: 'c', planned: 0, out_qty: 1, back_qty: 0 }, // taken without being planned
    ])
    expect(p).toEqual({ planned: 12, out: 8, outTotal: 10, back: 7, toPack: 1, notBack: 2 })
  })
})

describe('kits', () => {
  const parts = [
    { parent_id: 'set', child_id: 'spk', kind: 'content', quantity: 2 },
    { parent_id: 'set', child_id: 'xlr', kind: 'content', quantity: 4 },
    { parent_id: 'big', child_id: 'set', kind: 'content', quantity: 2 },
    { parent_id: 'spk', child_id: 'clamp', kind: 'accessory', quantity: 1 },
    { parent_id: 'case', child_id: 'spk', kind: 'content', quantity: 2 },
  ]
  const items = { set: { kit_type: 'set' }, big: { kit_type: 'set' }, case: { kit_type: 'case' } }

  it('brings accessories with an item, only for the increase', () => {
    expect(expandPlan({ spk: 3 }, {}, parts, items)).toEqual({ lines: { spk: 3, clamp: 3 }, added: { clamp: 3 } })
    expect(expandPlan({ spk: 5 }, { spk: 3, clamp: 3 }, parts, items).lines).toEqual({ spk: 5, clamp: 5 })
    expect(expandPlan({ spk: 2 }, { spk: 3, clamp: 3 }, parts, items).lines).toEqual({ spk: 2 })
  })
  it('turns sets into their contents, nested sets too', () => {
    expect(expandPlan({ set: 1 }, { xlr: 10 }, parts, items).lines).toEqual({ spk: 2, xlr: 14, clamp: 2 })
    expect(expandPlan({ big: 1 }, {}, parts, items).lines).toEqual({ spk: 4, xlr: 8, clamp: 4 })
  })
  it('keeps a case as a line with its contents', () => {
    expect(expandPlan({ case: 2 }, {}, parts, items).lines).toEqual({ case: 2, spk: 4, clamp: 4 })
  })
  it('adds picked and brought quantities together', () => {
    expect(expandPlan({ set: 1, spk: 1 }, {}, parts, items).lines).toEqual({ spk: 3, xlr: 4, clamp: 3 })
  })
  it('stops on a loop', () => {
    const loop = [{ parent_id: 'a', child_id: 'b', quantity: 1 }, { parent_id: 'b', child_id: 'a', quantity: 1 }]
    expect(() => expandPlan({ a: 1 }, {}, loop, {})).not.toThrow()
  })
  it('counts how many sets are free', () => {
    expect(kitsFree('set', parts, items, { spk: { available: 5 }, xlr: { available: 40 }, clamp: { available: 10 } })).toBe(2)
    expect(kitsFree('set', parts, items, { spk: { available: -1 } })).toBe(0)
    expect(kitsFree('set', parts, items, {})).toBe(null)
  })
  it('finds alternatives either way round', () => {
    expect(alternativesOf('a', [{ item_a: 'a', item_b: 'b' }, { item_a: 'c', item_b: 'a' }, { item_a: 'c', item_b: 'd' }])).toEqual(['b', 'c'])
  })
})

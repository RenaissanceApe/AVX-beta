import { describe, it, expect } from 'vitest'
import { parseRange, overlapDays, quoteItemRevenue, inventoryReport, reportCsv } from './reports'

describe('reports', () => {
  it('reads Postgres time ranges', () => {
    const r = parseRange('["2026-11-12 00:00:00+00","2026-11-16 00:00:00+00")')
    expect(r.from.toISOString()).toBe('2026-11-12T00:00:00.000Z')
    expect(r.until.toISOString()).toBe('2026-11-16T00:00:00.000Z')
    expect(parseRange('nonsense')).toBe(null)
  })
  it('measures overlap in days', () => {
    const a = { from: new Date('2026-01-01T00:00:00Z'), until: new Date('2026-01-11T00:00:00Z') }
    expect(overlapDays(a, { from: new Date('2026-01-06T00:00:00Z'), until: new Date('2026-02-01T00:00:00Z') })).toBe(5)
    expect(overlapDays(a, { from: new Date('2026-02-01T00:00:00Z'), until: new Date('2026-03-01T00:00:00Z') })).toBe(0)
  })
  it('splits quote revenue by item, after discounts, without optional phases', () => {
    const quote = { discount_pct: 10, body: { phases: [
      { discount_pct: 50, sections: [{ lines: [{ kind: 'rental', item_id: '11111111-1111-4111-8111-111111111111', qty: 2, factor: 1, unit_price: 100 }] }] },
      { optional: true, sections: [{ lines: [{ kind: 'rental', item_id: '11111111-1111-4111-8111-111111111111', qty: 9, factor: 1, unit_price: 100 }] }] },
      { sections: [{ lines: [{ kind: 'crew', qty: 1, factor: 1, unit_price: 300 }] }] },
    ] } }
    expect(quoteItemRevenue(quote)).toEqual({ '11111111-1111-4111-8111-111111111111': 90 })
  })
  it('adds up use, revenue, repairs, losses and value per item', () => {
    const items = [
      { id: 'spk', name: 'Speaker', tracking: 'serial', replacement_value: 1000 },
      { id: 'xlr', name: 'XLR', tracking: 'bulk' },
      { id: 'lab', name: 'Labour', tracking: 'none' },
    ]
    const report = inventoryReport({
      items, owned: { spk: 2, xlr: 10 },
      from: '2026-01-01T00:00:00Z', until: '2026-01-11T00:00:00Z', today: new Date('2026-03-01T00:00:00Z'),
      reservations: [{ resource_id: 'spk', quantity: 2, gig_id: 'g1', period: '["2026-01-06 00:00:00+00","2026-01-16 00:00:00+00")' }],
      quotes: [{ body: { phases: [{ sections: [{ lines: [{ kind: 'rental', item_id: 'spk', qty: 2, factor: 3, unit_price: 50 }] }] }] } }],
      repairs: [{ item_id: 'spk', quantity: 1, cost: 80, charge_client: true }, { item_id: 'xlr', quantity: 2, cost: null }],
      movements: [{ item_id: 'spk', kind: 'lost', quantity: 1 }],
      units: [{ item_id: 'spk', status: 'available', purchase_cost: 1200, purchase_date: '2026-01-01', depreciation_months: 12 }],
      subrentals: [{ lines: [{ item_id: 'spk', quantity: 2, unit_cost: 40 }] }],
    })
    expect(report.rows.map(r => r.id)).toEqual(['spk', 'xlr'])
    const spk = report.rows[0]
    expect(spk.use).toBe(0.5)
    expect(spk.gigs).toBe(1)
    expect(spk.revenue).toBe(0) // the quote line links 'spk', which isn't a UUID, so it doesn't count
    expect(spk.repairs).toBe(1)
    expect(spk.charged).toBe(80)
    expect(spk.lostValue).toBe(1000)
    expect(spk.hiredIn).toBe(80)
    expect(spk.bookValue).toBe(1000)
    expect(report.rows[1].idle).toBe(true)
    expect(report.totals).toMatchObject({ repairCost: 80, charged: 80, lostValue: 1000, hiredIn: 80, idle: 1 })
  })
  it('makes CSV for spreadsheets', () => {
    const csv = reportCsv([{ name: 'Coluna; 2"', n: 1.5 }], [{ label: 'Item', value: r => r.name }, { label: 'Use', value: r => r.n }])
    expect(csv).toBe('Item;Use\n"Coluna; 2""";1,5')
  })
})

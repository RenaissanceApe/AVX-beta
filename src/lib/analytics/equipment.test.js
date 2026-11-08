import { describe, it, expect } from 'vitest'
import { toProfitRow, profitTotals, groupByCategory, coverage, paybackState, hasActivity } from './equipment'

// The November rows of supabase/tests/equipment_money.sql, as public.equipment_money returns them
const rows = [
  { item_id: 'c', name: 'Cable', category: 'Cables', tracking: 'bulk', owned: 94, units: 0, units_with_cost: 0, has_cost: true,
    revenue: '200', revenue_sets: '200', depreciation: '50', depreciation_estimated: '0', repairs: '0', inspections: '0', hire_in: '100', losses: '120', profit: '-70' },
  { item_id: 'm', name: 'Moving head', category: 'Lighting', tracking: 'serial', owned: 3, units: 3, units_with_cost: 2, has_cost: true,
    revenue: '800', revenue_sets: '400', depreciation: '350', depreciation_estimated: '100', repairs: '80', inspections: '25', hire_in: '200', losses: '1200', profit: '-1055' },
  { item_id: 'h', name: 'Hazer', category: 'Lighting', tracking: 'serial', owned: 1, units: 1, units_with_cost: 0, has_cost: false,
    revenue: '0', revenue_sets: '0', depreciation: '0', depreciation_estimated: '0', repairs: '0', inspections: '0', hire_in: '0', losses: '0', profit: '0' },
  { item_id: null, name: null, category: null, owned: 0, units: 0, units_with_cost: 0, has_cost: false,
    revenue: '300', revenue_sets: '0', depreciation: '0', depreciation_estimated: '0', repairs: '0', inspections: '0', hire_in: '0', losses: '0', profit: '300' },
].map(toProfitRow)

describe('equipment money helpers', () => {
  it('turn a row into numbers with its costs added up', () => {
    expect(rows[1].costs).toBe(1855)
    expect(rows[1].revenue - rows[1].costs).toBe(rows[1].profit)
    expect(rows[3].id).toBe('not-linked')
  })
  it('add up the period, with the share not linked to an item', () => {
    const t = profitTotals(rows)
    expect(t.revenue).toBe(1300)
    expect(t.profit).toBe(-825)
    expect(t.costs).toBe(2125)
    expect(t.notLinked).toBe(300)
    expect(Math.round(t.notLinkedShare * 100)).toBe(23)
    expect(profitTotals([]).notLinkedShare).toBe(null)
  })
  it('group items by category, leaving the lines typed by hand out', () => {
    const g = Object.fromEntries(groupByCategory(rows).map(r => [r.category, r]))
    expect(Object.keys(g).sort()).toEqual(['Cables', 'Lighting'])
    expect(g.Lighting.items).toBe(2)
    expect(g.Lighting.profit).toBe(-1055)
    expect(g.Cables.revenue).toBe(200)
  })
  it('count purchase-cost coverage and list the gaps', () => {
    const c = coverage(rows)
    expect(c).toMatchObject({ items: 3, itemsWithCost: 2, units: 4, unitsWithCost: 2 })
    expect(c.missing.map(r => r.name)).toEqual(['Hazer'])
  })
  it('say where payback stands', () => {
    expect(paybackState({ paid_back_on: '2026-11-20' })).toBe('paid')
    expect(paybackState({ expected_on: '2028-01-13' })).toBe('expected')
    expect(paybackState({})).toBe('noPace')
  })
  it('keep items with nothing to show out of the table', () => {
    expect(hasActivity(rows[2])).toBe(true) // owned
    expect(hasActivity(toProfitRow({ item_id: 'z', owned: 0 }))).toBe(false)
  })
})

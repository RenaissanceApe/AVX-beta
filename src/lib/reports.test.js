import { describe, it, expect } from 'vitest'
import { reportCsv } from './reports'

describe('reports', () => {
  it('makes CSV for spreadsheets', () => {
    const csv = reportCsv([{ name: 'Coluna; 2"', n: 1.5 }], [{ label: 'Item', value: r => r.name }, { label: 'Use', value: r => r.n }])
    expect(csv).toBe('Item;Use\n"Coluna; 2""";1,5')
  })
})

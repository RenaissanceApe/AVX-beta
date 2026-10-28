import { describe, it, expect } from 'vitest'
import { TRUSS_TABLES, usableTable, tableRows, tableProblems } from './trussTables'

describe('truss load tables', () => {
  it('has the series asked for first (docs/TOOLS_PLAN.md, Q3)', () => {
    const ids = TRUSS_TABLES.map(t => t.id)
    for (const id of ['fantek-ec30', 'fantek-ec40', 'globaltruss-f34', 'globaltruss-f44', 'prolyte-h30v', 'prolyte-x30v', 'prolyte-h40v']) {
      expect(ids).toContain(id)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps where every table came from', () => {
    for (const t of TRUSS_TABLES) {
      expect(t.source.url, t.id).toMatch(/^https:\/\//)
      expect(t.source.sha256, t.id).toMatch(/^[0-9a-f]{64}$/)
      expect(t.source.edition, t.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(t.columns[0], t.id).toBe('span_m')
      for (const r of t.rows) expect(r.length, t.id).toBe(t.columns.length)
    }
  })

  it('blocks a table with problems and offers none before a second person checks it', () => {
    for (const t of TRUSS_TABLES) {
      const problems = tableProblems(t)
      const differs = t.crossCheck?.result === 'differs'
      const open = (t.questions || []).length > 0
      // The same rules as scripts/truss-data/build.py: a value edited by hand can't sneak through
      expect(problems.length > 0 || differs || open, `${t.id}: ${problems.join('; ')}`).toBe(t.status === 'blocked')
      expect(['unchecked', 'blocked', 'checked']).toContain(t.status)
      if (t.status === 'checked') expect(t.checkedBy, t.id).toBeTruthy()
    }
    expect(TRUSS_TABLES.filter(usableTable).every(t => t.checkedBy)).toBe(true)
  })

  it('catches a misread value', () => {
    const f34 = TRUSS_TABLES.find(t => t.id === 'globaltruss-f34')
    expect(tableProblems(f34)).toEqual([])
    const typo = { ...f34, rows: f34.rows.map((r, i) => (i === 10 ? [r[0], r[1] * 10, ...r.slice(2)] : r)) }
    expect(tableProblems(typo).length).toBeGreaterThan(0)
    const missing = { ...f34, rows: f34.rows.filter((_, i) => i !== 5) }
    expect(tableProblems(missing)).toContain('uneven span steps: a row may be missing')
  })

  it('reads rows by column', () => {
    const h30v = TRUSS_TABLES.find(t => t.id === 'prolyte-h30v')
    expect(tableRows(h30v)[0]).toMatchObject({ span_m: 3, udl_kg_m: 649, p2_kg: 1667.9, weight_kg: 18.9 })
  })
})

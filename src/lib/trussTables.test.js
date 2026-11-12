import { describe, it, expect } from 'vitest'
import {
  TRUSS_TABLES, usableTable, tableRows, tableProblems, tableStatus, markFor, rowFor, spanCheck, lineTrussCheck,
  selfWeightIncluded, trussKgPerM, tableById, pickableTables,
} from './trussTables'
import { analyseLine, linesOf } from './rigging'

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

const h30v = () => tableById('prolyte-h30v')
const mark = (t, patch = {}) => ({ id: 'm1', table_id: t.id, edition: t.source.edition, source_sha256: t.source.sha256, status: 'checked', withdrawn_at: null, ...patch })

describe('whether a table may be used (the database decides)', () => {
  it('no table is usable without a check in the database, whatever the JSON says', () => {
    expect(TRUSS_TABLES.filter(t => usableTable(t, [])).length).toBe(0)
    expect(tableStatus(h30v(), [])).toBe('unchecked')
    expect(tableStatus({ ...h30v(), status: 'checked', checkedBy: 'someone' }, [])).toBe('unchecked')
  })

  it('a check counts only for the exact edition and source document', () => {
    const t = h30v()
    expect(tableStatus(t, [mark(t)])).toBe('checked')
    expect(usableTable(t, [mark(t)])).toBe(true)
    expect(tableStatus(t, [mark(t, { source_sha256: 'f'.repeat(64) })])).toBe('unchecked')
    expect(tableStatus(t, [mark(t, { edition: '2022-06-08' })])).toBe('unchecked')
    expect(tableStatus(t, [mark(t, { table_id: 'prolyte-x30v' })])).toBe('unchecked')
  })

  it('a check taken back no longer counts; a block by an AVX admin blocks', () => {
    const t = h30v()
    expect(tableStatus(t, [mark(t, { withdrawn_at: '2026-11-12T10:00:00Z' })])).toBe('unchecked')
    expect(tableStatus(t, [mark(t, { withdrawn_at: '2026-11-12T10:00:00Z' }), mark(t, { id: 'm2', status: 'blocked' })])).toBe('blocked')
    expect(markFor(t, [mark(t, { withdrawn_at: 'x' }), mark(t, { id: 'm2' })]).id).toBe('m2')
  })

  it('a table blocked in the repository stays blocked even with a check, and is never offered', () => {
    const ec40 = tableById('fantek-ec40')
    expect(tableStatus(ec40, [mark(ec40)])).toBe('blocked')
    expect(pickableTables().map(t => t.id)).not.toContain('fantek-ec40')
    expect(pickableTables().every(t => t.status !== 'blocked')).toBe(true)
  })
})

describe('table look-ups', () => {
  it('uses the row for an exact span', () => {
    expect(rowFor(h30v(), 4)).toMatchObject({ row: { span_m: 4, udl_kg_m: 485.3 }, exact: true, below: false })
  })

  it('between two rows takes the next longer span: never interpolates upwards', () => {
    const r = rowFor(h30v(), 4.2)
    expect(r.row.span_m).toBe(5)
    expect(r.row.udl_kg_m).toBe(387.1)
    expect(r.exact).toBe(false)
    // Every value used is a published one, never in between
    for (const s of [3.01, 7.5, 12.25, 19.99]) {
      const { row } = rowFor(h30v(), s)
      expect(tableRows(h30v()).some(x => x.span_m === row.span_m && x.udl_kg_m === row.udl_kg_m)).toBe(true)
      expect(row.span_m).toBeGreaterThanOrEqual(s)
    }
  })

  it('never extrapolates past the longest span; shorter than the table uses its first (strongest-safe) row', () => {
    expect(rowFor(h30v(), 20)).toMatchObject({ row: { span_m: 20 } })
    expect(rowFor(h30v(), 20.01)).toBe(null)
    expect(rowFor(h30v(), 40)).toBe(null)
    expect(spanCheck(h30v(), { span: 21, udl_kg_m: 1 })).toMatchObject({ status: 'outside', range: [3, 20] })
    expect(rowFor(h30v(), 2)).toMatchObject({ row: { span_m: 3 }, below: true })
    expect(rowFor(h30v(), 0)).toBe(null)
    expect(rowFor(h30v(), 'x')).toBe(null)
  })

  it('knows which tables already include the truss\'s own weight, and its weight per metre', () => {
    expect(selfWeightIncluded(h30v())).toBe(true)
    expect(selfWeightIncluded(tableById('globaltruss-f34'))).toBe(true)
    expect(selfWeightIncluded(tableById('fantek-ec30'))).toBe(false)
    expect(trussKgPerM(h30v())).toBe(6.3)
    expect(trussKgPerM(tableById('globaltruss-f34'))).toBe(null)
  })
})

describe('pass/fail per span', () => {
  it('UDL at, near and over the allowable', () => {
    expect(spanCheck(h30v(), { span: 4, udl_kg_m: 400 }).status).toBe('pass')
    // Above 90% is still within the table, but shown as close to the limit
    expect(spanCheck(h30v(), { span: 4, udl_kg_m: 450 }).status).toBe('near')
    expect(spanCheck(h30v(), { span: 4, udl_kg_m: 485.3 })).toMatchObject({ status: 'near', cases: { udl: { use: 1, verdict: 'near' } } })
    expect(spanCheck(h30v(), { span: 4, udl_kg_m: 486 }).status).toBe('fail')
  })

  it('point loads: centre (all as one), third and quarter points (shared evenly)', () => {
    const c = spanCheck(h30v(), { span: 6, points_kg: 600 })
    expect(c.cases.cpl).toMatchObject({ actual: 600, allowed: 914.4 })
    expect(c.cases.tpl).toMatchObject({ actual: 300, allowed: 644.7 })
    expect(c.cases.qpl).toMatchObject({ actual: 200, allowed: 488.7 })
    expect(c.status).toBe('pass')
    // 1000 kg fails as one centre load but would pass shared over the quarter points: the verdict is the strict one
    const d = spanCheck(h30v(), { span: 6, points_kg: 1000 })
    expect(d.cases.cpl.verdict).toBe('fail')
    expect(d.cases.qpl.verdict).toBe('pass')
    expect(d.status).toBe('fail')
  })

  it('mixed loads add up (UDL use + point use)', () => {
    const c = spanCheck(h30v(), { span: 6, udl_kg_m: 160.8, points_kg: 457.2 }) // 50% + 50%
    expect(c.use).toBeCloseTo(1, 6)
    expect(c.status).toBe('near')
    expect(spanCheck(h30v(), { span: 6, udl_kg_m: 80.4, points_kg: 228.6 }).status).toBe('pass') // 25% + 25%
    expect(spanCheck(h30v(), { span: 6, udl_kg_m: 170, points_kg: 457.2 }).status).toBe('fail')
  })

  it('estimates the deflection from the published figures and checks a limit if one is set', () => {
    const c = spanCheck(h30v(), { span: 6, udl_kg_m: 160.8 }) // half the UDL: half of 41 mm
    expect(c.deflection).toMatchObject({ mm: 20.5, verdict: null })
    expect(spanCheck(h30v(), { span: 6, udl_kg_m: 160.8, defl_limit_mm: 20 }).status).toBe('fail')
    expect(spanCheck(h30v(), { span: 6, udl_kg_m: 160.8, defl_limit_mm: 30 }).deflection.verdict).toBe('pass')
  })

  it('a ladder table with only UDL and centre columns has no third or quarter case', () => {
    const c = spanCheck(tableById('prolyte-h30l-1'), { span: 4, points_kg: 50 })
    expect(c.cases.tpl).toBe(null)
    expect(c.cases.qpl).toBe(null)
    expect(c.cases.cpl).not.toBe(null)
  })
})

describe('a truss line against its table', () => {
  const line = extra => linesOf({ lines: [{ id: 'l', name: 'T', length_m: 6, truss_kg_m: 6.3, cable_kg_m: 0, points: [{ id: 'a', at_m: 0 }, { id: 'b', at_m: 6 }], loads: [], ...extra }] })[0]

  it('leaves out the truss weight when the table includes it, adds it when it doesn\'t', () => {
    const a = analyseLine(line({ loads: [{ id: 'x', kg: 300, at_m: 3, to_m: null }] }))
    const c = lineTrussCheck(h30v(), a, { factor: 1 })
    expect(c.spans).toHaveLength(1)
    expect(c.spans[0].cases.udl.actual).toBe(0)
    expect(c.spans[0].cases.cpl.actual).toBe(300)
    const f = lineTrussCheck(tableById('fantek-ec30'), a, { factor: 1 })
    expect(f.spans[0].cases.udl.actual).toBe(6.3)
  })

  it('applies the dynamic factor, and counts a short spread load as a point load', () => {
    const a = analyseLine(line({ truss_kg_m: 0, cable_kg_m: 10, loads: [{ id: 'x', kg: 100, at_m: 1, to_m: 2 }] }))
    const c = lineTrussCheck(h30v(), a, { factor: 1.2 })
    expect(c.spans[0].cases.udl.actual).toBe(12)
    expect(c.spans[0].cases.cpl.actual).toBe(120)
  })

  it('checks each span between points and flags cantilevers and continuous lines', () => {
    const a = analyseLine(line({ length_m: 10, points: [{ id: 'a', at_m: 1 }, { id: 'b', at_m: 5 }, { id: 'c', at_m: 9 }] }))
    const c = lineTrussCheck(h30v(), a)
    expect(c.spans.map(s => [s.from, s.to, s.rowSpan])).toEqual([[1, 5, 4], [5, 9, 4]])
    expect(c.cantilever).toBe(true)
    expect(c.continuous).toBe(true)
    const simple = lineTrussCheck(h30v(), analyseLine(line()))
    expect(simple.cantilever).toBe(false)
    expect(simple.continuous).toBe(false)
    expect(simple.status).toBe('pass')
  })

  it('a span longer than the table is "outside", never a pass', () => {
    const a = analyseLine(line({ length_m: 24, points: [{ id: 'a', at_m: 0 }, { id: 'b', at_m: 24 }] }))
    expect(lineTrussCheck(h30v(), a).status).toBe('outside')
  })
})

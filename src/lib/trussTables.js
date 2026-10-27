// Truss load tables (docs/TRUSS_DATA.md; docs/TOOLS_PLAN.md §5, RG2): the manufacturers' published
// allowable loads, copied as published from their documents by scripts/truss-data. A table may
// only be used for a check once a second person has compared it with its source (status
// 'checked'); 'unchecked' ones are shown as such, 'blocked' ones not offered at all.
import prolyte from '../data/truss/prolyte.json'
import globaltruss from '../data/truss/globaltruss.json'
import fantek from '../data/truss/fantek.json'

export const TRUSS_TABLES = [...fantek.tables, ...globaltruss.tables, ...prolyte.tables]

export const usableTable = t => t?.status === 'checked'

// Columns as an object per row: { span_m, udl_kg_m, p2_kg, … }
export const tableRows = t => t.rows.map(r => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])))

// For n-1 equal loads at L/n on a simple span, the largest bending moment is P × L × k(n)
const kN = n => (n % 2 === 0 ? n / 8 : (n * n - 1) / (8 * n))

// What can't be right in a table: spans out of order or missing, loads that rise or deflections
// that fall as the span grows, more load per point with more points, and (at long spans, where
// bending governs) load cases that break beam theory against the centre load.
export function tableProblems(t) {
  const out = []
  const col = Object.fromEntries(t.columns.map((c, i) => [c, i]))
  const spans = t.rows.map(r => r[0])
  if (spans.some((s, i) => i && s <= spans[i - 1])) out.push('spans not increasing')
  const steps = new Set(spans.slice(1).map((s, i) => Math.round((s - spans[i]) * 100) / 100))
  if (steps.size > 1) out.push(`uneven span steps: a row may be missing`)
  const points = t.columns.filter(c => /^p\d_kg$/.test(c)).sort((a, b) => a[1] - b[1])
  for (const c of t.columns.filter(c => c === 'udl_kg_m' || c === 'udl_pa_kg_m' || points.includes(c))) {
    t.rows.forEach((r, i) => { if (i && r[col[c]] > t.rows[i - 1][col[c]]) out.push(`${c} rises after ${spans[i - 1]} m`) })
  }
  for (const c of t.columns.filter(c => c.endsWith('_defl_mm'))) {
    t.rows.forEach((r, i) => {
      const a = t.rows[i - 1]?.[col[c]], b = r[col[c]]
      if (i && a - b > Math.max(1, 0.1 * a)) out.push(`${c} falls after ${spans[i - 1]} m`)
    })
  }
  for (const r of t.rows) {
    points.forEach((c, i) => { if (i && r[col[c]] > r[col[points[i - 1]]] * 1.001) out.push(`${c} above ${points[i - 1]} at ${r[0]} m`) })
  }
  if ('p2_kg' in col) {
    for (const r of t.rows.filter(x => x[0] >= 0.6 * spans[spans.length - 1])) {
      const p2 = r[col.p2_kg]
      for (const c of points.slice(1)) {
        const want = 0.25 / kN(Number(c[1]))
        if (Math.abs(r[col[c]] / p2 / want - 1) > 0.15) out.push(`${c}/p2 at ${r[0]} m off beam theory`)
      }
      if ('udl_kg_m' in col && Math.abs((r[col.udl_kg_m] * r[0]) / (2 * p2) - 1) > 0.25) out.push(`udl/p2 at ${r[0]} m off beam theory`)
    }
  }
  return out
}

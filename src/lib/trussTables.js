// Truss load tables (docs/TRUSS_DATA.md; docs/TOOLS_PLAN.md §5, RG2): the manufacturers' published
// allowable loads, copied as published from their documents by scripts/truss-data. A table may
// only be used for a check once an AVX admin has compared it with its source row by row and marked
// that exact edition checked in the database (public.truss_table_checks); 'unchecked' ones are
// shown as such, 'blocked' ones (a problem in the published values, an open question to the
// manufacturer, or blocked by an AVX admin) are not offered at all.
import prolyte from '../data/truss/prolyte.json'
import globaltruss from '../data/truss/globaltruss.json'
import fantek from '../data/truss/fantek.json'

export const TRUSS_TABLES = [...fantek.tables, ...globaltruss.tables, ...prolyte.tables]

// The active mark (not taken back) for this table's exact source document, if any
export function markFor(t, checks) {
  if (!t || !Array.isArray(checks)) return null
  return checks.find(c => c && !c.withdrawn_at && c.table_id === t.id
    && c.source_sha256 === t.source?.sha256 && c.edition === t.source?.edition) || null
}

// 'blocked' (in the repository, or by an AVX admin), 'checked' (an AVX admin compared every row of
// this edition with its source document) or 'unchecked'. Only the database can make a table
// checked: a 'checked' status written into the JSON alone doesn't count.
export function tableStatus(t, checks = []) {
  if (!t || t.status === 'blocked') return 'blocked'
  const mark = markFor(t, checks)
  return mark ? mark.status : 'unchecked'
}
export const usableTable = (t, checks) => tableStatus(t, Array.isArray(checks) ? checks : []) === 'checked'
export const tableById = id => TRUSS_TABLES.find(t => t.id === id) || null
export const tableName = t => (t ? `${t.brand} ${t.series}${t.case ? ` · ${t.case}` : ''}` : '')
// Tables a line can pick: everything not blocked in the repository, brand by brand
export const pickableTables = () => TRUSS_TABLES.filter(t => t.status !== 'blocked')

// The truss's own weight per metre, from the table's weight column (longest span), if published
export function trussKgPerM(t) {
  if (!t || !t.columns.includes('weight_kg')) return null
  const r = tableRows(t).filter(x => x.weight_kg > 0).pop()
  return r ? Math.round((r.weight_kg / r.span_m) * 10) / 10 : null
}
// Whether the manufacturer's allowable loads already include the truss's own weight
export const selfWeightIncluded = t => (t?.conditions || []).some(c => /self-weight .*already taken into account/i.test(c))

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

// ── Look-up ──────────────────────────────────────────────────────────────────
// The row to use for a span. Allowable loads only fall as the span grows (tableProblems), so a
// span between two rows takes the next LONGER row (never an interpolation between them, which
// would read slightly high on these curves), and a span shorter than the first row takes the
// first row. A span longer than the last row has no row: nothing is ever extrapolated.
export function rowFor(t, span) {
  const s = Number(span)
  if (!t || !Number.isFinite(s) || s <= 0) return null
  const rows = tableRows(t)
  const r = rows.find(x => x.span_m >= s - 1e-9)
  if (!r) return null
  return { row: r, exact: Math.abs(r.span_m - s) < 1e-9, below: s < rows[0].span_m - 1e-9 }
}
export const spanRange = t => (t ? [t.rows[0][0], t.rows[t.rows.length - 1][0]] : null)

const NEAR = 0.9 // above 90% of the allowable is worth a warning
const verdict = use => (use > 1 + 1e-9 ? 'fail' : use > NEAR ? 'near' : 'pass')
const r1 = v => Math.round(v * 10) / 10

// One simple span (supported at both ends) against a table: udl_kg_m spread over the whole span
// and point loads (kg, anywhere inside the span), both already × the dynamic factor.
// - UDL: the spread load against the allowable UDL.
// - CPL: every point load as if it hung at the centre (the strictest case for a simple span).
// - TPL / QPL: the point loads shared evenly over the third / quarter points (only valid if they
//   really hang there).
// Mixed loads add up: UDL use + point use ≤ 100%. The verdict uses the strictest case (UDL + CPL).
// Deflection: estimated in proportion to the published deflections at the allowable loads.
export function spanCheck(t, { span, udl_kg_m = 0, points_kg = 0, defl_limit_mm = null }) {
  const range = spanRange(t)
  const found = rowFor(t, span)
  if (!found) return { status: 'outside', span, range }
  const r = found.row
  const w = Math.max(0, udl_kg_m), P = Math.max(0, points_kg)
  const udl = r.udl_kg_m > 0 ? { actual: r1(w), allowed: r.udl_kg_m, use: w / r.udl_kg_m } : null
  const base = udl ? udl.use : 0
  const pointCase = (col, shareBy) => {
    if (!(r[col] > 0)) return null
    const actual = P / shareBy
    const use = actual / r[col]
    return { actual: r1(actual), allowed: r[col], use, combined: base + use, verdict: verdict(base + use) }
  }
  const cases = {
    udl: udl && { ...udl, combined: udl.use, verdict: verdict(udl.use) },
    cpl: pointCase('p2_kg', 1),
    tpl: pointCase('p3_kg', 2),
    qpl: pointCase('p4_kg', 3),
  }
  // Without a centre-load column the point loads can't be checked
  const missing = (P > 0 && !cases.cpl) || (w > 0 && !udl)
  const use = (udl ? udl.use : 0) + (cases.cpl ? cases.cpl.use : 0)
  const pDefl = r.p2_defl_mm ?? r.points_defl_mm
  const deflKnown = (w === 0 || r.udl_defl_mm != null) && (P === 0 || pDefl != null)
  const defl = deflKnown ? r1((udl && r.udl_defl_mm ? (w / r.udl_kg_m) * r.udl_defl_mm : 0) + (cases.cpl && pDefl ? (P / r.p2_kg) * pDefl : 0)) : null
  const deflection = { mm: defl, limit: defl_limit_mm, verdict: defl === null || !defl_limit_mm ? null : defl > defl_limit_mm ? 'fail' : 'pass' }
  const status = missing ? 'missing' : deflection.verdict === 'fail' ? 'fail' : verdict(use)
  return { status, span, row: r, rowSpan: r.span_m, exact: found.exact, below: found.below, range, use, cases, deflection }
}

// A truss line against a table: every span between neighbouring hang points is checked as a simple
// span with the loads on it. `a` is analyseLine's result (pointLoads, spreadLoads, supports).
// A spread that covers the whole span counts as UDL; a shorter one counts as a point load (its
// weight on that span), which is stricter. The truss's own weight is left out when the table
// already includes it. Cantilevers and lines on three or more points are flagged: the tables are
// for a single span supported at both ends, so those parts need a structural check.
export function lineTrussCheck(t, a, { factor = 1, defl_limit_mm = null } = {}) {
  const supports = [...(a.supports || [])].sort((x, y) => x - y)
  if (!t || supports.length < 2) return null
  const own = selfWeightIncluded(t)
  const eps = 0.01
  const spans = []
  for (let i = 1; i < supports.length; i++) {
    const from = supports[i - 1], to = supports[i], L = to - from
    if (L < eps) continue
    let udl = 0, pts = 0
    for (const s of a.spreadLoads || []) {
      if (own && s.kind === 'truss') continue
      const lo = Math.max(from, s.from), hi = Math.min(to, s.to)
      if (hi - lo <= 0) continue
      if (s.from <= from + eps && s.to >= to - eps) udl += s.kg_m
      else pts += s.kg_m * (hi - lo)
    }
    for (const p of a.pointLoads || []) if (p.at > from + eps && p.at < to - eps) pts += p.kg
    const check = spanCheck(t, { span: L, udl_kg_m: udl * factor, points_kg: pts * factor, defl_limit_mm })
    spans.push({ from, to, ...check })
  }
  const cantilever = supports[0] > eps || supports[supports.length - 1] < a.length - eps
  const continuous = supports.length > 2
  const order = ['fail', 'outside', 'missing', 'near', 'pass']
  const worst = spans.reduce((w, s) => (order.indexOf(s.status) < order.indexOf(w) ? s.status : w), 'pass')
  return { spans, cantilever, continuous, selfWeightIncluded: own, status: spans.length ? worst : null }
}

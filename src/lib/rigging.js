// The rigging tool, first part (docs/TOOLS_PLAN.md §5, RG1): the load on each truss line and what
// each hang point (hoist) carries. A line is a straight, continuous beam of even stiffness on two
// or more points at the same height; the points are rigid and only hold up (a hoist can't push
// down). Loads are fixtures (from the light plot), the truss's own weight, a cable allowance per
// metre, accessories, extra loads and the motors that climb with the line, and the reactions are
// multiplied by a dynamic factor before they are checked against the hoist's WLL.
// Every result is an aid that a competent rigger must check; WLL values are only ever the
// manufacturer's (never derived here).
import { barEnds, layoutFixtures } from './lightPlot'

// Defaults to check, editable per gig (docs/notes/S12.md: the owner confirms them)
export const DEFAULTS = { cable_kg_m: 5, dynamic_factor: 1.2 }
export const LIMITS = {
  cable_kg_m: [0, 100], dynamic_factor: [1, 3], length_m: [0.5, 40], truss_kg_m: [0, 200],
  accessories_kg: [0, 5000], defl_limit_mm: [1, 1000], load_kg: [0, 20000], points: 12, loads: 40, lines: 40,
}
export const HOIST_CLASSES = ['D8', 'D8+', 'C1']
// Which classes may hang over people (D8 only with a secondary safety, which RG1 doesn't model)
export const OVER_PEOPLE = { D8: false, 'D8+': true, C1: true }
export const WARN_AT = 0.8 // a point above 80% of its WLL is worth a warning

const num = (v, fallback) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
const r2 = v => Math.round(v * 100) / 100
const r1 = v => Math.round(v * 10) / 10

// ── The structural solver ───────────────────────────────────────────────────
// A beam along x from 0 to length on supports at the given positions, with point loads
// [{ at, kg }] and distributed loads [{ from, to, kg_m }]. Returns the reaction at each support
// (kg, positive = holding up, negative = the line lifts off that point), or null when the beam
// can't be solved (fewer than two supports, two at the same place, or a support off the beam).
// Method: beam elements (Euler-Bernoulli, even stiffness) between every support, load and segment
// end; supports fix the deflection; Gaussian elimination. Reactions of a continuous beam with even
// stiffness don't depend on the stiffness itself.
export function solveBeam({ length, supports, points = [], spans = [] }) {
  const L = Number(length)
  const sup = (supports || []).map(Number)
  if (!(L > 0) || sup.length < 2) return null
  const key = x => Math.round(x * 1000) / 1000
  if (new Set(sup.map(key)).size !== sup.length) return null
  if (sup.some(s => !(s >= -1e-9 && s <= L + 1e-9))) return null
  const pts = points.filter(p => Number(p.kg)).map(p => ({ at: clamp(Number(p.at), [0, L]), kg: Number(p.kg) }))
  const udl = spans.filter(s => Number(s.kg_m) && Number(s.to) > Number(s.from))
    .map(s => ({ from: clamp(Number(s.from), [0, L]), to: clamp(Number(s.to), [0, L]), w: Number(s.kg_m) }))
    .filter(s => s.to > s.from)

  // Nodes: the ends, every support, every load and every distributed load's ends
  const xs = [...new Set([0, L, ...sup, ...pts.map(p => p.at), ...udl.flatMap(s => [s.from, s.to])].map(key))].sort((a, b) => a - b)
  const n = xs.length
  const index = new Map(xs.map((x, i) => [x, i]))
  const dof = 2 * n // deflection and rotation per node
  const K = Array.from({ length: dof }, () => new Float64Array(dof))
  const F = new Float64Array(dof) // downward loads

  for (let e = 0; e < n - 1; e++) {
    const a = xs[e], b = xs[e + 1], h = b - a
    const k = [
      [12, 6 * h, -12, 6 * h],
      [6 * h, 4 * h * h, -6 * h, 2 * h * h],
      [-12, -6 * h, 12, -6 * h],
      [6 * h, 2 * h * h, -6 * h, 4 * h * h],
    ]
    const map = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[map[i]][map[j]] += k[i][j] / (h * h * h)
    // Distributed load on this element (every span edge is a node, so a span covers whole elements)
    const w = udl.filter(s => s.from <= a + 1e-9 && s.to >= b - 1e-9).reduce((t, s) => t + s.w, 0)
    if (w) {
      F[map[0]] += (w * h) / 2; F[map[1]] += (w * h * h) / 12
      F[map[2]] += (w * h) / 2; F[map[3]] -= (w * h * h) / 12
    }
  }
  for (const p of pts) F[2 * index.get(key(p.at))] += p.kg

  const fixed = new Set(sup.map(s => 2 * index.get(key(s))))
  const free = [...Array(dof).keys()].filter(i => !fixed.has(i))
  const u = solve(free.map(i => free.map(j => K[i][j])), free.map(i => F[i]))
  if (!u) return null
  const disp = new Float64Array(dof)
  free.forEach((i, k) => { disp[i] = u[k] })
  // Reaction = load at the node minus what the beam carries away from it
  return sup.map(s => {
    const i = 2 * index.get(key(s))
    let ku = 0
    for (let j = 0; j < dof; j++) ku += K[i][j] * disp[j]
    return F[i] - ku
  })
}

// Gaussian elimination with partial pivoting; null when singular
function solve(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

// ── What the show model holds ───────────────────────────────────────────────
export function settingsOf(rigging) {
  const s = rigging?.settings || {}
  return {
    cable_kg_m: clamp(num(s.cable_kg_m, DEFAULTS.cable_kg_m), LIMITS.cable_kg_m),
    dynamic_factor: clamp(num(s.dynamic_factor, DEFAULTS.dynamic_factor), LIMITS.dynamic_factor),
  }
}

export function linesOf(rigging) {
  return (Array.isArray(rigging?.lines) ? rigging.lines : []).filter(l => l && l.id).slice(0, LIMITS.lines).map(l => ({
    id: String(l.id),
    bar_id: l.bar_id ? String(l.bar_id) : null,
    name: String(l.name || '').slice(0, 40),
    length_m: clamp(num(l.length_m, 6), LIMITS.length_m),
    truss_kg_m: clamp(num(l.truss_kg_m, 0), LIMITS.truss_kg_m),
    cable_kg_m: l.cable_kg_m === null || l.cable_kg_m === undefined || l.cable_kg_m === '' ? null : clamp(num(l.cable_kg_m, 0), LIMITS.cable_kg_m),
    accessories_kg: clamp(num(l.accessories_kg, 0), LIMITS.accessories_kg),
    // RG2: the truss type (a table id from src/data/truss) and an optional deflection limit (mm)
    truss_table_id: typeof l.truss_table_id === 'string' && /^[a-z0-9-]{2,60}$/.test(l.truss_table_id) ? l.truss_table_id : null,
    defl_limit_mm: l.defl_limit_mm === null || l.defl_limit_mm === undefined || l.defl_limit_mm === '' ? null : clamp(num(l.defl_limit_mm, 0), LIMITS.defl_limit_mm),
    loads: (Array.isArray(l.loads) ? l.loads : []).filter(x => x && x.id).slice(0, LIMITS.loads).map(x => ({
      id: String(x.id),
      name: String(x.name || '').slice(0, 40),
      kg: clamp(num(x.kg, 0), LIMITS.load_kg),
      at_m: Math.max(0, num(x.at_m, 0)),
      to_m: x.to_m === null || x.to_m === undefined || x.to_m === '' ? null : Math.max(0, num(x.to_m, 0)),
    })),
    points: (Array.isArray(l.points) ? l.points : []).filter(p => p && p.id).slice(0, LIMITS.points).map(p => ({
      id: String(p.id),
      at_m: Math.max(0, num(p.at_m, 0)),
      hoist_model_id: p.hoist_model_id ? String(p.hoist_model_id) : null,
      hoist: p.hoist_model_id && p.hoist && typeof p.hoist === 'object' ? hoistCopy(p.hoist) : null,
      over_people: p.over_people !== false,
      motor_on_line: !!p.motor_on_line,
    })),
    checked: l.checked && l.checked.fingerprint ? { at: l.checked.at || null, fingerprint: String(l.checked.fingerprint) } : null,
  }))
}

// What a point keeps of its hoist model, so everyone on the gig sees the same check (crew outside
// the organisation can't read its models)
export function hoistCopy(m) {
  if (!m) return null
  const n = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    id: m.id ? String(m.id) : null,
    brand: String(m.brand || '').slice(0, 60),
    model: String(m.model || '').slice(0, 80),
    class: HOIST_CLASSES.includes(m.class) ? m.class : null,
    wll_kg: n(m.wll_kg),
    self_weight_kg: n(m.self_weight_kg),
    needs_check: m.needs_check !== false,
  }
}

// ── From the light plot ─────────────────────────────────────────────────────
// The fixtures on a bar with their weight and where they hang along it (metres from the bar's
// first end: its left end, or the end nearest the audience for an up-and-down bar)
export function fixturesOnBar(bar, bars, fixtures) {
  if (!bar) return []
  const layout = layoutFixtures(bars, fixtures)
  const e = barEnds(bar)
  return (fixtures || []).filter(f => layout[f.id]?.bar && layout[f.id].bar.toLowerCase() === bar.name.toLowerCase()).map(f => {
    const p = layout[f.id]
    const along = bar.rotation === 90 ? p.y - e.y1 : p.x - e.x1
    return { id: f.id, name: f.name, kg: Number(f.weight_kg) || 0, known: f.weight_kg !== null && f.weight_kg !== undefined, at_m: r2(Math.min(bar.length, Math.max(0, along))) }
  })
}

// Changes when what the light plot puts on a line changes; a line checked against an older
// fingerprint is "not checked" again
export function fingerprint(bar, onBar) {
  if (!bar) return ''
  const parts = [...onBar].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(f => `${f.id}:${f.kg}:${f.at_m}`)
  return `${bar.length}|${parts.join(',')}`
}

// Two hang points near the ends of a new line (a quarter of a metre in), or one at each end of a
// short one
export function defaultPoints(length, makeId = i => `p${Date.now().toString(36)}${i}`) {
  const inset = length > 2 ? 0.25 : 0
  return [
    { id: makeId(1), at_m: inset, hoist_model_id: null, over_people: true, motor_on_line: false },
    { id: makeId(2), at_m: r2(length - inset), hoist_model_id: null, over_people: true, motor_on_line: false },
  ]
}

// ── A line's loads and results ──────────────────────────────────────────────
// line: from linesOf; bar: the light plot bar (or null); onBar: fixturesOnBar; models: hoist
// models by id; settings: settingsOf. Returns the loads by kind, the total, and each point's
// static and dynamic reaction with its check.
export function analyseLine(line, { bar = null, onBar = [], models = {}, settings = DEFAULTS } = {}) {
  const length = bar ? bar.length : line.length_m
  const cable = line.cable_kg_m === null ? settings.cable_kg_m : line.cable_kg_m
  const points = []
  const spans = []
  const add = (list, item) => { list.push(item); return item }

  const fixturesKg = onBar.reduce((t, f) => t + f.kg, 0)
  for (const f of onBar) if (f.kg) add(points, { at: f.at_m, kg: f.kg })
  if (line.truss_kg_m) add(spans, { from: 0, to: length, kg_m: line.truss_kg_m, kind: 'truss' })
  if (cable) add(spans, { from: 0, to: length, kg_m: cable, kind: 'cable' })
  if (line.accessories_kg) add(spans, { from: 0, to: length, kg_m: line.accessories_kg / length, kind: 'accessories' })
  let extraKg = 0
  for (const x of line.loads) {
    if (!x.kg) continue
    const from = Math.min(x.at_m, length)
    const to = x.to_m === null ? null : Math.min(x.to_m, length)
    extraKg += x.kg
    if (to !== null && to > from) add(spans, { from, to, kg_m: x.kg / (to - from), kind: 'extra' })
    else add(points, { at: from, kg: x.kg })
  }
  let motorsKg = 0
  for (const p of line.points) {
    const m = models[p.hoist_model_id] || p.hoist
    if (p.motor_on_line && m?.self_weight_kg) { motorsKg += Number(m.self_weight_kg); add(points, { at: Math.min(p.at_m, length), kg: Number(m.self_weight_kg) }) }
  }
  const loads = {
    fixtures: r1(fixturesKg),
    truss: r1(line.truss_kg_m * length),
    cable: r1(cable * length),
    accessories: r1(line.accessories_kg),
    extra: r1(extraKg),
    motors: r1(motorsKg),
  }
  const total = r1(Object.values(loads).reduce((t, v) => t + v, 0))
  const unknownWeights = onBar.filter(f => !f.known).length

  const sorted = [...line.points].sort((a, b) => a.at_m - b.at_m)
  const off = sorted.filter(p => p.at_m > length + 1e-9)
  const reactions = off.length ? null : solveBeam({ length, supports: sorted.map(p => p.at_m), points, spans })
  const problem = sorted.length < 2 ? 'fewPoints' : off.length ? 'pointOffLine' : !reactions ? 'samePlace' : null

  const results = sorted.map((p, i) => {
    const m = models[p.hoist_model_id] || p.hoist || null
    return { id: p.id, at_m: p.at_m, ...hoistCheck(reactions ? reactions[i] : null, m, p.over_people, settings.dynamic_factor) }
  })
  const over = results.some(r => r.status === 'over' || r.status === 'uplift' || !r.peopleOk)
  const maxUse = results.reduce((m, r) => (r.use !== null && r.use > m ? r.use : m), 0)
  return { length, cable_kg_m: cable, loads, total, pointLoads: points, spreadLoads: spans, supports: sorted.map(p => p.at_m), dynamic_total: r1(total * settings.dynamic_factor), unknownWeights, results, problem, over, maxUse }
}

// One hang point's check: its static load (kg, null when unknown) × the dynamic factor against the
// hoist's WLL, and whether the hoist's class may hang over people. Also used by line arrays (RG3).
export function hoistCheck(kg, m, overPeople, factor) {
  const model = m || null
  const dyn = kg === null || kg === undefined ? null : kg * factor
  const wll = model && model.wll_kg !== null && model.wll_kg !== undefined ? Number(model.wll_kg) : null
  const use = dyn !== null && wll ? dyn / wll : null
  const peopleOk = !model || !model.class || !overPeople ? true : OVER_PEOPLE[model.class] !== false
  let status = 'ok'
  if (dyn === null) status = 'unknown'
  else if (kg < -0.05) status = 'uplift'
  else if (!model) status = 'noHoist'
  else if (wll === null) status = 'noWll'
  else if (use > 1) status = 'over'
  else if (use > WARN_AT) status = 'near'
  return {
    model, over_people: overPeople,
    kg: dyn === null ? null : r1(kg), dynamic_kg: dyn === null ? null : r1(dyn), wll_kg: wll,
    use: use === null ? null : Math.round(use * 1000) / 1000, status, peopleOk,
  }
}

// What the light plot shows for a bar: 'none' (nothing with a weight on it), 'notChecked',
// 'checked', or 'over' (overloaded, whether checked or not), with the highest use of a WLL
// loadsFor(lineId): extra point loads on a line from elsewhere (line arrays hung from it, RG3)
export function barRigging(bar, bars, fixtures, rigging, models, loadsFor = () => []) {
  const onBar = fixturesOnBar(bar, bars, fixtures)
  if (!onBar.some(f => f.kg > 0)) return { state: 'none' }
  const line = linesOf(rigging).find(l => l.bar_id === bar.id)
  if (!line) return { state: 'notChecked', lineId: null }
  const a = analyseLine({ ...line, loads: [...line.loads, ...loadsFor(line.id)] }, { bar, onBar, models, settings: settingsOf(rigging) })
  if (a.over) return { state: 'over', lineId: line.id, maxUse: a.maxUse }
  if (!line.checked || line.checked.fingerprint !== fingerprint(bar, onBar)) return { state: 'notChecked', lineId: line.id }
  return { state: 'checked', lineId: line.id, maxUse: a.maxUse }
}

// "Truss line 3" after the others
export function nextLineName(lines, prefix) {
  const taken = new Set((lines || []).map(l => l.name.toLowerCase()))
  let n = 1
  while (taken.has(`${prefix} ${n}`.toLowerCase())) n++
  return `${prefix} ${n}`
}

// Hoist models usable in a gig: the AVX presets and the organisation's own, by id
export const modelsById = list => Object.fromEntries((list || []).filter(m => !m.removed_at).map(m => [m.id, m]))

// Catalogue items that look like hoists or motors (the Tools tab suggests the rigging tool when
// one is on the gig)
const HOIST_RE = /hoist|chain motor|lodestar|chainmaster|talha|motor de corrente|kettenzug|\bd8(\+|\b)/i
export const looksLikeHoist = name => HOIST_RE.test(name || '')

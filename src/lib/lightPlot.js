// The light plot (docs/FIELD_TOOLS.md, F3): bars (trusses, pipes, ladders, floor positions) seen
// from above, in the same metres as the stage plot (x from the left as the audience sees it, y
// from the front edge of the stage; negative y is over the audience). Fixtures come from the DMX
// patch: one hangs on a bar when its position is the bar's name. Placed by hand it keeps plot_x
// and plot_y; otherwise it is spaced evenly along its bar.
import { stageSize, snap, round2, STEP_M } from './stagePlot'

export const BAR_KINDS = ['truss', 'pipe', 'ladder', 'floor']
export const FIXTURE_SYMBOLS = ['spot', 'wash', 'beam', 'profile', 'par', 'blinder', 'strobe', 'batten', 'haze', 'other']
export const DEFAULT_SUPPLY = { volts: 230, phases: 3, amps: 32 }
export const MARGIN = { side: 3, front: 8, back: 3 } // how far past the stage the drawing goes
export const SNAP_M = 0.75 // a fixture dropped this close to a bar hangs on it
export const LOAD_WARN = 0.8 // a phase above 80% of its supply is worth a warning

// A symbol from what the fixture is called, when none was chosen
const GUESS = [
  [/haze|fog|smoke|hazer|fumo|neblina/i, 'haze'],
  [/strobe|estrob/i, 'strobe'],
  [/blind|molefay|dwe/i, 'blinder'],
  [/batten|bar|strip|ribalta|barra/i, 'batten'],
  [/profile|leko|source four|ers|recorte/i, 'profile'],
  [/beam|sharpy/i, 'beam'],
  [/wash|aura|fresnel/i, 'wash'],
  [/par\b|par ?\d|parcan/i, 'par'],
  [/spot|mac|robe|moving|móvel|movel/i, 'spot'],
]
export function guessSymbol(type) {
  for (const [re, symbol] of GUESS) if (re.test(type || '')) return symbol
  return 'other'
}
export const symbolOf = f => (FIXTURE_SYMBOLS.includes(f?.symbol) ? f.symbol : guessSymbol(f?.fixture_type))

const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// The drawing's edges in metres: the stage plus a margin all round (more in front, for the
// front-of-house positions)
export function lightArea(stage) {
  const { width_m, depth_m } = stageSize(stage)
  return { x0: -MARGIN.side, x1: width_m + MARGIN.side, y0: -MARGIN.front, y1: depth_m + MARGIN.back }
}
// What the drawing shows: the stage and everything on the plot, with 1.5 m around (never more
// than the limits above)
export function viewArea(stage, bars, layout) {
  const { width_m, depth_m } = stageSize(stage)
  const lim = lightArea(stage)
  let x0 = 0, x1 = width_m, y0 = 0, y1 = depth_m
  for (const b of bars || []) {
    const e = barEnds(b)
    x0 = Math.min(x0, e.x1, e.x2); x1 = Math.max(x1, e.x1, e.x2); y0 = Math.min(y0, e.y1, e.y2); y1 = Math.max(y1, e.y1, e.y2)
  }
  for (const p of Object.values(layout || {})) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
  }
  return { x0: Math.max(lim.x0, x0 - 1.5), x1: Math.min(lim.x1, x1 + 1.5), y0: Math.max(lim.y0, y0 - 1.5), y1: Math.min(lim.y1, y1 + 1.5) }
}

export function clampToArea(x, y, stage) {
  const a = lightArea(stage)
  return { x: round2(clamp(snap(x), a.x0, a.x1)), y: round2(clamp(snap(y), a.y0, a.y1)) }
}

// The bars kept in the show model, cleaned up: rotation 0 (across the stage) or 90 (up and down),
// length 0.5–40 m, trim height 0–30 m, phase 1–3 or none
export function barsOf(lighting) {
  return (Array.isArray(lighting?.bars) ? lighting.bars : []).filter(b => b && b.id && b.name).map(b => ({
    id: String(b.id),
    name: String(b.name).slice(0, 40),
    kind: BAR_KINDS.includes(b.kind) ? b.kind : 'truss',
    x: num(b.x, 0),
    y: num(b.y, 0),
    length: clamp(num(b.length, 6), 0.5, 40),
    rotation: Number(b.rotation) === 90 ? 90 : 0,
    height: b.height === null || b.height === undefined || b.height === '' ? null : clamp(num(b.height, 0), 0, 30),
    phase: [1, 2, 3].includes(Number(b.phase)) ? Number(b.phase) : null,
  }))
}

export function supplyOf(lighting) {
  const s = lighting?.supply || {}
  return {
    volts: clamp(num(s.volts, DEFAULT_SUPPLY.volts), 100, 400),
    phases: Number(s.phases) === 1 ? 1 : 3,
    amps: clamp(num(s.amps, DEFAULT_SUPPLY.amps), 1, 1000),
  }
}

// The two ends of a bar
export function barEnds(bar) {
  const half = bar.length / 2
  return bar.rotation === 90
    ? { x1: bar.x, y1: bar.y - half, x2: bar.x, y2: bar.y + half }
    : { x1: bar.x - half, y1: bar.y, x2: bar.x + half, y2: bar.y }
}

// "Truss 3" after Truss 1 and Truss 2 (prefix is the translated kind)
export function nextBarName(bars, prefix) {
  const taken = new Set((bars || []).map(b => b.name.toLowerCase()))
  let n = 1
  while (taken.has(`${prefix} ${n}`.toLowerCase())) n++
  return `${prefix} ${n}`
}

// A new bar: across the stage, as wide as the stage, each one a metre and a half in front of
// the last (from the back of the stage); floor positions along the front edge
export function newBar(bars, stage, kind, name, id = `b${Date.now().toString(36)}`) {
  const { width_m, depth_m } = stageSize(stage)
  const same = (bars || []).filter(b => b.kind === kind).length
  const y = kind === 'floor' ? 0.5 : kind === 'ladder' ? depth_m / 2 : depth_m - 1 - same * 1.5
  const x = kind === 'ladder' ? (same % 2 ? width_m + 1 : -1) : width_m / 2
  const spot = clampToArea(x, y, stage)
  return {
    id, name, kind, x: spot.x, y: spot.y, rotation: kind === 'ladder' ? 90 : 0, phase: null,
    length: kind === 'ladder' ? 3 : kind === 'floor' ? Math.min(width_m, 6) : width_m, height: kind === 'floor' ? 0 : null,
  }
}

// Where each fixture is drawn: { [id]: { x, y, bar, auto } }. A fixture with its own place keeps
// it; the others on a bar are spaced evenly along it, in DMX order. Fixtures with neither are
// not drawn (they're listed as "not on the plot").
export function layoutFixtures(bars, fixtures) {
  const byName = new Map((bars || []).map(b => [b.name.toLowerCase(), b]))
  const out = {}
  const auto = {}
  for (const f of fixtures || []) {
    const bar = f.position ? byName.get(String(f.position).toLowerCase()) : null
    if (f.plot_x !== null && f.plot_x !== undefined && f.plot_y !== null && f.plot_y !== undefined) {
      out[f.id] = { x: Number(f.plot_x), y: Number(f.plot_y), bar: bar?.name || null, auto: false }
    } else if (bar) (auto[bar.id] ||= { bar, list: [] }).list.push(f)
  }
  for (const { bar, list } of Object.values(auto)) {
    list.sort((a, b) => (a.universe - b.universe) || ((a.address ?? 9999) - (b.address ?? 9999)) || String(a.name).localeCompare(String(b.name)))
    const e = barEnds(bar)
    list.forEach((f, i) => {
      const k = (i + 1) / (list.length + 1)
      out[f.id] = { x: round2(e.x1 + (e.x2 - e.x1) * k), y: round2(e.y1 + (e.y2 - e.y1) * k), bar: bar.name, auto: true }
    })
  }
  return out
}

// The bar a point is close to (within SNAP_M), and the point moved onto it, or null
export function snapToBar(bars, x, y, tolerance = SNAP_M) {
  let best = null
  for (const bar of bars || []) {
    const e = barEnds(bar)
    const along = bar.rotation === 90 ? clamp(y, e.y1, e.y2) : clamp(x, e.x1, e.x2)
    const px = bar.rotation === 90 ? bar.x : along
    const py = bar.rotation === 90 ? along : bar.y
    const d = Math.hypot(x - px, y - py)
    if (d <= tolerance && (!best || d < best.d)) best = { bar, d, x: round2(bar.rotation === 90 ? px : snap(px, STEP_M)), y: round2(bar.rotation === 90 ? snap(py, STEP_M) : py) }
  }
  return best && { bar: best.bar, x: best.x, y: best.y }
}

// Power and weight, as estimates. Each bar: fixtures, watts, amps, kg, and how many fixtures
// have no figure. Phases: bars given a phase load it; everything else is shared evenly.
export function powerSummary(fixtures, bars, supply = DEFAULT_SUPPLY) {
  const s = { ...DEFAULT_SUPPLY, ...supply }
  const amps = w => Math.round((w / s.volts) * 10) / 10
  const byName = new Map((bars || []).map(b => [b.name.toLowerCase(), b]))
  const rows = new Map((bars || []).map(b => [b.id, { id: b.id, name: b.name, phase: b.phase, count: 0, watts: 0, kg: 0, unknown: 0 }]))
  const loose = { id: null, name: null, phase: null, count: 0, watts: 0, kg: 0, unknown: 0 }
  for (const f of fixtures || []) {
    const bar = f.position ? byName.get(String(f.position).toLowerCase()) : null
    const row = bar ? rows.get(bar.id) : loose
    row.count += 1
    if (f.power_w === null || f.power_w === undefined) row.unknown += 1
    else row.watts += Number(f.power_w)
    row.kg += Number(f.weight_kg) || 0
  }
  const all = [...rows.values(), loose]
  const total = all.reduce((t, r) => ({ count: t.count + r.count, watts: t.watts + r.watts, kg: t.kg + r.kg, unknown: t.unknown + r.unknown }), { count: 0, watts: 0, kg: 0, unknown: 0 })
  const phaseWatts = Array.from({ length: s.phases }, () => 0)
  let shared = 0
  for (const r of all) {
    if (r.phase && r.phase <= s.phases) phaseWatts[r.phase - 1] += r.watts
    else shared += r.watts
  }
  const phases = phaseWatts.map((w, i) => {
    const watts = Math.round(w + shared / s.phases)
    const a = amps(watts)
    return { phase: i + 1, watts, amps: a, load: a / s.amps }
  })
  return {
    bars: [...rows.values()].map(r => ({ ...r, amps: amps(r.watts), kg: round2(r.kg) })),
    loose: { ...loose, amps: amps(loose.watts), kg: round2(loose.kg) },
    total: { ...total, amps: amps(total.watts), kg: round2(total.kg) },
    phases,
    over: phases.some(p => p.load > 1),
    near: phases.some(p => p.load > LOAD_WARN),
  }
}

// Line arrays, RG3 (docs/TOOLS_PLAN.md §5): an array of elements with splay angles hung from a
// bumper or frame. AVX works out what it can honestly work out — the total weight, the check
// against the manufacturer's bumper limits, the split of the weight between two pick points from a
// centre of gravity, each pick's hoist check, and a schematic side view — and takes the rest (the
// centre of gravity, the pick position, the tilt, a pullback) from the manufacturer's software,
// which always decides (PENDING D74: no datasheet prints a centre of gravity).
// Every result is an aid that a competent rigger must check.
import { ARRAY_DATA, SOFTWARE } from '../data/lineArrays'
import { presetById } from './speakers'
import { hoistCheck, hoistCopy } from './rigging'

export const LIMITS = {
  arrays: 16, count: [1, 32], splay: [0, 15], tilt: [-90, 90], element_kg: [0, 500], frame_kg: [0, 1000],
  extra_kg: [0, 5000], load_kg: [0, 20000], mm: [0, 20000], elements_max: [1, 64], swl_kg: [0, 20000],
}
export const LOADS_TOLERANCE = 0.05 // typed point loads that miss the array's weight by more than 5% are flagged

const num = (v, fallback) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
const opt = (v, range) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : clamp(Number(v), range))
const r1 = v => Math.round(v * 10) / 10
const str = (v, n) => String(v ?? '').trim().slice(0, n)

// ── The manufacturer's data ─────────────────────────────────────────────────
// The frames AVX knows for a speaker preset, with their weight (sum of the parts; null when a part's
// weight isn't printed)
export function framesFor(presetId) {
  return (ARRAY_DATA[presetId]?.frames || []).map(f => {
    const known = f.parts.every(p => p.kg !== null)
    return { ...f, kg: known ? r1(f.parts.reduce((t, p) => t + p.kg, 0)) : null }
  })
}
export const sourceFor = presetId => ARRAY_DATA[presetId]?.source || null

// The software that decides for a brand (from the preset), or null
export function softwareFor(presetId) {
  const p = presetById(presetId)
  return p ? SOFTWARE[p.brand] || null : null
}

// A short fingerprint of a preset's frame data, kept with the sign-off: when the data in AVX
// changes, an earlier check no longer covers it
export function framesFingerprint(presetId) {
  const s = JSON.stringify(framesFor(presetId).map(f => [f.id, f.kg, f.safe, f.max, f.swl_kg, f.safe_kg, f.pullback]))
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return `${presetId}:${h.toString(36)}`
}

// Is an item's rigging data checked by a second person, and does that check still cover the
// frame data AVX shows for its preset?
export function dataCheckState(rigging, presetId) {
  if (!rigging || rigging.checked !== true) return 'notChecked'
  if (presetId && framesFor(presetId).length && rigging.checked_frames !== framesFingerprint(presetId)) return 'outdated'
  return 'checked'
}

// ── What the show model holds ───────────────────────────────────────────────
function pickOf(p) {
  const x = p && typeof p === 'object' ? p : {}
  return {
    hoist_model_id: x.hoist_model_id ? String(x.hoist_model_id) : null,
    hoist: x.hoist_model_id && x.hoist && typeof x.hoist === 'object' ? hoistCopy(x.hoist) : null,
    over_people: x.over_people !== false,
    line_id: x.line_id ? String(x.line_id) : null,
    at_m: Math.max(0, num(x.at_m, 0)),
  }
}

export function arraysOf(rigging) {
  return (Array.isArray(rigging?.arrays) ? rigging.arrays : []).filter(a => a && a.id).slice(0, LIMITS.arrays).map(a => {
    const count = Math.round(clamp(num(a.count, 8), LIMITS.count))
    const splays = Array.from({ length: count }, (_, i) => clamp(num(Array.isArray(a.splays) ? a.splays[i] : 0, 0), LIMITS.splay))
    const f = a.frame && typeof a.frame === 'object' ? a.frame : null
    return {
      id: String(a.id),
      name: str(a.name, 40),
      source_id: a.source_id ? String(a.source_id) : null,
      item_id: a.item_id ? String(a.item_id) : null,
      preset: a.preset ? String(a.preset) : null,
      element_name: str(a.element_name, 60),
      element_kg: opt(a.element_kg, LIMITS.element_kg),
      // A copy of the item's sign-off state, so crew who can't read the catalogue see it too
      data_check: ['checked', 'outdated'].includes(a.data_check) ? a.data_check : 'notChecked',
      count,
      splays, // splays[0]: bumper to the top element; splays[i]: element i to element i+1
      frame_id: a.frame_id ? String(a.frame_id) : null,
      frame: f ? {
        name: str(f.name, 60), kg: opt(f.kg, LIMITS.frame_kg), max: opt(f.max, LIMITS.elements_max), safe: opt(f.safe, LIMITS.elements_max),
        swl_kg: opt(f.swl_kg, LIMITS.swl_kg), source: str(f.source, 300), pullback: !!f.pullback,
      } : null,
      extra_kg: clamp(num(a.extra_kg, 0), LIMITS.extra_kg),
      picks: num(a.picks, 2) === 1 ? 1 : 2,
      mode: a.mode === 'loads' ? 'loads' : 'cog',
      cog_mm: opt(a.cog_mm, [-20000, 20000]),
      spacing_mm: opt(a.spacing_mm, LIMITS.mm),
      front_kg: opt(a.front_kg, LIMITS.load_kg),
      rear_kg: opt(a.rear_kg, LIMITS.load_kg),
      pullback_kg: opt(a.pullback_kg, LIMITS.load_kg),
      tilt_deg: opt(a.tilt_deg, LIMITS.tilt),
      position: str(a.position, 40),
      software: str(a.software, 120),
      front: pickOf(a.front),
      rear: pickOf(a.rear),
      pull: pickOf(a.pull),
    }
  })
}

// The frame an array uses: one of the preset's frames, or one typed by hand from the manual
export function frameOf(arr) {
  if (arr.frame_id) {
    const f = framesFor(arr.preset).find(x => x.id === arr.frame_id)
    if (f) return { ...f, hand: false }
  }
  if (arr.frame) return { id: null, parts: [], quote: '', safe_kg: null, ...arr.frame, hand: true }
  return null
}

// ── Results ────────────────────────────────────────────────────────────────
export function arrayWeight(arr, frame = frameOf(arr)) {
  const elements = arr.element_kg === null ? null : r1(arr.element_kg * arr.count)
  const frameKg = frame ? frame.kg : null
  const extra = r1(arr.extra_kg)
  const unknown = []
  if (elements === null) unknown.push('element')
  if (frame && frameKg === null) unknown.push('frame')
  const total = r1((elements || 0) + (frameKg || 0) + extra)
  return { elements, frame: frameKg, extra, total, unknown }
}

// The check against the manufacturer's bumper limits:
// 'pass'  — within the safe limit (and its weight, when one is printed) and under the SWL
// 'check' — over the safe limit but within the maximum: only the manufacturer's software can say
// 'fail'  — over the maximum, or over the SWL
// 'none'  — no frame, or a frame with no limits
// reasons: what decided it, as i18n keys under la.reason.*
export function bumperCheck(arr, frame = frameOf(arr), w = arrayWeight(arr, frame)) {
  if (!frame) return { status: 'none', reasons: ['noFrame'] }
  const reasons = []
  let status = null
  if (frame.max !== null && arr.count > frame.max) { status = 'fail'; reasons.push('overMax') }
  if (frame.swl_kg !== null) {
    if (w.unknown.length) reasons.push('weightUnknown')
    else if (w.total > frame.swl_kg) { status = 'fail'; reasons.push('overSwl') }
  }
  if (status) return { status, reasons }
  if (frame.max === null && frame.safe === null && frame.swl_kg === null) return { status: 'none', reasons: ['noLimits'] }
  const cabinets = (w.elements || 0) + w.extra
  const withinSafe = frame.safe !== null && arr.count <= frame.safe && (frame.safe_kg === null || (w.elements !== null && cabinets <= frame.safe_kg))
  if (withinSafe && !reasons.includes('weightUnknown')) return { status: 'pass', reasons: ['withinSafe'] }
  if (frame.safe !== null && arr.count <= frame.safe && frame.safe_kg !== null && cabinets > frame.safe_kg) reasons.push('overSafeKg')
  else if (frame.safe !== null && arr.count > frame.safe) reasons.push('overSafe')
  else if (frame.safe === null) reasons.push('noSafe')
  return { status: 'check', reasons }
}

// The load on each pick point (static, kg).
// - one pick: the whole weight
// - two picks, from a centre of gravity: lever rule. cog_mm is how far the array's centre of
//   gravity sits behind the front pick, spacing_mm the distance between the picks; outside the
//   picks one of them would be pulled up
// - typed: the loads the manufacturer's software gives, checked to add up to the weight
// A pullback changes the loads in ways the lever rule can't follow, so it needs typed loads.
export function pickLoads(arr, total, frame = frameOf(arr)) {
  const pullback = !!frame?.pullback || (arr.pullback_kg !== null && arr.pullback_kg > 0)
  const out = { front: null, rear: null, pull: pullback ? arr.pullback_kg : null, problem: null, from: arr.picks === 1 ? 'single' : arr.mode }
  if (arr.picks === 1) {
    if (arr.mode === 'loads' && arr.front_kg !== null) { out.front = r1(arr.front_kg); out.from = 'typed' }
    else out.front = pullback ? null : r1(total)
    if (pullback && out.front === null) out.problem = 'pullbackNeedsLoads'
  } else if (arr.mode === 'loads') {
    out.front = arr.front_kg === null ? null : r1(arr.front_kg)
    out.rear = arr.rear_kg === null ? null : r1(arr.rear_kg)
    out.from = 'typed'
  } else if (pullback) {
    out.problem = 'pullbackNeedsLoads'
  } else if (arr.cog_mm === null || !arr.spacing_mm) {
    out.problem = 'needCog'
  } else {
    const x = arr.cog_mm, d = arr.spacing_mm
    out.rear = r1((total * x) / d)
    out.front = r1(total - (total * x) / d)
    if (x < 0 || x > d) out.problem = 'cogOutside'
  }
  if (out.from === 'typed' && !out.problem) {
    const sum = (out.front || 0) + (arr.picks === 2 ? out.rear || 0 : 0)
    if (out.front === null || (arr.picks === 2 && out.rear === null)) out.problem = 'needLoads'
    else if (pullback ? sum < total * (1 - LOADS_TOLERANCE) : Math.abs(sum - total) > total * LOADS_TOLERANCE) out.problem = 'loadsDontAdd'
  }
  return out
}

// Everything about one array: weight, bumper check, pick loads and each pick's hoist check
// (a pick that hangs from a truss line is checked there, with the line's points).
// models: hoist models by id; settings: RG1's settingsOf (dynamic factor); lines: RG1's linesOf
export function analyseArray(arr, { models = {}, settings = { dynamic_factor: 1.2 }, lines = [] } = {}) {
  const frame = frameOf(arr)
  const weight = arrayWeight(arr, frame)
  const bumper = bumperCheck(arr, frame, weight)
  const loads = pickLoads(arr, weight.total, frame)
  const names = arr.picks === 1 ? ['front'] : ['front', 'rear']
  if (loads.pull !== null) names.push('pull')
  const picks = names.map(name => {
    const p = arr[name]
    const kg = loads[name]
    const line = p.line_id ? lines.find(l => l.id === p.line_id) || null : null
    if (line) return { name, kg, line, status: kg === null ? 'unknown' : kg < -0.05 ? 'uplift' : 'onLine', use: null, peopleOk: true }
    return { name, line: null, ...hoistCheck(kg, models[p.hoist_model_id] || p.hoist || null, p.over_people, settings.dynamic_factor) }
  })
  const software = arr.software || softwareFor(arr.preset) || ''
  const fail = bumper.status === 'fail' || picks.some(p => p.status === 'over' || p.status === 'uplift' || !p.peopleOk) || loads.problem === 'cogOutside'
  const needsCheck = arr.data_check !== 'checked' || !!frame?.hand
  const status = fail ? 'fail' : bumper.status === 'pass' && !loads.problem && picks.every(p => ['ok', 'near', 'onLine'].includes(p.status)) ? 'pass' : 'check'
  return { frame, weight, bumper, loads, picks, software, status, needsCheck }
}

// The array's pick loads that hang from a truss line, as extra point loads on that line (RG1):
// [{ id, name, kg, at_m, to_m: null, array: true }]
export function arrayLoadsOnLine(arrays, lineId, opts) {
  const out = []
  for (const arr of arrays) {
    const a = analyseArray(arr, opts)
    for (const p of a.picks) {
      if (arr[p.name].line_id !== lineId || p.kg === null || p.kg <= 0) continue
      out.push({ id: `arr-${arr.id}-${p.name}`, name: `${arr.name} · ${p.name}`, kg: p.kg, at_m: arr[p.name].at_m, to_m: null, array: true })
    }
  }
  return out
}

// ── Side view (schematic) ──────────────────────────────────────────────────
// Boxes hinged at the front, each turned down by the splay to the one above; the bumper tilted by
// tilt_deg (positive aims up). Sizes are schematic (element height 1, depth 1.25); only the
// angles are as typed. x grows towards the back, y downwards. Returns the bumper as a segment,
// each element as four corners, and the aim of the bottom element.
export const BOX = { h: 1, d: 1.25 }
export function sideView(arr) {
  const tilt = arr.tilt_deg || 0
  const rad = deg => (deg * Math.PI) / 180
  const elements = []
  let a = -tilt // downward angle of the bumper
  const bumper = { x1: 0, y1: 0, x2: BOX.d * 1.1 * Math.cos(rad(a)), y2: -BOX.d * 1.1 * Math.sin(rad(a)), angle: a }
  let p = { x: 0, y: 0 }
  for (let i = 0; i < arr.count; i++) {
    a += arr.splays[i] || 0
    const u = { x: Math.sin(rad(a)) * BOX.h, y: Math.cos(rad(a)) * BOX.h }
    const r = { x: Math.cos(rad(a)) * BOX.d, y: -Math.sin(rad(a)) * BOX.d }
    const fb = { x: p.x + u.x, y: p.y + u.y }
    elements.push({ angle: r1(a), corners: [p, fb, { x: fb.x + r.x, y: fb.y + r.y }, { x: p.x + r.x, y: p.y + r.y }] })
    p = fb
  }
  const all = [bumper.x1, bumper.x2].map((x, i) => ({ x, y: i ? bumper.y2 : bumper.y1 })).concat(elements.flatMap(e => e.corners))
  const box = {
    minX: Math.min(...all.map(c => c.x)), maxX: Math.max(...all.map(c => c.x)),
    minY: Math.min(...all.map(c => c.y)), maxY: Math.max(...all.map(c => c.y)),
  }
  return { bumper, elements, box, bottomAngle: elements.length ? elements[elements.length - 1].angle : null }
}

// ── From the sound system calculator (F4) ──────────────────────────────────
// What an array takes from a system calculator source: its name, element count and speaker
export function fromSource(source) {
  if (!source) return {}
  return {
    source_id: source.id, name: source.name, count: Math.round(clamp(source.count, LIMITS.count)),
    ...(source.item_id ? { item_id: source.item_id, element_name: source.item_name } : {}),
  }
}
// Has the source changed since the array copied it?
export const differsFromSource = (arr, source) => !!source && (arr.count !== Math.round(clamp(source.count, LIMITS.count)) || (source.item_id || null) !== (arr.item_id || null))

// Catalogue speakers that can be array elements (line-array elements and subwoofers, which fly too)
export const isArrayElement = item => item?.speaker_type === 'line_array' || item?.speaker_type === 'subwoofer'

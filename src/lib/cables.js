// P2 cables (docs/TOOLS_PLAN.md §4; docs/FIELD_TOOLS.md, "How the power tool works"): cable runs
// in the gig's power plan (gig_show.power.cables), their voltage drop and current capacity, and the
// cable list (power, DMX, speaker, signal) that goes into the gig's equipment. Every figure is an
// estimate for a qualified electrician, never a substitute for one.
//
// Sources (opened 2026-11-09; values copied as printed, nothing from memory):
// - CABLE_DATA: General Cavi, H07RN-F CPR Eca datasheet, "Model Product: 250-251 - 20250206"
//   (EN 50525-2-21): "Electric resistance at 20°C (Ohm/km)" and "Mobile service current carrying
//   capacities at 60°C conductor temp (A)"; mobile cables reach 60 °C at most (the datasheet's
//   "Maximun operating temperature: +60°C").
// - AMBIENT, BUNDLED, DRUM, MANY_CORES: Lapp, Technical Tables T12 "Current ratings" (PDF of
//   2021-08-24), tables 12-2 (60 °C column), 12-6 (bundled on a wall or floor), 12-5 (wound cables)
//   and 12-3 (open air), excerpts of DIN VDE 0298-4:2013-06 tables 17, 21, 27 and 26.
// - ALPHA_CU: 0.00393 per K for annealed copper, BS EN IEC 60228:2024 Annex B as quoted by
//   mycableengineering.com, "Conductor resistance".
//
// Method: the resistance is taken at 60 °C (the hottest a mobile cable runs, so the drop is not
// understated). Voltage drop ΔU = b × R × L × I with b = 2 single-phase (out and back) and b = 1
// three-phase (phase to neutral, balanced), I the busiest phase. The cable's reactance is left out
// and cos φ is taken as 1: for these flexible cables the resistance is most of it. The drop is
// added up from the supply down to the end of each run.

import { connectorOf } from './power'

export const ALPHA_CU = 0.00393
export const HOT_C = 60 // the conductor temperature the resistance is worked out at
export const DROP_WARN = 3 // % (docs/TOOLS_PLAN.md §4: limit 3–5 %)
export const DROP_MAX = 5

// H07RN-F (General Cavi 250-251, 2025-02-06): cores → mm² → { r20 Ω/km, amps (mobile, 60 °C) }
export const CABLE_DATA = {
  '3G': {
    1.5: { r20: 13.3, amps: 16 }, 2.5: { r20: 7.98, amps: 25 }, 4: { r20: 4.95, amps: 29 }, 6: { r20: 3.30, amps: 36 },
    10: { r20: 1.91, amps: 51 }, 16: { r20: 1.21, amps: 67 }, 25: { r20: 0.780, amps: 89 }, 35: { r20: 0.554, amps: 110 },
  },
  '5G': {
    1.5: { r20: 13.3, amps: 16 }, 2.5: { r20: 7.98, amps: 20 }, 4: { r20: 4.95, amps: 30 }, 6: { r20: 3.30, amps: 38 },
    10: { r20: 1.91, amps: 54 }, 16: { r20: 1.21, amps: 71 }, 25: { r20: 0.780, amps: 94 }, 35: { r20: 0.554, amps: 114 },
    50: { r20: 0.386, amps: 143 }, 70: { r20: 0.272, amps: 178 }, 95: { r20: 0.206, amps: 210 },
  },
  // Single cores (Powerlock sets: five of them)
  '1x': {
    25: { r20: 0.780, amps: 94 }, 35: { r20: 0.554, amps: 117 }, 50: { r20: 0.386, amps: 148 },
    70: { r20: 0.272, amps: 185 }, 95: { r20: 0.206, amps: 222 }, 120: { r20: 0.161, amps: 260 },
  },
  '19G': { 2.5: { r20: 7.98, amps: 20 } },
}
export const CORES = Object.keys(CABLE_DATA)
export const THREE_PHASE_CORES = ['5G', '1x']

// Lapp T12: ambient (°C) → factor for a 60 °C cable (12-2); above 50 °C there is no figure
export const AMBIENT = { 30: 1.00, 40: 0.82, 50: 0.58 }
// Bundled with others on a wall or floor (12-6): how many cables or circuits → factor
export const BUNDLED = { 1: 1.00, 2: 0.80, 3: 0.70, 4: 0.65, 6: 0.57, 10: 0.48 }
// Left wound on a drum or reel (12-5): layers → factor
export const DRUM = { 1: 0.80, 2: 0.61, 3: 0.49, 4: 0.42, 5: 0.38 }
// More than three loaded cores, up to 10 mm², open air (12-3): loaded cores → factor
export const MANY_CORES = { 5: 0.75, 7: 0.65, 10: 0.55, 14: 0.50, 24: 0.40 }
export const LAYINGS = ['air', 'bundled', 'drum']

// A table's factor for n, taking the next row up (the cautious one) when n falls between rows
export function tableFactor(table, n) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)
  const k = keys.find(x => x >= n)
  return k === undefined ? null : table[k]
}

// The proposed cable set (docs/notes/S10.md, "Needs your decision"): a common EU rental stock.
// power types: cores and mm² (from CABLE_DATA), the connector, loaded cores when more than three
export const CABLE_TYPES = [
  { id: 'schuko_15', kind: 'power', cores: '3G', mm2: 1.5, connector: 'schuko', lengths: [3, 5, 10, 20] },
  { id: 'schuko_25', kind: 'power', cores: '3G', mm2: 2.5, connector: 'schuko', lengths: [5, 10, 20, 25] },
  { id: 'powercon', kind: 'power', cores: '3G', mm2: 2.5, connector: 'powercon', lengths: [1, 3, 5, 10] },
  { id: 'true1', kind: 'power', cores: '3G', mm2: 2.5, connector: 'powercon_true1', lengths: [1, 3, 5, 10] },
  { id: 'cee16_1', kind: 'power', cores: '3G', mm2: 2.5, connector: 'cee16_1', lengths: [5, 10, 25] },
  { id: 'cee16_3', kind: 'power', cores: '5G', mm2: 2.5, connector: 'cee16_3', lengths: [5, 10, 25] },
  { id: 'cee32_1', kind: 'power', cores: '3G', mm2: 6, connector: 'cee32_1', lengths: [10, 25] },
  { id: 'cee32_3', kind: 'power', cores: '5G', mm2: 6, connector: 'cee32_3', lengths: [5, 10, 25, 50] },
  { id: 'cee63_3', kind: 'power', cores: '5G', mm2: 16, connector: 'cee63_3', lengths: [10, 25, 50] },
  { id: 'cee125_3', kind: 'power', cores: '5G', mm2: 35, connector: 'cee125_3', lengths: [10, 25, 50] },
  { id: 'powerlock_95', kind: 'power', cores: '1x', mm2: 95, connector: 'powerlock', lengths: [10, 25, 50] },
  { id: 'socapex', kind: 'power', cores: '19G', mm2: 2.5, connector: 'socapex', loadedCores: 12, lengths: [10, 25, 50] },
  { id: 'dmx5', kind: 'dmx', lengths: [1, 3, 5, 10, 20] },
  { id: 'dmx3', kind: 'dmx', lengths: [1, 3, 5, 10, 20] },
  { id: 'nl4_25', kind: 'speaker', lengths: [5, 10, 20] },
  { id: 'nl4_4', kind: 'speaker', lengths: [10, 20, 30] },
  { id: 'nl8_25', kind: 'speaker', lengths: [10, 20] },
  { id: 'xlr3', kind: 'signal', lengths: [3, 5, 10, 20] },
  { id: 'ethercon', kind: 'signal', lengths: [1, 5, 10, 20, 50] },
  { id: 'sdi', kind: 'signal', lengths: [5, 10, 25, 50] },
]
export const CABLE_KINDS = ['power', 'dmx', 'speaker', 'signal']
export const typeOf = id => CABLE_TYPES.find(c => c.id === id) || null

const LIMIT = 300
const num = (v, d) => { const n = Number(String(v ?? '').replace(',', '.')); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? d : n }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const r1 = n => Math.round(n * 10) / 10
const r2 = n => Math.round(n * 100) / 100

// The cable runs as saved in gig_show.power.cables. A run: what cable (a type from the set, or for
// power a custom cores × mm²), how long, how many alike, how it's laid, and for power which link
// of the plan it carries: 'd:<distro>' (the cable feeding that distro) or 'o:<distro>/<output>'
// (the cable leaving that output). Other kinds have a typed from and to.
export function cablesOf(power) {
  return (Array.isArray(power?.cables) ? power.cables : []).filter(c => c && c.id).slice(0, LIMIT).map(c => {
    const kind = CABLE_KINDS.includes(c.kind) ? c.kind : 'power'
    const type = typeOf(c.type)?.kind === kind ? c.type : null
    const custom = kind === 'power' && !type && CABLE_DATA[c.cores]?.[Number(c.mm2)] ? { cores: c.cores, mm2: Number(c.mm2) } : null
    const laying = LAYINGS.includes(c.laying) ? c.laying : 'air'
    const link = kind === 'power' && typeof c.link === 'string' && /^(d:[^/]{1,40}|o:[^/]{1,40}\/[^/]{1,40})$/.test(c.link) ? c.link : null
    return {
      id: str(c.id, 40), kind, type, ...(custom || {}),
      length: r1(clamp(num(c.length, 10), 0.5, 500)),
      qty: clamp(Math.round(num(c.qty, 1)), 1, 99),
      laying,
      group: laying === 'bundled' ? clamp(Math.round(num(c.group, 2)), 2, 10) : laying === 'drum' ? clamp(Math.round(num(c.group, 1)), 1, 5) : null,
      ambient: [30, 40, 50, 60].includes(Number(c.ambient)) ? Number(c.ambient) : 30,
      label: str(c.label, 40),
      from: str(c.from, 60),
      to: str(c.to, 60),
      link,
    }
  })
}

// What a power run is made of: { cores, mm2, three, loadedCores } or null (not a power cable)
export function specOf(run) {
  if (run.kind !== 'power') return null
  const t = typeOf(run.type)
  const cores = t?.cores || run.cores
  const mm2 = t?.mm2 ?? run.mm2
  if (!CABLE_DATA[cores]?.[mm2]) return null
  return { cores, mm2, three: THREE_PHASE_CORES.includes(cores), loadedCores: t?.loadedCores || null, connector: t?.connector || null }
}

// The resistance of one conductor in Ω per metre at the given temperature
export function resistancePerM(r20, tempC = HOT_C) {
  return (r20 / 1000) * (1 + ALPHA_CU * (tempC - 20))
}

// Voltage drop of one run: { volts, pct }. amps: the busiest phase; volts: phase to neutral.
export function voltageDrop({ amps, lengthM, r20, three, volts }) {
  if (!(amps > 0) || !(lengthM > 0) || !(r20 > 0) || !(volts > 0)) return { volts: 0, pct: 0 }
  const b = three ? 1 : 2
  const du = b * resistancePerM(r20) * lengthM * amps
  return { volts: r2(du), pct: r2((du / volts) * 100) }
}

// What a cable may carry where it is: the datasheet's amps × the factors for the ambient, how it's
// laid and (multi-core cables) how many cores carry current. null when no table covers it.
export function capacity(spec, { laying = 'air', group = null, ambient = 30 } = {}) {
  const row = spec && CABLE_DATA[spec.cores]?.[spec.mm2]
  if (!row) return null
  const fa = AMBIENT[ambient] ?? null
  const fl = laying === 'bundled' ? tableFactor(BUNDLED, group || 2) : laying === 'drum' ? tableFactor(DRUM, group || 1) : 1
  const fc = spec.loadedCores && spec.loadedCores > 3 && spec.mm2 <= 10 ? tableFactor(MANY_CORES, spec.loadedCores) : 1
  if (fa === null || fl === null || fc === null) return null
  return { amps: r1(row.amps * fa * fl * fc), base: row.amps, factor: r2(fa * fl * fc) }
}

// The current a link carries in the worked-out plan (the busiest phase), its protection (the breaker
// in front of it) and how many phases it carries
export function linkFigures(link, { plan, distros, supply }) {
  if (!link) return null
  const byId = Object.fromEntries(distros.map(d => [d.id, d]))
  if (link.startsWith('o:')) {
    const [did, oid] = link.slice(2).split('/')
    const d = byId[did], o = d?.outputs.find(x => x.id === oid)
    const r = plan.distros[did]?.outputs?.[oid]
    if (!d || !o || !r) return null
    return { amps: Math.max(...r.amps), breaker: o.breaker_a || connectorOf(o.connector)?.amps || null, distro: did, output: oid }
  }
  const did = link.slice(2)
  const d = byId[did], r = plan.distros[did]
  if (!d || !r) return null
  const parentOut = d.feed && d.feed !== 'supply' ? byId[d.feed.distro]?.outputs.find(o => o.id === d.feed.output) : null
  const breaker = d.feed === 'supply' ? supply.amps : parentOut ? parentOut.breaker_a || connectorOf(parentOut.connector)?.amps || null : null
  return { amps: Math.max(...r.amps), breaker, distro: did, output: null }
}

// Every power run checked: its current, drop (its own and added up from the supply), capacity and
// state. Runs not linked to the plan, or of an unknown cable, have state 'unknown'.
//   state: 'ok' | 'near' (drop above 3 %, or the breaker in front is larger than the cable carries)
//        | 'over' (drop above 5 %, or more current than the cable carries)
export function cableChecks({ cables, plan, distros, supply }) {
  const runs = cables.filter(c => c.kind === 'power')
  const byId = Object.fromEntries(distros.map(d => [d.id, d]))
  const own = {}
  for (const c of runs) {
    const spec = specOf(c)
    const fig = linkFigures(c.link, { plan, distros, supply })
    const cap = capacity(spec, c)
    const drop = spec && fig ? voltageDrop({ amps: fig.amps, lengthM: c.length, r20: CABLE_DATA[spec.cores][spec.mm2].r20, three: spec.three, volts: supply.volts }) : null
    own[c.id] = { spec, fig, cap, drop }
  }
  // The worst drop up to the end of the cable feeding a distro (several runs on a link: the worst)
  const feedRun = {}
  for (const c of runs) {
    if (!c.link?.startsWith('d:') || !own[c.id].drop) continue
    const did = c.link.slice(2)
    if (!feedRun[did] || own[c.id].drop.pct > own[feedRun[did]].drop.pct) feedRun[did] = c.id
  }
  const upstream = (did, seen = new Set()) => {
    if (!did || seen.has(did)) return 0
    seen.add(did)
    const d = byId[did]
    const parent = d?.feed && d.feed !== 'supply' ? d.feed.distro : null
    const mine = feedRun[did] ? own[feedRun[did]].drop.pct : 0
    return mine + upstream(parent, seen)
  }
  const out = {}
  for (const c of runs) {
    const { spec, fig, cap, drop } = own[c.id]
    if (!spec || !fig || !drop) { out[c.id] = { state: 'unknown', spec, amps: fig?.amps ?? null, cap, drop: null, total: null, breaker: fig?.breaker ?? null }; continue }
    const did = fig.distro
    // Above this run: for an output, everything feeding its distro; for a distro's feed, its parent's
    const above = fig.output ? upstream(did) : upstream(byId[did]?.feed && byId[did].feed !== 'supply' ? byId[did].feed.distro : null)
    const total = r2(above + drop.pct)
    const overCurrent = cap ? fig.amps > cap.amps : false
    const unprotected = cap && fig.breaker ? fig.breaker > cap.amps : false
    const state = overCurrent || total > DROP_MAX ? 'over' : total > DROP_WARN || unprotected ? 'near' : 'ok'
    out[c.id] = { state, spec, amps: fig.amps, cap, drop, total, breaker: fig.breaker, overCurrent, unprotected }
  }
  return out
}

// Warnings for the plan's list, as i18n keys with their values (same shape as planWarnings)
export function cableWarnings(checks, cables, nameOf) {
  const out = []
  for (const c of cables) {
    const x = checks[c.id]
    if (!x || x.state === 'unknown') continue
    const name = nameOf(c)
    if (x.overCurrent) out.push({ level: 'over', key: 'power.warn.cableOver', vars: { name, a: x.amps, max: x.cap.amps } })
    if (x.total > DROP_MAX) out.push({ level: 'over', key: 'power.warn.dropOver', vars: { name, pct: x.total, max: DROP_MAX } })
    else if (x.total > DROP_WARN) out.push({ level: 'near', key: 'power.warn.dropNear', vars: { name, pct: x.total, max: DROP_WARN } })
    if (x.unprotected && !x.overCurrent) out.push({ level: 'near', key: 'power.warn.cableUnprotected', vars: { name, breaker: x.breaker, max: x.cap.amps } })
  }
  return out
}

// ── The cable list ─────────────────────────────────────────────────────────────
// Runs grouped by cable and length: [{ key, kind, type, cores, mm2, length, qty }], power first
export function cableList(cables) {
  const map = new Map()
  for (const c of cables) {
    const what = c.type || (c.cores ? `${c.cores}${c.mm2}` : null)
    if (!what) continue
    const key = `${c.kind}:${what}:${c.length}`
    const prev = map.get(key)
    if (prev) prev.qty += c.qty
    else map.set(key, { key, kind: c.kind, type: c.type, cores: c.cores || null, mm2: c.mm2 || null, length: c.length, qty: c.qty })
  }
  const order = k => CABLE_KINDS.indexOf(k)
  return [...map.values()].sort((a, b) => order(a.kind) - order(b.kind) || String(a.type || a.cores).localeCompare(String(b.type || b.cores)) || a.length - b.length)
}

// Names compared without case, spaces, punctuation or the "m" of metres: "CEE 32A 5G6 - 25m" ≈ "cee32a5g625"
export const nameKey = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d)\s*m\b/g, '$1').replace(/[^a-z0-9]/g, '')

// The catalogue item for each line: the one picked by hand (power.cableItems), else one whose
// name matches the line's name. items: [{ id, name }]. Returns { [line.key]: item | null }
export function matchItems(lines, items, picked, nameOfLine) {
  const byName = new Map()
  for (const it of items) { const k = nameKey(it.name); if (k && !byName.has(k)) byName.set(k, it) }
  const byId = Object.fromEntries(items.map(it => [it.id, it]))
  const out = {}
  for (const l of lines) out[l.key] = (picked?.[l.key] && byId[picked[l.key]]) || byName.get(nameKey(nameOfLine(l))) || null
  return out
}

// Lines to add to the gig's equipment: per item, what the list needs and what's there already
//   lines: the cable list; matched: { key → item }; equipment: [{ id, item_id, quantity }]
export function cablesToEquipment(lines, matched, equipment) {
  const need = {}
  for (const l of lines) {
    const it = matched[l.key]
    if (it) need[it.id] = (need[it.id] || 0) + l.qty
  }
  return Object.entries(need).map(([item_id, needed]) => {
    const line = equipment.find(e => e.item_id === item_id)
    const have = line ? Number(line.quantity) || 0 : 0
    return { item_id, needed, have, add: Math.max(0, needed - have), line_id: line?.id || null }
  })
}

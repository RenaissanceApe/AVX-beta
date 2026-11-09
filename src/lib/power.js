// P1 power distribution (docs/TOOLS_PLAN.md §4; docs/FIELD_TOOLS.md, "How the power tool works").
// Catalogue items get electrical fields; a gig's power plan (gig_show.power) holds the supply,
// the distros and their outputs, loads typed by hand and which load is plugged in where. Every
// figure here is an estimate for a qualified electrician, never a substitute for one.
//
// Conventions:
// - volts is the phase-to-neutral voltage (230 V in Portugal); a three-phase supply is
//   230/400 V. Phase currents are added up arithmetically (the cautious sum); the neutral is the
//   phasor sum of the three phases, each load lagging by its power factor.
// - A load without a power factor counts as 1 (the report says so).
// - A load with only amps from its datasheet (no watts, D77) counts as amps × the datasheet's
//   voltage in VA; no watt figure is made up for it.

// ── Connectors and phases ─────────────────────────────────────────────────────
// amps: the connector's rating (the breaker when none is given); phases: 1 or 3
export const CONNECTORS = [
  { id: 'schuko', amps: 16, phases: 1 },
  { id: 'cee16_1', amps: 16, phases: 1 },
  { id: 'cee16_3', amps: 16, phases: 3 },
  { id: 'cee32_1', amps: 32, phases: 1 },
  { id: 'cee32_3', amps: 32, phases: 3 },
  { id: 'cee63_1', amps: 63, phases: 1 },
  { id: 'cee63_3', amps: 63, phases: 3 },
  { id: 'cee125_3', amps: 125, phases: 3 },
  { id: 'powerlock', amps: 400, phases: 3 },
  { id: 'socapex', amps: 16, phases: 1 },
  { id: 'powercon', amps: 20, phases: 1 },
  { id: 'powercon_true1', amps: 16, phases: 1 },
]
export const CONNECTOR_IDS = CONNECTORS.map(c => c.id)
export const connectorOf = id => CONNECTORS.find(c => c.id === id) || null
export const PHASES = ['L1', 'L2', 'L3']
export const OUTPUT_PHASES = ['L1', 'L2', 'L3', '3P']

export const DEFAULT_SUPPLY = { kind: 'venue', name: '', volts: 230, phases: 3, amps: 63, hz: 50 }
export const HEADROOM_WARN = 0.8 // an output, distro or phase above 80% of its rating is worth a warning
export const BALANCE_WARN = 0.2 // phases more than 20% apart
export const DEFAULT_MARGIN = 25 // % added to the generator suggestion
// Common generator sizes (kVA, prime rating) to round the suggestion up to
export const GENERATOR_SIZES = [10, 15, 20, 30, 45, 60, 80, 100, 125, 150, 200, 250, 300, 350, 400, 500, 650, 800, 1000, 1250, 1500, 2000]

const LIMITS = { distros: 60, outputs: 48, manual: 200 }
const num = (v, d) => { const n = Number(String(v ?? '').replace(',', '.')); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? d : n }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const r1 = n => Math.round(n * 10) / 10
const id8 = v => str(v, 40)

// ── Catalogue fields ──────────────────────────────────────────────────────────
// The numeric electrical fields with the limits the database also checks (price_items_power_check)
export const ELECTRICAL_FIELDS = [
  { key: 'power_typical_w', min: 0, max: 1000000, whole: true },
  { key: 'power_factor', min: 0.3, max: 1 },
  { key: 'inrush_a', min: 0, max: 10000 },
  { key: 'current_a', min: 0, max: 10000, open: true },
  { key: 'current_v', min: 100, max: 480, whole: true },
]

const toNum = v => {
  if (v === null || v === undefined || String(v).trim() === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
export function inLimits(field, n) {
  if (n === null) return true
  if (!Number.isFinite(n)) return false
  if (field.whole && !Number.isInteger(n)) return false
  return (field.open ? n > field.min : n >= field.min) && n <= field.max
}

// What's wrong with an item's electrical fields, as { field: 'range' | 'needVolts' | 'connector' }
export function electricalProblems(f) {
  const out = {}
  for (const fld of ELECTRICAL_FIELDS) if (!inLimits(fld, toNum(f?.[fld.key]))) out[fld.key] = 'range'
  if (!out.current_a && !out.current_v && toNum(f?.current_a) !== null && toNum(f?.current_v) === null) out.current_v = 'needVolts'
  for (const k of ['connector_in', 'connector_out']) if (f?.[k] && !CONNECTOR_IDS.includes(f[k])) out[k] = 'connector'
  const power = toNum(f?.power_w), typical = toNum(f?.power_typical_w)
  if (!out.power_typical_w && power !== null && typical !== null && typical > power) out.power_typical_w = 'overMax'
  return out
}

// A distro's inputs and outputs, cleaned ({ inputs: [{ connector }], outputs: [{ id, label,
// connector, phase, breaker_a, rcd_ma }] }), or null when it has no outputs
export function distroSpecOf(d) {
  if (!d || typeof d !== 'object') return null
  const inputs = (Array.isArray(d.inputs) ? d.inputs : []).filter(i => i && CONNECTOR_IDS.includes(i.connector)).slice(0, 4)
    .map(i => ({ connector: i.connector }))
  const outputs = outputsOf(d.outputs)
  return outputs.length ? { inputs, outputs } : null
}

export function outputsOf(list) {
  return (Array.isArray(list) ? list : []).filter(o => o && typeof o === 'object').slice(0, LIMITS.outputs).map((o, i) => {
    const conn = CONNECTOR_IDS.includes(o.connector) ? o.connector : 'schuko'
    const phase = OUTPUT_PHASES.includes(o.phase) ? o.phase : (connectorOf(conn).phases === 3 ? '3P' : 'L1')
    const breaker = num(o.breaker_a, null)
    const rcd = num(o.rcd_ma, null)
    return {
      id: id8(o.id) || `o${i + 1}`,
      label: str(o.label, 30),
      connector: conn,
      phase,
      breaker_a: breaker === null ? null : clamp(Math.round(breaker), 1, 6300),
      rcd_ma: rcd === null ? null : clamp(Math.round(rcd), 1, 1000),
    }
  })
}

// The item form's fields ↔ the row saved (strings in the form, numbers or null in the row)
export function electricalForm(item) {
  const v = k => (item?.[k] ?? '') === null ? '' : String(item?.[k] ?? '')
  const spec = distroSpecOf(item?.distro)
  return {
    power_typical_w: v('power_typical_w'), power_factor: v('power_factor'), inrush_a: v('inrush_a'),
    current_a: v('current_a'), current_v: v('current_v'),
    connector_in: item?.connector_in || '', connector_out: item?.connector_out || '',
    is_distro: Boolean(spec),
    distro_in: spec?.inputs[0]?.connector || '',
    outputs: spec?.outputs || [],
  }
}
export function electricalRow(f) {
  const n = k => { const x = toNum(f[k]); return x === null || !Number.isFinite(x) ? null : x }
  const outputs = f.is_distro ? outputsOf(f.outputs) : []
  return {
    power_typical_w: n('power_typical_w') === null ? null : Math.round(n('power_typical_w')),
    power_factor: n('power_factor'),
    inrush_a: n('inrush_a'),
    current_a: n('current_a'),
    current_v: n('current_v') === null ? null : Math.round(n('current_v')),
    connector_in: f.connector_in || null,
    connector_out: f.connector_out || null,
    distro: outputs.length ? { inputs: f.distro_in ? [{ connector: f.distro_in }] : [], outputs } : null,
  }
}

// What the power tool keeps of a catalogue item (copied into the plan, so crew who can't read the
// catalogue see the same figures): watts max and typical, power factor, datasheet amps and volts,
// inrush, the input connector, and a distro's outputs
export function figuresOf(item) {
  const f = {}
  const put = (k, v) => { if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) f[k] = Number(v) }
  put('w', item.power_w); put('tw', item.power_typical_w); put('pf', item.power_factor)
  put('a', item.current_a); put('v', item.current_v); put('in', item.inrush_a)
  if (item.connector_in) f.cin = item.connector_in
  const spec = distroSpecOf(item.distro)
  if (spec) f.distro = spec
  if (item.name) f.name = str(item.name, 80)
  return f
}
// Does an item draw power (or is it a distro)?
export const isPowered = f => Boolean(f && (f.w != null || f.a != null || f.cin))
export const isDistro = f => Boolean(f?.distro)

// ── The plan, as saved in gig_show.power ──────────────────────────────────────
export function supplyOf(power) {
  const s = power?.supply || {}
  return {
    kind: s.kind === 'generator' ? 'generator' : 'venue',
    name: str(s.name, 60),
    volts: clamp(Math.round(num(s.volts, DEFAULT_SUPPLY.volts)), 100, 277),
    phases: Number(s.phases) === 1 ? 1 : 3,
    amps: clamp(Math.round(num(s.amps, DEFAULT_SUPPLY.amps)), 1, 6300),
    hz: Number(s.hz) === 60 ? 60 : 50,
  }
}
export const marginOf = power => clamp(Math.round(num(power?.margin, DEFAULT_MARGIN)), 0, 100)

// feed: 'supply', { distro, output } (plugged into another distro), or null (not plugged in)
export function distrosOf(power) {
  return (Array.isArray(power?.distros) ? power.distros : []).filter(d => d && d.id).slice(0, LIMITS.distros).map(d => {
    const feed = d.feed === 'supply' ? 'supply'
      : d.feed && typeof d.feed === 'object' && d.feed.distro && d.feed.output ? { distro: id8(d.feed.distro), output: id8(d.feed.output) } : null
    return {
      id: id8(d.id),
      name: str(d.name, 60) || '—',
      item_id: d.item_id ? id8(d.item_id) : null,
      input: CONNECTOR_IDS.includes(d.input) ? d.input : null,
      feed,
      outputs: outputsOf(d.outputs),
    }
  })
}

// Loads typed by hand (catering, bars, site office): name, watts each, power factor, how many
export function manualOf(power) {
  return (Array.isArray(power?.manual) ? power.manual : []).filter(m => m && m.id).slice(0, LIMITS.manual).map(m => {
    const pf = num(m.pf, null)
    return {
      id: id8(m.id),
      name: str(m.name, 60) || '—',
      watts: clamp(Math.round(num(m.watts, 0)), 0, 1000000),
      pf: pf === null ? null : clamp(pf, 0.3, 1),
      qty: clamp(Math.round(num(m.qty, 1)), 1, 999),
      three: m.three === true,
    }
  })
}

// Where each load is plugged in: { distro, output } or { phase } (straight on the supply)
export function assignOf(power) {
  const a = power?.assign && typeof power.assign === 'object' && !Array.isArray(power.assign) ? power.assign : {}
  const out = {}
  for (const [key, v] of Object.entries(a)) {
    if (!v || typeof v !== 'object') continue
    if (v.distro && v.output) out[key] = { distro: id8(v.distro), output: id8(v.output) }
    else if (OUTPUT_PHASES.includes(v.phase)) out[key] = { phase: v.phase }
  }
  return out
}

export const figuresMap = power => (power?.figures && typeof power.figures === 'object' && !Array.isArray(power.figures) ? power.figures : {})

// ── Loads ─────────────────────────────────────────────────────────────────────
// Every load the gig has: fixtures (light plot and DMX patch), the sound system's sources, the
// gig's powered equipment not already counted as a fixture or a source, and loads typed by hand.
// Each: { key, kind, name, qty, watts (total, null when unknown), va (total), pf, fromAmps, three }
export function gatherLoads({ fixtures = [], sources = [], equipment = [], manual = [], figures = {} }) {
  const loads = []
  const used = {} // item id → how many are already loads
  const fromItem = (itemId, qty) => {
    const f = itemId ? figures[itemId] : null
    if (f?.w != null) {
      const pf = f.pf ?? null
      return { watts: f.w * qty, va: (f.w / (pf || 1)) * qty, pf, fromAmps: false, three: connectorOf(f.cin)?.phases === 3 }
    }
    if (f?.a != null) {
      const va = f.a * (f.v || 230) * qty
      return { watts: null, va, pf: null, fromAmps: true, three: connectorOf(f.cin)?.phases === 3 }
    }
    return null
  }
  for (const fx of fixtures) {
    if (!fx?.id) continue
    if (fx.item_id) used[fx.item_id] = (used[fx.item_id] || 0) + 1
    const f = fx.item_id ? figures[fx.item_id] : null
    const w = fx.power_w ?? f?.w ?? null
    const base = w != null
      ? { watts: Number(w), va: Number(w) / (f?.pf || 1), pf: f?.pf ?? null, fromAmps: false, three: false }
      : fromItem(fx.item_id, 1)
    loads.push({
      key: `fx:${fx.id}`, kind: 'fixture', name: fx.name || fx.fixture_type || '—',
      detail: [fx.fixture_type && fx.fixture_type !== fx.name ? fx.fixture_type : '', fx.position].filter(Boolean).join(' · '),
      qty: 1, item_id: fx.item_id || null,
      ...(base || { watts: null, va: 0, pf: null, fromAmps: false, three: false }), unknown: !base,
    })
  }
  for (const s of sources) {
    if (!s?.id) continue
    const qty = Math.max(1, Number(s.count) || 1)
    if (s.item_id) used[s.item_id] = (used[s.item_id] || 0) + qty
    const base = fromItem(s.item_id, qty)
    loads.push({
      key: `sp:${s.id}`, kind: 'speaker', name: s.name || '—', detail: s.item_name || '', qty, item_id: s.item_id || null,
      ...(base || { watts: null, va: 0, pf: null, fromAmps: false, three: false }), unknown: !base,
    })
  }
  for (const line of equipment) {
    const f = figures[line?.item_id]
    if (!f || isDistro(f) || !isPowered(f)) continue
    const qty = Math.max(0, (Number(line.quantity) || 0) - (used[line.item_id] || 0))
    if (!qty) continue
    const base = fromItem(line.item_id, qty)
    loads.push({
      key: `eq:${line.item_id}`, kind: 'equipment', name: line.item_name || f.name || '—', detail: line.category || '', qty, item_id: line.item_id,
      ...(base || { watts: null, va: 0, pf: null, fromAmps: false, three: false }), unknown: !base,
    })
  }
  for (const m of manual) {
    loads.push({
      key: `m:${m.id}`, kind: 'manual', name: m.name, detail: '', qty: m.qty, item_id: null,
      watts: m.watts * m.qty, va: (m.watts / (m.pf || 1)) * m.qty, pf: m.pf, fromAmps: false, three: m.three, unknown: false,
    })
  }
  return loads
}

// ── The maths ─────────────────────────────────────────────────────────────────
// Current on each phase for a load of `va` volt-amperes at `volts` (phase to neutral):
// single-phase on phase k: va / volts on k; three-phase: va / (3 × volts) on each.
export function loadCurrents(va, volts, phaseIdx) {
  const out = [0, 0, 0]
  if (!va || !volts || !phaseIdx.length) return out
  const each = va / (phaseIdx.length * volts)
  for (const k of phaseIdx) out[k] += each
  return out
}

// Neutral current from the three phases as phasors (120° apart), each phase's current lagging by
// its own angle: |Ia∠(0−φa) + Ib∠(−120−φb) + Ic∠(120−φc)|. Equal currents with equal power
// factors cancel; one phase alone puts all its current on the neutral.
// Harmonics from electronic loads (LED drivers, switch-mode supplies) are not included.
export function neutralCurrent(phases, lag = [0, 0, 0]) {
  const angles = [0, -120, 120]
  let re = 0, im = 0
  for (let k = 0; k < 3; k++) {
    const a = ((angles[k] - (lag[k] || 0)) * Math.PI) / 180
    re += (phases[k] || 0) * Math.cos(a)
    im += (phases[k] || 0) * Math.sin(a)
  }
  const n = Math.hypot(re, im)
  return n < 1e-9 ? 0 : n
}

// For balanced-against-a-rating checks: 'ok', 'near' (≥ 80%) or 'over' (> 100%)
export const stateOf = ratio => (ratio > 1 ? 'over' : ratio >= HEADROOM_WARN ? 'near' : 'ok')

// Phase balance: (largest − smallest) / largest, 0 when nothing is on
export function phaseBalance(phases) {
  const max = Math.max(...phases), min = Math.min(...phases)
  return max > 0 ? (max - min) / max : 0
}

// The generator to suggest: sized by the busiest phase (so an unbalanced plan still fits), plus the
// margin, rounded up to a common size. size is null above the largest (more than one set).
export function generatorSuggestion(phaseAmps, volts, phases, margin = DEFAULT_MARGIN) {
  const worst = Math.max(0, ...phaseAmps.slice(0, phases))
  const kva = (worst * volts * phases) / 1000
  const needed = kva * (1 + margin / 100)
  return { kva: r1(kva), needed: r1(needed), size: needed > 0 ? GENERATOR_SIZES.find(s => s >= needed) ?? null : null, margin }
}

// Which distros reach the supply: 'connected' (plugged in, all the way up), 'partly' (plugged
// into a distro that isn't) or 'none' (not plugged in). A loop counts as 'partly'.
export function distroStatuses(distros) {
  const byId = Object.fromEntries(distros.map(d => [d.id, d]))
  const memo = {}
  const walk = (id, seen) => {
    if (memo[id]) return memo[id]
    const d = byId[id]
    if (!d || !d.feed) return 'none'
    if (d.feed === 'supply') return 'connected'
    const parent = byId[d.feed.distro]
    if (!parent || !parent.outputs.some(o => o.id === d.feed.output) || seen.has(d.feed.distro)) return 'partly'
    seen.add(id)
    return walk(d.feed.distro, seen) === 'connected' ? 'connected' : 'partly'
  }
  for (const d of distros) memo[d.id] = walk(d.id, new Set())
  return memo
}

// The distros a distro may be plugged into (not itself, nor anything plugged into it)
export function feedChoices(distros, id) {
  const below = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const d of distros) {
      if (!below.has(d.id) && d.feed && d.feed !== 'supply' && below.has(d.feed.distro)) { below.add(d.id); grew = true }
    }
  }
  return distros.filter(d => !below.has(d.id))
}

// The supply phases (0-based) a distro's output carries. feedIdx: the phases reaching the distro.
// A single-phase feed puts every output on that phase; L1–L3 pick one of three; 3P takes all.
export function outputPhaseIdx(output, feedIdx) {
  if (feedIdx.length === 1) return [...feedIdx]
  if (output.phase === '3P') return [...feedIdx]
  const k = PHASES.indexOf(output.phase)
  return feedIdx.includes(k) ? [k] : [feedIdx[0]]
}

const lagOf = pf => (Math.acos(clamp(pf || 1, 0, 1)) * 180) / Math.PI

// The whole plan worked out:
// - per load: status ('connected' | 'partly' | 'none'), the phases it's on, its current per phase;
// - per distro and output: current per phase, neutral, rating, headroom and its state;
// - the supply: current per phase, neutral, balance, state; totals; loads not plugged in;
// - a generator suggestion that also counts the loads not plugged in (spread over the phases).
export function powerPlan({ supply, distros, loads, assign, margin = DEFAULT_MARGIN }) {
  const V = supply.volts
  const all = supply.phases === 1 ? [0] : [0, 1, 2]
  const status = distroStatuses(distros)
  const byId = Object.fromEntries(distros.map(d => [d.id, d]))

  // The phases reaching each distro (a distro not plugged in is worked out as if on a full feed)
  const feedIdxMemo = {}
  const feedIdx = (id, seen = new Set()) => {
    if (feedIdxMemo[id]) return feedIdxMemo[id]
    const d = byId[id]
    let idx = all
    if (d?.feed && d.feed !== 'supply' && !seen.has(id)) {
      seen.add(id)
      const parent = byId[d.feed.distro]
      const out = parent?.outputs.find(o => o.id === d.feed.output)
      if (parent && out) idx = outputPhaseIdx(out, feedIdx(parent.id, seen))
    }
    feedIdxMemo[id] = idx
    return idx
  }

  const blank = () => ({ amps: [0, 0, 0], re: [0, 0, 0], im: [0, 0, 0], watts: 0, va: 0, unknown: 0, loads: [] })
  const add = (acc, cur, lag, load) => {
    for (let k = 0; k < 3; k++) {
      if (!cur[k]) continue
      acc.amps[k] += cur[k]
      const a = (lag * Math.PI) / 180
      acc.re[k] += cur[k] * Math.cos(a)
      acc.im[k] += cur[k] * Math.sin(a)
    }
    acc.watts += load.watts ?? load.va ?? 0
    acc.va += load.va || 0
    if (load.unknown) acc.unknown += 1
    acc.loads.push(load.key)
  }
  const outAcc = {} // `${distro}/${output}` → acc
  const directAcc = blank()
  const loadInfo = {}
  const unplugged = blank()
  const everything = blank()

  for (const load of loads) {
    const a = assign[load.key]
    let st = 'none', idx = null
    if (a?.distro) {
      const d = byId[a.distro]
      const o = d?.outputs.find(x => x.id === a.output)
      if (d && o) {
        idx = outputPhaseIdx(o, feedIdx(d.id))
        // A single-phase load on a three-phase output (it can only take one): its first phase
        if (!load.three && o.phase === '3P' && idx.length > 1) idx = [idx[0]]
        st = status[d.id] === 'connected' ? 'connected' : 'partly'
        const key = `${d.id}/${o.id}`
        outAcc[key] ||= blank()
        add(outAcc[key], loadCurrents(load.va, V, idx), lagOf(load.pf), load)
      }
    } else if (a?.phase) {
      idx = a.phase === '3P' || supply.phases === 1 ? (a.phase === '3P' ? all : [0]) : [PHASES.indexOf(a.phase)]
      st = 'connected'
      add(directAcc, loadCurrents(load.va, V, idx), lagOf(load.pf), load)
    }
    const cur = idx ? loadCurrents(load.va, V, idx) : [0, 0, 0]
    loadInfo[load.key] = { status: st, phases: idx ? idx.map(k => (supply.phases === 1 ? 'L' : PHASES[k])) : [], amps: r1(Math.max(...cur)) }
    if (st !== 'connected') add(unplugged, [0, 0, 0], 0, load)
    // Everything, for the generator: plugged-in loads where they are, the rest spread evenly
    add(everything, st === 'connected' ? cur : loadCurrents(load.va, V, load.three || !idx ? all : idx), lagOf(load.pf), load)
  }

  const finish = (acc, rating) => {
    const amps = acc.amps.map(r1)
    // Each phase as a phasor (its loads' currents added with their lag) for the neutral
    const mag = [0, 1, 2].map(k => Math.hypot(acc.re[k], acc.im[k]))
    const lag = [0, 1, 2].map(k => (mag[k] ? (Math.atan2(acc.im[k], acc.re[k]) * 180) / Math.PI : 0))
    const worst = Math.max(...acc.amps)
    const ratio = rating ? worst / rating : null
    return {
      amps, neutral: r1(supply.phases === 1 ? acc.amps[0] : neutralCurrent(mag, lag)),
      watts: Math.round(acc.watts), va: Math.round(acc.va), unknown: acc.unknown, loads: acc.loads,
      rating: rating || null, ratio, state: ratio === null ? 'ok' : stateOf(ratio),
    }
  }
  const merge = (into, acc) => {
    for (let k = 0; k < 3; k++) { into.amps[k] += acc.amps[k]; into.re[k] += acc.re[k]; into.im[k] += acc.im[k] }
    into.watts += acc.watts; into.va += acc.va; into.unknown += acc.unknown; into.loads.push(...acc.loads)
  }

  // Distros, from the bottom up: each output's loads plus whatever distro is plugged into it
  const distroAcc = {}
  const outputs = {}
  const visit = (id, seen = new Set()) => {
    if (distroAcc[id]) return distroAcc[id]
    if (seen.has(id)) return blank()
    seen.add(id)
    const d = byId[id]
    const total = blank()
    for (const o of d.outputs) {
      const acc = blank()
      if (outAcc[`${d.id}/${o.id}`]) merge(acc, outAcc[`${d.id}/${o.id}`])
      for (const child of distros) {
        if (child.feed && child.feed !== 'supply' && child.feed.distro === d.id && child.feed.output === o.id) merge(acc, visit(child.id, seen))
      }
      outputs[`${d.id}/${o.id}`] = finish(acc, o.breaker_a || connectorOf(o.connector)?.amps)
      merge(total, acc)
    }
    distroAcc[id] = total
    return total
  }
  const distroResults = {}
  for (const d of distros) {
    const acc = visit(d.id)
    const parentOut = d.feed && d.feed !== 'supply' ? byId[d.feed.distro]?.outputs.find(o => o.id === d.feed.output) : null
    // Its rating: the smaller of its input connector and the breaker of the output feeding it
    const ratings = [connectorOf(d.input)?.amps, parentOut ? parentOut.breaker_a || connectorOf(parentOut.connector)?.amps : null].filter(Boolean)
    const rating = ratings.length ? Math.min(...ratings) : null
    distroResults[d.id] = {
      ...finish(acc, rating), status: status[d.id],
      outputs: Object.fromEntries(d.outputs.map(o => [o.id, outputs[`${d.id}/${o.id}`]])),
    }
  }

  // The supply: distros plugged straight into it, plus loads wired straight to it
  const supplyAcc = blank()
  for (const d of distros) if (d.feed === 'supply') merge(supplyAcc, distroAcc[d.id])
  merge(supplyAcc, directAcc)
  const sup = finish(supplyAcc, supply.amps)
  const balance = supply.phases === 3 ? phaseBalance(sup.amps) : 0

  const allAmps = everything.amps
  const unknownCount = loads.filter(l => l.unknown).length
  return {
    supply: { ...sup, balance: Math.round(balance * 100), unbalanced: balance > BALANCE_WARN && Math.max(...sup.amps) > 0 },
    distros: distroResults,
    loads: loadInfo,
    unplugged: { count: loads.filter(l => loadInfo[l.key].status !== 'connected').length, watts: Math.round(unplugged.watts) },
    total: { watts: Math.round(everything.watts), va: Math.round(everything.va), count: loads.length, unknown: unknownCount, fromAmps: loads.filter(l => l.fromAmps).length },
    generator: generatorSuggestion(allAmps, V, supply.phases, margin),
    noPf: loads.some(l => !l.unknown && !l.fromAmps && l.pf == null),
  }
}

// Warnings, worst first, as i18n keys with their values: { key, vars, level: 'over' | 'near' | 'info' }
export function planWarnings(plan, distros, supply) {
  const out = []
  const label = (d, o) => `${d.name} · ${o.label || o.id}`
  for (const p of [0, 1, 2].slice(0, supply.phases)) {
    const ratio = plan.supply.amps[p] / supply.amps
    if (ratio > 1) out.push({ level: 'over', key: 'power.warn.supplyOver', vars: { phase: supply.phases === 1 ? 'L' : PHASES[p], a: plan.supply.amps[p], max: supply.amps } })
    else if (ratio >= HEADROOM_WARN) out.push({ level: 'near', key: 'power.warn.supplyNear', vars: { phase: supply.phases === 1 ? 'L' : PHASES[p], a: plan.supply.amps[p], max: supply.amps } })
  }
  for (const d of distros) {
    const r = plan.distros[d.id]
    if (!r) continue
    if (r.state !== 'ok') out.push({ level: r.state, key: r.state === 'over' ? 'power.warn.distroOver' : 'power.warn.distroNear', vars: { name: d.name, a: Math.max(...r.amps), max: r.rating } })
    for (const o of d.outputs) {
      const x = r.outputs[o.id]
      if (x && x.state !== 'ok') out.push({ level: x.state, key: x.state === 'over' ? 'power.warn.outputOver' : 'power.warn.outputNear', vars: { name: label(d, o), a: Math.max(...x.amps), max: x.rating } })
    }
  }
  if (plan.supply.unbalanced) out.push({ level: 'near', key: 'power.warn.balance', vars: { pct: plan.supply.balance } })
  if (plan.unplugged.count) out.push({ level: 'info', key: 'power.warn.unplugged', vars: { count: plan.unplugged.count } })
  if (plan.total.unknown) out.push({ level: 'info', key: 'power.warn.unknown', vars: { count: plan.total.unknown } })
  if (plan.generator.size === null && plan.generator.needed > 0) out.push({ level: 'info', key: 'power.warn.genTooBig', vars: { kva: plan.generator.needed } })
  const rank = { over: 0, near: 1, info: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}

// A new id for a distro, output or typed load
export const newId = prefix => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

// A distro on the plan from a catalogue item: its outputs (new ids kept stable by position) and input
export function distroFromItem(item, figures, name) {
  const spec = figures?.distro || distroSpecOf(item?.distro)
  return {
    id: newId('d'), name: str(name || item?.name, 60) || '—', item_id: item?.id || null,
    input: spec?.inputs?.[0]?.connector || figures?.cin || null, feed: null,
    outputs: (spec?.outputs || []).map((o, i) => ({ ...o, id: `o${i + 1}` })),
  }
}

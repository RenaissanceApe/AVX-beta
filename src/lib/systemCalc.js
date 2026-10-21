// The sound system calculator (docs/FIELD_TOOLS.md, F4): estimates for placing and timing a PA.
// Positions are in metres on the same axes as the stage plot (x from the left as the audience
// sees it, y from the front edge of the stage; the audience is at negative y), with a height;
// every source faces the audience.
// Everything here is an estimate from simple physics (straight lines, free field), to be checked
// with a measurement system on site.

export const KINDS = ['main', 'sub', 'delay', 'fill']
export const EAR_HEIGHT = 1.2 // metres: a seated listener's ears (standing, about 1.7)
export const DEFAULTS = { temp_c: 20, haas_ms: 10, ear_m: EAR_HEIGHT }
export const LIMITS = { x: [-100, 100], y: [-250, 50], height: [0, 40] }
export const ECHO_MS = 30 // a later arrival beyond this is heard as an echo

const num = (v, fallback) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback)
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
const r1 = v => Math.round(v * 10) / 10

// Speed of sound in air (m/s) at a temperature in °C
export const speedOfSound = tempC => 331.3 + 0.606 * num(tempC, 20)

// How long sound takes to travel `metres`, in milliseconds
export const travelMs = (metres, tempC) => (metres / speedOfSound(tempC)) * 1000

// Straight-line distance between two points with heights (x, y, z)
export const distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0))

// Sound level at distance d from a source rated `spl1m` dB at 1 m: −6 dB per doubling of distance;
// n boxes add 10·log10(n) (they don't add up perfectly in step, so the cautious figure)
export const splAt = (spl1m, d, count = 1) => spl1m - 20 * Math.log10(Math.max(1, d)) + 10 * Math.log10(Math.max(1, count))

// Every source faces the audience (towards negative y). How far off that line a listener is, in
// degrees (0 straight ahead, 180 right behind), and what that costs: nothing inside the box's
// horizontal angle, 12 dB outside it, 20 dB behind it. Subs spread all round.
export const OFF_ANGLE_DB = 12
export const BEHIND_DB = 20
export function offAxis(source, listener) {
  const dx = listener.x - source.x, dy = listener.y - source.y
  if (!dx && !dy) return 0
  return (Math.acos(-dy / Math.hypot(dx, dy)) * 180) / Math.PI
}
export function aimLoss(source, listener) {
  if (source.kind === 'sub') return 0
  const off = offAxis(source, listener)
  if (off > 90) return BEHIND_DB
  return off > source.angle / 2 ? OFF_ANGLE_DB : 0
}

// Levels from several sources heard together (added as power)
export const sumSpl = levels => {
  const live = levels.filter(Number.isFinite)
  return live.length ? 10 * Math.log10(live.reduce((s, l) => s + 10 ** (l / 10), 0)) : null
}

// How wide a source with this horizontal angle covers at distance d
export const coverageWidth = (angleDeg, d) => 2 * d * Math.tan(((Math.min(179, Math.max(1, angleDeg)) / 2) * Math.PI) / 180)

// The settings and lists kept in the show model (gig_show.system), cleaned up
export function settingsOf(system) {
  return {
    temp_c: Math.min(50, Math.max(-20, num(system?.temp_c, DEFAULTS.temp_c))),
    haas_ms: Math.min(30, Math.max(0, num(system?.haas_ms, DEFAULTS.haas_ms))),
    ear_m: Math.min(3, Math.max(0, num(system?.ear_m, DEFAULTS.ear_m))),
  }
}
export function sourcesOf(system) {
  return (Array.isArray(system?.sources) ? system.sources : []).filter(s => s && s.id).map(s => ({
    id: String(s.id),
    name: String(s.name || '').slice(0, 40),
    kind: KINDS.includes(s.kind) ? s.kind : 'main',
    x: clamp(num(s.x, 0), LIMITS.x),
    y: clamp(num(s.y, 0), LIMITS.y),
    height: clamp(num(s.height, 0), LIMITS.height),
    spl: Math.min(160, Math.max(60, num(s.spl, 130))),
    angle: Math.min(180, Math.max(1, num(s.angle, 90))),
    count: Math.min(64, Math.max(1, Math.round(num(s.count, 1)))),
    extra_ms: Math.min(500, Math.max(-500, num(s.extra_ms, 0))),
  }))
}
export function listenersOf(system) {
  return (Array.isArray(system?.listeners) ? system.listeners : []).filter(l => l && l.id).map(l => ({
    id: String(l.id),
    name: String(l.name || '').slice(0, 40),
    x: clamp(num(l.x, 0), LIMITS.x),
    y: clamp(num(l.y, 0), LIMITS.y),
  }))
}

const at = (s, z) => ({ x: s.x, y: s.y, z: s.height ?? z })

// The main a delay or fill follows: the nearest main
export function nearestMain(source, sources) {
  let best = null
  for (const m of sources) {
    if (m.kind !== 'main' || m.id === source.id) continue
    const d = distance3(at(source), at(m))
    if (!best || d < best.d) best = { main: m, d }
  }
  return best
}

// The delay to set on each source, in ms. Mains: 0. Delays and fills: the time sound takes from
// their main to them, plus the Haas offset so the main is still heard first. Subs: lined up with
// their nearest main at the reference listener (the first one, usually FOH), on the later of the
// two. Plus any extra the engineer typed. Returns { [id]: { ms, from, reason } }.
export function delays(sources, listeners, settings) {
  const { temp_c, haas_ms, ear_m } = settings
  const ref = listeners[0] ? { x: listeners[0].x, y: listeners[0].y, z: ear_m } : null
  const out = {}
  for (const s of sources) out[s.id] = { ms: 0, from: null, reason: 'main' }
  for (const s of sources) {
    if (s.kind === 'delay' || s.kind === 'fill') {
      const n = nearestMain(s, sources)
      if (n) out[s.id] = { ms: travelMs(n.d, temp_c) + haas_ms, from: n.main.id, reason: 'follow' }
      else out[s.id] = { ms: 0, from: null, reason: 'noMain' }
    }
  }
  for (const s of sources.filter(x => x.kind === 'sub')) if (!ref) out[s.id] = { ms: 0, from: null, reason: 'noListener' }
  if (ref) {
    for (const s of sources.filter(x => x.kind === 'sub')) {
      const n = nearestMain(s, sources)
      if (!n) { out[s.id] = { ms: 0, from: null, reason: 'noMain' }; continue }
      // Which arrives first at the reference listener? That one waits for the other.
      const diff = travelMs(distance3(at(n.main), ref), temp_c) - travelMs(distance3(at(s), ref), temp_c)
      if (diff > 0) out[s.id] = { ms: diff, from: n.main.id, reason: 'subLate' }
      else out[s.id] = { ms: 0, from: n.main.id, reason: 'mainLate', mainWait: -diff }
    }
  }
  for (const s of sources) out[s.id].ms = r1(Math.max(0, out[s.id].ms + s.extra_ms))
  return out
}

// What a listener hears: per source the distance, the level, and when it arrives (with its delay
// set); the total level; and how the delays and fills arrive against their main (too early,
// fine, or late enough to be an echo).
export function listenerReport(listener, sources, settings, set = delays(sources, [listener], settings)) {
  const ear = { x: listener.x, y: listener.y, z: settings.ear_m }
  const rows = sources.map(s => {
    const d = distance3(at(s), ear)
    return { id: s.id, kind: s.kind, d: r1(d), spl: r1(splAt(s.spl, d, s.count) - aimLoss(s, listener)), arrival: r1(travelMs(d, settings.temp_c) + (set[s.id]?.ms || 0)) }
  })
  const byId = Object.fromEntries(rows.map(r => [r.id, r]))
  const checks = []
  for (const s of sources) {
    if (s.kind !== 'delay' && s.kind !== 'fill') continue
    const from = set[s.id]?.from
    if (!from || !byId[from]) continue
    const gap = r1(byId[s.id].arrival - byId[from].arrival)
    // Only where this delay or fill is loud enough to matter (within 10 dB of its main)
    if (byId[s.id].spl < byId[from].spl - 10) continue
    checks.push({ id: s.id, main: from, gap, state: gap < 0 ? 'early' : gap > ECHO_MS ? 'echo' : 'ok' })
  }
  const total = sumSpl(rows.map(r => r.spl))
  const mains = sumSpl(rows.filter(r => r.kind === 'main').map(r => r.spl))
  return { rows, total: total === null ? null : r1(total), mains: mains === null ? null : r1(mains), checks }
}

// How wide each source covers at the farthest listener in front of it (not for subs, or boxes
// wider than 160°: they cover everything around them)
export function coverage(sources, listeners, settings) {
  return Object.fromEntries(sources.map(s => {
    if (s.kind === 'sub' || s.angle > 160) return [s.id, null]
    const far = listeners.filter(l => offAxis(s, l) <= 90)
      .reduce((m, l) => Math.max(m, distance3(at(s), { x: l.x, y: l.y, z: settings.ear_m })), 0)
    return [s.id, far ? { d: r1(far), width: r1(coverageWidth(s.angle, far)) } : null]
  }))
}

// A new source or listener in a sensible place: mains either side of the stage, subs in front,
// delays and fills further out; listeners down the middle
export function newSource(sources, stageWidth, kind, name, id = `s${Date.now().toString(36)}`) {
  const same = sources.filter(s => s.kind === kind).length
  const side = same % 2 ? stageWidth + 1 : -1
  const spot = {
    main: { x: side, y: 0, height: 6, spl: 136, angle: 100 },
    sub: { x: stageWidth / 2 + (same % 2 ? 1.5 : -1.5), y: -0.5, height: 0.5, spl: 135, angle: 180 },
    delay: { x: same % 2 ? stageWidth * 0.75 : stageWidth * 0.25, y: -25, height: 5, spl: 128, angle: 90 },
    fill: { x: stageWidth / 2 + (same % 2 ? 2 : -2), y: -0.3, height: 0.3, spl: 120, angle: 90 },
  }[kind]
  return { id, name, kind, count: 1, extra_ms: 0, ...spot }
}
export function newListener(listeners, stageWidth, name, id = `l${Date.now().toString(36)}`) {
  return { id, name, x: stageWidth / 2, y: -(listeners.length ? 10 + listeners.length * 10 : 20) }
}

// "Main 3" after Main 1 and Main 2 (prefix is translated)
export function nextName(list, prefix) {
  const taken = new Set(list.map(x => x.name.toLowerCase()))
  let n = 1
  while (taken.has(`${prefix} ${n}`.toLowerCase())) n++
  return `${prefix} ${n}`
}

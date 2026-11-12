// Bridle calculator (docs/TOOLS_PLAN.md §5, RG2): two legs from two beam points to one pick point.
// Beam point A is at (0, 0) and beam point B at (span, rise) in metres (rise: how much higher B is
// than A; usually 0). The pick point hangs below both. It is set either by the two leg lengths, or
// by where it should be (horizontal distance from A and depth below A).
// Statics of a weightless two-leg sling: T1·u1 + T2·u2 = (0, W), with u the unit vector from the
// pick point along each leg. Gives each leg's tension, the angles, and the horizontal force each
// beam point takes (the legs pull the beams towards each other).
// An aid that a competent rigger must check; hardware WLLs are only ever the manufacturer's.

export const BRIDLE_LIMITS = { span: [0.1, 50], rise: [-20, 20], leg: [0.1, 60], depth: [0.01, 60], load: [0, 20000], wll: [1, 100000] }
export const WARN_ANGLE = 120 // degrees between the legs: above this a leg carries more than the load
const NEAR = 0.8
const r1 = v => Math.round(v * 10) / 10
const r2 = v => Math.round(v * 100) / 100
const deg = rad => (rad * 180) / Math.PI
const clean = v => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null)

// The pick point from the two leg lengths: where the circles round A and B meet, below the line AB
export function pickFromLegs({ span, rise = 0, leg1, leg2 }) {
  const d = Math.hypot(span, rise)
  if (!(d > 0) || !(leg1 > 0) || !(leg2 > 0)) return { problem: 'missing' }
  if (leg1 + leg2 <= d + 1e-9) return { problem: 'tooShort' } // the legs can't reach each other
  if (Math.abs(leg1 - leg2) >= d - 1e-9) return { problem: 'oneSided' } // one leg longer than the other plus the span
  const a = (leg1 * leg1 - leg2 * leg2 + d * d) / (2 * d) // along AB from A
  const h = Math.sqrt(Math.max(0, leg1 * leg1 - a * a)) // away from AB
  const ex = span / d, ey = rise / d // unit vector A → B
  // Of the two crossings, the one below the line AB (rotate AB clockwise)
  return { x: a * ex + h * ey, y: a * ey - h * ex }
}

// Everything about one bridle. Input: span, rise, load (kg), and either leg1 + leg2 (mode 'legs')
// or x + depth (mode 'point'); optional wll1 / wll2 (kg): the weakest piece in each leg.
export function bridle(input) {
  const span = clean(input.span), rise = clean(input.rise) ?? 0, load = clean(input.load) ?? 0
  if (!(span > 0)) return { problem: 'missing' }
  let P
  if (input.mode === 'point') {
    const x = clean(input.x), depth = clean(input.depth)
    if (x === null || !(depth > 0)) return { problem: 'missing' }
    P = { x, y: -depth }
  } else {
    P = pickFromLegs({ span, rise, leg1: clean(input.leg1), leg2: clean(input.leg2) })
    if (P.problem) return P
  }
  const A = { x: 0, y: 0 }, B = { x: span, y: rise }
  const L1 = Math.hypot(A.x - P.x, A.y - P.y), L2 = Math.hypot(B.x - P.x, B.y - P.y)
  if (L1 < 1e-6 || L2 < 1e-6) return { problem: 'onPoint' }
  if (P.y >= Math.min(A.y, B.y) - 1e-6) return { problem: 'pickAbove' } // must hang below both beam points
  if (P.x <= A.x + 1e-9 || P.x >= B.x - 1e-9) return { problem: 'outside' } // must be between them
  const u1 = { x: (A.x - P.x) / L1, y: (A.y - P.y) / L1 }
  const u2 = { x: (B.x - P.x) / L2, y: (B.y - P.y) / L2 }
  const det = u1.x * u2.y - u2.x * u1.y
  if (Math.abs(det) < 1e-12) return { problem: 'straight' }
  const t1 = (-u2.x * load) / det, t2 = (u1.x * load) / det
  const included = deg(Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y))))
  const legCheck = (t, wll) => {
    const w = clean(wll)
    if (!(w > 0)) return { wll: null, use: null, status: 'noWll' }
    const use = t / w
    return { wll: w, use, status: use > 1 + 1e-9 ? 'over' : use > NEAR ? 'near' : 'ok' }
  }
  const legs = [
    { length: r2(L1), angle: r1(deg(Math.atan2(Math.abs(u1.x), u1.y))), tension: r1(t1), vertical: r1(t1 * u1.y), ...legCheck(t1, input.wll1) },
    { length: r2(L2), angle: r1(deg(Math.atan2(Math.abs(u2.x), u2.y))), tension: r1(t2), vertical: r1(t2 * u2.y), ...legCheck(t2, input.wll2) },
  ]
  return {
    pick: { x: r2(P.x), depth: r2(-P.y) },
    legs,
    included: r1(included),
    horizontal: r1(Math.abs(t1 * u1.x)),
    overAngle: included > WARN_ANGLE + 1e-9,
    over: legs.some(l => l.status === 'over'),
  }
}

// What a gig keeps of its bridles (gig_show.rigging.bridles)
const num = (v, [lo, hi], fallback = null) => {
  const n = clean(v)
  return n === null ? fallback : Math.min(hi, Math.max(lo, n))
}
export function bridlesOf(rigging) {
  return (Array.isArray(rigging?.bridles) ? rigging.bridles : []).filter(b => b && b.id).slice(0, 40).map(b => ({
    id: String(b.id),
    name: String(b.name || '').slice(0, 40),
    mode: b.mode === 'point' ? 'point' : 'legs',
    span: num(b.span, BRIDLE_LIMITS.span, 2),
    rise: num(b.rise, BRIDLE_LIMITS.rise, 0),
    leg1: num(b.leg1, BRIDLE_LIMITS.leg),
    leg2: num(b.leg2, BRIDLE_LIMITS.leg),
    x: num(b.x, [0, 50]),
    depth: num(b.depth, BRIDLE_LIMITS.depth),
    load: num(b.load, BRIDLE_LIMITS.load, 0),
    hw1: b.hw1 ? String(b.hw1) : null,
    hw2: b.hw2 ? String(b.hw2) : null,
  }))
}

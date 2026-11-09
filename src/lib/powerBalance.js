// P2 power assists (docs/TOOLS_PLAN.md §4 and "Decided (2026-11-03)"): a suggestion that places
// loads to balance the phases, or that fills each output up to a reserve of its breaker, always
// shown before it's applied; and inrush groups, which flag where many loads power on at once.
// Estimates for a qualified electrician.
//
// Inrush thresholds: a miniature breaker trips at once between 3 and 5 × its rating (B curve) and
// between 5 and 10 × (C curve) (Hager, catalogue 2019 chapters 446–561, PDF of 2022-04-14, "tripping
// curve: B curve: 3 to 5 In, C curve: 5 to 10 In", IEC 60898-1). The plan doesn't know an output's
// curve, so above 3 × it may trip a B-curve breaker and above 5 × a C-curve one.

import { PHASES, connectorOf, loadCurrents, outputPhaseIdx, powerPlan } from './power'

export const DEFAULT_RESERVE = 80 // % of a breaker the "fill to a reserve" choice fills up to
export const INRUSH_B = 3
export const INRUSH_C = 5

// The supply phases (0-based) each distro's outputs carry: { 'd/o': [k…] }
export function outputPhases(distros, supply) {
  const all = supply.phases === 1 ? [0] : [0, 1, 2]
  const byId = Object.fromEntries(distros.map(d => [d.id, d]))
  const memo = {}
  const feed = (id, seen = new Set()) => {
    if (memo[id]) return memo[id]
    const d = byId[id]
    let idx = all
    if (d?.feed && d.feed !== 'supply' && !seen.has(id)) {
      seen.add(id)
      const parent = byId[d.feed.distro]
      const out = parent?.outputs.find(o => o.id === d.feed.output)
      if (parent && out) idx = outputPhaseIdx(out, feed(parent.id, seen))
    }
    memo[id] = idx
    return idx
  }
  const out = {}
  for (const d of distros) for (const o of d.outputs) out[`${d.id}/${o.id}`] = outputPhaseIdx(o, feed(d.id))
  return out
}

// The distros above a distro, itself first
function chainOf(id, byId) {
  const out = []
  const seen = new Set()
  let cur = byId[id]
  while (cur && !seen.has(cur.id)) {
    out.push(cur.id); seen.add(cur.id)
    cur = cur.feed && cur.feed !== 'supply' ? byId[cur.feed.distro] : null
  }
  return out
}

// The suggestion. mode: 'balance' (each load where the busiest phase stays lowest) or 'reserve'
// (each load on the first output, in order, that stays under the reserve). Nothing goes above the
// reserve on an output, a distro or the supply. Only loads with a figure are placed; with
// movePlugged false, only those not plugged in yet. Outputs of distros not connected to the supply
// aren't used. Without any output, loads go straight on the supply's phases.
// Returns { assign, moves: [{ key, from, to }], unplaced: [key], before, after, plan } where
// before/after are the supply's phase amps and plan the plan worked out with the suggestion.
export function suggestPlacement({ loads, distros, supply, assign, plan, mode = 'balance', reserve = DEFAULT_RESERVE, movePlugged = false }) {
  const limit = Math.min(100, Math.max(10, reserve)) / 100
  const V = supply.volts
  const byId = Object.fromEntries(distros.map(d => [d.id, d]))
  const phasesOf = outputPhases(distros, supply)
  const movable = loads.filter(l => !l.unknown && l.va > 0 && (movePlugged || !assign[l.key]))
  const movingKeys = new Set(movable.map(l => l.key))
  const base = Object.fromEntries(Object.entries(assign).filter(([k]) => !movingKeys.has(k)))
  const basePlan = powerPlan({ supply, distros, loads, assign: base })

  // Running totals from the plan without the loads being placed
  const supplyAmps = [...basePlan.supply.amps]
  const outAmps = {}, distroAmps = {}
  const places = []
  for (const d of distros) {
    const r = basePlan.distros[d.id]
    distroAmps[d.id] = [...r.amps]
    if (r.status !== 'connected') continue
    for (const o of d.outputs) {
      outAmps[`${d.id}/${o.id}`] = [...r.outputs[o.id].amps]
      places.push({ value: { distro: d.id, output: o.id }, key: `${d.id}/${o.id}`, idx: phasesOf[`${d.id}/${o.id}`], three: o.phase === '3P' && phasesOf[`${d.id}/${o.id}`].length > 1, rating: r.outputs[o.id].rating, chain: chainOf(d.id, byId) })
    }
  }
  if (!places.length) {
    const direct = supply.phases === 1 ? [{ phase: 'L1', idx: [0] }] : [...PHASES.map((p, k) => ({ phase: p, idx: [k] })), { phase: '3P', idx: [0, 1, 2], three: true }]
    for (const p of direct) places.push({ value: { phase: p.phase }, key: `p:${p.phase}`, idx: p.idx, three: Boolean(p.three), rating: null, chain: [] })
  }
  const ratingOf = id => basePlan.distros[id]?.rating || null

  const fits = (place, cur) => {
    if (place.rating) { const a = outAmps[place.key]; if (cur.some((c, k) => c && a[k] + c > place.rating * limit)) return false }
    for (const id of place.chain) { const r = ratingOf(id); if (r && cur.some((c, k) => c && distroAmps[id][k] + c > r * limit)) return false }
    return !cur.some((c, k) => c && supplyAmps[k] + c > supply.amps * limit)
  }
  const commit = (place, cur) => {
    for (let k = 0; k < 3; k++) {
      if (!cur[k]) continue
      if (outAmps[place.key]) outAmps[place.key][k] += cur[k]
      for (const id of place.chain) distroAmps[id][k] += cur[k]
      supplyAmps[k] += cur[k]
    }
  }

  const next = { ...base }
  const unplaced = []
  // Biggest first: the small ones fill the gaps
  for (const load of [...movable].sort((a, b) => b.va - a.va || a.key.localeCompare(b.key))) {
    const options = places.filter(p => (load.three ? p.three : !p.three))
    let best = null
    for (const p of options) {
      const cur = loadCurrents(load.va, V, p.idx)
      if (!fits(p, cur)) continue
      if (mode === 'reserve') { best = { p, cur }; break }
      const worst = Math.max(...supplyAmps.map((a, k) => a + cur[k]))
      const ratio = p.rating ? Math.max(...outAmps[p.key].map((a, k) => a + cur[k])) / p.rating : 0
      if (!best || worst < best.worst - 1e-9 || (Math.abs(worst - best.worst) < 1e-9 && ratio < best.ratio)) best = { p, cur, worst, ratio }
    }
    if (!best) {
      unplaced.push(load.key)
      if (assign[load.key]) next[load.key] = assign[load.key]
      continue
    }
    commit(best.p, best.cur)
    next[load.key] = best.p.value
  }

  const same = (a, b) => (!a && !b) || (a && b && a.phase === b.phase && a.distro === b.distro && a.output === b.output)
  const moves = movable.filter(l => !same(assign[l.key], next[l.key])).map(l => ({ key: l.key, from: assign[l.key] || null, to: next[l.key] || null }))
  const after = powerPlan({ supply, distros, loads, assign: next })
  return { assign: next, moves, unplaced, before: plan.supply.amps, after: after.supply.amps, balanceBefore: plan.supply.balance, balanceAfter: after.supply.balance, plan: after }
}

// Inrush per group of loads that power on together: each output (its breaker) and each phase of the
// supply for loads wired straight to it. Returns groups with loads on them, worst first:
//   { key, distro, output, phase, rating, inrush (A, summed peaks), count, missing (loads with no
//     inrush figure), ratio (inrush ÷ rating), state: 'ok' | 'near' (> 3 ×) | 'over' (> 5 ×) }
export function inrushGroups({ loads, distros, supply, assign }) {
  const groups = {}
  const byId = Object.fromEntries(distros.map(d => [d.id, d]))
  for (const l of loads) {
    const a = assign[l.key]
    if (!a) continue
    let key, g
    if (a.distro) {
      const d = byId[a.distro], o = d?.outputs.find(x => x.id === a.output)
      if (!o) continue
      key = `${d.id}/${o.id}`
      g = { key, distro: d.id, output: o.id, phase: null, rating: o.breaker_a || connectorOf(o.connector)?.amps || null }
    } else {
      key = `p:${a.phase}`
      g = { key, distro: null, output: null, phase: a.phase, rating: supply.amps }
    }
    groups[key] ||= { ...g, inrush: 0, count: 0, missing: 0 }
    groups[key].count += 1
    if (l.inrush != null) groups[key].inrush += l.inrush
    else groups[key].missing += 1
  }
  const rank = { over: 0, near: 1, ok: 2 }
  return Object.values(groups).map(g => {
    const ratio = g.rating ? g.inrush / g.rating : 0
    return { ...g, inrush: Math.round(g.inrush * 10) / 10, ratio: Math.round(ratio * 10) / 10, state: ratio > INRUSH_C ? 'over' : ratio > INRUSH_B ? 'near' : 'ok' }
  }).sort((a, b) => rank[a.state] - rank[b.state] || b.ratio - a.ratio)
}

// Warnings for the plan's list (same shape as planWarnings); nameOf(group) gives its place in words
export function inrushWarnings(groups, nameOf) {
  return groups.filter(g => g.state !== 'ok').map(g => ({
    level: 'near', key: g.state === 'over' ? 'power.warn.inrushOver' : 'power.warn.inrushNear',
    vars: { name: nameOf(g), a: g.inrush, count: g.count, x: g.ratio },
  }))
}

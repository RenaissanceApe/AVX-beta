// The packing list per vehicle (step 23, V3; docs/BUSINESS.md, "How the packing list per vehicle
// works"): which cases and items ride in which vehicle on a gig's outward trips, their weight and
// volume against each vehicle's capacity, and a suggested split. Pure functions: the page reads
// gig_load_plan and saves with set_vehicle_loads.
//
// A case travels whole: loading one case loads its contents with it, so the case's weight is its
// own plus its contents', and its volume is its own (the contents are inside). What's on the list
// beyond what the cases hold is loose and can be split freely. Weight or volume nobody entered is
// unknown, never zero: totals add up what's known and count what isn't.

// Volume from free-text dimensions such as "60 x 40 x 50 cm", "600×400×500mm" or "0,6 x 0,4 x 0,5 m".
// Needs three numbers and a unit; anything else gives null (unknown).
const UNIT_TO_M = { mm: 0.001, cm: 0.01, m: 1 }
export function parseDimensionsM3(text) {
  if (!text || typeof text !== 'string') return null
  const m = text.trim().toLowerCase().match(
    /^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/)
  if (!m) return null
  const unit = m[6]
  if ((m[2] && m[2] !== unit) || (m[4] && m[4] !== unit)) return null
  const [a, b, c] = [m[1], m[3], m[5]].map(n => Number(n.replace(',', '.')) * UNIT_TO_M[unit])
  const v = a * b * c
  return v > 0 && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null
}

const known = n => (n === null || n === undefined || n === '' ? null : Number.isFinite(Number(n)) ? Number(n) : null)

// An item's volume: the one entered, else its dimensions, else null
export function itemVolume(item) {
  const v = known(item?.volume_m3)
  return v !== null ? v : parseDimensionsM3(item?.dimensions)
}

// What can be loaded: one group per line. Cases (kind 'case') carry their contents; the rest of a
// line (kind 'item') is the loose part. `count` is how many units there are to place.
//   lines: [{ item_id, item_name, category, quantity, kit_type, weight_kg, volume_m3, dimensions }]
//   parts: [{ case_id, child_id, quantity }]   (contents of the cases on the list)
//   items: { [item_id]: { weight_kg, volume_m3, dimensions, item_name } } for contents not on the list
export function buildGroups(lines, parts = [], items = {}) {
  const byId = Object.fromEntries((lines || []).map(l => [l.item_id, l]))
  const info = id => byId[id] || items[id] || {}
  const contentsOf = {}
  for (const p of parts || []) (contentsOf[p.case_id] ||= []).push({ item_id: p.child_id, quantity: Number(p.quantity) || 1 })
  const inCases = {}
  const groups = []
  for (const l of lines || []) {
    if (l.kit_type !== 'case') continue
    const count = Math.max(0, Math.round(Number(l.quantity) || 0))
    const contents = contentsOf[l.item_id] || []
    for (const c of contents) inCases[c.item_id] = (inCases[c.item_id] || 0) + count * c.quantity
    let kg = known(l.weight_kg)
    for (const c of contents) {
      const w = known(info(c.item_id).weight_kg)
      kg = kg === null || w === null ? null : kg + w * c.quantity
    }
    groups.push({ item_id: l.item_id, name: l.item_name, category: l.category || '', kind: 'case', count, kg, m3: itemVolume(l), contents })
  }
  for (const l of lines || []) {
    if (l.kit_type === 'case') continue
    const count = Math.max(0, Math.round(Number(l.quantity) || 0) - (inCases[l.item_id] || 0))
    if (!count) continue
    groups.push({ item_id: l.item_id, name: l.item_name, category: l.category || '', kind: 'item', count, kg: known(l.weight_kg), m3: itemVolume(l), contents: [] })
  }
  return groups.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'case' ? -1 : 1)
    || (a.category || '￿').localeCompare(b.category || '￿') || String(a.name).localeCompare(String(b.name)))
}

// Loads as stored ([{ trip_id, item_id, quantity }]) to { [trip]: { [item]: qty } }, kept within
// what each group has to place (a line made smaller after loading never shows more than it has)
export function loadsByTrip(rows, groups, tripIds) {
  const left = Object.fromEntries((groups || []).map(g => [g.item_id, g.count]))
  const valid = new Set(tripIds || [])
  const out = Object.fromEntries([...valid].map(id => [id, {}]))
  for (const r of rows || []) {
    if (!valid.has(r.trip_id) || !(r.item_id in left)) continue
    const q = Math.min(left[r.item_id], Math.max(0, Math.round(Number(r.quantity) || 0)))
    if (!q) continue
    out[r.trip_id][r.item_id] = (out[r.trip_id][r.item_id] || 0) + q
    left[r.item_id] -= q
  }
  return out
}

// Back to rows for set_vehicle_loads
export function loadRows(byTrip) {
  const rows = []
  for (const [trip_id, items] of Object.entries(byTrip || {})) {
    for (const [item_id, quantity] of Object.entries(items)) if (quantity > 0) rows.push({ trip_id, item_id, quantity })
  }
  return rows
}

// How many of each group are not in any vehicle yet
export function unassigned(groups, byTrip) {
  const out = {}
  for (const g of groups || []) {
    const placed = Object.values(byTrip || {}).reduce((s, items) => s + (items[g.item_id] || 0), 0)
    if (g.count - placed > 0) out[g.item_id] = g.count - placed
  }
  return out
}

// One vehicle's totals: known kg and m³, how many units have no weight or no volume, and whether
// it's over what it can carry (only where the vehicle's capacity is known)
export function tripTotals(groups, items, vehicle) {
  const byId = Object.fromEntries((groups || []).map(g => [g.item_id, g]))
  let kg = 0, m3 = 0, units = 0, unknownKg = 0, unknownM3 = 0
  for (const [id, q] of Object.entries(items || {})) {
    const g = byId[id]
    if (!g || !q) continue
    units += q
    if (g.kg === null) unknownKg += q; else kg += g.kg * q
    if (g.m3 === null) unknownM3 += q; else m3 += g.m3 * q
  }
  const maxKg = known(vehicle?.max_load_kg)
  const maxM3 = known(vehicle?.volume_m3)
  return {
    kg: round(kg, 1), m3: round(m3, 3), units, unknownKg, unknownM3,
    maxKg, maxM3,
    overKg: maxKg !== null && kg > maxKg,
    overM3: maxM3 !== null && m3 > maxM3,
  }
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d

// How much of a vehicle is used: the fuller of weight and volume, where its capacity is known
function fill(kg, m3, v) {
  const parts = []
  if (v.maxKg) parts.push(kg / v.maxKg)
  if (v.maxM3) parts.push(m3 / v.maxM3)
  return parts.length ? Math.max(...parts) : 0
}

// The suggested split across the chosen trips' vehicles. Cases stay whole (a case is one unit);
// loose items may be spread. Heaviest and bulkiest first, each into the vehicle that ends up least
// full and still within capacity; if none has room, into the least full one, and it's reported
// over. Units with neither weight nor volume go where there are fewest of them so far.
//   trips: [{ id, max_load_kg, volume_m3 }]
// Returns { byTrip, over: [trip ids over capacity], unknownUnits }
export function suggestSplit(groups, trips) {
  const vs = (trips || []).map(t => ({ id: t.id, maxKg: known(t.max_load_kg), maxM3: known(t.volume_m3), kg: 0, m3: 0, blind: 0 }))
  const byTrip = Object.fromEntries(vs.map(v => [v.id, {}]))
  if (!vs.length) return { byTrip, over: [], unknownUnits: 0 }
  // A size to sort by: weight and volume as shares of the whole fleet's capacity (or raw if unknown)
  const fleetKg = vs.reduce((s, v) => s + (v.maxKg || 0), 0)
  const fleetM3 = vs.reduce((s, v) => s + (v.maxM3 || 0), 0)
  const size = g => Math.max(g.kg === null ? 0 : fleetKg ? g.kg / fleetKg : g.kg, g.m3 === null ? 0 : fleetM3 ? g.m3 / fleetM3 : g.m3)
  const order = [...(groups || [])].filter(g => g.count > 0).sort((a, b) => {
    const blindA = a.kg === null && a.m3 === null, blindB = b.kg === null && b.m3 === null
    if (blindA !== blindB) return blindA ? 1 : -1
    return size(b) - size(a) || (a.kind === 'case' ? -1 : 1) - (b.kind === 'case' ? -1 : 1) || String(a.item_id).localeCompare(String(b.item_id))
  })
  let unknownUnits = 0
  for (const g of order) {
    const kg = g.kg || 0, m3 = g.m3 || 0
    const blind = g.kg === null && g.m3 === null
    for (let n = 0; n < g.count; n++) {
      let pick = null
      if (blind) {
        unknownUnits++
        pick = vs.reduce((best, v) => (v.blind < best.blind ? v : best), vs[0])
        pick.blind++
      } else {
        if (g.kg === null || g.m3 === null) unknownUnits++
        let best = null, bestFill = Infinity, any = null, anyFill = Infinity
        for (const v of vs) {
          const f = fill(v.kg + kg, v.m3 + m3, v)
          const fits = (!v.maxKg || v.kg + kg <= v.maxKg + 1e-9) && (!v.maxM3 || v.m3 + m3 <= v.maxM3 + 1e-9)
          // Ties (no capacity known, or equal fill) go to the lighter vehicle so the load spreads
          const tie = (a, b) => a.kg - b.kg || a.m3 - b.m3
          if (fits && (f < bestFill - 1e-12 || (Math.abs(f - bestFill) <= 1e-12 && tie(v, best) < 0))) { best = v; bestFill = f }
          if (f < anyFill - 1e-12 || (Math.abs(f - anyFill) <= 1e-12 && tie(v, any) < 0)) { any = v; anyFill = f }
        }
        pick = best || any
        pick.kg += kg; pick.m3 += m3
      }
      byTrip[pick.id][g.item_id] = (byTrip[pick.id][g.item_id] || 0) + 1
    }
  }
  const over = vs.filter(v => (v.maxKg && v.kg > v.maxKg + 1e-9) || (v.maxM3 && v.m3 > v.maxM3 + 1e-9)).map(v => v.id)
  return { byTrip, over, unknownUnits }
}

// Move some of a group from one place to another (null = not loaded). Returns a new byTrip.
export function moveLoad(byTrip, itemId, from, to, quantity, groups) {
  const next = Object.fromEntries(Object.entries(byTrip || {}).map(([k, v]) => [k, { ...v }]))
  const g = (groups || []).find(x => x.item_id === itemId)
  if (!g || from === to) return next
  const available = from ? (next[from]?.[itemId] || 0) : (unassigned(groups, next)[itemId] || 0)
  const q = Math.max(0, Math.min(available, Math.round(Number(quantity) || 0)))
  if (!q) return next
  if (from) { next[from][itemId] -= q; if (!next[from][itemId]) delete next[from][itemId] }
  if (to) { next[to] ||= {}; next[to][itemId] = (next[to][itemId] || 0) + q }
  return next
}

// What one vehicle carries, item by item, contents of its cases included: for the scan-out filter.
// { [item_id]: units }
export function vehicleItems(groups, items) {
  const byId = Object.fromEntries((groups || []).map(g => [g.item_id, g]))
  const out = {}
  for (const [id, q] of Object.entries(items || {})) {
    const g = byId[id]
    if (!g || !q) continue
    out[id] = (out[id] || 0) + q
    for (const c of g.contents) out[c.item_id] = (out[c.item_id] || 0) + q * c.quantity
  }
  return out
}

// The trips a load can go on: outward (out or one way), with a vehicle, in time order
export function loadTrips(trips) {
  return (trips || []).filter(t => t.vehicle_id && ['out', 'one_way'].includes(t.direction))
    .sort((a, b) => String(a.departs_at).localeCompare(String(b.departs_at)))
}

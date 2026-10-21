// The DMX patch (docs/FIELD_TOOLS.md, F2): each fixture takes `footprint` channels from its
// start address on its universe (1–512). Overlaps are warnings, not errors: sometimes two
// fixtures share an address on purpose.

export const UNIVERSE_SIZE = 512

export const endAddress = f => (f.address ? f.address + f.footprint - 1 : null)

// "U1 · 1–14", or "U2 · not addressed"
export const dmxRange = (f, notSet = '—') => (f.address ? `${f.address}–${endAddress(f)}` : notSet)

// The ids of fixtures whose channels overlap another's on the same universe
export function overlaps(fixtures) {
  const bad = new Set()
  const byUniverse = {}
  for (const f of fixtures || []) if (f.address) (byUniverse[f.universe] ||= []).push(f)
  for (const list of Object.values(byUniverse)) {
    list.sort((a, b) => a.address - b.address)
    let reach = null
    for (const f of list) {
      if (reach && f.address <= endAddress(reach)) { bad.add(f.id); bad.add(reach.id) }
      if (!reach || endAddress(f) > endAddress(reach)) reach = f
    }
  }
  return bad
}

// The first address on a universe where `footprint` channels fit without overlapping, or null
export function nextFree(fixtures, universe, footprint) {
  const used = (fixtures || []).filter(f => f.universe === universe && f.address).sort((a, b) => a.address - b.address)
  let at = 1
  for (const f of used) {
    if (at + footprint - 1 < f.address) break
    at = Math.max(at, endAddress(f) + 1)
  }
  return at + footprint - 1 <= UNIVERSE_SIZE ? at : null
}

// Readdress fixtures one after another from `start` on `universe`, moving on to the next
// universe when one is full. Returns [{ id, universe, address }].
export function packAddresses(fixtures, { universe = 1, start = 1 } = {}) {
  let u = universe, at = start
  return (fixtures || []).map(f => {
    if (at + f.footprint - 1 > UNIVERSE_SIZE) { u += 1; at = 1 }
    const row = { id: f.id, universe: u, address: at }
    at += f.footprint
    return row
  })
}

// New fixtures of one type: "Spot 1", "Spot 2"… each on the next free address (on the next
// universes if needed). Returns rows to insert (without gig_id).
export function bulkFixtures(existing, { name, fixture_type, mode, footprint, universe = 1, count = 1, position, item_id }) {
  const placed = [...(existing || [])]
  const rows = []
  for (let i = 1; i <= count; i++) {
    let u = universe, address = nextFree(placed, u, footprint)
    while (address === null && u < 256) { u += 1; address = nextFree(placed, u, footprint) }
    const row = { name: count > 1 ? `${name} ${i}` : name, fixture_type, mode: mode || null, footprint, universe: u, address, position: position || null, item_id: item_id || null }
    rows.push(row)
    placed.push({ ...row, id: `new${i}` })
  }
  return rows
}

// Per universe: how many channels are used and by how many fixtures
export function universeUse(fixtures) {
  const out = {}
  for (const f of fixtures || []) {
    const u = (out[f.universe] ||= { universe: f.universe, channels: 0, fixtures: 0 })
    u.fixtures += 1
    if (f.address) u.channels += f.footprint
  }
  return Object.values(out).sort((a, b) => a.universe - b.universe)
}

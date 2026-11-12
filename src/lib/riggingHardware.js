// Rigging hardware list (docs/TOOLS_PLAN.md §5, RG2): the shackles, slings, steels and spansets a
// gig uses, each with its WLL as marked on its tag or in the manufacturer's data (never a default).
// Kept in gig_show.rigging.hardware; bridle legs pick their weakest piece from it.

export const HARDWARE_KINDS = ['shackle', 'sling', 'steel', 'spanset', 'other']
export const HARDWARE_LIMITS = { items: 60, qty: [0, 9999], wll_kg: [1, 100000] }

// Names in the gig's equipment that look like rigging hardware (English and Portuguese)
const KIND_RE = [
  ['shackle', /shackle|manilha|grillete/i],
  ['spanset', /spanset|span set|round ?sling|cinta|eslinga/i],
  ['steel', /\bsteel\b|steels|wire rope|cabo de a[cç]o|estropo|\bgss\b|secondary|safety (cable|wire)|cabo de seguran[cç]a/i],
  ['sling', /\bsling|\blinga\b/i],
]
export function hardwareKind(name) {
  for (const [kind, re] of KIND_RE) if (re.test(name || '')) return kind
  return null
}
export const looksLikeHardware = name => hardwareKind(name) !== null

const num = (v, [lo, hi]) => {
  const n = v === null || v === undefined || v === '' ? NaN : Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
}

export function hardwareOf(rigging) {
  return (Array.isArray(rigging?.hardware) ? rigging.hardware : []).filter(h => h && h.id).slice(0, HARDWARE_LIMITS.items).map(h => ({
    id: String(h.id),
    kind: HARDWARE_KINDS.includes(h.kind) ? h.kind : 'other',
    name: String(h.name || '').slice(0, 80),
    wll_kg: num(h.wll_kg, HARDWARE_LIMITS.wll_kg),
    qty: num(h.qty, HARDWARE_LIMITS.qty) ?? 1,
    item_id: h.item_id ? String(h.item_id) : null,
    source: String(h.source || '').slice(0, 120),
  }))
}

// How many of each hardware piece the gig's bridles use (one per leg that picks it)
export function hardwareInUse(bridles) {
  const out = {}
  for (const b of bridles || []) for (const id of [b.hw1, b.hw2]) if (id) out[id] = (out[id] || 0) + 1
  return out
}

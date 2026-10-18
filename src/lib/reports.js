import { normalizeBody, lineTotal, round2 } from './quotes'
import { bookValue } from './inventory'

// Inventory reports (docs/INVENTORY.md, I7): use, revenue, repairs, losses and value per
// item over a period, worked out from what admins and members can already read.

const DAY = 24 * 60 * 60 * 1000

// A Postgres tstzrange as text ('["2026-11-12 00:00:00+00","2026-11-16 00:00:00+00")') → dates
export function parseRange(text) {
  const m = /^[[(]"?([^",]*)"?,"?([^")]*)"?[)\]]$/.exec(String(text || '').trim())
  if (!m) return null
  const iso = v => v.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')
  const from = new Date(iso(m[1]))
  const until = new Date(iso(m[2]))
  return Number.isNaN(from.getTime()) || Number.isNaN(until.getTime()) ? null : { from, until }
}

// Days two ranges overlap (fractions count)
export const overlapDays = (a, b) => Math.max(0, (Math.min(a.until, b.until) - Math.max(a.from, b.from)) / DAY)

// What a quote earned per catalogue item: each line's total, less its phase's and the
// quote's discounts. Optional phases weren't sold, so they don't count.
export function quoteItemRevenue(quote) {
  const out = {}
  const quoteFactor = 1 - Math.min(100, Math.max(0, Number(quote.discount_pct) || 0)) / 100
  for (const p of normalizeBody(quote.body).phases) {
    if (p.optional) continue
    const factor = quoteFactor * (1 - p.discount_pct / 100)
    for (const s of p.sections) for (const l of s.lines) {
      if (!l.item_id) continue
      out[l.item_id] = round2((out[l.item_id] || 0) + lineTotal(l) * factor)
    }
  }
  return out
}

const add = (map, id, key, n) => {
  map[id] ||= {}
  map[id][key] = (map[id][key] || 0) + n
}

// One row per stock-tracked item, and totals.
//   items: catalogue rows; owned: item_id -> count now; units: stock_units rows;
//   reservations: equipment reservations { resource_id, quantity, period, gig_id };
//   quotes: accepted quotes { body, discount_pct }; repairs: { item_id, quantity, cost, charge_client };
//   movements: { item_id, kind, quantity }; subrentals: with lines { item_id, quantity, unit_cost }
export function inventoryReport({ items = [], owned = {}, units = [], reservations = [], quotes = [], repairs = [], movements = [], subrentals = [], from, until, today = new Date() }) {
  const span = { from: new Date(from), until: new Date(Math.min(new Date(until), today)) }
  const days = Math.max(0, (span.until - span.from) / DAY)
  const by = {}

  for (const r of reservations) {
    const range = typeof r.period === 'string' ? parseRange(r.period) : r.period
    if (!range) continue
    const d = overlapDays(range, span)
    if (d > 0) add(by, r.resource_id, 'unitDays', d * (r.quantity || 0))
    if (range.from <= today) {
      const last = by[r.resource_id]?.lastUsed
      if (!last || range.from > last) { by[r.resource_id] ||= {}; by[r.resource_id].lastUsed = range.from }
    }
    if (overlapDays(range, { from: new Date(from), until: new Date(until) }) > 0 && r.gig_id) {
      by[r.resource_id] ||= {}
      ;(by[r.resource_id].gigs ||= new Set()).add(r.gig_id)
    }
  }
  for (const q of quotes) for (const [id, amount] of Object.entries(quoteItemRevenue(q))) add(by, id, 'revenue', amount)
  for (const r of repairs) {
    add(by, r.item_id, 'repairs', 1)
    add(by, r.item_id, 'repairCost', Number(r.cost) || 0)
    if (r.charge_client) add(by, r.item_id, 'charged', Number(r.cost) || 0)
  }
  for (const m of movements) {
    if (m.kind === 'lost') add(by, m.item_id, 'lost', m.quantity || 0)
    if (m.kind === 'found') add(by, m.item_id, 'lost', -(m.quantity || 0))
  }
  for (const s of subrentals) for (const l of s.lines || []) {
    if (l.item_id) add(by, l.item_id, 'hiredIn', (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))
  }
  for (const u of units) {
    if (u.status === 'lost' || u.status === 'retired') continue
    const v = bookValue(u, today)
    if (v != null) add(by, u.item_id, 'bookValue', v)
    if (u.purchase_cost != null) add(by, u.item_id, 'cost', Number(u.purchase_cost) || 0)
  }

  const rows = items.filter(i => i.tracking !== 'none').map(i => {
    const b = by[i.id] || {}
    const n = owned[i.id] || 0
    const use = n > 0 && days > 0 ? Math.min(1, (b.unitDays || 0) / (n * days)) : 0
    const lost = Math.max(0, b.lost || 0)
    return {
      id: i.id, name: i.name, category: i.category, owned: n, use, gigs: b.gigs?.size || 0, lastUsed: b.lastUsed || null,
      revenue: round2(b.revenue || 0), repairs: b.repairs || 0, repairCost: round2(b.repairCost || 0), charged: round2(b.charged || 0),
      lost, lostValue: round2(lost * (Number(i.replacement_value) || 0)), hiredIn: round2(b.hiredIn || 0),
      bookValue: round2(b.bookValue || 0), cost: round2(b.cost || 0),
      returnOnCost: b.cost ? (b.revenue || 0) / b.cost : null,
      idle: n > 0 && !(b.unitDays > 0),
    }
  })
  const sum = key => round2(rows.reduce((s, r) => s + (r[key] || 0), 0))
  return {
    rows, days: Math.round(days),
    totals: {
      revenue: sum('revenue'), repairCost: sum('repairCost'), charged: sum('charged'), lostValue: sum('lostValue'),
      hiredIn: sum('hiredIn'), bookValue: sum('bookValue'), idle: rows.filter(r => r.idle).length,
    },
  }
}

// The report as CSV (semicolon-separated, which spreadsheets in Portugal open directly)
export function reportCsv(rows, headers) {
  const cell = v => {
    const s = v == null ? '' : typeof v === 'number' ? String(Math.round(v * 100) / 100).replace('.', ',') : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(h => cell(h.label)).join(';'), ...rows.map(r => headers.map(h => cell(h.value(r))).join(';'))].join('\n')
}

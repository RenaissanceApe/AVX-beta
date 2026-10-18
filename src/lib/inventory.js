// Inventory helpers (pure, unit tested). The database keeps the ledger and works out
// stock_levels; these turn that into what the screens show. See docs/INVENTORY.md.
import { parsePrice } from './quotes'

export const TRACKING = ['none', 'bulk', 'serial']
export const STOCK_KINDS = ['rental', 'sale'] // price list kinds that can have stock
export const LOCATION_KINDS = ['warehouse', 'vehicle', 'site', 'other']
export const UNIT_STATUSES = ['available', 'repair', 'lost', 'retired']
export const DEFAULT_DEPRECIATION_MONTHS = 60

// Bulk movements people record, and which locations each one needs
export const MOVEMENT_SHAPES = {
  purchase: { from: false, to: true },
  found: { from: false, to: true },
  transfer: { from: true, to: true },
  sale: { from: true, to: false },
  lost: { from: true, to: false },
  retire: { from: true, to: false },
}

// stock_levels rows → { itemId: { total, inRepair, byLocation: { locationId|'none': qty } } }
export function levelsByItem(levels) {
  const map = {}
  for (const row of levels || []) {
    const entry = (map[row.item_id] ||= { total: 0, inRepair: 0, byLocation: {} })
    entry.total += row.quantity
    entry.inRepair += row.in_repair || 0
    entry.byLocation[row.location_id || 'none'] = (entry.byLocation[row.location_id || 'none'] || 0) + row.quantity
  }
  return map
}

export const isLowStock = (item, total) =>
  item.tracking !== 'none' && item.min_stock != null && (total || 0) < item.min_stock

// A stock count: the correction that brings the books in line with what was counted
export function countCorrection(current, counted) {
  const diff = Math.round(counted) - Math.round(current || 0)
  if (!Number.isFinite(diff) || diff === 0) return null
  return diff > 0 ? { direction: 'in', quantity: diff } : { direction: 'out', quantity: -diff }
}

// Straight-line book value of a unit on a date (null without a purchase cost)
export function bookValue(unit, on = new Date()) {
  const cost = Number(unit.purchase_cost)
  if (unit.purchase_cost == null || !Number.isFinite(cost)) return null
  if (!unit.purchase_date) return cost
  const start = new Date(`${unit.purchase_date}T00:00:00`)
  const months = (on.getFullYear() - start.getFullYear()) * 12 + (on.getMonth() - start.getMonth())
    - (on.getDate() < start.getDate() ? 1 : 0)
  const life = unit.depreciation_months || DEFAULT_DEPRECIATION_MONTHS
  const left = Math.min(1, Math.max(0, 1 - Math.max(0, months) / life))
  return Math.round(cost * left * 100) / 100
}

// Lines pasted from a spreadsheet: name; category; code; quantity; price; location
// (tab or ; separated; only the name is required). Lines starting with # are skipped.
export function parseStockImport(text) {
  const rows = []
  const errors = []
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const [name, category, code, qty, price, location] = line.split(/\t|;/).map(p => p.trim())
    const quantity = qty ? Number(qty.replace(/\s/g, '')) : 0
    const unitPrice = price ? parsePrice(price) : null
    const codeOk = !code || /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(code)
    if (!name || !Number.isInteger(quantity) || quantity < 0 || quantity > 100000 || !codeOk
        || (unitPrice != null && (!Number.isFinite(unitPrice) || unitPrice < 0))) return errors.push(i + 1)
    rows.push({
      name: name.slice(0, 200), category: category ? category.slice(0, 80) : null, code: code || null,
      quantity, unit_price: unitPrice, location: location ? location.slice(0, 100) : null,
    })
  })
  return { rows, errors }
}

// Match an import row to an existing item: by code first, then by name (case-insensitive)
export function matchItem(items, row) {
  const code = row.code?.toUpperCase()
  if (code) {
    const byCode = items.find(i => (i.code || '').toUpperCase() === code)
    if (byCode) return byCode
  }
  const name = row.name.toLowerCase()
  return items.find(i => i.name.toLowerCase() === name) || null
}

// What a label's QR code opens: the scan page, which finds the item or unit
export const scanUrl = (origin, code) => `${origin.replace(/\/$/, '')}/scan/${encodeURIComponent(code)}`

// Label sheets (A4): small address labels or bigger case labels
export const LABEL_SIZES = {
  small: { cols: 3, widthMm: 63.5, heightMm: 38.1, qrMm: 28 },
  large: { cols: 2, widthMm: 99.1, heightMm: 67.7, qrMm: 50 },
}

// ── Availability (I2) ────────────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0')
const isoDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// When a gig's equipment is out: its days in local time, widened by the organisation's
// prep and return days (mirrors private.equipment_period). Null without dates.
export function equipmentWindow(gig, org = {}) {
  if (!gig?.start_date) return null
  const last = gig.end_date && gig.end_date >= gig.start_date ? gig.end_date : gig.start_date
  const from = new Date(`${gig.start_date}T00:00:00`)
  from.setDate(from.getDate() - (org.equipment_prep_days || 0))
  const until = new Date(`${last}T00:00:00`)
  until.setDate(until.getDate() + 1 + (org.equipment_return_days || 0))
  return { from: from.toISOString(), until: until.toISOString() }
}

// Same for a quote's dates ({ from, until } as YYYY-MM-DD, inclusive)
export const quoteWindow = (dates, org) => (dates ? equipmentWindow({ start_date: dates.from, end_date: dates.until }, org) : null)

export const shortBy = line => Math.max(0, (line.quantity || 0) - Math.max(0, line.available ?? 0))

// Free units per day: what you own minus the busiest moment of each day's bookings.
// bookings: [{ starts_at, ends_at, quantity }]
export function dailyAvailability(owned, bookings, startDate, days) {
  const list = (bookings || []).map(b => ({ from: new Date(b.starts_at), until: new Date(b.ends_at), qty: b.quantity || 0 }))
  const out = []
  const day = new Date(`${startDate}T00:00:00`)
  for (let i = 0; i < days; i++) {
    const start = new Date(day)
    const end = new Date(day); end.setDate(end.getDate() + 1)
    const today = list.filter(b => b.from < end && b.until > start)
    const points = [start, ...today.map(b => b.from).filter(t => t > start && t < end)]
    const booked = Math.max(0, ...points.map(p => today.filter(b => b.from <= p && b.until > p).reduce((s, b) => s + b.qty, 0)))
    out.push({ day: isoDay(start), booked, free: owned - booked })
    day.setDate(day.getDate() + 1)
  }
  return out
}

// ── Warehouse (I3) ───────────────────────────────────────────────────────────
const CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

// What a scan read: our labels hold a /scan/<code> address; other barcodes hold the code
export function codeFromScan(text) {
  const raw = String(text || '').trim()
  const fromUrl = /\/scan\/([^/?#\s]+)/.exec(raw)
  let code = raw
  if (fromUrl) { try { code = decodeURIComponent(fromUrl[1]) } catch { code = fromUrl[1] } }
  return CODE.test(code) ? code : null
}

// A gig's dispatch summary rows → how far packing (out) and returning (back) have got
export function dispatchProgress(rows) {
  const lines = (rows || []).filter(r => r.planned > 0)
  const sum = key => lines.reduce((s, r) => s + (r[key] || 0), 0)
  const planned = sum('planned')
  const out = lines.reduce((s, r) => s + Math.min(r.out_qty || 0, r.planned), 0)
  const back = (rows || []).reduce((s, r) => s + Math.min(r.back_qty || 0, r.out_qty || 0), 0)
  const outTotal = (rows || []).reduce((s, r) => s + (r.out_qty || 0), 0)
  return {
    planned, out, outTotal, back,
    toPack: lines.filter(r => (r.out_qty || 0) < r.planned).length,
    notBack: (rows || []).filter(r => (r.back_qty || 0) < (r.out_qty || 0)).length,
  }
}

// ── Kits (I4) ────────────────────────────────────────────────────────────────
export const KIT_TYPES = ['set', 'case']
const MAX_KIT_DEPTH = 8

// What planning brings along. picks: item_id -> the quantity wanted; existing: item_id ->
// quantity already on the gig; parts: item_parts rows; items: item_id -> { kit_type }.
// Only an increase brings contents and accessories (a set is never a line itself: it
// becomes its contents). Returns the lines to save (item_id -> new quantity) and what
// came along (item_id -> quantity added).
export function expandPlan(picks, existing = {}, parts = [], items = {}) {
  const byParent = new Map()
  for (const p of parts) (byParent.get(p.parent_id) || byParent.set(p.parent_id, []).get(p.parent_id)).push(p)
  const added = {}
  const walk = (id, n, depth) => {
    if (n <= 0 || depth > MAX_KIT_DEPTH) return
    for (const p of byParent.get(id) || []) {
      const m = n * (p.quantity || 1)
      if (items[p.child_id]?.kit_type !== 'set') added[p.child_id] = (added[p.child_id] || 0) + m
      walk(p.child_id, m, depth + 1)
    }
  }
  const lines = {}
  for (const [id, raw] of Object.entries(picks)) {
    const qty = Math.max(0, Math.round(Number(raw) || 0))
    const isSet = items[id]?.kit_type === 'set'
    walk(id, isSet ? qty : qty - (existing[id] || 0), 0)
    if (!isSet && qty > 0) lines[id] = qty
  }
  for (const [id, n] of Object.entries(added)) lines[id] = (lines[id] ?? existing[id] ?? 0) + n
  for (const id of Object.keys(lines)) {
    lines[id] = Math.min(100000, lines[id])
    if (lines[id] === existing[id]) delete lines[id]
  }
  return { lines, added }
}

// How many of a set (or case with its contents) could go out, from what's free per item
// (item_id -> { available }). Null when nothing inside is known.
export function kitsFree(itemId, parts, items, free) {
  const { added } = expandPlan({ [itemId]: 1 }, {}, parts, { ...items, [itemId]: { kit_type: 'set' } })
  const counts = Object.entries(added).filter(([id]) => free[id]).map(([id, need]) => Math.floor(Math.max(0, free[id].available) / need))
  return counts.length ? Math.min(...counts) : null
}

// The other item of each alternative pair an item is in
export const alternativesOf = (itemId, pairs) =>
  (pairs || []).flatMap(p => (p.item_a === itemId ? [p.item_b] : p.item_b === itemId ? [p.item_a] : []))

// "3 × Clamp, 2 × Cable" for what came along
export const broughtList = (added, items) =>
  Object.entries(added).map(([id, n]) => `${n} × ${items[id]?.name || '…'}`).join(', ')

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

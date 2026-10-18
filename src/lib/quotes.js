// Quote content and maths. A quote body is phases → sections → lines (see
// supabase/migrations/20261019000000_quotes.sql). Everything here is pure, so the
// editor, the printed quote and the tests all price a quote the same way.

export const LINE_KINDS = ['rental', 'sale', 'crew', 'transport', 'other', 'comment']
export const PRICED_KINDS = LINE_KINDS.filter(k => k !== 'comment')
export const UNITS = ['unit', 'day', 'hour', 'km', 'set', 'lump']
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined']

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}
const clampPct = v => Math.min(100, Math.max(0, num(v)))
export const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100

export const emptyLine = (kind = 'rental') => ({
  id: newId(), kind, description: '', details: '', qty: 1,
  unit: kind === 'crew' ? 'day' : kind === 'transport' ? 'km' : 'unit', factor: 1, unit_price: 0, discount_pct: 0,
})
export const emptySection = (name = '') => ({ id: newId(), name, lines: [] })
export const emptyPhase = (name = '') => ({
  id: newId(), name, start_date: null, end_date: null, start_time: null, end_time: null, discount_pct: 0, optional: false, sections: [emptySection()],
})

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const cleanTime = v => (typeof v === 'string' && TIME.test(v.slice(0, 5)) ? v.slice(0, 5) : null)

// Fill in anything missing so older or hand-edited bodies never crash the editor.
export function normalizeBody(body) {
  const phases = Array.isArray(body?.phases) ? body.phases : []
  return {
    phases: phases.map(p => ({
      id: p.id || newId(),
      name: p.name ?? '',
      start_date: p.start_date || null,
      end_date: p.end_date || null,
      start_time: cleanTime(p.start_time),
      end_time: cleanTime(p.end_time),
      discount_pct: clampPct(p.discount_pct),
      optional: !!p.optional,
      sections: (Array.isArray(p.sections) ? p.sections : []).map(s => ({
        id: s.id || newId(),
        name: s.name ?? '',
        lines: (Array.isArray(s.lines) ? s.lines : []).map(l => ({
          id: l.id || newId(),
          kind: LINE_KINDS.includes(l.kind) ? l.kind : 'other',
          description: l.description ?? '',
          details: l.details ?? '',
          qty: num(l.qty, 1),
          unit: UNITS.includes(l.unit) ? l.unit : 'unit',
          factor: num(l.factor, 1),
          unit_price: num(l.unit_price),
          discount_pct: clampPct(l.discount_pct),
        })),
      })),
    })),
  }
}

// qty × factor (days, hours…) × unit price, less the line discount. Comments cost nothing.
export function lineTotal(line) {
  if (line.kind === 'comment') return 0
  return round2(num(line.qty) * num(line.factor, 1) * num(line.unit_price) * (1 - clampPct(line.discount_pct) / 100))
}

export const sectionTotal = section => round2(section.lines.reduce((sum, l) => sum + lineTotal(l), 0))

export function phaseTotals(phase) {
  const gross = round2(phase.sections.reduce((sum, s) => sum + sectionTotal(s), 0))
  const discount = round2(gross * clampPct(phase.discount_pct) / 100)
  return { gross, discount, net: round2(gross - discount) }
}

// Whole-quote totals. Optional phases are priced but not added to the total
// (shown on the quote as options, like Rentman's "not in financial" subprojects).
export function quoteTotals(quote) {
  const body = normalizeBody(quote.body)
  const byKind = Object.fromEntries(PRICED_KINDS.map(k => [k, 0]))
  const phases = body.phases.map(p => {
    const totals = phaseTotals(p)
    if (!p.optional) {
      for (const s of p.sections) for (const l of s.lines) if (l.kind !== 'comment') byKind[l.kind] = round2(byKind[l.kind] + lineTotal(l))
    }
    return { id: p.id, optional: p.optional, ...totals }
  })
  const subtotal = round2(phases.filter(p => !p.optional).reduce((sum, p) => sum + p.net, 0))
  const discount = round2(subtotal * clampPct(quote.discount_pct) / 100)
  const net = round2(subtotal - discount)
  const vat = round2(net * Math.min(100, Math.max(0, num(quote.vat_rate))) / 100)
  const optional = round2(phases.filter(p => p.optional).reduce((sum, p) => sum + p.net, 0))
  return { byKind, phases, subtotal, discount, net, vat, total: round2(net + vat), optional }
}

// Templates keep the structure and prices but not dates; every id is fresh so a
// template can be inserted into the same quote more than once.
export function cloneBody(body, { keepDates = false } = {}) {
  const b = normalizeBody(body)
  return {
    phases: b.phases.map(p => ({
      ...p,
      id: newId(),
      start_date: keepDates ? p.start_date : null,
      end_date: keepDates ? p.end_date : null,
      start_time: keepDates ? p.start_time : null,
      end_time: keepDates ? p.end_time : null,
      sections: p.sections.map(s => ({ ...s, id: newId(), lines: s.lines.map(l => ({ ...l, id: newId() })) })),
    })),
  }
}

// Earliest start and latest end over all phases (for "create gig from quote").
export function quoteDateRange(body) {
  const phases = normalizeBody(body).phases
  const starts = phases.map(p => p.start_date).filter(Boolean).sort()
  const ends = phases.map(p => p.end_date || p.start_date).filter(Boolean).sort()
  return { start: starts[0] || null, end: ends[ends.length - 1] || null }
}

// Everything the client sees on a quote. A version (and the copy sent to a client)
// freezes these fields plus the body; restoring a version puts them back.
export const SNAPSHOT_FIELDS = [
  'title', 'language', 'currency', 'client_name', 'client_company', 'client_email', 'client_address', 'client_tax_id',
  'issue_date', 'valid_until', 'intro', 'terms', 'vat_rate', 'discount_pct', 'show_line_prices', 'payment_terms', 'manager_name',
]

export function quoteSnapshot(quote, body) {
  return {
    ...Object.fromEntries(SNAPSHOT_FIELDS.map(k => [k, quote[k] ?? null])),
    number: quote.number,
    body: normalizeBody(body ?? quote.body),
  }
}

// The editable fields of a snapshot, for restoring it into the live quote
export function snapshotFields(snapshot) {
  return Object.fromEntries(SNAPSHOT_FIELDS.filter(k => k in (snapshot || {})).map(k => [k, snapshot[k]]))
}

const MAX_PLAN_DAYS = 31
const pad2 = n => String(n).padStart(2, '0')
function isoDays(start, end) {
  const days = []
  const d = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end && end > start ? end : start}T00:00:00Z`)
  while (d <= last && days.length < MAX_PLAN_DAYS) {
    days.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return days
}

// What an accepted quote adds to its gig:
// - schedule: one item per day of each dated, non-optional phase (the phase's start
//   time on its first day, 09:00 otherwise; its end time on its last day)
// - positions: crew lines of non-optional phases, merged by description. Quantity is
//   the most needed at once in any phase (qty, or 1 for lines priced per hour, km or
//   lump sum). The person filling the gig can adjust everything before it's added.
export function quoteToGigPlan(body) {
  const phases = normalizeBody(body).phases.filter(p => !p.optional)
  const schedule = []
  for (const p of phases) {
    if (!p.start_date) continue
    const days = isoDays(p.start_date, p.end_date)
    days.forEach((day, i) => {
      const last = i === days.length - 1
      schedule.push({
        day,
        start_time: (i === 0 && p.start_time) || '09:00',
        end_time: last && p.end_time && (days.length > 1 || !p.start_time || p.end_time > p.start_time) ? p.end_time : null,
        phase: p.name.trim(),
        dayIndex: i + 1,
        dayCount: days.length,
      })
    })
  }
  const positions = new Map()
  for (const p of phases) {
    for (const s of p.sections) {
      for (const l of s.lines) {
        const title = l.description.trim().slice(0, 120)
        if (l.kind !== 'crew' || !title) continue
        const people = !['hour', 'km', 'lump'].includes(l.unit) ? Math.min(99, Math.max(1, Math.round(num(l.qty, 1)))) : 1
        const key = title.toLowerCase()
        const pos = positions.get(key) || { title, quantity: 0, phases: [] }
        pos.quantity = Math.max(pos.quantity, people)
        if (p.name.trim() && !pos.phases.includes(p.name.trim())) pos.phases.push(p.name.trim())
        positions.set(key, pos)
      }
    }
  }
  return { schedule, positions: [...positions.values()] }
}

// Dates as YYYY-MM-DD in the device's time zone (toISOString would use UTC)
export function localISODate(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localISODate(d)
}

// "Q0012" by default; with an empty prefix just the number ("143"), for organisations
// carrying on an existing numbering.
export const quoteNumber = (q, prefix = 'Q') => (prefix ? `${prefix}${String(q.number ?? 0).padStart(4, '0')}` : String(q.number ?? 0))

// Totals grouped the way client quotes usually present them
export const PRINT_GROUPS = [
  { key: 'equipment', kinds: ['rental', 'sale'] },
  { key: 'crew', kinds: ['crew'] },
  { key: 'transport', kinds: ['transport'] },
  { key: 'other', kinds: ['other'] },
]
export function groupTotals(byKind) {
  return PRINT_GROUPS.map(g => ({ key: g.key, amount: round2(g.kinds.reduce((sum, k) => sum + (byKind[k] || 0), 0)) }))
}

// Terms text → blocks: lines like "3. Availability" become headings, blank lines split paragraphs
export function termsBlocks(text) {
  return (text || '').split(/\n\s*\n|\n(?=\d{1,2}\.\s+\S)/).map(b => b.trim()).filter(Boolean).flatMap(block => {
    const m = block.match(/^(\d{1,2}\.\s+[^\n]+)\n?([\s\S]*)$/)
    if (!m) return [{ type: 'p', text: block }]
    return [{ type: 'h', text: m[1].trim() }, ...(m[2].trim() ? [{ type: 'p', text: m[2].trim() }] : [])]
  })
}

const LOCALES = { pt: 'pt-PT', en: 'en-GB' }
export function formatMoney(amount, currency = 'EUR', lang = 'pt') {
  try {
    return new Intl.NumberFormat(LOCALES[lang] || 'pt-PT', { style: 'currency', currency }).format(num(amount))
  } catch {
    return `${num(amount).toFixed(2)} ${currency}`
  }
}
export function formatNumber(value, lang = 'pt') {
  return new Intl.NumberFormat(LOCALES[lang] || 'pt-PT', { maximumFractionDigits: 2 }).format(num(value))
}

// Move an item in a list (for the up/down buttons in the editor)
export function move(list, index, delta) {
  const to = index + delta
  if (to < 0 || to >= list.length) return list
  const next = list.slice()
  const [item] = next.splice(index, 1)
  next.splice(to, 0, item)
  return next
}

// Price list import: one item per line, "name; price; category; type; unit" (tabs from a
// spreadsheet work too). Only name and price are required. Prices accept "1 234,50" or "1234.50".
const KIND_WORDS = {
  rental: 'rental', aluguer: 'rental', sale: 'sale', venda: 'sale', crew: 'crew', equipa: 'crew',
  transport: 'transport', transporte: 'transport', other: 'other', outros: 'other', outro: 'other',
}
const UNIT_WORDS = {
  unit: 'unit', un: 'unit', 'un.': 'unit', pc: 'unit', pcs: 'unit', day: 'day', days: 'day', dia: 'day', dias: 'day',
  hour: 'hour', hours: 'hour', h: 'hour', hr: 'hour', hrs: 'hour', km: 'km', set: 'set', sets: 'set', 'conj.': 'set',
  conj: 'set', lump: 'lump', global: 'lump',
}
export function parsePrice(text) {
  const s = String(text ?? '').replace(/[€$£\s]/g, '').replace(/[^\d,.-]/g, '')
  if (!s) return NaN
  // The last separator is the decimal one; others are thousands separators
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
  const normalized = last === -1 ? s : s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1)
  return parseFloat(normalized)
}
export function parsePriceImport(text, defaultKind = 'rental') {
  const items = []
  const errors = []
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const parts = line.split(/\t|;/).map(p => p.trim())
    const [name, price, category, kind, unit] = parts
    const unitPrice = parsePrice(price)
    if (!name || !Number.isFinite(unitPrice) || unitPrice < 0) return errors.push(i + 1)
    items.push({
      name: name.slice(0, 200),
      unit_price: round2(unitPrice),
      category: category ? category.slice(0, 80) : null,
      kind: KIND_WORDS[(kind || '').toLowerCase()] || defaultKind,
      unit: UNIT_WORDS[(unit || '').toLowerCase()] || 'unit',
    })
  })
  return { items, errors }
}

// A price list item as a quote line
export const lineFromPriceItem = item => ({
  ...emptyLine(item.kind), description: item.name, details: item.details || '', unit: item.unit, unit_price: Number(item.unit_price) || 0,
})

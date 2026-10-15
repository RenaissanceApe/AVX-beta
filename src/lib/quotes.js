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
  id: newId(), name, start_date: null, end_date: null, discount_pct: 0, optional: false, sections: [emptySection()],
})

// Fill in anything missing so older or hand-edited bodies never crash the editor.
export function normalizeBody(body) {
  const phases = Array.isArray(body?.phases) ? body.phases : []
  return {
    phases: phases.map(p => ({
      id: p.id || newId(),
      name: p.name ?? '',
      start_date: p.start_date || null,
      end_date: p.end_date || null,
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
      sections: p.sections.map(s => ({ ...s, id: newId(), lines: s.lines.map(l => ({ ...l, id: newId() })) })),
    })),
  }
}

// Earliest start and latest end over all phases (for "create gig from quote").
export function quoteDateRange(body) {
  const starts = normalizeBody(body).phases.map(p => p.start_date).filter(Boolean).sort()
  const ends = normalizeBody(body).phases.map(p => p.end_date || p.start_date).filter(Boolean).sort()
  return { start: starts[0] || null, end: ends[ends.length - 1] || null }
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

export const quoteNumber = q => `Q${String(q.number ?? 0).padStart(4, '0')}`

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

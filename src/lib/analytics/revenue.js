import { normalizeBody, lineTotal, round2 } from '../quotes'

// The revenue rule (docs/ANALYTICS.md, "Definitions"). Its twin in the database is
// public.report_revenue_lines (supabase/migrations/20261220000000_reports_k1.sql); both are
// checked against the same fixtures (fixtures.json) by revenue.test.js and
// supabase/tests/reports_k1.sql, so change both together.
//
// Revenue (net): one row per priced line of an accepted quote, line total (after the line
// discount) × (1 − phase discount) × (1 − quote discount), rounded to the cent. Optional
// phases and comments are left out. Excl. VAT, in the quote's currency.
// Report date: the gig's start date; a quote with no gig (or a gig with no date) takes its first
// dated phase (optional ones skipped), else its issue date. Each line also carries its own
// phase's start date, for a later rule that dates by phase.

const DATE = /^\d{4}-\d{2}-\d{2}$/
const pct = v => Math.min(100, Math.max(0, Number(v) || 0))
const dateOrNull = v => (typeof v === 'string' && DATE.test(v.slice(0, 10)) ? v.slice(0, 10) : null)

export function quoteReportDate(quote, gig) {
  const gigStart = dateOrNull(gig?.start_date)
  if (gigStart) return gigStart
  const dates = (Array.isArray(quote.body?.phases) ? quote.body.phases : [])
    .filter(p => !p?.optional).map(p => dateOrNull(p?.start_date)).filter(Boolean).sort()
  return dates[0] || dateOrNull(quote.issue_date)
}

// One quote's priced lines, whatever its status (callers choose which quotes count)
export function quoteRevenueLines(quote, gig = null, client = null) {
  const reportDate = quoteReportDate(quote, gig)
  const quoteFactor = 1 - pct(quote.discount_pct) / 100
  const rawPhases = Array.isArray(quote.body?.phases) ? quote.body.phases : []
  const out = []
  normalizeBody(quote.body).phases.forEach((p, pi) => {
    if (p.optional) return
    const factor = (1 - p.discount_pct / 100) * quoteFactor
    const phaseStart = dateOrNull(rawPhases[pi]?.start_date)
    for (const s of p.sections) for (const l of s.lines) {
      if (l.kind === 'comment') continue
      out.push({
        quote_id: quote.id, quote_number: quote.number ?? null, line_id: l.id, phase_id: p.id,
        kind: l.kind, item_id: l.item_id || null, description: l.description,
        amount: round2(lineTotal(l) * factor), currency: quote.currency || 'EUR',
        report_date: reportDate, phase_start: phaseStart,
        gig_id: gig?.id || quote.gig_id || null, gig_name: gig?.name ?? null, gig_type_id: gig?.gig_type_id ?? null,
        gig_status: gig?.status ?? null, gig_custom_status_id: gig?.custom_status_id ?? null,
        client_id: quote.client_id || null,
        client_name: client?.name || (quote.client_company || '').trim() || (quote.client_name || '').trim() || null,
      })
    }
  })
  return out
}

// The JS twin of report_revenue_lines: accepted quotes whose report date is in [from, until)
export function reportRevenueLines({ quotes = [], gigs = [], clients = [], from, until }) {
  const gigById = new Map(gigs.map(g => [g.id, g]))
  const clientById = new Map(clients.map(c => [c.id, c]))
  const rows = []
  for (const q of quotes) {
    if (q.status !== 'accepted') continue
    const lines = quoteRevenueLines(q, gigById.get(q.gig_id) || null, clientById.get(q.client_id) || null)
    for (const l of lines) if (l.report_date && l.report_date >= from && l.report_date < until) rows.push(l)
  }
  return rows.sort((a, b) => (a.report_date < b.report_date ? -1 : a.report_date > b.report_date ? 1 : String(a.quote_id).localeCompare(String(b.quote_id))))
}

// Totals per currency (never added across currencies): { EUR: 123.45, USD: 10 }
export function totalsByCurrency(rows, value = r => r.amount) {
  const out = {}
  for (const r of rows) out[r.currency] = round2((out[r.currency] || 0) + (Number(value(r)) || 0))
  return out
}

// Groups for a report table: [{ key, label, currency, amount, lines, quotes }], biggest first.
// `by` picks the key and label of a row, e.g. r => [r.kind, r.kind].
export function groupRevenue(rows, by) {
  const map = new Map()
  for (const r of rows) {
    const [key, label] = by(r)
    const id = `${key ?? ''}|${r.currency}`
    const g = map.get(id) || { key: key ?? null, label: label ?? null, currency: r.currency, amount: 0, lines: 0, quotes: new Set() }
    g.amount = round2(g.amount + r.amount)
    g.lines += 1
    g.quotes.add(r.quote_id)
    map.set(id, g)
  }
  return [...map.values()].map(g => ({ ...g, quotes: g.quotes.size })).sort((a, b) => b.amount - a.amount)
}

// A gig's revenue by the rule: all its accepted quotes; with none accepted, the newest sent quote,
// marked as an estimate. Drafts and declined quotes never count. `kinds` limits the lines (the
// labour panel counts crew lines only); `currency` keeps one currency (others aren't added).
export function gigRevenue(quotes, { kinds = null, currency = null } = {}) {
  const list = (quotes || []).filter(q => !currency || (q.currency || 'EUR') === currency)
  let counted = list.filter(q => q.status === 'accepted')
  let estimate = false
  if (!counted.length) {
    const sent = list.filter(q => q.status === 'sent')
      .sort((a, b) => String(b.sent_at || b.updated_at || b.created_at || '').localeCompare(String(a.sent_at || a.updated_at || a.created_at || '')))
    if (!sent.length) return null
    counted = [sent[0]]
    estimate = true
  }
  const lines = counted.flatMap(q => quoteRevenueLines(q)).filter(l => !kinds || kinds.includes(l.kind))
  return { quotes: counted, estimate, revenue: round2(lines.reduce((s, l) => s + l.amount, 0)) }
}

// Crew numbers in My work (docs/ANALYTICS.md, K8). The database works out each gig's numbers
// (public.my_gig_numbers) and the monthly summary (public.my_monthly_summary); these helpers only
// group and label what came back. Only the person's own rows ever reach them. Amounts are euros
// (fees are agreed in euros).

const round2 = v => Math.round((Number(v) || 0) * 100) / 100
const num = v => Number(v) || 0
const monthOf = d => (d ? String(d).slice(0, 7) : '')

// Totals over a list of gig rows
export function crewTotals(rows) {
  const list = rows || []
  return {
    gigs: list.length,
    days: list.reduce((s, r) => s + num(r.days), 0),
    hoursApproved: round2(list.reduce((s, r) => s + num(r.hours_approved), 0)),
    hoursWaiting: round2(list.reduce((s, r) => s + num(r.hours_waiting), 0)),
    overtime: round2(list.reduce((s, r) => s + num(r.overtime_hours), 0)),
    earned: round2(list.reduce((s, r) => s + num(r.earned), 0)),
    upcoming: round2(list.reduce((s, r) => s + num(r.upcoming), 0)),
    km: round2(list.reduce((s, r) => s + num(r.km), 0)),
    travelMinutes: list.reduce((s, r) => s + num(r.travel_minutes), 0),
    paid: round2(list.filter(r => r.paid_on).reduce((s, r) => s + num(r.earned), 0)),
  }
}

// Earned on gigs that are over and not marked paid yet
export function notYetPaid(rows) {
  const open = (rows || []).filter(r => r.finished && r.earned != null && num(r.earned) > 0 && !r.paid_on)
  return { amount: round2(open.reduce((s, r) => s + num(r.earned), 0)), count: open.length }
}

// The three tiles on My work: earned this month (gigs starting this month, the report date),
// not yet paid, and the booked days in the next 30 days with the first one
export function myWorkTiles(rows, today) {
  const month = monthOf(today)
  const thisMonth = (rows || []).filter(r => monthOf(r.start_date) === month)
  const limit = addDays(today, 30)
  const ahead = (rows || []).filter(r => !r.finished && r.start_date && (r.end_date || r.start_date) >= today && r.start_date <= limit)
  const next = ahead.map(r => (r.start_date < today ? today : r.start_date)).sort()[0] || null
  return {
    earnedThisMonth: round2(thisMonth.reduce((s, r) => s + num(r.earned), 0)),
    notYetPaid: notYetPaid(rows),
    nextDays: ahead.reduce((s, r) => s + num(r.days), 0),
    nextDate: next,
  }
}

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function groupBy(rows, keyOf, labelOf) {
  const map = new Map()
  for (const r of rows || []) {
    const key = keyOf(r)
    if (!map.has(key)) map.set(key, { key, label: labelOf(r), rows: [] })
    map.get(key).rows.push(r)
  }
  return [...map.values()].map(g => ({ key: g.key, label: g.label, ...crewTotals(g.rows) }))
}

// Per company (name only, as my_gig_companies), the most earned first
export const byCompany = rows => groupBy(rows, r => r.org_id || '', r => r.org_name || '')
  .sort((a, b) => b.earned - a.earned || a.label.localeCompare(b.label))

// Per month of the gig's start date, in order; gigs without a date left out
export const byMonth = rows => groupBy((rows || []).filter(r => r.start_date), r => monthOf(r.start_date), r => monthOf(r.start_date))
  .sort((a, b) => a.key.localeCompare(b.key))

// The busiest months by booked days (then gigs), at most n
export const busiestMonths = (rows, n = 3) => byMonth(rows).filter(m => m.days > 0 || m.gigs > 0)
  .sort((a, b) => b.days - a.days || b.gigs - a.gigs || a.key.localeCompare(b.key)).slice(0, n)

// Functions worked, by days then gigs; an empty function is left out
export const functionsWorked = rows => groupBy((rows || []).filter(r => (r.function_title || '').trim()),
  r => r.function_title.trim().toLowerCase(), r => r.function_title.trim())
  .sort((a, b) => b.days - a.days || b.gigs - a.gigs || a.label.localeCompare(b.label))

// The year statement for one company: twelve months (empty ones as zero) and the year's totals,
// from my_monthly_summary's rows. The same summary is what step 27 uses for the "recibo verde".
export function yearStatement(summary, year, orgId) {
  const rows = (summary || []).filter(r => !orgId || r.org_id === orgId)
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const own = rows.filter(r => monthOf(r.month) === key)
    return {
      month: key,
      gigs: own.reduce((s, r) => s + num(r.gigs), 0),
      days: own.reduce((s, r) => s + num(r.days), 0),
      hours: round2(own.reduce((s, r) => s + num(r.hours_approved), 0)),
      overtime: round2(own.reduce((s, r) => s + num(r.overtime_hours), 0)),
      earned: round2(own.reduce((s, r) => s + num(r.earned), 0)),
      paid: round2(own.reduce((s, r) => s + num(r.paid), 0)),
      km: round2(own.reduce((s, r) => s + num(r.km), 0)),
      reimbursements: round2(own.reduce((s, r) => s + num(r.reimbursements), 0)),
    }
  })
  const sum = k => round2(months.reduce((s, m) => s + m[k], 0))
  return { months, total: { gigs: sum('gigs'), days: sum('days'), hours: sum('hours'), overtime: sum('overtime'), earned: sum('earned'), paid: sum('paid'), km: sum('km'), reimbursements: sum('reimbursements') } }
}

// Companies in a summary (for the statement's picker), by name
export const summaryCompanies = summary => [...new Map((summary || []).map(r => [r.org_id, r.org_name || ''])).entries()]
  .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))

// "3 h 20 min" style parts for travel time
export const hoursAndMinutes = minutes => ({ h: Math.floor(num(minutes) / 60), m: Math.round(num(minutes) % 60) })

// Dashboard filtering (pure, unit tested).

// Today's date in the user's time zone, as YYYY-MM-DD (same format as gig dates)
export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Labels come from i18n: gigFilter.<value>
export const GIG_FILTERS = [{ value: 'upcoming' }, { value: 'past' }, { value: 'archived' }, { value: 'all' }]

// A gig is "past" once its last day (end date, else start date) is before today.
// Gigs without dates count as upcoming so they stay visible.
export function gigBucket(gig, today) {
  if (gig.status === 'archived') return 'archived'
  const lastDay = gig.end_date || gig.start_date
  if (lastDay && lastDay < today) return 'past'
  return 'upcoming'
}

export function filterGigs(gigs, filter, search = '', today = localToday()) {
  const q = search.trim().toLowerCase()
  const list = gigs.filter(g =>
    (filter === 'all' || gigBucket(g, today) === filter) &&
    (!q || [g.name, g.venue, g.description].some(v => v && v.toLowerCase().includes(q)))
  )
  // Past gigs: most recent first
  if (filter === 'past') list.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
  return list
}

export function countByBucket(gigs, today = localToday()) {
  const counts = { upcoming: 0, past: 0, archived: 0, all: gigs.length }
  for (const g of gigs) counts[gigBucket(g, today)]++
  return counts
}

// My work: one row per gig, whatever roles you hold on it, with the company's name.
// memberships: rows of gig_members with the gig joined as `gigs`.
const ROLE_RANK = { pm: 0, crew: 1, viewer: 2 }
export function myWorkGigs(memberships, companyNames = {}) {
  const byGig = new Map()
  for (const m of memberships || []) {
    if (!m.gigs) continue
    const seen = byGig.get(m.gigs.id)
    if (!seen) {
      byGig.set(m.gigs.id, { ...m.gigs, myGigRole: m.role, myFunction: m.function_title, company: companyNames[m.gigs.org_id] || null })
      continue
    }
    if ((ROLE_RANK[m.role] ?? 9) < (ROLE_RANK[seen.myGigRole] ?? 9)) seen.myGigRole = m.role
    const fns = [seen.myFunction, m.function_title].filter(Boolean)
    seen.myFunction = [...new Set(fns)].join(' · ') || null
  }
  return [...byGig.values()].sort((a, b) => (a.start_date || '9').localeCompare(b.start_date || '9'))
}

import { t, fmt } from '../i18n'

// Helpers for the reservations engine (see docs/RESERVATIONS.md): turning clash rows
// from gig_clashes / email_clashes / my_clashes into readable lines, and finding
// overlaps in lists the app already has (e.g. My work's gigs).

const DAY = 24 * 60 * 60 * 1000
const isMidnight = d => d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0

// A time range as people say it: "10 Nov", "10–12 Nov" for whole days,
// "10 Nov 09:00–18:00" for a shift, "10 Nov 22:00 – 11 Nov 04:00" across midnight.
export function rangeText(startsAt, endsAt) {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (isMidnight(start) && isMidnight(end)) {
    const last = new Date(end.getTime() - DAY / 2) // ranges end at the next midnight
    if (start.toDateString() === last.toDateString()) return fmt(start, 'd MMM')
    const sameMonth = start.getMonth() === last.getMonth() && start.getFullYear() === last.getFullYear()
    return `${fmt(start, sameMonth ? 'd' : 'd MMM')}–${fmt(last, 'd MMM')}`
  }
  if (start.toDateString() === end.toDateString()) return `${fmt(start, 'd MMM HH:mm')}–${fmt(end, 'HH:mm')}`
  return `${fmt(start, 'd MMM HH:mm')} – ${fmt(end, 'd MMM HH:mm')}`
}

// "Not available 5 Nov", "Booked 10 Nov (Festival · Other Co)", "Booked 10 Nov (another gig)"
export function clashText(c) {
  const range = rangeText(c.starts_at, c.ends_at)
  if (c.kind === 'unavailable') return t('clash.unavailable', { range })
  const where = [c.label, c.company].filter(Boolean).join(' · ')
  const text = where ? t('clash.bookedNamed', { range, gig: where }) : t('clash.booked', { range })
  return c.status === 'hold' ? `${text} ${t('clash.hold')}` : text
}

// Rows of gig_clashes → { user_id: [clash] }
export function groupByUser(rows) {
  const map = {}
  for (const c of rows || []) (map[c.user_id] ||= []).push(c)
  return map
}

// Local whole days as a time range, for the gig form (end date optional)
export function dayRange(startDate, endDate) {
  if (!startDate) return null
  const from = new Date(`${startDate}T00:00:00`)
  const last = new Date(`${endDate && endDate >= startDate ? endDate : startDate}T00:00:00`)
  const until = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
  return { from: from.toISOString(), until: until.toISOString() }
}

export const overlaps = (a, b) => new Date(a.from) < new Date(b.until) && new Date(b.from) < new Date(a.until)

// Ids of items that overlap at least one other item. Items: { id, from, until }.
// Cancelled bookings should be left out by the caller.
export function findOverlaps(items) {
  const sorted = [...items].filter(i => i.from && i.until).sort((a, b) => new Date(a.from) - new Date(b.from))
  const hit = new Set()
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (new Date(sorted[j].from) >= new Date(sorted[i].until)) break
      if (sorted[i].id !== sorted[j].id) { hit.add(sorted[i].id); hit.add(sorted[j].id) }
    }
  }
  return hit
}

// A Postgres range as PostgREST returns it: ["2026-11-10 00:00:00+00","2026-11-12 00:00:00+00")
export function parseRange(text) {
  const m = /^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/.exec(text || '')
  if (!m) return null
  const iso = s => new Date(s.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString()
  return { from: iso(m[1]), until: iso(m[2]) }
}

// Your gigs that overlap another of your bookings (or your unavailable dates), from your
// own reservations. Two roles on one gig are one booking, so they never clash.
export function clashingGigIds(reservations) {
  const items = (reservations || []).filter(r => r.status !== 'cancelled').map(r => {
    const range = parseRange(r.period)
    return range && { id: r.gig_id || `unavailable:${r.id}`, ...range }
  }).filter(Boolean)
  return new Set([...findOverlaps(items)].filter(id => !id.startsWith('unavailable:')))
}

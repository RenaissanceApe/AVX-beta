// On-site mode (docs/TOOLS_PLAN.md §1): on a gig's day, the gig opens on what's needed on site
// (call time, today's schedule, the on-site tools) in big buttons. Decided 2026-10-26: both a
// switch per gig and automatic on gig days; the automatic part is on by default and can be turned
// off in Settings. Kept on this device, like the appearance settings.

const KEY = 'avx.onsite'
export const ONSITE_CHANGED = 'avx:onsite'

export function readOnSite() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { auto: saved.auto !== false, noteSeen: saved.noteSeen === true, gigs: saved.gigs && typeof saved.gigs === 'object' ? saved.gigs : {} }
  } catch {
    return { auto: true, noteSeen: false, gigs: {} }
  }
}

export function saveOnSite(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode: lasts this visit */ }
  window.dispatchEvent(new Event(ONSITE_CHANGED))
}

// Today as YYYY-MM-DD in the device's time zone (gig dates are calendar days)
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const isGigDay = (gig, today = localDay()) =>
  !!gig?.start_date && gig.start_date <= today && today <= (gig.end_date || gig.start_date)

// Whether the gig opens in on-site mode, and why: 'manual' (switched on for today), 'auto' (a gig
// day), or null. A switch by hand only lasts the day it was made, so tomorrow follows the setting.
export function onSiteState(gig, state, today = localDay()) {
  const choice = state.gigs?.[gig?.id]
  if (choice && choice.day === today) return choice.on ? 'manual' : null
  return state.auto && isGigDay(gig, today) ? 'auto' : null
}

export function switchOnSite(state, gigId, on, today = localDay()) {
  // Keep only today's choices: older ones mean nothing any more
  const gigs = Object.fromEntries(Object.entries(state.gigs || {}).filter(([, c]) => c.day === today))
  return { ...state, gigs: { ...gigs, [gigId]: { on, day: today } } }
}

// Today's schedule items in order, with the one happening now and the next one marked
export function todaysSchedule(items, today = localDay(), nowHm = new Date().toTimeString().slice(0, 5)) {
  const list = (items || []).filter(s => s.day === today).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
  let current = null, next = null
  for (const s of list) {
    const start = String(s.start_time).slice(0, 5), end = s.end_time ? String(s.end_time).slice(0, 5) : null
    if (start <= nowHm && (end ? nowHm < end : true)) current = s.id
    if (!next && start > nowHm) next = s.id
  }
  return list.map(s => ({ ...s, now: s.id === current, next: s.id === next }))
}

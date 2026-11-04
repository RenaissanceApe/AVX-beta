import { supabase } from './supabase'
import { isHoliday } from './timeRegistration'

// Leave requests (step 9, docs/BUSINESS.md). The database decides the status and counts the days
// (private.leave_days); these helpers show the same count before sending and lay out the calendar.

export const LEAVE_TYPES = ['holiday', 'sick', 'training', 'other']
export const DEFAULT_WEEK = [1, 2, 3, 4, 5] // ISO weekdays, Monday = 1
export const DEFAULT_ALLOWANCE = 22
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]

const pad = n => String(n).padStart(2, '0')
export const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const isoWeekday = day => {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay()
  return w === 0 ? 7 : w
}

// Working days a stretch of leave uses, as the database counts them: with an organisation, only
// the person's working weekdays that aren't a national or organisation holiday; a half first or
// last day counts 0.5. Without an organisation (a freelancer's own dates): every day.
export function leaveDays({ from, to, startHalf = false, endHalf = false, week = DEFAULT_WEEK, holidays = [], org = true }) {
  if (!from) return 0
  const last = to && to >= from ? to : from
  let total = 0
  for (let d = from; d <= last; d = addDays(d, 1)) {
    if (org && (!week.includes(isoWeekday(d)) || isHoliday(d, holidays))) continue
    total += (d === from && startHalf) || (d === last && endHalf) ? 0.5 : 1
  }
  return total
}

// "1 Mar", "1–5 Mar", "28 Feb – 3 Mar", with "(afternoon)" / "(morning)" for half days
export function leaveRange(l, t, fmt) {
  const from = new Date(`${l.start_date}T12:00:00`)
  const to = new Date(`${l.end_date}T12:00:00`)
  let text
  if (l.start_date === l.end_date) text = fmt(from, 'd MMM')
  else if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) text = `${fmt(from, 'd')}–${fmt(to, 'd MMM')}`
  else text = `${fmt(from, 'd MMM')} – ${fmt(to, 'd MMM')}`
  if (l.start_date === l.end_date) {
    if (l.start_half) return `${text} (${t('leave.afternoon')})`
    if (l.end_half) return `${text} (${t('leave.morning')})`
    return text
  }
  const notes = [l.start_half && t('leave.fromAfternoon'), l.end_half && t('leave.untilMorning')].filter(Boolean)
  return notes.length ? `${text} (${notes.join(', ')})` : text
}

// Who is away on each day of a month: { 'YYYY-MM-DD': [entry] } (requests included when given)
export function awayByDay(entries, month) {
  const [y, m] = month.split('-').map(Number)
  const first = `${month}-01`
  const last = `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
  const out = {}
  for (let d = first; d <= last; d = addDays(d, 1)) out[d] = []
  for (const e of entries || []) {
    if (e.status === 'refused' || e.status === 'cancelled') continue
    for (let d = e.start_date < first ? first : e.start_date; d <= e.end_date && d <= last; d = addDays(d, 1)) out[d].push(e)
  }
  return out
}

export const monthBounds = month => {
  const [y, m] = month.split('-').map(Number)
  return [`${month}-01`, `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`]
}

// Readable error text for the leave rules in the database
export function leaveError(error, t) {
  const msg = error?.message || ''
  if (/Leave can only be asked for from today/i.test(msg)) return t('leave.error.past')
  if (/single day is either/i.test(msg) || /crew_unavailability_one_half/.test(msg)) return t('leave.error.half')
  if (/Remove this leave and ask again/i.test(msg)) return t('leave.error.locked')
  if (/A note is needed/i.test(msg)) return t('leave.error.note')
  if (/Not staff of this organisation/i.test(msg)) return t('leave.error.staff')
  if (/Too many requests today/i.test(msg)) return t('leave.error.tooMany')
  if (/end_date/.test(msg)) return t('error.dates')
  return null
}

// ── Database calls ──────────────────────────────────────────────────────────
export async function requestLeave({ userId, orgId, type, from, to, startHalf, endHalf, note }) {
  const { data, error } = await supabase.from('crew_unavailability').insert({
    user_id: userId, org_id: orgId || null, type, start_date: from, end_date: to || from,
    start_half: !!startHalf, end_half: !!endHalf, note: note?.trim() || null,
  }).select('id, status').single()
  if (error) throw error
  return data
}

// Organisation leave is removed by marking it (the record stays); a freelancer's own dates go
export async function removeLeave(entry) {
  const { error } = entry.org_id
    ? await supabase.from('crew_unavailability').update({ removed_at: new Date().toISOString() }).eq('id', entry.id)
    : await supabase.from('crew_unavailability').delete().eq('id', entry.id)
  if (error) throw error
}

export async function decideLeave(id, approve, note) {
  const { data, error } = await supabase.rpc('decide_leave', { p_leave: id, p_approve: approve, p_note: note || null })
  if (error) throw error
  return data
}

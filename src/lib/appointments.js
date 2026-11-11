// Appointments (step 23, V2): calendar items that aren't a gig — a site visit, a meeting, a
// warehouse day — with people invited. See docs/BUSINESS.md "How appointments work".
// Times are typed and shown on the organisation's clock (U1). Pure helpers first (unit tested),
// then the database calls.
import { supabase } from './supabase'
import { rangeText } from './clashes'
import { wallClock, zonedInstant } from './timeZone'

export const APPOINTMENT_KINDS = ['site_visit', 'meeting', 'warehouse', 'other']

const pad = n => String(n).padStart(2, '0')
const dateOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeOf = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// The appointment as a real time range { from, until } (ISO). All-day: whole days on the
// organisation's clock, the end being the next midnight.
export function appointmentRange(a, timeZone) {
  if (!a) return null
  if (a.all_day) {
    if (!a.start_date) return null
    return {
      from: zonedInstant(a.start_date, '00:00', timeZone).toISOString(),
      until: zonedInstant(addDays(a.end_date || a.start_date, 1), '00:00', timeZone).toISOString(),
    }
  }
  if (!a.starts_at || !a.ends_at) return null
  return { from: new Date(a.starts_at).toISOString(), until: new Date(a.ends_at).toISOString() }
}

// The days it runs on the organisation's calendar, for the month view
export function appointmentDays(a, timeZone) {
  if (a.all_day) return { start_date: a.start_date, end_date: a.end_date || a.start_date }
  if (!a.starts_at || !a.ends_at) return { start_date: null, end_date: null }
  const start = wallClock(a.starts_at, timeZone)
  const end = wallClock(new Date(new Date(a.ends_at).getTime() - 1), timeZone) // ending at midnight stays on the day before
  return { start_date: dateOf(start), end_date: dateOf(end < start ? start : end) }
}

// "10 Nov 09:00–11:00", "10–12 Nov"
export function appointmentWhen(a, timeZone) {
  const range = appointmentRange(a, timeZone)
  return range ? rangeText(range.from, range.until, timeZone) : ''
}

// Appointments as items for the month calendar (GigCalendar's `appointments`)
export const calendarItems = (list, zoneOf) => (list || []).filter(a => !a.removed_at).map(a => ({
  id: a.id, name: a.title, kind: a.kind, ...appointmentDays(a, zoneOf(a)),
}))

// The form's fields from a row (or a new appointment's defaults), on the organisation's clock
export function toForm(a, timeZone, today) {
  if (!a) return { kind: 'site_visit', title: '', place: '', allDay: false, day: today, from: '09:00', until: '10:00', endDay: today, notes: '', gigId: '', clientId: '' }
  const base = { kind: a.kind, title: a.title, place: a.place || '', allDay: !!a.all_day, notes: a.notes || '', gigId: a.gig_id || '', clientId: a.client_id || '' }
  if (a.all_day) return { ...base, day: a.start_date, endDay: a.end_date || a.start_date, from: '09:00', until: '10:00' }
  const start = wallClock(a.starts_at, timeZone)
  const end = wallClock(a.ends_at, timeZone)
  return { ...base, day: dateOf(start), endDay: dateOf(start), from: timeOf(start), until: timeOf(end) }
}

// What's wrong with the form, as an i18n key (null when it can be saved)
export function formError(f) {
  if (!f.title.trim()) return 'appointments.errTitle'
  if (!f.day) return 'appointments.errDay'
  if (f.allDay) return f.endDay && f.endDay < f.day ? 'appointments.errEnd' : null
  if (!f.from || !f.until) return 'appointments.errTimes'
  if (f.until === f.from) return 'appointments.errTimes'
  return null
}

// The row to save. A timed appointment that ends at or before its start time runs past midnight.
export function toRow(f, timeZone) {
  const row = {
    kind: f.kind, title: f.title.trim(), place: f.place.trim() || null, notes: f.notes.trim() || null,
    all_day: !!f.allDay, gig_id: f.gigId || null, client_id: f.clientId || null,
  }
  if (f.allDay) return { ...row, start_date: f.day, end_date: f.endDay && f.endDay >= f.day ? f.endDay : f.day, starts_at: null, ends_at: null }
  const endDay = f.until <= f.from ? addDays(f.day, 1) : f.day
  return {
    ...row, start_date: null, end_date: null,
    starts_at: zonedInstant(f.day, f.from, timeZone).toISOString(),
    ends_at: zonedInstant(endDay, f.until, timeZone).toISOString(),
  }
}

// Which invitations to add, take off and bring back, from the people chosen in the form
export function peopleChanges(existing, chosen) {
  const byId = new Map((existing || []).map(p => [p.user_id, p]))
  const want = new Set(chosen || [])
  return {
    add: [...want].filter(id => !byId.has(id)),
    revive: [...want].filter(id => byId.get(id)?.removed_at),
    remove: [...byId.values()].filter(p => !p.removed_at && !want.has(p.user_id)).map(p => p.user_id),
  }
}

// Upcoming first (soonest at the top), then the past (latest first)
export function sortAppointments(list, timeZone, now = new Date()) {
  const keyed = (list || []).map(a => ({ a, r: appointmentRange(a, typeof timeZone === 'function' ? timeZone(a) : timeZone) }))
  const upcoming = keyed.filter(x => x.r && new Date(x.r.until) >= now).sort((x, y) => new Date(x.r.from) - new Date(y.r.from))
  const past = keyed.filter(x => x.r && new Date(x.r.until) < now).sort((x, y) => new Date(y.r.from) - new Date(x.r.from))
  return { upcoming: upcoming.map(x => x.a), past: past.map(x => x.a) }
}

// ── Database calls (throw on error) ──────────────────────────────────────────
const FIELDS = 'id, org_id, kind, title, place, all_day, starts_at, ends_at, start_date, end_date, notes, gig_id, client_id, created_by, removed_at, appointment_people(user_id, removed_at)'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data || []
}

// The organisation's appointments you may see (planners: all; others: the ones you're on)
export const orgAppointments = (orgId, since) => rows(supabase.from('appointments').select(FIELDS)
  .eq('org_id', orgId).is('removed_at', null)
  .or(`end_date.gte.${since},ends_at.gte.${since}`).order('created_at').limit(1000))

// Every appointment you're invited to, in any organisation
export async function myAppointments(userId, since) {
  const data = await rows(supabase.from('appointment_people')
    .select(`appointments!inner(${FIELDS}, organisations(name, time_zone))`)
    .eq('user_id', userId).is('removed_at', null).is('appointments.removed_at', null).limit(1000))
  return data.map(r => r.appointments).filter(a => (a.end_date || a.ends_at || '') >= since)
}

// Appointments linked to a gig or a client
export const linkedAppointments = (column, id) => rows(supabase.from('appointments').select(FIELDS)
  .eq(column, id).is('removed_at', null).order('created_at').limit(200))

export async function invitees(orgId) {
  const { data, error } = await supabase.rpc('appointment_invitees', { p_org: orgId })
  if (error) throw error
  return data || []
}

export async function clashesFor(orgId, userIds, range, excludeId) {
  if (!userIds.length || !range) return []
  const { data, error } = await supabase.rpc('appointment_clashes', {
    p_org: orgId, p_users: userIds, p_from: range.from, p_until: range.until, p_exclude_appointment: excludeId || null,
  })
  if (error) throw error
  return data || []
}

// Save the appointment and who is invited; returns the saved row's id
export async function saveAppointment({ id, orgId, row, existingPeople, people }) {
  let savedId = id
  if (id) {
    const { error } = await supabase.from('appointments').update(row).eq('id', id)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from('appointments').insert({ ...row, org_id: orgId }).select('id').single()
    if (error) throw error
    savedId = data.id
  }
  const { add, revive, remove } = peopleChanges(existingPeople, people)
  if (add.length) {
    const { error } = await supabase.from('appointment_people').insert(add.map(user_id => ({ appointment_id: savedId, user_id })))
    if (error) throw error
  }
  if (revive.length) {
    const { error } = await supabase.from('appointment_people').update({ removed_at: null }).eq('appointment_id', savedId).in('user_id', revive)
    if (error) throw error
  }
  if (remove.length) {
    const { error } = await supabase.from('appointment_people').update({ removed_at: new Date().toISOString() }).eq('appointment_id', savedId).in('user_id', remove)
    if (error) throw error
  }
  return savedId
}

// Cancel (mark removed); the invited people are told
export async function cancelAppointment(id) {
  const { error } = await supabase.from('appointments').update({ removed_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// calendar-feed: a person's gigs as an .ics calendar their phone subscribes to
// (docs/SWITCHING.md, S4). GET ?t=<feed key>. No sign-in: calendar apps can't sign in, so the long
// random key in the link (calendar_feeds, made by calendar_feed() in the app) is the only key. It
// shows the gigs the person is on, from 60 days ago onwards: names, dates, venues, role and call
// time, their own approved leave and unavailable dates (step 9), and the appointments they're
// invited to and the trips they drive (step 23). JWT verification is off for this function.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'
import { buildCalendar, feedZone, type FeedAppointment, type FeedGig, type FeedLang, type FeedLeave, type FeedTrip } from '../_shared/ics.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://avx-beta.vercel.app'

const text = (body: string, status: number) => new Response(body, {
  status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
})

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405)
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) return text('Not found', 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    global: { fetch: fetchWithTimeout }, auth: { persistSession: false },
  })
  const { data: feed, error: feedError } = await admin.from('calendar_feeds').select('user_id').eq('token', token).maybeSingle()
  // Not "Not found" when the database was only slow: a calendar app may drop a feed that's gone
  if (isTimeout(feedError)) return text('Calendar not available right now', 503)
  if (!feed) return text('Not found', 404)

  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const [{ data: rows, error }, { data: profile }, { data: hours }, { data: away }, { data: invited }, { data: driving }] = await Promise.all([
    admin.from('gig_members')
      .select('role, function_title, call_time, booked_from, booked_until, gigs!inner(id, name, venue, start_date, end_date, status, organisations(name, time_zone))')
      .eq('user_id', feed.user_id)
      .limit(1000),
    admin.from('profiles').select('language').eq('id', feed.user_id).maybeSingle(),
    // Their own logged hours only (step 8)
    admin.from('time_entries').select('gig_id, work_date, start_time, end_time, status')
      .eq('user_id', feed.user_id).is('removed_at', null).gte('work_date', since).order('work_date').limit(2000),
    // Their own approved leave and unavailable dates (step 9)
    admin.from('crew_unavailability').select('id, type, start_date, end_date, start_half, end_half, organisations(name)')
      .eq('user_id', feed.user_id).eq('status', 'approved').is('removed_at', null).gte('end_date', since).order('start_date').limit(1000),
    // Appointments they're invited to and still on (step 23, V2)
    admin.from('appointment_people')
      .select('appointments!inner(id, kind, title, place, all_day, starts_at, ends_at, start_date, end_date, notes, removed_at, organisations(name))')
      .eq('user_id', feed.user_id).is('removed_at', null).is('appointments.removed_at', null).limit(1000),
    // Trips they drive or co-drive (step 23, V1), read from their own reservations so the feed
    // doesn't depend on the trip tables; the gig's name only (they're on the trip, so on the gig)
    admin.from('reservations').select('id, source_type, period, status, label, gig_id, gigs(name)')
      .eq('resource_type', 'person').eq('resource_id', feed.user_id).in('source_type', ['trip_driver', 'trip_codriver'])
      .neq('status', 'cancelled').limit(1000),
  ])
  if (error) {
    console.error(JSON.stringify({ fn: 'calendar-feed', step: 'gigs', timeout: isTimeout(error) }))
    return text('Calendar not available right now', 503)
  }
  await admin.from('calendar_feeds').update({ last_used_at: new Date().toISOString() }).eq('user_id', feed.user_id)

  // deno-lint-ignore no-explicit-any
  const gigs: FeedGig[] = (rows ?? []).filter((r: any) => (r.gigs.end_date || r.gigs.start_date || since) >= since).map((r: any) => ({
    id: r.gigs.id, name: r.gigs.name, venue: r.gigs.venue, start_date: r.gigs.start_date, end_date: r.gigs.end_date,
    status: r.gigs.status, org: r.gigs.organisations?.name ?? null, role: r.role, function_title: r.function_title,
    call_time: r.call_time, booked_from: r.booked_from, booked_until: r.booked_until, time_zone: r.gigs.organisations?.time_zone ?? null,
    // deno-lint-ignore no-explicit-any
    hours: (hours ?? []).filter((h: any) => h.gig_id === r.gigs.id),
  }))
  const lang: FeedLang = profile?.language === 'en' ? 'en' : 'pt'
  // deno-lint-ignore no-explicit-any
  const leave: FeedLeave[] = (away ?? []).map((l: any) => ({
    id: l.id, type: l.type, start_date: l.start_date, end_date: l.end_date, start_half: l.start_half, end_half: l.end_half,
    org: l.organisations?.name ?? null,
  }))
  // deno-lint-ignore no-explicit-any
  const appointments: FeedAppointment[] = (invited ?? []).map((r: any) => r.appointments)
    // deno-lint-ignore no-explicit-any
    .filter((a: any) => a && (a.end_date || a.ends_at || '') >= since)
    // deno-lint-ignore no-explicit-any
    .map((a: any) => ({
      id: a.id, kind: a.kind, title: a.title, place: a.place, all_day: a.all_day, starts_at: a.starts_at, ends_at: a.ends_at,
      start_date: a.start_date, end_date: a.end_date, notes: a.notes, org: a.organisations?.name ?? null,
    }))
  // The gig's name and link only for gigs the person is on, as for their other gigs in the feed
  const onGig = (id: string | null) => !!id && gigs.some(g => g.id === id)
  const trips: FeedTrip[] = []
  for (const r of driving ?? []) {
    // A range as PostgREST returns it: ["2027-01-10 08:00:00+00","2027-01-10 12:00:00+00")
    const m = /^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/.exec(r.period ?? '')
    if (!m) continue
    const iso = (x: string) => new Date(x.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString()
    if (iso(m[2]) < `${since}T00:00:00Z`) continue
    trips.push({ id: r.id, role: r.source_type === 'trip_codriver' ? 'codriver' : 'driver', starts_at: iso(m[1]), ends_at: iso(m[2]),
      // deno-lint-ignore no-explicit-any
      gig_id: onGig(r.gig_id) ? r.gig_id : null, gig: onGig(r.gig_id) ? (r as any).gigs?.name ?? null : null, label: r.label, status: r.status })
  }
  return new Response(req.method === 'HEAD' ? null : buildCalendar(gigs, lang, APP_URL, new Date(), leave, feedZone(gigs), appointments, trips), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="avx-gigs.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  })
})

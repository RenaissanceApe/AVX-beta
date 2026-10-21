// calendar-feed: a person's gigs as an .ics calendar their phone subscribes to
// (docs/SWITCHING.md, S4). GET ?t=<feed key>. No sign-in: calendar apps can't sign in, so the long
// random key in the link (calendar_feeds, made by calendar_feed() in the app) is the only key. It
// shows the gigs the person is on, from 60 days ago onwards: names, dates, venues, role and call
// time. JWT verification is off for this function.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCalendar, type FeedGig, type FeedLang } from '../_shared/ics.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://avx-beta.vercel.app'

const text = (body: string, status: number) => new Response(body, {
  status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
})

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text('Method not allowed', 405)
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) return text('Not found', 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: feed } = await admin.from('calendar_feeds').select('user_id').eq('token', token).maybeSingle()
  if (!feed) return text('Not found', 404)

  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    admin.from('gig_members')
      .select('role, function_title, call_time, booked_from, booked_until, gigs!inner(id, name, venue, start_date, end_date, status, organisations(name))')
      .eq('user_id', feed.user_id)
      .limit(1000),
    admin.from('profiles').select('language').eq('id', feed.user_id).maybeSingle(),
  ])
  if (error) {
    console.error('calendar-feed', error.message)
    return text('Calendar not available right now', 503)
  }
  await admin.from('calendar_feeds').update({ last_used_at: new Date().toISOString() }).eq('user_id', feed.user_id)

  // deno-lint-ignore no-explicit-any
  const gigs: FeedGig[] = (rows ?? []).filter((r: any) => (r.gigs.end_date || r.gigs.start_date || since) >= since).map((r: any) => ({
    id: r.gigs.id, name: r.gigs.name, venue: r.gigs.venue, start_date: r.gigs.start_date, end_date: r.gigs.end_date,
    status: r.gigs.status, org: r.gigs.organisations?.name ?? null, role: r.role, function_title: r.function_title,
    call_time: r.call_time, booked_from: r.booked_from, booked_until: r.booked_until,
  }))
  const lang: FeedLang = profile?.language === 'en' ? 'en' : 'pt'
  return new Response(req.method === 'HEAD' ? null : buildCalendar(gigs, lang, APP_URL), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="avx-gigs.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  })
})

// A person's gigs as an iCalendar (.ics) feed (docs/SWITCHING.md, S4): what their phone's calendar
// shows when they subscribe to their feed link. Plain functions, no dependencies, so the app's
// unit tests check them too (src/lib/ics.test.js).

export type FeedLang = 'en' | 'pt'
export type FeedGig = {
  id: string
  name: string
  venue?: string | null
  start_date?: string | null // '2026-11-10'
  end_date?: string | null
  status?: string | null // draft | confirmed | active | completed | archived | cancelled
  org?: string | null
  role?: string | null // pm | crew | viewer
  function_title?: string | null
  call_time?: string | null // '09:30:00'
  booked_from?: string | null // timestamptz, this person's own booking
  booked_until?: string | null
  hours?: { work_date: string, start_time: string, end_time: string, status: string }[] // this person's own logged days
  time_zone?: string | null // the organisation's (U1); call times are on its clock
}
// The person's own approved leave and unavailable dates (step 9)
export type FeedLeave = {
  id: string
  type: string // holiday | sick | training | other
  start_date: string
  end_date: string
  start_half?: boolean
  end_half?: boolean
  org?: string | null
}

// Appointments the person is invited to (step 23, V2): site visits, meetings, warehouse days
export type FeedAppointment = {
  id: string
  kind: string // site_visit | meeting | warehouse | other
  title: string
  place?: string | null
  all_day: boolean
  starts_at?: string | null // timed
  ends_at?: string | null
  start_date?: string | null // all day, on the organisation's calendar
  end_date?: string | null
  notes?: string | null
  org?: string | null
}

// The person's own driving on a gig (step 23, V1's trips), from their reservations
export type FeedTrip = {
  id: string // the reservation's id
  role: 'driver' | 'codriver'
  starts_at: string
  ends_at: string
  gig_id?: string | null
  gig?: string | null
  label?: string | null // what V1 wrote on the reservation (e.g. the vehicle or the leg)
  status?: string | null // hold | confirmed
}

const WORDS: Record<FeedLang, Record<string, string>> = {
  en: { holiday: 'Holiday', sick: 'Sick', training: 'Training', other: 'Unavailable', morning: 'morning', afternoon: 'afternoon', calendar: 'AVX gigs', call: 'Call time', role: 'Role', open: 'Open in AVX', draft: 'Draft (not confirmed yet)', pm: 'Production manager', crew: 'Crew', viewer: 'Viewer', hours: 'Your hours', approved: 'approved', waiting: 'waiting for approval', returned: 'sent back', site_visit: 'Site visit', meeting: 'Meeting', warehouse: 'Warehouse day', appointment: 'Appointment', driver: 'Driving', codriver: 'Co-driving' },
  pt: { holiday: 'Férias', sick: 'Baixa', training: 'Formação', other: 'Indisponível', morning: 'manhã', afternoon: 'tarde', calendar: 'Eventos AVX', call: 'Hora de chamada', role: 'Papel', open: 'Abrir no AVX', draft: 'Rascunho (ainda não confirmado)', pm: 'Diretor de produção', crew: 'Equipa', viewer: 'Leitor', hours: 'As suas horas', approved: 'aprovadas', waiting: 'a aguardar aprovação', returned: 'devolvidas', site_visit: 'Visita ao local', meeting: 'Reunião', warehouse: 'Dia de armazém', appointment: 'Compromisso', driver: 'A conduzir', codriver: 'Segundo condutor' },
}

// Text values: backslash, semicolon, comma and line breaks escaped (RFC 5545 3.3.11)
export const escapeText = (s: unknown) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Lines longer than 75 octets are folded: CRLF and a space (RFC 5545 3.1), never inside a character
export function fold(line: string) {
  const bytes = (s: string) => new TextEncoder().encode(s).length
  if (bytes(line) <= 75) return line
  const parts: string[] = []
  let cur = ''
  for (const ch of line) {
    if (bytes(cur + ch) > (parts.length ? 74 : 75)) { parts.push(cur); cur = '' }
    cur += ch
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const dateValue = (d: string) => d.slice(0, 10).replace(/-/g, '')
const nextDay = (d: string) => {
  const t = new Date(`${d.slice(0, 10)}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + 1)
  return t.toISOString().slice(0, 10)
}
const utcValue = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export const DEFAULT_ZONE = 'Europe/Lisbon'

// The calendar's own time zone: the one most of the person's gigs are in (Lisbon without any)
export function feedZone(gigs: FeedGig[]) {
  const count = new Map<string, number>()
  for (const g of gigs) if (g.time_zone) count.set(g.time_zone, (count.get(g.time_zone) ?? 0) + 1)
  let best = DEFAULT_ZONE, most = 0
  for (const [zone, n] of count) if (n > most || (n === most && zone < best)) { best = zone; most = n }
  return best
}

// One VEVENT per gig: the person's own booking times when set, otherwise the gig's days (all day).
// A call time is on the organisation's clock: its zone is named when it isn't the calendar's.
export function gigEvent(g: FeedGig, lang: FeedLang, appUrl: string, now: Date, calendarZone = DEFAULT_ZONE) {
  const w = WORDS[lang] || WORDS.en
  const lines = ['BEGIN:VEVENT', `UID:${g.id}@avx`, `DTSTAMP:${utcValue(now.toISOString())}`]
  if (g.booked_from && g.booked_until) {
    lines.push(`DTSTART:${utcValue(g.booked_from)}`, `DTEND:${utcValue(g.booked_until)}`)
  } else if (g.start_date) {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(g.start_date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(g.end_date || g.start_date))}`)
  } else {
    return []
  }
  lines.push(`SUMMARY:${escapeText(g.org ? `${g.name} · ${g.org}` : g.name)}`)
  if (g.venue) lines.push(`LOCATION:${escapeText(g.venue)}`)
  const role = g.function_title || (g.role ? w[g.role] : '')
  const description = [
    g.status === 'draft' ? w.draft : null,
    role ? `${w.role}: ${role}` : null,
    g.call_time ? `${w.call}: ${g.call_time.slice(0, 5)}${g.time_zone && g.time_zone !== calendarZone ? ` (${g.time_zone})` : ''}` : null,
    g.hours?.length ? `${w.hours}:\n${g.hours.slice(0, 31).map(h => `${h.work_date} ${h.start_time.slice(0, 5)}–${h.end_time.slice(0, 5)} (${w[h.status === 'submitted' ? 'waiting' : h.status] || h.status})`).join('\n')}` : null,
    `${w.open}: ${appUrl}/gig/${g.id}`,
  ].filter(Boolean).join('\n')
  lines.push(`DESCRIPTION:${escapeText(description)}`, `URL:${appUrl}/gig/${g.id}`)
  lines.push(`STATUS:${g.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT')
  return lines
}

// One all-day VEVENT per stretch of leave; a half first or last day is said in the title
export function leaveEvent(l: FeedLeave, lang: FeedLang, now: Date) {
  const w = WORDS[lang] || WORDS.en
  const halves = [l.start_half ? `${l.start_date.slice(8, 10)}/${l.start_date.slice(5, 7)} ${w.afternoon}` : null,
    l.end_half ? `${l.end_date.slice(8, 10)}/${l.end_date.slice(5, 7)} ${w.morning}` : null].filter(Boolean)
  const title = [w[l.type] || w.other, l.org].filter(Boolean).join(' · ') + (halves.length ? ` (${halves.join(', ')})` : '')
  return [
    'BEGIN:VEVENT', `UID:leave-${l.id}@avx`, `DTSTAMP:${utcValue(now.toISOString())}`,
    `DTSTART;VALUE=DATE:${dateValue(l.start_date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(l.end_date))}`,
    `SUMMARY:${escapeText(title)}`, 'TRANSP:OPAQUE', 'STATUS:CONFIRMED', 'END:VEVENT',
  ]
}

// One VEVENT per appointment: real times, or whole days when it's all day
export function appointmentEvent(a: FeedAppointment, lang: FeedLang, appUrl: string, now: Date) {
  const w = WORDS[lang] || WORDS.en
  const lines = ['BEGIN:VEVENT', `UID:appointment-${a.id}@avx`, `DTSTAMP:${utcValue(now.toISOString())}`]
  if (a.all_day && a.start_date) {
    lines.push(`DTSTART;VALUE=DATE:${dateValue(a.start_date)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(a.end_date || a.start_date))}`)
  } else if (!a.all_day && a.starts_at && a.ends_at) {
    lines.push(`DTSTART:${utcValue(a.starts_at)}`, `DTEND:${utcValue(a.ends_at)}`)
  } else {
    return []
  }
  lines.push(`SUMMARY:${escapeText([a.title, a.org].filter(Boolean).join(' · '))}`)
  if (a.place) lines.push(`LOCATION:${escapeText(a.place)}`)
  const url = `${appUrl}/me/appointments?a=${a.id}`
  const description = [w[a.kind] || w.appointment, a.notes || null, `${w.open}: ${url}`].filter(Boolean).join('\n')
  lines.push(`DESCRIPTION:${escapeText(description)}`, `URL:${url}`, 'STATUS:CONFIRMED', 'END:VEVENT')
  return lines
}

// One VEVENT per trip the person drives (or co-drives)
export function tripEvent(tr: FeedTrip, lang: FeedLang, appUrl: string, now: Date) {
  const w = WORDS[lang] || WORDS.en
  if (!tr.starts_at || !tr.ends_at) return []
  const title = [w[tr.role] || w.driver, tr.gig, tr.label].filter(Boolean).join(' · ')
  const lines = ['BEGIN:VEVENT', `UID:trip-${tr.id}@avx`, `DTSTAMP:${utcValue(now.toISOString())}`,
    `DTSTART:${utcValue(tr.starts_at)}`, `DTEND:${utcValue(tr.ends_at)}`, `SUMMARY:${escapeText(title)}`]
  if (tr.gig_id) lines.push(`DESCRIPTION:${escapeText(`${w.open}: ${appUrl}/gig/${tr.gig_id}`)}`, `URL:${appUrl}/gig/${tr.gig_id}`)
  lines.push(`STATUS:${tr.status === 'hold' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT')
  return lines
}

export function buildCalendar(gigs: FeedGig[], lang: FeedLang, appUrl: string, now = new Date(), leave: FeedLeave[] = [], zone = feedZone(gigs), appointments: FeedAppointment[] = [], trips: FeedTrip[] = []) {
  const w = WORDS[lang] || WORDS.en
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AVX//Gigs//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(w.calendar)}`, `X-WR-TIMEZONE:${zone}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const g of gigs) {
    if (g.status === 'archived' || g.status === 'cancelled') continue
    lines.push(...gigEvent(g, lang, appUrl, now, zone))
  }
  for (const l of leave) lines.push(...leaveEvent(l, lang, now))
  for (const a of appointments) lines.push(...appointmentEvent(a, lang, appUrl, now))
  for (const tr of trips) lines.push(...tripEvent(tr, lang, appUrl, now))
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

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
  status?: string | null // draft | confirmed | active | completed | archived
  org?: string | null
  role?: string | null // pm | crew | viewer
  function_title?: string | null
  call_time?: string | null // '09:30:00'
  booked_from?: string | null // timestamptz, this person's own booking
  booked_until?: string | null
}

const WORDS: Record<FeedLang, Record<string, string>> = {
  en: { calendar: 'AVX gigs', call: 'Call time', role: 'Role', open: 'Open in AVX', draft: 'Draft (not confirmed yet)', pm: 'Production manager', crew: 'Crew', viewer: 'Viewer' },
  pt: { calendar: 'Eventos AVX', call: 'Hora de chamada', role: 'Papel', open: 'Abrir no AVX', draft: 'Rascunho (ainda não confirmado)', pm: 'Diretor de produção', crew: 'Equipa', viewer: 'Leitor' },
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

// One VEVENT per gig: the person's own booking times when set, otherwise the gig's days (all day)
export function gigEvent(g: FeedGig, lang: FeedLang, appUrl: string, now: Date) {
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
    g.call_time ? `${w.call}: ${g.call_time.slice(0, 5)}` : null,
    `${w.open}: ${appUrl}/gig/${g.id}`,
  ].filter(Boolean).join('\n')
  lines.push(`DESCRIPTION:${escapeText(description)}`, `URL:${appUrl}/gig/${g.id}`)
  lines.push(`STATUS:${g.status === 'draft' ? 'TENTATIVE' : 'CONFIRMED'}`, 'END:VEVENT')
  return lines
}

export function buildCalendar(gigs: FeedGig[], lang: FeedLang, appUrl: string, now = new Date()) {
  const w = WORDS[lang] || WORDS.en
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AVX//Gigs//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(w.calendar)}`, 'X-WR-TIMEZONE:Europe/Lisbon', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const g of gigs) {
    if (g.status === 'archived') continue
    lines.push(...gigEvent(g, lang, appUrl, now))
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

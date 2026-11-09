// The organisation's time zone (U1): gig days, bookings and clashes are read in it.
// Lisbon is the default (organisations.time_zone defaults to it in the database).

export const DEFAULT_TIME_ZONE = 'Europe/Lisbon'

// Used when the browser can't list its time zones (Intl.supportedValuesOf is missing)
const FALLBACK = ['Europe/Lisbon', 'Atlantic/Azores', 'Atlantic/Madeira', 'Europe/London', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Rome', 'Europe/Zurich', 'Europe/Athens', 'America/Sao_Paulo',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Africa/Luanda', 'Africa/Maputo', 'Asia/Dubai',
  'Asia/Tokyo', 'Australia/Sydney', 'UTC']

export function isTimeZone(zone) {
  if (!zone || typeof zone !== 'string') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

// Every time zone the browser knows, sorted, with the current one always included
export function timeZoneList(current = DEFAULT_TIME_ZONE) {
  let list
  try {
    list = Intl.supportedValuesOf('timeZone')
  } catch {
    list = FALLBACK
  }
  const all = new Set([...list, DEFAULT_TIME_ZONE, 'UTC'])
  if (isTimeZone(current)) all.add(current)
  return [...all].sort()
}

// The device's own time zone
export const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

// Year, month (1–12), day, hour and minute of an instant on the wall clock of a time zone
export function zonedParts(date, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(date))
  const get = type => Number(parts.find(p => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') }
}

// A Date whose local fields show the zone's wall clock, so fmt(date, pattern) prints it in that zone.
// Without a zone the instant is returned as it is (the device's own time).
export function wallClock(date, zone) {
  const d = new Date(date)
  if (!zone || !isTimeZone(zone)) return d
  const p = zonedParts(d, zone)
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

// The instant when a zone's wall clock shows this day and time ('2027-01-10', '09:30').
// Without a zone, the device's own time.
export function zonedInstant(day, time = '00:00', zone) {
  const [y, mo, d] = day.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  if (!zone || !isTimeZone(zone)) return new Date(y, mo - 1, d, h, mi)
  const want = Date.UTC(y, mo - 1, d, h, mi)
  let guess = want
  // Two rounds settle the zone's offset, also on the days the clocks change
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(guess, zone)
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
    guess += want - shown
  }
  return new Date(guess)
}

// "2027-01-10T09:30" in a zone for <input type="datetime-local">, and back to an ISO instant
const pad = n => String(n).padStart(2, '0')
export function toZonedInput(value, zone) {
  if (!value) return ''
  const d = wallClock(value, zone)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromZonedInput(value, zone) {
  if (!value) return null
  const [day, time] = value.split('T')
  return zonedInstant(day, time || '00:00', zone).toISOString()
}

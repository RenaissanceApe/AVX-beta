// Time registration (ROADMAP step 8, docs/BUSINESS.md). Pure helpers, unit tested: Portuguese
// public holidays, the split of a logged day into normal, overtime, night, weekend and holiday
// hours, its cost from the agreed fee or the rate card, and prefilled times.
//
// Rules (decided with the owner, 2026-11-04):
// - Night hours fall in the organisation's window (default 22:00–07:00).
// - Holidays: Portugal's 13 national holidays plus the organisation's own days.
// - Each minute gets only its highest factor (no stacking); on a tie holiday > weekend > overtime > night.
// - Overtime starts once the worked time passes overtime_after_hours; the break is taken before
//   that, out of the cheapest minutes.
// - Hour fee: hours × rate × factor. Day (or half-day) fee: the rate for each day worked, plus
//   hourly equivalent (rate ÷ overtime_after_hours, or half of it) × overtime factor for overtime
//   hours and × (factor − 1) for night, weekend and holiday hours. Fixed fee: hours change nothing.
// - Travel time at the plain hourly rate (no factors); km × the organisation's km rate.
import { round2 } from './quotes'
import { DEFAULT_FACTORS } from './crewRates'

export const BUCKETS = ['normal', 'overtime', 'night', 'weekend', 'holiday']
export const DEFAULT_NIGHT = { night_from: '22:00', night_until: '07:00' }

const pad = n => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Easter Sunday (Gregorian, anonymous algorithm)
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

// Portugal's national public holidays: { 'YYYY-MM-DD': key } (keys are i18n ids under holidays.*)
export function ptHolidays(year) {
  const e = easter(year)
  return {
    [iso(year, 1, 1)]: 'new_year',
    [addDays(e, -2)]: 'good_friday',
    [e]: 'easter',
    [iso(year, 4, 25)]: 'freedom',
    [iso(year, 5, 1)]: 'labour',
    [addDays(e, 60)]: 'corpus_christi',
    [iso(year, 6, 10)]: 'portugal',
    [iso(year, 8, 15)]: 'assumption',
    [iso(year, 10, 5)]: 'republic',
    [iso(year, 11, 1)]: 'all_saints',
    [iso(year, 12, 1)]: 'independence',
    [iso(year, 12, 8)]: 'immaculate',
    [iso(year, 12, 25)]: 'christmas',
  }
}

// Is a day a holiday: national, or one of the organisation's own live days
export function isHoliday(day, orgHolidays = []) {
  if (!day) return false
  if (ptHolidays(Number(day.slice(0, 4)))[day]) return true
  return orgHolidays.some(h => !h.removed_at && h.day === day)
}

const isWeekend = day => [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())

// "HH:MM" or "HH:MM:SS" → minutes after midnight; null when empty or wrong
export function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}
export const fromMinutes = mins => `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`

// Minutes between start and end; an end at or before the start runs past midnight
export function spanMinutes(start, end) {
  const s = toMinutes(start), e = toMinutes(end)
  if (s == null || e == null) return null
  return e > s ? e - s : e + 1440 - s
}

function inNight(minuteOfDay, from, until) {
  if (from === until) return false
  return from < until ? minuteOfDay >= from && minuteOfDay < until : minuteOfDay >= from || minuteOfDay < until
}

const PRIORITY = { holiday: 4, weekend: 3, overtime: 2, night: 1, normal: 0 }

// The split of one logged day, in hours: { normal, overtime, night, weekend, holiday, worked,
// travel, driving, km }. Null when the times are missing or the break is longer than the shift.
export function splitEntry(entry, factors = DEFAULT_FACTORS, orgHolidays = []) {
  const span = spanMinutes(entry?.start_time, entry?.end_time)
  const brk = Math.max(0, Math.round(Number(entry?.break_minutes) || 0))
  if (span == null || !entry?.work_date || brk >= span) return null
  const f = { ...DEFAULT_FACTORS, ...DEFAULT_NIGHT, ...(factors || {}) }
  const nightFrom = toMinutes(f.night_from) ?? 1320, nightUntil = toMinutes(f.night_until) ?? 420
  const threshold = Math.round((Number(f.overtime_after_hours) || 10) * 60)
  const factorOf = { normal: 1, overtime: Number(f.overtime) || 1, night: Number(f.night) || 1, weekend: Number(f.weekend) || 1, holiday: Number(f.holiday) || 1 }
  const start = toMinutes(entry.start_time)
  const dayInfo = new Map()
  const info = day => {
    if (!dayInfo.has(day)) dayInfo.set(day, { weekend: isWeekend(day), holiday: isHoliday(day, orgHolidays) })
    return dayInfo.get(day)
  }
  // The bucket of each minute of the shift, before the break is taken out
  const minutes = []
  for (let i = 0; i < span; i++) {
    const abs = start + i
    const day = abs >= 1440 ? addDays(entry.work_date, 1) : entry.work_date
    const d = info(day)
    const applies = ['normal']
    if (d.holiday) applies.push('holiday')
    if (d.weekend) applies.push('weekend')
    if (i >= threshold + brk) applies.push('overtime')
    if (inNight(abs % 1440, nightFrom, nightUntil)) applies.push('night')
    applies.sort((a, b) => (factorOf[b] - factorOf[a]) || (PRIORITY[b] - PRIORITY[a]))
    minutes.push(applies[0])
  }
  const counts = Object.fromEntries(BUCKETS.map(b => [b, 0]))
  for (const b of minutes) counts[b]++
  // The break comes out of the cheapest minutes that aren't overtime
  let left = brk
  const cheapest = ['normal', 'night', 'weekend', 'holiday'].sort((a, b) => (factorOf[a] - factorOf[b]) || (PRIORITY[a] - PRIORITY[b]))
  for (const b of cheapest) {
    const take = Math.min(left, counts[b])
    counts[b] -= take
    left -= take
  }
  const h = mins => round2(mins / 60)
  const out = Object.fromEntries(BUCKETS.map(b => [b, h(counts[b])]))
  out.worked = h(span - brk)
  out.travel = h(Math.max(0, Number(entry.travel_minutes) || 0))
  out.driving = h(Math.max(0, Number(entry.driving_minutes) || 0))
  out.km = round2(Math.max(0, Number(entry.km) || 0))
  return out
}

// The fee that prices a day: the agreed fee, else the rate card (hour rate, else day, else half day)
export function pricing(fee, rate) {
  if (fee && fee.rate != null) return { unit: fee.unit, rate: Number(fee.rate), source: 'agreed' }
  if (rate?.hour_rate != null) return { unit: 'hour', rate: Number(rate.hour_rate), source: 'card' }
  if (rate?.day_rate != null) return { unit: 'day', rate: Number(rate.day_rate), source: 'card' }
  if (rate?.half_day_rate != null) return { unit: 'half_day', rate: Number(rate.half_day_rate), source: 'card' }
  return null
}

// The cost of one day from its split. Fixed fees: only the km (the fee itself is counted once per
// gig by personActual). Null when there's nothing to price it with.
export function entryCost(split, price, factors = DEFAULT_FACTORS) {
  if (!split || !price) return null
  const f = { ...DEFAULT_FACTORS, ...(factors || {}) }
  const km = round2(split.km * (Number(f.km_rate) || 0))
  if (price.unit === 'fixed') return { unit: 'fixed', rate: price.rate, hourly: null, cost: km }
  const threshold = Number(f.overtime_after_hours) || 10
  const factor = b => (b === 'normal' ? 1 : Number(f[b]) || 1)
  let hourly, cost
  if (price.unit === 'hour') {
    hourly = price.rate
    cost = BUCKETS.reduce((s, b) => s + split[b] * hourly * factor(b), 0)
  } else {
    hourly = price.rate / (price.unit === 'half_day' ? threshold / 2 : threshold)
    cost = split.worked > 0 ? price.rate : 0
    cost += split.overtime * hourly * factor('overtime')
    for (const b of ['night', 'weekend', 'holiday']) cost += split[b] * hourly * (factor(b) - 1)
  }
  // Travel and driving (step 23) at the plain hourly rate
  cost += (split.travel + (Number(split.driving) || 0)) * hourly + km
  return { unit: price.unit, rate: price.rate, hourly: round2(hourly), cost: round2(cost) }
}

// A person's actual cost on a gig from their approved days (their stored cost); a fixed fee counts
// once on top. Null when nothing is approved.
export function personActual(entries, fee) {
  const approved = (entries || []).filter(e => e.status === 'approved' && !e.removed_at)
  if (!approved.length) return null
  const days = round2(approved.reduce((s, e) => s + (Number(e.cost) || 0), 0))
  const fixed = fee && fee.unit === 'fixed' && fee.rate != null ? Number(fee.rate) : 0
  return round2(days + fixed)
}

// Hours totals over a list of entries (approved ones carry their stored split)
export function totals(entries, factors, orgHolidays) {
  const out = Object.fromEntries([...BUCKETS, 'worked', 'travel', 'driving', 'km', 'cost'].map(k => [k, 0]))
  let travelMinutes = 0, drivingMinutes = 0
  for (const e of entries || []) {
    if (e.removed_at) continue
    const s = e.status === 'approved' && e.split ? e.split : splitEntry(e, factors, orgHolidays)
    if (!s) continue
    for (const k of [...BUCKETS, 'worked', 'km']) out[k] = round2(out[k] + (Number(s[k]) || 0))
    travelMinutes += e.travel_minutes != null ? Number(e.travel_minutes) || 0 : (Number(s.travel) || 0) * 60
    drivingMinutes += e.driving_minutes != null ? Number(e.driving_minutes) || 0 : (Number(s.driving) || 0) * 60
    if (e.status === 'approved') out.cost = round2(out.cost + (Number(e.cost) || 0))
  }
  out.travel = round2(travelMinutes / 60)
  out.driving = round2(drivingMinutes / 60)
  return out
}

const localDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// Start and end to suggest for a day: the person's booking when it covers that day, else the
// gig's schedule for that day (first start, last end). Empty strings when nothing is known.
export function prefillTimes(member, schedule, day) {
  if (member?.booked_from && member?.booked_until) {
    const from = new Date(member.booked_from), until = new Date(member.booked_until)
    const fromDay = localDay(from), untilDay = localDay(until)
    if (fromDay <= day && day <= untilDay) {
      return { start_time: fromDay === day ? localTime(from) : '', end_time: untilDay === day ? localTime(until) : '' }
    }
  }
  const items = (schedule || []).filter(s => s.day === day && s.start_time)
  if (!items.length) return { start_time: '', end_time: '' }
  const starts = items.map(s => toMinutes(s.start_time)).filter(v => v != null)
  const ends = items.map(s => toMinutes(s.end_time ?? s.start_time)).filter(v => v != null)
  return { start_time: fromMinutes(Math.min(...starts)), end_time: fromMinutes(Math.max(...ends)) }
}

// Rows for the CSV download (one per logged day)
export function csvRows(entries, names = {}) {
  return (entries || []).filter(e => !e.removed_at).map(e => {
    const s = e.split || {}
    return {
      date: e.work_date, gig: e.gig_name ?? '', name: names[e.user_id] ?? '', start: String(e.start_time ?? '').slice(0, 5),
      end: String(e.end_time ?? '').slice(0, 5), break_minutes: e.break_minutes ?? 0, travel_minutes: e.travel_minutes ?? 0,
      driving_minutes: e.driving_minutes ?? 0, km: e.km ?? 0, status: e.status, normal: s.normal ?? '', overtime: s.overtime ?? '', night: s.night ?? '',
      weekend: s.weekend ?? '', holiday: s.holiday ?? '', cost: e.status === 'approved' ? (e.cost ?? '') : '',
    }
  })
}

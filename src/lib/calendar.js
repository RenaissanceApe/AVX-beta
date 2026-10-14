// Month calendar helpers (pure, unit tested). Weeks start on Monday.

const pad = n => String(n).padStart(2, '0')
export const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// 6 weeks x 7 days of 'YYYY-MM-DD' strings covering the given month (month is 0-based).
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => toDateStr(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d))))
}

// Gigs running on a day (inclusive of start and end date). Undated gigs are excluded.
export function gigsOnDay(gigs, day) {
  return gigs.filter(g => {
    if (!g.start_date) return false
    const end = g.end_date || g.start_date
    return g.start_date <= day && day <= end
  })
}

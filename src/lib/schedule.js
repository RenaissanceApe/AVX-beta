// Schedule / call-sheet helpers (pure, unit tested).

// '08:30:00' -> '08:30'
export function shortTime(t) {
  return t ? String(t).slice(0, 5) : ''
}

// Sorts items and groups them by day: [{ day: '2026-11-01', items: [...] }, ...]
export function groupByDay(items) {
  const sorted = [...items].sort((a, b) =>
    a.day.localeCompare(b.day) || String(a.start_time).localeCompare(String(b.start_time)))
  const groups = []
  for (const item of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.day === item.day) last.items.push(item)
    else groups.push({ day: item.day, items: [item] })
  }
  return groups
}

// Crew sorted for a call sheet: earliest call first, people without a call time last, then by name.
export function sortCrewForCallSheet(members, nameOf) {
  return [...members].sort((a, b) => {
    const ta = a.call_time || '99', tb = b.call_time || '99'
    return String(ta).localeCompare(String(tb)) || nameOf(a.user_id).localeCompare(nameOf(b.user_id))
  })
}

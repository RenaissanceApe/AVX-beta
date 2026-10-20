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

// The call sheet as sentences, for Read aloud (docs/HELP.md, H5): your own call first, then the
// running order day by day, then who else is on. t and fmt come from the app's language.
export function callSheetSpeech({ gig, schedule, crew, nameOf, me }, { t, fmt }) {
  const lines = [gig.name + '.']
  const where = [gig.venue, gig.start_date && fmt(gig.start_date, 'EEEE, d MMMM')].filter(Boolean)
  if (where.length) lines.push(where.join(', ') + '.')
  const mine = crew.find(m => m.user_id === me)
  if (mine?.call_time) lines.push(t('speak.yourCall', { time: shortTime(mine.call_time) }) + (mine.function_title ? `, ${mine.function_title}` : '') + '.')
  for (const g of groupByDay(schedule)) {
    lines.push(fmt(g.day, 'EEEE, d MMMM') + '.')
    for (const item of g.items) {
      const when = item.end_time
        ? t('speak.fromTo', { from: shortTime(item.start_time), to: shortTime(item.end_time) })
        : shortTime(item.start_time)
      lines.push(`${when}: ${item.title}` + (item.location ? `, ${t('speak.at', { place: item.location })}` : '') + '.')
      if (item.notes) lines.push(item.notes)
    }
  }
  const others = crew.filter(m => m.user_id !== me)
  if (others.length) {
    lines.push(t('speak.crew', { count: others.length }))
    for (const m of others) lines.push(nameOf(m.user_id) + (m.function_title ? `, ${m.function_title}` : '') + (m.call_time ? `, ${t('speak.call', { time: shortTime(m.call_time) })}` : '') + '.')
  }
  return lines.join('\n')
}

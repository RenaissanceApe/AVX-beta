// Human-readable activity log entries (pure, unit tested).

const STATUS = { draft: 'Draft', confirmed: 'Confirmed', active: 'Active', completed: 'Done', archived: 'Archived' }

export function describeActivity(entry, nameOf) {
  const d = entry.details || {}
  const actor = entry.actor_id ? nameOf(entry.actor_id) : 'Someone'
  switch (entry.action) {
    case 'asset_uploaded':    return `${actor} uploaded “${d.name}”`
    case 'asset_new_version': return `${actor} uploaded version ${d.version} of “${d.name}”`
    case 'asset_deleted':     return `${actor} deleted “${d.name}” (v${d.version})`
    case 'member_added':
      return d.user_id === entry.actor_id
        ? `${actor} joined${d.function_title ? ` as ${d.function_title}` : ''}`
        : `${actor} added ${nameOf(d.user_id)}${d.function_title ? ` as ${d.function_title}` : ''}`
    case 'member_removed':
      return d.user_id === entry.actor_id ? `${actor} left the gig` : `${actor} removed ${nameOf(d.user_id)}`
    case 'member_updated':    return `${actor} updated ${nameOf(d.user_id)}'s details${d.call_time ? ` (call ${String(d.call_time).slice(0, 5)})` : ''}`
    case 'schedule_insert':   return `${actor} added “${d.title}” to the schedule`
    case 'schedule_update':   return `${actor} changed “${d.title}” in the schedule`
    case 'schedule_delete':   return `${actor} removed “${d.title}” from the schedule`
    case 'gig_status':        return `${actor} changed the status from ${STATUS[d.from] || d.from} to ${STATUS[d.to] || d.to}`
    case 'gig_updated':       return `${actor} edited the gig's ${(d.changed || []).join(', ')}`
    default:                  return `${actor}: ${entry.action}`
  }
}

// Messaging helpers (docs/MESSAGING.md, M1): pure functions, tested in messages.test.js.

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi

// Text → pieces, with web addresses as links (nothing else is interpreted)
export function linkify(text) {
  const out = []
  let last = 0
  for (const m of String(text || '').matchAll(URL_RE)) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) })
    out.push({ type: 'link', value: m[0] })
    last = m.index + m[0].length
  }
  if (last < String(text || '').length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

const dayOf = iso => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Messages (oldest first) → rows to draw: a day marker when the day changes, and each
// message flagged when it continues the previous one (same author within 5 minutes)
export function layoutMessages(messages) {
  const rows = []
  let prev = null
  for (const m of messages) {
    const day = dayOf(m.created_at)
    if (!prev || dayOf(prev.created_at) !== day) rows.push({ type: 'day', day, key: `d-${day}` })
    const continues = !!prev && prev.kind === 'text' && m.kind === 'text' && prev.author_id === m.author_id
      && dayOf(prev.created_at) === day && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000 && !m.reply_to
    rows.push({ type: 'message', message: m, continues, key: m.id })
    prev = m
  }
  return rows
}

// Adds messages arriving live (or a page of older ones) without duplicates, oldest first
export function mergeMessages(list, incoming) {
  const byId = new Map(list.map(m => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export const totalUnread = conversations => (conversations || []).filter(c => !c.muted).reduce((s, c) => s + (c.unread || 0), 0)

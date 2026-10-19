// Messaging helpers (docs/MESSAGING.md, M1–M2): pure functions, tested in messages.test.js.

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

// ── M2 ───────────────────────────────────────────────────────────────────────

export const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅', '👀']
export const CARD_TYPES = ['gig', 'schedule', 'asset', 'quote', 'item']
export const MAX_FILES = 10
export const MAX_FILE_BYTES = 50 * 1024 * 1024

// A message needs text, so one that is only files or a card gets a short one. It's hidden
// when shown next to its files or card.
export function autoBody({ files = [], cardLabel = '' }) {
  if (files.length) return `📎 ${files.map(f => f.name).join(', ')}`.slice(0, 300)
  if (cardLabel) return `🔗 ${cardLabel}`
  return ''
}
export const isAutoBody = m => (m.attachments?.length > 0 || !!m.payload?.card) && /^(📎|🔗) /u.test(m.body || '')

// Typed "@Name" → mentions, from the candidates offered ({ label, mention }); longest labels
// first so "@Ana Rita" wins over "@Ana"
export function parseMentions(text, candidates) {
  const lower = String(text || '').toLowerCase()
  const found = []
  const taken = new Set()
  for (const c of [...candidates].sort((a, b) => b.label.length - a.label.length)) {
    const needle = `@${c.label.toLowerCase()}`
    let at = lower.indexOf(needle)
    while (at !== -1) {
      const before = at === 0 ? ' ' : lower[at - 1]
      const after = lower[at + needle.length] || ' '
      const overlaps = [...Array(needle.length).keys()].some(i => taken.has(at + i))
      if (/\s|[(]/.test(before) && !/[\p{L}\d]/u.test(after) && !overlaps) {
        for (let i = 0; i < needle.length; i++) taken.add(at + i)
        const key = JSON.stringify(c.mention)
        if (!found.some(f => JSON.stringify(f) === key)) found.push(c.mention)
        break
      }
      at = lower.indexOf(needle, at + 1)
    }
  }
  return found
}

// The "@word" being typed at the cursor, or null
export function mentionQuery(text, cursor) {
  const upto = String(text || '').slice(0, cursor)
  const m = upto.match(/(?:^|\s)@([\p{L}\d._ -]{0,30})$/u)
  if (!m) return null
  return { query: m[1], start: cursor - m[1].length - 1 }
}

// Active reaction rows → [{ emoji, count, mine, users }] in the fixed order
export function summarizeReactions(rows, userId) {
  return REACTIONS.map(emoji => {
    const on = rows.filter(r => r.emoji === emoji && r.active !== false)
    return { emoji, count: on.length, mine: on.some(r => r.user_id === userId), users: on.map(r => r.user_id) }
  }).filter(r => r.count > 0)
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

// Storage path for a file in a conversation: <conversation>/<random>/<safe name>
export function messageFilePath(conversationId, name, random) {
  const safe = String(name || 'file').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(-120) || 'file'
  return `${conversationId}/${random}/${safe}`
}

// Plain dates ("2026-11-13") → "13 Nov" or "13–15 Nov"; fmt formats one date in the UI language
export function dayRange(start, end, fmt) {
  if (!start) return ''
  if (!end || end === start) return fmt(start, 'd MMM')
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  return `${fmt(start, sameMonth ? 'd' : 'd MMM')}–${fmt(end, 'd MMM')}`
}

// Link to one message
export const messageLink = (origin, conversationId, messageId) => `${origin}/messages/${conversationId}?m=${messageId}`

// ── M3 ───────────────────────────────────────────────────────────────────────

// A department's name: the function as people typed it ("Sound"), or "Managers"
export const departmentLabel = (department, label, t) => (department === 'managers' ? t('chat.dept.managers') : label || (department ? department[0].toUpperCase() + department.slice(1) : ''))

// What a conversation is called in lists and headers (inbox rows from my_inbox)
export function conversationTitle(c, t) {
  if (!c) return ''
  if (c.kind === 'direct') return c.other_name || t('common.someone')
  if (c.kind === 'gig') return c.gig_name || t('common.someone')
  if (c.kind === 'department') return `${c.gig_name || ''} · ${departmentLabel(c.department, null, t)}`
  return c.title || ''
}
// Second line where it helps: the organisation of a channel or of a conversation about one thing
export const conversationContext = c => (c?.kind === 'org' || c?.kind === 'context' ? c.org_name || '' : '')

// Where the thing a conversation is about lives (an item, a repair, a subrental)
export function contextLink(c) {
  if (c?.kind !== 'context') return null
  if (c.context_type === 'item') return `/org/${c.org_id}/inventory/${c.context_id}`
  if (c.context_type === 'repair') return `/org/${c.org_id}/inventory?tab=maintenance&open=${c.context_id}`
  if (c.context_type === 'subrental') return `/org/${c.org_id}/inventory?tab=subrentals&open=${c.context_id}`
  return null
}


import { supabase } from './supabase'
import { logger } from './logger'
import { isNetworkError } from './offline'

// Messages written without a connection (docs/MESSAGING.md, M5a): kept on this device and sent
// when the connection comes back. Text only (files and cards need a connection). Each message
// gets its id here, so sending it twice can't post it twice.

export const OUTBOX_CHANGED = 'avx:outbox-changed'
const key = userId => `avx.outbox.${userId}`

export function readOutbox(userId) {
  try { return JSON.parse(localStorage.getItem(key(userId)) || '[]') } catch { return [] }
}

function write(userId, items) {
  try { localStorage.setItem(key(userId), JSON.stringify(items)) } catch { /* storage full or blocked */ }
  window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED, { detail: { sent: [] } }))
}

export function queueMessage(userId, message) {
  const item = { id: crypto.randomUUID(), queued_at: new Date().toISOString(), ...message }
  write(userId, [...readOutbox(userId), item])
  return item
}

export function dropQueued(userId, id) {
  write(userId, readOutbox(userId).filter(m => m.id !== id))
}

// Signing out on this device: what wasn't sent is removed with the rest of the offline data
export function clearOutbox(userId) {
  try { localStorage.removeItem(key(userId)) } catch { /* ignore */ }
}

let flushing = false

// Sends what's waiting, oldest first; stops at the first network failure. A message the server
// refuses (e.g. you left the gig meanwhile) is dropped and reported in `failed`.
export async function flushOutbox(userId) {
  if (flushing || !userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent: [], failed: [] }
  flushing = true
  const sent = []
  const failed = []
  try {
    for (const m of readOutbox(userId)) {
      const { data, error } = await supabase.from('messages').insert({
        id: m.id, conversation_id: m.conversation_id, body: m.body, reply_to: m.reply_to || null, mentions: m.mentions || [],
      }).select().single()
      if (error && isNetworkError(error)) break
      if (error && error.code !== '23505') {
        logger.error('outbox', error, { step: 'send' })
        failed.push(m)
      } else if (data) {
        sent.push(data)
      }
      // Sent (or already there from an earlier try), or refused: either way it leaves the outbox
      const rest = readOutbox(userId).filter(x => x.id !== m.id)
      try { localStorage.setItem(key(userId), JSON.stringify(rest)) } catch { /* ignore */ }
    }
  } finally {
    flushing = false
  }
  if (sent.length || failed.length) window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED, { detail: { sent, failed } }))
  return { sent, failed }
}

// Time registration (step 8): saving hours, the offline queue, approval and the CSV download.
// The maths is in timeRegistration.js.
import { supabase } from './supabase'
import { logger } from './logger'
import { isNetworkError } from './offline'
import { toCsv } from './orgExport'
import { csvRows, pricing, entryCost, splitEntry, BUCKETS } from './timeRegistration'

export const HOURS_COLUMNS = 'id, gig_id, user_id, work_date, start_time, end_time, break_minutes, travel_minutes, driving_minutes, km, note, status, review_note, reviewed_at, split, fee_unit, fee_rate, cost, removed_at'

// Hours typed without a connection: kept on this device and sent when it comes back. Each day
// gets its id here, so sending it twice keeps it once.
export const HOURS_QUEUE_CHANGED = 'avx:hours-queue-changed'
const key = userId => `avx.hoursQueue.${userId}`

export function readQueuedHours(userId) {
  try { return JSON.parse(localStorage.getItem(key(userId)) || '[]') } catch { return [] }
}
function writeQueued(userId, items) {
  try { localStorage.setItem(key(userId), JSON.stringify(items)) } catch { /* storage full or blocked */ }
  window.dispatchEvent(new CustomEvent(HOURS_QUEUE_CHANGED))
}
export function clearQueuedHours(userId) {
  try { localStorage.removeItem(key(userId)) } catch { /* ignore */ }
}

const rowOf = e => ({
  start_time: e.start_time, end_time: e.end_time, break_minutes: Number(e.break_minutes) || 0,
  travel_minutes: Number(e.travel_minutes) || 0, driving_minutes: Number(e.driving_minutes) || 0, km: Number(e.km) || 0, note: e.note?.trim() || null,
})

async function send(item) {
  if (item.isNew) {
    const { error } = await supabase.from('time_entries').insert({ id: item.id, gig_id: item.gig_id, user_id: item.user_id, work_date: item.work_date, ...rowOf(item) })
    // Already sent once: it went through
    if (error?.code === '23505') {
      const { data } = await supabase.from('time_entries').select('id').eq('id', item.id).maybeSingle()
      if (data) return null
    }
    return error
  }
  const { error } = await supabase.from('time_entries').update(rowOf(item)).eq('id', item.id)
  return error
}

// Saves a day (new when isNew). Without a connection it is queued: { queued: true }.
export async function saveHours(userId, item) {
  const entry = { ...item, id: item.id || crypto.randomUUID() }
  const error = await send(entry)
  if (error && isNetworkError(error)) {
    writeQueued(userId, [...readQueuedHours(userId).filter(q => q.id !== entry.id), { ...entry, queued_at: new Date().toISOString() }])
    return { queued: true, entry }
  }
  if (error) throw error
  return { queued: false, entry }
}

let flushing = false
// Sends what's waiting, oldest first; stops at the first network failure. A day the server
// refuses (e.g. it was approved meanwhile, or you left the gig) is dropped and counted in failed.
export async function flushQueuedHours(userId) {
  if (flushing || !userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent: 0, failed: 0 }
  flushing = true
  let sent = 0, failed = 0
  try {
    for (const item of readQueuedHours(userId)) {
      const error = await send(item)
      if (error && isNetworkError(error)) break
      if (error) { logger.error('hours', error, { step: 'flush' }); failed++ } else sent++
      writeQueued(userId, readQueuedHours(userId).filter(q => q.id !== item.id))
    }
  } finally {
    flushing = false
  }
  return { sent, failed }
}

// What approving a day stores: the split and cost worked out now, kept as they are
export function approval(entry, { fee, rate, factors, holidays }) {
  const split = splitEntry(entry, factors, holidays)
  if (!split) return null
  const priced = entryCost(split, pricing(fee, rate), factors)
  return {
    split: Object.fromEntries(BUCKETS.map(b => [b, split[b]])),
    fee_unit: priced?.unit ?? null, fee_rate: priced?.rate ?? null, cost: priced?.cost ?? null,
    preview: { ...split, cost: priced?.cost ?? null },
  }
}

export async function reviewHours(entry, approve, note, ctx) {
  const a = approve ? approval(entry, ctx) : null
  if (approve && !a) throw new Error('Hours missing')
  const { data, error } = await supabase.rpc('review_time_entry', {
    p_entry: entry.id, p_approve: approve, p_note: note?.trim() || null,
    p_split: a?.split ?? null, p_fee_unit: a?.fee_unit ?? null, p_fee_rate: a?.fee_rate ?? null, p_cost: a?.cost ?? null,
  })
  if (error) throw error
  return data
}

// Downloads the days as a semicolon CSV (like the app's other CSV files)
export function downloadHoursCsv(entries, names, fileName) {
  const rows = csvRows(entries, names)
  const columns = ['date', 'gig', 'name', 'start', 'end', 'break_minutes', 'travel_minutes', 'driving_minutes', 'km', 'status', ...BUCKETS, 'cost']
  const blob = new Blob(['﻿' + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

import { supabase } from './supabase'
import { logger } from './logger'
import { isNetworkError } from './offline'

// Rehearsal companion (docs/TOOLS_PLAN.md §2, R1): timecode maths, the shared clock, notes
// written offline, and the per-department report.

export const FRAME_RATES = [23.976, 24, 25, 29.97, 30]
export const DEPARTMENTS = ['sound', 'lighting', 'video', 'stage', 'sm', 'production', 'other']
export const PRIORITIES = ['note', 'fix', 'urgent']
export const CLOCKS = ['time_of_day', 'stopwatch']
export const QUICK = ['level', 'focus', 'lateCue', 'earlyCue', 'feedback', 'missing', 'colour', 'position']
const DAY = 86400000

// Timecode counts whole frames at the nominal rate (24 or 30 for 23.976 and 29.97); real time
// runs at the actual rate. Drop-frame (29.97 only) skips frame numbers 0 and 1 each minute,
// except every tenth minute, so the label keeps up with the clock on the wall.
const base = fps => Math.round(Number(fps))

export function framesToTc(frames, fps = 25, df = false) {
  const b = base(fps)
  let n = Math.max(0, Math.floor(frames))
  if (df && b === 30) {
    const per10 = 17982, perMin = 1798
    const tens = Math.floor(n / per10), rest = n % per10
    n += 18 * tens + (rest > 1 ? 2 * Math.floor((rest - 2) / perMin) : 0)
  }
  const f = n % b, s = Math.floor(n / b) % 60, m = Math.floor(n / (b * 60)) % 60, h = Math.floor(n / (b * 3600)) % 24
  const p = v => String(v).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(s)}${df && b === 30 ? ';' : ':'}${p(f)}`
}

export function tcToFrames(h, m, s, f, fps = 25, df = false) {
  const b = base(fps)
  let n = ((h * 60 + m) * 60 + s) * b + f
  if (df && b === 30) {
    const minutes = h * 60 + m
    n -= 2 * (minutes - Math.floor(minutes / 10))
  }
  return n
}

export const msToFrames = (ms, fps = 25) => Math.floor((Math.max(0, ms) * Number(fps)) / 1000 + 1e-6)
export const framesToMs = (frames, fps = 25) => Math.round((frames * 1000) / Number(fps))
export const msToTc = (ms, fps = 25, df = false) => framesToTc(msToFrames(((ms % DAY) + DAY) % DAY, fps), fps, df)

// "01:02:03:04", "1:2:3", "01:02:03;04", "010203" → milliseconds, or null when it can't be read
export function parseTc(text, fps = 25, df = false) {
  const raw = String(text || '').trim()
  if (!raw) return null
  let parts = raw.split(/[:;.\s]+/).filter(Boolean)
  if (parts.length === 1 && /^\d{6,8}$/.test(parts[0])) parts = parts[0].match(/\d{2}/g)
  if (parts.length < 3 || parts.length > 4 || parts.some(x => !/^\d{1,2}$/.test(x))) return null
  const [h, m, s, f = 0] = parts.map(Number)
  if (h > 23 || m > 59 || s > 59 || f >= base(fps)) return null
  if (df && base(fps) === 30 && s === 0 && f < 2 && m % 10 !== 0) return null
  return framesToMs(tcToFrames(h, m, s, f, fps, df), fps)
}

// Milliseconds since local midnight
export const timeOfDayMs = (date = new Date()) =>
  ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds()

// The shared clock: at server time anchor_at it read anchor_ms; offset = server − this phone
export function clockMs(session, offsetMs = 0, nowMs = Date.now()) {
  if (!session) return 0
  const anchor = Number(session.anchor_ms) || 0
  if (!session.running) return anchor
  const elapsed = nowMs + offsetMs - new Date(session.anchor_at).getTime()
  return Math.max(0, anchor + elapsed)
}

// What to send to move the clock: the reading wanted now, kept within the column's range
export const clampAnchor = ms => Math.min(2 * DAY, Math.max(0, Math.round(ms)))

// Server offset from one round trip: assume the answer was made half-way through
export function offsetFrom(serverIso, sentMs, receivedMs) {
  const server = new Date(serverIso).getTime()
  if (!Number.isFinite(server)) return 0
  return Math.round(server - (sentMs + receivedMs) / 2)
}

export async function measureOffset() {
  const sent = Date.now()
  const { data, error } = await supabase.rpc('server_now')
  if (error || !data) return 0
  return offsetFrom(data, sent, Date.now())
}

// A function on the gig ("FOH engineer", "LD", "Rigger") → the department its notes go under
const DEPT_WORDS = [
  ['sound', /\b(sound|audio|foh|monitor|mon|a1|a2|rf|pa|som|áudio|audio|microfone|mic)\b/i],
  ['lighting', /\b(light|lighting|ld|lx|lumin|luz|iluminação|desenhador de luz|operador de luz|dimmer|follow ?spot|seguidor)\b/i],
  ['video', /\b(video|vídeo|led|projection|projeção|camera|câmara|media server|vj)\b/i],
  ['stage', /\b(stage ?hand|stagehand|backline|rigger|rigging|carpenter|palco|maquinista|roadie|crew chief)\b/i],
  ['sm', /\b(stage manager|sm|asm|dsm|direção de cena|diretor de cena|contra-regra)\b/i],
  ['production', /\b(production|producer|pm|produção|produtor|tour manager|tm)\b/i],
]
export function departmentFor(functionTitle) {
  const text = String(functionTitle || '')
  for (const [dept, re] of DEPT_WORDS) if (re.test(text)) return dept
  return 'other'
}

// Filters on the live list
export function filterNotes(notes, { department = 'all', mine = false, open = false, userId } = {}) {
  return (notes || []).filter(n => !n.removed_at
    && (department === 'all' || n.department === department)
    && (!mine || n.author_id === userId || n.assignee_id === userId)
    && (!open || n.status === 'open'))
}

export const sortByTime = notes => [...(notes || [])].sort((a, b) => a.tc_ms - b.tc_ms || String(a.created_at).localeCompare(String(b.created_at)))

// The report: departments that have notes, each with its notes in time order
export function byDepartment(notes) {
  const live = sortByTime((notes || []).filter(n => !n.removed_at))
  return DEPARTMENTS.map(d => ({ department: d, notes: live.filter(n => n.department === d) })).filter(g => g.notes.length)
}

const csvCell = v => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function notesCsv(notes, session, { nameOf = () => '', label = k => k } = {}) {
  const df = session?.frame_count === 'df'
  const head = ['timecode', 'department', 'priority', 'cue', 'note', 'author', 'assignee', 'status']
  const rows = sortByTime((notes || []).filter(n => !n.removed_at)).map(n => [
    msToTc(n.tc_ms, session?.fps, df), label(`rehearsal.dept.${n.department}`), label(`rehearsal.priority.${n.priority}`),
    n.cue || '', n.body, nameOf(n.author_id), n.assignee_id ? nameOf(n.assignee_id) : '', label(`rehearsal.status.${n.status}`),
  ])
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
}

// The file the cueing app (and later R3) reads: plain JSON, times in frames and milliseconds
export function notesExport(notes, session, gig) {
  const df = session?.frame_count === 'df'
  return {
    format: 'avx-rehearsal', version: 1,
    gig: { id: gig?.id, name: gig?.name },
    session: { id: session?.id, name: session?.name, fps: Number(session?.fps), drop_frame: df },
    notes: sortByTime((notes || []).filter(n => !n.removed_at)).map(n => ({
      id: n.id, timecode: msToTc(n.tc_ms, session?.fps, df), frames: msToFrames(n.tc_ms, session?.fps), ms: n.tc_ms,
      department: n.department, priority: n.priority, cue: n.cue || null, text: n.body, status: n.status,
    })),
  }
}

// ── Notes written without a connection ─────────────────────────────────────
// Kept on this phone and sent when the connection comes back. Each note has its client_id from
// the start, so sending it twice keeps it once. Photos need a connection.
export const REHEARSAL_OUTBOX_CHANGED = 'avx:rehearsal-outbox-changed'
const key = userId => `avx.rehearsalOutbox.${userId}`

export function readQueuedNotes(userId) {
  try { return JSON.parse(localStorage.getItem(key(userId)) || '[]') } catch { return [] }
}
function writeQueued(userId, items) {
  try { localStorage.setItem(key(userId), JSON.stringify(items)) } catch { /* storage full or blocked */ }
  window.dispatchEvent(new CustomEvent(REHEARSAL_OUTBOX_CHANGED))
}
export function queueNote(userId, note) {
  writeQueued(userId, [...readQueuedNotes(userId).filter(n => n.client_id !== note.client_id), note])
}
export function clearQueuedNotes(userId) {
  try { localStorage.removeItem(key(userId)) } catch { /* ignore */ }
}

// The row a note is sent as (only the columns a person may set)
export const noteRow = n => ({
  session_id: n.session_id, gig_id: n.gig_id, client_id: n.client_id, tc_ms: n.tc_ms,
  department: n.department, priority: n.priority, cue: n.cue || null, body: n.body || '',
  photo_path: n.photo_path || null, assignee_id: n.assignee_id || null,
})

let flushing = false
export async function flushQueuedNotes(userId) {
  if (flushing || !userId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent: 0, failed: 0 }
  flushing = true
  let sent = 0, failed = 0
  try {
    for (const n of readQueuedNotes(userId)) {
      const { error } = await supabase.from('rehearsal_notes').insert(noteRow(n))
      if (error && isNetworkError(error)) break
      if (error && error.code !== '23505') { logger.error('rehearsal', error, { step: 'flush' }); failed++ } else sent++
      writeQueued(userId, readQueuedNotes(userId).filter(x => x.client_id !== n.client_id))
    }
  } finally {
    flushing = false
  }
  return { sent, failed }
}

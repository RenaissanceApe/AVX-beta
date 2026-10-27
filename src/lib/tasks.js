// Tasks (docs/TOOLS_PLAN.md build order step 5, T1): who does what by when, on a gig or for the
// organisation, with a small checklist. Pure helpers for the lists.

export const TASK_FIELDS = 'id, gig_id, org_id, title, notes, assignee_id, due_on, checklist, status, done_by, done_at, source_kind, source_id, created_by, created_at, removed_at'

// How urgent an open task is: 'overdue', 'today', 'soon' (within 3 days) or null
export function dueState(task, today) {
  if (!task?.due_on || task.status === 'done') return null
  if (task.due_on < today) return 'overdue'
  if (task.due_on === today) return 'today'
  const soon = new Date(`${today}T12:00:00Z`)
  soon.setUTCDate(soon.getUTCDate() + 3)
  return task.due_on <= soon.toISOString().slice(0, 10) ? 'soon' : null
}

// Open first; then by due date (none last); then oldest first. Done ones last, newest done first.
export function sortTasks(tasks) {
  return [...(tasks || [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    if (a.status === 'done') return String(b.done_at || '').localeCompare(String(a.done_at || ''))
    if ((a.due_on || '9999') !== (b.due_on || '9999')) return (a.due_on || '9999').localeCompare(b.due_on || '9999')
    return String(a.created_at).localeCompare(String(b.created_at))
  })
}

export function filterTasks(tasks, { mine = false, open = false, userId } = {}) {
  return (tasks || []).filter(t => !t.removed_at && (!mine || t.assignee_id === userId) && (!open || t.status === 'open'))
}

// "2/5" for a checklist, or null when there is none
export function checklistProgress(list) {
  const items = Array.isArray(list) ? list : []
  if (!items.length) return null
  return { done: items.filter(i => i.done).length, total: items.length }
}

// Checklist lines from typed text: one per line, empty lines dropped, kept to 50 of 200 characters
export function checklistFromText(text, previous = []) {
  const before = new Map((previous || []).map(i => [i.text, i]))
  return String(text || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 50).map(line => {
    const t = line.slice(0, 200)
    return before.get(t) || { id: crypto.randomUUID().slice(0, 8), text: t, done: false }
  })
}

export const toggleItem = (list, id) => (list || []).map(i => (i.id === id ? { ...i, done: !i.done } : i))

// A task from a rehearsal note: its text (cut to fit) and the same assignee
export function taskFromNote(note, cueLabel) {
  const head = [note.cue, note.body].filter(Boolean).join(' · ') || cueLabel || ''
  const title = head.length > 200 ? `${head.slice(0, 197)}…` : head
  return {
    gig_id: note.gig_id, title, notes: head.length > 200 ? note.body : '', assignee_id: note.assignee_id || null,
    source_kind: 'rehearsal_note', source_id: note.id,
  }
}

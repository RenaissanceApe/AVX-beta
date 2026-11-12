import { supabase } from './supabase'
import { createSaveQueue } from './saveQueue'
import { updateIfUnchanged } from './staleSave'

// The saves that write a whole object, queued so an older one can never land after a newer one
// (lib/saveQueue.js). One queue for the whole app, so two screens saving the same thing also wait
// for each other.

// A gig's show model (gig_show), e.g. saveShow(gig.id, { audio }). Each field tool saves a whole
// part of it, so a save only goes through if the row is still as this device last saw it
// (issue 236): otherwise someone else changed it and the result is { conflict } instead of
// overwriting their change. A tool tells the saver what it loaded with noteShowLoaded(gigId, res),
// res being the gig_show select result (it must include updated_at). After each save of its own,
// the device moves its copy of updated_at on, so its own queued saves never conflict with each
// other. One queue per gig: saves of different parts wait for each other and are sent together.
export function createShowSaver(client) {
  const stamps = new Map() // gigId → the updated_at this device last saw; null: no row yet

  async function send(gigId, values) {
    if (!stamps.has(gigId)) return { error: null, conflict: 'stale' } // never loaded here: reload first
    const stamp = stamps.get(gigId)
    if (stamp === null) {
      const { data, error } = await client.from('gig_show').insert({ gig_id: gigId, ...values }).select('updated_at')
      // Someone else made the row since this device looked
      if (error?.code === '23505') return { error: null, conflict: 'stale' }
      if (error) return { error }
      if (data?.[0]) stamps.set(gigId, data[0].updated_at)
      return { error: null, updatedAt: data?.[0]?.updated_at }
    }
    const res = await updateIfUnchanged(client, 'gig_show', gigId, values, stamp, 'updated_at', 'gig_id')
    if (res.error) return { error: res.error }
    if (res.conflict) return { error: null, conflict: res.conflict }
    stamps.set(gigId, res.updatedAt)
    return { error: null, updatedAt: res.updatedAt }
  }

  const queue = createSaveQueue(send)
  return {
    saveShow: (gigId, values) => queue(gigId, values),
    noteShowLoaded(gigId, res) {
      if (!res || res.error) return
      if (!res.data) stamps.set(gigId, null)
      else if (res.data.updated_at) stamps.set(gigId, res.data.updated_at)
      else stamps.delete(gigId) // loaded without the stamp: can't be checked, so saves ask for a reload
    },
  }
}
const show = createShowSaver(supabase)
export const saveShow = show.saveShow
export const noteShowLoaded = show.noteShowLoaded

// A task's fields (a tick, its status): returns the new updated_at in `data`
const taskQueue = createSaveQueue((id, values) => supabase.from('tasks').update(values).eq('id', id).select('updated_at'))
export const saveTask = (taskId, values) => taskQueue(taskId, values)

// One checklist item ticked or unticked, on the server (issue 236): only that item changes, so two
// people ticking items on the same task keep both ticks. Queued per item, so quick ticks and
// unticks of one item land in order. Returns { data: { checklist, updated_at }, last } where
// `last` is true when no other tick for this task is still on its way (so the screen can take the
// server's list without undoing a tick it is still sending).
export function createChecklistTicker(client) {
  const pending = new Map() // taskId → ticks on their way
  const queue = createSaveQueue((key, { taskId, itemId, done }) =>
    client.rpc('set_task_checklist_item', { p_task_id: taskId, p_item_id: itemId, p_done: done }))
  return async function tickChecklistItem(taskId, itemId, done) {
    pending.set(taskId, (pending.get(taskId) || 0) + 1)
    const res = await queue(`${taskId}:${itemId}`, { taskId, itemId, done })
    const left = pending.get(taskId) - 1
    if (left) pending.set(taskId, left)
    else pending.delete(taskId)
    const row = Array.isArray(res.data) ? res.data[0] : res.data
    return { error: res.error || null, data: row || null, last: left === 0 }
  }
}
export const tickChecklistItem = createChecklistTicker(supabase)

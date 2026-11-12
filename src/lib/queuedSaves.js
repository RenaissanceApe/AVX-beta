import { supabase } from './supabase'
import { createSaveQueue } from './saveQueue'

// The saves that write a whole object, queued so an older one can never land after a newer one
// (lib/saveQueue.js). One queue for the whole app, so two screens saving the same thing also wait
// for each other.

// A gig's show model (gig_show): one column per call, e.g. saveShow(gig.id, { audio })
const showQueue = createSaveQueue((key, values) => supabase.from('gig_show').upsert({ gig_id: key.split(':')[0], ...values }))
export const saveShow = (gigId, values) => showQueue(`${gigId}:${Object.keys(values).sort().join(',')}`, values)

// A task's fields (a tick, its checklist): returns the new updated_at in `data`
const taskQueue = createSaveQueue((id, values) => supabase.from('tasks').update(values).eq('id', id).select('updated_at'))
export const saveTask = (taskId, values) => taskQueue(taskId, values)

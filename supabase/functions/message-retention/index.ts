// message-retention: deletes messages older than their organisation's retention period, and
// their files, for good (docs/MESSAGING.md, M6b). Called each night by pg_cron through
// private.run_message_retention(), with the key kept in job_keys; nobody else can call it.
//
// Files go first: a message is deleted only once its files are gone, so nothing is left behind
// that nobody can see any more. Direct conversations are never touched. Logs carry counts only.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchWithTimeout, isTimeout } from '../_shared/timeout.ts'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  global: { fetch: fetchWithTimeout }, auth: { persistSession: false },
})
const BATCH = 500
const MAX_BATCHES = 20 // up to 10,000 messages a night; the rest the next night

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Constant-time comparison for the job key
function sameKey(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const { data: key, error: keyError } = await admin.from('job_keys').select('secret').eq('name', 'message_retention').maybeSingle()
  if (isTimeout(keyError)) return json({ error: 'timeout' }, 504)
  if (!key || !sameKey(req.headers.get('x-job-key') ?? '', key.secret)) return json({ error: 'Forbidden' }, 403)

  let deleted = 0, files = 0, failed = 0
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: due, error } = await admin.rpc('retention_due', { p_limit: BATCH })
    if (error) {
      console.error(JSON.stringify({ fn: 'message-retention', step: 'due', message: error.message }))
      return json({ error: 'Could not list messages' }, 500)
    }
    if (!due?.length) break

    // Files first; a message whose files couldn't be removed stays for the next night
    const ready: string[] = []
    for (const m of due as { id: string; paths: string[] }[]) {
      if (!m.paths.length) { ready.push(m.id); continue }
      const { error: removeError } = await admin.storage.from('message-files').remove(m.paths)
      if (removeError) { failed++; continue }
      files += m.paths.length
      ready.push(m.id)
    }
    if (!ready.length) break
    const { data: count, error: deleteError } = await admin.rpc('retention_delete', { p_ids: ready })
    if (deleteError) {
      console.error(JSON.stringify({ fn: 'message-retention', step: 'delete', message: deleteError.message }))
      return json({ error: 'Could not delete messages', deleted, files }, 500)
    }
    deleted += Number(count) || 0
    if (due.length < BATCH) break
  }

  console.log(JSON.stringify({ fn: 'message-retention', step: 'done', deleted, files, failed }))
  return json({ deleted, files, failed })
})

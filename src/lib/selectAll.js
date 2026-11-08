// Reads every row of a list query, 1000 at a time. Supabase's API returns at most 1000 rows
// per request (its default limit), so a plain select on a big table quietly drops the rest.
// `build` makes a fresh query each time (with a stable order, ending in a unique column such
// as id); the result has the same { data, error } shape as a normal query.
// With { retry: true } each request is tried once more after a short pause when the server was
// only briefly unwell (see isTransient); reports use this (selectReport).
export const PAGE_ROWS = 1000
export const RETRY_PAUSE_MS = 1500

export async function selectAll(build, pageRows = PAGE_ROWS, { retry = false, pause = RETRY_PAUSE_MS } = {}) {
  const rows = []
  for (let from = 0; ; from += pageRows) {
    const page = () => build().range(from, from + pageRows - 1)
    const { data, error } = retry ? await retryOnce(page, pause) : await page()
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageRows) return { data: rows, error: null }
  }
}

// A report's rows: selectAll, trying each request once more on a brief server failure
export function selectReport(build, pageRows = PAGE_ROWS) {
  return selectAll(build, pageRows, { retry: true })
}

// Worth one more try: a server error (5xx), a statement that ran out of time (Postgres 57014)
// or no answer at all (status 0: network failure or aborted request). Never a 4xx, so a
// permission or input error is shown at once.
export function isTransient({ error, status } = {}) {
  if (!error) return false
  if (error.code === '57014') return true
  if (typeof status === 'number') return status === 0 || status >= 500
  return false
}

// Runs a Supabase request (a function returning { data, error, status }); if it failed in a
// way worth retrying, waits `pause` ms and runs it once more, returning that second result.
export async function retryOnce(run, pause = RETRY_PAUSE_MS) {
  const first = await run()
  if (!isTransient(first)) return first
  await new Promise(resolve => setTimeout(resolve, pause))
  return run()
}

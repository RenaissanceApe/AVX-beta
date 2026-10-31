// Reads every row of a list query, 1000 at a time. Supabase's API returns at most 1000 rows
// per request (its default limit), so a plain select on a big table quietly drops the rest.
// `build` makes a fresh query each time (with a stable order, ending in a unique column such
// as id); the result has the same { data, error } shape as a normal query.
export const PAGE_ROWS = 1000

export async function selectAll(build, pageRows = PAGE_ROWS) {
  const rows = []
  for (let from = 0; ; from += pageRows) {
    const { data, error } = await build().range(from, from + pageRows - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageRows) return { data: rows, error: null }
  }
}

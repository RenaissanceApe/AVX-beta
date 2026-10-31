import { describe, expect, it } from 'vitest'
import { selectAll } from './selectAll'

// A stand-in for a Supabase query over `rows`, recording each range asked for
function fakeTable(rows, { failAt } = {}) {
  const calls = []
  const build = () => ({
    range: async (from, to) => {
      calls.push([from, to])
      if (failAt === from) return { data: null, error: { message: 'boom' } }
      return { data: rows.slice(from, to + 1), error: null }
    },
  })
  return { build, calls }
}

describe('selectAll', () => {
  it('returns a short list in one request', async () => {
    const { build, calls } = fakeTable([1, 2, 3])
    expect(await selectAll(build, 10)).toEqual({ data: [1, 2, 3], error: null })
    expect(calls).toEqual([[0, 9]])
  })

  it('keeps reading until a page comes back short', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => i)
    const { build, calls } = fakeTable(rows)
    expect((await selectAll(build, 10)).data).toEqual(rows)
    expect(calls).toEqual([[0, 9], [10, 19], [20, 29]])
  })

  it('asks once more when the last page is exactly full', async () => {
    const { build, calls } = fakeTable(Array.from({ length: 20 }, (_, i) => i))
    expect((await selectAll(build, 10)).data).toHaveLength(20)
    expect(calls).toHaveLength(3)
  })

  it('returns the error and no rows when a page fails', async () => {
    const { build } = fakeTable(Array.from({ length: 25 }, (_, i) => i), { failAt: 10 })
    expect(await selectAll(build, 10)).toEqual({ data: null, error: { message: 'boom' } })
  })

  it('treats an empty table as an empty list', async () => {
    const { build } = fakeTable([])
    expect(await selectAll(build)).toEqual({ data: [], error: null })
  })
})

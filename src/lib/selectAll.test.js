import { describe, expect, it } from 'vitest'
import { selectAll, isTransient, retryOnce } from './selectAll'

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

// A request that answers with each of `answers` in turn (the last one repeats)
function fakeRequests(answers) {
  let calls = 0
  const run = async () => answers[Math.min(calls++, answers.length - 1)]
  return { run, calls: () => calls }
}
const ok = { data: [1, 2], error: null, status: 200 }
const timedOut = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' }, status: 500 }

describe('isTransient', () => {
  it('retries server errors, statement timeouts and network failures', () => {
    expect(isTransient(timedOut)).toBe(true)
    expect(isTransient({ error: { code: '57014' } })).toBe(true)
    expect(isTransient({ error: { message: 'Bad gateway' }, status: 502 })).toBe(true)
    expect(isTransient({ error: { message: 'FetchError: Failed to fetch', code: '' }, status: 0 })).toBe(true)
  })

  it('never retries a success, a 4xx or a permission error', () => {
    expect(isTransient(ok)).toBe(false)
    expect(isTransient({ error: { code: '42501', message: 'permission denied' }, status: 403 })).toBe(false)
    expect(isTransient({ error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 })).toBe(false)
    expect(isTransient({ error: { code: '22P02', message: 'invalid input' }, status: 400 })).toBe(false)
    expect(isTransient({ error: { message: 'boom' } })).toBe(false)
  })
})

describe('retryOnce', () => {
  it('returns a success at once', async () => {
    const r = fakeRequests([ok])
    expect(await retryOnce(r.run, 0)).toBe(ok)
    expect(r.calls()).toBe(1)
  })

  it('tries once more after a brief server failure', async () => {
    const r = fakeRequests([timedOut, ok])
    expect(await retryOnce(r.run, 0)).toBe(ok)
    expect(r.calls()).toBe(2)
  })

  it('gives up after the second failure', async () => {
    const r = fakeRequests([timedOut])
    expect(await retryOnce(r.run, 0)).toBe(timedOut)
    expect(r.calls()).toBe(2)
  })

  it('does not retry a permission error', async () => {
    const denied = { data: null, error: { code: '42501' }, status: 403 }
    const r = fakeRequests([denied, ok])
    expect(await retryOnce(r.run, 0)).toBe(denied)
    expect(r.calls()).toBe(1)
  })
})

describe('selectAll with retry', () => {
  // A table whose page at `from` fails `times` times with `failure` before answering
  function flakyTable(rows, { from: failFrom = 0, times = 1, failure = timedOut } = {}) {
    let failures = 0
    const calls = []
    const build = () => ({
      range: async (from, to) => {
        calls.push([from, to])
        if (from === failFrom && failures < times) { failures++; return failure }
        return { data: rows.slice(from, to + 1), error: null, status: 200 }
      },
    })
    return { build, calls }
  }

  it('tries a failed page once more and carries on', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => i)
    const { build, calls } = flakyTable(rows, { from: 10 })
    expect(await selectAll(build, 10, { retry: true, pause: 0 })).toEqual({ data: rows, error: null })
    expect(calls).toEqual([[0, 9], [10, 19], [10, 19], [20, 29]])
  })

  it('returns the error when the page fails twice', async () => {
    const { build, calls } = flakyTable([1, 2, 3], { times: 2 })
    expect(await selectAll(build, 10, { retry: true, pause: 0 })).toEqual({ data: null, error: timedOut.error })
    expect(calls).toHaveLength(2)
  })

  it('does not retry without the option', async () => {
    const { build, calls } = flakyTable([1, 2, 3])
    expect((await selectAll(build, 10)).error).toEqual(timedOut.error)
    expect(calls).toHaveLength(1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// A fake gig-assets bucket: folder name → file names; list returns at most `limit`
const bucket = {}
const calls = { list: 0, remove: [] }
let failList = false
let failRemove = false
vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        list: async (folder, { limit }) => {
          calls.list++
          if (failList) return { data: null, error: { message: 'list failed' } }
          return { data: (bucket[folder] || []).slice(0, limit).map(name => ({ id: name, name })), error: null }
        },
        remove: async paths => {
          calls.remove.push(paths.length)
          if (failRemove) return { error: { message: 'remove failed' } }
          for (const p of paths) {
            const [folder, name] = p.split('/')
            bucket[folder] = bucket[folder].filter(n => n !== name)
          }
          return { error: null }
        },
      }),
    },
  },
}))
vi.mock('./logger', () => ({ logger: { error: vi.fn() } }))
const { removeGigFiles, LIST_LIMIT } = await import('./storage')

const files = n => Array.from({ length: n }, (_, i) => `f${i}.pdf`)

beforeEach(() => {
  for (const k of Object.keys(bucket)) delete bucket[k]
  calls.list = 0
  calls.remove = []
  failList = false
  failRemove = false
})

describe('removeGigFiles', () => {
  it('clears a gig with more files than one listing returns', async () => {
    bucket.g1 = files(LIST_LIMIT * 2 + 5)
    await removeGigFiles(['g1'])
    expect(bucket.g1).toEqual([])
    expect(calls.remove).toEqual([LIST_LIMIT, LIST_LIMIT, 5])
  })

  it('clears every gig it is given, and skips empty ones without removing', async () => {
    bucket.a = files(3)
    bucket.b = []
    await removeGigFiles(['a', 'b'])
    expect(bucket.a).toEqual([])
    expect(calls.remove).toEqual([3])
  })

  it('stops a gig on a listing error instead of retrying', async () => {
    bucket.g1 = files(5)
    failList = true
    await removeGigFiles(['g1'])
    expect(calls.list).toBe(1)
    expect(bucket.g1).toHaveLength(5)
  })

  it('stops a gig on a removal error instead of retrying', async () => {
    bucket.g1 = files(LIST_LIMIT)
    failRemove = true
    await removeGigFiles(['g1'])
    expect(calls.remove).toEqual([LIST_LIMIT])
  })
})

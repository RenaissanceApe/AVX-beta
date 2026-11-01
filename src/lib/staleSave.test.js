import { describe, expect, it, vi } from 'vitest'
import { updateIfUnchanged, notifyConflict } from './staleSave'

// A stand-in for one Supabase table holding a single row, recording the filters used
function fakeClient(row, { failUpdate, failRead, canEdit = true } = {}) {
  const calls = []
  const client = {
    from: table => ({
      update: changes => {
        const filters = {}
        const q = {
          eq: (col, val) => { filters[col] = val; return q },
          select: async columns => {
            calls.push({ table, changes, filters, columns })
            if (failUpdate) return { data: null, error: { message: 'boom' } }
            const match = row && canEdit && Object.entries(filters).every(([k, v]) => row[k] === v)
            if (!match) return { data: [], error: null }
            Object.assign(row, changes, { updated_at: 'T2' })
            return { data: [columns === 'updated_at' ? { updated_at: row.updated_at } : { ...row }], error: null }
          },
        }
        return q
      },
      select: () => ({
        eq: () => ({
          maybeSingle: async () => failRead
            ? { data: null, error: { message: 'read' } }
            : { data: row ? { updated_at: row.updated_at } : null, error: null },
        }),
      }),
    }),
  }
  return { client, calls }
}

describe('updateIfUnchanged', () => {
  it('saves when the record is as it was opened', async () => {
    const row = { id: 'g1', name: 'Old', updated_at: 'T1' }
    const { client, calls } = fakeClient(row)
    expect(await updateIfUnchanged(client, 'gigs', 'g1', { name: 'New' }, 'T1')).toEqual({ updatedAt: 'T2', row: { updated_at: 'T2' } })
    expect(row.name).toBe('New')
    expect(calls[0].filters).toEqual({ id: 'g1', updated_at: 'T1' })
  })

  it('returns the saved record when asked for more columns', async () => {
    const { client, calls } = fakeClient({ id: 'p1', name: 'Old', updated_at: 'T1' })
    const result = await updateIfUnchanged(client, 'price_items', 'p1', { name: 'New' }, 'T1', '*')
    expect(result.row).toEqual({ id: 'p1', name: 'New', updated_at: 'T2' })
    expect(calls[0].columns).toBe('*')
  })

  it('refuses a stale save and leaves the record alone', async () => {
    const row = { id: 'g1', name: 'Theirs', updated_at: 'T2' }
    const { client } = fakeClient(row)
    expect(await updateIfUnchanged(client, 'gigs', 'g1', { name: 'Mine' }, 'T1')).toEqual({ conflict: 'stale' })
    expect(row.name).toBe('Theirs')
  })

  it('asks for a reload when the copy has no stamp', async () => {
    const { client, calls } = fakeClient({ id: 'g1', updated_at: 'T1' })
    expect(await updateIfUnchanged(client, 'gigs', 'g1', { name: 'Mine' }, undefined)).toEqual({ conflict: 'stale' })
    expect(calls).toEqual([])
  })

  it('says when the record is gone', async () => {
    const { client } = fakeClient(null)
    expect(await updateIfUnchanged(client, 'gigs', 'g1', { name: 'Mine' }, 'T1')).toEqual({ conflict: 'gone' })
  })

  it('says when the record is unchanged but may not be edited', async () => {
    const { client } = fakeClient({ id: 'g1', updated_at: 'T1' }, { canEdit: false })
    expect(await updateIfUnchanged(client, 'gigs', 'g1', { name: 'Mine' }, 'T1')).toEqual({ conflict: 'denied' })
  })

  it('passes request errors through', async () => {
    expect(await updateIfUnchanged(fakeClient({ id: 'g1' }, { failUpdate: true }).client, 'gigs', 'g1', {}, 'T1'))
      .toEqual({ error: { message: 'boom' } })
    expect(await updateIfUnchanged(fakeClient({ id: 'g1', updated_at: 'T2' }, { failRead: true }).client, 'gigs', 'g1', {}, 'T1'))
      .toEqual({ error: { message: 'read' } })
  })
})

describe('notifyConflict', () => {
  const t = key => key
  it('offers a reload for a stale save', () => {
    const notify = vi.fn()
    notifyConflict('stale', notify, t)
    expect(notify).toHaveBeenCalledWith('error.staleSave', 'error', expect.objectContaining({ action: expect.objectContaining({ label: 'error.reload' }) }))
  })
  it('uses plain messages for the other cases', () => {
    const notify = vi.fn()
    notifyConflict('gone', notify, t)
    notifyConflict('denied', notify, t)
    expect(notify.mock.calls).toEqual([['error.recordGone', 'error', undefined], ['error.permission', 'error', undefined]])
  })
})

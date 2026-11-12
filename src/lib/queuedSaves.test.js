import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { createShowSaver, createChecklistTicker } = await import('./queuedSaves')

// A stand-in for gig_show holding at most one row per gig. Each write waits until the test lets
// it finish (`gate`), so the queue can be watched; `stamp` makes each write's new updated_at.
function fakeShowDb(rows = {}, { gate = false } = {}) {
  let n = 0
  const writes = []
  const waiting = []
  const later = fn => (gate ? new Promise(resolve => waiting.push(() => resolve(fn()))) : Promise.resolve(fn()))
  const client = {
    from: () => ({
      insert: row => ({
        select: () => later(() => {
          writes.push({ kind: 'insert', row })
          if (rows[row.gig_id]) return { data: null, error: { code: '23505', message: 'duplicate key' } }
          rows[row.gig_id] = { ...row, updated_at: `T${++n}` }
          return { data: [{ updated_at: rows[row.gig_id].updated_at }], error: null }
        }),
      }),
      update: changes => {
        const filters = {}
        const q = {
          eq: (col, val) => { filters[col] = val; return q },
          select: () => later(() => {
            writes.push({ kind: 'update', changes, filters: { ...filters } })
            const row = rows[filters.gig_id]
            if (!row || row.updated_at !== filters.updated_at) return { data: [], error: null }
            Object.assign(row, changes, { updated_at: `T${++n}` })
            return { data: [{ updated_at: row.updated_at }], error: null }
          }),
        }
        return q
      },
      select: () => ({
        eq: (col, val) => ({ maybeSingle: async () => ({ data: rows[val] ? { updated_at: rows[val].updated_at } : null, error: null }) }),
      }),
    }),
  }
  const release = async () => { await Promise.resolve(); waiting.shift()?.() ; await new Promise(r => setTimeout(r, 0)) }
  return { client, rows, writes, release, bump: gig => { rows[gig].updated_at = `X${++n}` } }
}

describe('saveShow (stale guard)', () => {
  it('saves when the row is as it was loaded, and moves its stamp on', async () => {
    const db = fakeShowDb({ g: { gig_id: 'g', audio: {}, updated_at: 'T0' } })
    const { saveShow, noteShowLoaded } = createShowSaver(db.client)
    noteShowLoaded('g', { data: { audio: {}, updated_at: 'T0' }, error: null })
    expect(await saveShow('g', { audio: { boxes: [1] } })).toEqual({ error: null, updatedAt: 'T1' })
    expect(db.writes[0].filters).toEqual({ gig_id: 'g', updated_at: 'T0' })
    // The next save expects the stamp this device just wrote
    expect(await saveShow('g', { audio: { boxes: [2] } })).toEqual({ error: null, updatedAt: 'T2' })
    expect(db.writes[1].filters.updated_at).toBe('T1')
    expect(db.rows.g.audio).toEqual({ boxes: [2] })
  })

  it("doesn't overwrite someone else's change", async () => {
    const db = fakeShowDb({ g: { gig_id: 'g', lighting: { bars: ['theirs'] }, updated_at: 'T0' } })
    const { saveShow, noteShowLoaded } = createShowSaver(db.client)
    noteShowLoaded('g', { data: { updated_at: 'T0' }, error: null })
    db.bump('g') // another phone saved in between
    expect(await saveShow('g', { lighting: { bars: ['mine'] } })).toEqual({ error: null, conflict: 'stale' })
    expect(db.rows.g.lighting).toEqual({ bars: ['theirs'] })
    // and keeps refusing until the tool loads again
    expect((await saveShow('g', { lighting: { bars: ['mine'] } })).conflict).toBe('stale')
  })

  it('makes the row when there was none, and refuses if someone else made it first', async () => {
    const db = fakeShowDb()
    const a = createShowSaver(db.client)
    const b = createShowSaver(db.client)
    a.noteShowLoaded('g', { data: null, error: null })
    b.noteShowLoaded('g', { data: null, error: null })
    expect(await a.saveShow('g', { stage: { w: 10 } })).toEqual({ error: null, updatedAt: 'T1' })
    expect(await b.saveShow('g', { stage: { w: 12 } })).toEqual({ error: null, conflict: 'stale' })
    expect(db.rows.g.stage).toEqual({ w: 10 })
    // a goes on updating with the stamp of the row it made
    expect((await a.saveShow('g', { stage: { w: 11 } })).updatedAt).toBe('T2')
  })

  it('asks for a reload when nothing (or no stamp) was loaded on this device', async () => {
    const db = fakeShowDb({ g: { gig_id: 'g', updated_at: 'T0' } })
    const { saveShow, noteShowLoaded } = createShowSaver(db.client)
    expect((await saveShow('g', { power: {} })).conflict).toBe('stale')
    noteShowLoaded('g', { data: { power: {} }, error: null })
    expect((await saveShow('g', { power: {} })).conflict).toBe('stale')
    expect(db.writes).toHaveLength(0)
  })

  it("ignores a failed load, keeping what it knew", async () => {
    const db = fakeShowDb({ g: { gig_id: 'g', updated_at: 'T0' } })
    const { saveShow, noteShowLoaded } = createShowSaver(db.client)
    noteShowLoaded('g', { data: { updated_at: 'T0' }, error: null })
    noteShowLoaded('g', { data: null, error: { message: 'offline' } })
    expect((await saveShow('g', { power: {} })).updatedAt).toBe('T1')
  })

  it("queues a device's own quick saves without them conflicting with each other (BF1 order kept)", async () => {
    const db = fakeShowDb({ g: { gig_id: 'g', updated_at: 'T0' } }, { gate: true })
    const { saveShow, noteShowLoaded } = createShowSaver(db.client)
    noteShowLoaded('g', { data: { updated_at: 'T0' }, error: null })
    const p1 = saveShow('g', { audio: { v: 1 } })
    const p2 = saveShow('g', { audio: { v: 2 } })
    const p3 = saveShow('g', { audio: { v: 3 }, lighting: { v: 1 } }) // another part of the same gig waits too
    await db.release() // the first save lands
    await db.release() // then the merged one, with the new stamp
    expect(await p1).toEqual({ error: null, updatedAt: 'T1' })
    expect(await p2).toEqual({ error: null, merged: true })
    expect(await p3).toEqual({ error: null, updatedAt: 'T2' })
    expect(db.writes.map(w => w.filters.updated_at)).toEqual(['T0', 'T1'])
    expect(db.writes[1].changes).toEqual({ audio: { v: 3 }, lighting: { v: 1 } })
    expect(db.rows.g).toMatchObject({ audio: { v: 3 }, lighting: { v: 1 } })
  })

  it('keeps gigs apart', async () => {
    const db = fakeShowDb({ g: { gig_id: 'g', updated_at: 'T0' }, h: { gig_id: 'h', updated_at: 'H0' } })
    const { saveShow, noteShowLoaded } = createShowSaver(db.client)
    noteShowLoaded('g', { data: { updated_at: 'T0' }, error: null })
    noteShowLoaded('h', { data: { updated_at: 'H0' }, error: null })
    await saveShow('g', { audio: {} })
    expect((await saveShow('h', { audio: {} })).conflict).toBeUndefined()
  })
})

describe('tickChecklistItem', () => {
  function fakeRpc() {
    const calls = []
    const client = { rpc: (name, args) => new Promise(resolve => calls.push({ name, args, finish: r => resolve(r) })) }
    return { client, calls }
  }
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('sends one item, not the list, and returns the saved list', async () => {
    const { client, calls } = fakeRpc()
    const tickItem = createChecklistTicker(client)
    const p = tickItem('t1', 'a', true)
    expect(calls[0]).toMatchObject({ name: 'set_task_checklist_item', args: { p_task_id: 't1', p_item_id: 'a', p_done: true } })
    calls[0].finish({ data: [{ checklist: [{ id: 'a', done: true }], updated_at: 'T1' }], error: null })
    expect(await p).toEqual({ error: null, data: { checklist: [{ id: 'a', done: true }], updated_at: 'T1' }, last: true })
  })

  it('sends quick ticks of one item in order, only the latest after the first', async () => {
    const { client, calls } = fakeRpc()
    const tickItem = createChecklistTicker(client)
    const p1 = tickItem('t1', 'a', true)
    const p2 = tickItem('t1', 'a', false)
    const p3 = tickItem('t1', 'a', true)
    expect(calls).toHaveLength(1)
    calls[0].finish({ data: [{ checklist: [], updated_at: 'T1' }], error: null })
    await tick()
    expect(calls).toHaveLength(2)
    expect(calls[1].args.p_done).toBe(true)
    expect((await p1).last).toBe(false)
    calls[1].finish({ data: [{ checklist: [], updated_at: 'T2' }], error: null })
    expect((await p2).data).toBeNull()
    expect((await p3).last).toBe(true)
  })

  it("ticks different items at once, and says when the task's last tick is back", async () => {
    const { client, calls } = fakeRpc()
    const tickItem = createChecklistTicker(client)
    const pa = tickItem('t1', 'a', true)
    const pb = tickItem('t1', 'b', true)
    expect(calls).toHaveLength(2)
    calls[0].finish({ data: [{ checklist: [], updated_at: 'T1' }], error: null })
    expect((await pa).last).toBe(false)
    calls[1].finish({ data: null, error: { code: 'P0002', message: 'That checklist item was removed' } })
    const b = await pb
    expect(b.last).toBe(true)
    expect(b.error.code).toBe('P0002')
  })
})

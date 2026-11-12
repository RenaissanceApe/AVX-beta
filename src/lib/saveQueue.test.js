import { describe, it, expect } from 'vitest'
import { createSaveQueue } from './saveQueue'

// A fake network: each send waits until the test lets it finish
function fakeSend() {
  const calls = []
  const send = (key, values) => new Promise(resolve => calls.push({ key, values, finish: (r = { error: null }) => resolve(r) }))
  return { calls, send }
}
const tick = () => new Promise(r => setTimeout(r, 0))

describe('createSaveQueue', () => {
  it('sends the first save at once', async () => {
    const { calls, send } = fakeSend()
    const save = createSaveQueue(send)
    const p = save('a', { list: [1] })
    expect(calls).toHaveLength(1)
    calls[0].finish({ error: null, data: 'ok' })
    expect(await p).toEqual({ error: null, data: 'ok' })
  })

  it('waits for the save before it, then sends only the latest state', async () => {
    const { calls, send } = fakeSend()
    const save = createSaveQueue(send)
    const p1 = save('a', { list: [true, false] })
    const p2 = save('a', { list: [true, true] })
    const p3 = save('a', { list: [false, true] })
    expect(calls).toHaveLength(1)
    calls[0].finish()
    await tick()
    expect(calls).toHaveLength(2)
    expect(calls[1].values).toEqual({ list: [false, true] })
    calls[1].finish({ error: null, data: 'last' })
    expect(await p1).toEqual({ error: null })
    expect(await p2).toEqual({ error: null, merged: true })
    expect(await p3).toEqual({ error: null, data: 'last' })
  })

  it('merges different fields waiting for the same key', async () => {
    const { calls, send } = fakeSend()
    const save = createSaveQueue(send)
    save('t', { status: 'done' })
    save('t', { checklist: [1] })
    save('t', { notes: 'x', checklist: [2] })
    calls[0].finish()
    await tick()
    expect(calls[1].values).toEqual({ checklist: [2], notes: 'x' })
  })

  it('keeps keys apart', () => {
    const { calls, send } = fakeSend()
    const save = createSaveQueue(send)
    save('a', { v: 1 })
    save('b', { v: 2 })
    expect(calls.map(c => c.key)).toEqual(['a', 'b'])
  })

  it('goes on after a failed or thrown save, and passes the error to its caller', async () => {
    const save = createSaveQueue(async (key, values) => {
      if (values.v === 1) throw new Error('offline')
      return { error: null, v: values.v }
    })
    const p1 = save('a', { v: 1 })
    const p2 = save('a', { v: 2 })
    expect((await p1).error.message).toBe('offline')
    expect(await p2).toEqual({ error: null, v: 2 })
    expect(await save('a', { v: 3 })).toEqual({ error: null, v: 3 })
  })
})

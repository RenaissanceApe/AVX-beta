import { describe, it, expect, vi, afterEach } from 'vitest'
import { later, cancel, flush, flushAll, isWaiting, UNDO_MS } from './undo'

describe('undo: changes wait before they are sent', () => {
  afterEach(() => vi.useRealTimers())

  it('runs once the time is up, not before', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    later('a', run)
    vi.advanceTimersByTime(UNDO_MS - 1)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(isWaiting('a')).toBe(false)
  })

  it('undo means it never runs', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    later('b', run)
    expect(cancel('b')).toBe(true)
    vi.advanceTimersByTime(UNDO_MS * 2)
    expect(run).not.toHaveBeenCalled()
    expect(cancel('b')).toBe(false)
  })

  it('leaving the page sends everything waiting, once', () => {
    vi.useFakeTimers()
    const one = vi.fn(); const two = vi.fn()
    later('c', one); later('d', two)
    flushAll()
    expect(one).toHaveBeenCalledTimes(1)
    expect(two).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(UNDO_MS)
    expect(one).toHaveBeenCalledTimes(1)
    expect(flush('c')).toBe(false)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout, isTimeout, runBudget, withTimeout } from '../../supabase/functions/_shared/timeout.ts'

// A service that never answers, but stops when the request is aborted (as fetch does)
const hangingFetch = (_url, init) => new Promise((_, reject) => {
  init.signal.addEventListener('abort', () => reject(init.signal.reason))
})

afterEach(() => vi.unstubAllGlobals())

describe('Edge Function timeouts', () => {
  it('gives up on a service that never answers, naming only the host', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = await fetchWithTimeout('https://api.brevo.com/v3/smtp/email?id=secret', {}, 20).catch(e => e)
    expect(err.name).toBe('AbortError')
    expect(err.message).toBe('api.brevo.com timed out after 20 ms')
    expect(isTimeout(err)).toBe(true)
    expect(log.mock.calls[0][0]).not.toContain('secret')
    log.mockRestore()
  })

  it('passes answers and other failures through unchanged', async () => {
    const ok = new Response('{}')
    vi.stubGlobal('fetch', vi.fn(async () => ok))
    expect(await fetchWithTimeout('https://example.org', {}, 20)).toBe(ok)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('connection refused') }))
    const err = await fetchWithTimeout('https://example.org', {}, 20).catch(e => e)
    expect(err.message).toBe('connection refused')
    expect(isTimeout(err)).toBe(false)
  })

  it('caps calls that are not a fetch', async () => {
    const err = await withTimeout(new Promise(() => {}), 'push service', 20).catch(e => e)
    expect(err.message).toBe('push service timed out after 20 ms')
    expect(await withTimeout(Promise.resolve(3), 'x', 20)).toBe(3)
  })

  it('tells a batch job when its time is up', () => {
    vi.useFakeTimers()
    const overBudget = runBudget(1000)
    expect(overBudget()).toBe(false)
    vi.advanceTimersByTime(999)
    expect(overBudget()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(overBudget()).toBe(true)
    vi.useRealTimers()
  })

  it('recognises a timeout returned as a Supabase error', () => {
    expect(isTimeout({ message: 'AbortError: abc.supabase.co timed out after 10000 ms', code: '' })).toBe(true)
    expect(isTimeout({ message: 'permission denied', code: '42501' })).toBe(false)
    expect(isTimeout(null)).toBe(false)
  })
})

// Time limits for every call out of an Edge Function (Brevo, push services, VIES, Nominatim and
// Supabase itself), so a slow service makes the function give up with a clear answer instead of
// hanging until the platform stops it. Give a Supabase client fetchWithTimeout as its global fetch
// ({ global: { fetch: fetchWithTimeout } }) and its database, auth and storage calls get it too:
// they then come back with an error instead of throwing, and isTimeout(error) tells which ones.
// No retries here: whether a call is safe to repeat is up to the caller.

export const TIMEOUT_MS = 10_000

// Named AbortError rather than TimeoutError on purpose: supabase-js retries a read that fails with
// any other error up to 3 times, which would turn 10 s into 40 s or more.
export function timeoutError(what: string, ms: number) {
  return new DOMException(`${what} timed out after ${ms} ms`, 'AbortError')
}

// True for our own timeouts, and for a response body that was still arriving when time ran out
// (the platform's "Signal timed out"), whether thrown or returned as a Supabase error
export function isTimeout(err: unknown) {
  return /timed out/i.test(String((err as { message?: unknown } | null)?.message ?? ''))
}

export async function fetchWithTimeout(input: string | URL | Request, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const timer = AbortSignal.timeout(ms)
  const signal = init.signal ? AbortSignal.any([init.signal, timer]) : timer
  try {
    return await fetch(input, { ...init, signal })
  } catch (err) {
    if (!timer.aborted) throw err
    // The host only: paths and queries can carry ids or tokens
    const host = new URL(input instanceof Request ? input.url : input).host
    console.error(JSON.stringify({ fn: 'timeout', step: 'fetch', host, ms }))
    throw timeoutError(host, ms)
  }
}

// For calls that aren't a fetch we make ourselves (the web-push library). Stops waiting after `ms`;
// the call itself may still finish in the background.
export async function withTimeout<T>(promise: Promise<T>, what: string, ms = TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeoutError(what, ms)), ms) })
  try {
    return await Promise.race([promise, late])
  } finally {
    clearTimeout(timer)
  }
}

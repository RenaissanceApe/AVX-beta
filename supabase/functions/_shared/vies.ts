// What VIES answered (its REST API, check-vat-number), in the shape AVX records.
// Some countries don't share the name or address and send "---" instead.

export type ViesResult = { valid: boolean, name: string | null, address: string | null, error: string | null }

const clean = (v: unknown) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  return s && !/^-+$/.test(s) ? s.slice(0, 300) : null
}

export function readVies(body: unknown): ViesResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const wrappers = Array.isArray(b.errorWrappers) ? b.errorWrappers as Array<Record<string, unknown>> : []
  if (wrappers.length || b.actionSucceed === false) {
    const code = String(wrappers[0]?.error ?? 'UNKNOWN').replace(/[^A-Z0-9_]/gi, '').slice(0, 60) || 'UNKNOWN'
    return { valid: false, name: null, address: null, error: code }
  }
  if (typeof b.valid !== 'boolean') return { valid: false, name: null, address: null, error: 'UNKNOWN' }
  return { valid: b.valid, name: b.valid ? clean(b.name) : null, address: b.valid ? clean(b.address) : null, error: null }
}

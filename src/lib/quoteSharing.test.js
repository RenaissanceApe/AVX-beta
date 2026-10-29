import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { sendAttempt } = await import('./quoteSharing')

describe('sendAttempt', () => {
  it('starts a send with a fresh key and no version yet', () => {
    const a = sendAttempt(null, { email: ' Client@Co.pt ', sendEmail: true })
    expect(a.key).toMatch(/^[0-9a-f-]{36}$/)
    expect(a).toMatchObject({ email: 'client@co.pt', sendEmail: true, versionId: null })
  })

  it('reuses the key and the saved version on a retry of the same send', () => {
    const first = { ...sendAttempt(null, { email: 'client@co.pt', sendEmail: true }), versionId: 'v1' }
    expect(sendAttempt(first, { email: 'CLIENT@co.pt ', sendEmail: true })).toBe(first)
  })

  it('starts a new send when the address or the choice changes', () => {
    const first = { ...sendAttempt(null, { email: 'client@co.pt', sendEmail: true }), versionId: 'v1' }
    const other = sendAttempt(first, { email: 'boss@co.pt', sendEmail: true })
    expect(other.key).not.toBe(first.key)
    expect(other.versionId).toBe(null)
    expect(sendAttempt(first, { email: 'client@co.pt', sendEmail: false }).key).not.toBe(first.key)
  })

  it('a finished send (null) means the next click is a new send', () => {
    const a = sendAttempt(null, { email: '', sendEmail: false })
    const b = sendAttempt(null, { email: '', sendEmail: false })
    expect(a.key).not.toBe(b.key)
  })
})

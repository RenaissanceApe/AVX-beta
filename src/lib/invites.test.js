import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { inviteMessage } = await import('./invites')

describe('inviteMessage', () => {
  it('says the invite was already emailed when a second request is turned away', () => {
    const msg = inviteMessage('crew@co.pt', { result: 'invited', emailed: false, email_error: 'already_sent' })
    expect(msg.kind).toBe('info')
    expect(msg.text).toContain('crew@co.pt')
    expect(msg.text).toMatch(/already/i)
  })

  it('says the email may or may not have gone out when the email service timed out', () => {
    vi.stubGlobal('window', { location: { origin: 'https://avx.test' } })
    const msg = inviteMessage('crew@co.pt', { result: 'invited', emailed: false, email_error: 'timeout' })
    expect(msg.kind).toBe('info')
    expect(msg.text).toMatch(/may or may not/)
    expect(msg.text).toContain('https://avx.test/auth')
    vi.unstubAllGlobals()
  })

  it('still reports an emailed invite as a success', () => {
    expect(inviteMessage('crew@co.pt', { result: 'invited', emailed: true }).kind).toBe('success')
  })
})

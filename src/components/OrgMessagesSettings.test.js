import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
const { shortensRetention } = await import('./OrgMessagesSettings')

describe('message retention', () => {
  it('asks for the deletion warning only when a period can delete messages', () => {
    expect(shortensRetention(null, 365)).toBe(true) // from "for ever" to a period
    expect(shortensRetention(730, 90)).toBe(true) // shorter
    expect(shortensRetention(90, 365)).toBe(false) // longer: nothing goes
    expect(shortensRetention(365, null)).toBe(false) // back to "for ever"
    expect(shortensRetention(null, null)).toBe(false)
  })
})

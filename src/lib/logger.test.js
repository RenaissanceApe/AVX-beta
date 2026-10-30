import { describe, it, expect } from 'vitest'
import { userMessage } from './logger'

describe('userMessage', () => {
  it('maps common failures to readable text', () => {
    expect(userMessage(new TypeError('Failed to fetch'))).toMatch(/Network problem/)
    expect(userMessage({ message: 'timeout' })).toMatch(/took too long/)
    expect(userMessage({ message: 'new row violates row-level security policy for table "gigs"' })).toMatch(/permission/)
    expect(userMessage({ message: 'new row for relation "gigs" violates check constraint "gigs_dates_order"' })).toMatch(/End date/)
    expect(userMessage({ message: 'violates check constraint "feed_posts_content_length"' })).toMatch(/too long/)
    expect(userMessage({ message: 'New password should be different from the old password.' })).toMatch(/current password/)
  })
  it('falls back for empty errors and passes other messages through', () => {
    expect(userMessage(null)).toMatch(/Something went wrong/)
    expect(userMessage({ message: 'Invalid email address' })).toBe('Invalid email address')
  })
})

import { describe, it, expect } from 'vitest'
import { rangeText, describe as describeNote, zoneFor, zoneIds, DEFAULT_ZONE } from '../../supabase/functions/_shared/notification-text.ts'

// The email summary and push wording read times on the organisation's clock (U1)
describe('notification times', () => {
  it('reads whole days and times in Lisbon by default, as before', () => {
    expect(DEFAULT_ZONE).toBe('Europe/Lisbon')
    expect(rangeText('2027-01-10T00:00:00Z', '2027-01-12T00:00:00Z', 'en')).toBe('10 Jan – 11 Jan')
    expect(rangeText('2027-01-10T09:00:00Z', '2027-01-10T18:00:00Z', 'en')).toBe('10 Jan, 09:00 – 18:00')
  })

  it('reads a New York or London organisation on its own clock, naming it', () => {
    expect(rangeText('2027-01-10T05:00:00Z', '2027-01-12T05:00:00Z', 'en', 'America/New_York')).toBe('10 Jan – 11 Jan')
    expect(rangeText('2027-01-10T14:00:00Z', '2027-01-10T23:00:00Z', 'en', 'America/New_York')).toBe('10 Jan, 09:00 – 18:00 (America/New_York)')
    expect(rangeText('2027-07-10T08:00:00Z', '2027-07-10T17:00:00Z', 'pt', 'Europe/London')).toMatch(/^10.*, 09:00 – 18:00 \(Europe\/London\)$/)
    // An unknown zone falls back to Lisbon instead of failing the whole email
    expect(rangeText('2027-01-10T09:00:00Z', '2027-01-10T18:00:00Z', 'en', 'Mars/Base')).toBe('10 Jan, 09:00 – 18:00')
  })

  it('picks the gig\'s organisation, then the notification\'s, then Lisbon', () => {
    const gigs = { g1: 'America/New_York' }
    const orgs = { o1: 'Europe/London' }
    expect(zoneFor({ gig_id: 'g1', org_id: 'o1' }, gigs, orgs)).toBe('America/New_York')
    expect(zoneFor({ gig_id: null, org_id: 'o1' }, gigs, orgs)).toBe('Europe/London')
    expect(zoneFor({ gig_id: 'g9', org_id: null }, gigs, orgs)).toBe('Europe/Lisbon')
    expect(zoneIds([
      { kind: 'availability_request', gig_id: 'g1', org_id: 'o1' },
      { kind: 'booking_changed', gig_id: 'g1', org_id: null },
      { kind: 'message', gig_id: 'g2', org_id: 'o2' },
    ])).toEqual({ gigIds: ['g1'], orgIds: ['o1'] })
  })

  it('writes a booking change in the organisation\'s time', () => {
    const n = { id: 1, user_id: 'u', gig_id: 'g1', org_id: null, actor_id: null, kind: 'booking_changed', created_at: '',
      details: { gig_name: 'NY gig', booked_from: '2027-01-10T14:00:00Z', booked_until: '2027-01-10T23:00:00Z' } }
    expect(describeNote(n, 'en', 'Ana', 'America/New_York')).toContain('10 Jan, 09:00 – 18:00 (America/New_York)')
  })
})

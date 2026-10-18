import { describe, it, expect } from 'vitest'
import { describeNotification, notificationLink, countsAsUnread } from './notifications'

const nameOf = id => ({ u1: 'Ana' }[id] || 'Someone')

describe('notifications', () => {
  it('describes notifications', () => {
    expect(describeNotification({ kind: 'asset_new_version', actor_id: 'u1', details: { name: 'Patch', version: 2, gig_name: 'NOS' } }, nameOf))
      .toBe('Ana uploaded version 2 of “Patch” on NOS')
    expect(describeNotification({ kind: 'added_to_gig', actor_id: null, details: { gig_name: 'NOS', role: 'crew' } }, nameOf))
      .toBe('Someone added you to NOS as Crew')
    expect(describeNotification({ kind: 'call_time_changed', details: { gig_name: 'NOS', call_time: '09:30:00' } }, nameOf))
      .toBe('Your call time for NOS is now 09:30')
  })
  it('links to the right place', () => {
    expect(notificationLink({ gig_id: 'g1', kind: 'schedule_changed' })).toBe('/gig/g1?tab=schedule')
    expect(notificationLink({ gig_id: 'g1', kind: 'asset_uploaded' })).toBe('/gig/g1')
    expect(notificationLink({ org_id: 'o1', kind: 'added_to_org' })).toBe('/dashboard')
    expect(notificationLink({ org_id: 'o1', gig_id: 'g1', kind: 'damage_reported' })).toBe('/org/o1/inventory?tab=maintenance')
    expect(notificationLink({ org_id: 'o1', kind: 'inspection_due' })).toBe('/org/o1/inventory?tab=maintenance')
  })
  it('describes maintenance', () => {
    expect(describeNotification({ kind: 'damage_reported', actor_id: 'u1', details: { item_name: 'Speaker', unit_code: 'U-1', gig_name: 'NOS', excerpt: 'Cracked' } }, nameOf))
      .toBe('Ana reported damage to Speaker · U-1 on NOS: “Cracked”')
    expect(describeNotification({ kind: 'inspection_due', details: { count: 3, org_name: 'L&P' } }, nameOf))
      .toBe('3 inspections due soon in L&P')
  })
})

describe('deletion notices', () => {
  it('describes deleted gigs and organisations and links to the dashboard', () => {
    expect(describeNotification({ kind: 'gig_deleted', actor_id: 'u1', details: { gig_name: 'NOS' } }, nameOf)).toBe('Ana deleted the gig NOS')
    expect(describeNotification({ kind: 'org_deleted', actor_id: 'u1', details: { org_name: 'SoundWorks' } }, nameOf)).toBe('Ana deleted the organisation SoundWorks')
    expect(notificationLink({ kind: 'gig_deleted', gig_id: null })).toBe('/dashboard')
  })
})

describe('quote notifications', () => {
  it('describes an accepted quote and links to it', () => {
    const n = { kind: 'quote_accepted', org_id: 'o', details: { quote_id: 'q1', client_name: 'Ana', number: 'Q0012', quote_title: 'Gala' } }
    expect(describeNotification(n, () => '')).toContain('Ana')
    expect(describeNotification(n, () => '')).toContain('Q0012')
    expect(notificationLink(n)).toBe('/quote/q1')
  })
})

describe('usage screen names', () => {
  it('keeps the screen and drops ids', async () => {
    const { screenEvent } = await import('./usage')
    expect(screenEvent('/gig/3f2a9c1e-1111-4111-8111-111111111111', '?tab=crew')).toBe('view:gig/crew')
    expect(screenEvent('/org/3f2a9c1e-1111-4111-8111-111111111111/quotes')).toBe('view:org-quotes')
    expect(screenEvent('/quote/abc12345-0000-4000-8000-000000000000/print', '?v=xyz')).toBe('view:quote-print')
    expect(screenEvent('/q/sometoken')).toBe(null)
    expect(screenEvent('/gig/x', '?tab=<script>')).toBe('view:gig')
    expect(screenEvent('/auth')).toBe(null)
    expect(screenEvent('/dashboard')).toBe('view:dashboard')
    expect(screenEvent('/me', '?view=calendar')).toBe('view:me')
    expect(screenEvent('/orgs')).toBe('view:orgs')
  })
})

describe('booking notifications', () => {
  const day = (d, h = 0) => new Date(2026, 10, d, h).toISOString()
  it('describes availability requests, replies and booking times', () => {
    expect(describeNotification({ kind: 'availability_request', actor_id: 'u1', details: { gig_name: 'NOS', from: day(10), until: day(12) } }, nameOf))
      .toBe('Ana asks if you’re available for NOS (10–11 Nov)')
    expect(describeNotification({ kind: 'availability_reply', actor_id: 'u1', details: { gig_name: 'NOS', answer: 'available', note: 'from 10:00' } }, nameOf))
      .toBe('Ana is available for NOS: “from 10:00”')
    expect(describeNotification({ kind: 'availability_reply', actor_id: 'u1', details: { gig_name: 'NOS', answer: 'unavailable' } }, nameOf))
      .toBe('Ana is not available for NOS')
    expect(describeNotification({ kind: 'booking_changed', actor_id: 'u1', details: { gig_name: 'NOS', booked_from: day(10, 9), booked_until: day(10, 18) } }, nameOf))
      .toBe('Ana set your booking on NOS to 10 Nov 09:00–18:00')
    expect(describeNotification({ kind: 'booking_changed', actor_id: 'u1', details: { gig_name: 'NOS' } }, nameOf))
      .toBe('Ana booked you for the whole of NOS again')
  })
  it('sends requests to My work and replies to the crew tab', () => {
    expect(notificationLink({ kind: 'availability_request', gig_id: 'g1' })).toBe('/me#requests')
    expect(notificationLink({ kind: 'availability_reply', gig_id: 'g1' })).toBe('/gig/g1?tab=crew')
    expect(notificationLink({ kind: 'booking_changed', gig_id: 'g1' })).toBe('/gig/g1?tab=crew')
  })
  it('leaves muted organisations out of the unread count, except direct questions', () => {
    const muted = new Set(['o1'])
    expect(countsAsUnread({ kind: 'asset_uploaded', org_id: 'o1' }, muted)).toBe(false)
    expect(countsAsUnread({ kind: 'availability_request', org_id: 'o1' }, muted)).toBe(true)
    expect(countsAsUnread({ kind: 'asset_uploaded', org_id: 'o2' }, muted)).toBe(true)
    expect(countsAsUnread({ kind: 'asset_uploaded', org_id: null }, muted)).toBe(true)
    expect(countsAsUnread({ kind: 'asset_uploaded', org_id: 'o2', read_at: 'x' }, muted)).toBe(false)
  })
})

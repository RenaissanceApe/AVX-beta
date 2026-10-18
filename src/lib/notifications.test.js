import { describe, it, expect } from 'vitest'
import { describeNotification, notificationLink } from './notifications'

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

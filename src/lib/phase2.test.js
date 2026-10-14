import { describe, it, expect } from 'vitest'
import { shortTime, groupByDay, sortCrewForCallSheet } from './schedule'
import { versionChain, previewKind } from './versions'
import { describeActivity } from './activity'

describe('schedule', () => {
  it('formats times', () => {
    expect(shortTime('08:30:00')).toBe('08:30')
    expect(shortTime(null)).toBe('')
  })
  it('groups and sorts by day and time', () => {
    const groups = groupByDay([
      { id: 3, day: '2026-11-02', start_time: '09:00:00' },
      { id: 2, day: '2026-11-01', start_time: '14:00:00' },
      { id: 1, day: '2026-11-01', start_time: '08:00:00' },
    ])
    expect(groups.map(g => [g.day, g.items.map(i => i.id)])).toEqual([['2026-11-01', [1, 2]], ['2026-11-02', [3]]])
  })
  it('sorts crew by call time, then name, without-call last', () => {
    const names = { a: 'Zé', b: 'Ana', c: 'Rui' }
    const sorted = sortCrewForCallSheet([
      { user_id: 'a', call_time: '09:00:00' }, { user_id: 'b', call_time: null }, { user_id: 'c', call_time: '08:00:00' },
    ], id => names[id])
    expect(sorted.map(m => m.user_id)).toEqual(['c', 'a', 'b'])
  })
})

describe('versions', () => {
  const assets = [
    { id: 'v1', superseded_by: 'v2' }, { id: 'v2', superseded_by: 'v3' }, { id: 'v3', superseded_by: null },
    { id: 'other', superseded_by: null },
  ]
  it('builds the chain newest first', () => {
    expect(versionChain(assets, 'v3').map(a => a.id)).toEqual(['v3', 'v2', 'v1'])
    expect(versionChain(assets, 'other').map(a => a.id)).toEqual(['other'])
  })
  it('detects previewable files', () => {
    expect(previewKind('gig/123-plot.PDF')).toBe('pdf')
    expect(previewKind('gig/1-photo.jpeg')).toBe('image')
    expect(previewKind('gig/1-patch.xlsx')).toBeNull()
  })
})

describe('describeActivity', () => {
  const nameOf = id => ({ u1: 'Ana', u2: 'Rui' }[id] || 'Unknown')
  it('describes common events', () => {
    expect(describeActivity({ action: 'asset_new_version', actor_id: 'u1', details: { name: 'Plot', version: 3 } }, nameOf))
      .toBe('Ana uploaded version 3 of “Plot”')
    expect(describeActivity({ action: 'member_added', actor_id: 'u1', details: { user_id: 'u2', function_title: 'FOH' } }, nameOf))
      .toBe('Ana added Rui as FOH')
    expect(describeActivity({ action: 'member_removed', actor_id: 'u2', details: { user_id: 'u2' } }, nameOf))
      .toBe('Rui left the gig')
    expect(describeActivity({ action: 'gig_status', actor_id: 'u1', details: { from: 'confirmed', to: 'active' } }, nameOf))
      .toBe('Ana changed the status from Confirmed to Active')
  })
})

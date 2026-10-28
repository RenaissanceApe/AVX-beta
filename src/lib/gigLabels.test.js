import { describe, it, expect } from 'vitest'
import { labelStyle, gigStatusLabel, gigTypeOf, sortLabels, SUGGESTED_STATUSES, BASE_STATUSES, LABEL_COLOURS } from './gigLabels'

const t = k => k

describe('gig statuses and types', () => {
  it('shows the organisation status when the gig has one', () => {
    const gig = { status: 'draft', custom_status_id: 's1', custom_status: { id: 's1', name: 'Option', colour: 'yellow' } }
    expect(gigStatusLabel(gig, t)).toEqual({ name: 'Option', colour: 'yellow', custom: true })
    // Freshly edited (the embedded one is stale): found in the list
    expect(gigStatusLabel({ ...gig, custom_status_id: 's2' }, t, [{ id: 's2', name: 'Invoiced', colour: 'sky' }]))
      .toEqual({ name: 'Invoiced', colour: 'sky', custom: true })
  })
  it('falls back to the built-in status', () => {
    expect(gigStatusLabel({ status: 'confirmed' }, t)).toEqual({ name: 'status.confirmed', colour: 'blue', custom: false })
    expect(gigStatusLabel({ status: 'confirmed', custom_status_id: 'gone' }, t, [])).toMatchObject({ custom: false })
  })
  it('finds the gig type', () => {
    expect(gigTypeOf({ gig_type_id: 't1', gig_type: { id: 't1', name: 'Festival', colour: 'blue' } })).toMatchObject({ name: 'Festival' })
    expect(gigTypeOf({ gig_type_id: null })).toBe(null)
    expect(gigTypeOf({ gig_type_id: 't2' }, [{ id: 't2', name: 'Theatre' }])).toMatchObject({ name: 'Theatre' })
  })
  it('colours from the theme, every colour known', () => {
    expect(labelStyle('red').color).toBe('var(--danger)')
    expect(labelStyle('nonsense').color).toBe('var(--muted)')
    for (const c of LABEL_COLOURS) expect(labelStyle(c).color).toMatch(/^var\(--/)
  })
  it('sorts by position, then age', () => {
    const list = [{ id: 'b', position: 2, created_at: '1' }, { id: 'a', position: 1, created_at: '2' }, { id: 'c', position: 1, created_at: '3' }]
    expect(sortLabels(list).map(x => x.id)).toEqual(['a', 'c', 'b'])
  })
  it('suggests statuses that each mean a built-in one', () => {
    for (const s of SUGGESTED_STATUSES) {
      expect(BASE_STATUSES).toContain(s.base)
      expect(LABEL_COLOURS).toContain(s.colour)
    }
  })
})

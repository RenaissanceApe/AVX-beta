import { describe, it, expect } from 'vitest'
import { isCrewOnly, resolveSimple, SIMPLE_GIG_TABS } from './simpleMode'
import { GIG_TABS } from '../components/gig/GigHeader'

describe('simple mode', () => {
  it('counts people with no organisation role above viewer, who manage no gig, as only crew', () => {
    expect(isCrewOnly([], false)).toBe(true)
    expect(isCrewOnly([{ myRole: 'viewer' }], false)).toBe(true)
    expect(isCrewOnly([{ myRole: 'viewer' }, { myRole: 'member' }], false)).toBe(false)
    expect(isCrewOnly([{ myRole: 'admin' }], false)).toBe(false)
    expect(isCrewOnly([], true)).toBe(false)
  })

  it('is automatic for crew only, and a switch for everyone', () => {
    expect(resolveSimple('auto', true)).toBe(true)
    expect(resolveSimple('auto', false)).toBe(false)
    expect(resolveSimple('on', false)).toBe(true)
    expect(resolveSimple('off', true)).toBe(false)
  })

  it('keeps only existing gig tabs, with the chat and equipment (to report damage)', () => {
    expect(SIMPLE_GIG_TABS.every(tab => GIG_TABS.includes(tab))).toBe(true)
    expect(SIMPLE_GIG_TABS).toContain('chat')
    expect(SIMPLE_GIG_TABS).toContain('equipment')
  })
})

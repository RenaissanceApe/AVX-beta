import { describe, it, expect } from 'vitest'
import { EMPTY_FILTERS, searchArgs, gigFilters, crewError } from './crewSearch'

describe('crew search', () => {
  it('sends only the filters that are set', () => {
    expect(searchArgs('o1', EMPTY_FILTERS)).toEqual({
      p_org: 'o1', p_functions: [], p_text: null, p_languages: [], p_certificate: null, p_lat: null, p_lng: null, p_km: null,
      p_country: null, p_from: null, p_to: null, p_only_free: false, p_offset: 0,
    })
    const args = searchArgs('o1', { ...EMPTY_FILTERS, fn: 'rigger', text: ' grandMA ', language: 'en', certificate: 'IPAF',
      place: { lat: 41.15, lng: -8.61, country: 'PT' }, km: '50', from: '2026-11-10', to: '', onlyFree: true }, 20)
    expect(args).toMatchObject({ p_functions: ['rigger'], p_text: 'grandMA', p_languages: ['en'], p_certificate: 'IPAF',
      p_lat: 41.15, p_lng: -8.61, p_km: 50, p_country: 'PT', p_from: '2026-11-10', p_to: '2026-11-10', p_only_free: true, p_offset: 20 })
  })

  it('keeps the dates in order and only filters by free dates when there are dates', () => {
    expect(searchArgs('o1', { ...EMPTY_FILTERS, from: '2026-11-12', to: '2026-11-10' })).toMatchObject({ p_from: '2026-11-12', p_to: '2026-11-12' })
    expect(searchArgs('o1', { ...EMPTY_FILTERS, onlyFree: true }).p_only_free).toBe(false)
    expect(gigFilters({ start_date: '2026-11-10', end_date: null })).toEqual({ from: '2026-11-10', to: '2026-11-10' })
  })

  it('explains the database’s refusals', () => {
    expect(crewError({ message: 'Search limit reached for today', code: '54000' })).toBe('crewSearch.err.searchLimit')
    expect(crewError({ message: 'Contact limit reached for today' })).toBe('crewSearch.err.contactLimit')
    expect(crewError({ message: 'Already asked', code: '23505' })).toBe('crewSearch.err.alreadyAsked')
    expect(crewError({ message: 'Already on this gig' })).toBe('crewSearch.err.alreadyOn')
    expect(crewError({ message: 'Not allowed', code: '42501' })).toBe('crewSearch.err.notAllowed')
    expect(crewError({ message: 'boom' })).toBeNull()
  })
})

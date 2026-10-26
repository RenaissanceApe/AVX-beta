import { describe, it, expect } from 'vitest'
import { FUNCTIONS, cleanLink, missing, toRow, travelKey, fromTravelKey, countryName, languageName, isExpired } from './crewProfile'
import { toPlaces } from '../../supabase/functions/_shared/places.ts'

describe('crew profile', () => {
  it('cleans links and refuses anything that is not a web address', () => {
    expect(cleanLink('example.com/me')).toBe('https://example.com/me')
    expect(cleanLink('http://vimeo.com/123')).toBe('http://vimeo.com/123')
    expect(cleanLink('javascript:alert(1)')).toBeNull()
    expect(cleanLink('not a link')).toBeNull()
    expect(cleanLink('')).toBeNull()
  })

  it('needs a function and a base before it can be switched on', () => {
    expect(missing({})).toEqual(['functions', 'base'])
    expect(missing({ other_functions: 'Pyro', base_place: 'Porto, Portugal' })).toEqual([])
    expect(toRow({ enabled: true, functions: ['rigger'] }).errors).toEqual(['incomplete'])
  })

  it('turns the form into the row the database keeps', () => {
    const { row, errors } = toRow({
      enabled: true, visibility: 'crew', headline: '  Lighting op  ', functions: ['rigger', 'rigger', 'astronaut', FUNCTIONS[0]],
      base_place: 'Porto, Portugal', base_country: 'PT', base_lat: 41.15, base_lng: -8.61, travel_scope: 'km', travel_km: 250,
      languages: ['pt', 'en', 'pt', 'EN'], experience_years: '12', links: ['example.com', ''],
      certificates: [{ id: 'c1', name: ' IPAF 3a ', issuer: '', expires_on: '2027-05-01', verified: true }, { name: '' }],
      contact_from: 'known',
    })
    expect(errors).toEqual([])
    expect(row).toMatchObject({
      enabled: true, visibility: 'crew', headline: 'Lighting op', functions: ['rigger', FUNCTIONS[0]], travel_scope: 'km', travel_km: 250,
      languages: ['pt', 'en'], experience_years: 12, links: ['https://example.com'],
      certificates: [{ id: 'c1', name: 'IPAF 3a', issuer: undefined, expires_on: '2027-05-01' }], contact_from: 'known',
    })
    expect(row.certificates[0]).not.toHaveProperty('verified')
    expect(toRow({}).row.contact_from).toBe('any')
    expect(toRow({}).row.job_alerts).toBe(true)
    expect(toRow({ job_alerts: false }).row.job_alerts).toBe(false)
    expect(toRow({ links: ['javascript:x'] }).errors).toEqual(['links'])
    expect(toRow({ experience_years: 99 }).errors).toEqual(['experience'])
    expect(toRow({ visibility: 'public' }).row.visibility).toBe('companies')
  })

  it('reads and writes the travel choice', () => {
    expect(travelKey({ travel_scope: 'km', travel_km: 100 })).toBe('km:100')
    expect(travelKey({ travel_scope: 'europe' })).toBe('europe')
    expect(fromTravelKey('km:50')).toEqual({ travel_scope: 'km', travel_km: 50 })
    expect(fromTravelKey('world')).toEqual({ travel_scope: 'world', travel_km: null })
  })

  it('names countries and languages in the reader’s language', () => {
    expect(countryName('PT', 'pt')).toBe('Portugal')
    expect(countryName('DE', 'en')).toBe('Germany')
    expect(languageName('en', 'pt')).toBe('Inglês')
    expect(languageName('nl', 'en')).toBe('Dutch')
    expect(isExpired({ expires_on: '2026-01-01' }, '2026-10-21')).toBe(true)
    expect(isExpired({}, '2026-10-21')).toBe(false)
  })

  it('turns place search results into choices, about 1 km precise', () => {
    // Nominatim's answer for "Porto" (shortened)
    const rows = [
      { lat: '41.1502195', lon: '-8.6103497', name: 'Porto', address: { city: 'Porto', county: 'Porto', country: 'Portugal', country_code: 'pt' } },
      { lat: '41.2366885', lon: '-8.3020183', name: 'Porto', address: { county: 'Porto', country: 'Portugal', country_code: 'pt' } },
      { lat: '42.1553614', lon: '-6.8651279', name: 'Porto', address: { city: 'Porto', province: 'Zamora', state: 'Castela e Leão', country: 'Espanha', country_code: 'es' } },
      { lat: 'x', lon: '1', name: 'Broken', address: { city: 'Broken', country_code: 'pt' } },
    ]
    expect(toPlaces(rows)).toEqual([
      { label: 'Porto, Portugal', place: 'Porto, Portugal', country: 'PT', lat: 41.15, lng: -8.61 },
      { label: 'Porto, Castela e Leão, Espanha', place: 'Porto, Espanha', country: 'ES', lat: 42.16, lng: -6.87 },
    ])
    expect(toPlaces(null)).toEqual([])
  })
})

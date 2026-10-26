import { describe, it, expect } from 'vitest'
import { splitVat, isoFor, certStatus, confirmedByOrg, proofPath, trustError } from './trust'
import { readVies } from '../../supabase/functions/_shared/vies.ts'

describe('company verification', () => {
  it('splits a VAT number from its country prefix', () => {
    expect(splitVat('PT 500 000 000')).toEqual({ country: 'PT', number: '500000000' })
    expect(splitVat('gr-123456789')).toEqual({ country: 'EL', number: '123456789' })
    expect(splitVat('500.000.000', 'pt')).toEqual({ country: 'PT', number: '500000000' })
    expect(splitVat('123', 'US')).toEqual({ country: '', number: '123' })
    expect(isoFor('EL')).toBe('GR')
    expect(isoFor('XI')).toBe('GB')
    expect(isoFor('PT')).toBe('PT')
  })

  it('reads what VIES answers', () => {
    expect(readVies({ valid: true, name: 'LUMEN  LDA', address: 'Rua 1\nPorto' })).toEqual({ valid: true, name: 'LUMEN LDA', address: 'Rua 1 Porto', error: null })
    expect(readVies({ valid: true, name: '---', address: '---' })).toEqual({ valid: true, name: null, address: null, error: null })
    expect(readVies({ valid: false, name: 'X' })).toEqual({ valid: false, name: null, address: null, error: null })
    expect(readVies({ actionSucceed: false, errorWrappers: [{ error: 'MS_UNAVAILABLE', message: 'x' }] }).error).toBe('MS_UNAVAILABLE')
    expect(readVies(null).error).toBe('UNKNOWN')
  })
})

describe('certificates', () => {
  it('says how a certificate stands', () => {
    expect(certStatus({ name: 'IPAF' })).toBe('self')
    expect(certStatus({ name: 'IPAF', confirmed_by: [{ org_id: 'o1', name: 'Co' }] })).toBe('confirmed')
    expect(certStatus({ name: 'IPAF', verified: true, confirmed_by: [{ org_id: 'o1' }] })).toBe('verified')
    expect(confirmedByOrg({ confirmed_by: [{ org_id: 'o1' }] }, 'o1')).toBe(true)
    expect(confirmedByOrg({}, 'o1')).toBe(false)
  })

  it('names proof files safely', () => {
    expect(proofPath('u', 'c', 'my scan (1).PDF')).toMatch(/^u\/c\/\d+\.pdf$/)
    expect(proofPath('u', 'c', 'no-extension')).toMatch(/\.pdf$/)
  })

  it('turns database errors into messages', () => {
    expect(trustError({ message: 'Already reported' })).toBe('trust.err.alreadyReported')
    expect(trustError({ message: 'Only takes contact from companies they have worked with' })).toBe('trust.err.onlyKnown')
    expect(trustError({ message: 'Posting suspended' })).toBe('trust.err.postingSuspended')
    expect(trustError({ message: 'something else' })).toBe(null)
  })
})

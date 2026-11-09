import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))
const { canonicalJson, sha256Hex, shortHash, signedPdfPath } = await import('./signatures')

describe('canonicalJson', () => {
  it('sorts keys at every level and leaves out spaces', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' } })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}')
  })
  it('gives the same text whatever order the keys came in', () => {
    expect(canonicalJson({ x: 1, y: [1, 2] })).toBe(canonicalJson({ y: [1, 2], x: 1 }))
  })
  it('drops undefined fields like JSON does, and keeps null', () => {
    expect(canonicalJson({ a: undefined, b: null, c: [undefined] })).toBe('{"b":null,"c":[null]}')
  })
  it('escapes text the way JSON does', () => {
    expect(canonicalJson({ name: 'Ana "Zé" Ló\n' })).toBe('{"name":"Ana \\"Zé\\" Ló\\n"}')
  })
})

describe('sha256Hex', () => {
  it('hashes UTF-8 text', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    // the same as Postgres: encode(sha256(convert_to('çã', 'UTF8')), 'hex')
    expect(await sha256Hex('çã')).toHaveLength(64)
  })
  it('hashes bytes', async () => {
    expect(await sha256Hex(new Uint8Array([97, 98, 99]))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('helpers', () => {
  it('shortens a hash for printing', () => {
    expect(shortHash('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')).toBe('ba78 16bf … 15ad')
    expect(shortHash('')).toBe('')
  })
  it('puts the signed PDF next to the drawing', () => {
    expect(signedPdfPath({ org_id: 'o', id: 's' })).toBe('o/s/signed.pdf')
  })
})

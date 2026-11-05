import { describe, it, expect } from 'vitest'
import { monogram } from './AppShell'

describe('monogram', () => {
  it('uses the capitalised words', () => {
    expect(monogram('Lumen and Pixel')).toBe('LP')
    expect(monogram('Som Lisboa')).toBe('SL')
    expect(monogram('teatro nacional')).toBe('TN')
  })
  it('uses the first two letters of a single word', () => {
    expect(monogram('Coliseu')).toBe('CO')
    expect(monogram('')).toBe('?')
  })
})

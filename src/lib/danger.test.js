import { describe, it, expect } from 'vitest'
import { normalizeForConfirm } from '../components/DangerConfirm'

describe('delete confirmation matching', () => {
  it('ignores case, accents, dash style and spacing', () => {
    expect(normalizeForConfirm('Marcolino — Natal  2026')).toBe(normalizeForConfirm('marcolino - natal 2026'))
    expect(normalizeForConfirm('Iluminação Évora')).toBe('iluminacao evora')
  })
  it('still needs the same words', () => {
    expect(normalizeForConfirm('Marcolino Natal 2026')).not.toBe(normalizeForConfirm('Marcolino — Natal 2026'))
    expect(normalizeForConfirm('   ')).toBe('')
  })
})

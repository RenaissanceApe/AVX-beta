import { describe, it, expect } from 'vitest'
import { hardwareKind, hardwareOf, hardwareInUse } from './riggingHardware'

describe('rigging hardware', () => {
  it('recognises hardware names in English and Portuguese', () => {
    expect(hardwareKind('Shackle 3/4" 3.25 t')).toBe('shackle')
    expect(hardwareKind('Manilha 2t')).toBe('shackle')
    expect(hardwareKind('Spanset 2 m 1 t')).toBe('spanset')
    expect(hardwareKind('Cinta redonda 1t')).toBe('spanset')
    expect(hardwareKind('Steel 1 m 8 mm')).toBe('steel')
    expect(hardwareKind('Estropo 2 m')).toBe('steel')
    expect(hardwareKind('Wire rope sling 2 m')).toBe('steel')
    expect(hardwareKind('Chain sling')).toBe('sling')
    expect(hardwareKind('MAC Aura')).toBe(null)
  })

  it('keeps the WLL as typed and never invents one', () => {
    const [a, b] = hardwareOf({ hardware: [{ id: 'h1', kind: 'shackle', name: 'Shackle', wll_kg: '3250', qty: 4 }, { id: 'h2', kind: 'x', name: 'Thing' }] })
    expect(a).toMatchObject({ kind: 'shackle', wll_kg: 3250, qty: 4 })
    expect(b).toMatchObject({ kind: 'other', wll_kg: null, qty: 1 })
  })

  it('counts the pieces the bridles use', () => {
    expect(hardwareInUse([{ hw1: 'a', hw2: 'a' }, { hw1: 'b', hw2: null }])).toEqual({ a: 2, b: 1 })
  })
})

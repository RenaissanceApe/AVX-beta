import { describe, it, expect } from 'vitest'
import { parseInput, inputValue, displayValue, mergeValues, choicesFromText, FIELD_KINDS } from './customFields'
import { filterGigs, customSearchText } from './gigs'

const f = (kind, extra = {}) => ({ id: kind, kind, label: kind, ...extra })

describe('custom fields', () => {
  it('parses what is typed into the stored value', () => {
    expect(parseInput(f('text'), '  PO-7 ')).toBe('PO-7')
    expect(parseInput(f('text'), '   ')).toBe(null)
    expect(parseInput(f('number'), '1 200,5')).toBe(1200.5)
    expect(parseInput(f('number'), 'many')).toBe(null)
    expect(parseInput(f('date'), '2026-12-01')).toBe('2026-12-01')
    expect(parseInput(f('date'), 'tomorrow')).toBe(null)
    expect(parseInput(f('yes_no'), true)).toBe(true)
    expect(parseInput(f('yes_no'), false)).toBe(false)
    expect(parseInput(f('yes_no'), null)).toBe(null)
    expect(parseInput(f('choice', { choices: ['Indoor', 'Outdoor'] }), 'Outdoor')).toBe('Outdoor')
    expect(parseInput(f('choice', { choices: ['Indoor'] }), 'Underwater')).toBe(null)
    expect(parseInput(f('link'), 'https://venue.example')).toBe('https://venue.example')
    expect(parseInput(f('link'), 'javascript:alert(1)')).toBe(null)
    expect(FIELD_KINDS).toHaveLength(6)
  })

  it('shows stored values in inputs and for reading', () => {
    expect(inputValue(f('number'), 2.5)).toBe('2,5')
    expect(inputValue(f('yes_no'), undefined)).toBe(null)
    expect(inputValue(f('text'), undefined)).toBe('')
    expect(displayValue(f('yes_no'), false, { yesNo: ['Sim', 'Não'] })).toBe('Não')
    expect(displayValue(f('number'), 1200.5)).toBe('1200,5')
    expect(displayValue(f('date'), '2026-12-01', { date: d => `d:${d}` })).toBe('d:2026-12-01')
    expect(displayValue(f('text'), null)).toBe('')
  })

  it('merges edits, keeping values of removed fields and dropping cleared ones', () => {
    const fields = [f('text'), f('number')]
    const current = { text: 'old', number: 3, gone: 'kept' }
    expect(mergeValues(current, fields, { text: 'new', number: null })).toEqual({ text: 'new', gone: 'kept' })
    expect(mergeValues(null, fields, {})).toEqual({})
  })

  it('reads choices one per line, without repeats', () => {
    expect(choicesFromText(' Indoor \n\nOutdoor\nIndoor')).toEqual(['Indoor', 'Outdoor'])
    expect(choicesFromText(Array.from({ length: 40 }, (_, i) => `c${i}`).join('\n'))).toHaveLength(30)
  })

  it('finds gigs by their custom values', () => {
    expect(customSearchText({ a: 'PO-77', b: 1200, c: true, d: null })).toBe('PO-77 1200')
    const gigs = [{ id: 1, name: 'A', status: 'confirmed', custom_values: { a: 'PO-77' } }, { id: 2, name: 'B', status: 'confirmed' }]
    expect(filterGigs(gigs, 'all', 'po-77').map(g => g.id)).toEqual([1])
  })
})

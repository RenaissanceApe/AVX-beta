import { describe, it, expect } from 'vitest'
import { deliveryNoteDocument, deliveryNoteFileName } from './deliveryNotePdf'
import { canonicalJson } from './signatures'

const gig = { id: 'g1', name: 'Festival', venue: 'Park', start_date: '2026-12-10', end_date: '2026-12-11', extra: 'not signed' }
const rows = [
  { item_id: 'b', item_name: 'XLR', category: 'Cables', planned: 10, out_qty: 0 },
  { item_id: 'a', item_name: 'Speaker', category: 'Audio', planned: 2, out_qty: 2 },
  { item_id: 'c', item_name: 'Spare', category: 'Audio', planned: 0, out_qty: 0 },
]
const units = [{ item_id: 'a', code: 'S2' }, { item_id: 'a', code: 'S1' }]

describe('deliveryNoteDocument', () => {
  it('lists what is planned or went out, by category, with unit codes', () => {
    const doc = deliveryNoteDocument({ org: 'Co', gig, rows, units, note: ' Gate B ', lang: 'en' })
    expect(doc.items).toEqual([
      { name: 'Speaker', category: 'Audio', planned: 2, out: 2, codes: ['S1', 'S2'] },
      { name: 'XLR', category: 'Cables', planned: 10, out: 0, codes: [] },
    ])
    expect(doc.note).toBe('Gate B')
    expect(doc.gig).toEqual({ id: 'g1', name: 'Festival', venue: 'Park', start: '2026-12-10', end: '2026-12-11' })
  })
  it('gives the same signed text whatever order the rows came in', () => {
    const a = deliveryNoteDocument({ org: 'Co', gig, rows, units, note: '', lang: 'pt' })
    const b = deliveryNoteDocument({ org: 'Co', gig, rows: [...rows].reverse(), units: [...units].reverse(), note: '', lang: 'pt' })
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })
  it('names the file after the gig and the day', () => {
    expect(deliveryNoteFileName({ gig: { name: 'Fésta / 2026' } }, '2026-11-09T12:00:00Z')).toBe('Festa 2026 delivery 2026-11-09.pdf')
  })
})

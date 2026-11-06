import { describe, it, expect } from 'vitest'
import { invoiceCsvRows, invoicesCsv, INVOICE_CSV_COLUMNS } from './invoiceCsv'

const inv = {
  id: 'i1', number: 3, kind: 'invoice', status: 'issued', legal_number: 'FT A/6', issue_date: '2027-03-05', due_date: '2027-04-04',
  client_name: 'Festival; Lda', client_tax_id: '501234567', client_address: 'Rua 1\n1000-001 Lisboa', client_email: 'b@f.invalid', currency: 'EUR',
  net: 230, vat: 44.4, total: 274.4, notes: null, quote: { title: 'Gala' }, gig: null,
  lines: [
    { description: 'Speakers', qty: 2, unit_price: 100, discount_pct: 10, vat_rate: 23 },
    { description: 'Van', qty: 1, unit_price: 20.5, vat_rate: 0, vat_exemption: 'M40' },
  ],
}
const credit = { id: 'c1', number: 4, kind: 'credit_note', credited_invoice_id: 'i1', status: 'draft', currency: 'EUR', net: 10, vat: 2.3, total: 12.3,
  client_name: 'Festival; Lda', lines: [{ description: 'Broken', qty: 1, unit_price: 10, vat_rate: 23 }] }

describe('invoices CSV', () => {
  it('gives one row per line, with the invoice repeated', () => {
    const rows = invoiceCsvRows([inv, credit])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ avx_number: 3, legal_number: 'FT A/6', line: 1, description: 'Speakers', qty: 2, discount_pct: 10, line_net: 180, invoice_total: 274.4, quote: 'Gala' })
    expect(rows[1]).toMatchObject({ line: 2, vat_rate: 0, vat_exemption: 'M40', line_net: 20.5 })
    expect(rows[2]).toMatchObject({ kind: 'credit_note', credits: 'FT A/6', legal_number: '' })
  })
  it('names a credited invoice outside the chosen view', () => {
    expect(invoiceCsvRows([credit], [inv, credit])[0].credits).toBe('FT A/6')
  })
  it('writes semicolons, decimal commas and quoted text', () => {
    const [head, first, second] = invoicesCsv([inv]).split('\r\n')
    expect(head.split(';')).toHaveLength(INVOICE_CSV_COLUMNS.length)
    expect(head.startsWith('avx number;kind;status;legal number')).toBe(true)
    expect(first).toContain('"Festival; Lda"')
    expect(first).toContain('"Rua 1\n1000-001 Lisboa"'.split('\n')[0])
    expect(second).toContain(';20,5;')
  })
})

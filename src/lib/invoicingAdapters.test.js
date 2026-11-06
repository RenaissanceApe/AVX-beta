// The invoicing Edge Function's mapping, per program (step 11b): what AVX sends as a draft and how
// it reads the number, dates and PDF link back. The calls themselves are checked with real accounts.
import { describe, it, expect } from 'vitest'
import { Refusal, checkSendable, cleanVat, singleExemption, splitAddress } from '../../supabase/functions/invoicing/common.ts'
import { moloniProducts, moloniVatTaxes, moloniTaxIdFor, moloniRelated, moloniReadBack } from '../../supabase/functions/invoicing/moloni.ts'
import { ixDate, ixIso, ixTaxNameFor, ixType, ixDocument, ixReadBack, ACCOUNT } from '../../supabase/functions/invoicing/invoicexpress.ts'
import { tocUrl, tocHeader, tocLine, tocTaxIdFor, tocReadBack } from '../../supabase/functions/invoicing/toconline.ts'

const LINES = [
  { id: 'a', description: 'Speakers', details: 'L-Acoustics', qty: 2, unit_price: 100, discount_pct: 10, vat_rate: 23 },
  { id: 'b', description: 'Catering', qty: 1, unit_price: 50, vat_rate: 6 },
  { id: 'c', description: 'Van', qty: 1, unit_price: 20, vat_rate: 0, vat_exemption: 'M40' },
]
const invoice = (over = {}) => ({
  id: '11111111-2222-3333-4444-555555555555', org_id: 'o', number: 7, kind: 'invoice', status: 'draft', credited_invoice_id: null,
  client_id: 'cccccccc-0000-0000-0000-000000000000', client_name: 'Festival Lda', client_tax_id: 'PT 501 234 567',
  client_address: 'Rua 1\n1000-001 Lisboa', client_email: 'billing@festival.invalid', language: 'pt', currency: 'EUR',
  lines: LINES, total: 294.4, notes: 'Thanks', issue_date: '2027-03-05', due_date: '2027-04-04',
  provider: null, provider_document_id: null, legal_number: null, ...over,
})
const refusal = (fn, code) => {
  try { fn() } catch (e) { expect(e).toBeInstanceOf(Refusal); expect(e.code).toBe(code); return }
  throw new Error(`expected refusal ${code}`)
}

describe('shared checks', () => {
  it('cleans tax numbers and addresses', () => {
    expect(cleanVat('PT 501.234-567')).toBe('501234567')
    expect(cleanVat('')).toBeNull()
    expect(splitAddress('Rua 1\n1000-001 Lisboa')).toEqual({ street: 'Rua 1', postcode: '1000-001', city: 'Lisboa' })
    expect(splitAddress('Av. Boavista 10, Porto')).toEqual({ street: 'Av. Boavista 10', postcode: null, city: 'Porto' })
    expect(splitAddress(null)).toEqual({ street: null, postcode: null, city: null })
  })
  it('only sends complete EUR drafts', () => {
    expect(() => checkSendable(invoice())).not.toThrow()
    refusal(() => checkSendable(invoice({ status: 'sent' })), 'not_draft')
    refusal(() => checkSendable(invoice({ currency: 'USD' })), 'currency')
    refusal(() => checkSendable(invoice({ lines: [{ ...LINES[2], vat_exemption: undefined }] })), 'exemption_missing')
    refusal(() => checkSendable(invoice({ lines: [] })), 'incomplete')
  })
  it('takes one exemption code per document', () => {
    expect(singleExemption(LINES)).toBe('M40')
    expect(singleExemption(LINES.slice(0, 2))).toBeNull()
    refusal(() => singleExemption([...LINES, { ...LINES[2], id: 'd', vat_exemption: 'M07' }]), 'mixed_exemptions')
  })
})

describe('Moloni', () => {
  const taxes = moloniVatTaxes([
    { tax_id: 9, value: 23, saft_type: 1, fiscal_zone: 'PT-MA' },
    { tax_id: 1, value: 23, saft_type: 1, fiscal_zone: 'PT' },
    { tax_id: 2, value: 6, saft_type: '1', fiscal_zone: 'PT' },
    { tax_id: 5, value: 5, saft_type: 3 },   // stamp duty, not VAT
  ])
  it('sends each line with its VAT, or its exemption at 0 %', () => {
    const p = moloniProducts(LINES, 77, moloniTaxIdFor(taxes))
    expect(p[0]).toMatchObject({ product_id: 77, name: 'Speakers', summary: 'L-Acoustics', qty: 2, price: 100, discount: 10, order: 1, taxes: [{ tax_id: 1, value: 23 }] })
    expect(p[1].taxes[0].tax_id).toBe(2)
    expect(p[2]).toMatchObject({ taxes: [], exemption_reason: 'M40' })
    refusal(() => moloniTaxIdFor(taxes)(13), 'tax_missing')
  })
  it('links credit-note lines to the invoice lines', () => {
    const theirs = [{ document_product_id: 501, taxes: [{ value: 23 }] }, { document_product_id: 502, taxes: [{ value: 6 }] }]
    expect(moloniRelated(LINES, theirs, { ...LINES[1], id: 'x', source_id: 'b' })).toBe(502)
    expect(moloniRelated(LINES, theirs, { id: 'y', description: 'Part', qty: 1, unit_price: 5, vat_rate: 23 })).toBe(501)
    refusal(() => moloniRelated(LINES, theirs, { id: 'z', description: 'Part', qty: 1, unit_price: 5, vat_rate: 13 }), 'credit_manual')
  })
  it('reads the number back once finalised', () => {
    expect(moloniReadBack('invoice', null, null)).toEqual({ state: 'missing' })
    expect(moloniReadBack('invoice', { document_id: 1, status: 0 }, null)).toEqual({ state: 'draft' })
    expect(moloniReadBack('credit_note', { document_id: 1, status: 1, number: 4, date: '2027-03-05T00:00:00', expiration_date: '2027-04-04', document_set: { name: 'A' } }, 'https://moloni.pt/x.pdf'))
      .toEqual({ state: 'issued', legal_number: 'NC A/4', pdf_url: 'https://moloni.pt/x.pdf', issue_date: '2027-03-05', due_date: '2027-04-04' })
    expect(moloniReadBack('invoice', { document_id: 1, status: 1, number: 4 }, 'http://insecure').pdf_url).toBeNull()
  })
})

describe('InvoiceXpress', () => {
  const taxName = ixTaxNameFor([
    { id: 1, name: 'IVA23-MA', value: 23, region: 'PT-MA' }, { id: 2, name: 'IVA23', value: 23, region: 'PT' },
    { id: 3, name: 'IVA6', value: 6, region: 'PT' }, { id: 4, name: 'IVA0', value: 0, region: 'PT' },
  ])
  it('accepts only an account name, never an address elsewhere', () => {
    expect(ACCOUNT.test('lumen-pixel')).toBe(true)
    expect(ACCOUNT.test('evil.com/x')).toBe(false)
    expect(ACCOUNT.test('')).toBe(false)
  })
  it('writes dates as dd/mm/yyyy and reads them back', () => {
    expect(ixDate('2027-03-05')).toBe('05/03/2027')
    expect(ixIso('05/03/2027')).toBe('2027-03-05')
    expect(ixIso('2027-03-05')).toBeNull()
  })
  it('makes a draft invoice with the client, lines, VAT and exemption', () => {
    const d = ixDocument(invoice(), { taxName, sequenceId: 42, ownerId: null })
    expect(d).toMatchObject({
      date: '05/03/2027', due_date: '04/04/2027', reference: 'AVX 7', observations: 'Thanks', sequence_id: 42, tax_exemption: 'M40',
      client: { name: 'Festival Lda', code: '501234567', fiscal_id: '501234567', email: 'billing@festival.invalid', address: 'Rua 1', postal_code: '1000-001', city: 'Lisboa', country: 'Portugal', language: 'pt' },
    })
    expect(d.items).toEqual([
      { name: 'Speakers', description: 'L-Acoustics', unit_price: 100, quantity: 2, discount: 10, tax: { name: 'IVA23' } },
      { name: 'Catering', description: 'Catering', unit_price: 50, quantity: 1, discount: 0, tax: { name: 'IVA6' } },
      { name: 'Van', description: 'Van', unit_price: 20, quantity: 1, discount: 0, tax: { name: 'IVA0' } },
    ])
    expect(d).not.toHaveProperty('owner_invoice_id')
  })
  it('gives a client without a NIF its own code, and a credit note its invoice', () => {
    const d = ixDocument(invoice({ kind: 'credit_note', client_tax_id: null, lines: LINES.slice(0, 1) }), { taxName, sequenceId: null, ownerId: '9001' })
    expect(d.client.code).toBe('AVX-cccccccc')
    expect(d.client).not.toHaveProperty('fiscal_id')
    expect(d.owner_invoice_id).toBe(9001)
    expect(d).not.toHaveProperty('tax_exemption')
    expect(ixType('credit_note')).toEqual({ path: 'credit_notes', key: 'credit_note' })
  })
  it('refuses what InvoiceXpress cannot take', () => {
    refusal(() => ixDocument(invoice({ lines: [...LINES, { id: 'd', description: 'Less deposit', qty: 1, unit_price: -54, vat_rate: 23 }] }), { taxName, sequenceId: null, ownerId: null }), 'negative_line')
    refusal(() => ixDocument(invoice({ lines: [{ ...LINES[0], vat_rate: 13 }] }), { taxName, sequenceId: null, ownerId: null }), 'tax_missing')
  })
  it('keeps a due date before the issue date out', () => {
    expect(ixDocument(invoice({ due_date: '2027-01-01' }), { taxName, sequenceId: null, ownerId: null }).due_date).toBe('05/03/2027')
  })
  it('reads the number back once finalised', () => {
    expect(ixReadBack('invoice', { id: 5, status: 'draft' }, null)).toEqual({ state: 'draft' })
    expect(ixReadBack('invoice', { id: 5, status: 'deleted' }, null)).toEqual({ state: 'missing' })
    expect(ixReadBack('invoice', { id: 5, status: 'final', inverted_sequence_number: 'G/6', date: '04/08/2027', due_date: '19/08/2027', permalink: 'https://www.app.invoicexpress.com/documents/abc' }, 'https://sum.url/x.pdf'))
      .toEqual({ state: 'issued', legal_number: 'FT G/6', pdf_url: 'https://sum.url/x.pdf', issue_date: '2027-08-04', due_date: '2027-08-19' })
    // PDF still being made: the document's own page instead
    expect(ixReadBack('credit_note', { id: 5, status: 'settled', sequence_number: '2/A', permalink: 'https://www.app.invoicexpress.com/documents/abc' }, null))
      .toMatchObject({ legal_number: 'NC A/2', pdf_url: 'https://www.app.invoicexpress.com/documents/abc' })
  })
})

describe('TOConline', () => {
  it('only keeps TOConline https addresses', () => {
    expect(tocUrl('https://app.toconline.pt/oauth/')).toBe('https://app.toconline.pt/oauth')
    expect(tocUrl('https://api.toconline.pt')).toBe('https://api.toconline.pt')
    expect(tocUrl('http://app.toconline.pt/oauth')).toBeNull()
    expect(tocUrl('https://toconline.pt.evil.com/oauth')).toBeNull()
    expect(tocUrl('not a url')).toBeNull()
  })
  it('makes a draft header with the client and series', () => {
    const h = tocHeader(invoice(), { seriesId: 72, seriesPrefix: '2027', exemptionId: '3', parentReference: null })
    expect(h.type).toBe('commercial_sales_documents')
    expect(h.attributes).toMatchObject({
      document_type: 'FT', date: '2027-03-05', due_date: '2027-04-04', document_series_id: 72, customer_tax_registration_number: '501234567',
      customer_business_name: 'Festival Lda', customer_address_detail: 'Rua 1', customer_postcode: '1000-001', customer_city: 'Lisboa',
      customer_country: 'PT', vat_included_prices: false, currency_iso_code: 'EUR', tax_exemption_reason_id: 3, notes: 'Thanks', external_reference: 'AVX 7',
    })
    expect(h.attributes).not.toHaveProperty('status')
  })
  it('makes a credit note in the NC series, pointing at the invoice', () => {
    const h = tocHeader(invoice({ kind: 'credit_note', client_tax_id: null }), { seriesId: 72, seriesPrefix: '2027', exemptionId: null, parentReference: 'FT 2027/3' })
    expect(h.attributes).toMatchObject({ document_type: 'NC', document_series_prefix: '2027', parent_document_reference: 'FT 2027/3' })
    expect(h.attributes).not.toHaveProperty('document_series_id')
    expect(h.attributes).not.toHaveProperty('customer_tax_registration_number')
  })
  it('sends each line as the AVX service with its VAT', () => {
    const taxId = tocTaxIdFor([
      { id: '1', attributes: { tax_code: 'NOR', tax_percentage: 23, tax_country_region: 'PT' } },
      { id: '7', attributes: { tax_code: 'NOR', tax_percentage: 22, tax_country_region: 'PT-MA' } },
      { id: '2', attributes: { tax_code: 'RED', tax_percentage: '6', tax_country_region: 'PT' } },
      { id: '4', attributes: { tax_code: 'ISE', tax_percentage: 0, tax_country_region: 'PT' } },
    ])
    expect(LINES.map(l => taxId(l.vat_rate))).toEqual(['1', '2', '4'])
    refusal(() => taxId(22), 'tax_missing')
    expect(tocLine(LINES[0], '66', '9', '1')).toEqual({
      type: 'commercial_sales_document_lines',
      attributes: { document_id: 66, item_type: 'Service', item_id: 9, description: 'Speakers — L-Acoustics', quantity: 2, unit_price: 100, settlement_expression: '10', tax_id: 1 },
    })
    expect(tocLine(LINES[1], '66', '9', '2').attributes).not.toHaveProperty('settlement_expression')
  })
  it('reads the number back once finalised', () => {
    expect(tocReadBack(null, null)).toEqual({ state: 'missing' })
    expect(tocReadBack({ status: 0, document_no: null }, null)).toEqual({ state: 'draft' })
    expect(tocReadBack({ status: 1, document_no: 'FT 2023/3', date: '2023-01-01', due_date: '2023-02-01', public_link: 'https://app.toconline.pt/public_links/link/x' }, 'https://integration.toconline.pt/public-file/y'))
      .toEqual({ state: 'issued', legal_number: 'FT 2023/3', pdf_url: 'https://integration.toconline.pt/public-file/y', issue_date: '2023-01-01', due_date: '2023-02-01' })
    expect(tocReadBack({ status: 1, document_no: 'FT 2023/3', public_link: 'https://app.toconline.pt/public_links/link/x' }, null).pdf_url).toBe('https://app.toconline.pt/public_links/link/x')
  })
})

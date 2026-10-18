import { describe, it, expect } from 'vitest'
import { pdfSafe, quotePdfName, buildQuotePdf } from './quotePdf'

const line = (over = {}) => ({ id: Math.random().toString(36), kind: 'rental', description: 'Coluna', details: '', qty: 2, unit: 'unit', factor: 1, unit_price: 60, discount_pct: 0, ...over })
const quote = (over = {}) => ({
  number: 143, title: 'Evento — Ação de Natal', language: 'pt', currency: 'EUR', client_name: 'João Conceição', issue_date: '2026-10-18',
  vat_rate: 23, discount_pct: 0, show_line_prices: true, terms: '1. Condições\nPagamento a 30 dias.',
  body: { phases: [{ id: 'p', name: 'Dia 1', start_date: '2026-11-13', sections: [{ id: 's', name: 'Som', lines: [line(), line({ kind: 'comment', description: 'Nota' })] }] }] },
  ...over,
})

describe('quote PDF', () => {
  it('keeps Portuguese text and replaces characters the PDF fonts lack', () => {
    expect(pdfSafe('Ação — 60,00 € “ok”')).toBe('Ação — 60,00 € “ok”')
    expect(pdfSafe('a → b ✓ 日本')).toBe('a -> b v ??')
    expect(pdfSafe('entende\u2011se 22:00\u201107:00 \u2212 5')).toBe('entende-se 22:00-07:00 - 5')
  })

  it('makes a safe file name', () => {
    expect(quotePdfName({ number: 143, title: 'Ação: Natal/2026' }, { quote_number_prefix: '' })).toBe('143 Acao Natal 2026.pdf')
  })

  it('builds a PDF with and without line prices', async () => {
    for (const show_line_prices of [true, false]) {
      const doc = await buildQuotePdf({ quote: quote({ show_line_prices }), org: { name: 'Lumen and Pixel', quote_number_prefix: '' } })
      const out = doc.output()
      expect(out.startsWith('%PDF-')).toBe(true)
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('authenticator QR code', () => {
  it('escapes the SVG Supabase returns', async () => {
    const { qrSrc } = await import('../components/TwoStepSection')
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ffffff"/></svg>'
    expect(qrSrc(`data:image/svg+xml;utf-8,${svg}`)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    expect(qrSrc(`data:image/svg+xml;utf-8,data:image/svg+xml;utf-8,${svg}`)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    expect(qrSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })
})

// Invoices as a CSV file to import into an invoicing program without a connector (step 11b): one
// row per line, the invoice's details repeated on each, so most programs' line importers take it.
// Semicolons and decimal commas (orgExport's cell rules), like the app's other CSV files.
import { toCsv } from './orgExport'
import { invoiceLineNet } from './invoices'

export const INVOICE_CSV_COLUMNS = ['avx_number', 'kind', 'status', 'legal_number', 'credits', 'issue_date', 'due_date', 'client', 'client_tax_id',
  'client_address', 'client_email', 'currency', 'line', 'description', 'details', 'qty', 'unit_price', 'discount_pct', 'vat_rate', 'vat_exemption',
  'line_net', 'invoice_net', 'invoice_vat', 'invoice_total', 'quote', 'gig', 'notes']

// Each line of each invoice (credit notes name the invoice they credit)
export function invoiceCsvRows(invoices, all = invoices) {
  const byId = new Map(all.map(i => [i.id, i]))
  const rows = []
  for (const i of invoices) {
    const credited = i.credited_invoice_id ? byId.get(i.credited_invoice_id) : null
    ;(i.lines || []).forEach((l, n) => rows.push({
      avx_number: i.number, kind: i.kind, status: i.status, legal_number: i.legal_number || '', credits: credited?.legal_number || '',
      issue_date: i.issue_date || '', due_date: i.due_date || '', client: i.client_name || '', client_tax_id: i.client_tax_id || '',
      client_address: i.client_address || '', client_email: i.client_email || '', currency: i.currency,
      line: n + 1, description: l.description, details: l.details || '', qty: Number(l.qty), unit_price: Number(l.unit_price),
      discount_pct: Number(l.discount_pct || 0), vat_rate: Number(l.vat_rate), vat_exemption: l.vat_exemption || '', line_net: invoiceLineNet(l),
      invoice_net: Number(i.net), invoice_vat: Number(i.vat), invoice_total: Number(i.total),
      quote: i.quote?.title || '', gig: i.gig?.name || '', notes: i.notes || '',
    }))
  }
  return rows
}

export const invoicesCsv = (invoices, all) => toCsv(invoiceCsvRows(invoices, all), INVOICE_CSV_COLUMNS)

export function downloadInvoicesCsv(invoices, all, fileName) {
  const blob = new Blob(['﻿' + invoicesCsv(invoices, all)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Invoices in the database, and the invoicing Edge Function that talks to the organisation's
// certified program (steps 11 and 11b). The maths is in invoices.js.
import { supabase } from './supabase'

export const INVOICE_SELECT = 'id, org_id, number, kind, credited_invoice_id, quote_id, gig_id, client_id, client_name, client_tax_id, client_address, client_email, scope, phase_ids, deposit_pct, language, currency, lines, net, vat, total, notes, issue_date, due_date, status, sent_at, issued_at, paid_on, legal_number, pdf_url, provider, provider_document_id, client_reminded_at, removed_at, created_at, updated_at, quote:quotes(id, number, title, created_by), gig:gigs(id, name)'

// Fields the app may write (the database gives the number and works out the totals)
const DRAFT_FIELDS = ['client_id', 'client_name', 'client_tax_id', 'client_address', 'client_email', 'scope', 'phase_ids', 'deposit_pct', 'language', 'currency', 'lines', 'notes', 'issue_date', 'due_date']

async function errorBody(error) {
  try {
    const body = await error.context?.json?.()
    if (body) return body
  } catch { /* not JSON */ }
  return { error: error.message }
}

export async function loadInvoices(orgId, { quoteId = null, gigId = null } = {}) {
  let q = supabase.from('invoices').select(INVOICE_SELECT).eq('org_id', orgId).is('removed_at', null)
  if (quoteId) q = q.eq('quote_id', quoteId)
  if (gigId) q = q.eq('gig_id', gigId)
  const { data, error } = await q.order('number', { ascending: false }).limit(2000)
  if (error) throw error
  return data || []
}

export async function createInvoice(orgId, draft) {
  const row = { org_id: orgId, kind: draft.kind || 'invoice', credited_invoice_id: draft.credited_invoice_id || null, quote_id: draft.quote_id || null, gig_id: draft.gig_id || null }
  for (const k of DRAFT_FIELDS) if (k in draft) row[k] = draft[k]
  const { data, error } = await supabase.from('invoices').insert(row).select(INVOICE_SELECT).single()
  if (error) throw error
  return data
}

export async function updateInvoice(id, changes) {
  const { data, error } = await supabase.from('invoices').update(changes).eq('id', id).select(INVOICE_SELECT).single()
  if (error) throw error
  return data
}

export const saveDraft = (id, draft) => updateInvoice(id, Object.fromEntries(DRAFT_FIELDS.filter(k => k in draft).map(k => [k, draft[k]])))
export const removeDraft = id => updateInvoice(id, { removed_at: new Date().toISOString() })

// Totals per quote, gig or client: [{ ref_id, currency, invoiced_net, invoiced, credited, paid, outstanding, overdue, to_issue, … }]
export async function invoiceSummary(orgId, by, ids = null) {
  const { data, error } = await supabase.rpc('invoice_summary', { p_org: orgId, p_by: by, p_ids: ids })
  if (error) throw error
  return data || []
}

// The organisation's invoicing program (step 11b): { provider, connected, expired, account,
// company_name, document_set_name, ready, connected_at }, or null when it works by hand
export async function invoicingStatus(orgId) {
  const { data, error } = await supabase.rpc('invoicing_status', { p_org: orgId })
  if (error) throw error
  return data?.[0] || null
}

// Emails the client a reminder of an overdue invoice, with its PDF link (invoice-reminder)
export async function remindClient(invoiceId) {
  const { data, error } = await supabase.functions.invoke('invoice-reminder', { body: { invoice_id: invoiceId } })
  if (error) {
    const b = await errorBody(error)
    throw new Error(b.error ? `invoice:${b.error}` : error.message)
  }
  return data
}

// Calls the invoicing Edge Function (connect, setup, save_setup, disconnect, push, sync). Refusals
// come back as Error('invoice:<code>') with .detail (the program's own words, when it gave any)
export async function invoicing(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('invoicing', { body: { action, ...body } })
  if (error) {
    const b = await errorBody(error)
    const e = new Error(b.error ? `invoice:${b.error}` : error.message)
    e.detail = b.detail
    throw e
  }
  return data
}

// The programs the owner has switched on; none when the function isn't there yet
export async function invoicingProviders() {
  try { return (await invoicing('providers')).providers || [] } catch { return [] }
}

export const PROGRAM_NAMES = { moloni: 'Moloni', invoicexpress: 'InvoiceXpress', toconline: 'TOConline' }

// ── Payments (step 12) ──────────────────────────────────────────────────────
const PAYMENT_SELECT = 'id, invoice_id, paid_on, amount, method, note, created_at, created_by'

// Payments of the given invoices (not removed), or of every invoice of the organisation
export async function loadPayments(orgId, invoiceIds = null) {
  let q = supabase.from('invoice_payments').select(PAYMENT_SELECT).eq('org_id', orgId).is('removed_at', null)
  if (invoiceIds) q = q.in('invoice_id', invoiceIds)
  const { data, error } = await q.order('paid_on').limit(5000)
  if (error) throw error
  return data || []
}

// The database turns the invoice paid when its payments cover it
export async function recordPayment(orgId, invoiceId, { paid_on: paidOn, amount, method, note }) {
  const { error } = await supabase.from('invoice_payments')
    .insert({ org_id: orgId, invoice_id: invoiceId, paid_on: paidOn, amount, method, note: note || null })
  if (error) throw error
}

export async function removePayment(id) {
  const { error } = await supabase.from('invoice_payments').update({ removed_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// A gig's repairs charged to the client, with the invoice each is billed on
export async function loadChargedRepairs(gigId) {
  const { data, error } = await supabase.from('repairs')
    .select('id, problem, cost, charge_client, status, invoice_id, created_at, item:item_id(name), unit:unit_id(code)')
    .eq('gig_id', gigId).eq('charge_client', true).order('created_at').limit(500)
  if (error) throw error
  return data || []
}

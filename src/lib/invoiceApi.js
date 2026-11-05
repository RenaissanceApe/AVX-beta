// Invoices in the database and the moloni Edge Function (step 11). The maths is in invoices.js.
import { supabase } from './supabase'

export const INVOICE_SELECT = 'id, org_id, number, kind, credited_invoice_id, quote_id, gig_id, client_id, client_name, client_tax_id, client_address, client_email, scope, phase_ids, deposit_pct, language, currency, lines, net, vat, total, notes, issue_date, due_date, status, sent_at, issued_at, paid_on, legal_number, pdf_url, moloni_document_id, client_reminded_at, removed_at, created_at, updated_at, quote:quotes(id, number, title, created_by), gig:gigs(id, name)'

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

export async function moloniStatus(orgId) {
  const { data, error } = await supabase.rpc('moloni_status', { p_org: orgId })
  if (error) throw error
  return data?.[0] || null
}

// Calls the moloni Edge Function; refusals come back as Error('moloni:<code>') with .detail
export async function moloni(action, body) {
  const { data, error } = await supabase.functions.invoke('moloni', { body: { action, ...body } })
  if (error) {
    const b = await errorBody(error)
    const e = new Error(b.error ? `moloni:${b.error}` : error.message)
    e.detail = b.detail
    throw e
  }
  return data
}

import { supabase } from './supabase'
import { quoteSnapshot, quoteTotals } from './quotes'

// Edge Function errors carry a JSON body; return it (or the plain message)
async function errorBody(error) {
  try {
    const body = await error.context?.json?.()
    if (body) return body
  } catch { /* not JSON */ }
  return { error: error.message }
}

// Freeze the quote as a numbered version (the database assigns the number)
export async function saveVersion(quote, body, note) {
  const snapshot = quoteSnapshot(quote, body)
  return supabase.from('quote_versions').insert({
    quote_id: quote.id, org_id: quote.org_id, note: note?.trim().slice(0, 200) || null, snapshot,
    total_net: quoteTotals({ ...quote, body: snapshot.body }).net,
  }).select('id, version_no, note, total_net, created_at, created_by').single()
}

// One key per send. Clicking Send again after an error (same address, same choice) reuses the
// key and the version saved for it, so send-quote sees the same send and doesn't email it twice.
// Anything else starts a new send. Forget the attempt (null) once a send gets an answer.
export function sendAttempt(previous, { email, sendEmail }) {
  const to = (email || '').trim().toLowerCase()
  if (previous && previous.email === to && previous.sendEmail === !!sendEmail) return previous
  return { key: crypto.randomUUID(), email: to, sendEmail: !!sendEmail, versionId: null }
}

// Creates a link to the version (replacing any earlier open link) and emails it when
// asked, optionally with a PDF of the quote attached ({ content: base64, name }).
// Returns { link, share_id, emailed, email_error? }, or { duplicate: true, share_id, emailed }
// when this send (requestKey) already went through.
export async function sendQuote({ quoteId, versionId, email, sendEmail, pdf, requestKey }) {
  const { data, error } = await supabase.functions.invoke('send-quote', {
    body: {
      quote_id: quoteId, version_id: versionId, email: email?.trim() || '', send_email: !!sendEmail,
      request_key: requestKey || null,
      ...(pdf ? { pdf: pdf.content, pdf_name: pdf.name } : {}),
    },
  })
  if (error) throw new Error((await errorBody(error)).error || error.message)
  return data
}

// Public page: { state: 'open' | 'accepted' | 'declined' | 'expired' | 'not_found', quote?, org?, branding?, … }
export async function loadSharedQuote(token) {
  const { data, error } = await supabase.functions.invoke('quote-public', { body: { t: token, action: 'view' } })
  if (error) {
    const body = await errorBody(error)
    return body.state ? body : { state: 'error' }
  }
  return data
}

export async function answerSharedQuote(token, action, name, note) {
  const { data, error } = await supabase.functions.invoke('quote-public', { body: { t: token, action, name, note } })
  if (error) {
    const body = await errorBody(error)
    return { error: body.error || 'error', state: body.state }
  }
  return data
}

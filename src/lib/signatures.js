// E-signatures (step 16, docs/BUSINESS.md "How e-signature works"): a plain electronic signature
// — a drawn image, the signer's typed name, the time and the SHA-256 of the exact text signed —
// stored privately in the `signatures` bucket, with a signed PDF kept beside it. Once saved, the
// database refuses any change (supabase/migrations/20270105000000_signatures.sql).
import { supabase } from './supabase'
import { logger } from './logger'

export const SIGNATURE_BUCKET = 'signatures'

// The text that is hashed and signed: JSON with keys sorted at every level and no spaces, so the
// same content always gives the same hash (quote-public builds it the same way for quotes).
export function canonicalJson(value) {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(v => (v === undefined ? 'null' : canonicalJson(v))).join(',') + ']'
  return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

// SHA-256 as lowercase hex, of a string (UTF-8) or of bytes (Blob / ArrayBuffer / Uint8Array)
export async function sha256Hex(input) {
  let bytes
  if (typeof input === 'string') bytes = new TextEncoder().encode(input)
  else if (input instanceof Blob) bytes = new Uint8Array(await input.arrayBuffer())
  else bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Paths are fixed by the database: <org>/<signature>/signature.png and …/signed.pdf
export const signedPdfPath = sig => `${sig.org_id}/${sig.id}/signed.pdf`

// A short form of the hash for printing next to the signature ("3f2a 9c1b … 77e0")
export function shortHash(hex) {
  const h = String(hex || '')
  if (h.length < 16) return h
  return `${h.slice(0, 4)} ${h.slice(4, 8)} … ${h.slice(-4)}`
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Save a signature collected in the app (delivery note, later contracts and rigging sign-off).
//   document: the content being signed (any JSON-able object); its canonical text is stored and hashed
//   image: the drawn signature as a PNG Blob
// Returns the saved row. The row goes in first (it fixes the time and the paths), then the drawing.
export async function saveSignature({ orgId, kind, gigId = null, title, signerName, signerRole = null, document, image }) {
  const id = crypto.randomUUID()
  const text = canonicalJson(document)
  const [documentHash, imageHash] = await Promise.all([sha256Hex(text), sha256Hex(image)])
  const { data: row, error } = await supabase.from('signatures').insert({
    id, org_id: orgId, kind, gig_id: gigId, title, signer_name: signerName, signer_role: signerRole || null,
    document: text, document_sha256: documentHash, image_path: `${orgId}/${id}/signature.png`, image_sha256: imageHash,
  }).select().single()
  if (error) throw error
  const { error: upErr } = await supabase.storage.from(SIGNATURE_BUCKET)
    .upload(row.image_path, image, { contentType: 'image/png', upsert: false })
  if (upErr) {
    logger.error('signature', upErr, { step: 'image', signatureId: id })
    throw upErr
  }
  return row
}

// Keep the signed PDF with the signature (once; the database refuses a second one).
export async function attachSignedPdf(sig, pdfBlob) {
  const path = signedPdfPath(sig)
  const hash = await sha256Hex(pdfBlob)
  const { error: upErr } = await supabase.storage.from(SIGNATURE_BUCKET)
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw upErr
  const { data, error } = await supabase.from('signatures').update({ pdf_path: path, pdf_sha256: hash })
    .eq('id', sig.id).is('pdf_path', null).select().single()
  if (error) throw error
  return data
}

// A copy of the signed PDF in the gig's files (Files tab). The kept copy stays in the signatures
// bucket; this one is for convenience, so a failure is logged and not shown.
export async function copyToGigFiles(gigId, name, pdfBlob, userId) {
  try {
    const path = `${gigId}/${Date.now()}-signed.pdf`
    const { error: upErr } = await supabase.storage.from('gig-assets').upload(path, pdfBlob, { contentType: 'application/pdf' })
    if (upErr) throw upErr
    const { error } = await supabase.from('assets').insert({
      gig_id: gigId, type: 'document', name, file_url: path, file_size: pdfBlob.size, created_by: userId,
    })
    if (error) throw error
    return true
  } catch (e) {
    logger.error('signature', e, { step: 'gig_file', gigId })
    return false
  }
}

// Save a signature's file (the signed PDF) on this device. A download rather than a new tab:
// after the awaits a browser would block the tab as a pop-up.
export async function downloadSignatureFile(path, fileName) {
  const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(path)
  if (error) throw error
  const a = document.createElement('a')
  a.href = URL.createObjectURL(data)
  a.download = `${String(fileName || 'signed').replace(/[\\/:*?"<>|]+/g, ' ').trim()}.pdf`.replace(/\.pdf\.pdf$/, '.pdf')
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// The drawing as a data URL (to put into a PDF)
export async function signatureImageDataUrl(path) {
  const { data, error } = await supabase.storage.from(SIGNATURE_BUCKET).download(path)
  if (error) throw error
  return blobToDataUrl(data)
}

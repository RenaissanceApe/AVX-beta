import { supabase } from './supabase'
import { buildQuotePdf, quotePdfName } from './quotePdf'
import { attachSignedPdf, copyToGigFiles, signatureImageDataUrl } from './signatures'

// The signed PDF of a quote a client accepted with a drawn signature (step 16): the version they
// signed (the snapshot kept in the signature) with the signature block at the end. Made by the
// team's app from what the database holds, kept once with the signature, and copied into the
// quote's gig files when it has a gig.
export async function keepSignedQuotePdf(sig, { quoteNumber, userId }) {
  const snapshot = JSON.parse(sig.document)
  const [{ data: org }, { data: branding }, image] = await Promise.all([
    supabase.from('organisations').select('name, legal_name, email, phone, quote_number_prefix').eq('id', sig.org_id).single(),
    supabase.from('org_branding').select('header_image, brand_color').eq('org_id', sig.org_id).maybeSingle(),
    signatureImageDataUrl(sig.image_path),
  ])
  const quote = { ...snapshot, number: snapshot.number ?? quoteNumber }
  const doc = await buildQuotePdf({ quote, org: org || {}, branding: branding || {}, signature: { ...sig, image } })
  const pdf = doc.output('blob')
  const saved = await attachSignedPdf(sig, pdf)
  if (sig.gig_id) await copyToGigFiles(sig.gig_id, quotePdfName(quote, org || {}).replace(/\.pdf$/, ' signed.pdf'), pdf, userId)
  return saved
}

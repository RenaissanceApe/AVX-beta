import { translate, fmtIn } from '../i18n'
import { pdfSafe } from './quotePdf'

// The signature block of a signed PDF (step 16): the drawing, the signer's name and role, when it
// was signed, the document's SHA-256 and the plain-electronic-signature statement. Used by the
// signed quote and the delivery note. Draws from `y` on the current page (a new page if there isn't
// room) and returns the y below it.
const PAGE_H = 297
const SIDE = 18
const TEXT = [26, 26, 26]
const MUTED = [102, 102, 102]

export function drawSignatureBlock(doc, sig, lang, y, top = 30) {
  const L = lang === 'en' ? 'en' : 'pt'
  const tr = (key, vars) => pdfSafe(translate(L, key, vars))
  const width = doc.internal.pageSize.getWidth() - SIDE * 2
  if (y + 78 > PAGE_H - 20) { doc.addPage(); y = top }

  doc.setDrawColor(...TEXT)
  doc.setLineWidth(0.4)
  doc.line(SIDE, y, SIDE + width, y)
  y += 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...TEXT)
  doc.text(tr('signature.pdf.heading'), SIDE, y)
  y += 4
  if (sig.image) {
    // The pad draws at 3:1; keep that ratio
    doc.addImage(sig.image, 'PNG', SIDE, y, 75, 25)
  }
  doc.setDrawColor(...MUTED)
  doc.setLineWidth(0.2)
  doc.line(SIDE, y + 26, SIDE + 75, y + 26)
  y += 31
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const who = [sig.signer_name, sig.signer_role].filter(Boolean).join(' · ')
  doc.text(pdfSafe(who), SIDE, y)
  y += 5
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const when = fmtIn(L, sig.signed_at, L === 'pt' ? "dd-MM-yyyy HH:mm:ss" : 'd MMM yyyy, HH:mm:ss')
  doc.text(tr('signature.pdf.signedAt', { date: when }), SIDE, y)
  y += 5
  doc.setFont('courier', 'normal')
  doc.setFontSize(8)
  doc.text(`SHA-256: ${sig.document_sha256}`, SIDE, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  const lines = doc.splitTextToSize(tr('signature.pdf.statement'), width)
  doc.text(lines, SIDE, y)
  y += lines.length * 3.8
  doc.setTextColor(...TEXT)
  return y
}

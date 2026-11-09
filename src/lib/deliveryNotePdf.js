import { translate, fmtIn } from '../i18n'
import { pdfSafe } from './quotePdf'
import { drawSignatureBlock } from './signaturePdf'

// A signed delivery note / packing slip as an A4 PDF (step 16). Laid out from the exact document
// that was signed (deliveryNoteDocument), so the PDF and the stored hash describe the same thing.
const SIDE = 18
const TEXT = [26, 26, 26]
const MUTED = [102, 102, 102]

// What the client signs for: the gig, and per item what was planned and what went out (scanned),
// with unit codes. Plain values only, so its canonical text is stable.
export function deliveryNoteDocument({ org, gig, rows, units, note, lang }) {
  const codes = units.reduce((map, u) => { (map[u.item_id] ||= []).push(u.code); return map }, {})
  const items = rows
    .filter(r => (r.planned || 0) > 0 || (r.out_qty || 0) > 0)
    .map(r => ({
      name: r.item_name || '',
      category: r.category || '',
      planned: r.planned || 0,
      out: r.out_qty || 0,
      codes: (codes[r.item_id] || []).slice().sort(),
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  return {
    kind: 'delivery_note',
    v: 1,
    lang: lang === 'en' ? 'en' : 'pt',
    org: org || '',
    gig: { id: gig.id, name: gig.name || '', venue: gig.venue || '', start: gig.start_date || '', end: gig.end_date || '' },
    items,
    note: (note || '').trim(),
  }
}

export async function buildDeliveryNotePdf(document, signature) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const L = document.lang === 'en' ? 'en' : 'pt'
  const tr = (key, vars) => pdfSafe(translate(L, key, vars))
  const date = d => (d ? fmtIn(L, d, L === 'pt' ? 'dd-MM-yyyy' : 'd MMM yyyy') : '')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: pdfSafe(`${translate(L, 'delivery.title')} · ${document.gig.name}`), creator: 'AVX' })

  let y = 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(tr('delivery.title').toUpperCase(), SIDE, y)
  if (document.org) doc.text(pdfSafe(document.org), doc.internal.pageSize.getWidth() - SIDE, y, { align: 'right' })
  y += 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...TEXT)
  doc.text(pdfSafe(document.gig.name), SIDE, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const dates = [date(document.gig.start), document.gig.end && document.gig.end !== document.gig.start ? date(document.gig.end) : ''].filter(Boolean).join(' – ')
  doc.text(pdfSafe([document.gig.venue, dates].filter(Boolean).join(' · ')), SIDE, y)
  y += 6

  autoTable(doc, {
    startY: y,
    margin: { left: SIDE, right: SIDE },
    head: [[tr('delivery.colItem'), tr('delivery.colPlanned'), tr('delivery.colOut')]],
    body: document.items.length
      ? document.items.map(i => [
        pdfSafe([i.category ? `${i.category} · ${i.name}` : i.name, i.codes.length ? i.codes.join('  ') : ''].filter(Boolean).join('\n')),
        String(i.planned || ''), String(i.out || ''),
      ])
      : [[tr('delivery.noItems'), '', '']],
    styles: { font: 'helvetica', fontSize: 9, textColor: TEXT, cellPadding: 1.8 },
    headStyles: { fillColor: [240, 240, 240], textColor: TEXT, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 24 } },
  })
  y = doc.lastAutoTable.finalY + 6
  if (document.note) {
    doc.setFontSize(9.5)
    const lines = doc.splitTextToSize(pdfSafe(document.note), doc.internal.pageSize.getWidth() - SIDE * 2)
    doc.text(lines, SIDE, y)
    y += lines.length * 4.2 + 2
  }
  doc.setFontSize(9.5)
  const receipt = doc.splitTextToSize(tr('delivery.receipt'), doc.internal.pageSize.getWidth() - SIDE * 2)
  doc.text(receipt, SIDE, y)
  y += receipt.length * 4.2 + 4
  drawSignatureBlock(doc, signature, L, y, 20)
  return doc
}

export function deliveryNoteFileName(document, signedAt) {
  const base = `${document.gig.name} delivery ${String(signedAt || '').slice(0, 10)}`
  return `${base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'delivery'}.pdf`
}

import { translate, fmtIn } from '../i18n'
import {
  normalizeBody, quoteTotals, lineTotal, sectionTotal, formatMoney, formatNumber, quoteNumber, groupTotals, termsBlocks,
} from './quotes'
import { track } from './usage'

// A real (vector, searchable) A4 PDF of a quote, laid out like the printed quote:
// header image and contact line on every page, client, title, project details,
// agenda, sections, totals and conditions. Built in the browser so it can be
// attached to the client email. jsPDF loads only when a PDF is actually made.

const PAGE_W = 210
const PAGE_H = 297
const SIDE = 18
const BOTTOM = 20
const TEXT = [26, 26, 26]
const MUTED = [102, 102, 102]

// The built-in PDF fonts cover Western European text (WinAnsi); swap the few
// characters outside it rather than printing garbage.
const REPLACE = { '→': '->', '←': '<-', '≤': '<=', '≥': '>=', '✓': 'v', '×': 'x', '\u00a0': ' ', '\u202f': ' ',
  '\u2010': '-', '\u2011': '-', '\u2012': '\u2013', '\u2015': '\u2014', '\u2212': '-', '\u2032': "'", '\u2033': '"' }
// Latin-1 plus the WinAnsi extras (euro, dashes, curly quotes, bullet, ellipsis, per mille…)
const WINANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const SAFE = new Set(WINANSI_EXTRAS)
export function pdfSafe(text) {
  let out = ''
  for (const c of String(text ?? '')) {
    const code = c.codePointAt(0)
    if (REPLACE[c]) out += REPLACE[c]
    else if ((code >= 0x20 && code <= 0xff && code !== 0x7f) || c === '\n' || SAFE.has(c)) out += c
    else if (c === '\t') out += ' '
    else out += '?'
  }
  return out
}

const hexToRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [30, 200, 120]
}

// Header image as PNG/JPEG data plus its height/width ratio. SVGs are drawn to a canvas first.
async function loadHeader(src) {
  if (!src) return null
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = src
  }).catch(() => null)
  if (!img || !img.naturalWidth) return null
  const ratio = img.naturalHeight / img.naturalWidth
  if (/^data:image\/(png|jpe?g);/i.test(src)) return { data: src, format: /png/i.test(src.slice(0, 20)) ? 'PNG' : 'JPEG', ratio }
  const canvas = document.createElement('canvas')
  canvas.width = 2480 // A4 width at 300 dpi
  canvas.height = Math.round(2480 * ratio)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/png'), format: 'PNG', ratio }
}

export async function buildQuotePdf({ quote, org = {}, branding = {} }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const q = quote
  const L = q.language === 'en' ? 'en' : 'pt'
  const tr = (key, vars) => pdfSafe(translate(L, key, vars))
  const money = v => pdfSafe(formatMoney(v, q.currency, L))
  const num = v => pdfSafe(formatNumber(v, L))
  const date = d => (d ? fmtIn(L, d, L === 'pt' ? 'dd-MM-yyyy' : 'd MMM yyyy') : '')
  const when = (d, time) => [date(d), time].filter(Boolean).join(' ')
  const accent = hexToRgb(branding.brand_color)
  const body = normalizeBody(q.body)
  const totals = quoteTotals({ ...q, body })
  const prices = q.show_line_prices
  const visibleLines = s => s.lines.filter(l => l.description.trim() || l.details.trim() || lineTotal(l))
  const allLines = body.phases.flatMap(p => p.sections.flatMap(visibleLines))
  const showFactor = allLines.some(l => l.kind !== 'comment' && Number(l.factor) !== 1)
  const showDisc = prices && allLines.some(l => Number(l.discount_pct) > 0)
  const pricedPhases = body.phases.filter(p => p.sections.some(sec => visibleLines(sec).length)).length
  const phaseDiscounts = totals.phases.filter(p => !p.optional).reduce((sum, p) => sum + p.discount, 0)
  const contact = pdfSafe([`${org.name || ''} ${new Date(q.issue_date || Date.now()).getFullYear()}`, org.email, org.phone].filter(Boolean).join(' | '))

  const header = await loadHeader(branding.header_image)
  const headerH = header ? Math.min(120, PAGE_W * header.ratio) : 20
  const TOP = headerH + 10

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({ title: pdfSafe(`${quoteNumber(q, org.quote_number_prefix ?? 'Q')} · ${q.title}`), creator: 'AVX' })
  const width = PAGE_W - SIDE * 2
  let y = TOP

  const font = (style = 'normal', size = 10, color = TEXT, family = 'helvetica') => {
    doc.setFont(family, style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }
  const room = h => {
    if (y + h > PAGE_H - BOTTOM) { doc.addPage(); y = TOP }
  }
  const paragraph = (text, { size = 10, style = 'normal', color = TEXT, gap = 1.5, family } = {}) => {
    font(style, size, color, family)
    const lineH = size * 0.42
    for (const line of doc.splitTextToSize(pdfSafe(text), width)) {
      room(lineH)
      doc.text(line, SIDE, y + lineH * 0.8)
      y += lineH
    }
    y += gap
  }
  const heading = (text, extra) => {
    room(16)
    y += 6
    doc.setFillColor(...accent)
    doc.rect(SIDE, y, 15, 0.6, 'F')
    y += 2.5
    font('bold', 11)
    doc.text(pdfSafe(text), SIDE, y + 4)
    if (extra) {
      const w = doc.getTextWidth(pdfSafe(text))
      font('bold', 7.5, [138, 90, 0])
      doc.text(extra.toUpperCase(), SIDE + w + 3, y + 4)
    }
    y += 8
  }
  const table = (opts) => {
    autoTable(doc, {
      startY: y,
      margin: { left: SIDE, right: SIDE, top: TOP, bottom: BOTTOM },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9.5, textColor: TEXT, cellPadding: { top: 0.6, bottom: 0.6, left: 0, right: 2 }, overflow: 'linebreak' },
      headStyles: { fontStyle: 'normal', textColor: MUTED },
      ...opts,
    })
    y = doc.lastAutoTable.finalY + 2
  }

  // Client
  const clientLines = [
    q.client_company && q.client_name ? tr('quoteDoc.attention', { name: q.client_name }) : null,
    q.client_address,
    [q.client_tax_id && `${tr('quoteDoc.taxId')}: ${q.client_tax_id}`, q.client_email].filter(Boolean).join(' · '),
  ].filter(Boolean)
  if (q.client_company || q.client_name) paragraph(q.client_company || q.client_name, { size: 11, style: 'bold', gap: 0.5 })
  for (const l of clientLines) paragraph(l, { gap: 0.3 })
  y += 6

  // Title and project details
  paragraph(q.title, { size: 17, style: 'bold', family: 'courier', gap: 4 })
  table({
    body: [
      [tr('quoteDoc.projectNumber'), pdfSafe(quoteNumber(q, org.quote_number_prefix ?? 'Q'))],
      q.manager_name && [tr('quoteDoc.manager'), pdfSafe(q.manager_name)],
      [tr('quoteDoc.date'), date(q.issue_date)],
      q.valid_until && [tr('quoteDoc.validUntil'), date(q.valid_until)],
      q.payment_terms && [tr('quoteDoc.payment'), pdfSafe(q.payment_terms)],
    ].filter(Boolean),
    columnStyles: { 0: { cellWidth: 48 } },
  })
  if (q.intro) { y += 2; paragraph(q.intro) }

  // Agenda
  const agenda = body.phases.filter(p => p.start_date || p.end_date)
  if (agenda.length) {
    heading(tr('quoteDoc.agenda'))
    table({ body: agenda.map(p => [pdfSafe(p.name), when(p.start_date, p.start_time), when(p.end_date || p.start_date, p.end_time)]) })
  }

  // Phases → sections → lines
  body.phases.forEach((phase, pi) => {
    const pt = totals.phases[pi]
    const sections = phase.sections.filter(s => visibleLines(s).length)
    if (!sections.length) return
    const phaseName = phase.name || tr('quoteDoc.phaseN', { n: pi + 1 })
    heading(phaseName, phase.optional ? tr('quoteDoc.option') : null)
    for (const section of sections) {
      if (section.name) { room(12); paragraph(section.name, { size: 10.5, style: 'bold', gap: 1 }) }
      const head = [tr('quoteDoc.qty'), tr('quoteDoc.description')]
      if (prices) head.push(tr('quoteDoc.unitPrice'))
      if (prices && showFactor) head.push(tr('quoteDoc.factor'))
      if (showDisc) head.push(tr('quoteDoc.discount'))
      if (prices) head.push(tr('quoteDoc.total'))
      const numCols = head.length - 2
      const rows = visibleLines(section).map(line => {
        const desc = pdfSafe(line.description) + (line.details ? `\n${pdfSafe(line.details)}` : '')
        if (line.kind === 'comment') return [{ content: '' }, { content: desc, colSpan: head.length - 1, styles: { fontStyle: 'italic', textColor: MUTED } }]
        const qty = num(line.qty) + (line.unit !== 'unit' ? ` ${tr(`unit.${line.unit}`, { count: Number(line.qty) })}` : '')
        const row = [qty, desc]
        if (prices) row.push(money(line.unit_price))
        if (prices && showFactor) row.push(num(line.factor))
        if (showDisc) row.push(Number(line.discount_pct) ? `${num(line.discount_pct)}%` : '')
        if (prices) row.push(money(lineTotal(line)))
        return row
      })
      const totalLabel = tr('quoteDoc.totalOf', { name: section.name || tr('quoteDoc.section') })
      rows.push(head.length > 2
        ? ['', { content: totalLabel, colSpan: head.length - 2 }, { content: money(sectionTotal(section)), styles: { halign: 'right' } }]
        : ['', { content: `${totalLabel}: ${money(sectionTotal(section))}`, styles: { fontStyle: 'bold' } }])
      const columnStyles = { 0: { cellWidth: 20 } }
      for (let c = 2; c < 2 + numCols; c++) columnStyles[c] = { halign: 'right', cellWidth: c === head.length - 1 || c === 2 ? 26 : 16 }
      table({ head: [head], body: rows, columnStyles, rowPageBreak: 'avoid',
        didParseCell: d => { if (d.section === 'head' && d.column.index >= 2) d.cell.styles.halign = 'right' } })
      y += 3
    }
    if (pt.discount > 0 || pricedPhases > 1) {
      const label = phase.optional ? tr('quoteDoc.optionTotal') : tr('quoteDoc.totalOf', { name: phaseName })
      const disc = pt.discount > 0 ? `${tr('quoteDoc.discountPct', { pct: num(phase.discount_pct) })} -${money(pt.discount)} · ` : ''
      room(6)
      font('bold', 10)
      doc.text(`${disc}${pdfSafe(label)} ${money(pt.net)}`, PAGE_W - SIDE, y + 3.5, { align: 'right' })
      y += 7
    }
  })

  // Totals
  heading(tr('quoteDoc.totalTitle'))
  const strong = { fontStyle: 'bold', fontSize: 11 }
  const totalRows = [
    ...groupTotals(totals.byKind).filter(g => g.amount).map(g => [tr(`quoteDoc.group.${g.key}`), money(g.amount)]),
    phaseDiscounts > 0 && [tr('quoteDoc.phaseDiscounts'), `-${money(phaseDiscounts)}`],
    totals.discount > 0 && [tr('quoteDoc.finalDiscount', { pct: num(q.discount_pct) }), `-${money(totals.discount)}`],
    [{ content: tr('quoteDoc.totalExVat'), styles: strong }, { content: money(totals.net), styles: strong }],
    [tr('quoteDoc.vat', { pct: num(q.vat_rate) }), money(totals.vat)],
    [{ content: tr('quoteDoc.totalIncVat'), styles: strong }, { content: money(totals.total), styles: strong }],
  ].filter(Boolean)
  table({ body: totalRows, columnStyles: { 1: { halign: 'right' } }, pageBreak: 'avoid' })
  if (totals.optional > 0) paragraph(tr('quoteDoc.optionsNote', { amount: formatMoney(totals.optional, q.currency, L) }), { size: 9, color: MUTED })

  // Conditions
  if (q.terms) {
    y += 8
    room(14)
    paragraph(tr('quoteDoc.terms'), { size: 11, style: 'bold', gap: 3 })
    for (const b of termsBlocks(q.terms)) {
      if (b.type === 'h') { room(10); y += 2; paragraph(b.text, { size: 10, style: 'bold', gap: 1 }) }
      else paragraph(b.text, { size: 9.5, gap: 1.5 })
    }
  }

  // Header image and contact line on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    if (header) doc.addImage(header.data, header.format, 0, 0, PAGE_W, headerH, 'header', 'FAST')
    else {
      doc.setFillColor(...accent)
      doc.rect(0, 0, PAGE_W, headerH, 'F')
      font('bold', 14, [255, 255, 255])
      doc.text(pdfSafe(org.legal_name || org.name || ''), SIDE, headerH / 2 + 2)
    }
    font('normal', 8.5, MUTED)
    doc.text(contact, SIDE, PAGE_H - 9)
    if (pages > 1) doc.text(`${i}/${pages}`, PAGE_W - SIDE, PAGE_H - 9, { align: 'right' })
  }
  return doc
}

export function quotePdfName(quote, org = {}) {
  const base = `${quoteNumber(quote, org.quote_number_prefix ?? 'Q')} ${quote.title || ''}`
  return `${base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'quote'}.pdf`
}

export async function downloadQuotePdf(args) {
  const doc = await buildQuotePdf(args)
  track('quote:pdf-downloaded')
  doc.save(quotePdfName(args.quote, args.org))
}

// Base64 (no data: prefix) for the email attachment
export async function quotePdfBase64(args) {
  const doc = await buildQuotePdf(args)
  return doc.output('datauristring').split(',')[1]
}

import { translate, fmtIn } from '../i18n'
import { pdfSafe } from './quotePdf'
import { PHASES } from './power'
import { cableTypeName, cableLineName, cableList, runName } from './cables'

// The power plan report (P1) as an A4 PDF for the gig's files, and the texts the printable page
// shares with it. Labelled throughout as an estimate for a qualified electrician.
const SIDE = 14
const TEXT = [26, 26, 26]
const MUTED = [102, 102, 102]

// Where a load is plugged in, in words
export function placeLabel(a, distros, supply, tr) {
  if (!a) return tr('power.notPlugged')
  if (a.phase) return tr('power.direct', { phase: supply.phases === 1 ? tr('power.single') : a.phase === '3P' ? tr('power.threePhase') : a.phase })
  const d = distros.find(x => x.id === a.distro)
  const o = d?.outputs.find(x => x.id === a.output)
  return d && o ? `${d.name} · ${o.label || tr(`power.conn.${o.connector}`)} (${o.phase})` : tr('power.notPlugged')
}
export const ampsLine = (amps, phases) => (phases === 1 ? `${amps[0]} A` : PHASES.map((p, i) => `${p} ${amps[i]} A`).join(' · '))
export function figureLabel(load, tr) {
  if (load.unknown) return tr('power.noFigure')
  if (load.fromAmps) return tr('power.fromAmps', { va: Math.round(load.va) })
  return tr('power.w', { w: Math.round(load.watts) })
}
export function supplyLine(supply, tr) {
  return [
    supply.name, tr(`power.kindOf.${supply.kind}`),
    supply.phases === 3 ? tr('power.voltsThree', { v: supply.volts, ll: Math.round((supply.volts * Math.sqrt(3)) / 10) * 10 }) : tr('power.voltsSingle', { v: supply.volts }),
    `${supply.hz} Hz`, tr('power.ampsPerPhase', { a: supply.amps }),
  ].filter(Boolean).join(' · ')
}
export function generatorLine(g, tr) {
  if (!(g.needed > 0)) return tr('power.generatorNone')
  return g.size ? tr('power.generatorSize', { size: g.size, kva: g.kva, margin: g.margin }) : tr('power.generatorTooBig', { kva: g.needed })
}

// P2: the cable runs, the cable list and the inrush groups as table rows (texts), for the page and the PDF
export function cableRows({ cables, checks, distros, tr }) {
  return cables.map(c => {
    const x = checks[c.id]
    const power = c.kind === 'power'
    return {
      key: c.id, name: runName(c, distros, tr), type: cableTypeName(c, tr),
      length: `${c.qty > 1 ? `${c.qty} × ` : ''}${tr('cables.metres', { m: c.length })}`,
      laying: power ? `${tr(`cables.lay.${c.laying}`)}${c.group ? ` (${c.group})` : ''} · ${c.ambient} °C` : tr(`cables.kind.${c.kind}`),
      amps: power && x?.amps != null ? `${x.amps} A` : '',
      cap: power && x?.cap ? `${x.cap.amps} A` : '',
      drop: power && x?.drop ? tr('cables.dropCell', { pct: x.drop.pct, total: x.total }) : '',
      state: power && x ? tr(`cables.state.${x.state}`) : '',
    }
  })
}
export const cableListRows = (cables, tr) => cableList(cables).map(l => ({ key: l.key, qty: l.qty, name: cableLineName(l, tr), kind: tr(`cables.kind.${l.kind}`) }))
export function inrushRows({ inrush, distros, supply, tr }) {
  return inrush.filter(g => g.inrush > 0 || g.missing > 0).map(g => ({
    key: g.key, where: placeLabel(g.phase ? { phase: g.phase } : { distro: g.distro, output: g.output }, distros, supply, tr),
    sum: [tr('inrush.sum', { a: g.inrush, count: g.count }), g.missing ? tr('inrush.missing', { count: g.missing }) : ''].filter(Boolean).join(' · '),
    breaker: g.rating ? `${g.rating} A (${g.ratio} ×)` : '', state: tr(`inrush.state.${g.state}`),
  }))
}

export async function buildPowerPdf({ gig, org, supply, distros, loads, assign, plan, warnings, cables = [], checks = {}, inrush = [], lang }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const L = lang === 'en' ? 'en' : 'pt'
  const tr = (key, vars) => pdfSafe(translate(L, key, vars))
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })
  const width = doc.internal.pageSize.getWidth()
  doc.setProperties({ title: pdfSafe(`${translate(L, 'tools.name.power')} · ${gig.name}`), creator: 'AVX' })
  const table = (head, body, opts = {}) => {
    autoTable(doc, {
      startY: y, margin: { left: SIDE, right: SIDE }, head: [head], body,
      styles: { font: 'helvetica', fontSize: 8.5, textColor: TEXT, cellPadding: 1.5 },
      headStyles: { fillColor: [240, 240, 240], textColor: TEXT, fontStyle: 'bold' }, ...opts,
    })
    y = doc.lastAutoTable.finalY + 6
  }
  const heading = text => {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 16 }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TEXT)
    doc.text(pdfSafe(text), SIDE, y); y += 4
  }
  const para = (text, size = 9) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...TEXT)
    const lines = doc.splitTextToSize(pdfSafe(text), width - SIDE * 2)
    doc.text(lines, SIDE, y); y += lines.length * (size * 0.45) + 2
  }

  let y = 16
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text(tr('tools.name.power').toUpperCase(), SIDE, y)
  if (org) doc.text(pdfSafe(org), width - SIDE, y, { align: 'right' })
  y += 7
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...TEXT)
  doc.text(pdfSafe(gig.name || ''), SIDE, y); y += 6
  const date = d => (d ? fmtIn(L, d, L === 'pt' ? 'dd-MM-yyyy' : 'd MMM yyyy') : '')
  para([gig.venue, [date(gig.start_date), gig.end_date && gig.end_date !== gig.start_date ? date(gig.end_date) : ''].filter(Boolean).join(' – ')].filter(Boolean).join(' · '))
  doc.setDrawColor(...TEXT); doc.setLineWidth(0.3)
  const est = doc.splitTextToSize(tr('power.estimate'), width - SIDE * 2 - 6)
  doc.rect(SIDE, y - 1, width - SIDE * 2, est.length * 4 + 4)
  doc.setFontSize(9); doc.text(est, SIDE + 3, y + 3); y += est.length * 4 + 8

  heading(tr('power.supply'))
  para(supplyLine(supply, tr))
  para(`${ampsLine(plan.supply.amps, supply.phases)} · ${tr('power.neutral', { a: plan.supply.neutral })}${supply.phases === 3 ? ` · ${tr('power.balance', { pct: plan.supply.balance })}` : ''}`)
  para(`${tr('power.generator')} ${generatorLine(plan.generator, tr)}`)
  para(tr('power.total', { watts: tr('power.w', { w: plan.total.watts }), count: plan.total.count }))
  y += 2

  if (warnings.length) {
    heading(tr('power.warnings'))
    for (const w of warnings) para(`${tr(`power.level.${w.level}`)}: ${tr(w.key, w.vars)}`)
    y += 2
  }

  for (const d of distros) {
    const r = plan.distros[d.id]
    heading(`${d.name} · ${tr(`power.status.${r.status}`)}`)
    para(`${tr('power.feed')}: ${!d.feed ? tr('power.notPlugged') : d.feed === 'supply' ? tr('power.fromSupply') : placeLabel(d.feed, distros, supply, tr)} · ${ampsLine(r.amps, supply.phases)}${r.rating ? ` · ${tr('power.rating', { a: r.rating })}` : ''}`)
    table(
      [tr('power.outputLabel'), tr('power.connector'), tr('power.phase'), tr('power.breaker'), tr('power.rcd'), tr('power.current'), tr('power.headroom'), tr('power.loads')],
      d.outputs.map((o, i) => {
        const x = r.outputs[o.id]
        return [pdfSafe(o.label || tr('power.outputN', { n: i + 1 })), tr(`power.conn.${o.connector}`), o.phase, x.rating ? `${x.rating} A` : '', o.rcd_ma ? `${o.rcd_ma} mA` : '',
          ampsLine(x.amps, supply.phases), `${Math.round((x.ratio || 0) * 100)}% · ${tr(`power.state.${x.state}`)}`,
          pdfSafe(x.loads.map(k => loads.find(l => l.key === k)?.name || '').join(', '))]
      }),
    )
  }

  heading(tr('power.loads'))
  table(
    [tr('power.loadName'), tr('power.kindLabel'), tr('power.qty'), tr('power.draw'), tr('power.pluggedHead'), tr('power.statusHead')],
    loads.map(l => [pdfSafe(l.name), tr(`power.kind.${l.kind}`), String(l.qty), figureLabel(l, tr), placeLabel(assign[l.key], distros, supply, tr), tr(`power.status.${plan.loads[l.key].status}`)]),
  )
  const surges = inrushRows({ inrush, distros, supply, tr })
  if (surges.length) {
    heading(tr('inrush.title'))
    table([tr('inrush.where'), tr('inrush.head'), tr('power.breaker'), tr('power.statusHead')], surges.map(r => [pdfSafe(r.where), r.sum, r.breaker, r.state]))
  }
  const runs = cableRows({ cables, checks, distros, tr })
  if (runs.length) {
    heading(tr('cables.title'))
    table(
      [tr('cables.run'), tr('cables.type'), tr('cables.length'), tr('cables.laying'), tr('power.current'), tr('cables.capacityHead'), tr('cables.dropHead'), tr('power.statusHead')],
      runs.map(r => [pdfSafe(r.name), r.type, r.length, r.laying, r.amps, r.cap, r.drop, r.state]),
    )
    heading(tr('cables.list'))
    table([tr('power.qty'), tr('cables.type'), tr('cables.kindLabel')], cableListRows(cables, tr).map(r => [String(r.qty), pdfSafe(r.name), r.kind]))
  }
  heading(tr('power.assumptions'))
  for (const k of ['power.assume.sum', 'power.assume.pf', 'power.assume.harmonics', 'power.assume.amps', 'power.assume.unplugged']) para(`• ${tr(k)}`, 8.5)
  if (runs.length || surges.length) for (const k of ['drop', 'capacity', 'inrush', 'sources']) para(`• ${tr(`cables.assume.${k}`)}`, 8.5)
  para(tr('callsheet.printed', { date: fmtIn(L, new Date(), 'd MMM yyyy, HH:mm') }), 8)
  return doc
}

export const powerPdfName = (gig, lang) => `${translate(lang === 'en' ? 'en' : 'pt', 'tools.name.power')} · ${gig.name}`.replace(/[\\/:*?"<>|]+/g, ' ').trim()

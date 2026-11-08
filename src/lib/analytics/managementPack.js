// The monthly management pack (K9): one PDF with the key numbers, money, sales and equipment of a
// month, read from the same report functions as the Reports area (nothing is added up here) and
// laid out with jsPDF. docs/ANALYTICS.md, "How K9 works".

import { supabase } from '../supabase'
import { retryOnce } from '../selectAll'
import { formatMoney } from '../quotes'
import { pdfSafe } from '../quotePdf'
import { track } from '../usage'
import { OVERVIEW_TILES, OVERVIEW_SOURCES, moneyLines } from './tiles'
import { addMonthsIso } from './periods'

// The last `count` whole months before today's month, newest first: ['2026-10', '2026-09', …]
export function packMonths(today, count = 12) {
  const start = `${today.slice(0, 7)}-01`
  return Array.from({ length: count }, (_, i) => addMonthsIso(start, -(i + 1)).slice(0, 7))
}

export const packRange = month => ({ from: `${month}-01`, until: addMonthsIso(`${month}-01`, 1) })

async function rpc(fn, args) {
  const { data, error } = await retryOnce(() => supabase.rpc(fn, args))
  if (error) throw error
  return data
}

// Everything the pack shows, in one go
export async function loadPack(orgId, month) {
  const { from, until } = packRange(month)
  const prev = packRange(addMonthsIso(from, -1).slice(0, 7))
  const [overviews, money, moneyPrev, sales, clients, equipment] = await Promise.all([
    Promise.all(OVERVIEW_SOURCES.map(fn => rpc(fn, { p_org: orgId }))),
    rpc('finance_results', { p_org: orgId, p_from: from, p_until: until, p_group: 'total' }),
    rpc('finance_results', { p_org: orgId, p_from: prev.from, p_until: prev.until, p_group: 'total' }),
    rpc('sales_win_rate', { p_org: orgId, p_from: from, p_until: until, p_group: 'total' }),
    rpc('sales_clients', { p_org: orgId, p_from: from, p_until: until }),
    rpc('equipment_money', { p_org: orgId, p_from: from, p_until: until }),
  ])
  return { month, overview: Object.assign({}, ...overviews.map(o => o || {})), money: money || [], moneyPrev: moneyPrev || [], sales: sales || [], clients: clients || [], equipment: equipment || [] }
}

const pct = (v, lang) => (v == null ? '—' : `${(Math.round(Number(v) * 1000) / 10).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%`)

function tileText(tile, overview, lang) {
  const v = tile.value(overview)
  if (tile.kind === 'money') return moneyLines(v).map(l => formatMoney(l.amount, l.currency, lang)).join(' · ')
  if (tile.kind === 'pct') return pct(v, lang)
  if (tile.kind === 'pctValue') return v == null ? '—' : `${Number(v).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%`
  return String(v ?? 0)
}

// The pack as sections of tables, ready for the PDF (and for tests): [{ title, head, body }]
export function packSections(data, { t, lang }) {
  const money = (v, c) => formatMoney(Number(v) || 0, c || 'EUR', lang)
  const sections = []

  sections.push({
    title: t('reports.pack.keyNumbers'),
    head: [t('reports.pack.number'), t('reports.pack.value')],
    body: OVERVIEW_TILES.map(tile => [t(`reports.tile.${tile.key}`), tileText(tile, data.overview, lang)]),
  })

  const currencies = [...new Set([...data.money, ...data.moneyPrev].map(r => r.currency))].sort()
  const MONEY_ROWS = ['revenue', 'direct_costs', 'gross_margin', 'overheads', 'depreciation', 'operating_result']
  sections.push({
    title: t('reports.pack.money'),
    head: [t('reports.pack.number'), t('reports.pack.thisMonth'), t('reports.pack.monthBefore')],
    body: currencies.length
      ? currencies.flatMap(c => {
        const now = data.money.find(r => r.currency === c) || {}
        const before = data.moneyPrev.find(r => r.currency === c) || {}
        return [
          ...MONEY_ROWS.map(k => [`${t(`reports.pack.row.${k}`)} (${c})`, money(now[k], c), money(before[k], c)]),
          [`${t('reports.pack.row.margin_pct')} (${c})`, now.margin_pct == null ? '—' : `${Number(now.margin_pct).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%`,
            before.margin_pct == null ? '—' : `${Number(before.margin_pct).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%`],
          ...(Number(now.estimated) ? [[`${t('reports.pack.row.estimated')} (${c})`, money(now.estimated, c), money(before.estimated, c)]] : []),
        ]
      })
      : [[t('reports.pack.nothing'), '', '']],
  })

  sections.push({
    title: t('reports.pack.sales'),
    head: [t('reports.pack.number'), t('reports.pack.value')],
    body: data.sales.length
      ? data.sales.flatMap(s => [
        [`${t('reports.pack.row.decided')} (${s.currency})`, `${s.decided} (${t('reports.pack.acceptedDeclined', { accepted: s.accepted, declined: s.declined })})`],
        [`${t('reports.pack.row.winRateCount')} (${s.currency})`, pct(s.win_rate_count, lang)],
        [`${t('reports.pack.row.winRateValue')} (${s.currency})`, pct(s.win_rate_value, lang)],
        [`${t('reports.pack.row.valueAccepted')} (${s.currency})`, money(s.value_accepted, s.currency)],
      ])
      : [[t('reports.pack.nothing'), '']],
  })

  const topClients = [...data.clients].filter(c => Number(c.revenue)).sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 5)
  sections.push({
    title: t('reports.pack.topClients'),
    head: [t('reports.pack.client'), t('reports.pack.row.revenue'), t('reports.pack.row.gross_margin'), t('reports.pack.gigs')],
    body: topClients.length
      ? topClients.map(c => [c.client_name || '—', money(c.revenue, c.currency), money(c.gross_margin, c.currency), String(c.gigs ?? 0)])
      : [[t('reports.pack.nothing'), '', '', '']],
  })

  const earning = [...data.equipment].filter(e => Number(e.revenue) || Number(e.profit)).sort((a, b) => Number(b.profit) - Number(a.profit))
  const items = [...earning.slice(0, 5), ...earning.slice(5).slice(-3)]
  sections.push({
    title: t('reports.pack.equipment'),
    head: [t('reports.pack.item'), t('reports.pack.row.revenue'), t('reports.pack.costs'), t('reports.pack.profit')],
    body: items.length
      ? items.map(e => [e.name, money(e.revenue), money(Number(e.revenue) - Number(e.profit)), money(e.profit)])
      : [[t('reports.pack.nothing'), '', '', '']],
  })
  return sections
}

export const packFileName = (orgName, month) =>
  `${String(orgName || 'AVX').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'AVX'} ${month}.pdf`

// Builds and downloads the PDF
export async function downloadPack({ orgId, orgName, month, t, lang, monthLabel }) {
  const data = await loadPack(orgId, month)
  const sections = packSections(data, { t, lang })
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const s = pdfSafe
  doc.setFont('helvetica', 'bold').setFontSize(16).text(s(t('reports.pack.pdfTitle', { month: monthLabel })), 14, 18)
  doc.setFont('helvetica', 'normal').setFontSize(10).text(s(orgName || ''), 14, 25)
  doc.setFontSize(8).setTextColor(110).text(s(t('reports.pack.pdfNote')), 14, 31, { maxWidth: 182 })
  doc.setTextColor(0)
  let y = 40
  for (const sec of sections) {
    doc.setFont('helvetica', 'bold').setFontSize(12).text(s(sec.title), 14, y)
    autoTable(doc, {
      startY: y + 3,
      head: [sec.head.map(s)],
      body: sec.body.map(r => r.map(s)),
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: [235, 237, 240], textColor: 20 },
      columnStyles: Object.fromEntries(sec.head.map((_, i) => [i, { halign: i ? 'right' : 'left' }])),
      margin: { left: 14, right: 14 },
    })
    y = doc.lastAutoTable.finalY + 10
    if (y > 260) { doc.addPage(); y = 18 }
  }
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8).setTextColor(130).text(`${i} / ${pages}`, 196, 290, { align: 'right' })
  }
  doc.save(packFileName(orgName, month))
  track('pdf:reports:pack')
}

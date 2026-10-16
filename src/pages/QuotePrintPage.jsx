import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import '@fontsource/inter/latin-300.css'
import '@fontsource/inter/latin-ext-300.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-ext-700.css'
import '@fontsource/inter/latin-800.css'
import '@fontsource/inter/latin-ext-800.css'
import '@fontsource/space-mono/latin-700.css'
import '@fontsource/space-mono/latin-ext-700.css'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useI18n, translate, fmtIn } from '../i18n'
import {
  normalizeBody, quoteTotals, lineTotal, sectionTotal, formatMoney, formatNumber, quoteNumber, groupTotals, termsBlocks,
} from '../lib/quotes'

// The quote as the client sees it, in the quote's own language (not the app's).
// Print → "Save as PDF" to send it. When printing, the organisation's header image
// and the contact line repeat on every page.
export default function QuotePrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [bannerRatio, setBannerRatio] = useState(72 / 595) // height / width, measured when the image loads

  useEffect(() => {
    async function load() {
      const { data: quote, error: qErr } = await supabase.from('quotes').select('*, organisations(*)').eq('id', id).maybeSingle()
      if (qErr || !quote) {
        if (qErr) logger.error('quotePrint', qErr, { quoteId: id })
        return setError(true)
      }
      const { data: branding } = await supabase.from('org_branding').select('header_image, brand_color').eq('org_id', quote.org_id).maybeSingle()
      setData({ ...quote, branding: branding || {} })
      document.title = `${quoteNumber(quote, quote.organisations?.quote_number_prefix ?? 'Q')} · ${quote.title}`
    }
    load()
    return () => { document.title = 'AVX' }
  }, [id])

  if (error) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>
      {t('quote.notFound')} <button onClick={() => navigate('/dashboard')} style={toolbarBtn}>{t('common.back')}</button>
    </div>
  )
  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={26} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  const q = data
  const org = q.organisations || {}
  const accent = q.branding.brand_color || '#1EC878'
  const L = q.language
  const tr = (key, vars) => translate(L, key, vars)
  const money = v => formatMoney(v, q.currency, L)
  const date = d => (d ? fmtIn(L, d, L === 'pt' ? 'dd-MM-yyyy' : 'd MMM yyyy') : '')
  const when = (d, time) => [date(d), time].filter(Boolean).join(' ')
  const body = normalizeBody(q.body)
  const totals = quoteTotals({ ...q, body })
  const prices = q.show_line_prices
  const visibleLines = s => s.lines.filter(l => l.description.trim() || l.details.trim() || lineTotal(l))
  const allLines = body.phases.flatMap(p => p.sections.flatMap(visibleLines))
  const showFactor = allLines.some(l => l.kind !== 'comment' && Number(l.factor) !== 1)
  const showDisc = prices && allLines.some(l => Number(l.discount_pct) > 0)
  const cols = 2 + (prices ? 2 + (showFactor ? 1 : 0) + (showDisc ? 1 : 0) : 0)
  const agenda = body.phases.filter(p => p.start_date || p.end_date)
  const pricedPhases = body.phases.filter(p => p.sections.some(sec => visibleLines(sec).length)).length
  const phaseDiscounts = totals.phases.filter(p => !p.optional).reduce((sum, p) => sum + p.discount, 0)
  const contact = [`${org.name} ${new Date(q.issue_date || Date.now()).getFullYear()}`, org.email, org.phone].filter(Boolean).join(' | ')
  const banner = q.branding.header_image
    ? <img src={q.branding.header_image} alt="" className="banner-img"
        onLoad={e => { const { naturalWidth: w, naturalHeight: h } = e.currentTarget; if (w && h) setBannerRatio(h / w) }} />
    : <div className="banner-fallback" style={{ background: accent }}>{org.legal_name || org.name}</div>
  const Heading = ({ children, extra }) => (
    <h2 className="qh"><span className="bar" style={{ background: accent }} />{children}{extra}</h2>
  )

  return (
    <div className="quote-page">
      <style>{QUOTE_PRINT_CSS}</style>
      {/* Space reserved on every printed page for the banner: its height on A4 plus a gap */}
      <style>{`@media print { .space-top { height: ${q.branding.header_image ? Math.min(120, 210 * bannerRatio + 9).toFixed(1) : 30}mm; } }`}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/quote/${id}`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('quote.backToEditor')}</button>
        <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>{t('quote.printHint')}</span>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#111', color: '#fff' }}><Printer size={14} /> {t('quote.print')}</button>
      </div>

      <div className="print-banner" aria-hidden="true">{banner}</div>
      <div className="print-foot" aria-hidden="true">{contact}</div>

      <article className="doc" lang={L}>
        <div className="screen-banner">{banner}</div>
        <table className="frame">
          <thead><tr><td><div className="space-top" /></td></tr></thead>
          <tfoot><tr><td><div className="space-bottom" /></td></tr></tfoot>
          <tbody><tr><td className="content">

            <section className="client">
              {(q.client_company || q.client_name) && <div className="client-name">{q.client_company || q.client_name}</div>}
              {q.client_company && q.client_name && <div>{tr('quoteDoc.attention', { name: q.client_name })}</div>}
              {q.client_address && <div className="pre">{q.client_address}</div>}
              {[q.client_tax_id && `${tr('quoteDoc.taxId')}: ${q.client_tax_id}`, q.client_email].filter(Boolean).join(' · ')}
            </section>

            <h1 className="title">{q.title}</h1>

            <table className="meta">
              <tbody>
                <tr><th>{tr('quoteDoc.projectNumber')}</th><td>{quoteNumber(q, org.quote_number_prefix ?? 'Q')}</td></tr>
                {q.manager_name && <tr><th>{tr('quoteDoc.manager')}</th><td>{q.manager_name}</td></tr>}
                <tr><th>{tr('quoteDoc.date')}</th><td>{date(q.issue_date)}</td></tr>
                {q.valid_until && <tr><th>{tr('quoteDoc.validUntil')}</th><td>{date(q.valid_until)}</td></tr>}
                {q.payment_terms && <tr><th>{tr('quoteDoc.payment')}</th><td>{q.payment_terms}</td></tr>}
              </tbody>
            </table>
            {q.intro && <p className="pre intro">{q.intro}</p>}

            {agenda.length > 0 && (
              <section className="block">
                <Heading>{tr('quoteDoc.agenda')}</Heading>
                <table className="agenda">
                  <tbody>
                    {agenda.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{when(p.start_date, p.start_time)}</td>
                        <td>{when(p.end_date || p.start_date, p.end_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {body.phases.map((phase, pi) => {
              const pt = totals.phases[pi]
              const sections = phase.sections.filter(s => visibleLines(s).length)
              if (!sections.length) return null
              return (
                <section key={phase.id} className="block">
                  <Heading extra={phase.optional && <span className="opt">{tr('quoteDoc.option')}</span>}>
                    {phase.name || tr('quoteDoc.phaseN', { n: pi + 1 })}
                  </Heading>
                  {sections.map(section => (
                    <div key={section.id} className="sec">
                      {section.name && <h3>{section.name}</h3>}
                      <table className="lines">
                        <colgroup>
                          <col className="c-qty" />
                          <col />
                          {prices && <col className="c-num" />}
                          {prices && showFactor && <col className="c-small" />}
                          {showDisc && <col className="c-small" />}
                          {prices && <col className="c-num" />}
                        </colgroup>
                        <thead>
                          <tr>
                            <th className="qty">{tr('quoteDoc.qty')}</th>
                            <th>{tr('quoteDoc.description')}</th>
                            {prices && <th className="num">{tr('quoteDoc.unitPrice')}</th>}
                            {prices && showFactor && <th className="num">{tr('quoteDoc.factor')}</th>}
                            {showDisc && <th className="num">{tr('quoteDoc.discount')}</th>}
                            {prices && <th className="num">{tr('quoteDoc.total')}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleLines(section).map(line => line.kind === 'comment' ? (
                            <tr key={line.id} className="comment"><td /><td colSpan={cols - 1}>{line.description}{line.details && <div className="details pre">{line.details}</div>}</td></tr>
                          ) : (
                            <tr key={line.id}>
                              <td className="qty">{formatNumber(line.qty, L)}{line.unit !== 'unit' && ` ${tr(`unit.${line.unit}`, { count: Number(line.qty) })}`}</td>
                              <td>{line.description}{line.details && <div className="details pre">{line.details}</div>}</td>
                              {prices && <td className="num">{money(line.unit_price)}</td>}
                              {prices && showFactor && <td className="num">{formatNumber(line.factor, L)}</td>}
                              {showDisc && <td className="num">{Number(line.discount_pct) ? `${formatNumber(line.discount_pct, L)}%` : ''}</td>}
                              {prices && <td className="num">{money(lineTotal(line))}</td>}
                            </tr>
                          ))}
                          <tr className="sec-total">
                            <td />
                            <td colSpan={cols - 2}>{tr('quoteDoc.totalOf', { name: section.name || tr('quoteDoc.section') })}</td>
                            <td className="num">{money(sectionTotal(section))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {(pt.discount > 0 || pricedPhases > 1) && (
                    <div className="phase-total">
                      {pt.discount > 0 && <span>{tr('quoteDoc.discountPct', { pct: formatNumber(phase.discount_pct, L) })} −{money(pt.discount)} · </span>}
                      <strong>{phase.optional ? tr('quoteDoc.optionTotal') : tr('quoteDoc.totalOf', { name: phase.name || tr('quoteDoc.phaseN', { n: pi + 1 }) })} {money(pt.net)}</strong>
                    </div>
                  )}
                </section>
              )
            })}

            <section className="block totals">
              <Heading>{tr('quoteDoc.totalTitle')}</Heading>
              <table>
                <tbody>
                  {groupTotals(totals.byKind).filter(g => g.amount).map(g => (
                    <tr key={g.key}><th>{tr(`quoteDoc.group.${g.key}`)}</th><td>{money(g.amount)}</td></tr>
                  ))}
                  {phaseDiscounts > 0 && <tr><th>{tr('quoteDoc.phaseDiscounts')}</th><td>−{money(phaseDiscounts)}</td></tr>}
                  {totals.discount > 0 && <tr><th>{tr('quoteDoc.finalDiscount', { pct: formatNumber(q.discount_pct, L) })}</th><td>−{money(totals.discount)}</td></tr>}
                  <tr className="strong"><th>{tr('quoteDoc.totalExVat')}</th><td>{money(totals.net)}</td></tr>
                  <tr><th>{tr('quoteDoc.vat', { pct: formatNumber(q.vat_rate, L) })}</th><td>{money(totals.vat)}</td></tr>
                  <tr className="strong"><th>{tr('quoteDoc.totalIncVat')}</th><td>{money(totals.total)}</td></tr>
                </tbody>
              </table>
              {totals.optional > 0 && <p className="options-note">{tr('quoteDoc.optionsNote', { amount: money(totals.optional) })}</p>}
            </section>

            {q.terms && (
              <section className="terms">
                <h2 className="terms-title">{tr('quoteDoc.terms')}</h2>
                {termsBlocks(q.terms).map((b, i) => b.type === 'h'
                  ? <h4 key={i}>{b.text}</h4>
                  : <p key={i} className="pre">{b.text}</p>)}
              </section>
            )}
          </td></tr></tbody>
        </table>
        <div className="screen-foot">{contact}</div>
      </article>
    </div>
  )
}

const toolbarBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
  border: '1px solid #ccc', background: '#fff', color: '#111', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
}

const QUOTE_PRINT_CSS = `
  .quote-page { min-height: 100vh; background: #e9edf1; padding: 16px; }
  .toolbar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .doc { max-width: 210mm; margin: 0 auto; background: #fff; color: #1a1a1a; border-radius: 6px; overflow: hidden;
    font-family: 'Inter', 'DM Sans', sans-serif; font-weight: 300; font-size: 10.5pt; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .doc .pre { white-space: pre-line; }
  .banner-img { display: block; width: 100%; height: auto; }
  .banner-fallback { color: #fff; font-weight: 800; font-size: 14pt; padding: 8mm 18mm; }
  .print-banner, .print-foot { display: none; }
  .frame { width: 100%; border-collapse: collapse; }
  .frame > thead td, .frame > tfoot td { padding: 0; }
  .content { padding: 10mm 18mm 8mm; vertical-align: top; }
  .client { margin-bottom: 8mm; }
  .client-name { font-weight: 700; font-size: 11pt; }
  .title { font-family: 'Space Mono', monospace; font-weight: 700; font-size: 17pt; line-height: 1.25; margin: 0 0 6mm; }
  .meta { border-collapse: collapse; margin-bottom: 4mm; }
  .meta th { text-align: left; font-weight: 300; padding: 1px 12mm 1px 0; white-space: nowrap; vertical-align: top; }
  .meta td { padding: 1px 0; }
  .intro { margin: 4mm 0 0; }
  .block { margin-top: 9mm; }
  .qh { font-size: 11pt; font-weight: 700; margin: 0 0 4mm; display: flex; align-items: baseline; gap: 8px; position: relative; padding-top: 6px; break-after: avoid; }
  .qh .bar { position: absolute; top: 0; left: 0; width: 15mm; height: 2px; }
  .qh .opt { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; background: #fdf0d5; color: #8a5a00; padding: 1px 6px; border-radius: 4px; }
  .sec { margin-bottom: 6mm; }
  .sec h3 { font-size: 10.5pt; font-weight: 700; margin: 0 0 2mm; break-after: avoid; }
  .lines { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .lines .c-qty { width: 17mm; } .lines .c-num { width: 24mm; } .lines .c-small { width: 15mm; }
  .sec { break-inside: avoid-page; }
  .lines th { font-weight: 300; text-align: left; padding: 0 6px 2px 0; }
  .lines td { padding: 1px 6px 1px 0; vertical-align: top; }
  .lines .qty { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lines .num { text-align: right; white-space: nowrap; }
  .lines .comment td { font-style: italic; color: #555; }
  .lines .details { font-size: 8.5pt; color: #666; }
  .lines tr { break-inside: avoid; }
  .lines .sec-total td { padding-top: 2px; }
  .agenda { border-collapse: collapse; width: 100%; }
  .agenda td { padding: 1px 6px 1px 0; width: 33%; }
  .phase-total { text-align: right; font-size: 10pt; }
  .phase-total strong { font-weight: 700; }
  .totals table { width: 100%; border-collapse: collapse; break-inside: avoid; }
  .totals th { text-align: left; font-weight: 300; padding: 1px 0; }
  .totals td { text-align: right; padding: 1px 0; white-space: nowrap; }
  .totals .strong th, .totals .strong td { font-weight: 800; font-size: 11pt; }
  .options-note { font-size: 9pt; color: #555; margin-top: 3mm; }
  .terms { margin-top: 12mm; }
  .terms-title { font-size: 11pt; font-weight: 700; margin: 0 0 5mm; break-after: avoid; }
  .terms h4 { font-size: 10pt; font-weight: 700; margin: 4mm 0 2mm; break-after: avoid; }
  .terms p { margin: 0 0 2mm; }
  .screen-foot { padding: 6mm 18mm; font-size: 8.5pt; color: #666; border-top: 1px solid #eee; }
  @media (max-width: 600px) { .content { padding: 6mm 5mm; } .meta th { padding-right: 4mm; } .lines { table-layout: auto; } }
  @media print {
    @page { size: A4; margin: 0; }
    html, body, #root, .quote-page { background: #fff !important; padding: 0 !important; margin: 0 !important; }
    .toolbar, .screen-banner, .screen-foot { display: none !important; }
    .doc { max-width: none; border-radius: 0; overflow: visible; }
    /* Fixed elements repeat on every printed page; the table head/foot reserve their space */
    .print-banner { display: block; position: fixed; top: 0; left: 0; right: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-foot { display: block; position: fixed; bottom: 7mm; left: 18mm; right: 18mm; font-family: 'Inter', sans-serif; font-weight: 300; font-size: 8.5pt; color: #666; }
    .space-bottom { height: 18mm; }
    .content { padding-top: 0; padding-bottom: 0; }
  }
`

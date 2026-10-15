import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { useI18n, translate, fmtIn } from '../i18n'
import { normalizeBody, quoteTotals, lineTotal, sectionTotal, formatMoney, formatNumber, quoteNumber } from '../lib/quotes'

// The quote as the client sees it, in the quote's own language (not the app's).
// Print → "Save as PDF" to send it.
export default function QuotePrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: quote, error: qErr } = await supabase.from('quotes').select('*, organisations(*)').eq('id', id).maybeSingle()
      if (qErr || !quote) {
        if (qErr) logger.error('quotePrint', qErr, { quoteId: id })
        return setError(true)
      }
      setData(quote)
      document.title = `${quoteNumber(quote)} · ${quote.title}`
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
  const L = q.language
  const tr = (key, vars) => translate(L, key, vars)
  const money = v => formatMoney(v, q.currency, L)
  const date = d => (d ? fmtIn(L, d, 'd MMM yyyy') : '')
  const body = normalizeBody(q.body)
  const totals = quoteTotals({ ...q, body })
  const prices = q.show_line_prices
  const showFactor = body.phases.some(p => p.sections.some(s => s.lines.some(l => l.kind !== 'comment' && Number(l.factor) !== 1)))
  const showDisc = prices && body.phases.some(p => p.sections.some(s => s.lines.some(l => Number(l.discount_pct) > 0)))
  const cols = 2 + (showFactor ? 1 : 0) + (prices ? 2 + (showDisc ? 1 : 0) : 0)

  return (
    <div className="quote-page">
      <style>{QUOTE_PRINT_CSS}</style>
      <div className="toolbar">
        <button onClick={() => navigate(`/quote/${id}`)} style={toolbarBtn}><ArrowLeft size={14} /> {t('quote.backToEditor')}</button>
        <span style={{ flex: 1, fontSize: '13px', color: '#555' }}>{t('quote.printHint')}</span>
        <button onClick={() => window.print()} style={{ ...toolbarBtn, background: '#111', color: '#fff' }}><Printer size={14} /> {t('quote.print')}</button>
      </div>

      <article className="doc" lang={L}>
        <header className="doc-head">
          <div>
            <div className="org-name">{org.legal_name || org.name}</div>
            {org.address && <div className="pre">{org.address}</div>}
            {org.tax_id && <div>{tr('quoteDoc.taxId')}: {org.tax_id}</div>}
            <div>{[org.email, org.phone, org.website].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="doc-meta">
            <div className="doc-kind">{tr('quoteDoc.quote')}</div>
            <table>
              <tbody>
                <tr><th>{tr('quoteDoc.number')}</th><td>{quoteNumber(q)}</td></tr>
                <tr><th>{tr('quoteDoc.date')}</th><td>{date(q.issue_date)}</td></tr>
                {q.valid_until && <tr><th>{tr('quoteDoc.validUntil')}</th><td>{date(q.valid_until)}</td></tr>}
              </tbody>
            </table>
          </div>
        </header>

        {(q.client_company || q.client_name || q.client_address) && (
          <section className="client">
            <div className="label">{tr('quoteDoc.to')}</div>
            {q.client_company && <div className="strong">{q.client_company}</div>}
            {q.client_name && <div>{q.client_company ? tr('quoteDoc.attention', { name: q.client_name }) : q.client_name}</div>}
            {q.client_address && <div className="pre">{q.client_address}</div>}
            {q.client_tax_id && <div>{tr('quoteDoc.taxId')}: {q.client_tax_id}</div>}
            {q.client_email && <div>{q.client_email}</div>}
          </section>
        )}

        <h1>{q.title}</h1>
        {q.intro && <p className="pre intro">{q.intro}</p>}

        {body.phases.map((phase, pi) => {
          const pt = totals.phases[pi]
          const range = [phase.start_date, phase.end_date].filter(Boolean)
          return (
            <section key={phase.id} className="phase">
              <h2>
                {phase.name || tr('quoteDoc.phaseN', { n: pi + 1 })}
                {phase.optional && <span className="opt">{tr('quoteDoc.option')}</span>}
                {range.length > 0 && <span className="dates">{range.map(date).join(' – ')}</span>}
              </h2>
              <table className="lines">
                <thead>
                  <tr>
                    <th className="desc">{tr('quoteDoc.description')}</th>
                    <th className="num">{tr('quoteDoc.qty')}</th>
                    {showFactor && <th className="num">{tr('quoteDoc.factor')}</th>}
                    {prices && <th className="num">{tr('quoteDoc.unitPrice')}</th>}
                    {showDisc && <th className="num">{tr('quoteDoc.discount')}</th>}
                    {prices && <th className="num">{tr('quoteDoc.total')}</th>}
                  </tr>
                </thead>
                {phase.sections.map(section => (
                  <tbody key={section.id}>
                    {section.name && (
                      <tr className="section-row">
                        <td colSpan={prices ? cols : cols - 1}>{section.name}</td>
                        {!prices && <td className="num">{money(sectionTotal(section))}</td>}
                      </tr>
                    )}
                    {section.lines.filter(line => line.description.trim() || line.details.trim() || lineTotal(line)).map(line => line.kind === 'comment' ? (
                      <tr key={line.id} className="comment"><td colSpan={cols}>{line.description}{line.details && <div className="details pre">{line.details}</div>}</td></tr>
                    ) : (
                      <tr key={line.id}>
                        <td className="desc">{line.description}{line.details && <div className="details pre">{line.details}</div>}</td>
                        <td className="num">{formatNumber(line.qty, L)} {tr(`unit.${line.unit}`, { count: Number(line.qty) })}</td>
                        {showFactor && <td className="num">× {formatNumber(line.factor, L)}</td>}
                        {prices && <td className="num">{money(line.unit_price)}</td>}
                        {showDisc && <td className="num">{Number(line.discount_pct) ? `${formatNumber(line.discount_pct, L)}%` : ''}</td>}
                        {prices && <td className="num">{money(lineTotal(line))}</td>}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
              <div className="phase-total">
                {pt.discount > 0 && <span>{tr('quoteDoc.subtotal')} {money(pt.gross)} · {tr('quoteDoc.discountPct', { pct: formatNumber(phase.discount_pct, L) })} −{money(pt.discount)} · </span>}
                <strong>{phase.optional ? tr('quoteDoc.optionTotal') : tr('quoteDoc.phaseTotal')} {money(pt.net)}</strong>
              </div>
            </section>
          )
        })}

        <section className="totals">
          <table>
            <tbody>
              <tr><th>{tr('quoteDoc.subtotal')}</th><td>{money(totals.subtotal)}</td></tr>
              {totals.discount > 0 && <tr><th>{tr('quoteDoc.discountPct', { pct: formatNumber(q.discount_pct, L) })}</th><td>−{money(totals.discount)}</td></tr>}
              <tr><th>{tr('quoteDoc.totalExVat')}</th><td>{money(totals.net)}</td></tr>
              <tr><th>{tr('quoteDoc.vat', { pct: formatNumber(q.vat_rate, L) })}</th><td>{money(totals.vat)}</td></tr>
              <tr className="grand"><th>{tr('quoteDoc.totalIncVat')}</th><td>{money(totals.total)}</td></tr>
            </tbody>
          </table>
          {totals.optional > 0 && <p className="options-note">{tr('quoteDoc.optionsNote', { amount: money(totals.optional) })}</p>}
        </section>

        {q.terms && (
          <section className="terms">
            <div className="label">{tr('quoteDoc.terms')}</div>
            <p className="pre">{q.terms}</p>
          </section>
        )}
        <footer className="doc-foot">{org.legal_name || org.name} · {quoteNumber(q)} · {date(q.issue_date)}</footer>
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
  .toolbar { max-width: 820px; margin: 0 auto 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .doc { max-width: 820px; margin: 0 auto; background: #fff; color: #111; border-radius: 8px; padding: 40px; font-size: 13px; line-height: 1.45; }
  .doc .pre { white-space: pre-line; }
  .doc-head { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding-bottom: 18px; border-bottom: 2px solid #111; color: #444; }
  .org-name { font-size: 18px; font-weight: 800; color: #111; margin-bottom: 4px; }
  .doc-meta { text-align: right; }
  .doc-kind { font-size: 22px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #111; margin-bottom: 6px; }
  .doc-meta th { text-align: right; font-weight: 600; color: #666; padding: 1px 10px 1px 0; }
  .doc-meta td { text-align: right; font-weight: 600; }
  .client { margin: 22px 0 6px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #777; margin-bottom: 4px; }
  .strong { font-weight: 700; }
  .doc h1 { font-size: 22px; margin: 22px 0 6px; }
  .intro { color: #333; margin-bottom: 8px; }
  .phase { margin-top: 22px; break-inside: auto; }
  .phase h2 { font-size: 15px; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; border-bottom: 1px solid #111; padding-bottom: 4px; margin-bottom: 4px; }
  .phase h2 .dates { font-size: 12px; font-weight: 500; color: #666; margin-left: auto; }
  .phase h2 .opt { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; background: #fdf0d5; color: #8a5a00; padding: 2px 6px; border-radius: 4px; }
  .lines { width: 100%; border-collapse: collapse; }
  .lines th { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #777; text-align: left; padding: 6px 6px 4px; border-bottom: 1px solid #ddd; }
  .lines td { padding: 5px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .lines .num { text-align: right; white-space: nowrap; }
  .lines .section-row td { font-weight: 700; padding-top: 10px; border-bottom: 1px solid #ddd; }
  .lines .comment td { font-style: italic; color: #555; }
  .lines .details { font-size: 11px; color: #666; margin-top: 2px; }
  .lines tr { break-inside: avoid; }
  .phase-total { text-align: right; padding: 6px; font-size: 12px; color: #444; }
  .phase-total strong { color: #111; font-size: 13px; }
  .totals { margin-top: 26px; display: flex; flex-direction: column; align-items: flex-end; break-inside: avoid; }
  .totals table { min-width: 300px; border-collapse: collapse; }
  .totals th { text-align: left; font-weight: 500; color: #444; padding: 4px 18px 4px 0; }
  .totals td { text-align: right; padding: 4px 0; white-space: nowrap; }
  .totals .grand th, .totals .grand td { font-size: 16px; font-weight: 800; color: #111; border-top: 2px solid #111; padding-top: 8px; }
  .options-note { font-size: 12px; color: #666; margin-top: 6px; }
  .terms { margin-top: 28px; font-size: 12px; color: #333; break-inside: avoid; }
  .doc-foot { margin-top: 30px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 10px; color: #888; text-align: center; }
  @media (max-width: 600px) { .doc { padding: 20px; font-size: 12px; } .doc-meta { text-align: left; } .doc-meta th, .doc-meta td { text-align: left; } }
  @media print {
    @page { margin: 14mm; }
    body, .quote-page { background: #fff !important; padding: 0 !important; }
    .toolbar { display: none !important; }
    .doc { max-width: none; border-radius: 0; padding: 0; }
  }
`

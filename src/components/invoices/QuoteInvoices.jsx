import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FileCheck } from 'lucide-react'
import { logger } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { btn, colors } from '../ui'
import { Hint } from '../help/HelpParts'
import { formatMoney, quoteTotals, round2 } from '../../lib/quotes'
import { loadInvoices } from '../../lib/invoiceApi'
import InvoiceModal, { InvoiceBadge, invoiceTitle } from './InvoiceModal'

// A quote's invoices (step 11), in its Summary tab: what is invoiced and what is left, each invoice
// with its state, and "New invoice" once the quote is accepted. Admins and members only (like quotes).
export default function QuoteInvoices({ quote, body, prefix, clients = [], dueDays = 30 }) {
  const { t, lang } = useI18n()
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null)
  const load = useCallback(() => {
    loadInvoices(quote.org_id, { quoteId: quote.id }).then(setList).catch(error => { logger.error('invoices', error, { step: 'quote' }); setList([]) })
  }, [quote.org_id, quote.id])
  useEffect(() => { load() }, [load])
  if (!list || (quote.status !== 'accepted' && !list.length)) return null

  const full = { ...quote, body, prefix }
  const quoteNet = quoteTotals(full).net
  const invoices = list.filter(i => i.kind === 'invoice')
  const credits = list.filter(i => i.kind === 'credit_note')
  const issued = i => ['issued', 'paid'].includes(i.status)
  const creditedNet = round2(credits.filter(issued).reduce((s, c) => s + Number(c.net), 0))
  const invoicedNet = round2(invoices.filter(issued).reduce((s, i) => s + Number(i.net), 0) - creditedNet)
  const left = round2(quoteNet - invoicedNet)
  const money = v => formatMoney(v, quote.currency || 'EUR', lang)
  const client = clients.find(c => c.id === quote.client_id) || null

  return (
    <section aria-labelledby="qi-title" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px', marginTop: '12px' }}>
      <h3 id="qi-title" style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <FileCheck size={15} aria-hidden="true" /> {t('invoice.onQuote')} <Hint id="quote-invoiced" label={t('invoice.onQuote')} />
      </h3>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', fontSize: '14px', margin: 0 }}>
        <dt style={{ color: colors.muted }}>{t('invoice.invoicedExVat')}</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 700 }}>{money(invoicedNet)}</dd>
        <dt style={{ color: colors.muted }}>{t('invoice.leftExVat')}</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(Math.max(0, left))}</dd>
      </dl>
      {list.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {list.map(i => (
            <li key={i.id} style={{ borderTop: `1px solid ${colors.border}` }}>
              <button type="button" onClick={() => setOpen({ invoice: i })} style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 2px', minHeight: '44px', fontSize: '13px' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>{invoiceTitle(i, t)} <InvoiceBadge invoice={i} credits={credits} /></span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{i.kind === 'credit_note' ? '−' : ''}{money(i.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
        {quote.status === 'accepted' && <button type="button" onClick={() => setOpen({ quote: full })} style={btn}><Plus size={14} /> {t('invoice.new')}</button>}
        <Link to={`/org/${quote.org_id}/invoices`} style={{ ...btn, textDecoration: 'none' }}>{t('invoice.allInvoices')}</Link>
      </div>
      {open && (
        <InvoiceModal key={open.invoice?.id || open.creditOf?.id || 'new'} orgId={quote.org_id} invoice={open.invoice || null} quote={open.quote || null}
          client={client} creditOf={open.creditOf || null} dueDays={dueDays}
          siblings={open.creditOf ? list.filter(i => i.credited_invoice_id === open.creditOf.id) : list}
          onClose={() => setOpen(null)} onSaved={load} onCredit={inv => setOpen({ creditOf: inv })} />
      )}
    </section>
  )
}

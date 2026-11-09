import { useEffect, useState } from 'react'
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { useI18n } from '../../i18n'
import { btn, colors, AvxLoader, space } from '../ui'
import { rowList, row, rowName, rowMeta } from '../ListParts'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { quoteNumber, formatMoney } from '../../lib/quotes'
import { QuoteStatusBadge } from './parts'

// Quotes → Recently deleted (quote bin, issue 124): deleted quotes wait here for 15 days, then the
// database erases them. Only the quotes the reader may restore are listed (removed_quotes).
export default function QuoteBin({ org, onBack, onRestored }) {
  const { t, fmt, lang } = useI18n()
  const { notify } = useToast()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  const prefix = org.quote_number_prefix ?? 'Q'

  useEffect(() => {
    let live = true
    supabase.rpc('removed_quotes', { p_org: org.id }).then(({ data, error }) => {
      if (!live) return
      if (error) {
        logger.error('quotes', error, { step: 'bin' })
        notify(userMessage(error), 'error')
      }
      setRows(data || [])
    })
    return () => { live = false }
  }, [org.id, notify])

  async function restore(q) {
    setBusy(q.id)
    const { error } = await supabase.rpc('restore_quote', { p_quote: q.id })
    setBusy(null)
    if (error) return notify(userMessage(error), 'error')
    setRows(list => list.filter(x => x.id !== q.id))
    notify(t('quotes.bin.restored'), 'success')
    onRestored?.()
  }

  return (
    <div>
      <button type="button" onClick={onBack} style={{ ...btn, marginBottom: space[4] }}><ArrowLeft size={16} aria-hidden="true" /> {t('quotes.bin.back')}</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[4] }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontFamily: 'var(--font-mono)', minWidth: 0, overflowWrap: 'anywhere' }}>{t('quotes.bin.title')}</h2>
        <Hint id="quote-bin" />
      </div>
      {rows === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: space[7] }}><AvxLoader size={22} color={colors.accentText} /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Trash2 size={28} />} title={t('quotes.bin.emptyTitle')} body={t('quotes.bin.emptyBody')} />
      ) : (
        <ul style={rowList} aria-label={t('quotes.bin.title')}>
          {rows.map(q => {
            const name = `${quoteNumber(q, prefix)} ${q.title}`
            return (
              <li key={q.id} style={{ ...row, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: colors.soft }}>{quoteNumber(q, prefix)}</span>
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <span style={rowName}>{q.title}</span>
                  <span style={rowMeta}>
                    {[q.client_company || q.client_name, formatMoney(q.total_net, q.currency, lang)].filter(Boolean).join(' · ')}
                  </span>
                  <span style={rowMeta}>{t('quotes.bin.erasesOn', { date: fmt(q.erase_at, 'd MMM yyyy') })}</span>
                </span>
                <QuoteStatusBadge status={q.status} />
                <button type="button" onClick={() => restore(q)} disabled={busy === q.id} style={btn}
                  aria-label={t('quotes.bin.restoreNamed', { name })}>
                  {busy === q.id ? <AvxLoader size={16} /> : <RotateCcw size={16} aria-hidden="true" />} {t('quotes.bin.restore')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

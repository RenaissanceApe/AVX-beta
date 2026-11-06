// Shared pieces of expenses (step 9b): the receipt link, status chip, one row of a list, the totals
// line and the approve / send back buttons for a claim.
import { useEffect, useState } from 'react'
import { Paperclip, Check, Undo2, Link2 } from 'lucide-react'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { formatMoney } from '../../lib/quotes'
import { receiptUrl, decideClaim, isOverdue, toReimburse, linkOf, categoryName, totalsByCurrency } from '../../lib/expenses'
import { useI18n, fmt } from '../../i18n'
import { Modal, btn, btnPrimary, input, colors, StatusBadge, AvxLoader } from '../ui'

export function ReceiptLink({ path, name }) {
  const { t } = useI18n()
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    receiptUrl(path).then(u => { if (live) setUrl(u) })
    return () => { live = false }
  }, [path])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--sky)', fontSize: '12px' }}>
      <Paperclip size={12} /> {t('expenses.receiptOpen', { name: (name || '').slice(0, 24) })}
    </a>
  )
}

const CHIP = { draft: 'draft', claimed: 'open', returned: 'danger', overdue: 'danger', unpaid: 'open', reimburse: 'info', paid: 'ok' }
export function ExpenseChip({ e, today }) {
  const { t } = useI18n()
  const state = e.status === 'draft' ? 'draft' : e.status === 'claimed' ? 'claimed' : e.status === 'returned' ? 'returned'
    : toReimburse(e) ? 'reimburse' : isOverdue(e, today) ? 'overdue' : e.paid_on ? 'paid' : 'unpaid'
  return <StatusBadge small tone={CHIP[state]}>{t(`expenses.state.${state}`)}</StatusBadge>
}

// "€123,00" per currency, never added across currencies
export function Totals({ list, lang, what = 'total' }) {
  const totals = totalsByCurrency(list)
  const keys = Object.keys(totals)
  if (!keys.length) return <span>{formatMoney(0, 'EUR', lang)}</span>
  return <span>{keys.map(c => formatMoney(totals[c][what], c, lang)).join(' · ')}</span>
}

// One expense in a list: date, supplier and description, category, amount; details on demand
export function ExpenseRow({ e, categories, names = {}, today, details, onOpen, children }) {
  const { t, lang } = useI18n()
  const cat = categories.find(c => c.id === e.category_id)
  const link = linkOf(e)
  const who = e.supplier?.name || e.supplier_name
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '50px minmax(0, 1fr) auto', gap: '2px 10px', alignItems: 'start', padding: '9px 0', borderTop: `1px solid ${colors.border}`, fontSize: '14px' }}>
      <span style={{ color: colors.muted, fontSize: '13px', paddingTop: '1px' }}>{fmt(e.spent_on, 'd MMM')}</span>
      <button type="button" onClick={onOpen} disabled={!onOpen} style={{ minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, color: 'var(--text)', cursor: onOpen ? 'pointer' : 'default', font: 'inherit' }}>
        <span style={{ fontWeight: 600, display: 'block', overflowWrap: 'anywhere' }}>{who ? `${who} · ` : ''}{e.description}</span>
        <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>
          {categoryName(cat, t)}
          {e.claimed_by && ` · ${t('expenses.claimBy', { name: names[e.claimed_by] || t('common.someone') })}`}
          {details && e.gig?.name && ` · ${e.gig.name}`}
        </span>
      </button>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', textAlign: 'right' }}>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMoney(Number(e.amount_net) + Number(e.vat_amount), e.currency, lang)}</span>
        <ExpenseChip e={e} today={today} />
      </span>
      {details && (
        <span style={{ gridColumn: '2 / -1', display: 'flex', gap: '2px 12px', flexWrap: 'wrap', fontSize: '12px', color: colors.muted }}>
          <span>{t('expenses.netVat', { net: formatMoney(e.amount_net, e.currency, lang), vat: formatMoney(e.vat_amount, e.currency, lang) })}</span>
          {e.invoice_number && <span>{t('expenses.invoiceShort', { number: e.invoice_number })}</span>}
          {e.due_on && <span>{t('expenses.dueShort', { date: fmt(e.due_on, 'd MMM') })}</span>}
          {e.paid_on && <span>{t('expenses.paidShort', { date: fmt(e.paid_on, 'd MMM'), how: e.paid_how ? t(`expenses.paidHow.${e.paid_how}`) : '' })}</span>}
          {link && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Link2 size={11} /> {t(`expenses.link.${link.kind}`)}</span>}
          {e.receipt_path && <ReceiptLink path={e.receipt_path} name={e.receipt_name} />}
        </span>
      )}
      {children && <span style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{children}</span>}
    </li>
  )
}

// Approve a claim, or send it back with a note
export function ClaimActions({ e, onDone }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  async function decide(approve) {
    setBusy(true)
    try {
      await decideClaim(e.id, approve, approve ? null : note)
      notify(approve ? t('expenses.approved') : t('expenses.sentBack'), 'success')
      setAsking(false)
      onDone?.()
    } catch (error) {
      logger.error('expenses', error, { step: 'decide' })
      notify(error?.code === '42501' && /own/.test(error.message || '') ? t('expenses.notOwn') : userMessage(error), 'error')
    }
    setBusy(false)
  }
  return (
    <span style={{ display: 'flex', gap: '6px', flex: '1 1 100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <button type="button" disabled={busy} onClick={() => setAsking(true)} style={btn}><Undo2 size={14} /> {t('expenses.sendBack')}</button>
      <button type="button" disabled={busy} onClick={() => decide(true)} style={{ ...btnPrimary, padding: '8px 14px', fontSize: '13px' }}>
        {busy ? <AvxLoader size={14} /> : <Check size={14} />} {t('expenses.approve')}
      </button>
      {asking && (
        <Modal title={t('expenses.sendBackTitle')} onClose={() => setAsking(false)}>
          <form onSubmit={ev => { ev.preventDefault(); if (note.trim()) decide(false) }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <textarea value={note} onChange={ev => setNote(ev.target.value)} maxLength={500} rows={3} required aria-label={t('expenses.sendBackNote')}
              placeholder={t('expenses.sendBackNote')} style={{ ...input, resize: 'vertical' }} />
            <button type="submit" disabled={busy || !note.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}><Undo2 size={14} /> {t('expenses.sendBack')}</button>
          </form>
        </Modal>
      )}
    </span>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { useI18n, fmt } from '../../i18n'
import { btn, btnPrimary, input, label, colors, iconBtn } from '../ui'
import { HintLabel } from '../help/HelpParts'
import { formatMoney, localISODate } from '../../lib/quotes'
import { PAYMENT_METHODS, invoiceDue, paidSoFar, leftToPay, paymentProblem } from '../../lib/payments'
import { loadPayments, recordPayment, removePayment } from '../../lib/invoiceApi'

const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0 }

// Payments of an issued invoice (step 12): what it asks for (less issued credit notes), what came in
// and what is left; record a payment (date, amount, method, note) or remove one. The database turns
// the invoice paid when its payments cover it, and back to issued when one is removed; onChanged
// gets the invoice as it now is.
export default function InvoicePayments({ orgId, invoice, onChanged }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const today = localISODate()
  const [payments, setPayments] = useState(null)
  const [credits, setCredits] = useState([])
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState({ paid_on: today, amount: '', method: 'transfer', note: '' })
  const money = v => formatMoney(v, invoice.currency || 'EUR', lang)

  const load = useCallback(async () => {
    try {
      const [ps, { data: cs, error }] = await Promise.all([
        loadPayments(orgId, [invoice.id]),
        supabase.from('invoices').select('id, kind, total, status, credited_invoice_id, removed_at').eq('credited_invoice_id', invoice.id),
      ])
      if (error) throw error
      setPayments(ps)
      setCredits(cs || [])
    } catch (error) {
      logger.error('payments', error, { step: 'load' })
      setPayments([])
    }
  }, [orgId, invoice.id])
  useEffect(() => { load() }, [load, invoice.status])

  const due = invoiceDue(invoice, credits)
  const paid = paidSoFar(payments || [])
  const left = leftToPay(invoice, { credits, payments: payments || [] })
  // The amount starts at what is left ("Mark as paid" is a payment of the rest)
  useEffect(() => { if (payments) setForm(f => ({ ...f, amount: left ? String(left) : '' })) }, [payments, left])
  const problem = paymentProblem(form, left, today)

  async function reload() {
    await load()
    const { data } = await supabase.from('invoices').select('*').eq('id', invoice.id).single()
    if (data) onChanged?.(data)
  }
  async function submit(e) {
    e.preventDefault()
    if (problem) return
    setBusy('add')
    try {
      await recordPayment(orgId, invoice.id, { ...form, amount: Math.round(num(form.amount) * 100) / 100, note: form.note.trim() })
      notify(t('payment.recorded', { amount: money(num(form.amount)) }), 'success')
      setForm(f => ({ ...f, note: '' }))
      await reload()
    } catch (error) {
      logger.error('payments', error, { step: 'record' })
      notify(userMessage(error), 'error')
    } finally { setBusy('') }
  }
  async function remove(p) {
    if (!window.confirm(t('payment.removeConfirm', { amount: money(p.amount), date: fmt(p.paid_on, 'd MMM yyyy') }))) return
    setBusy(p.id)
    try {
      await removePayment(p.id)
      await reload()
    } catch (error) {
      logger.error('payments', error, { step: 'remove' })
      notify(userMessage(error), 'error')
    } finally { setBusy('') }
  }

  if (!payments) return <Loader2 size={18} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} aria-label={t('common.loading')} />

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  return (
    <section aria-labelledby={`pay-${invoice.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <h3 id={`pay-${invoice.id}`} style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>{t('payment.title')}</h3>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', fontSize: '13px', margin: 0 }}>
        {due !== Number(invoice.total) && <Row term={t('payment.due')} value={money(due)} />}
        <Row term={t('payment.paid')} value={money(paid)} />
        <Row term={<strong>{t('payment.left')}</strong>} value={<strong style={{ color: left > 0 ? undefined : colors.accentText }}>{money(left)}</strong>} />
      </dl>
      {payments.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {payments.map(p => (
            <li key={p.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: `1px solid ${colors.border}`, padding: '6px 0', fontSize: '13px' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                {fmt(p.paid_on, 'd MMM yyyy')} · {t(`payment.method.${p.method}`)}
                {p.note && <span style={{ display: 'block', color: colors.muted, fontSize: '12px', overflowWrap: 'anywhere' }}>{p.note}</span>}
              </span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{money(p.amount)}</span>
              <button type="button" onClick={() => remove(p)} disabled={!!busy} aria-label={t('payment.remove')} title={t('payment.remove')} style={iconBtn}>
                {busy === p.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {left > 0 && (
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', alignItems: 'end' }}>
          <div>
            <label htmlFor={`pay-date-${invoice.id}`} style={label}>{t('payment.date')}</label>
            <input id={`pay-date-${invoice.id}`} type="date" value={form.paid_on} max={today} onChange={set('paid_on')} required style={input} />
          </div>
          <div>
            <HintLabel htmlFor={`pay-amount-${invoice.id}`} hint="invoice-payment">{t('payment.amount')}</HintLabel>
            <input id={`pay-amount-${invoice.id}`} inputMode="decimal" value={form.amount} onChange={set('amount')} required style={{ ...input, textAlign: 'right' }} />
          </div>
          <div>
            <label htmlFor={`pay-method-${invoice.id}`} style={label}>{t('payment.methodLabel')}</label>
            <select id={`pay-method-${invoice.id}`} value={form.method} onChange={set('method')} style={{ ...input, cursor: 'pointer' }}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`payment.method.${m}`)}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={`pay-note-${invoice.id}`} style={label}>{t('payment.note')}</label>
            <input id={`pay-note-${invoice.id}`} value={form.note} onChange={set('note')} maxLength={500} style={input} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="submit" disabled={!!busy || !!problem} style={btnPrimary}>
              {busy === 'add' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              {' '}{num(form.amount) === left ? t('payment.recordAll') : t('payment.record')}
            </button>
            {num(form.amount) !== left && <button type="button" onClick={() => setForm(f => ({ ...f, amount: String(left) }))} style={btn}>{t('payment.fillLeft', { amount: money(left) })}</button>}
            {problem && form.amount !== '' && problem !== 'amount' && <span role="status" style={{ fontSize: '12px', color: colors.warn }}>{t(`payment.problem.${problem}`, { amount: money(left) })}</span>}
          </div>
        </form>
      )}
    </section>
  )
}

function Row({ term, value }) {
  return (
    <>
      <dt style={{ color: colors.muted, minWidth: 0 }}>{term}</dt>
      <dd style={{ margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</dd>
    </>
  )
}

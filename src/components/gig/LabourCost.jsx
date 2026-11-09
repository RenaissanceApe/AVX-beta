import { useCallback, useEffect, useState } from 'react'
import { Coins, Pencil, Check, Receipt, BadgeCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { formatMoney } from '../../lib/quotes'
import { FEE_UNITS, labourLines, labourSummary, quoteCrewRevenue, feeTotal, parseAmount, amountInput } from '../../lib/crewRates'
import { useRateCard } from '../../lib/useCrewRates'
import { personActual } from '../../lib/timeRegistration'
import { useI18n, fmt } from '../../i18n'
import { PAID_HOW } from '../../lib/expenses'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors, AvxLoader, Section } from '../ui'
import ExpenseForm from '../expenses/ExpenseForm'

const money = (v, lang) => formatMoney(v, 'EUR', lang)

// How a fee reads: "€350 × 3 days", "€500 fixed"
export function feeText(f, t, lang) {
  if (!f || f.rate == null) return ''
  if (f.unit === 'fixed') return t('labour.fixedText', { amount: money(f.rate, lang) })
  return `${money(f.rate, lang)} × ${t(`labour.qty.${f.unit}`, { count: Number(f.quantity) })}`
}

// Labour cost on a gig's Crew tab, for the people who run the gig (docs/TOOLS_PLAN.md step 7): what
// each person costs (the fee agreed with them, else the rate card's suggestion), the total, and
// the margin against the crew lines of the gig's quotes (the revenue rule: all accepted ones).
export function LabourCost({ gig, members, nameOf, refreshKey, canFinance = false }) {
  const { t, lang } = useI18n()
  const card = useRateCard(gig.org_id)
  const [fees, setFees] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [hours, setHours] = useState([])
  const [editing, setEditing] = useState(null) // labour line
  const [invoices, setInvoices] = useState([]) // expenses linked to a crew fee (step 9b): the actual amount
  const [invoicing, setInvoicing] = useState(null) // labour line
  const [paying, setPaying] = useState(null) // labour line (K8: mark the fee paid)
  const [received, setReceived] = useState([]) // the person's own "received" marks (K8)

  const load = useCallback(async () => {
    const [f, h, q] = await Promise.all([
      supabase.from('gig_crew_fees').select('user_id, unit, rate, quantity, note').eq('gig_id', gig.id),
      supabase.from('time_entries').select('user_id, status, cost, removed_at').eq('gig_id', gig.id).eq('status', 'approved').is('removed_at', null).limit(2000),
      gig.org_id ? supabase.from('quotes').select('id, status, body, discount_pct, currency, sent_at, created_at, updated_at').eq('gig_id', gig.id) : { data: [] },
    ])
    setFees(f.data || [])
    setQuotes(q.data || [])
    setHours(h.data || [])
    if (canFinance) {
      const [{ data }, rec] = await Promise.all([
        supabase.from('expenses').select('id, crew_fee_user_id, amount_net, currency, status, paid_on')
          .eq('gig_id', gig.id).not('crew_fee_user_id', 'is', null).is('removed_at', null),
        supabase.from('crew_fee_received').select('user_id, received_at').eq('gig_id', gig.id).not('received_at', 'is', null),
      ])
      setInvoices(data || [])
      setReceived(rec.data || [])
    }
  }, [gig.id, gig.org_id, canFinance])
  useEffect(() => { load() }, [load, refreshKey])

  if (!fees || !members.length) return null
  const lines = labourLines({ members, gig, rates: card.rates, factors: card.factors, fees })
  const crew = quoteCrewRevenue(quotes)
  const sum = labourSummary(lines, crew?.revenue ?? null)
  // Actual cost from approved hours (step 8): each person's stored day costs, a fixed fee once
  // and an invoice linked to the person's fee (an expense) replaces both as the actual amount
  const invoiceOf = l => invoices.find(i => i.crew_fee_user_id === l.member.user_id && i.currency === 'EUR')
  const actualOf = l => (invoiceOf(l) ? Number(invoiceOf(l).amount_net) : personActual(hours.filter(h => h.user_id === l.member.user_id), l.fee))
  // Fee paid (K8): the linked expense's paid date, and whether the person marked it received
  const paidOn = l => { const i = invoiceOf(l); return i && i.status === 'confirmed' ? i.paid_on : null }
  const receivedOf = l => received.some(r => r.user_id === l.member.user_id)
  const actuals = lines.map(actualOf)
  const actual = actuals.some(a => a != null) ? Math.round(actuals.reduce((s, a) => s + (a || 0), 0) * 100) / 100 : null

  return (
    // A section on the page ground with hairline rows (DESIGN.md "One box deep")
    <Section id="labour-title" level={3} title={t('labour.title')}>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: '0 0 var(--space-2)' }}>{t('labour.intro')}</p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {lines.map((l, i) => (
          <li key={l.member.user_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '14px', padding: 'var(--space-3) 0', borderTop: i > 0 ? `1px solid ${colors.border}` : 'none' }}>
            <span style={{ flex: '1 1 150px', minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{nameOf(l.member.user_id)}</span>
              {l.member.function_title && <span style={{ color: colors.muted }}> · {l.member.function_title}</span>}
              <span style={{ display: 'block', fontSize: '13px', color: l.source ? colors.muted : 'var(--warn)' }}>
                {l.source === 'agreed' ? t('labour.agreed', { text: feeText(l.fee, t, lang) })
                  : l.source === 'card' ? t('labour.fromCard', { text: feeText(l.suggestion, t, lang) }) + (l.suggestion.weekendDays ? ` ${t('labour.weekendDays', { count: l.suggestion.weekendDays })}` : '')
                  : t('labour.noRate')}
              </span>
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
              {l.total != null ? money(l.total, lang) : '—'}
              {actualOf(l) != null && <span style={{ display: 'block', fontSize: '13px', fontWeight: 400, color: colors.muted }}>{t(invoiceOf(l) ? 'labour.invoicedShort' : 'labour.actualShort', { amount: money(actualOf(l), lang) })}</span>}
              {canFinance && paidOn(l) && (
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: colors.accentText }}>
                  {t('labour.paidOn', { date: fmt(paidOn(l), 'd MMM yyyy') })}{receivedOf(l) && ` · ${t('labour.receivedShort')}`}
                </span>
              )}
            </span>
            {canFinance && l.source === 'agreed' && (
              <button type="button" onClick={() => setPaying(l)} style={{ ...btn, padding: '4px 8px', fontSize: '13px' }}
                aria-label={paidOn(l) ? t('labour.paidFor', { name: nameOf(l.member.user_id) }) : t('labour.markPaidFor', { name: nameOf(l.member.user_id) })}>
                <BadgeCheck size={13} aria-hidden="true" /> {paidOn(l) ? t('labour.paid') : t('labour.markPaid')}
              </button>
            )}
            {canFinance && l.source === 'agreed' && !invoiceOf(l) && (
              <button type="button" onClick={() => setInvoicing(l)} aria-label={t('labour.addInvoiceFor', { name: nameOf(l.member.user_id) })} style={iconBtn}><Receipt size={14} /></button>
            )}
            <button type="button" onClick={() => setEditing(l)} aria-label={t('labour.editFor', { name: nameOf(l.member.user_id) })} style={iconBtn}><Pencil size={14} /></button>
          </li>
        ))}
      </ul>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', fontSize: '14px', marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${colors.border}` }}>
        <dt>{t('labour.cost')}</dt><dd style={{ margin: 0, fontWeight: 700, textAlign: 'right' }}>{money(sum.cost, lang)}</dd>
        {actual != null && (
          <><dt>{t('labour.actual')}</dt>
          <dd style={{ margin: 0, fontWeight: 700, textAlign: 'right', color: actual > sum.cost ? colors.danger : 'var(--text)' }}>
            {money(actual, lang)}{actual !== sum.cost && ` (${actual > sum.cost ? '+' : '−'}${money(Math.abs(actual - sum.cost), lang)})`}
          </dd></>
        )}
        {crew && <><dt>{t('labour.quoted')}{crew.estimate && <span style={{ fontSize: '11px', color: colors.muted }}> ({t('labour.estimate')})</span>}</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(sum.revenue, lang)}</dd></>}
        {crew && (
          <><dt>{t('labour.margin')}</dt>
          <dd style={{ margin: 0, textAlign: 'right', fontWeight: 700, color: sum.margin < 0 ? colors.danger : colors.accentText }}>
            {money(sum.margin, lang)}{sum.marginPct != null && ` (${sum.marginPct}%)`}
          </dd></>
        )}
      </dl>
      {sum.missing > 0 && <p style={{ fontSize: '13px', color: 'var(--warn)', marginTop: '6px' }}>{t('labour.missing', { count: sum.missing })}</p>}
      {!crew && gig.org_id && <p style={{ fontSize: '13px', color: colors.muted, marginTop: '6px' }}>{t('labour.noQuote')}</p>}
      {invoicing && (
        <ExpenseForm orgId={gig.org_id} onClose={() => setInvoicing(null)} onSaved={load}
          preset={{ gig_id: gig.id, gigs: [{ id: gig.id, name: gig.name, start_date: gig.start_date }], link_kind: 'crew_fee', link_id: invoicing.member.user_id,
            link_text: nameOf(invoicing.member.user_id), amount_net: invoicing.total, vat_rate: 23, category_starter: 'freelance_crew',
            description: t('labour.invoiceDescription', { name: nameOf(invoicing.member.user_id), gig: gig.name }) }} />
      )}
      {paying && (
        <PaidModal gig={gig} line={paying} name={nameOf(paying.member.user_id)} invoice={invoiceOf(paying)} paidOn={paidOn(paying)}
          onClose={() => setPaying(null)} onSaved={() => { setPaying(null); load() }} />
      )}
      {editing && (
        <FeeModal gigId={gig.id} line={editing} name={nameOf(editing.member.user_id)} exists={fees.some(f => f.user_id === editing.member.user_id)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </Section>
  )
}

function FeeModal({ gigId, line, name, exists, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const start = line.fee || line.suggestion || { unit: 'day', rate: null, quantity: 1 }
  const [form, setForm] = useState({ unit: start.unit, rate: amountInput(start.rate), quantity: amountInput(start.quantity ?? 1), note: line.fee?.note || '' })
  const [saving, setSaving] = useState(false)
  const rate = parseAmount(form.rate)
  const quantity = form.unit === 'fixed' ? 1 : parseAmount(form.quantity)
  const ok = rate != null && !Number.isNaN(rate) && quantity > 0 && quantity <= 1000

  async function save(values) {
    setSaving(true)
    const row = { ...values, note: values.note?.trim() || null }
    const { error } = exists
      ? await supabase.from('gig_crew_fees').update(row).eq('gig_id', gigId).eq('user_id', line.member.user_id)
      : await supabase.from('gig_crew_fees').insert({ gig_id: gigId, user_id: line.member.user_id, ...row })
    setSaving(false)
    if (error) { logger.error('labour', error, { step: 'saveFee' }); return notify(userMessage(error), 'error') }
    track('labour:fee')
    onSaved()
  }

  return (
    <Modal title={t('labour.feeFor', { name })} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (ok) save({ unit: form.unit, rate, quantity, note: form.note }) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
          <div>
            <label htmlFor="fee-unit" style={label}>{t('labour.unitLabel')}</label>
            <select id="fee-unit" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={{ ...input, appearance: 'auto' }}>
              {FEE_UNITS.map(u => <option key={u} value={u}>{t(`labour.unit.${u}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="fee-rate" style={label}>{form.unit === 'fixed' ? t('labour.amount') : t('labour.rate')}</label>
            <input id="fee-rate" inputMode="decimal" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} style={input} autoFocus />
          </div>
          {form.unit !== 'fixed' && (
            <div>
              <label htmlFor="fee-qty" style={label}>{t(`labour.howMany.${form.unit}`)}</label>
              <input id="fee-qty" inputMode="decimal" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} style={input} />
            </div>
          )}
        </div>
        <div>
          <label htmlFor="fee-note" style={label}>{t('labour.note')}</label>
          <input id="fee-note" value={form.note} maxLength={300} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder={t('labour.notePlaceholder')} style={input} />
        </div>
        {ok && <p style={{ fontSize: '14px', margin: 0 }}>{t('labour.total')}: <strong>{formatMoney(feeTotal({ unit: form.unit, rate, quantity }), 'EUR')}</strong></p>}
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t('labour.feeHint')}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving || !ok} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
            {saving ? <AvxLoader size={15} /> : <Check size={15} />} {t('common.save')}
          </button>
          {line.fee && (
            <button type="button" disabled={saving} onClick={() => save({ unit: line.fee.unit, rate: null, quantity: line.fee.quantity, note: null })} style={btn}>{t('labour.useCard')}</button>
          )}
        </div>
      </form>
    </Modal>
  )
}

// Mark a person's agreed fee paid (K8): the database records the expense linked to the fee (9b),
// or puts the date on the one already there, and tells the person. Only for those who see money.
export function PaidModal({ gig, line, name, invoice, paidOn, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState({ date: fmt(new Date(), 'yyyy-MM-dd'), how: 'transfer', amount: amountInput(line.total), vat: '23' })
  const [saving, setSaving] = useState(false)
  const amount = parseAmount(form.amount)
  const vat = parseAmount(form.vat)
  const ok = !!form.date && (invoice || (amount != null && !Number.isNaN(amount) && amount >= 0 && vat != null && vat >= 0 && vat <= 100))

  async function save(paid) {
    setSaving(true)
    const { error } = await supabase.rpc('mark_crew_fee_paid', {
      p_gig: gig.id, p_user: line.member.user_id, p_paid_on: paid ? form.date : null, p_paid_how: form.how,
      p_amount_net: invoice ? null : amount, p_vat_rate: invoice ? 0 : vat,
      p_description: t('labour.invoiceDescription', { name, gig: gig.name }),
    })
    setSaving(false)
    if (error) { logger.error('labour', error, { step: 'markPaid' }); return notify(userMessage(error), 'error') }
    track(paid ? 'labour:paid' : 'labour:unpaid')
    notify(paid ? t('labour.paidSaved', { name }) : t('labour.unpaidSaved'))
    onSaved()
  }

  if (paidOn) return (
    <Modal title={t('labour.paidTitle', { name })} onClose={onClose}>
      <p style={{ fontSize: '14px', marginTop: 0 }}>{t('labour.paidOn', { date: fmt(paidOn, 'd MMM yyyy') })}</p>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('labour.unpayHint')}</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>{t('common.close')}</button>
        <button type="button" disabled={saving} onClick={() => save(false)} style={btn}>{t('labour.unpay')}</button>
      </div>
    </Modal>
  )
  return (
    <Modal title={t('labour.markPaidTitle', { name })} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (ok) save(true) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
          <div>
            <label htmlFor="paid-date" style={label}>{t('labour.paidDate')}</label>
            <input id="paid-date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={input} required />
          </div>
          <div>
            <label htmlFor="paid-how" style={label}>{t('expenses.paidHowLabel')}</label>
            <select id="paid-how" value={form.how} onChange={e => setForm(f => ({ ...f, how: e.target.value }))} style={{ ...input, appearance: 'auto' }}>
              {PAID_HOW.map(h => <option key={h} value={h}>{t(`expenses.paidHow.${h}`)}</option>)}
            </select>
          </div>
          {!invoice && (
            <>
              <div>
                <label htmlFor="paid-amount" style={label}>{t('labour.paidAmount')}</label>
                <input id="paid-amount" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={input} />
              </div>
              <div>
                <label htmlFor="paid-vat" style={label}>{t('labour.paidVat')}</label>
                <input id="paid-vat" inputMode="decimal" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} style={input} />
              </div>
            </>
          )}
        </div>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t(invoice ? 'labour.markPaidInvoiceHint' : 'labour.markPaidHint')}</p>
        <button type="submit" disabled={saving || !ok} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <AvxLoader size={15} /> : <Check size={15} />} {t('labour.markPaid')}
        </button>
      </form>
    </Modal>
  )
}

// A crew member's own fee on a gig, when one was agreed; nobody else's is shown
export function MyFee({ gigId, userId }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [fee, setFee] = useState(null)
  const [status, setStatus] = useState(null) // { paid_on, received_at }, through my_gig_numbers (K8)
  const [saving, setSaving] = useState(false)
  const loadStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_gig_numbers', { p_gig: gigId })
    if (error) logger.error('labour', error, { step: 'myFeeStatus' })
    setStatus(data?.[0] || null)
  }, [gigId])
  useEffect(() => {
    let live = true
    supabase.from('gig_crew_fees').select('unit, rate, quantity').eq('gig_id', gigId).eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (live) setFee(data) })
    return () => { live = false }
  }, [gigId, userId])
  useEffect(() => { if (fee?.rate != null) loadStatus() }, [fee, loadStatus])

  async function markReceived(on) {
    setSaving(true)
    const { error } = await supabase.rpc('mark_fee_received', { p_gig: gigId, p_received: on })
    setSaving(false)
    if (error) { logger.error('labour', error, { step: 'markReceived' }); return notify(userMessage(error), 'error') }
    track(on ? 'labour:received' : 'labour:notReceived')
    loadStatus()
  }

  if (!fee || fee.rate == null) return null
  return (
    <Section id="my-fee" style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <Coins size={16} color="var(--muted)" aria-hidden="true" />
      <span>{t('labour.myFee')}: <strong>{formatMoney(feeTotal(fee), 'EUR', lang)}</strong></span>
      {fee.unit !== 'fixed' && <span style={{ color: colors.muted, fontSize: '13px' }}>({feeText(fee, t, lang)})</span>}
      {status?.paid_on && (
        <span style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px' }}>
          <BadgeCheck size={14} color="var(--accent-text)" aria-hidden="true" />
          <span style={{ fontWeight: 600, color: colors.accentText }}>{t('labour.paidOn', { date: fmt(status.paid_on, 'd MMM yyyy') })}</span>
          {status.received_at
            ? <><span>{t('labour.receivedOn', { date: fmt(status.received_at, 'd MMM yyyy') })}</span>
              <button type="button" disabled={saving} onClick={() => markReceived(false)} style={{ ...btn, padding: '4px 8px', fontSize: '13px' }}>{t('labour.notReceived')}</button></>
            : <button type="button" disabled={saving} onClick={() => markReceived(true)} style={{ ...btn, padding: '4px 8px', fontSize: '13px' }}><Check size={13} aria-hidden="true" /> {t('labour.markReceived')}</button>}
        </span>
      )}
    </Section>
  )
}

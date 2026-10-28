import { useCallback, useEffect, useState } from 'react'
import { Coins, Pencil, Loader2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { formatMoney } from '../../lib/quotes'
import { FEE_UNITS, labourLines, labourSummary, quoteCrewRevenue, feeTotal, parseAmount, amountInput } from '../../lib/crewRates'
import { useRateCard } from '../../lib/useCrewRates'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../ui'

const money = (v, lang) => formatMoney(v, 'EUR', lang)

// How a fee reads: "€350 × 3 days", "€500 fixed"
function feeText(f, t, lang) {
  if (!f || f.rate == null) return ''
  if (f.unit === 'fixed') return t('labour.fixedText', { amount: money(f.rate, lang) })
  return `${money(f.rate, lang)} × ${t(`labour.qty.${f.unit}`, { count: Number(f.quantity) })}`
}

// Labour cost on a gig's Crew tab, for the people who run the gig (docs/TOOLS_PLAN.md step 7): what
// each person costs (the fee agreed with them, else the rate card's suggestion), the total, and
// the margin against the crew lines of the gig's quote.
export function LabourCost({ gig, members, nameOf }) {
  const { t, lang } = useI18n()
  const card = useRateCard(gig.org_id)
  const [fees, setFees] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [editing, setEditing] = useState(null) // labour line

  const load = useCallback(async () => {
    const [f, q] = await Promise.all([
      supabase.from('gig_crew_fees').select('user_id, unit, rate, quantity, note').eq('gig_id', gig.id),
      gig.org_id ? supabase.from('quotes').select('id, status, body, discount_pct, created_at, updated_at').eq('gig_id', gig.id) : { data: [] },
    ])
    setFees(f.data || [])
    setQuotes(q.data || [])
  }, [gig.id, gig.org_id])
  useEffect(() => { load() }, [load])

  if (!fees || !members.length) return null
  const lines = labourLines({ members, gig, rates: card.rates, factors: card.factors, fees })
  const crew = quoteCrewRevenue(quotes)
  const sum = labourSummary(lines, crew?.revenue ?? null)

  return (
    <section aria-labelledby="labour-title" style={{ ...card, padding: '14px 16px', marginTop: '16px' }}>
      <h3 id="labour-title" style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
        <Coins size={15} color="var(--accent-text)" /> {t('labour.title')}
      </h3>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '10px' }}>{t('labour.intro')}</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {lines.map(l => (
          <li key={l.member.user_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '14px' }}>
            <span style={{ flex: '1 1 150px', minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{nameOf(l.member.user_id)}</span>
              {l.member.function_title && <span style={{ color: colors.muted }}> · {l.member.function_title}</span>}
              <span style={{ display: 'block', fontSize: '12px', color: l.source ? colors.muted : 'var(--warn)' }}>
                {l.source === 'agreed' ? t('labour.agreed', { text: feeText(l.fee, t, lang) })
                  : l.source === 'card' ? t('labour.fromCard', { text: feeText(l.suggestion, t, lang) }) + (l.suggestion.weekendDays ? ` ${t('labour.weekendDays', { count: l.suggestion.weekendDays })}` : '')
                  : t('labour.noRate')}
              </span>
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.total != null ? money(l.total, lang) : '—'}</span>
            <button type="button" onClick={() => setEditing(l)} aria-label={t('labour.editFor', { name: nameOf(l.member.user_id) })} style={iconBtn}><Pencil size={14} /></button>
          </li>
        ))}
      </ul>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', fontSize: '14px', marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${colors.border}` }}>
        <dt>{t('labour.cost')}</dt><dd style={{ margin: 0, fontWeight: 700, textAlign: 'right' }}>{money(sum.cost, lang)}</dd>
        {crew && <><dt>{t('labour.quoted')}</dt><dd style={{ margin: 0, textAlign: 'right' }}>{money(sum.revenue, lang)}</dd></>}
        {crew && (
          <><dt>{t('labour.margin')}</dt>
          <dd style={{ margin: 0, textAlign: 'right', fontWeight: 700, color: sum.margin < 0 ? colors.danger : colors.accentText }}>
            {money(sum.margin, lang)}{sum.marginPct != null && ` (${sum.marginPct}%)`}
          </dd></>
        )}
      </dl>
      {sum.missing > 0 && <p style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '6px' }}>{t('labour.missing', { count: sum.missing })}</p>}
      {!crew && gig.org_id && <p style={{ fontSize: '12px', color: colors.muted, marginTop: '6px' }}>{t('labour.noQuote')}</p>}
      {editing && (
        <FeeModal gigId={gig.id} line={editing} name={nameOf(editing.member.user_id)} exists={fees.some(f => f.user_id === editing.member.user_id)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </section>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
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
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t('labour.feeHint')}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving || !ok} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
          </button>
          {line.fee && (
            <button type="button" disabled={saving} onClick={() => save({ unit: line.fee.unit, rate: null, quantity: line.fee.quantity, note: null })} style={btn}>{t('labour.useCard')}</button>
          )}
        </div>
      </form>
    </Modal>
  )
}

// A crew member's own fee on a gig, when one was agreed; nobody else's is shown
export function MyFee({ gigId, userId }) {
  const { t, lang } = useI18n()
  const [fee, setFee] = useState(null)
  useEffect(() => {
    let live = true
    supabase.from('gig_crew_fees').select('unit, rate, quantity').eq('gig_id', gigId).eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (live) setFee(data) })
    return () => { live = false }
  }, [gigId, userId])
  if (!fee || fee.rate == null) return null
  return (
    <p style={{ ...card, padding: '10px 14px', fontSize: '14px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <Coins size={15} color="var(--accent-text)" aria-hidden="true" />
      <span>{t('labour.myFee')}: <strong>{formatMoney(feeTotal(fee), 'EUR', lang)}</strong></span>
      {fee.unit !== 'fixed' && <span style={{ color: colors.muted, fontSize: '13px' }}>({feeText(fee, t, lang)})</span>}
    </p>
  )
}

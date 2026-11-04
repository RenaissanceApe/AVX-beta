import { useEffect, useState } from 'react'
import { formatMoney } from '../../lib/quotes'
import { FEE_UNITS, amountInput, feeFromForm } from '../../lib/crewRates'
import { useI18n } from '../../i18n'
import { Hint } from '../help/HelpParts'
import { btn, input, label, colors } from '../ui'

// The fee on an offer of a place (step 7b): crew calls, Find crew and the job board. It starts
// from a suggestion (the rate card, or the job post) until someone edits it.
const noFee = { unit: 'day', rate: '', quantity: '1' }
const toForm = fee => (fee ? { unit: fee.unit, rate: amountInput(fee.rate), quantity: fee.quantity == null ? '' : amountInput(fee.quantity) } : noFee)

export function useFeeForm(suggested) {
  const [form, setForm] = useState(() => toForm(suggested))
  const [touched, setTouched] = useState(false)
  const key = JSON.stringify(suggested || null)
  useEffect(() => { if (!touched) setForm(toForm(suggested)) }, [key, touched]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    form, touched, ...feeFromForm(form),
    edit: patch => { setTouched(true); setForm(f => ({ ...f, ...patch })) },
    reset: () => { setTouched(false); setForm(toForm(suggested)) },
  }
}

//   <FeeFields id="cc" state={useFeeForm(…)} note={…} resetLabel={…} canReset />
export function FeeFields({ id, state, note, resetLabel, canReset }) {
  const { t, lang } = useI18n()
  const { form, edit, reset, total, bad, touched } = state
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={{ ...label, display: 'flex', alignItems: 'center', gap: '4px' }}>{t('crewCall.fee')} <Hint id="crew-call-fee" label={t('crewCall.fee')} /></legend>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
        <div>
          <label style={label} htmlFor={`${id}-fee-unit`}>{t('labour.unitLabel')}</label>
          <select id={`${id}-fee-unit`} value={form.unit} onChange={e => edit({ unit: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
            {FEE_UNITS.map(u => <option key={u} value={u}>{t(`labour.unit.${u}`)}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor={`${id}-fee-rate`}>{form.unit === 'fixed' ? t('labour.amount') : t('labour.rate')}</label>
          <input id={`${id}-fee-rate`} inputMode="decimal" value={form.rate} onChange={e => edit({ rate: e.target.value })} aria-invalid={bad || undefined} style={input} />
        </div>
        {form.unit !== 'fixed' && (
          <div>
            <label style={label} htmlFor={`${id}-fee-qty`}>{t(`labour.howMany.${form.unit}`)}</label>
            <input id={`${id}-fee-qty`} inputMode="decimal" value={form.quantity} onChange={e => edit({ quantity: e.target.value })} aria-invalid={bad || undefined} style={input} />
          </div>
        )}
      </div>
      <p style={{ fontSize: '12px', color: bad ? 'var(--warn)' : colors.muted, lineHeight: 1.5, marginTop: '6px' }}>
        {bad && <strong>{t('crewCall.feeBad')} </strong>}
        {total != null && <strong style={{ color: 'var(--text)' }}>{t('crewCall.feeTotal', { amount: formatMoney(total, 'EUR', lang) })} </strong>}
        {note}
      </p>
      {touched && canReset && (
        <button type="button" onClick={reset} style={{ ...btn, padding: '5px 10px', fontSize: '12px', marginTop: '6px' }}>{resetLabel}</button>
      )}
    </fieldset>
  )
}

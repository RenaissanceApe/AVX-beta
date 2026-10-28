import { useEffect, useState } from 'react'
import { Coins, Plus, Trash2, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { FUNCTIONS } from '../lib/crewProfile'
import { FACTOR_KEYS, parseAmount, amountInput } from '../lib/crewRates'
import { useRateCard, useOrgCrewPeople } from '../lib/useCrewRates'
import { useI18n } from '../i18n'
import { btn, iconBtn, input, label, colors } from './ui'

const AMOUNTS = ['day_rate', 'half_day_rate', 'hour_rate']
const EMPTY = { function_title: '', user_id: '', day_rate: '', half_day_rate: '', hour_rate: '' }
const small = { ...input, padding: '6px 10px', minWidth: 0 }
const select = { ...small, appearance: 'auto' }

// Organisation settings → Crew rates (docs/TOOLS_PLAN.md step 7): what the organisation pays per
// function or per person, and the factors for overtime, weekends, nights and holidays.
export default function OrgCrewRatesSettings({ org }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const card = useRateCard(org.id)
  const { people, titles } = useOrgCrewPeople(org.id)
  const [draft, setDraft] = useState(EMPTY)
  const [factors, setFactors] = useState(null)
  const [busy, setBusy] = useState(false)
  // Filled once from the database, so saving a rate doesn't wipe factors being typed
  useEffect(() => {
    if (card.loaded) setFactors(f => f || Object.fromEntries(['overtime_after_hours', ...FACTOR_KEYS].map(k => [k, amountInput(card.factors[k])])))
  }, [card.loaded, card.factors])

  const nameOf = id => people.find(p => p.id === id)?.full_name || t('rates.someone')
  const suggestions = [...new Set([...titles, ...FUNCTIONS.map(f => t(`crewFn.${f}`))])]

  async function run(promise, step) {
    setBusy(true)
    const { error } = await promise
    setBusy(false)
    if (error) {
      logger.error('crewRates', error, { step })
      notify(error.code === '23505' ? t('rates.duplicate') : userMessage(error), 'error')
      return false
    }
    card.reload()
    return true
  }

  const amounts = Object.fromEntries(AMOUNTS.map(k => [k, parseAmount(draft[k])]))
  const draftOk = (draft.function_title.trim() || draft.user_id) && AMOUNTS.some(k => amounts[k] != null) && AMOUNTS.every(k => !Number.isNaN(amounts[k]))
  async function add(e) {
    e.preventDefault()
    if (!draftOk) return
    const ok = await run(supabase.from('crew_rates').insert({
      org_id: org.id, function_title: draft.function_title.trim() || null, user_id: draft.user_id || null, ...amounts,
    }), 'add')
    if (ok) { track('crewRates:add'); setDraft(EMPTY) }
  }
  function saveAmount(r, key, raw, el) {
    const v = parseAmount(raw)
    const others = AMOUNTS.filter(k => k !== key).some(k => r[k] != null)
    if (Number.isNaN(v) || (v == null && !others)) { el.value = amountInput(r[key]); return }
    if (v === (r[key] == null ? null : Number(r[key]))) return
    run(supabase.from('crew_rates').update({ [key]: v }).eq('id', r.id), 'update')
  }
  function remove(r) {
    if (window.confirm(t('rates.removeConfirm', { name: rateName(r) }))) run(supabase.from('crew_rates').update({ removed_at: new Date().toISOString() }).eq('id', r.id), 'remove')
  }
  const rateName = r => [r.function_title, r.user_id && nameOf(r.user_id)].filter(Boolean).join(' · ')

  const factorValues = factors && Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, parseAmount(v)]))
  const factorsOk = factorValues && FACTOR_KEYS.every(k => factorValues[k] >= 1 && factorValues[k] <= 5)
    && factorValues.overtime_after_hours >= 1 && factorValues.overtime_after_hours <= 24
  async function saveFactors(e) {
    e.preventDefault()
    if (!factorsOk) return
    const ok = await run(card.hasFactors
      ? supabase.from('crew_rate_factors').update(factorValues).eq('org_id', org.id)
      : supabase.from('crew_rate_factors').insert({ org_id: org.id, ...factorValues }), 'factors')
    if (ok) notify(t('rates.factorsSaved'), 'success')
  }

  return (
    <section aria-labelledby="org-rates" style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}` }}>
      <h3 id="org-rates" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px' }}><Coins size={13} /> {t('rates.title')}</h3>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '10px' }}>{t('rates.intro')}</p>
      {card.loaded && card.rates.length === 0 && <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '8px' }}>{t('rates.empty')}</p>}
      {card.rates.length > 0 && (
        <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', marginBottom: '4px' }}>
          {AMOUNTS.map(k => <span key={k} style={{ ...label, fontSize: '11px', marginBottom: 0 }}>{t(`rates.${k}`)}</span>)}
        </div>
      )}
      {card.rates.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          {card.rates.map(r => (
            <li key={r.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: '14px', fontWeight: 600, overflowWrap: 'anywhere' }}>{rateName(r)}</span>
              <button type="button" onClick={() => remove(r)} disabled={busy} aria-label={t('rates.remove', { name: rateName(r) })} style={iconBtn}><Trash2 size={14} /></button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px', width: '100%' }}>
                {AMOUNTS.map(k => (
                  <input key={`${k}:${r[k]}`} defaultValue={amountInput(r[k])} inputMode="decimal" disabled={busy}
                    aria-label={t(`rates.${k}Of`, { name: rateName(r) })} placeholder="—"
                    onBlur={e => saveAmount(r, k, e.target.value, e.target)} style={small} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', alignItems: 'end' }}>
        <div>
          <label htmlFor="rate-fn" style={{ ...label, fontSize: '11px' }}>{t('rates.function')}</label>
          <input id="rate-fn" list="rate-fns" value={draft.function_title} maxLength={120} placeholder={t('rates.functionPlaceholder')}
            onChange={e => setDraft(d => ({ ...d, function_title: e.target.value }))} style={small} />
          <datalist id="rate-fns">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
        </div>
        <div>
          <label htmlFor="rate-person" style={{ ...label, fontSize: '11px' }}>{t('rates.person')}</label>
          <select id="rate-person" value={draft.user_id} onChange={e => setDraft(d => ({ ...d, user_id: e.target.value }))} style={select}>
            <option value="">{t('rates.anyone')}</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        {AMOUNTS.map(k => (
          <div key={k}>
            <label htmlFor={`rate-${k}`} style={{ ...label, fontSize: '11px' }}>{t(`rates.${k}`)}</label>
            <input id={`rate-${k}`} inputMode="decimal" value={draft[k]} placeholder="0,00"
              onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} style={small} />
          </div>
        ))}
        <button type="submit" disabled={busy || !draftOk} style={{ ...btn, justifyContent: 'center' }}><Plus size={14} /> {t('labels.add')}</button>
      </form>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginTop: '8px' }}>{t('rates.hint')}</p>

      {factors && (
        <form onSubmit={saveFactors} style={{ marginTop: '14px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>{t('rates.factors')}</h4>
          <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('rates.factorsHint')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px', alignItems: 'end' }}>
            {[...FACTOR_KEYS.slice(0, 1), 'overtime_after_hours', ...FACTOR_KEYS.slice(1)].map(k => (
              <div key={k}>
                <label htmlFor={`factor-${k}`} style={{ ...label, fontSize: '11px' }}>{t(`rates.factor.${k}`)}</label>
                <input id={`factor-${k}`} inputMode="decimal" value={factors[k]} onChange={e => setFactors(f => ({ ...f, [k]: e.target.value }))} style={small} />
              </div>
            ))}
            <button type="submit" disabled={busy || !factorsOk} style={{ ...btn, justifyContent: 'center' }}><Check size={14} /> {t('common.save')}</button>
          </div>
        </form>
      )}
    </section>
  )
}

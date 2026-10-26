import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Loader2, ShieldCheck, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { countryName } from '../lib/crewProfile'
import { VIES_COUNTRIES, isoFor, splitVat, trustError } from '../lib/trust'
import { useI18n } from '../i18n'
import { btn, input, label, colors } from './ui'

// Organisation settings → Verification (docs/CREW_NETWORK.md, N4): check the company's EU VAT
// number with VIES (the vies-check function), or ask AVX for a manual check. A verified company
// gets a badge on its job posts and no limit of 3 open posts.
export default function OrgVerificationSettings({ org, onChanged }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const first = splitVat(org.tax_id, 'PT')
  const [country, setCountry] = useState(first.country)
  const [number, setNumber] = useState(first.number)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null) // 'vies' | 'manual'
  const [history, setHistory] = useState([])
  const [answer, setAnswer] = useState(null) // last VIES answer, for the status line

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('org_verifications').select('id, method, status, country, vat_number, found_name, answer, created_at')
      .eq('org_id', org.id).order('created_at', { ascending: false }).limit(5)
    if (error) logger.error('trust', error, { step: 'history' })
    setHistory(data || [])
  }, [org.id])
  useEffect(() => { load() }, [load])

  async function checkVies(e) {
    e.preventDefault()
    if (!country || !number.trim()) return
    setBusy('vies'); setAnswer(null)
    const { data, error } = await supabase.functions.invoke('vies-check', { body: { org: org.id, country, number } })
    setBusy(null)
    if (error) {
      let body = null
      try { body = await error.context?.json() } catch { /* not JSON */ }
      logger.error('trust', error, { step: 'vies' })
      const k = trustError(body?.error ? { message: body.error } : error)
      return notify(k ? t(k) : userMessage(body?.error ? { message: body.error } : error), 'error')
    }
    setAnswer(data)
    track(`trust:vies:${data?.status}`)
    if (data?.status === 'verified') { notify(t('trust.verify.done'), 'success'); onChanged?.() }
    load()
  }

  async function askManual(e) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy('manual')
    const { error } = await supabase.rpc('request_manual_verification', { p_org: org.id, p_note: note.trim() })
    setBusy(null)
    if (error) { logger.error('trust', error, { step: 'manual' }); const k = trustError(error); return notify(k ? t(k) : userMessage(error), 'error') }
    setNote('')
    notify(t('trust.verify.manualSent'), 'success')
    track('trust:manual')
    load()
  }

  const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
  const pending = history.find(h => h.method === 'manual' && h.status === 'pending')
  const countries = VIES_COUNTRIES.map(c => ({ c, n: countryName(isoFor(c), lang) })).sort((a, b) => a.n.localeCompare(b.n, lang))
  return (
    <section aria-labelledby="org-verify-title" style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span id="org-verify-title" style={{ ...label, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}><ShieldCheck size={13} /> {t('trust.verify.title')}</span>
      {org.verified_at ? (
        <p role="status" style={{ fontSize: '14px', display: 'flex', gap: '6px', alignItems: 'center', color: 'var(--sky)', fontWeight: 600 }}>
          <BadgeCheck size={15} aria-hidden="true" /> {t('trust.verify.isVerified', { name: org.verified_name || org.name })}
          <span style={{ ...hint, fontWeight: 400 }}>· {t(`trust.verify.method.${org.verified_method || 'manual'}`)}</span>
        </p>
      ) : (
        <>
          <p style={hint}>{t('trust.verify.hint')}</p>
          <form onSubmit={checkVies} noValidate style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={label} htmlFor="vies-country">{t('trust.verify.country')}</label>
              <select id="vies-country" value={country} onChange={e => setCountry(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">—</option>
                {countries.map(({ c, n }) => <option key={c} value={c}>{n} ({c})</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="vies-number">{t('trust.verify.number')}</label>
              <input id="vies-number" value={number} onChange={e => setNumber(e.target.value)} maxLength={20} autoComplete="off" style={input} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button type="submit" disabled={!!busy || !country || !number.trim()} style={btn}>
                {busy === 'vies' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />} {t('trust.verify.checkVies')}
              </button>
            </div>
          </form>
          {answer && answer.status !== 'verified' && (
            <p role="alert" style={{ ...hint, color: 'var(--warn)' }}>{answer.status === 'rejected' ? t('trust.verify.rejected') : t('trust.verify.viesDown')}</p>
          )}
          <form onSubmit={askManual} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ ...label, marginBottom: 0 }} htmlFor="verify-note">{t('trust.verify.manualLabel')}</label>
            <p style={hint}>{t('trust.verify.manualHint')}</p>
            {pending ? (
              <p role="status" style={{ ...hint, color: colors.accentText }}>{t('trust.verify.manualPending')}</p>
            ) : (
              <>
                <textarea id="verify-note" rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={t('trust.verify.manualPlaceholder')} style={{ ...input, resize: 'vertical' }} />
                <div><button type="submit" disabled={!!busy || !note.trim()} style={btn}>
                  {busy === 'manual' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} {t('trust.verify.manualSend')}
                </button></div>
              </>
            )}
          </form>
        </>
      )}
      {history.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }} aria-label={t('trust.verify.history')}>
          {history.map(h => (
            <li key={h.id} style={hint}>
              {new Date(h.created_at).toLocaleDateString(lang === 'pt' ? 'pt-PT' : 'en-GB')} · {t(`trust.verify.method.${h.method}`)}
              {h.vat_number && <> · {h.country}{h.vat_number}</>} · {t(`trust.verify.status.${h.status}`)}
              {h.found_name && <> · {h.found_name}</>}{h.answer && h.status !== 'error' && <> · “{h.answer}”</>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

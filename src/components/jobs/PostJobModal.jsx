import { useEffect, useState } from 'react'
import { Loader2, Send, MapPin, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { FUNCTIONS, LANGUAGES, languageName } from '../../lib/crewProfile'
import { CURRENCIES, PAY_PER, emptyPost, postPayload, jobError } from '../../lib/jobs'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors, tint } from '../ui'
import PlaceFinder from '../PlaceFinder'

const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }

// Publish an open position to the job board (docs/CREW_NETWORK.md, N3), for a gig the person
// manages. Without a gig given, the organisation's upcoming gigs are offered first.
//   <PostJobModal gig={gig} position={pos} gigs={[…]} onClose onPosted />
export default function PostJobModal({ gig: givenGig, position, gigs = [], onClose, onPosted }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [gigId, setGigId] = useState(givenGig?.id || '')
  const gig = givenGig || gigs.find(g => g.id === gigId) || null
  const [form, setForm] = useState(() => emptyPost(givenGig, position))
  const [positions, setPositions] = useState([])
  const [saving, setSaving] = useState(false)
  const set = patch => setForm(f => ({ ...f, ...patch }))

  useEffect(() => {
    if (!gig) return
    if (!givenGig) setForm(emptyPost(gig))
    supabase.from('gig_positions').select('id, title, quantity, notes').eq('gig_id', gig.id).order('created_at')
      .then(({ data, error }) => { if (error) logger.error('jobs', error, { step: 'positions' }); setPositions(data || []) })
  }, [gig?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function publish(e) {
    e.preventDefault()
    const { payload, errors } = postPayload(form)
    if (errors.length) return notify(t(`jobs.formErr.${errors[0]}`), 'error')
    setSaving(true)
    const { data, error } = await supabase.rpc('publish_job', { p_gig: gig.id, p_job: payload })
    setSaving(false)
    if (error) {
      logger.error('jobs', error, { step: 'publish' })
      const key = jobError(error)
      return notify(key ? t(key) : userMessage(error), 'error')
    }
    notify(t('jobs.posted'), 'success')
    track('jobs:posted')
    onPosted?.(data)
  }

  return (
    <Modal title={t('jobs.postTitle')} onClose={onClose}>
      <form onSubmit={publish} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={hint}>{t('jobs.postIntro')}</p>
        {!givenGig && (
          <div>
            <label style={label} htmlFor="pj-gig">{t('jobs.gig')} *</label>
            <select id="pj-gig" value={gigId} onChange={e => setGigId(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('jobs.chooseGig')}</option>
              {gigs.map(g => <option key={g.id} value={g.id}>{g.name}{g.start_date ? ` · ${g.start_date}` : ''}</option>)}
            </select>
          </div>
        )}
        {gig && <>
          {positions.length > 0 && (
            <div>
              <label style={label} htmlFor="pj-position">{t('jobs.position')}</label>
              <select id="pj-position" value={form.position_id} onChange={e => {
                const p = positions.find(x => x.id === e.target.value)
                set(p ? { position_id: p.id, title: p.title, quantity: p.quantity, description: form.description || p.notes || '' } : { position_id: '' })
              }} style={{ ...input, cursor: 'pointer' }}>
                <option value="">{t('jobs.noPosition')}</option>
                {positions.map(p => <option key={p.id} value={p.id}>{p.title} × {p.quantity}</option>)}
              </select>
            </div>
          )}
          <div style={grid}>
            <div>
              <label style={label} htmlFor="pj-title">{t('jobs.title')} *</label>
              <input id="pj-title" value={form.title} onChange={e => set({ title: e.target.value })} maxLength={120} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="pj-fn">{t('jobs.function')}</label>
              <select id="pj-fn" value={form.function_key} onChange={e => set({ function_key: e.target.value, title: form.title || (e.target.value ? t(`crewFn.${e.target.value}`) : '') })} style={{ ...input, cursor: 'pointer' }}>
                <option value="">{t('jobs.anyFunction')}</option>
                {FUNCTIONS.map(f => ({ f, n: t(`crewFn.${f}`) })).sort((a, b) => a.n.localeCompare(b.n, lang)).map(({ f, n }) => <option key={f} value={f}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="pj-qty">{t('jobs.quantity')}</label>
              <input id="pj-qty" type="number" min={1} max={50} value={form.quantity} onChange={e => set({ quantity: e.target.value })} style={input} />
            </div>
          </div>
          <div style={grid}>
            <div>
              <label style={label} htmlFor="pj-from">{t('jobs.from')} *</label>
              <input id="pj-from" type="date" value={form.starts_on} onChange={e => set({ starts_on: e.target.value })} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="pj-to">{t('jobs.to')}</label>
              <input id="pj-to" type="date" value={form.ends_on} min={form.starts_on || undefined} onChange={e => set({ ends_on: e.target.value })} style={input} />
            </div>
          </div>
          {form.place ? (
            <div>
              <span style={label}>{t('jobs.where')}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600 }}>
                <MapPin size={14} aria-hidden="true" /> {form.place.label}
                <button type="button" onClick={() => set({ place: null })} aria-label={t('jobs.changePlace')} style={iconBtn}><X size={15} /></button>
              </span>
            </div>
          ) : (
            <PlaceFinder key={gig.id} id="pj-place" label={t('jobs.where')} hint={t('jobs.whereHint')} initialQuery={gig.venue || ''} onChoose={p => set({ place: p })} />
          )}
          <div>
            <label style={label} htmlFor="pj-lang">{t('jobs.languages')}</label>
            {form.languages.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {form.languages.map(l => (
                  <li key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, background: tint(colors.accent, 16), color: colors.accentText }}>
                    {languageName(l, lang)}
                    <button type="button" onClick={() => set({ languages: form.languages.filter(x => x !== l) })} aria-label={t('crewProfile.removeLanguage', { name: languageName(l, lang) })} style={{ ...iconBtn, padding: 0, color: 'inherit' }}><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            <select id="pj-lang" value="" onChange={e => { const v = e.target.value; if (v && !form.languages.includes(v)) set({ languages: [...form.languages, v].slice(0, 8) }) }} style={{ ...input, cursor: 'pointer' }}>
              <option value="">{t('crewProfile.addLanguage')}</option>
              {LANGUAGES.filter(l => !form.languages.includes(l)).map(l => ({ l, n: languageName(l, lang) })).sort((a, b) => a.n.localeCompare(b.n, lang)).map(({ l, n }) => <option key={l} value={l}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="pj-cert">{t('jobs.certificate')}</label>
            <input id="pj-cert" value={form.certificate} onChange={e => set({ certificate: e.target.value })} maxLength={100} placeholder="IPAF 3a" style={input} />
          </div>
          <div>
            <label style={label} htmlFor="pj-desc">{t('jobs.description')}</label>
            <textarea id="pj-desc" rows={4} value={form.description} onChange={e => set({ description: e.target.value })} maxLength={2000} placeholder={t('jobs.descriptionPlaceholder')} style={{ ...input, resize: 'vertical' }} />
          </div>
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <legend style={{ ...label, marginBottom: '6px' }}>{t('jobs.payTitle')}</legend>
            {['ask_rate', 'fixed'].map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="radio" name="pj-pay" checked={form.pay_mode === m} onChange={() => set({ pay_mode: m })} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
                <span><span style={{ fontWeight: 600 }}>{t(`jobs.payMode.${m}`)}</span>
                  <span style={{ display: 'block', ...hint, marginTop: '2px' }}>{t(`jobs.payModeHint.${m}`)}</span></span>
              </label>
            ))}
            {form.pay_mode === 'fixed' && (
              <div style={grid}>
                <div><label style={label} htmlFor="pj-amount">{t('jobs.amount')} *</label>
                  <input id="pj-amount" inputMode="decimal" value={form.pay_amount} onChange={e => set({ pay_amount: e.target.value })} style={input} /></div>
                <div><label style={label} htmlFor="pj-max">{t('jobs.amountMax')}</label>
                  <input id="pj-max" inputMode="decimal" value={form.pay_max} onChange={e => set({ pay_max: e.target.value })} style={input} /></div>
                <div><label style={label} htmlFor="pj-per">{t('jobs.per')}</label>
                  <select id="pj-per" value={form.pay_per} onChange={e => set({ pay_per: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                    {PAY_PER.map(p => <option key={p} value={p}>{t(`jobs.perOpt.${p}`)}</option>)}
                  </select></div>
                <div><label style={label} htmlFor="pj-cur">{t('jobs.currency')}</label>
                  <select id="pj-cur" value={form.currency} onChange={e => set({ currency: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select></div>
              </div>
            )}
          </fieldset>
          <p style={hint}>{t('jobs.postPrivacy')}</p>
        </>}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving || !gig} style={btnPrimary}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} {t('jobs.publish')}
          </button>
          <button type="button" onClick={onClose} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
        </div>
      </form>
    </Modal>
  )
}

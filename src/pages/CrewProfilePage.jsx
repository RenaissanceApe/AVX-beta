import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Plus, X, CheckCircle, MapPin, Eye, Upload, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { FUNCTIONS, LANGUAGES, TRAVEL, MAX, travelKey, fromTravelKey, languageName, missing, toRow } from '../lib/crewProfile'
import { certStatus, proofPath, trustError } from '../lib/trust'
import { btn, btnPrimary, btnDanger, iconBtn, input, label, card, colors, tint } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import CrewProfileCard from '../components/CrewProfileCard'
import PlaceFinder from '../components/PlaceFinder'

const EMPTY = { enabled: false, visibility: 'companies', contact_from: 'any', job_alerts: true, headline: '', functions: [], other_functions: '', bio: '', base_place: null, base_country: null, base_lat: null, base_lng: null, travel_scope: 'km', travel_km: 100, languages: [], experience_years: '', links: ['', '', ''], certificates: [] }
const section = { ...card, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }
const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const h2 = { fontSize: '15px', fontWeight: 700 }

const fromRow = r => r ? {
  ...EMPTY, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)),
  links: [...(r.links || []), '', '', ''].slice(0, MAX.links),
  experience_years: r.experience_years ?? '',
} : EMPTY

// The person's crew profile (docs/CREW_NETWORK.md, N1): off until they switch it on; they choose
// who sees it (companies only, or companies and crew) and can change or remove it at any time.
//   /me/profile
export default function CrewProfilePage() {
  const { user, profile } = useAuth()
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const [addLang, setAddLang] = useState('')

  const [proofFor, setProofFor] = useState(null) // certificate id being uploaded
  const fileRef = useRef(null)
  const [suspended, setSuspended] = useState(false)

  // certsOnly: refresh the certificates' marks without dropping edits not saved yet
  const load = useCallback(async ({ certsOnly = false } = {}) => {
    const { data, error } = await supabase.from('crew_profiles').select('*').eq('user_id', user.id).maybeSingle()
    if (error) logger.error('crewProfile', error, { step: 'load' })
    const { suspended_at: sus, ...rest } = data || {}
    const f = fromRow(data ? rest : null)
    setSuspended(!!sus)
    if (certsOnly) {
      const marks = new Map(f.certificates.map(c => [c.id, c]))
      const same = (a, b) => a.name === b.name && (a.issuer || '') === (b.issuer || '') && (a.expires_on || '') === (b.expires_on || '')
      setForm(old => ({ ...old, certificates: old.certificates.map(c => marks.get(c.id) && same(marks.get(c.id), c) ? marks.get(c.id) : c) }))
      setSaved(old => JSON.stringify({ ...JSON.parse(old || '{}'), certificates: f.certificates }))
    } else {
      setForm(f); setSaved(JSON.stringify(f))
    }
  }, [user])
  useEffect(() => { if (user) load() }, [user, load])

  const set = patch => setForm(f => ({ ...f, ...patch }))
  const toggleFn = key => set({ functions: form.functions.includes(key) ? form.functions.filter(f => f !== key) : [...form.functions, key].slice(0, MAX.functions) })

  async function save(e) {
    e?.preventDefault()
    const { row, errors } = toRow(form)
    if (errors.length) return notify(t(`crewProfile.err.${errors[0]}`), 'error')
    setSaving(true)
    const { error } = await supabase.from('crew_profiles').upsert({ user_id: user.id, ...row })
    setSaving(false)
    if (error) { logger.error('crewProfile', error, { step: 'save' }); return notify(userMessage(error), 'error') }
    await load() // certificates come back with their ids and marks
    notify(row.enabled ? t('crewProfile.savedOn') : t('crewProfile.savedOff'), 'success')
    track(row.enabled ? 'crewProfile:on' : 'crewProfile:save')
  }

  // A proof for a saved certificate: the file goes to the private bucket, then AVX checks it
  async function sendProof(file) {
    const certId = proofFor
    setProofFor(null)
    if (!file || !certId) return
    if (file.size > 10 * 1024 * 1024) return notify(t('trust.proof.tooBig'), 'error')
    const path = proofPath(user.id, certId, file.name)
    const up = await supabase.storage.from('certificate-proofs').upload(path, file, { contentType: file.type || undefined })
    if (up.error) { logger.error('crewProfile', up.error, { step: 'proofUpload' }); return notify(userMessage(up.error), 'error') }
    const { error } = await supabase.rpc('submit_certificate_proof', { p_cert: certId, p_path: path })
    if (error) { logger.error('crewProfile', error, { step: 'proof' }); const k = trustError(error); return notify(k ? t(k) : userMessage(error), 'error') }
    notify(t('trust.proof.sent'), 'success')
    track('crewProfile:proof')
    load({ certsOnly: true })
  }

  async function remove() {
    if (!window.confirm(t('crewProfile.removeConfirm'))) return
    const { error } = await supabase.rpc('clear_crew_profile')
    if (error) { logger.error('crewProfile', error, { step: 'clear' }); return notify(userMessage(error), 'error') }
    setForm(EMPTY); setSaved(JSON.stringify(EMPTY))
    notify(t('crewProfile.removed'), 'success')
    track('crewProfile:removed')
  }

  if (!form) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>

  const changed = JSON.stringify(form) !== saved
  // A certificate as last saved (proofs and marks belong to that version)
  const savedCert = c => {
    const was = JSON.parse(saved || '{}').certificates?.find(x => x.id === c.id)
    return !!was && was.name === c.name && (was.expires_on || '') === (c.expires_on || '') ? was : null
  }
  const gaps = missing(form)
  const pressed = on => ({ ...btn, padding: '6px 11px', fontSize: '12px', background: on ? tint(colors.accent, 22) : 'transparent', borderColor: on ? colors.accent : tint(colors.accent, 30) })
  return (
    <AppShell>
      <form onSubmit={save} noValidate style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.4px' }}>{t('crewProfile.title')}</h1>
          <PageHelp page="crew-profile" />
        </div>
        <p style={{ ...hint, fontSize: '13px' }}>{t('crewProfile.intro')}</p>
        {suspended && (
          <p role="alert" style={{ ...card, padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', lineHeight: 1.5, borderColor: 'var(--warn)' }}>
            <AlertTriangle size={16} color="var(--warn)" style={{ flexShrink: 0, marginTop: '3px' }} aria-hidden="true" />
            <span>{t('trust.profileSuspended')} <Link to="/privacy" style={{ color: colors.accentText }}>{t('trust.privacyLink')}</Link></span>
          </p>
        )}

        <section style={section} aria-labelledby="cp-show">
          <h2 id="cp-show" style={h2}>{t('crewProfile.showTitle')}</h2>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="checkbox" checked={form.enabled} onChange={e => set({ enabled: e.target.checked })} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
            <span><span style={{ fontWeight: 600 }}>{t('crewProfile.enabled')}</span>
              <span style={{ display: 'block', ...hint, marginTop: '2px' }}>{form.enabled ? t('crewProfile.enabledOn') : t('crewProfile.enabledOff')}</span></span>
          </label>
          {form.enabled && gaps.length > 0 && <p role="alert" style={{ ...hint, color: colors.danger }}>{t('crewProfile.needs', { what: gaps.map(g => t(`crewProfile.need.${g}`)).join(', ') })}</p>}
          <div role="radiogroup" aria-labelledby="cp-who" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span id="cp-who" style={{ ...label, marginBottom: 0 }}>{t('crewProfile.who')}</span>
            {['companies', 'crew'].map(v => (
              <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                <input type="radio" name="cp-visibility" checked={form.visibility === v} onChange={() => set({ visibility: v })} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
                <span><span style={{ fontWeight: 600 }}>{t(`crewProfile.vis.${v}`)}</span>
                  <span style={{ display: 'block', ...hint, marginTop: '2px' }}>{t(`crewProfile.visHint.${v}`)}</span></span>
              </label>
            ))}
          </div>
          <div role="radiogroup" aria-labelledby="cp-contact" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span id="cp-contact" style={{ ...label, marginBottom: 0 }}>{t('trust.contact.who')}</span>
            {['any', 'known'].map(v => (
              <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
                <input type="radio" name="cp-contact" checked={(form.contact_from || 'any') === v} onChange={() => set({ contact_from: v })} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
                <span><span style={{ fontWeight: 600 }}>{t(`trust.contact.${v}`)}</span>
                  <span style={{ display: 'block', ...hint, marginTop: '2px' }}>{t(`trust.contact.${v}Hint`)}</span></span>
              </label>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '14px' }}>
            <input type="checkbox" checked={form.job_alerts !== false} onChange={e => set({ job_alerts: e.target.checked })} style={{ marginTop: '3px', accentColor: 'var(--accent)' }} />
            <span><span style={{ fontWeight: 600 }}>{t('crewProfile.jobAlerts')}</span>
              <span style={{ display: 'block', ...hint, marginTop: '2px' }}>{t('crewProfile.jobAlertsHint')}</span></span>
          </label>
          <p style={hint}>{t('crewProfile.never')}</p>
        </section>

        <section style={section} aria-labelledby="cp-work">
          <h2 id="cp-work" style={h2}>{t('crewProfile.workTitle')}</h2>
          <div>
            <span style={label} id="cp-functions">{t('crewProfile.functions')}</span>
            <div role="group" aria-labelledby="cp-functions" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {FUNCTIONS.map(f => <button key={f} type="button" aria-pressed={form.functions.includes(f)} onClick={() => toggleFn(f)} style={pressed(form.functions.includes(f))}>{t(`crewFn.${f}`)}</button>)}
            </div>
          </div>
          <div>
            <label style={label} htmlFor="cp-other">{t('crewProfile.otherFunctions')}</label>
            <input id="cp-other" value={form.other_functions || ''} onChange={e => set({ other_functions: e.target.value })} maxLength={MAX.other} placeholder={t('crewProfile.otherPlaceholder')} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="cp-headline">{t('crewProfile.headline')}</label>
            <input id="cp-headline" value={form.headline || ''} onChange={e => set({ headline: e.target.value })} maxLength={MAX.headline} placeholder={t('crewProfile.headlinePlaceholder')} style={input} />
          </div>
          <div style={{ maxWidth: '200px' }}>
            <label style={label} htmlFor="cp-years">{t('crewProfile.experience')}</label>
            <input id="cp-years" type="number" min={0} max={70} inputMode="numeric" value={form.experience_years} onChange={e => set({ experience_years: e.target.value })} style={input} />
          </div>
          <div>
            <label style={label} htmlFor="cp-bio">{t('crewProfile.bio')}</label>
            <textarea id="cp-bio" rows={4} value={form.bio || ''} onChange={e => set({ bio: e.target.value })} maxLength={MAX.bio} placeholder={t('crewProfile.bioPlaceholder')} style={{ ...input, resize: 'vertical' }} />
            <p style={hint}>{t('crewProfile.noRates')}</p>
          </div>
        </section>

        <section style={section} aria-labelledby="cp-where">
          <h2 id="cp-where" style={h2}>{t('crewProfile.whereTitle')}</h2>
          {form.base_place && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}><MapPin size={14} aria-hidden="true" /> <strong>{form.base_place}</strong></p>
          )}
          <PlaceFinder id="cp-place" label={form.base_place ? t('crewProfile.changeBase') : t('crewProfile.base')} hint={t('crewProfile.baseHint')}
            onChoose={p => set({ base_place: p.place, base_country: p.country, base_lat: p.lat, base_lng: p.lng })} />
          <div style={{ maxWidth: '320px' }}>
            <label style={label} htmlFor="cp-travel">{t('crewProfile.travelLabel')}</label>
            <select id="cp-travel" value={travelKey(form)} onChange={e => set(fromTravelKey(e.target.value))} style={{ ...input, cursor: 'pointer' }}>
              {TRAVEL.map(o => { const k = travelKey({ travel_scope: o.scope, travel_km: o.km }); return <option key={k} value={k}>{o.scope === 'km' ? t('crewProfile.travelKm', { km: o.km }) : t(`crewProfile.travel.${o.scope}`)}</option> })}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="cp-lang">{t('crewProfile.languages')}</label>
            {form.languages.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {form.languages.map(l => (
                  <li key={l} style={{ ...pressed(true), cursor: 'default' }}>{languageName(l, lang)}
                    <button type="button" onClick={() => set({ languages: form.languages.filter(x => x !== l) })} aria-label={t('crewProfile.removeLanguage', { name: languageName(l, lang) })} style={{ ...iconBtn, padding: 0, color: 'inherit' }}><X size={13} /></button>
                  </li>
                ))}
              </ul>
            )}
            <select id="cp-lang" value={addLang} onChange={e => { const v = e.target.value; if (v && !form.languages.includes(v)) set({ languages: [...form.languages, v].slice(0, MAX.languages) }); setAddLang('') }} style={{ ...input, cursor: 'pointer', maxWidth: '320px' }}>
              <option value="">{t('crewProfile.addLanguage')}</option>
              {LANGUAGES.filter(l => !form.languages.includes(l)).map(l => ({ l, n: languageName(l, lang) })).sort((a, b) => a.n.localeCompare(b.n, lang)).map(({ l, n }) => <option key={l} value={l}>{n}</option>)}
            </select>
          </div>
        </section>

        <section style={section} aria-labelledby="cp-certs">
          <h2 id="cp-certs" style={h2}>{t('crewProfile.certsTitle')}</h2>
          <p style={hint}>{t('crewProfile.certsHint')}</p>
          {form.certificates.map((c, i) => {
            const upd = patch => set({ certificates: form.certificates.map((x, j) => j === i ? { ...x, ...patch } : x) })
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr)) auto', gap: '8px', alignItems: 'end' }}>
                <div><label style={label} htmlFor={`cp-cert-${i}`}>{t('crewProfile.certName')}</label><input id={`cp-cert-${i}`} value={c.name || ''} onChange={e => upd({ name: e.target.value })} maxLength={100} placeholder="IPAF 3a" style={input} /></div>
                <div><label style={label} htmlFor={`cp-iss-${i}`}>{t('crewProfile.certIssuer')}</label><input id={`cp-iss-${i}`} value={c.issuer || ''} onChange={e => upd({ issuer: e.target.value })} maxLength={100} style={input} /></div>
                <div><label style={label} htmlFor={`cp-exp-${i}`}>{t('crewProfile.certExpires')}</label><input id={`cp-exp-${i}`} type="date" value={c.expires_on || ''} onChange={e => upd({ expires_on: e.target.value || undefined })} style={input} /></div>
                <button type="button" onClick={() => set({ certificates: form.certificates.filter((_, j) => j !== i) })} aria-label={t('crewProfile.removeCert', { name: c.name || '' })} style={{ ...iconBtn, padding: '10px' }}><X size={16} /></button>
                {c.id && <CertProof c={c} saved={savedCert(c)} onUpload={() => { setProofFor(c.id); fileRef.current?.click() }} />}
              </div>
            )
          })}
          <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden aria-hidden="true" tabIndex={-1}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; sendProof(f) }} />
          <p style={hint}>{t('trust.proof.hint')}</p>
          {form.certificates.length < MAX.certificates && (
            <div><button type="button" onClick={() => set({ certificates: [...form.certificates, { name: '' }] })} style={btn}><Plus size={14} /> {t('crewProfile.addCert')}</button></div>
          )}
        </section>

        <section style={section} aria-labelledby="cp-links">
          <h2 id="cp-links" style={h2}>{t('crewProfile.linksTitle')}</h2>
          {form.links.map((l, i) => (
            <div key={i}>
              <label style={label} htmlFor={`cp-link-${i}`}>{t('crewProfile.link', { n: i + 1 })}</label>
              <input id={`cp-link-${i}`} type="url" inputMode="url" value={l} onChange={e => set({ links: form.links.map((x, j) => j === i ? e.target.value : x) })} placeholder="https://" style={input} />
            </div>
          ))}
        </section>

        <div style={{ position: 'sticky', bottom: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', ...card, padding: '10px 12px' }}>
          <button type="submit" disabled={saving || !changed} style={btnPrimary}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={15} />} {t('common.saveChanges')}
          </button>
          <span role="status" style={hint}>{changed ? t('crewProfile.unsaved') : form.enabled ? t('crewProfile.statusOn') : t('crewProfile.statusOff')}</span>
        </div>

        <section aria-labelledby="cp-preview" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 id="cp-preview" style={{ ...h2, display: 'flex', alignItems: 'center', gap: '6px' }}><Eye size={15} aria-hidden="true" /> {t('crewProfile.preview')}</h2>
          <p style={hint}>{t(`crewProfile.previewHint.${form.visibility}`)}</p>
          <CrewProfileCard profile={{ ...toRow(form).row, certificates: form.certificates.filter(c => String(c.name || '').trim()) }} name={profile?.full_name} />
        </section>

        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '16px' }}>
          <button type="button" onClick={remove} style={btnDanger}>{t('crewProfile.remove')}</button>
          <p style={{ ...hint, marginTop: '6px' }}>{t('crewProfile.removeHint')}</p>
        </div>
      </form>
    </AppShell>
  )
}

// Under a saved certificate: how it stands, and a button to send a proof to AVX
function CertProof({ c, saved, onUpload }) {
  const { t } = useI18n()
  const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
  if (!saved) return <p style={{ ...hint, gridColumn: '1 / -1' }}>{t('trust.proof.saveFirst')}</p>
  const status = certStatus(saved)
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      <span style={{ ...hint, color: status === 'self' ? colors.muted : colors.accentText, fontWeight: status === 'self' ? 400 : 600 }}>
        {status === 'verified' ? t('trust.cert.verified')
          : status === 'confirmed' ? t('trust.cert.confirmedBy', { names: saved.confirmed_by.map(x => x.name).join(', ') })
          : t('crewProfile.selfDeclared')}
        {saved.proof_pending && <> · {t('trust.proof.pending')}</>}
      </span>
      {status !== 'verified' && (
        <button type="button" onClick={onUpload} style={{ ...btn, padding: '5px 10px', fontSize: '12px' }} aria-label={t(saved.proof_pending ? 'trust.proof.replaceNamed' : 'trust.proof.uploadNamed', { name: c.name })}>
          <Upload size={13} /> {saved.proof_pending ? t('trust.proof.replace') : t('trust.proof.upload')}
        </button>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Bookmark, BookmarkPlus, Bell, BellOff, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { toSaved } from '../lib/crewSearch'
import { useI18n } from '../i18n'
import { btn, iconBtn, input, label, colors, tint } from './ui'

const hint = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }

// Saved crew searches (docs/CREW_NETWORK.md, N5): an organisation keeps Find crew filters by name,
// runs them again with one tap, and (with the bell on) hears when a new profile fits.
//   <SavedCrewSearches orgId filters onApply={(saved) => …} openId={?search=…} />
export default function SavedCrewSearches({ orgId, filters, onApply, openId }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [list, setList] = useState([])
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [alert, setAlert] = useState(true)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('crew_saved_searches').select('id, name, filters, alert, created_at')
      .eq('org_id', orgId).is('removed_at', null).order('created_at')
    if (error) return logger.error('crewSearch', error, { step: 'saved' })
    setList(data || [])
  }, [orgId])
  useEffect(() => { load() }, [load])
  // Opened from an alert (?search=…): run that search once
  useEffect(() => {
    if (opened || !openId) return
    const s = list.find(x => x.id === openId)
    if (s) { setOpened(true); onApply(s) }
  }, [list, openId, opened, onApply])

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('crew_saved_searches').insert({ org_id: orgId, name: name.trim(), filters: toSaved(filters), alert })
    setBusy(false)
    if (error) {
      logger.error('crewSearch', error, { step: 'saveSearch' })
      return notify(/limit/i.test(error.message || '') ? t('crewSearch.saved.limit') : userMessage(error), 'error')
    }
    notify(t('crewSearch.saved.done', { name: name.trim() }), 'success')
    track('crew:saveSearch')
    setSaving(false); setName('')
    load()
  }

  async function update(s, patch, done) {
    const { error } = await supabase.from('crew_saved_searches').update(patch).eq('id', s.id)
    if (error) { logger.error('crewSearch', error, { step: 'updateSearch' }); return notify(userMessage(error), 'error') }
    if (done) notify(done, 'success')
    load()
  }

  const chip = { display: 'inline-flex', alignItems: 'center', borderRadius: '999px', border: `1px solid ${tint(colors.accent, 30)}`, overflow: 'hidden' }
  const part = { background: 'none', border: 'none', color: colors.text, font: 'inherit', fontSize: '13px', cursor: 'pointer', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }
  return (
    <section aria-labelledby="cs-saved" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <h2 id="cs-saved" style={{ ...label, marginBottom: 0 }}>{t('crewSearch.saved.title')}</h2>
        {!saving && <button type="button" onClick={() => setSaving(true)} style={{ ...btn, padding: '5px 10px', fontSize: '12px' }}><BookmarkPlus size={13} /> {t('crewSearch.saved.save')}</button>}
      </div>
      {list.length === 0 && !saving && <p style={hint}>{t('crewSearch.saved.none')}</p>}
      {list.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {list.map(s => (
            <li key={s.id} style={chip}>
              <button type="button" onClick={() => onApply(s)} style={{ ...part, fontWeight: 600 }} aria-label={t('crewSearch.saved.runNamed', { name: s.name })}>
                <Bookmark size={13} aria-hidden="true" /> {s.name}
              </button>
              <button type="button" aria-pressed={s.alert} onClick={() => update(s, { alert: !s.alert }, t(s.alert ? 'crewSearch.saved.alertOff' : 'crewSearch.saved.alertOn', { name: s.name }))}
                style={{ ...part, padding: '6px 8px', color: s.alert ? colors.accentText : colors.muted }} aria-label={t('crewSearch.saved.alertNamed', { name: s.name })}>
                {s.alert ? <Bell size={13} /> : <BellOff size={13} />}
              </button>
              <button type="button" onClick={() => { if (window.confirm(t('crewSearch.saved.removeConfirm', { name: s.name }))) update(s, { removed_at: new Date().toISOString() }, t('crewSearch.saved.removed', { name: s.name })) }}
                style={{ ...part, padding: '6px 8px', color: colors.muted }} aria-label={t('crewSearch.saved.removeNamed', { name: s.name })}>
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {saving && (
        <form onSubmit={save} noValidate style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={label} htmlFor="cs-save-name">{t('crewSearch.saved.name')}</label>
            <input id="cs-save-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder={t('crewSearch.saved.namePlaceholder')} style={input} autoFocus />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', padding: '10px 0' }}>
            <input type="checkbox" checked={alert} onChange={e => setAlert(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> {t('crewSearch.saved.alert')}
          </label>
          <button type="submit" disabled={busy || !name.trim()} style={btn}>{busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <BookmarkPlus size={14} />} {t('crewSearch.saved.confirm')}</button>
          <button type="button" onClick={() => setSaving(false)} style={{ ...iconBtn, padding: '10px' }} aria-label={t('common.cancel')}><X size={16} /></button>
          <p style={{ ...hint, flexBasis: '100%' }}>{t('crewSearch.saved.hint')}</p>
        </form>
      )}
    </section>
  )
}

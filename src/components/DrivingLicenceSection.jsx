// Settings → Profile: the categories on your driving licence (step 23, V1). Only you and the
// admins of organisations you belong to read them; planners get a yes/no for a vehicle.
import { useEffect, useState } from 'react'
import { CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { LICENCE_CATEGORIES, tidyCategories } from '../lib/transport'
import { useI18n } from '../i18n'
import { Hint } from './help/HelpParts'
import { AvxLoader, label } from './ui'

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

export default function DrivingLicenceSection({ style, smallBtn }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { notify } = useToast()
  const [saved, setSaved] = useState(null)
  const [picked, setPicked] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('driving_licences').select('categories').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (error) logger.error('licence', error, { step: 'load' })
      const list = tidyCategories(data?.categories)
      setSaved(list)
      setPicked(list)
    })
  }, [user])

  const toggle = c => setPicked(p => tidyCategories(p.includes(c) ? p.filter(x => x !== c) : [...p, c]))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('driving_licences').upsert({ user_id: user.id, categories: picked }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) {
      logger.error('licence', error, { step: 'save' })
      return notify(userMessage(error), 'error')
    }
    track('licence:save')
    setSaved(picked)
    notify(t('licence.saved'))
  }

  return (
    <form onSubmit={save} style={style}>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ ...label, display: 'flex', alignItems: 'center', gap: '4px' }}>{t('licence.title')} <Hint id="driving-licence" label={t('licence.title')} /></legend>
        <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '8px' }}>{t('licence.hint')}</p>
        {saved === null ? <AvxLoader size={14} /> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            {LICENCE_CATEGORIES.map(c => (
              <label key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={picked.includes(c)} onChange={() => toggle(c)} /> {c}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <button type="submit" disabled={saving || saved === null || same(saved, picked)} style={smallBtn}>
        {saving ? <AvxLoader size={14} /> : <CheckCircle size={14} />} {t('licence.save')}
      </button>
    </form>
  )
}

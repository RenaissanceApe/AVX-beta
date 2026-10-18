import { useEffect, useState } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { localToday } from '../lib/gigs'
import { useI18n } from '../i18n'
import { btn, iconBtn, input, label, colors } from './ui'

// Account → dates you can't work. Only you see the entries; production managers
// only get a "not available" warning when they add you to a gig on those dates.
export default function AvailabilitySection() {
  const { user } = useAuth()
  const { notify } = useToast()
  const { t, fmt } = useI18n()
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ start_date: '', end_date: '', note: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('crew_unavailability').select('*')
      .eq('user_id', user.id).gte('end_date', localToday()).order('start_date')
    if (error) return logger.error('availability', error, { step: 'load' })
    setItems(data || [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault()
    if (!form.start_date) return
    setSaving(true)
    const { error } = await supabase.from('crew_unavailability').insert({
      user_id: user.id, start_date: form.start_date, end_date: form.end_date || form.start_date, note: form.note.trim() || null,
    })
    setSaving(false)
    if (error) {
      logger.error('availability', error, { step: 'add' })
      return notify(/end_date/.test(error.message) ? t('error.dates') : userMessage(error), 'error')
    }
    setForm({ start_date: '', end_date: '', note: '' })
    load()
  }

  async function remove(id) {
    const { error } = await supabase.from('crew_unavailability').delete().eq('id', id)
    if (error) return notify(userMessage(error), 'error')
    setItems(list => list.filter(i => i.id !== id))
  }

  const range = i => (i.start_date === i.end_date ? fmt(i.start_date, 'd MMM yyyy') : `${fmt(i.start_date, 'd MMM')} – ${fmt(i.end_date, 'd MMM yyyy')}`)

  return (
    <div>
      <span style={label}>{t('availability.title')}</span>
      <p style={{ color: colors.muted, fontSize: '12px', marginBottom: '10px', lineHeight: 1.5 }}>{t('availability.hint')}</p>
      {items.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: '13px' }}>
          <span style={{ fontWeight: 600 }}>{range(i)}</span>
          {i.note && <span style={{ color: colors.muted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.note}</span>}
          <button onClick={() => remove(i.id)} aria-label={t('availability.remove', { range: range(i) })} style={{ ...iconBtn, marginLeft: 'auto' }}><X size={14} /></button>
        </div>
      ))}
      <form onSubmit={add} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', marginTop: '10px' }}>
        <label style={{ minWidth: 0, fontSize: '12px', color: colors.soft }}>{t('availability.from')}
          <input type="date" value={form.start_date} min={localToday()} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            style={{ ...input, marginTop: '4px' }} required />
        </label>
        <label style={{ minWidth: 0, fontSize: '12px', color: colors.soft }}>{t('availability.to')}
          <input type="date" value={form.end_date} min={form.start_date || localToday()} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
            style={{ ...input, marginTop: '4px' }} />
        </label>
        <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} maxLength={200}
          placeholder={t('availability.notePlaceholder')} aria-label={t('availability.note')} style={{ ...input, gridColumn: '1 / -1' }} />
        <button type="submit" disabled={saving || !form.start_date} style={{ ...btn, gridColumn: '1 / -1', justifyContent: 'center' }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} {t('availability.add')}
        </button>
      </form>
    </div>
  )
}

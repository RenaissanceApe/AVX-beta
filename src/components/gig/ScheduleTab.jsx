import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, MapPin, Printer, CalendarClock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { groupByDay, shortTime } from '../../lib/schedule'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, card, label, colors } from '../ui'

const EMPTY = { day: '', start_time: '', end_time: '', title: '', location: '', notes: '' }

// Running order for the gig: load-in, soundcheck, doors, show, load-out…
export default function ScheduleTab({ gig, items, canManage, onChanged, onOpenCallSheet }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const { t, fmt } = useI18n()
  const [editing, setEditing] = useState(null) // null | 'new' | item
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing === 'new') {
      const lastDay = items.length ? items[items.length - 1].day : null
      setForm({ ...EMPTY, day: lastDay || gig.start_date || '' })
    } else if (editing) {
      setForm({
        day: editing.day, start_time: shortTime(editing.start_time), end_time: shortTime(editing.end_time),
        title: editing.title, location: editing.location || '', notes: editing.notes || '',
      })
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e) {
    e.preventDefault()
    if (!form.day || !form.start_time || !form.title.trim()) return
    setSaving(true)
    const row = {
      day: form.day, start_time: form.start_time, end_time: form.end_time || null,
      title: form.title.trim(), location: form.location.trim() || null, notes: form.notes.trim() || null,
    }
    const { error } = editing === 'new'
      ? await supabase.from('gig_schedule').insert({ ...row, gig_id: gig.id, created_by: user.id })
      : await supabase.from('gig_schedule').update(row).eq('id', editing.id)
    setSaving(false)
    if (error) {
      logger.error('schedule', error, { step: editing === 'new' ? 'insert' : 'update', gigId: gig.id })
      return notify(/end_time/.test(error.message) ? t('schedule.endAfterStart') : userMessage(error), 'error')
    }
    setEditing(null)
    onChanged()
  }

  async function remove(item) {
    if (!window.confirm(t('schedule.confirmRemove', { title: item.title }))) return
    const { error } = await supabase.from('gig_schedule').delete().eq('id', item.id)
    if (error) {
      logger.error('schedule', error, { step: 'delete', gigId: gig.id })
      return notify(userMessage(error), 'error')
    }
    onChanged()
  }

  const groups = groupByDay(items)

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{t('gig.tab.schedule')}</h2>
          <p style={{ color: colors.muted, fontSize: '13px' }}>{t('schedule.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onOpenCallSheet} style={btn}><Printer size={14} /> {t('schedule.callSheet')}</button>
          {canManage && <button onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> {t('schedule.add')}</button>}
        </div>
      </div>

      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.muted }}>
          <CalendarClock size={28} color={colors.accent} style={{ marginBottom: '12px' }} />
          <p style={{ fontSize: '14px' }}>{canManage ? t('schedule.emptyManager') : t('schedule.empty')}</p>
        </div>
      ) : groups.map(g => (
        <section key={g.day} style={{ marginBottom: '22px' }}>
          <h3 style={{ ...label, marginBottom: '10px' }}>{fmt(g.day, 'EEEE, d MMMM yyyy')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {g.items.map(item => (
              <div key={item.id} style={{ ...card, display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: colors.accent, minWidth: '92px', fontSize: '14px' }}>
                  {shortTime(item.start_time)}{item.end_time ? `–${shortTime(item.end_time)}` : ''}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{item.title}</div>
                  {item.location && <div style={{ fontSize: '13px', color: colors.muted, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}><MapPin size={12} /> {item.location}</div>}
                  {item.notes && <div style={{ fontSize: '13px', color: colors.soft, marginTop: '4px', whiteSpace: 'pre-wrap' }}>{item.notes}</div>}
                </div>
                {canManage && (
                  <div style={{ display: 'flex' }}>
                    <button onClick={() => setEditing(item)} aria-label={t('schedule.editNamed', { title: item.title })} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>
                    <button onClick={() => remove(item)} aria-label={t('schedule.removeNamed', { title: item.title })} title={t('crew.remove')} style={iconBtn}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {editing && (
        <Modal title={editing === 'new' ? t('schedule.addTitle') : t('schedule.editTitle')} onClose={() => setEditing(null)}>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={label} htmlFor="sch-title">{t('schedule.what')} *</label>
              <input id="sch-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder={t('schedule.whatPlaceholder')} maxLength={200} style={input} autoFocus required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: '8px' }}>
              <div>
                <label style={label} htmlFor="sch-day">{t('schedule.day')} *</label>
                <input id="sch-day" type="date" value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value }))} style={input} required />
              </div>
              <div>
                <label style={label} htmlFor="sch-start">{t('schedule.start')} *</label>
                <input id="sch-start" type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={input} required />
              </div>
              <div>
                <label style={label} htmlFor="sch-end">{t('schedule.end')}</label>
                <input id="sch-end" type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={input} />
              </div>
            </div>
            <div>
              <label style={label} htmlFor="sch-loc">{t('schedule.where')}</label>
              <input id="sch-loc" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder={t('schedule.wherePlaceholder')} maxLength={200} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="sch-notes">{t('schedule.notes')}</label>
              <textarea id="sch-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3} maxLength={1000} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, justifyContent: 'center' }}>
              {saving && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />} {t('common.save')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

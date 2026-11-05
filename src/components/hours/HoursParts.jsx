// Shared pieces of time registration (step 8): the form for one day, a day's row and its status.
import { useState } from 'react'
import { Loader2, Check, CloudOff } from 'lucide-react'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveHours } from '../../lib/hours'
import { prefillTimes, spanMinutes } from '../../lib/timeRegistration'
import { bookedDays } from '../../lib/crewRates'
import { formatMoney } from '../../lib/quotes'
import { useI18n, fmt } from '../../i18n'
import { HintLabel } from '../help/HelpParts'
import { Modal, btnPrimary, input, label, colors, StatusBadge } from '../ui'

export const hoursText = (h, lang) => `${Number(h || 0).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 2 })} h`
export const money = (v, lang) => formatMoney(v, 'EUR', lang)
export const workedHours = e => {
  const span = spanMinutes(e.start_time, e.end_time)
  return span == null ? 0 : Math.max(0, span - (Number(e.break_minutes) || 0)) / 60
}

const STATUS_TONE = { submitted: 'open', approved: 'ok', returned: 'danger', queued: 'off' }
export function StatusChip({ status }) {
  const { t } = useI18n()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {status === 'queued' && <CloudOff size={12} color={colors.muted} aria-hidden="true" />}
      <StatusBadge small tone={STATUS_TONE[status] || 'open'}>{t(`hours.status.${status}`)}</StatusBadge>
    </span>
  )
}

// One day: "Fri 4 Dec · 14:00–02:00 · 1 h break · 11 h" with travel and km when logged
export function DayLine({ entry }) {
  const { t, lang } = useI18n()
  const parts = [`${String(entry.start_time).slice(0, 5)}–${String(entry.end_time).slice(0, 5)}`]
  if (Number(entry.break_minutes)) parts.push(t('hours.breakShort', { count: Number(entry.break_minutes) }))
  if (Number(entry.travel_minutes)) parts.push(t('hours.travelShort', { count: Number(entry.travel_minutes) }))
  if (Number(entry.km)) parts.push(`${Number(entry.km).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')} km`)
  return (
    <span style={{ minWidth: 0 }}>
      <span style={{ fontWeight: 600 }}>{fmt(new Date(`${entry.work_date}T12:00:00`), 'EEE d MMM')}</span>
      <span style={{ color: colors.muted }}> · {parts.join(' · ')}</span>
      <span style={{ fontWeight: 700, marginLeft: '6px' }}>{hoursText(entry.split?.worked ?? workedHours(entry), lang)}</span>
    </span>
  )
}

// The hours split stored at approval (or worked out for a preview)
export function SplitLine({ split, cost }) {
  const { t, lang } = useI18n()
  if (!split) return null
  const parts = ['normal', 'overtime', 'night', 'weekend', 'holiday'].filter(b => Number(split[b]) > 0).map(b => `${t(`hours.bucket.${b}`)} ${hoursText(split[b], lang)}`)
  return (
    <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>
      {parts.join(' · ')}{cost != null && <> · <strong style={{ color: 'var(--text)' }}>{money(cost, lang)}</strong></>}
    </span>
  )
}

const today = () => fmt(new Date(), 'yyyy-MM-dd')

// The form for one day. New days start from the person's booking or the gig's schedule.
export function HoursModal({ gig, member, entry, schedule, userId, takenDays = [], people, onClose, onSaved }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [who, setWho] = useState(member?.user_id || people?.[0]?.user_id || userId)
  const whoMember = people?.find(p => p.user_id === who) || member
  const firstFree = () => {
    const days = bookedDays(whoMember, gig)
    return days.find(d => !takenDays.includes(`${who}:${d}`)) || (days.includes(today()) ? today() : days[0]) || today()
  }
  const [day, setDay] = useState(entry?.work_date || firstFree())
  const pre = entry ? null : prefillTimes(whoMember, schedule, day)
  const [form, setForm] = useState({
    start_time: entry ? String(entry.start_time).slice(0, 5) : pre.start_time,
    end_time: entry ? String(entry.end_time).slice(0, 5) : pre.end_time,
    break_minutes: String(entry?.break_minutes ?? 0), travel_minutes: String(entry?.travel_minutes ?? 0),
    km: String(entry?.km ?? 0).replace('.', ','), note: entry?.note || '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const changeDay = d => {
    setDay(d)
    if (!entry) { const p = prefillTimes(whoMember, schedule, d); setForm(f => ({ ...f, start_time: p.start_time || f.start_time, end_time: p.end_time || f.end_time })) }
  }
  const span = spanMinutes(form.start_time, form.end_time)
  const brk = Number(form.break_minutes) || 0
  const km = Number(String(form.km).replace(',', '.'))
  const taken = !entry && takenDays.includes(`${who}:${day}`)
  const ok = !!day && span != null && span < 1440 && span > 0 && brk >= 0 && brk < span && Number.isFinite(km) && km >= 0 && !taken

  async function save(e) {
    e.preventDefault()
    if (!ok) return
    setSaving(true)
    try {
      const { queued } = await saveHours(userId, {
        id: entry?.id, isNew: !entry, gig_id: gig.id, user_id: who, work_date: day, ...form, km, gig_name: gig.name,
      })
      track(queued ? 'hours:queued' : 'hours:save')
      if (queued) notify(t('hours.queued'))
      onSaved()
    } catch (error) {
      logger.error('hours', error, { step: 'save' })
      notify(userMessage(error), 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title={entry ? t('hours.editTitle') : t('hours.logTitle')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {people && !entry && (
          <div>
            <label htmlFor="hours-who" style={label}>{t('hours.person')}</label>
            <select id="hours-who" value={who} onChange={e => setWho(e.target.value)} style={{ ...input, appearance: 'auto' }}>
              {people.map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="hours-day" style={label}>{t('hours.day')}</label>
          <input id="hours-day" type="date" value={day} disabled={!!entry} onChange={e => changeDay(e.target.value)} style={input} required />
          {taken && <p role="alert" style={{ fontSize: '12px', color: colors.danger, margin: '4px 0 0' }}>{t('hours.dayTaken')}</p>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
          <div>
            <label htmlFor="hours-start" style={label}>{t('hours.start')}</label>
            <input id="hours-start" type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} style={input} required />
          </div>
          <div>
            <HintLabel htmlFor="hours-end" hint="hours-end">{t('hours.end')}</HintLabel>
            <input id="hours-end" type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} style={input} required />
          </div>
          <div>
            <label htmlFor="hours-break" style={label}>{t('hours.breakMinutes')}</label>
            <input id="hours-break" type="number" inputMode="numeric" min="0" max="720" step="5" value={form.break_minutes} onChange={e => set('break_minutes', e.target.value)} style={input} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '10px' }}>
          <div>
            <HintLabel htmlFor="hours-travel" hint="hours-travel">{t('hours.travelMinutes')}</HintLabel>
            <input id="hours-travel" type="number" inputMode="numeric" min="0" max="1440" step="5" value={form.travel_minutes} onChange={e => set('travel_minutes', e.target.value)} style={input} />
          </div>
          <div>
            <label htmlFor="hours-km" style={label}>{t('hours.km')}</label>
            <input id="hours-km" inputMode="decimal" value={form.km} onChange={e => set('km', e.target.value)} style={input} />
          </div>
        </div>
        <div>
          <label htmlFor="hours-note" style={label}>{t('hours.note')}</label>
          <input id="hours-note" value={form.note} maxLength={500} onChange={e => set('note', e.target.value)} style={input} />
        </div>
        {span != null && brk < span && (
          <p style={{ fontSize: '14px', margin: 0 }}>
            {t('hours.worked')}: <strong>{hoursText((span - brk) / 60, lang)}</strong>
            {form.end_time && form.start_time && form.end_time <= form.start_time && <span style={{ color: colors.muted }}> · {t('hours.pastMidnight')}</span>}
          </p>
        )}
        {entry?.status === 'returned' && entry.review_note && (
          <p style={{ fontSize: '13px', margin: 0, color: colors.danger }}>{t('hours.returnedNote', { note: entry.review_note })}</p>
        )}
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, margin: 0 }}>{t('hours.formHint')}</p>
        <button type="submit" disabled={saving || !ok} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {entry ? t('common.save') : t('hours.send')}
        </button>
      </form>
    </Modal>
  )
}

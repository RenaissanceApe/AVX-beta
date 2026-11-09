// Shared pieces of leave requests (step 9): the type and status chips and the form to ask for
// leave (or, for an admin, to enter it for someone).
import { useEffect, useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { localToday } from '../../lib/gigs'
import { LEAVE_TYPES, DEFAULT_WEEK, leaveDays, leaveError, requestLeave } from '../../lib/leave'
import { useI18n } from '../../i18n'
import { HintLabel, Hint } from '../help/HelpParts'
import { Modal, btnPrimary, input, label, colors, StatusBadge, LabelChip, AvxLoader } from '../ui'

// Leave types are labels: a square in the type's colour + its word
const TYPE_COLOUR = { holiday: 'green', sick: 'red', training: 'orange', other: 'grey', away: 'grey' }
export function TypeChip({ type }) {
  const { t } = useI18n()
  return <LabelChip colour={TYPE_COLOUR[type] || 'grey'}>{t(`leave.type.${type}`)}</LabelChip>
}

const STATUS_TONE = { requested: 'open', approved: 'ok', refused: 'danger', cancelled: 'off' }
export function LeaveStatusChip({ status }) {
  const { t } = useI18n()
  return <StatusBadge small tone={STATUS_TONE[status] || 'open'} struck={status === 'cancelled'}>{t(`leave.status.${status}`)}</StatusBadge>
}

export const daysText = (n, lang) => Number(n || 0).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 1 })

// The form. orgId: the organisation the leave is for (null: a freelancer's own dates).
// people: [{ user_id, full_name }] when an admin may enter leave for someone else.
export function LeaveForm({ orgId, people, onSaved, onClose }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const [form, setForm] = useState({ who: user.id, type: 'holiday', from: '', to: '', startHalf: false, endHalf: false, note: '' })
  const [week, setWeek] = useState(DEFAULT_WEEK)
  const [holidays, setHolidays] = useState([])
  const [saving, setSaving] = useState(false)
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const forSomeoneElse = form.who !== user.id
  const oneDay = !form.to || form.to === form.from

  // The person's working week and the organisation's holidays, for the day count
  useEffect(() => {
    if (!orgId) return
    let live = true
    Promise.all([
      supabase.from('staff_work_weeks').select('days').eq('org_id', orgId).eq('user_id', form.who).maybeSingle(),
      supabase.from('org_holidays').select('day, removed_at').eq('org_id', orgId).is('removed_at', null).limit(500),
    ]).then(([w, h]) => {
      if (!live) return
      setWeek(w.data?.days?.length ? w.data.days : DEFAULT_WEEK)
      setHolidays(h.data || [])
    })
    return () => { live = false }
  }, [orgId, form.who])

  const days = useMemo(() => leaveDays({ from: form.from, to: form.to, startHalf: form.startHalf, endHalf: form.endHalf, week, holidays, org: !!orgId }),
    [form.from, form.to, form.startHalf, form.endHalf, week, holidays, orgId])
  // Sick days (and anything an admin enters) can be in the past; requests start from today
  const pastAllowed = orgId && (form.type === 'sick' || forSomeoneElse)
  const min = pastAllowed ? undefined : localToday()
  const needsApproval = orgId && form.type !== 'sick' && !forSomeoneElse

  async function submit(e) {
    e.preventDefault()
    if (!form.from) return
    setSaving(true)
    try {
      const row = await requestLeave({ userId: form.who, orgId, type: form.type, from: form.from, to: form.to || form.from,
        startHalf: form.startHalf, endHalf: oneDay ? form.endHalf && !form.startHalf : form.endHalf, note: form.note })
      track(orgId ? `leave:${row.status}` : 'leave:own')
      notify(row.status === 'requested' ? t('leave.sent') : t('leave.saved'), 'success')
      onSaved?.()
      onClose()
    } catch (error) {
      logger.error('leave', error, { step: 'request' })
      notify(leaveError(error, t) || userMessage(error), 'error')
      setSaving(false)
    }
  }

  const field = { minWidth: 0, fontSize: '13px', color: colors.soft, display: 'flex', flexDirection: 'column', gap: '4px' }
  return (
    <Modal title={orgId ? (forSomeoneElse ? t('leave.addForTitle') : t('leave.askTitle')) : t('availability.add')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
        {people?.length > 0 && (
          <label style={{ ...field, gridColumn: '1 / -1' }}>{t('leave.who')}
            <select value={form.who} onChange={e => set({ who: e.target.value })} style={input}>
              {people.map(p => <option key={p.user_id} value={p.user_id}>{p.user_id === user.id ? t('leave.me') : p.full_name || '—'}</option>)}
            </select>
          </label>
        )}
        <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
          <HintLabel htmlFor="leave-type" hint="leave-type">{t('leave.typeLabel')}</HintLabel>
          <select id="leave-type" value={form.type} onChange={e => set({ type: e.target.value })} style={input}>
            {LEAVE_TYPES.map(type => <option key={type} value={type}>{t(`leave.type.${type}`)}</option>)}
          </select>
        </div>
        <label style={field}>{t('availability.from')}
          <input type="date" required value={form.from} min={min}
            onChange={e => set({ from: e.target.value, to: form.to && form.to < e.target.value ? '' : form.to })} style={input} />
        </label>
        <label style={field}>{t('availability.to')}
          <input type="date" value={form.to} min={form.from || min} onChange={e => set({ to: e.target.value })} style={input} />
        </label>
        {orgId && (
          <fieldset style={{ gridColumn: '1 / -1', border: 'none', padding: 0, margin: 0, display: 'flex', gap: '8px 16px', flexWrap: 'wrap', fontSize: '13px' }}>
            <legend style={{ ...label, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>{t('leave.halfDays')} <Hint id="leave-half" label={t('leave.halfDays')} /></legend>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={form.startHalf} onChange={e => set({ startHalf: e.target.checked, endHalf: oneDay && e.target.checked ? false : form.endHalf })} />
              {oneDay ? t('leave.afternoonOnly') : t('leave.startAfternoon')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={form.endHalf} onChange={e => set({ endHalf: e.target.checked, startHalf: oneDay && e.target.checked ? false : form.startHalf })} />
              {oneDay ? t('leave.morningOnly') : t('leave.endMorning')}
            </label>
          </fieldset>
        )}
        <input value={form.note} onChange={e => set({ note: e.target.value })} maxLength={200}
          placeholder={orgId ? t('leave.notePlaceholder') : t('availability.notePlaceholder')} aria-label={t('availability.note')}
          style={{ ...input, gridColumn: '1 / -1' }} />
        {form.from && (
          <p style={{ gridColumn: '1 / -1', fontSize: '13px', margin: 0 }}>
            <strong>{t(orgId ? 'leave.workingDays' : 'leave.calendarDays', { count: days, days: daysText(days, lang) })}</strong>
            <span style={{ color: colors.muted }}> · {needsApproval ? t('leave.needsApproval') : orgId && form.type === 'sick' && !forSomeoneElse ? t('leave.sickNow') : orgId ? t('leave.approvedNow') : t('availability.hint')}</span>
          </p>
        )}
        <button type="submit" disabled={saving || !form.from} style={{ ...btnPrimary, gridColumn: '1 / -1', justifyContent: 'center' }}>
          {saving ? <AvxLoader size={14} /> : <Send size={14} />} {needsApproval ? t('leave.send') : t('leave.save')}
        </button>
      </form>
    </Modal>
  )
}

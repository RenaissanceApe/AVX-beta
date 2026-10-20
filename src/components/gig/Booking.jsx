import { useEffect, useState } from 'react'
import { AlertTriangle, MessageCircleQuestion, Loader2, Send, Check, X, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { clashText, rangeText, dayRange } from '../../lib/clashes'
import { useI18n, t } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, colors } from '../ui'
import { Term } from '../help/HelpParts'

export const AMBER = 'var(--warn)'
const box = {
  marginTop: '8px', padding: '9px 11px', borderRadius: '9px', background: 'color-mix(in srgb, var(--warn) 8%, transparent)',
  border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)', fontSize: '12px', color: AMBER, lineHeight: 1.6,
}
const smallBtn = { ...btn, padding: '5px 10px', fontSize: '12px' }

// The warning shown next to someone who is booked elsewhere (or unavailable) during
// their time on this gig, with the state of any "are you available?" request.
export function ClashBox({ name, clashes, request, canAsk, onAsk, onWithdraw }) {
  const { ago } = useI18n()
  const booked = clashes.some(c => c.kind === 'booked')
  return (
    <div role="status" style={box}>
      <strong style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
        {booked ? t('clash.advice', { name }) : t('clash.unavailableAdvice', { name })}
      </strong>
      {clashes.map((c, i) => <div key={i} style={{ paddingLeft: '18px' }}>{clashText(c)}</div>)}
      <RequestState request={request} ago={ago} />
      {canAsk && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', paddingLeft: '18px' }}>
          {request?.status === 'pending' ? (
            <button type="button" onClick={onWithdraw} style={{ ...smallBtn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft }}>
              {t('ask.withdraw')}
            </button>
          ) : (
            <button type="button" onClick={onAsk} style={{ ...smallBtn, color: AMBER, borderColor: 'color-mix(in srgb, var(--warn) 40%, transparent)', background: 'color-mix(in srgb, var(--warn) 10%, transparent)' }}>
              <MessageCircleQuestion size={13} /> {request ? t('ask.again') : t('ask.button')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function RequestState({ request, ago }) {
  if (!request) return null
  const note = request.reply_note ? `: “${request.reply_note}”` : ''
  const line = {
    pending: [colors.soft, null, t('ask.pending', { when: ago(request.created_at) })],
    available: [colors.accent, <Check key="i" size={12} />, t('ask.saidAvailable', { when: ago(request.replied_at || request.created_at) }) + note],
    unavailable: [colors.danger, <X key="i" size={12} />, t('ask.saidUnavailable', { when: ago(request.replied_at || request.created_at) }) + note],
    withdrawn: [colors.muted, null, t('ask.withdrawn')],
  }[request.status]
  if (!line) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: line[0], marginTop: '4px', paddingLeft: '18px' }}>
      {line[1]}{line[2]}
    </div>
  )
}

// "Are you available?" — notifies the person, who answers from My work
export function AskAvailabilityModal({ gigId, personId, name, clashes = [], onClose, onSent }) {
  const { notify } = useToast()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function send(e) {
    e.preventDefault()
    setSending(true)
    const { error } = await supabase.from('availability_requests').insert({ gig_id: gigId, person_id: personId, message: message.trim() || null })
    setSending(false)
    if (error?.code === '23505') return notify(t('ask.alreadyAsked', { name }), 'info')
    if (error) {
      logger.error('crew', error, { step: 'askAvailability', gigId })
      return notify(userMessage(error), 'error')
    }
    track('crew:availability-asked')
    notify(t('ask.sent', { name }), 'success')
    onSent?.()
    onClose()
  }

  return (
    <Modal title={t('ask.title', { name })} onClose={onClose}>
      <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6 }}>{t('ask.intro')}</p>
        {clashes.length > 0 && (
          <div style={{ ...box, marginTop: 0 }}>
            {clashes.map((c, i) => <div key={i}>{clashText(c)}</div>)}
          </div>
        )}
        <div>
          <label style={label} htmlFor="ask-message">{t('ask.message')}</label>
          <textarea id="ask-message" value={message} onChange={e => setMessage(e.target.value)} maxLength={500} rows={3}
            placeholder={t('ask.messagePlaceholder')} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} autoFocus />
        </div>
        <button type="submit" disabled={sending} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {sending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={15} />} {t('ask.send')}
        </button>
      </form>
    </Modal>
  )
}

// datetime-local works in local time without a zone
const pad = n => String(n).padStart(2, '0')
export function toLocalInput(value) {
  if (!value) return ''
  const d = new Date(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = value => (value ? new Date(value).toISOString() : null)

// Booking times for one person on this gig. Without them they're booked for the gig's whole days.
export function ShiftModal({ gig, member, name, onClose, onSaved }) {
  const { notify } = useToast()
  const day = gig.start_date || new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(toLocalInput(member.booked_from) || `${day}T09:00`)
  const [until, setUntil] = useState(toLocalInput(member.booked_until) || `${gig.end_date || day}T18:00`)
  const [saving, setSaving] = useState(false)
  const invalid = !from || !until || new Date(until) <= new Date(from)

  async function save(values) {
    setSaving(true)
    const { error } = await supabase.from('gig_members').update(values).eq('gig_id', gig.id).eq('user_id', member.user_id)
    setSaving(false)
    if (error) {
      logger.error('crew', error, { step: 'shift', gigId: gig.id })
      return notify(userMessage(error), 'error')
    }
    track(values.booked_from ? 'crew:shift-set' : 'crew:shift-cleared')
    onSaved()
    onClose()
  }

  return (
    <Modal title={t('shift.title', { name })} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (!invalid) save({ booked_from: fromLocalInput(from), booked_until: fromLocalInput(until) }) }}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6 }}>{t('shift.intro')}</p>
        <p style={{ fontSize: '12px', color: colors.muted }}>{t('help.seeAlso')} <Term id="booking-times" /> · <Term id="double-booking" /></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
          <div>
            <label style={label} htmlFor="shift-from">{t('shift.from')}</label>
            <input id="shift-from" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} style={input} required />
          </div>
          <div>
            <label style={label} htmlFor="shift-until">{t('shift.until')}</label>
            <input id="shift-until" type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} style={input} required />
          </div>
        </div>
        {invalid && from && until && <p role="alert" style={{ fontSize: '12px', color: colors.danger }}>{t('shift.invalid')}</p>}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving || invalid} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Clock size={15} />} {t('shift.save')}
          </button>
          {member.booked_from && (
            <button type="button" disabled={saving} onClick={() => save({ booked_from: null, booked_until: null })}
              style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft }}>
              {t('shift.clear')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}

export const shiftText = member => (member.booked_from && member.booked_until ? rangeText(member.booked_from, member.booked_until) : null)

// In the gig form: your own bookings on the dates being entered. A warning only;
// the gig can still be saved.
export function OwnClashWarning({ startDate, endDate, excludeGig = null }) {
  const [clashes, setClashes] = useState([])
  useEffect(() => {
    const range = dayRange(startDate, endDate)
    if (!range) return setClashes([])
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('my_clashes', { p_from: range.from, p_until: range.until, p_exclude_gig: excludeGig })
      if (cancelled) return
      if (error) return logger.warn('gig', 'Own clash check failed', { step: 'myClashes' })
      setClashes(data || [])
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [startDate, endDate, excludeGig])
  if (!clashes.length) return null
  return (
    <div role="status" style={{ ...box, marginTop: 0 }}>
      <strong style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} /> {t('clash.selfWarning')}
      </strong>
      {clashes.map((c, i) => <div key={i} style={{ paddingLeft: '18px' }}>{clashText(c)}</div>)}
    </div>
  )
}

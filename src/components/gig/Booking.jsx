import { useEffect, useState } from 'react'
import { AlertTriangle, MessageCircleQuestion, Send, Check, X, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { clashText, rangeText, dayRange } from '../../lib/clashes'
import { useI18n, t } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, colors, AvxLoader } from '../ui'
import { Term } from '../help/HelpParts'

export const AMBER = 'var(--warn)'
// The sentence under a person's name: what and where, and what to do. The icon carries the colour
// (danger for a booking clash, warn for a self-reported unavailability); the words stay in text colour.
const box = { marginTop: '8px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }
const smallBtn = { ...btn, padding: '4px 12px', fontSize: '13px' }

// The warning shown next to someone who is booked elsewhere (or unavailable) during
// their time on this gig, with the state of any "are you available?" request.
export function ClashBox({ name, clashes, request, canAsk, onAsk, onWithdraw }) {
  const { ago } = useI18n()
  const booked = clashes.some(c => c.kind === 'booked')
  return (
    <div role="status" style={box}>
      <strong style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontWeight: 600 }}>
        <AlertTriangle size={14} aria-hidden="true" color={booked ? 'var(--danger)' : AMBER} style={{ flexShrink: 0, marginTop: '2px' }} />
        {booked ? t('clash.advice', { name }) : t('clash.unavailableAdvice', { name })}
      </strong>
      {clashes.map((c, i) => <div key={i} style={{ paddingLeft: '20px', color: 'var(--text-2)' }}>{clashText(c)}</div>)}
      <RequestState request={request} ago={ago} />
      {canAsk && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px', paddingLeft: '20px' }}>
          {request?.status === 'pending' ? (
            <button type="button" onClick={onWithdraw} style={{ ...smallBtn, color: 'var(--text-2)' }}>
              {t('ask.withdraw')}
            </button>
          ) : (
            <button type="button" onClick={onAsk} style={smallBtn}>
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
          {sending ? <AvxLoader size={15} /> : <Send size={15} />} {t('ask.send')}
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
        <p style={{ fontSize: '13px', color: colors.muted }}>{t('help.seeAlso')} <Term id="booking-times" /> · <Term id="double-booking" /></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
          <div>
            <label style={label} htmlFor="shift-from">{t('shift.from')}</label>
            <input id="shift-from" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} style={input} required />
          </div>
          <div>
            <label style={label} htmlFor="shift-until">{t('shift.until')}</label>
            <input id="shift-until" type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} style={input} required />
          </div>
        </div>
        {invalid && from && until && <p role="alert" style={{ fontSize: '13px', color: colors.danger }}>{t('shift.invalid')}</p>}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving || invalid} style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }}>
            {saving ? <AvxLoader size={15} /> : <Clock size={15} />} {t('shift.save')}
          </button>
          {member.booked_from && (
            <button type="button" disabled={saving} onClick={() => save({ booked_from: null, booked_until: null })}
              style={{ ...btn, background: 'transparent', borderColor: 'var(--line-strong)', color: colors.soft }}>
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
    <div role="status" style={{ ...box, marginTop: 0, padding: '10px 12px', border: '1px solid var(--warn)', background: 'var(--warn-soft)' }}>
      <strong style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontWeight: 600 }}>
        <AlertTriangle size={14} aria-hidden="true" color={AMBER} style={{ flexShrink: 0, marginTop: '2px' }} /> {t('clash.selfWarning')}
      </strong>
      {clashes.map((c, i) => <div key={i} style={{ paddingLeft: '20px', color: 'var(--text-2)' }}>{clashText(c)}</div>)}
    </div>
  )
}

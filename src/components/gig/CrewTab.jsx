import { useEffect, useState } from 'react'
import { UserPlus, X, Clock, Phone, Loader2, Send, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { sendInvite, inviteMessage } from '../../lib/invites'
import { shortTime } from '../../lib/schedule'
import { useI18n, t } from '../../i18n'
import { Modal, btnPrimary, iconBtn, input, label, colors } from '../ui'
import { Avatar, RoleBadge, TabHeader } from './parts'

// One-line description of a clash, e.g. "Busy 2–3 Nov (Other gig)" / "Not available 5 Nov"
export function conflictText(c, fmt) {
  const range = c.start_date === c.end_date ? fmt(c.start_date, 'd MMM') : `${fmt(c.start_date, 'd MMM')}–${fmt(c.end_date, 'd MMM')}`
  return c.kind === 'unavailable'
    ? t('availability.conflictUnavailable', { range })
    : c.label ? t('availability.conflictBookedNamed', { range, gig: c.label }) : t('availability.conflictBooked', { range })
}

export default function CrewTab({ gigId, gigDatesKey, members, invites, isPM, userId, nameOf, phoneOf, onChanged, onLeft, showInvite, setShowInvite }) {
  const { fmt } = useI18n()
  const { notify } = useToast()
  const [conflicts, setConflicts] = useState({}) // user_id -> [conflict]

  // Managers see who is booked elsewhere or unavailable on this gig's dates
  useEffect(() => {
    if (!isPM) return
    supabase.rpc('gig_crew_conflicts', { p_gig: gigId }).then(({ data, error }) => {
      if (error) return logger.error('crew', error, { step: 'conflicts', gigId })
      const map = {}
      for (const c of data || []) (map[c.user_id] ||= []).push(c)
      setConflicts(map)
    })
  }, [gigId, isPM, members.length, gigDatesKey])

  async function removeMember(member) {
    const self = member.user_id === userId
    if (!window.confirm(self ? t('crew.confirmLeave') : t('crew.confirmRemove', { name: nameOf(member.user_id) }))) return
    const { error } = await supabase.from('gig_members').delete().eq('gig_id', gigId).eq('user_id', member.user_id)
    if (error) {
      logger.error('crew', error, { step: 'remove', gigId })
      return notify(t('crew.removeFailed', { reason: userMessage(error) }), 'error')
    }
    if (self) return onLeft()
    notify(t('crew.removed', { name: nameOf(member.user_id) }), 'success')
    onChanged()
  }

  async function cancelInvite(inv) {
    const { error } = await supabase.from('gig_invites').delete().eq('id', inv.id)
    if (error) return notify(userMessage(error), 'error')
    onChanged()
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('gig.tab.crew')} subtitle={t('crew.count', { count: members.length })}
        action={isPM && <button onClick={() => setShowInvite(true)} style={btnPrimary}><UserPlus size={14} /> {t('crew.invite')}</button>} />

      {members.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h3 style={{ fontWeight: 700, marginBottom: '8px' }}>{t('crew.emptyTitle')}</h3>
          <p style={{ color: colors.muted, fontSize: '13px', marginBottom: '20px' }}>{t('crew.emptyBody')}</p>
          {isPM && <button onClick={() => setShowInvite(true)} style={btnPrimary}><UserPlus size={14} /> {t('crew.invite')}</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {members.map(m => {
            const self = m.user_id === userId
            const phone = phoneOf(m.user_id)
            return (
              <div key={m.user_id} style={{
                background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.border}`, borderRadius: '14px',
                padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px', animation: 'fadeIn 0.3s ease',
              }}>
                <Avatar uid={m.user_id} name={nameOf(m.user_id)} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '3px' }}>{nameOf(m.user_id)}</div>
                  <div style={{ fontSize: '13px', color: colors.muted, display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                    <span>{m.function_title || '—'}</span>
                    {phone && (
                      <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} style={{ color: colors.soft, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        <Phone size={11} style={{ verticalAlign: 'middle', marginRight: '3px' }} />{phone}
                      </a>
                    )}
                    {m.call_time && (
                      <span style={{ color: colors.accent, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        <Clock size={11} style={{ verticalAlign: 'middle', marginRight: '3px' }} />{t('crew.call', { time: shortTime(m.call_time) })}
                      </span>
                    )}
                  </div>
                  {(conflicts[m.user_id] || []).map((c, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#F59E0B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertTriangle size={12} /> {conflictText(c, fmt)}
                    </div>
                  ))}
                </div>
                <RoleBadge role={m.role} large />
                {(isPM || self) && (
                  <button onClick={() => removeMember(m)} style={iconBtn}
                    aria-label={self ? t('crew.leave') : t('crew.removeNamed', { name: nameOf(m.user_id) })}
                    title={self ? t('crew.leave') : t('crew.remove')}>
                    <X size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {invites.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ ...label, marginBottom: '10px' }}>{t('crew.pending')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {invites.map(inv => (
              <div key={inv.id} style={{ border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                  <div style={{ fontSize: '12px', color: colors.muted }}>
                    {inv.function_title || '—'}{inv.call_time ? ` · ${t('crew.call', { time: shortTime(inv.call_time) })}` : ''}
                  </div>
                </div>
                <RoleBadge role={inv.role} />
                <button onClick={() => cancelInvite(inv)} aria-label={t('crew.cancelInviteFor', { email: inv.email })} title={t('crew.cancelInvite')} style={iconBtn}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && <InviteModal gigId={gigId} onClose={() => setShowInvite(false)} onInvited={onChanged} />}
    </div>
  )
}

const EMPTY_INVITE = { email: '', role: 'crew', function_title: '', call_time: '' }

function InviteModal({ gigId, onClose, onInvited }) {
  const { fmt } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState(EMPTY_INVITE)
  const [sending, setSending] = useState(false)
  const [clashes, setClashes] = useState([])

  async function checkAvailability() {
    const email = form.email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setClashes([])
    const { data, error } = await supabase.rpc('crew_conflicts', { p_gig: gigId, p_email: email })
    if (error) return logger.warn('crew', 'Availability check failed', { gigId })
    setClashes(data || [])
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.email.trim()) return
    setSending(true)
    try {
      const email = form.email.trim()
      const outcome = await sendInvite({
        kind: 'gig', targetId: gigId, email, role: form.role, functionTitle: form.function_title, callTime: form.call_time,
      })
      const msg = inviteMessage(email, outcome)
      notify(msg.text, msg.kind, { duration: msg.kind === 'info' ? 15000 : undefined })
      onInvited()
      onClose()
    } catch (err) {
      logger.error('crew', err, { step: 'invite', gigId })
      notify(userMessage(err), 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title={t('crew.inviteTitle')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={label} htmlFor="inv-email">{t('common.email')} *</label>
          <input id="inv-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            onBlur={checkAvailability} placeholder="technician@company.com" style={input} autoFocus required />
          {clashes.length > 0 && (
            <div role="status" style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '12px', color: '#F59E0B', lineHeight: 1.6 }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> {t('availability.inviteWarning')}</strong>
              {clashes.map((c, i) => <div key={i}>{conflictText(c, fmt)}</div>)}
            </div>
          )}
        </div>
        <div>
          <label style={label} htmlFor="inv-function">{t('crew.function')}</label>
          <input id="inv-function" value={form.function_title} onChange={e => setForm(f => ({ ...f, function_title: e.target.value }))}
            placeholder={t('crew.functionPlaceholder')} maxLength={120} style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={label} htmlFor="inv-role">{t('crew.access')}</label>
            <select id="inv-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ ...input, cursor: 'pointer' }}>
              <option value="pm">{t('gigRoleLong.pm')}</option>
              <option value="crew">{t('gigRoleLong.crew')}</option>
              <option value="viewer">{t('gigRoleLong.viewer')}</option>
            </select>
          </div>
          <div>
            <label style={label} htmlFor="inv-call">{t('crew.callTime')}</label>
            <input id="inv-call" type="time" value={form.call_time} onChange={e => setForm(f => ({ ...f, call_time: e.target.value }))} style={input} />
          </div>
        </div>
        <div style={{
          padding: '10px 13px', borderRadius: '9px', background: 'rgba(30,200,120,0.07)', border: '1px solid rgba(30,200,120,0.15)',
          fontSize: '12px', color: colors.muted, lineHeight: 1.6,
        }}>💡 {t('crew.inviteHint')}</div>
        <button type="submit" disabled={sending || !form.email.trim()} style={{ ...btnPrimary, justifyContent: 'center', padding: '13px' }}>
          {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />} {t('crew.addToGig')}
        </button>
      </form>
    </Modal>
  )
}

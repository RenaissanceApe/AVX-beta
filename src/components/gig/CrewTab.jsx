import { useEffect, useState } from 'react'
import { UserPlus, X, Clock, Phone, Loader2, Send, AlertTriangle, Plus, Briefcase, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { sendInvite, inviteMessage } from '../../lib/invites'
import { shortTime } from '../../lib/schedule'
import { useI18n, t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors } from '../ui'
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
  const [inviteFor, setInviteFor] = useState('') // function title to prefill when inviting for a position

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
      <Positions gigId={gigId} isPM={isPM} userId={userId} members={members} invites={invites}
        onInvite={title => { setInviteFor(title); setShowInvite(true) }} />

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

      {showInvite && <InviteModal gigId={gigId} functionTitle={inviteFor} onClose={() => { setShowInvite(false); setInviteFor('') }} onInvited={onChanged} />}
    </div>
  )
}

const EMPTY_INVITE = { email: '', role: 'crew', function_title: '', call_time: '' }

function InviteModal({ gigId, functionTitle, onClose, onInvited }) {
  const { fmt } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState({ ...EMPTY_INVITE, function_title: functionTitle || '' })
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

// Roles the gig needs ("Sound technician × 2"), added by hand or from the quote.
// "Filled" counts crew and pending invites whose function matches the title.
function Positions({ gigId, isPM, userId, members, invites, onInvite }) {
  const { notify } = useToast()
  const [positions, setPositions] = useState([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', quantity: 1 })

  async function load() {
    const { data, error } = await supabase.from('gig_positions').select('*').eq('gig_id', gigId).order('created_at')
    if (error) return logger.error('positions', error, { gigId })
    setPositions(data || [])
  }
  useEffect(() => { load() }, [gigId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!positions.length && !isPM) return null

  const filledFor = title => {
    const key = title.trim().toLowerCase()
    return [...members, ...invites].filter(m => (m.function_title || '').trim().toLowerCase() === key).length
  }

  async function add(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    const { error } = await supabase.from('gig_positions').insert({
      gig_id: gigId, title: form.title.trim(), quantity: Math.min(99, Math.max(1, Math.round(Number(form.quantity) || 1))), created_by: userId,
    })
    if (error) return notify(userMessage(error), 'error')
    setForm({ title: '', quantity: 1 })
    setAdding(false)
    load()
  }
  async function setQuantity(pos, value) {
    const quantity = Math.min(99, Math.max(1, Math.round(Number(value) || 1)))
    if (quantity === pos.quantity) return
    setPositions(list => list.map(p => (p.id === pos.id ? { ...p, quantity } : p)))
    const { error } = await supabase.from('gig_positions').update({ quantity }).eq('id', pos.id)
    if (error) { notify(userMessage(error), 'error'); load() }
  }
  async function remove(pos) {
    if (!window.confirm(t('positions.confirmRemove', { title: pos.title }))) return
    const { error } = await supabase.from('gig_positions').delete().eq('id', pos.id)
    if (error) return notify(userMessage(error), 'error')
    load()
  }

  const open = positions.reduce((sum, p) => sum + Math.max(0, p.quantity - filledFor(p.title)), 0)
  return (
    <section style={{ marginBottom: '26px' }} aria-labelledby="positions-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 id="positions-title" style={{ ...label, marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Briefcase size={13} /> {t('positions.heading')}
        </h3>
        {positions.length > 0 && <span style={{ fontSize: '12px', color: open ? '#F59E0B' : colors.accent }}>{open ? t('positions.open', { count: open }) : t('positions.allFilled')}</span>}
        {isPM && !adding && <button onClick={() => setAdding(true)} style={{ ...btn, marginLeft: 'auto', padding: '6px 10px' }}><Plus size={13} /> {t('positions.add')}</button>}
      </div>
      {positions.length === 0 && !adding && <p style={{ fontSize: '13px', color: colors.muted }}>{t('positions.empty')}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {positions.map(pos => {
          const filled = filledFor(pos.title)
          return (
            <div key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', border: `1px solid ${colors.border}`, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{pos.title}</div>
                {pos.notes && <div style={{ fontSize: '12px', color: colors.muted }}>{pos.notes}</div>}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: filled >= pos.quantity ? colors.accent : '#F59E0B', whiteSpace: 'nowrap' }}>
                {t('positions.filled', { filled, total: pos.quantity })}
              </span>
              {isPM && (
                <>
                  <input type="number" min={1} max={99} defaultValue={pos.quantity} key={pos.quantity} onBlur={e => setQuantity(pos, e.target.value)}
                    aria-label={t('positions.quantityFor', { title: pos.title })} style={{ ...input, width: '58px', padding: '5px 6px' }} />
                  {filled < pos.quantity && (
                    <button onClick={() => onInvite(pos.title)} aria-label={t('positions.inviteFor', { title: pos.title })} title={t('crew.invite')} style={{ ...iconBtn, color: colors.accent }}><UserPlus size={15} /></button>
                  )}
                  <button onClick={() => remove(pos)} aria-label={t('positions.removeNamed', { title: pos.title })} title={t('positions.remove')} style={iconBtn}><Trash2 size={14} /></button>
                </>
              )}
            </div>
          )
        })}
      </div>
      {adding && (
        <form onSubmit={add} style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={120} placeholder={t('crew.functionPlaceholder')}
            aria-label={t('positions.title')} autoFocus style={{ ...input, flex: '1 1 200px' }} />
          <input type="number" min={1} max={99} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            aria-label={t('positions.quantity')} style={{ ...input, width: '70px' }} />
          <button type="submit" disabled={!form.title.trim()} style={btn}><Plus size={14} /> {t('positions.add')}</button>
          <button type="button" onClick={() => setAdding(false)} aria-label={t('common.cancel')} style={iconBtn}><X size={16} /></button>
        </form>
      )}
    </section>
  )
}

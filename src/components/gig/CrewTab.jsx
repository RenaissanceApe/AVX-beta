import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus, X, Clock, Phone, Send, AlertTriangle, Plus, Trash2, CalendarClock, UserCheck, MessageCircle, Megaphone, Search, BarChart3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { useWorkspace } from '../../lib/WorkspaceContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { sendInvite, inviteMessage } from '../../lib/invites'
import { shortTime } from '../../lib/schedule'
import { clashText, groupByUser } from '../../lib/clashes'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors, StatusBadge, CallChip, AvxLoader, Section } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import { Avatar, RoleBadge, TabHeader } from './parts'
import { ClashBox, AskAvailabilityModal, ShiftModal, shiftText, AMBER } from './Booking'
import { NetworkPicker, PickedPerson, addFromNetwork } from '../NetworkPicker'
import { CrewCallModal, CrewCallList } from './CrewCalls'
import PostJobModal from '../jobs/PostJobModal'
import { useUndoRemove } from '../../lib/undo'
import { LabourCost, MyFee } from './LabourCost'
import GigHours from '../hours/GigHours'
import GigExpenses from '../expenses/GigExpenses'

// Latest request per person: { user_id: request }
const latestRequests = rows => {
  const map = {}
  for (const r of rows || []) if (!map[r.person_id] || r.created_at > map[r.person_id].created_at) map[r.person_id] = r
  return map
}

export default function CrewTab({ gig, members, invites, isPM, orgRole, userId, nameOf, phoneOf, onChanged, onLeft, showInvite, setShowInvite }) {
  const gigId = gig.id
  const navigate = useNavigate()
  const { notify } = useToast()
  const { orgs } = useWorkspace()
  // Bookings are read on the organisation's clock (members of the organisation know it)
  const timeZone = orgs.find(o => o.id === gig.org_id)?.time_zone
  const [clashes, setClashes] = useState({}) // user_id -> [clash]
  const [requests, setRequests] = useState({}) // user_id -> latest availability request
  const [orgMemberIds, setOrgMemberIds] = useState(null) // Set, for org admins only
  const [asking, setAsking] = useState(null) // member being asked
  const [shiftFor, setShiftFor] = useState(null) // member whose times are being edited
  const [inviteFor, setInviteFor] = useState('') // function title to prefill when inviting for a position
  const [callFor, setCallFor] = useState(null) // { title, quantity } for a new crew call
  const [callsKey, setCallsKey] = useState(0)
  const [hoursKey, setHoursKey] = useState(0)
  const [postingJob, setPostingJob] = useState(false)
  const isOrgAdmin = orgRole === 'admin'
  const orgName = orgs.find(o => o.id === gig.org_id)?.name || ''
  const bookingKey = members.map(m => `${m.user_id}:${m.booked_from}:${m.booked_until}`).join('|')

  // Managers see who is booked elsewhere or unavailable during their time on this gig
  async function loadBookingState() {
    if (!isPM) return
    const [clashRes, reqRes] = await Promise.all([
      supabase.rpc('gig_clashes', { p_gig: gigId }),
      supabase.from('availability_requests').select('*').eq('gig_id', gigId).order('created_at', { ascending: false }).limit(200),
    ])
    if (clashRes.error) logger.error('crew', clashRes.error, { step: 'clashes', gigId })
    else setClashes(groupByUser(clashRes.data))
    if (reqRes.error) logger.error('crew', reqRes.error, { step: 'requests', gigId })
    else setRequests(latestRequests(reqRes.data))
  }
  useEffect(() => { loadBookingState() }, [gigId, isPM, bookingKey, gig.start_date, gig.end_date, gig.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Org admins can add crew to the organisation; they need to know who's in it already
  useEffect(() => {
    if (!isOrgAdmin || !gig.org_id) return setOrgMemberIds(null)
    supabase.from('org_members').select('user_id').eq('org_id', gig.org_id)
      .then(({ data }) => setOrgMemberIds(new Set((data || []).map(r => r.user_id))))
  }, [isOrgAdmin, gig.org_id, members.length])

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

  async function withdraw(request) {
    const { error } = await supabase.from('availability_requests').update({ status: 'withdrawn' }).eq('id', request.id)
    if (error) return notify(userMessage(error), 'error')
    loadBookingState()
  }

  async function addToOrg(member) {
    const name = nameOf(member.user_id)
    if (!window.confirm(t('crew.addToOrgConfirm', { name, org: orgName }))) return
    const { data, error } = await supabase.rpc('add_gig_member_to_org', { p_gig: gigId, p_user: member.user_id, p_role: 'member' })
    if (error) {
      logger.error('crew', error, { step: 'addToOrg', gigId })
      return notify(userMessage(error), 'error')
    }
    track('crew:added-to-org')
    notify(data === 'already_member' ? t('crew.alreadyInOrg', { name, org: orgName }) : t('crew.addedToOrg', { name, org: orgName }), 'success')
    setOrgMemberIds(ids => new Set([...(ids || []), member.user_id]))
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* The tab's top: one primary (Invite) and one more in view; finding crew and posting a job in ⋯ (DESIGN.md rule 5) */}
      <TabHeader title={t('gig.tab.crew')} subtitle={t('crew.count', { count: members.length })}
        secondary={isPM && <button type="button" onClick={() => setCallFor({})} style={btn} title={t('crewCall.hint')}><Megaphone size={14} aria-hidden="true" /> {t('crewCall.button')}</button>}
        action={isPM && <button type="button" onClick={() => setShowInvite(true)} style={btnPrimary}><UserPlus size={14} aria-hidden="true" /> {t('crew.invite')}</button>}
        more={isPM && gig.org_id && (orgRole === 'admin' || orgRole === 'member') ? [
          { label: t('crewSearch.findForGig'), icon: <Search size={15} aria-hidden="true" />, onClick: () => navigate(`/org/${gig.org_id}/crew?gig=${gigId}`) },
          { label: t('jobs.postButton'), icon: <Send size={15} aria-hidden="true" />, onClick: () => setPostingJob(true) },
        ] : []} />

      <Positions gigId={gigId} isPM={isPM} userId={userId} members={members} invites={invites}
        onInvite={title => { setInviteFor(title); setShowInvite(true) }} onCall={setCallFor} />

      {isPM && <CrewCallList gigId={gigId} nameOf={nameOf} refreshKey={`${callsKey}:${members.length}`} />}

      <Section id="crew-people">
      {members.length === 0 ? (
        <EmptyState icon={<UserPlus size={28} />} title={t('crew.emptyTitle')} body={t('crew.emptyBody')}
          action={isPM ? t('crew.invite') : null} actionIcon={<UserPlus size={14} />} onAction={() => setShowInvite(true)} guide={isPM ? 'pm-invite-crew' : null} />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {members.map((m, i) => {
            const self = m.user_id === userId
            const phone = phoneOf(m.user_id)
            const name = nameOf(m.user_id)
            const mine = clashes[m.user_id] || []
            const shift = shiftText(m, timeZone)
            const canAddToOrg = isOrgAdmin && orgMemberIds && !orgMemberIds.has(m.user_id)
            const booked = mine.some(c => c.kind === 'booked')
            return (
              <li key={m.user_id} className="crew-row" style={{
                // Rows with hairlines between them, not a card each (DESIGN.md "One box deep"). A booking clash
                // takes the danger-soft row; a self-reported unavailability only its warn line (DESIGN.md "CrewRow")
                background: booked ? 'var(--danger-soft)' : 'transparent', borderTop: i > 0 ? `1px solid ${colors.border}` : 'none',
                borderLeft: booked ? '2px solid var(--danger)' : 'none',
                padding: booked ? 'var(--space-3)' : 'var(--space-3) 0', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0 12px', animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              }}>
                <Avatar uid={m.user_id} name={name} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {name}
                    {mine.length > 0 && !booked && (
                      <span role="img" aria-label={t('clash.badge')} title={t('clash.badge')} style={{ color: AMBER, display: 'flex' }}><AlertTriangle size={15} /></span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: colors.muted, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    <span>{m.function_title || '—'}</span>
                    {phone && (
                      <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} style={{ color: colors.soft, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        <Phone size={13} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }} />{phone}
                      </a>
                    )}
                    {shift && (
                      <span style={{ color: colors.soft, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                        <CalendarClock size={13} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }} />{t('shift.booked', { range: shift })}
                      </span>
                    )}
                  </div>
                </div>
                <span className="crew-chips" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {booked
                    ? <StatusBadge tone="danger" title={t('clash.badge')}>{t('clash.status')}</StatusBadge>
                    : m.call_time && <CallChip label={t('crew.callKey')} time={shortTime(m.call_time)} title={t('crew.call', { time: shortTime(m.call_time) })} />}
                  <RoleBadge role={m.role} large />
                </span>
                {isOrgAdmin && gig.org_id && (
                  <Link to={`/org/${gig.org_id}/people/${m.user_id}`} style={iconBtn} aria-label={t('person.openNamed', { name })} title={t('person.open')}>
                    <BarChart3 size={15} />
                  </Link>
                )}
                {!self && (
                  <Link to={`/messages?to=${m.user_id}`} style={iconBtn} aria-label={t('chat.messageNamed', { name })} title={t('chat.message')}>
                    <MessageCircle size={15} />
                  </Link>
                )}
                {(isPM || self) && (
                  <button onClick={() => removeMember(m)} style={iconBtn}
                    aria-label={self ? t('crew.leave') : t('crew.removeNamed', { name })}
                    title={self ? t('crew.leave') : t('crew.remove')}>
                    <X size={15} />
                  </button>
                )}
                {(mine.length > 0 || isPM || canAddToOrg) && (
                  <div className="crew-extra">
                    {mine.length > 0 && (
                      <ClashBox timeZone={timeZone} name={name} clashes={mine} request={requests[m.user_id]} canAsk={isPM && !self}
                        onAsk={() => setAsking(m)} onWithdraw={() => withdraw(requests[m.user_id])} />
                    )}
                    {(isPM || canAddToOrg) && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                        {isPM && (
                          <button onClick={() => setShiftFor(m)} style={rowBtn}>
                            <CalendarClock size={13} /> {shift ? t('shift.edit') : t('shift.set')}
                          </button>
                        )}
                        {canAddToOrg && (
                          <button onClick={() => addToOrg(m)} style={rowBtn} title={t('crew.addToOrgHint', { org: orgName })}>
                            <UserCheck size={13} /> {t('crew.addToOrg', { org: orgName })}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      </Section>

      {invites.length > 0 && (
        <Section id="crew-pending" title={t('crew.pending')} level={3}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {invites.map((inv, i) => (
              <li key={inv.id} style={{ borderTop: i > 0 ? `1px solid ${colors.border}` : 'none', padding: 'var(--space-3) 0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                  <div style={{ fontSize: '13px', color: colors.muted }}>
                    {inv.function_title || '—'}{inv.call_time ? ` · ${t('crew.call', { time: shortTime(inv.call_time) })}` : ''}
                  </div>
                </div>
                <StatusBadge small tone="open">{t('crew.pendingOne')}</StatusBadge>
                <RoleBadge role={inv.role} />
                <button onClick={() => cancelInvite(inv)} aria-label={t('crew.cancelInviteFor', { email: inv.email })} title={t('crew.cancelInvite')} style={iconBtn}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {isPM ? <LabourCost gig={gig} members={members} nameOf={nameOf} refreshKey={hoursKey} canFinance={orgRole === 'admin' || orgRole === 'member'} /> : <MyFee gigId={gigId} userId={userId} />}
      <GigHours gig={gig} members={members} isPM={isPM} userId={userId} nameOf={nameOf} onReviewed={() => setHoursKey(k => k + 1)} />
      <GigExpenses gig={gig} isPM={isPM} orgRole={orgRole} userId={userId} nameOf={nameOf} />

      <style>{`
        .crew-extra { flex-basis: 100%; padding-left: 52px; min-width: 0; }
        @media (max-width: 640px) {
          .crew-extra { order: 6; padding-left: 52px; }
          .crew-chips { order: 5; flex-basis: 100%; justify-content: flex-start !important; padding-left: 52px; margin-top: 8px; }
        }
      `}</style>
      {showInvite && <InviteModal timeZone={timeZone} gigId={gigId} functionTitle={inviteFor} onClose={() => { setShowInvite(false); setInviteFor('') }} onInvited={onChanged} />}
      {callFor && <CrewCallModal gigId={gigId} gig={gig} preset={callFor} onClose={() => setCallFor(null)} onSent={() => setCallsKey(k => k + 1)} />}
      {postingJob && <PostJobModal gig={gig} onClose={() => setPostingJob(false)} onPosted={() => setPostingJob(false)} />}
      {asking && (
        <AskAvailabilityModal timeZone={timeZone} gigId={gigId} personId={asking.user_id} name={nameOf(asking.user_id)} clashes={clashes[asking.user_id] || []}
          onClose={() => setAsking(null)} onSent={loadBookingState} />
      )}
      {shiftFor && (
        <ShiftModal timeZone={timeZone} gig={gig} member={shiftFor} name={nameOf(shiftFor.user_id)} onClose={() => setShiftFor(null)} onSaved={onChanged} />
      )}
    </div>
  )
}

const rowBtn = { ...btn, padding: '4px 12px', color: 'var(--text-2)' }

const EMPTY_INVITE = { email: '', role: 'crew', function_title: '', call_time: '' }

function InviteModal({ gigId, functionTitle, onClose, onInvited, timeZone }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ ...EMPTY_INVITE, function_title: functionTitle || '' })
  const [sending, setSending] = useState(false)
  const [clashes, setClashes] = useState([])
  const [asking, setAsking] = useState(false)
  const [picked, setPicked] = useState(null) // someone from your network, instead of an email

  async function checkAvailability() {
    const email = form.email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setClashes([])
    const { data, error } = await supabase.rpc('email_clashes', { p_gig: gigId, p_email: email })
    if (error) return logger.warn('crew', 'Availability check failed', { gigId })
    setClashes(data || [])
  }

  async function submit(e) {
    e.preventDefault()
    if (picked) return addPicked()
    if (!form.email.trim()) return
    setSending(true)
    try {
      const email = form.email.trim()
      const outcome = await sendInvite({
        kind: 'gig', targetId: gigId, email, role: form.role, functionTitle: form.function_title, callTime: form.call_time,
      })
      const msg = inviteMessage(email, outcome)
      notify(msg.text, msg.kind, { duration: msg.kind === 'info' ? 15000 : undefined })
      if (clashes.length) track('crew:invited-despite-clash')
      onInvited()
      onClose()
    } catch (err) {
      logger.error('crew', err, { step: 'invite', gigId })
      notify(userMessage(err), 'error')
    } finally {
      setSending(false)
    }
  }

  async function addPicked() {
    setSending(true)
    try {
      const result = await addFromNetwork({
        kind: 'gig', targetId: gigId, userId: picked.user_id, role: form.role, functionTitle: form.function_title, callTime: form.call_time,
      })
      track(`invite:gig-network-${result}`)
      if (picked.busy) track('crew:invited-despite-clash')
      notify(t(result === 'already_member' ? 'network.alreadyOn' : 'network.added', { name: picked.full_name || '' }), result === 'already_member' ? 'info' : 'success')
      onInvited()
      onClose()
    } catch (err) {
      logger.error('crew', err, { step: 'addFromNetwork', gigId })
      notify(userMessage(err), 'error')
    } finally {
      setSending(false)
    }
  }

  if (asking && picked) return (
    <AskAvailabilityModal gigId={gigId} personId={picked.user_id} name={picked.full_name || ''} onClose={() => setAsking(false)} onSent={onClose} />
  )
  if (asking) return (
    <AskAvailabilityModal timeZone={timeZone} gigId={gigId} personId={clashes[0].user_id} name={form.email.trim()} clashes={clashes}
      onClose={() => setAsking(false)} onSent={onClose} />
  )

  return (
    <Modal title={t('crew.inviteTitle')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {picked ? (
          <div>
            <PickedPerson person={picked} onClear={() => setPicked(null)} />
            {picked.busy && (
              <button type="button" onClick={() => setAsking(true)} style={{ ...btn, padding: '4px 12px', fontSize: '13px', marginTop: '8px', color: AMBER, borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
                {t('ask.first')}
              </button>
            )}
          </div>
        ) : (
          <NetworkPicker gigId={gigId} onPick={p => { setPicked(p); setClashes([]) }} />
        )}
        {!picked && <div>
          <label style={label} htmlFor="inv-email">{t('common.email')} *</label>
          <input id="inv-email" type="email" value={form.email} onChange={e => { setClashes([]); setForm(f => ({ ...f, email: e.target.value })) }}
            onBlur={checkAvailability} placeholder={t('crew.emailPlaceholder')} style={input} required />
          {clashes.length > 0 && (
            <div role="status" style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--warn-soft)', border: '1px solid var(--warn)', fontSize: '13px', color: AMBER, lineHeight: 1.6 }}>
              <strong style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '2px' }} />
                {clashes.some(c => c.kind === 'booked') ? t('clash.advice', { name: form.email.trim() }) : t('clash.unavailableAdvice', { name: form.email.trim() })}
              </strong>
              {clashes.map((c, i) => <div key={i} style={{ paddingLeft: '18px' }}>{clashText(c, timeZone)}</div>)}
              <button type="button" onClick={() => setAsking(true)} style={{ ...btn, padding: '4px 12px', fontSize: '13px', marginTop: '8px', marginLeft: '20px', color: AMBER, borderColor: 'var(--warn)', background: 'var(--warn-soft)' }}>
                {t('ask.first')}
              </button>
            </div>
          )}
        </div>}
        <div>
          <label style={label} htmlFor="inv-function">{t('crew.function')}</label>
          <input id="inv-function" value={form.function_title} onChange={e => setForm(f => ({ ...f, function_title: e.target.value }))}
            placeholder={t('crew.functionPlaceholder')} maxLength={120} style={input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
          <div>
            <HintLabel htmlFor="inv-role" hint="gig-role">{t('crew.access')}</HintLabel>
            <select id="inv-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ ...input, cursor: 'pointer' }}>
              <option value="pm">{t('gigRoleLong.pm')}</option>
              <option value="crew">{t('gigRoleLong.crew')}</option>
              <option value="viewer">{t('gigRoleLong.viewer')}</option>
            </select>
          </div>
          <div>
            <HintLabel htmlFor="inv-call" hint="call-time">{t('crew.callTime')}</HintLabel>
            <input id="inv-call" type="time" value={form.call_time} onChange={e => setForm(f => ({ ...f, call_time: e.target.value }))} style={input} />
          </div>
        </div>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('crew.inviteHint')}</p>
        <button type="submit" disabled={sending || (!picked && !form.email.trim())} style={{ ...btnPrimary, justifyContent: 'center', padding: '13px' }}>
          {sending ? <AvxLoader size={16} /> : <Send size={16} />} {t('crew.addToGig')}
        </button>
      </form>
    </Modal>
  )
}

// Roles the gig needs ("Sound technician × 2"), added by hand or from the quote.
// "Filled" counts crew and pending invites whose function matches the title.
function Positions({ gigId, isPM, userId, members, invites, onInvite, onCall }) {
  const { notify } = useToast()
  const [positions, setPositions] = useState([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', quantity: 1 })
  const { hidden, remove: removeLater } = useUndoRemove()

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
  function remove(pos) {
    removeLater(pos.id, {
      message: t('undo.removed', { name: pos.title }),
      commit: async () => (await supabase.from('gig_positions').delete().eq('id', pos.id)).error,
      onDone: load,
    })
  }

  const open = positions.filter(p => !hidden.has(p.id)).reduce((sum, p) => sum + Math.max(0, p.quantity - filledFor(p.title)), 0)
  return (
    <Section id="positions-title" level={3} title={t('positions.heading')}
      aside={isPM && !adding && <button type="button" onClick={() => setAdding(true)} style={{ ...btn, padding: '4px 12px' }}><Plus size={14} aria-hidden="true" /> {t('positions.add')}</button>}>
      {positions.length > 0 && <p style={{ fontSize: '13px', margin: '0 0 var(--space-2)', color: open ? 'var(--warn)' : colors.muted }}>{open ? t('positions.open', { count: open }) : t('positions.allFilled')}</p>}
      {positions.length === 0 && !adding && <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>{t('positions.empty')}</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {positions.filter(p => !hidden.has(p.id)).map((pos, i) => {
          const filled = filledFor(pos.title)
          return (
            <li key={pos.id} style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap', padding: 'var(--space-3) 0', borderTop: i > 0 ? `1px solid ${colors.border}` : 'none' }}>
              <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{pos.title}</div>
                {pos.notes && <div style={{ fontSize: '13px', color: colors.muted }}>{pos.notes}</div>}
              </div>
              <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: filled >= pos.quantity ? colors.accentText : 'var(--warn)', whiteSpace: 'nowrap' }}>
                {t('positions.filled', { filled, total: pos.quantity })}
              </span>
              {isPM && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input type="number" min={1} max={99} defaultValue={pos.quantity} key={pos.quantity} onBlur={e => setQuantity(pos, e.target.value)}
                    aria-label={t('positions.quantityFor', { title: pos.title })} style={{ ...input, width: '64px', padding: '4px 8px' }} />
                  {filled < pos.quantity && (
                    <>
                      <button onClick={() => onCall({ title: pos.title, quantity: Math.min(20, pos.quantity - filled) })} aria-label={t('crewCall.forNamed', { title: pos.title })} title={t('crewCall.button')} style={iconBtn}><Megaphone size={16} /></button>
                      <button onClick={() => onInvite(pos.title)} aria-label={t('positions.inviteFor', { title: pos.title })} title={t('crew.invite')} style={{ ...iconBtn, color: colors.accentText }}><UserPlus size={16} /></button>
                    </>
                  )}
                  <button onClick={() => remove(pos)} aria-label={t('positions.removeNamed', { title: pos.title })} title={t('positions.remove')} style={iconBtn}><Trash2 size={16} /></button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {adding && (
        <form onSubmit={add} style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={120} placeholder={t('crew.functionPlaceholder')}
            aria-label={t('positions.title')} autoFocus style={{ ...input, flex: '1 1 200px' }} />
          <input type="number" min={1} max={99} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            aria-label={t('positions.quantity')} style={{ ...input, width: '70px' }} />
          <button type="submit" disabled={!form.title.trim()} style={btn}><Plus size={14} /> {t('positions.add')}</button>
          <button type="button" onClick={() => setAdding(false)} aria-label={t('common.cancel')} style={iconBtn}><X size={16} /></button>
        </form>
      )}
    </Section>
  )
}

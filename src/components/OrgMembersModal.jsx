import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Send, Trash2, LogOut, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { sendInvite, inviteMessage } from '../lib/invites'
import { NetworkPicker, addFromNetwork } from './NetworkPicker'
import HeldInvites from './HeldInvites'
import { useI18n } from '../i18n'
import { Hint } from './help/HelpParts'
import { AvxLoader } from './ui'

// Labels: orgRole.<value>
const ROLES = [{ value: 'admin' }, { value: 'member' }, { value: 'viewer' }]

// Organisation members: list, invite by email, change roles, remove, leave, delete organisation.
export default function OrgMembersModal({ org, onClose, onChanged }) {
  const { user } = useAuth()
  const { notify } = useToast()
  const { t } = useI18n()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(null)

  const isAdmin = org.myRole === 'admin'

  async function load() {
    setLoading(true)
    const [{ data, error }, invitesRes] = await Promise.all([
      supabase.rpc('org_member_list', { p_org: org.id }),
      isAdmin ? supabase.from('org_invites').select('*').eq('org_id', org.id).order('created_at') : Promise.resolve({ data: [] }),
    ])
    if (error) {
      logger.error('org', error, { step: 'listMembers', orgId: org.id })
      notify(userMessage(error), 'error')
    }
    setMembers(data || [])
    setInvites(invitesRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [org.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    try {
      const outcome = await sendInvite({ kind: 'org', targetId: org.id, email, role })
      const msg = inviteMessage(email.trim(), outcome)
      notify(msg.text, msg.kind, { duration: msg.kind === 'info' ? 15000 : undefined })
      setEmail('')
      load()
    } catch (err) {
      logger.error('org', err, { step: 'invite', orgId: org.id })
      notify(userMessage(err), 'error')
    } finally {
      setSending(false)
    }
  }

  // Someone from your network joins with the role chosen below
  async function addPicked(person) {
    if (!window.confirm(t('network.confirmOrg', { name: person.full_name || '', org: org.name, role: t(`orgRole.${role}`) }))) return
    try {
      const result = await addFromNetwork({ kind: 'org', targetId: org.id, userId: person.user_id, role })
      notify(t(result === 'already_member' ? 'network.alreadyOn' : 'network.added', { name: person.full_name || '' }), result === 'already_member' ? 'info' : 'success')
      load()
      onChanged?.()
    } catch (err) {
      logger.error('org', err, { step: 'addFromNetwork', orgId: org.id })
      notify(userMessage(err), 'error')
    }
  }

  async function changeRole(member, newRole) {
    setBusy(member.user_id)
    const { error } = await supabase.from('org_members').update({ role: newRole })
      .eq('org_id', org.id).eq('user_id', member.user_id)
    setBusy(null)
    if (error) {
      logger.error('org', error, { step: 'changeRole', orgId: org.id })
      return notify(userMessage(error), 'error')
    }
    if (member.user_id === user.id) onChanged()
    load()
  }

  async function removeMember(member) {
    const self = member.user_id === user.id
    const question = self
      ? t('org.confirmLeave', { org: org.name })
      : t('org.confirmRemove', { name: member.full_name || member.email, org: org.name })
    if (!window.confirm(question)) return
    setBusy(member.user_id)
    const { error } = await supabase.from('org_members').delete().eq('org_id', org.id).eq('user_id', member.user_id)
    setBusy(null)
    if (error) {
      logger.error('org', error, { step: self ? 'leave' : 'remove', orgId: org.id })
      return notify(userMessage(error), 'error')
    }
    if (self) {
      notify(t('org.left', { org: org.name }), 'success')
      onChanged()
      return onClose()
    }
    load()
  }

  async function cancelInvite(inv) {
    const { error } = await supabase.from('org_invites').delete().eq('id', inv.id)
    if (error) return notify(userMessage(error), 'error')
    setInvites(list => list.filter(i => i.id !== inv.id))
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="members-title" style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <h2 id="members-title" style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
            {t('org.membersTitle', { org: org.name })}
            {/* The intro sits behind ⓘ (DESIGN.md rule 4) */}
            <Hint text={t('org.intro')} label={t('org.membersTitle', { org: org.name })} />
          </h2>
          <button onClick={onClose} aria-label={t('common.close')} style={iconBtn}><X size={20} /></button>
        </div>

        {isAdmin && <HeldInvites org={org} onSent={() => { load(); onChanged?.() }} />}
        {isAdmin && (
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <NetworkPicker orgId={org.id} key={members.length} onPick={addPicked} />
          </div>
        )}
        {isAdmin && (
          <form onSubmit={invite} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com"
              aria-label={t('common.email')} style={{ ...input, flex: '1 1 200px' }} />
            <select value={role} onChange={e => setRole(e.target.value)} aria-label={t('org.role')} style={{ ...input, flex: '0 0 auto', width: 'auto', cursor: 'pointer' }}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{t(`orgRole.${r.value}`)}</option>)}
            </select>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}><Hint id="org-role" label={t('org.role')} /></span>
            <button type="submit" disabled={sending || !email.trim()} style={smallBtn}>
              {sending ? <AvxLoader size={16} /> : <Send size={15} aria-hidden="true" />} {t('common.invite')}
            </button>
          </form>
        )}
        {isAdmin && (
          <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 var(--space-5)' }}>
            {t('held.importHint')} <Link to={`/org/${org.id}/inventory/import?kind=crew`} onClick={onClose} style={{ color: 'var(--accent-text)', fontWeight: 600 }}>{t('held.importLink')}</Link>
          </p>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-5)' }}>
            <AvxLoader size={20} color="var(--accent-text)" />
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid var(--line)', maxHeight: '45vh', overflowY: 'auto' }}>
            {members.map(m => {
              const self = m.user_id === user.id
              return (
                <li key={m.user_id} style={row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{m.full_name || '—'}{self && <span style={{ color: 'var(--muted)' }}> ({t('common.you')})</span>}</div>
                    <div style={{ fontSize: '13px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                  </div>
                  {isAdmin ? (
                    <select value={m.role} disabled={busy === m.user_id} onChange={e => changeRole(m, e.target.value)}
                      aria-label={t('org.roleFor', { name: m.full_name || m.email })} style={{ ...input, width: 'auto', padding: 'var(--space-1) var(--space-2)', fontSize: '13px', minHeight: '36px', cursor: 'pointer' }}>
                      {ROLES.map(r => <option key={r.value} value={r.value}>{t(`orgRole.${r.value}`)}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t(`orgRole.${m.role}`)}</span>
                  )}
                  {!self && (
                    <Link to={`/messages?to=${m.user_id}`} style={iconBtn} aria-label={t('chat.messageNamed', { name: m.full_name || '—' })} title={t('chat.message')}>
                      <MessageCircle size={16} />
                    </Link>
                  )}
                  {(isAdmin || self) && (
                    <button onClick={() => removeMember(m)} disabled={busy === m.user_id} style={iconBtn}
                      aria-label={self ? t('org.leave') : t('crew.removeNamed', { name: m.full_name || m.email })} title={self ? t('org.leave') : t('crew.remove')}>
                      {self ? <LogOut size={16} /> : <X size={16} />}
                    </button>
                  )}
                </li>
              )
            })}
            {invites.map(inv => (
              <li key={inv.id} style={row}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('org.invited', { role: t(`orgRole.${inv.role}`) })}</div>
                </div>
                <button onClick={() => cancelInvite(inv)} aria-label={t('crew.cancelInviteFor', { email: inv.email })} title={t('crew.cancelInvite')} style={iconBtn}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 100, background: 'var(--overlay)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(16px + var(--safe-top)) 16px 16px'
}
const panel = {
  background: 'var(--panel)', border: '1px solid var(--line-strong)', 
  padding: '24px', width: '100%', maxWidth: '520px', animation: 'fadeIn 0.2s ease', color: 'var(--text)',
  maxHeight: 'calc(100dvh - 32px - var(--safe-top))', overflowY: 'auto',
}
// Rows with a hairline between them, not a box each (DESIGN.md rule 2)
const row = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0', minHeight: '52px',
  borderBottom: '1px solid var(--line)'
}
const input = {
  width: '100%', padding: '10px 12px', background: 'var(--shade)', border: '1px solid var(--line)',
  color: 'var(--text)', fontSize: '14px', outline: 'none'
}
const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-4)', 
  border: '1px solid var(--accent)', background: 'var(--selection)', color: 'var(--accent-text)',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0
}
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 'var(--space-2)', display: 'flex', flexShrink: 0 }

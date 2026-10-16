import { useEffect, useState } from 'react'
import { X, Loader2, Send, Trash2, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { sendInvite, inviteMessage } from '../lib/invites'
import { useI18n } from '../i18n'

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h2 id="members-title" style={{ fontSize: '18px', fontWeight: 700 }}>{t('org.membersTitle', { org: org.name })}</h2>
          <button onClick={onClose} aria-label={t('common.close')} style={iconBtn}><X size={18} /></button>
        </div>
        <p style={{ color: '#4A6070', fontSize: '13px', marginBottom: '18px' }}>
          {t('org.intro')}
        </p>

        {isAdmin && (
          <form onSubmit={invite} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com"
              aria-label={t('common.email')} style={{ ...input, flex: '1 1 200px' }} />
            <select value={role} onChange={e => setRole(e.target.value)} aria-label={t('org.role')} style={{ ...input, flex: '0 0 auto', width: 'auto', cursor: 'pointer' }}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{t(`orgRole.${r.value}`)}</option>)}
            </select>
            <button type="submit" disabled={sending || !email.trim()} style={smallBtn}>
              {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} {t('common.invite')}
            </button>
          </form>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
            <Loader2 size={20} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '45vh', overflowY: 'auto' }}>
            {members.map(m => {
              const self = m.user_id === user.id
              return (
                <div key={m.user_id} style={row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{m.full_name || '—'}{self && <span style={{ color: '#4A6070' }}> ({t('common.you')})</span>}</div>
                    <div style={{ fontSize: '12px', color: '#4A6070', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                  </div>
                  {isAdmin ? (
                    <select value={m.role} disabled={busy === m.user_id} onChange={e => changeRole(m, e.target.value)}
                      aria-label={t('org.roleFor', { name: m.full_name || m.email })} style={{ ...input, width: 'auto', padding: '6px 8px', fontSize: '13px', cursor: 'pointer' }}>
                      {ROLES.map(r => <option key={r.value} value={r.value}>{t(`orgRole.${r.value}`)}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#4A6070', }}>{t(`orgRole.${m.role}`)}</span>
                  )}
                  {(isAdmin || self) && (
                    <button onClick={() => removeMember(m)} disabled={busy === m.user_id} style={iconBtn}
                      aria-label={self ? t('org.leave') : t('crew.removeNamed', { name: m.full_name || m.email })} title={self ? t('org.leave') : t('crew.remove')}>
                      {self ? <LogOut size={15} /> : <X size={15} />}
                    </button>
                  )}
                </div>
              )
            })}
            {invites.map(inv => (
              <div key={inv.id} style={{ ...row, borderStyle: 'dashed' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.email}</div>
                  <div style={{ fontSize: '12px', color: '#4A6070' }}>{t('org.invited', { role: t(`orgRole.${inv.role}`) })}</div>
                </div>
                <button onClick={() => cancelInvite(inv)} aria-label={t('crew.cancelInviteFor', { email: inv.email })} title={t('crew.cancelInvite')} style={iconBtn}>
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
}
const panel = {
  background: '#0F1520', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px',
  padding: '24px', width: '100%', maxWidth: '520px', animation: 'fadeIn 0.2s ease', color: '#fff'
}
const row = {
  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
  border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px'
}
const input = {
  width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '9px', color: '#fff', fontSize: '14px', outline: 'none'
}
const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '9px',
  border: '1px solid rgba(30,200,120,0.3)', background: 'rgba(30,200,120,0.12)', color: '#1EC878',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0
}
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070', padding: '4px', display: 'flex', flexShrink: 0 }

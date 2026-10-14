import { useState } from 'react'
import { X, Loader2, LogOut, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth, MIN_PASSWORD_LENGTH } from '../lib/AuthContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'

// Account settings: display name, password change, sign out.
export default function AccountModal({ onClose }) {
  const { user, profile, updateProfile, signOut } = useAuth()
  const { notify } = useToast()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [savingName, setSavingName] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  async function saveName(e) {
    e.preventDefault()
    if (!fullName.trim()) return
    setSavingName(true)
    const { error } = await updateProfile({ full_name: fullName.trim() })
    setSavingName(false)
    if (error) {
      logger.error('account', error, { step: 'updateName' })
      notify(userMessage(error), 'error')
    } else {
      notify('Name updated.', 'success')
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    setPasswordError('')
    if (password.length < MIN_PASSWORD_LENGTH) return setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    if (password !== confirm) return setPasswordError('Passwords do not match')
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSavingPassword(false)
    if (error) {
      logger.error('account', error, { step: 'updatePassword' })
      setPasswordError(userMessage(error))
    } else {
      setPassword('')
      setConfirm('')
      notify('Password changed.', 'success')
    }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="account-title" style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 id="account-title" style={{ fontSize: '18px', fontWeight: 700 }}>Account</h2>
          <button onClick={onClose} aria-label="Close" style={iconBtn}><X size={18} /></button>
        </div>
        <p style={{ color: '#4A6070', fontSize: '13px', marginBottom: '22px', wordBreak: 'break-all' }}>{user?.email}</p>

        <form onSubmit={saveName} style={section}>
          <label style={label} htmlFor="account-name">Full name</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input id="account-name" value={fullName} onChange={e => setFullName(e.target.value)}
              autoComplete="name" maxLength={120} style={input} />
            <button type="submit" disabled={savingName || !fullName.trim() || fullName.trim() === profile?.full_name} style={smallBtn}>
              {savingName ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />} Save
            </button>
          </div>
        </form>

        <form onSubmit={savePassword} style={section}>
          <label style={label} htmlFor="account-password">Change password</label>
          {/* Hidden username field helps password managers update the right entry */}
          <input type="email" value={user?.email || ''} autoComplete="username" readOnly hidden />
          <input id="account-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder={`New password (min. ${MIN_PASSWORD_LENGTH} characters)`} autoComplete="new-password" style={{ ...input, marginBottom: '8px' }} />
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm new password" autoComplete="new-password" style={{ ...input, marginBottom: '8px' }} />
          {passwordError && <p style={{ color: '#F87171', fontSize: '13px', marginBottom: '8px' }}>{passwordError}</p>}
          <button type="submit" disabled={savingPassword || !password} style={smallBtn}>
            {savingPassword && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} Update password
          </button>
        </form>

        <button onClick={signOut} style={{ ...smallBtn, background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', color: '#F87171', width: '100%', justifyContent: 'center' }}>
          <LogOut size={14} /> Sign out
        </button>
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
  padding: '24px', width: '100%', maxWidth: '420px', animation: 'fadeIn 0.2s ease', color: '#fff'
}
const section = { marginBottom: '22px', paddingBottom: '22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }
const label = {
  display: 'block', fontSize: '12px', fontWeight: 600, color: '#4A6070',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px'
}
const input = {
  width: '100%', padding: '10px 13px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '9px', color: '#fff', fontSize: '14px', outline: 'none'
}
const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '9px',
  border: '1px solid rgba(30,200,120,0.3)', background: 'rgba(30,200,120,0.12)', color: '#1EC878',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer', flexShrink: 0
}
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070', padding: '4px', display: 'flex' }

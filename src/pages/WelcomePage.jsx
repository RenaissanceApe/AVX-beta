import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, MIN_PASSWORD_LENGTH } from '../lib/AuthContext'
import { logger, userMessage } from '../lib/logger'
import { useToast } from '../lib/ToastContext'
import { Zap, Loader2, ArrowRight } from 'lucide-react'

// Landing page for invitation emails. The invite link signs the person in;
// here they choose their display name and a password for future sign-ins.
export default function WelcomePage() {
  const { user, profile, loading: authLoading, updateProfile } = useAuth()
  const { notify } = useToast()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const name = fullName || profile?.full_name || ''

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Please enter your name')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    setSaving(true)
    const { error: pwError } = await supabase.auth.updateUser({ password, data: { full_name: name.trim() } })
    if (pwError) {
      setSaving(false)
      logger.error('auth', pwError, { step: 'welcomeSetPassword' })
      return setError(userMessage(pwError))
    }
    const { error: profileError } = await updateProfile({ full_name: name.trim() })
    if (profileError) logger.error('auth', profileError, { step: 'welcomeSetName' })
    setSaving(false)
    notify('Welcome to AVX!', 'success')
    navigate('/dashboard', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
              borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Zap size={20} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#fff' }}>AVX</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '20px', padding: '32px' }}>
          {authLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Loader2 size={22} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : !user ? (
            <>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>Invitation link expired</h1>
              <p style={{ color: '#4A6070', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
                Your account was created when you were invited. Use “Forgot password?” on the sign-in page with
                the email the invitation was sent to, and you'll get a fresh link to set your password.
              </p>
              <button onClick={() => navigate('/auth')} style={btn}>Go to sign in</button>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>Welcome to AVX</h1>
              <p style={{ color: '#4A6070', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px', wordBreak: 'break-all' }}>
                Set up your account for {user.email}.
              </p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input type="email" value={user.email} autoComplete="username" readOnly hidden />
                <input value={name} onChange={e => setFullName(e.target.value)} placeholder="Your full name"
                  autoComplete="name" maxLength={120} style={input} autoFocus required />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={`Choose a password (min. ${MIN_PASSWORD_LENGTH} characters)`} autoComplete="new-password" style={input} required />
                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: '13px' }}>
                    {error}
                  </div>
                )}
                <button type="submit" disabled={saving} style={btn}>
                  {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
                  Continue
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const input = {
  width: '100%', padding: '11px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '9px', color: '#fff', fontSize: '14px', outline: 'none',
}

const btn = {
  width: '100%', padding: '13px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #1EC878, #0FA85A)', color: '#fff', fontWeight: 700, fontSize: '15px',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
}

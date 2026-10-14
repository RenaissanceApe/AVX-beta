import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, MIN_PASSWORD_LENGTH } from '../lib/AuthContext'
import { logger, userMessage } from '../lib/logger'
import { useToast } from '../lib/ToastContext'
import { useI18n } from '../i18n'
import { Zap, Loader2, ArrowRight } from 'lucide-react'

// Landing page for the password reset email. supabase-js exchanges the token in the
// URL for a session automatically, so by the time the form is shown the user is signed in.
export default function ResetPasswordPage() {
  const { user, loading: authLoading, clearPasswordRecovery } = useAuth()
  const { notify } = useToast()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('auth.passwordMin', { min: MIN_PASSWORD_LENGTH }))
    if (password !== confirm) return setError(t('auth.passwordsDiffer'))
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      logger.error('auth', error, { step: 'updatePassword' })
      return setError(userMessage(error))
    }
    clearPasswordRecovery()
    notify(t('auth.passwordUpdated'), 'success')
    navigate('/dashboard', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
              borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(30,200,120,0.4)'
            }}>
              <Zap size={20} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontSize: '28px', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px' }}>AVX</span>
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '20px', padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#fff', margin: '0 0 20px 0' }}>{t('auth.setNewPassword')}</h2>

          {authLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Loader2 size={22} color="#1EC878" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : !user ? (
            <>
              <p style={{ color: '#4A6070', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
                {t('auth.resetLinkInvalid')}
              </p>
              <button onClick={() => navigate('/auth')} style={btn}>{t('auth.backToSignIn')}</button>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={t('auth.newPasswordPlaceholder', { min: MIN_PASSWORD_LENGTH })} autoComplete="new-password" style={input} autoFocus required />
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder={t('auth.confirmPassword')} autoComplete="new-password" style={input} required />
              {error && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171', fontSize: '13px' }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={saving} style={btn}>
                {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
                {t('auth.savePassword')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const input = {
  width: '100%', padding: '11px 14px',
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '9px', color: '#fff', fontSize: '14px',
  fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box',
}

const btn = {
  width: '100%', padding: '13px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
  color: '#fff', fontWeight: '700', fontSize: '15px', fontFamily: "'DM Sans', sans-serif",
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
}

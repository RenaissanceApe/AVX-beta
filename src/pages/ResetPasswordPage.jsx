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
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font-ui)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)'
            }}>
              <Zap size={20} color="var(--on-accent)" fill="var(--on-accent)" />
            </div>
            <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text)', letterSpacing: '-0.5px' }}>AVX</span>
          </div>
        </div>

        <div style={{ background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)', borderRadius: '20px', padding: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text)', margin: '0 0 20px 0' }}>{t('auth.setNewPassword')}</h2>

          {authLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Loader2 size={22} color="var(--accent-text)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : !user ? (
            <>
              <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '20px' }}>
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
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)', color: 'var(--danger)', fontSize: '13px' }}>
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
  background: 'color-mix(in srgb, var(--shade) 30%, transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)',
  borderRadius: '9px', color: 'var(--text)', fontSize: '14px',
  fontFamily: 'var(--font-ui)', outline: 'none', boxSizing: 'border-box',
}

const btn = {
  width: '100%', padding: '13px', borderRadius: '10px', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
  color: 'var(--on-accent)', fontWeight: '700', fontSize: '15px', fontFamily: 'var(--font-ui)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
}

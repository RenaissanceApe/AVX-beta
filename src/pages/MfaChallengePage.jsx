import { useEffect, useState } from 'react'
import { ShieldCheck, Loader2, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logger } from '../lib/logger'
import { useI18n } from '../i18n'
import { btnPrimary, input, label, colors } from '../components/ui'

// Second step of sign-in for people who turned on an authenticator app: until the
// 6-digit code is accepted, the database shows them nothing (see migration
// 20261022000000_two_step_sign_in.sql).
export default function MfaChallengePage() {
  const { signOut, user } = useAuth()
  const { t } = useI18n()
  const [factorId, setFactorId] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (err) logger.error('mfa', err, { step: 'listFactors' })
      setFactorId(data?.totp?.[0]?.id ?? null)
    })
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!factorId || code.length !== 6) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (err) {
      setCode('')
      setError(t('mfa.wrongCode'))
    }
    // On success the auth listener sees the stronger session and opens the app
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: '360px', background: colors.panel, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '18px', padding: '26px', color: '#fff' }}>
        <ShieldCheck size={30} color={colors.accent} />
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: '12px 0 6px' }}>{t('mfa.challengeTitle')}</h1>
        <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, marginBottom: '18px' }}>{t('mfa.challengeBody')}</p>
        <label style={label} htmlFor="mfa-code">{t('mfa.code')}</label>
        <input id="mfa-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456"
          style={{ ...input, fontSize: '22px', letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'monospace' }} />
        {error && <p role="alert" style={{ color: colors.danger, fontSize: '13px', marginTop: '8px' }}>{error}</p>}
        <button type="submit" disabled={busy || code.length !== 6 || !factorId} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginTop: '14px' }}>
          {busy ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={16} />} {t('mfa.verify')}
        </button>
        <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.6, marginTop: '16px' }}>{t('mfa.lostDevice')}</p>
        <button type="button" onClick={signOut} style={{ background: 'none', border: 'none', color: colors.soft, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: 0 }}>
          <LogOut size={14} /> {t('mfa.signOutAs', { email: user?.email || '' })}
        </button>
      </form>
    </div>
  )
}

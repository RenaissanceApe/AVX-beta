import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth, MIN_PASSWORD_LENGTH } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { logger, userMessage } from '../lib/logger'
import { useI18n, LANGUAGES } from '../i18n'
import { Zap, Eye, EyeOff, ArrowRight, Loader2, Mail, CheckCircle } from 'lucide-react'

export default function AuthPage() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [resendState, setResendState] = useState('idle') // idle | sending | sent
  const { signIn, signUp } = useAuth()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()

  // Handle email-link redirects. Supabase appends #access_token on success, or
  // #error=...&error_description=... when a link is expired or already used.
  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
    const linkError = hashParams.get('error_description') || params.get('error_description')
    const isConfirmation = hash.includes('access_token') || params.get('type') === 'signup'

    if (linkError) {
      logger.warn('auth', 'Email link error', { code: hashParams.get('error_code') || params.get('error_code') })
      setError(/expired|invalid/i.test(linkError)
        ? t('auth.linkExpired')
        : linkError.replace(/\+/g, ' '))
      window.history.replaceState({}, document.title, '/auth')
    } else if (isConfirmation) {
      // Let Supabase process the token from the URL
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          // Confirmed and signed in — go straight to dashboard
          navigate('/dashboard')
        } else {
          // Token processed but no session — show confirmed message
          setConfirmed(true)
          setMode('signin')
          // Clean up the URL
          window.history.replaceState({}, document.title, '/auth')
        }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function resendConfirmation() {
    setResendState('sending')
    const { error } = await supabase.auth.resend({
      type: 'signup', email,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    })
    if (error) {
      logger.error('auth', error, { step: 'resendConfirmation' })
      setError(userMessage(error))
      setResendState('idle')
    } else {
      setResendState('sent')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNeedsConfirmation(false)
    setLoading(true)
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`
        })
        if (error) throw error
        setResetSent(true)
      } else if (mode === 'magic') {
        // Existing accounts only. The reply is the same whether or not the email exists,
        // so the form can't be used to find out who has an account.
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/dashboard` },
        })
        if (error && !/signups? not allowed|user not found/i.test(error.message)) throw error
        if (error) logger.info('auth', 'Magic link requested for unknown email')
        setResetSent(true)
      } else if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) {
          if (/email not confirmed/i.test(error.message)) {
            setNeedsConfirmation(true)
            throw new Error(t('auth.confirmFirst'))
          }
          if (/invalid login credentials/i.test(error.message)) {
            throw new Error(t('auth.wrongPassword'))
          }
          throw error
        }
        navigate('/dashboard')
      } else {
        if (!fullName.trim()) throw new Error(t('auth.nameRequired'))
        if (password.length < MIN_PASSWORD_LENGTH) throw new Error(t('auth.passwordMin', { min: MIN_PASSWORD_LENGTH }))
        const { data, error } = await signUp(email, password, fullName.trim())
        if (error) throw error
        // Projects without email confirmation (e.g. the test project) sign in straight away
        if (data?.session) return navigate('/dashboard')
        setAwaitingConfirmation(true)
        setError('')
      }
    } catch (err) {
      setError(userMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // ── Awaiting email confirmation screen ──────────────────────────────────────
  if (awaitingConfirmation) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font-ui)' }}>
      <div style={{ textAlign: 'center', maxWidth: '380px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '20px', margin: '0 auto 24px',
          background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Mail size={32} color="var(--accent-text)" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text)', marginBottom: '12px' }}>{t('auth.checkEmail')}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '15px', lineHeight: '1.7', marginBottom: '8px' }}>
          {t('auth.sentLinkTo')}
        </p>
        <p style={{ color: 'var(--text)', fontWeight: '700', fontSize: '15px', marginBottom: '24px' }}>{email}</p>
        <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.7', marginBottom: '28px' }}>
          {t('auth.clickLink')}
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginBottom: '20px' }}>
          {t('auth.nothingArrived')}{' '}
          <button onClick={resendConfirmation} disabled={resendState !== 'idle'} style={{ ...linkButton, marginTop: 0 }}>
            {resendState === 'sent' ? t('auth.sentAgain') : resendState === 'sending' ? t('auth.sending') : t('auth.resendLower')}
          </button>.
        </p>
        <button onClick={() => { setAwaitingConfirmation(false); setMode('signin') }} style={{
          background: 'color-mix(in srgb, var(--fg) min(100%, calc(5% * var(--line-k))), transparent)', border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(10% * var(--line-k))), transparent)',
          borderRadius: '10px', padding: '11px 24px', color: 'var(--text)', fontSize: '14px',
          fontWeight: '600', fontFamily: 'var(--font-ui)', cursor: 'pointer'
        }}>
          {t('auth.backToSignIn')}
        </button>
      </div>
    </div>
  )

  // ── Email confirmed screen ───────────────────────────────────────────────────
  if (confirmed) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font-ui)' }}>
      <div style={{ textAlign: 'center', maxWidth: '380px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '20px', margin: '0 auto 24px',
          background: 'color-mix(in srgb, var(--accent) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <CheckCircle size={32} color="var(--accent-text)" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: '800', color: 'var(--text)', marginBottom: '12px' }}>{t('auth.emailConfirmed')}</h2>
        <p style={{ color: 'var(--muted)', fontSize: '15px', lineHeight: '1.7', marginBottom: '28px' }}>
          {t('auth.verified')}
        </p>
        <button onClick={() => setConfirmed(false)} style={{
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          border: 'none', borderRadius: '10px', padding: '13px 32px',
          color: 'var(--on-accent)', fontSize: '15px', fontWeight: '700',
          fontFamily: 'var(--font-ui)', cursor: 'pointer',
          boxShadow: '0 4px 16px color-mix(in srgb, var(--accent) 30%, transparent)'
        }}>
          {t('auth.signIn')} →
        </button>
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: 'var(--font-ui)'
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(color-mix(in srgb, var(--accent) 3%, transparent) 1px, transparent 1px),
          linear-gradient(90deg, color-mix(in srgb, var(--accent) 3%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none'
      }} />

      {/* Glow */}
      <div style={{
        position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '400px',
        background: 'radial-gradient(ellipse, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: '36px', height: '36px', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)'
            }}>
              <Zap size={20} color="var(--on-accent)" fill="var(--on-accent)" />
            </div>
            <span style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text)', letterSpacing: '-0.5px' }}>AVX</span>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '14px', margin: 0 }}>{t('app.tagline')}</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'color-mix(in srgb, var(--fg) min(100%, calc(3% * var(--line-k))), transparent)',
          border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(7% * var(--line-k))), transparent)',
          borderRadius: '20px',
          padding: '32px',
          backdropFilter: 'blur(20px)',
        }}>
          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: 'color-mix(in srgb, var(--shade) 30%, transparent)',
            borderRadius: '10px', padding: '4px', marginBottom: '28px'
          }}>
            {['signin', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); setResetSent(false) }} style={{
                flex: 1, padding: '8px', borderRadius: '7px', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600', fontFamily: 'var(--font-ui)',
                transition: 'all 0.2s',
                background: mode === m ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: mode === m ? 'var(--accent-text)' : 'var(--muted)',
                border: mode === m ? '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' : '1px solid transparent',
              }}>
                {m === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('auth.fullName')}
                </label>
                <input
                  type="text" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="João Silva"
                  autoComplete="name"
                  style={inputStyle}
                  required
                />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('common.email')}
              </label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                style={inputStyle}
                required
              />
            </div>
            {mode !== 'reset' && mode !== 'magic' && <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('auth.password')}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? t('auth.passwordMin', { min: MIN_PASSWORD_LENGTH }) : '••••••••'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                  style={{ ...inputStyle, paddingRight: '44px' }}
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)} aria-label={showPass ? t('auth.hidePassword') : t('auth.showPassword')} style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px',
                  display: 'flex', alignItems: 'center'
                }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {mode === 'signin' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => { setMode('reset'); setError(''); setResetSent(false) }} style={linkButton}>
                    {t('auth.forgot')}
                  </button>
                  <button type="button" onClick={() => { setMode('magic'); setError(''); setResetSent(false) }} style={linkButton}>
                    {t('auth.magicLink')}
                  </button>
                </div>
              )}
            </div>}

            {mode === 'signup' && (
              <p style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: '1.6', margin: 0 }}>
                {t('auth.agreePrefix')} <Link to="/terms" style={footerLink}>{t('auth.agreeTerms')}</Link> {t('auth.agreeAnd')}
                {' '}<Link to="/privacy" style={footerLink}>{t('auth.agreePrivacy')}</Link>.
              </p>
            )}

            {(mode === 'reset' || mode === 'magic') && (
              <p role="status" style={{ color: resetSent ? 'var(--accent-text)' : 'var(--muted)', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>
                {mode === 'reset'
                  ? (resetSent ? t('auth.resetSent', { email }) : t('auth.resetIntro'))
                  : (resetSent ? t('auth.magicSent', { email }) : t('auth.magicIntro'))}
              </p>
            )}

            {error && (
              <div role="alert" style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
                color: 'var(--danger)', fontSize: '13px'
              }}>
                {error}
                {needsConfirmation && (
                  <div>
                    <button type="button" onClick={resendConfirmation} disabled={resendState !== 'idle'} style={linkButton}>
                      {resendState === 'sent' ? t('auth.confirmationSent') : resendState === 'sending' ? t('auth.sending') : t('auth.resend')}
                    </button>
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              marginTop: '4px',
              padding: '13px', borderRadius: '10px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: 'var(--on-accent)', fontWeight: '700', fontSize: '15px',
              fontFamily: 'var(--font-ui)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 20px color-mix(in srgb, var(--accent) 30%, transparent)',
            }}>
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {loading ? t('common.pleaseWait') : mode === 'signin' ? t('auth.signIn') : mode === 'reset' ? t('auth.sendReset') : mode === 'magic' ? t('auth.sendMagic') : t('auth.createAccount')}
              {!loading && <ArrowRight size={16} />}
            </button>
            {(mode === 'reset' || mode === 'magic') && (
              <button type="button" onClick={() => { setMode('signin'); setError(''); setResetSent(false) }} style={{ ...linkButton, alignSelf: 'center' }}>
                {t('auth.backToSignIn')}
              </button>
            )}
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '12px', marginTop: '24px' }}>
          AVX Beta · Lumen and Pixel, Lda. ·{' '}
          <Link to="/privacy" style={footerLink}>{t('legal.privacyShort')}</Link> ·{' '}
          <Link to="/terms" style={footerLink}>{t('legal.termsShort')}</Link>
        </p>
        <div role="group" aria-label={t('account.language')} style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '10px' }}>
          {LANGUAGES.map(l => (
            <button key={l.value} type="button" onClick={() => setLang(l.value)} aria-pressed={lang === l.value} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px 4px',
              color: lang === l.value ? 'var(--accent-text)' : 'var(--muted)', fontWeight: lang === l.value ? 700 : 500,
            }}>{l.label}</button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '11px 14px',
  background: 'color-mix(in srgb, var(--shade) 30%, transparent)',
  border: '1px solid color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)',
  borderRadius: '9px', color: 'var(--text)',
  fontSize: '14px', fontFamily: 'var(--font-ui)',
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

const linkButton = {
  background: 'none', border: 'none', padding: 0, marginTop: '8px',
  color: 'var(--accent-text)', fontSize: '13px', fontWeight: '600',
  fontFamily: 'var(--font-ui)', cursor: 'pointer',
}

const footerLink = { color: 'var(--muted)', textDecoration: 'underline' }

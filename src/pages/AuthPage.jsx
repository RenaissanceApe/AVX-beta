import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
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
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  // Handle email confirmation redirect — Supabase appends #access_token or ?type=signup to the URL
  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(window.location.search)
    const isConfirmation = hash.includes('access_token') || params.get('type') === 'signup'

    if (isConfirmation) {
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
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) throw error
        navigate('/dashboard')
      } else {
        if (!fullName.trim()) throw new Error('Full name is required')
        const { data, error } = await signUp(email, password, fullName)
        if (error) throw error
        // Supabase requires email confirmation by default
        setAwaitingConfirmation(true)
        setError('')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Awaiting email confirmation screen ──────────────────────────────────────
  if (awaitingConfirmation) return (
    <div style={{ minHeight: '100vh', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: 'center', maxWidth: '380px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '20px', margin: '0 auto 24px',
          background: 'rgba(30,200,120,0.1)', border: '1px solid rgba(30,200,120,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Mail size={32} color="#1EC878" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>Check your email</h2>
        <p style={{ color: '#4A6070', fontSize: '15px', lineHeight: '1.7', marginBottom: '8px' }}>
          We sent a confirmation link to
        </p>
        <p style={{ color: '#fff', fontWeight: '700', fontSize: '15px', marginBottom: '24px' }}>{email}</p>
        <p style={{ color: '#4A6070', fontSize: '14px', lineHeight: '1.7', marginBottom: '28px' }}>
          Click the link in the email to confirm your account. Once confirmed, you'll be signed in automatically.
        </p>
        <button onClick={() => { setAwaitingConfirmation(false); setMode('signin') }} style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '11px 24px', color: '#fff', fontSize: '14px',
          fontWeight: '600', fontFamily: "'DM Sans', sans-serif", cursor: 'pointer'
        }}>
          Back to Sign In
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
    </div>
  )

  // ── Email confirmed screen ───────────────────────────────────────────────────
  if (confirmed) return (
    <div style={{ minHeight: '100vh', background: '#080C14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ textAlign: 'center', maxWidth: '380px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '20px', margin: '0 auto 24px',
          background: 'rgba(30,200,120,0.1)', border: '1px solid rgba(30,200,120,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <CheckCircle size={32} color="#1EC878" />
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#fff', marginBottom: '12px' }}>Email confirmed</h2>
        <p style={{ color: '#4A6070', fontSize: '15px', lineHeight: '1.7', marginBottom: '28px' }}>
          Your account is verified. Sign in below to get started.
        </p>
        <button onClick={() => setConfirmed(false)} style={{
          background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
          border: 'none', borderRadius: '10px', padding: '13px 32px',
          color: '#fff', fontSize: '15px', fontWeight: '700',
          fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(30,200,120,0.3)'
        }}>
          Sign In →
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#080C14',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: "'DM Sans', sans-serif"
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(30,200,120,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(30,200,120,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        pointerEvents: 'none'
      }} />

      {/* Glow */}
      <div style={{
        position: 'fixed', top: '-20%', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '400px',
        background: 'radial-gradient(ellipse, rgba(30,200,120,0.08) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{
              width: '36px', height: '36px', background: 'linear-gradient(135deg, #1EC878, #0FA85A)',
              borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(30,200,120,0.4)'
            }}>
              <Zap size={20} color="#fff" fill="#fff" />
            </div>
            <span style={{ fontSize: '28px', fontWeight: '800', color: '#fff', letterSpacing: '-0.5px' }}>AVX</span>
          </div>
          <p style={{ color: '#4A6070', fontSize: '14px', margin: 0 }}>AV Production Copilot</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '20px',
          padding: '32px',
          backdropFilter: 'blur(20px)',
        }}>
          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: 'rgba(0,0,0,0.3)',
            borderRadius: '10px', padding: '4px', marginBottom: '28px'
          }}>
            {['signin', 'signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: '600', fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.2s',
                background: mode === m ? 'rgba(30,200,120,0.15)' : 'transparent',
                color: mode === m ? '#1EC878' : '#4A6070',
                border: mode === m ? '1px solid rgba(30,200,120,0.25)' : '1px solid transparent',
              }}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#4A6070', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Full Name
                </label>
                <input
                  type="text" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="João Silva"
                  style={inputStyle}
                  required
                />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#4A6070', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Email
              </label>
              <input
                type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#4A6070', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingRight: '44px' }}
                  required
                />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#4A6070', padding: '4px',
                  display: 'flex', alignItems: 'center'
                }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                color: '#F87171', fontSize: '13px'
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              marginTop: '4px',
              padding: '13px', borderRadius: '10px', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'rgba(30,200,120,0.4)' : 'linear-gradient(135deg, #1EC878, #0FA85A)',
              color: '#fff', fontWeight: '700', fontSize: '15px',
              fontFamily: "'DM Sans', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(30,200,120,0.3)',
            }}>
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#2A3A48', fontSize: '12px', marginTop: '24px' }}>
          AVX Beta · Lumen and Pixel, Lda.
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '11px 14px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '9px', color: '#fff',
  fontSize: '14px', fontFamily: "'DM Sans', sans-serif",
  outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.2s',
}

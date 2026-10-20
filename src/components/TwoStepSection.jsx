import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { useI18n } from '../i18n'
import { track } from '../lib/usage'
import { Hint } from './help/HelpParts'

// Account → Two-step sign-in: turn an authenticator app (Google Authenticator, 1Password,
// Authy…) on or off. With it on, signing in also needs a 6-digit code from the app.
// Supabase hands back the QR code as an unescaped SVG data URL; its "#" colours cut the
// URL short in Chromium, so escape the SVG first.
export function qrSrc(qr) {
  const svg = String(qr || '').replace(/^(data:image\/svg\+xml;[^,]*,)+/, '')
  if (!svg.trim().startsWith('<')) return qr
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// The authenticator link with AVX's name and icon: apps that show service icons from the link
// (FreeOTP, 2FAS, Ente Auth and others) pick it up. Authy and Google Authenticator use their own
// icon lists and ignore it.
export function totpUriWithLogo(uri, origin) {
  if (!uri) return uri
  const url = new URL(uri)
  url.searchParams.set('issuer', 'AVX')
  url.searchParams.set('image', `${origin}/icon-512.png`)
  return url.toString()
}

export default function TwoStepSection({ label, input, smallBtn }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [factor, setFactor] = useState(undefined) // undefined = loading, null = off
  const [enrolling, setEnrolling] = useState(null) // { id, qr, secret }
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) logger.error('mfa', error, { step: 'listFactors' })
    setFactor(data?.totp?.find(f => f.status === 'verified') ?? null)
  }
  useEffect(() => { load() }, [])

  async function start() {
    setBusy(true)
    // Clear half-finished attempts so a new one can start
    const { data: all } = await supabase.auth.mfa.listFactors()
    for (const f of all?.all || []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'AVX', friendlyName: `AVX ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (error) {
      logger.error('mfa', error, { step: 'enroll' })
      return notify(userMessage(error), 'error')
    }
    let qr = qrSrc(data.totp.qr_code)
    try {
      qr = await QRCode.toDataURL(totpUriWithLogo(data.totp.uri, window.location.origin), { margin: 1, width: 220, errorCorrectionLevel: 'M' })
    } catch (err) {
      logger.warn('mfa', 'Own QR code failed, using Supabase\'s', { message: err?.message })
    }
    setEnrolling({ id: data.id, qr, secret: data.totp.secret })
  }

  async function confirm(e) {
    e.preventDefault()
    if (code.length !== 6) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code })
    setBusy(false)
    if (error) {
      setCode('')
      return notify(t('mfa.wrongCode'), 'error')
    }
    setEnrolling(null)
    setCode('')
    notify(t('mfa.enabled'), 'success')
    track('account:mfa-on')
    load()
  }

  async function turnOff() {
    if (!window.confirm(t('mfa.confirmOff'))) return
    setBusy(true)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    setBusy(false)
    if (error) {
      logger.error('mfa', error, { step: 'unenroll' })
      return notify(userMessage(error), 'error')
    }
    // Drop the now-unneeded second-step level from the current session
    await supabase.auth.refreshSession()
    notify(t('mfa.disabled'), 'success')
    load()
  }

  const hint = { color: 'var(--muted)', fontSize: '12px', marginTop: '8px', lineHeight: 1.5 }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}><span style={{ ...label, marginBottom: 0 }}>{t('mfa.title')}</span><Hint id="two-step" label={t('mfa.title')} /></div>
      {factor === undefined ? <Loader2 size={16} color="var(--accent-text)" style={{ animation: 'spin 1s linear infinite' }} />
        : factor ? (
          <>
            <p style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <ShieldCheck size={16} color="var(--accent-text)" /> {t('mfa.on')}
            </p>
            <button onClick={turnOff} disabled={busy} style={{ ...smallBtn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)', color: 'var(--danger)' }}>
              <ShieldOff size={14} /> {t('mfa.turnOff')}
            </button>
          </>
        ) : enrolling ? (
          <form onSubmit={confirm}>
            <p style={{ fontSize: '13px', color: 'var(--soft)', lineHeight: 1.6, marginBottom: '10px' }}>{t('mfa.scan')}</p>
            <img src={enrolling.qr} alt={t('mfa.qrAlt')} width={180} height={180} style={{ background: '#fff', borderRadius: '10px', padding: '8px', display: 'block', marginBottom: '8px' }} />
            <p style={{ ...hint, marginTop: 0, wordBreak: 'break-all' }}>{t('mfa.manual')} <code style={{ color: 'var(--text)' }}>{enrolling.secret}</code></p>
            <label style={{ ...label, marginTop: '12px' }} htmlFor="mfa-enrol-code">{t('mfa.code')}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input id="mfa-enrol-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="123456" style={{ ...input, fontFamily: 'var(--font-mono)', letterSpacing: '0.2em' }} />
              <button type="submit" disabled={busy || code.length !== 6} style={smallBtn}>
                {busy && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} {t('mfa.confirm')}
              </button>
            </div>
          </form>
        ) : (
          <>
            <button onClick={start} disabled={busy} style={smallBtn}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShieldCheck size={14} />} {t('mfa.turnOn')}
            </button>
            <p style={hint}>{t('mfa.hint')}</p>
          </>
        )}
    </div>
  )
}

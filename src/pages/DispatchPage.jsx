import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import jsQR from 'jsqr'
import { ArrowLeft, Camera, CameraOff, ScanLine, Check, AlertTriangle, X, Loader2, PackageCheck, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { codeFromScan, dispatchProgress } from '../lib/inventory'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { btn, btnPrimary, input, label, card, colors, tint } from '../components/ui'
import { Hint } from '../components/help/HelpParts'

const AMBER = 'var(--warn)'
const REPEAT_MS = 2500 // the same code seen again within this time is the same scan

// Scan equipment out to a gig and back in: with the phone camera (QR labels), a USB/Bluetooth
// scanner (types the code + Enter), or by typing the code. Every scan is checked and logged by
// the database (dispatch_scan); warnings never stop what really happened.
//   /gig/:id/scan
export default function DispatchPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { roleIn } = useWorkspace()
  const { notify } = useToast()
  const { ago } = useI18n()
  const [gig, setGig] = useState(null)
  const [allowed, setAllowed] = useState(null)
  const [summary, setSummary] = useState([])
  const [unitsOut, setUnitsOut] = useState([])
  const [direction, setDirection] = useState('out')
  const [damaged, setDamaged] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [code, setCode] = useState('')
  const [feed, setFeed] = useState([])
  const [busy, setBusy] = useState(false)
  const [camera, setCamera] = useState(false)
  const inputRef = useRef(null)
  const last = useRef({ code: '', at: 0 })

  const loadProgress = useCallback(async () => {
    const [s, u] = await Promise.all([
      supabase.rpc('gig_dispatch_summary', { p_gig: id }),
      supabase.rpc('gig_units_out', { p_gig: id }),
    ])
    if (s.error) logger.error('dispatch', s.error, { step: 'summary' })
    setSummary(s.data || [])
    setUnitsOut(u.data || [])
  }, [id])

  useEffect(() => {
    supabase.from('gigs').select('*').eq('id', id).maybeSingle().then(async ({ data }) => {
      setGig(data || false)
      if (!data) return setAllowed(false)
      const role = roleIn(data.org_id)
      const { data: me } = await supabase.from('gig_members').select('role').eq('gig_id', id).eq('user_id', user.id).maybeSingle()
      setAllowed(role === 'admin' || role === 'member' || me?.role === 'pm' || data.created_by === user.id)
    })
    loadProgress()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const scan = useCallback(async raw => {
    const value = codeFromScan(raw)
    if (!value) { setFeed(f => [{ key: Date.now(), tone: 'error', text: t('dispatch.badCode', { code: String(raw).slice(0, 40) }) }, ...f].slice(0, 30)); return }
    const now = Date.now()
    if (value === last.current.code && now - last.current.at < REPEAT_MS) return
    last.current = { code: value, at: now }
    setBusy(true)
    const qty = Math.max(1, Math.min(100000, Math.round(Number(quantity) || 1)))
    const { data, error } = await supabase.rpc('dispatch_scan', {
      p_gig: id, p_code: value, p_direction: direction, p_quantity: qty, p_condition: direction === 'in' && damaged ? 'damaged' : 'ok',
    })
    setBusy(false)
    setCode('')
    if (error) {
      logger.error('dispatch', error, { step: 'scan' })
      return notify(userMessage(error), 'error')
    }
    const tone = !data.ok ? 'error' : data.warning ? 'warn' : 'ok'
    try { navigator.vibrate?.(tone === 'ok' ? 40 : [60, 60, 60]) } catch { /* not supported */ }
    if (data.ok) {
      track(`dispatch:${direction}`)
      setQuantity('1')
      setDamaged(false)
    }
    setFeed(f => [{ key: now, tone, code: value, result: data, direction }, ...f].slice(0, 30))
    loadProgress()
    inputRef.current?.focus()
  }, [id, direction, damaged, quantity, loadProgress, notify])

  async function markLost() {
    if (!window.confirm(t('dispatch.markLostConfirm', { count: unitsOut.length }))) return
    const { data, error } = await supabase.rpc('mark_units_lost', { p_gig: id })
    if (error) return notify(userMessage(error), 'error')
    track('dispatch:marked-lost')
    notify(t('dispatch.markedLost', { count: data }), 'success')
    loadProgress()
  }

  if (gig === null || allowed === null) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><Loader2 size={24} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /></div></AppShell>
  if (!gig || !allowed) return (
    <AppShell>
      <div style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '16px' }}>{t('dispatch.noAccess')}</p>
        <button onClick={() => navigate(gig ? `/gig/${id}?tab=equipment` : '/dashboard')} style={btn}><ArrowLeft size={14} /> {t('common.back')}</button>
      </div>
    </AppShell>
  )

  const progress = dispatchProgress(summary)
  return (
    <AppShell>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '16px 16px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button onClick={() => navigate(`/gig/${id}?tab=equipment`)} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft, padding: '6px 10px' }}><ArrowLeft size={14} /> {gig.name}</button>
          <button onClick={() => navigate(`/gig/${id}/packing`)} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft, padding: '6px 10px', marginLeft: 'auto' }}><ClipboardList size={14} /> {t('dispatch.packingList')}</button>
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '12px' }}>{t('dispatch.title')}</h1>

        <div role="radiogroup" aria-label={t('dispatch.direction')} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
          {['out', 'in'].map(d => (
            <button key={d} role="radio" aria-checked={direction === d} onClick={() => { setDirection(d); inputRef.current?.focus() }} style={{
              padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: 800, cursor: 'pointer',
              border: `2px solid ${direction === d ? (d === 'out' ? colors.accent : 'var(--sky)') : colors.border}`,
              background: direction === d ? (d === 'out' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'color-mix(in srgb, var(--sky) 12%, transparent)') : 'transparent',
              color: direction === d ? 'var(--text)' : colors.soft,
            }}>{t(`dispatch.dir.${d}`)}</button>
          ))}
        </div>

        <div style={{ ...card, marginBottom: '12px' }}>
          {camera && <CameraScanner onCode={scan} onClose={() => setCamera(false)} />}
          <form onSubmit={e => { e.preventDefault(); if (code.trim()) scan(code) }} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={label} htmlFor="scan-code">{t('dispatch.code')}</label>
              <input id="scan-code" ref={inputRef} value={code} onChange={e => setCode(e.target.value)} autoFocus autoComplete="off" autoCapitalize="characters"
                placeholder={t('dispatch.codePlaceholder')} style={{ ...input, fontFamily: 'var(--font-mono)', fontSize: '16px' }} />
            </div>
            <div style={{ width: '90px' }}>
              <label style={label} htmlFor="scan-qty">{t('dispatch.qty')}</label>
              <input id="scan-qty" type="number" min={1} max={100000} value={quantity} onChange={e => setQuantity(e.target.value)} style={input} />
            </div>
            <button type="submit" disabled={busy || !code.trim()} style={btnPrimary}>
              {busy ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ScanLine size={15} />} {t('dispatch.record')}
            </button>
            <button type="button" onClick={() => setCamera(c => !c)} style={btn}>{camera ? <CameraOff size={15} /> : <Camera size={15} />} {camera ? t('dispatch.cameraOff') : t('dispatch.cameraOn')}</button>
          </form>
          <p style={{ fontSize: '12px', color: colors.muted, marginTop: '8px', lineHeight: 1.5 }}>{t('dispatch.hint')}</p>
          {direction === 'in' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: damaged ? AMBER : colors.soft, marginTop: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={damaged} onChange={e => setDamaged(e.target.checked)} style={{ accentColor: AMBER }} /> {t('dispatch.damaged')}
            </label>
          )}
        </div>

        {feed.length > 0 && (
          <section aria-live="polite" style={{ marginBottom: '16px' }}>
            {feed.slice(0, 8).map(f => <FeedRow key={f.key} entry={f} />)}
          </section>
        )}

        <section style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackageCheck size={16} /> {direction === 'out' ? t('dispatch.packed', { done: progress.out, total: progress.planned }) : t('dispatch.returned', { done: progress.back, total: progress.outTotal })}
          </h2>
          <div style={{ height: '6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{ height: '100%', background: direction === 'out' ? colors.accent : 'var(--sky)',
              width: `${Math.min(100, 100 * (direction === 'out' ? progress.out / Math.max(1, progress.planned) : progress.back / Math.max(1, progress.outTotal)))}%` }} />
          </div>
          {summary.length === 0 ? <p style={{ fontSize: '13px', color: colors.muted }}>{t('dispatch.nothingPlanned')}</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {summary.map(r => {
                const target = direction === 'out' ? r.planned : r.out_qty
                const done = direction === 'out' ? r.out_qty : r.back_qty
                const complete = target > 0 && done >= target
                return (
                  <div key={r.item_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 4px', borderBottom: `1px solid ${colors.border}`, fontSize: '13px' }}>
                    <span style={{ width: '18px', color: complete ? colors.accentText : done > target && target > 0 ? AMBER : colors.muted }}>{complete ? <Check size={14} /> : null}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{r.item_name}{!r.planned && <span style={{ color: AMBER, fontSize: '11px' }}> · {t('dispatch.notPlannedShort')}</span>}</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums', color: done > target && target > 0 ? AMBER : 'var(--text)' }}>{done} / {target}</strong>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {unitsOut.length > 0 && (
          <section style={{ ...card }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>{t('dispatch.unitsOut', { count: unitsOut.length })}</h2>
            <div style={{ fontSize: '12px', color: colors.soft, lineHeight: 1.8, marginBottom: '10px' }}>
              {unitsOut.map(u => <div key={u.unit_id}><span style={{ fontFamily: 'var(--font-mono)' }}>{u.code}</span> · {u.item_name}{u.serial ? ` · ${u.serial}` : ''} · {ago(u.out_since)}</div>)}
            </div>
            {direction === 'in' && (
              <button onClick={markLost} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)', color: colors.danger }}>
                <X size={14} /> {t('dispatch.markLost', { count: unitsOut.length })}
              </button>
            )}
            {direction === 'in' && <Hint id="mark-lost" label={t('dispatch.markLost', { count: unitsOut.length })} />}
          </section>
        )}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </AppShell>
  )
}

function FeedRow({ entry }) {
  const r = entry.result
  const colour = entry.tone === 'ok' ? colors.accent : entry.tone === 'warn' ? AMBER : colors.danger
  const Icon = entry.tone === 'ok' ? Check : entry.tone === 'warn' ? AlertTriangle : X
  const what = r ? [r.item_name, r.unit_code, r.serial].filter(Boolean).join(' · ') : ''
  const msg = !r ? entry.text
    : !r.ok ? t(`dispatch.error.${r.error}`, { gig: r.other_gig || '' })
    : r.warning ? t(`dispatch.warning.${r.warning}`, { gig: r.other_gig || '' })
    : r.kind === 'bulk' ? t(`dispatch.okBulk.${entry.direction}`, { count: r.quantity }) : t(`dispatch.ok.${entry.direction}`)
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 10px', borderRadius: '10px', marginBottom: '4px',
      background: tint(colour, 8), border: `1px solid ${tint(colour, 33)}`, fontSize: '13px' }}>
      <Icon size={15} color={colour} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {what && <strong style={{ display: 'block' }}>{what}</strong>}
        <span style={{ color: colour }}>{msg}</span>
        {r?.ok && r.planned != null && <span style={{ color: colors.muted }}> · {t('dispatch.counts', { out: r.out, back: r.back, planned: r.planned })}</span>}
        {r?.repair && <span style={{ display: 'block', color: AMBER }}>{t('dispatch.repairOpened')}</span>}
        {r?.ok && r.contents != null && (
          <span style={{ display: 'block', color: r.contents_skipped ? AMBER : colors.soft }}>
            {t(`dispatch.caseContents.${entry.direction}`, { count: r.contents })}{r.contents_skipped ? ` · ${t('dispatch.caseSkipped', { count: r.contents_skipped })}` : ''}
          </span>
        )}
      </span>
    </div>
  )
}

// The phone camera as a scanner: the browser's own barcode reader where there is one
// (Chrome on Android), otherwise QR codes are read from the video with jsQR
function CameraScanner({ onCode, onClose }) {
  const videoRef = useRef(null)
  const [error, setError] = useState(null)
  // The camera starts once; the latest scan settings come through this ref
  const onCodeRef = useRef(onCode)
  useEffect(() => { onCodeRef.current = onCode }, [onCode])

  useEffect(() => {
    let stream = null
    let timer = null
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const detector = 'BarcodeDetector' in window
      ? (() => { try { return new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix'] }) } catch { return null } })()
      : null

    async function tick() {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        try {
          if (detector) {
            const found = await detector.detect(video)
            if (found[0]?.rawValue) onCodeRef.current(found[0].rawValue)
          } else {
            const w = Math.min(640, video.videoWidth)
            const h = Math.round(video.videoHeight * (w / video.videoWidth))
            canvas.width = w; canvas.height = h
            ctx.drawImage(video, 0, 0, w, h)
            const img = ctx.getImageData(0, 0, w, h)
            const qr = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
            if (qr?.data) onCodeRef.current(qr.data)
          }
        } catch { /* a bad frame; try the next one */ }
      }
      timer = setTimeout(tick, 250)
    }

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => {
        if (stopped) { s.getTracks().forEach(tr => tr.stop()); return }
        stream = s
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}) }
        tick()
      })
      .catch(err => setError(err?.name === 'NotAllowedError' ? 'denied' : 'unavailable'))
    if (!navigator.mediaDevices?.getUserMedia) setError('unavailable')

    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(tr => tr.stop()) }
  }, [])

  return (
    <div style={{ marginBottom: '12px' }}>
      {error ? (
        <p role="alert" style={{ fontSize: '13px', color: AMBER, lineHeight: 1.5 }}>
          {t(`dispatch.camera.${error}`)} <button onClick={onClose} style={{ ...btn, padding: '4px 8px', fontSize: '12px', marginLeft: '6px' }}>{t('common.close')}</button>
        </p>
      ) : (
        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', aspectRatio: '4 / 3', maxHeight: '50vh' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div aria-hidden style={{ position: 'absolute', inset: '18%', border: `2px solid ${colors.accent}`, borderRadius: '14px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
        </div>
      )}
    </div>
  )
}

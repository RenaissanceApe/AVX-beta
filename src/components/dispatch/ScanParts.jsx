import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Check, AlertTriangle, X, Flashlight, FlashlightOff, Minus, Plus, Volume2, VolumeX, Speech, ScanLine, PackageCheck, Undo2 } from 'lucide-react'
import { canSpeak } from '../../lib/fieldKit'
import { STEPS } from '../../lib/inventory'
import { t } from '../../i18n'
import { btn, btnPrimary, input, colors, AvxLoader } from '../ui'
import { Segments } from '../gig/StepBars'

export const AMBER = 'var(--warn)'
const TONE = {
  ok: { colour: colors.accentText, text: colors.accentText, Icon: Check },
  warn: { colour: AMBER, text: AMBER, Icon: AlertTriangle },
  error: { colour: colors.danger, text: colors.danger, Icon: X },
}

// Steps on the way out in green, on the way back in blue
export const stepHue = step => (STEPS.indexOf(step) <= STEPS.indexOf('on_site') ? colors.accent : 'var(--sky)')

// A scan that can still be undone: it went through, it's this person's, and it opened no repair
export const canUndo = entry => !!(entry?.result?.ok && entry.result.batch && !entry.result.repair && !entry.undone)

// What a scan did, in words: { what: "Martin MAC Aura · U-0042", msg: "Out", extra: [...] }
// Scans out and in have a direction; the other steps only a step.
export function feedText(entry) {
  const r = entry.result
  const what = r ? [r.item_name, r.unit_code, r.serial].filter(Boolean).join(' · ') : ''
  const vars = { gig: r?.other_gig || '', step: entry.step ? t(`steps.name.${entry.step}`) : '' }
  const msg = !r ? entry.text
    : entry.undone ? t('undoScan.undone')
    : !r.ok ? t(`dispatch.error.${r.error}`, vars)
    : r.warning ? t(`dispatch.warning.${r.warning}`, vars)
    : !entry.direction ? (r.kind === 'bulk' ? t('steps.okBulk', { ...vars, count: r.quantity }) : t('steps.ok', vars))
    : r.kind === 'bulk' ? t(`dispatch.okBulk.${entry.direction}`, { count: r.quantity }) : t(`dispatch.ok.${entry.direction}`)
  const extra = []
  if (r?.repair) extra.push({ text: t('dispatch.repairOpened'), warn: true })
  if (r?.ok && r.contents != null) {
    extra.push({
      text: (entry.direction ? t(`dispatch.caseContents.${entry.direction}`, { count: r.contents }) : t('steps.caseContents', { count: r.contents }))
        + (r.contents_skipped ? ` · ${t('dispatch.caseSkipped', { count: r.contents_skipped })}` : ''),
      warn: !!r.contents_skipped,
    })
  }
  return { what, msg, extra }
}

export function FeedRow({ entry, onUndo }) {
  const r = entry.result
  const { colour, text, Icon } = entry.undone ? { colour: colors.muted, text: colors.muted, Icon: Undo2 } : TONE[entry.tone] || TONE.ok
  const { what, msg, extra } = feedText(entry)
  return (
    // A log line (DESIGN.md "ScanPanel"): ✓ ⚠ ✕ in their colour, the words in text colour
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 12px', background: 'var(--panel)',
      border: '1px solid var(--line)', borderLeft: `2px solid ${colour}`, marginBottom: '-1px', fontSize: '13px' }}>
      <Icon size={15} color={text} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {what && <strong style={{ display: 'block', fontWeight: 600, textDecoration: entry.undone ? 'line-through' : 'none' }}>{what}</strong>}
        <span style={{ color: entry.undone ? colors.muted : 'var(--text-2)' }}>{msg}</span>
        {r?.ok && !entry.undone && r.planned != null && (
          <span style={{ color: colors.muted }}> · {entry.direction ? t('dispatch.counts', { out: r.out, back: r.back, planned: r.planned }) : t('steps.counts', { done: r.done, planned: r.planned })}</span>
        )}
        {!entry.undone && extra.map(x => <span key={x.text} style={{ display: 'block', color: x.warn ? AMBER : colors.soft }}>{x.text}</span>)}
      </span>
      {onUndo && canUndo(entry) && (
        <button type="button" onClick={() => onUndo(entry)} style={{ ...btn, padding: '4px 10px', fontSize: '13px', flexShrink: 0 }}>
          <Undo2 size={13} aria-hidden="true" /> {t('common.undo')}<span className="sr-only"> {what}</span>
        </button>
      )}
    </div>
  )
}

// Which step a scan records: the organisation's steps as one row of big choices
export function StepPicker({ steps, step, onChange, big = false }) {
  const cols = steps.length <= 2 ? 2 : 3
  return (
    <div role="radiogroup" aria-label={t('steps.picker')} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: big ? '8px' : '6px' }}>
      {steps.map(s => {
        const on = step === s
        const hue = stepHue(s)
        return (
          <button key={s} type="button" role="radio" aria-checked={on} onClick={() => onChange(s)} style={{
            minHeight: big ? '60px' : '48px', padding: '8px 4px', cursor: 'pointer', lineHeight: 1.2,
            fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0, overflowWrap: 'anywhere', minWidth: 0,
            fontSize: big ? (steps.length <= 2 ? '16px' : '14px') : '13px', fontWeight: 700,
            border: `${on ? 2 : 1}px solid ${on ? hue : 'var(--line-strong)'}`, background: on ? 'var(--selection)' : 'transparent',
            color: on ? 'var(--text)' : colors.soft,
          }}>{t(`steps.name.${s}`)}</button>
        )
      })}
    </div>
  )
}

// The phone camera as a scanner: the browser's own barcode reader where there is one
// (Chrome on Android), otherwise QR codes are read from the video with jsQR. A torch button
// shows where the phone lets the browser use its light (Android; not iPhones yet).
export function CameraScanner({ onCode, onClose, tall = false }) {
  const videoRef = useRef(null)
  const [error, setError] = useState(null)
  const [torchTrack, setTorchTrack] = useState(null)
  const [torch, setTorch] = useState(false)
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
        const track = s.getVideoTracks()[0]
        try { if (track?.getCapabilities?.().torch) setTorchTrack(track) } catch { /* no torch */ }
        tick()
      })
      .catch(err => setError(err?.name === 'NotAllowedError' ? 'denied' : 'unavailable'))
    if (!navigator.mediaDevices?.getUserMedia) setError('unavailable')

    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(tr => tr.stop()) }
  }, [])

  async function toggleTorch() {
    const on = !torch
    try {
      await torchTrack.applyConstraints({ advanced: [{ torch: on }] })
      setTorch(on)
    } catch { setTorchTrack(null) }
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      {error ? (
        <p role="alert" style={{ fontSize: '13px', color: AMBER, lineHeight: 1.5 }}>
          {t(`dispatch.camera.${error}`)} <button onClick={onClose} style={{ ...btn, padding: '4px 8px', fontSize: '13px', marginLeft: '6px' }}>{t('common.close')}</button>
        </p>
      ) : (
        <div style={{ position: 'relative', overflow: 'hidden', background: '#000', aspectRatio: '4 / 3', maxHeight: tall ? '42vh' : '50vh', margin: '0 auto' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <ScanBrackets />
          {torchTrack && (
            <button type="button" onClick={toggleTorch} aria-pressed={torch} style={{
              position: 'absolute', right: '10px', bottom: '10px', minWidth: '52px', minHeight: '52px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              border: '2px solid #fff', background: torch ? '#fff' : 'rgba(0,0,0,0.55)', color: torch ? '#000' : '#fff',
            }}>
              {torch ? <FlashlightOff size={22} aria-hidden="true" /> : <Flashlight size={22} aria-hidden="true" />}
              <span className="sr-only">{t('scanMode.torch')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Scan mode (docs/HELP.md, H5): the whole screen for scanning, made for gloves, the dark and one
// hand. Big out/in switch, the camera, the last scan in large type with its colour, icon, sound
// and vibration, the count, and the controls at the bottom where a thumb reaches.
export function ScanMode({ gigName, steps, step, setStep, quantity, setQuantity, damaged, setDamaged, onScan, onUndo, last, busy, progress, kit, setKit, onClose }) {
  const [code, setCode] = useState('')
  const [camera, setCamera] = useState(true)
  const titleRef = useRef(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    titleRef.current?.focus()
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = e => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = before; window.removeEventListener('keydown', onKey) }
  }, [])

  const big = { minHeight: '56px', fontSize: '16px', fontWeight: 700, justifyContent: 'center' }
  const toggle = on => ({ ...btn, ...big, flex: '1 1 140px', fontSize: '16px', borderWidth: '2px',
    borderColor: on ? colors.accent : colors.border, background: on ? 'var(--selection)' : 'transparent', color: on ? 'var(--text)' : colors.muted })
  const qty = Math.max(1, Number(quantity) || 1)
  const { done, total } = progress
  const tone = last ? (last.undone ? { colour: colors.muted, text: colors.muted, Icon: Undo2 } : TONE[last.tone] || TONE.ok) : null
  const said = last ? feedText(last) : null

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="scan-mode-title" style={{
      position: 'fixed', inset: 0, zIndex: 950, background: 'var(--bg)', color: 'var(--text)', overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ width: '100%', maxWidth: '560px', margin: '0 auto', padding: '12px 16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 id="scan-mode-title" ref={titleRef} tabIndex={-1} style={{ flex: 1, minWidth: 0, fontSize: '22px', fontWeight: 700, lineHeight: 1.25, outline: 'none' }}>
            {t('scanMode.title')}<span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gigName}</span>
          </h1>
          <button type="button" onClick={onClose} style={{ ...btn, ...big, minWidth: '96px' }}>{t('scanMode.done')}</button>
        </div>

        <StepPicker steps={steps} step={step} onChange={setStep} big />

        {camera
          ? <CameraScanner onCode={onScan} onClose={() => setCamera(false)} tall />
          : <button type="button" onClick={() => setCamera(true)} style={{ ...btn, ...big }}>{t('dispatch.cameraOn')}</button>}

        <section aria-live="polite" aria-atomic="true" style={{
          minHeight: '112px', padding: '14px 16px', display: 'flex', gap: '16px', alignItems: 'center',
          border: `1px solid ${tone ? tone.colour : colors.border}`, borderLeftWidth: tone ? '4px' : '1px', background: 'var(--panel)',
        }}>
          {busy ? <AvxLoader size={40} style={{ flexShrink: 0 }} />
            : tone ? <tone.Icon size={44} aria-hidden="true" color={tone.text} style={{ flexShrink: 0 }} />
            : <ScanLine size={40} aria-hidden="true" color={colors.muted} style={{ flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            {said ? (
              <>
                {said.what && <strong style={{ display: 'block', fontSize: '20px', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{said.what}</strong>}
                <span style={{ display: 'block', fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>{said.msg}</span>
                {!last.undone && said.extra.map(x => <span key={x.text} style={{ display: 'block', fontSize: '16px', color: x.warn ? AMBER : colors.soft, marginTop: '2px' }}>{x.text}</span>)}
              </>
            ) : <span style={{ fontSize: '16px', color: colors.muted }}>{t('scanMode.waiting')}</span>}
          </div>
          {canUndo(last) && (
            <button type="button" onClick={() => onUndo(last)} style={{ ...btn, ...big, minWidth: '88px', fontSize: '16px', alignSelf: 'stretch', flexDirection: 'column', gap: '4px' }}>
              <Undo2 size={22} aria-hidden="true" /> {t('common.undo')}
            </button>
          )}
        </section>

        <div>
          <p style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <PackageCheck size={22} aria-hidden="true" /> {t(`steps.progress.${step}`, { done, total })}
          </p>
          <Segments done={done} total={total} />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div role="group" aria-label={t('dispatch.qty')} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px' }}>
            <button type="button" onClick={() => setQuantity(String(Math.max(1, qty - 1)))} disabled={qty <= 1} style={{ ...btn, ...big, width: '56px', padding: 0 }}>
              <Minus size={22} aria-hidden="true" /><span className="sr-only">{t('scanMode.less')}</span>
            </button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: '16px', color: colors.muted }}>
              {t('dispatch.qty')} <strong aria-live="polite" style={{ display: 'block', fontSize: '24px', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{qty}</strong>
            </span>
            <button type="button" onClick={() => setQuantity(String(Math.min(100000, qty + 1)))} style={{ ...btn, ...big, width: '56px', padding: 0 }}>
              <Plus size={22} aria-hidden="true" /><span className="sr-only">{t('scanMode.more')}</span>
            </button>
          </div>
          {step === 'returned' && (
            <button type="button" aria-pressed={damaged} onClick={() => setDamaged(!damaged)} style={{
              ...btn, ...big, flex: '1 1 160px', borderWidth: '2px',
              borderColor: damaged ? AMBER : colors.border, background: damaged ? 'var(--warn-soft)' : 'transparent', color: damaged ? AMBER : colors.soft,
            }}><AlertTriangle size={20} aria-hidden="true" /> {t('scanMode.damaged')}</button>
          )}
        </div>

        <form onSubmit={e => { e.preventDefault(); if (code.trim()) { onScan(code); setCode('') } }} style={{ display: 'flex', gap: '8px' }}>
          <label htmlFor="scan-mode-code" className="sr-only">{t('dispatch.code')}</label>
          <input id="scan-mode-code" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters"
            placeholder={t('scanMode.typeCode')} style={{ ...input, flex: 1, minHeight: '56px', fontSize: '20px', fontFamily: 'var(--font-mono)' }} />
          <button type="submit" disabled={busy || !code.trim()} style={{ ...btnPrimary, ...big, minWidth: '96px' }}>{t('dispatch.record')}</button>
        </form>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
          <button type="button" aria-pressed={kit.sound} onClick={() => setKit({ sound: !kit.sound })} style={toggle(kit.sound)}>
            {kit.sound ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />} {t('scanMode.sound')}
          </button>
          {canSpeak() && (
            <button type="button" aria-pressed={kit.speak} onClick={() => setKit({ speak: !kit.speak })} style={toggle(kit.speak)}>
              <Speech size={20} aria-hidden="true" /> {t('scanMode.speak')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Square corner brackets over the camera view, in accent (no rounded frame, no shaded surround)
function ScanBrackets() {
  const arm = { position: 'absolute', width: '36px', height: '36px', borderColor: 'var(--accent)', borderStyle: 'solid', borderWidth: 0 }
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: '18%' }}>
      <span style={{ ...arm, top: 0, left: 0, borderTopWidth: '3px', borderLeftWidth: '3px' }} />
      <span style={{ ...arm, top: 0, right: 0, borderTopWidth: '3px', borderRightWidth: '3px' }} />
      <span style={{ ...arm, bottom: 0, left: 0, borderBottomWidth: '3px', borderLeftWidth: '3px' }} />
      <span style={{ ...arm, bottom: 0, right: 0, borderBottomWidth: '3px', borderRightWidth: '3px' }} />
    </div>
  )
}

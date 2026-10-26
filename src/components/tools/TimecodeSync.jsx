import { useEffect, useRef, useState } from 'react'
import { Camera, AudioLines, Check, RotateCcw, Keyboard, Loader2 } from 'lucide-react'
import { readTimecode, readingsAgree } from '../../lib/tcOcr'
import { LtcDecoder } from '../../lib/ltc'
import { framesToMs, tcToFrames, msToTc } from '../../lib/rehearsal'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, colors, card, tint } from '../ui'

// Clock sync for the rehearsal companion (docs/TOOLS_PLAN.md §2, R2). Both read on the phone only:
// no picture or sound leaves it. Each hands back "the timecode right now" for the person to use.

const tcFields = r => framesToMs(tcToFrames(r.h, r.m, r.s, r.f, r.fps, r.df), r.fps)

// ── From a camera ────────────────────────────────────────────────────────────
// Point the camera at a timecode display; the digits inside the guide box are read a few times a
// second, and a reading is offered once two of them move on with the clock.
export function CameraSync({ session, onUse, onType, onClose }) {
  const video = useRef(null)
  const canvas = useRef(null)
  const last = useRef(null)
  const [state, setState] = useState('starting') // starting | looking | found | denied
  const [live, setLive] = useState(null)
  const [found, setFound] = useState(null)
  const df = session.frame_count === 'df'

  useEffect(() => {
    let stream, timer, stopped = false
    if (!navigator.mediaDevices?.getUserMedia) { setState('denied'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(s => {
        if (stopped) { s.getTracks().forEach(tr => tr.stop()); return }
        stream = s
        video.current.srcObject = s
        return video.current.play().then(() => { setState('looking'); timer = setInterval(tick, 220) })
      })
      .catch(() => setState('denied'))

    function tick() {
      const v = video.current
      if (!v || !v.videoWidth || last.current?.paused) return
      // The guide box: the middle of the picture, wide and low, like a timecode display
      const sw = v.videoWidth * 0.84, sh = v.videoHeight * 0.24
      const sx = (v.videoWidth - sw) / 2, sy = (v.videoHeight - sh) / 2
      const w = 480, h = Math.round((sh / sw) * w)
      const c = canvas.current
      c.width = w; c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h)
      const r = readTimecode(ctx.getImageData(0, 0, w, h), session.fps)
      const at = performance.now()
      if (!r) return setLive(null)
      const reading = { ...r, ms: tcFields({ ...r, fps: session.fps, df }), at }
      setLive(reading.text)
      if (readingsAgree(last.current, reading, session.fps)) {
        last.current = { paused: true }
        setFound(reading)
        setState('found')
      } else {
        last.current = reading
      }
    }
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach(tr => tr.stop()) }
  }, [session.fps, df])

  // Once found, the reading keeps running, so it can be compared with the display
  const [, tick] = useState(0)
  useEffect(() => {
    if (state !== 'found') return
    const id = setInterval(() => tick(n => n + 1), 200)
    return () => clearInterval(id)
  }, [state])

  const again = () => { last.current = null; setFound(null); setState('looking') }
  const use = () => onUse(found.ms + (performance.now() - found.at), 'camera')

  return (
    <Modal title={t('rehearsal.cameraSync')} onClose={onClose} maxWidth={560}>
      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', aspectRatio: '16 / 9' }}>
        <video ref={video} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div aria-hidden="true" style={{ position: 'absolute', left: '8%', right: '8%', top: '38%', bottom: '38%', border: `3px solid ${state === 'found' ? 'var(--accent)' : '#fff'}`, borderRadius: '8px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
      </div>
      <canvas ref={canvas} hidden />
      <p role="status" aria-live="polite" style={{ fontSize: '14px', margin: '12px 0', lineHeight: 1.5 }}>
        {state === 'denied' ? t('rehearsal.cameraDenied')
          : state === 'found' ? t('rehearsal.readAs', { tc: msToTc(found.ms + (performance.now() - found.at), session.fps, df) })
            : state === 'starting' ? t('rehearsal.cameraStarting')
              : live ? t('rehearsal.reading', { tc: live }) : t('rehearsal.cameraLooking')}
      </p>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '12px' }}>{t('rehearsal.cameraHint')}</p>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onType} style={{ ...btn, background: 'transparent' }}><Keyboard size={14} /> {t('rehearsal.typeInstead')}</button>
        {state === 'found' && <button type="button" onClick={again} style={btn}><RotateCcw size={14} /> {t('rehearsal.readAgain')}</button>}
        <button type="button" onClick={use} disabled={state !== 'found'} style={btnPrimary}><Check size={14} /> {t('rehearsal.useReading')}</button>
      </div>
    </Modal>
  )
}

// ── From LTC ─────────────────────────────────────────────────────────────────
// LTC into the microphone or a line input: decoded live, shown here; Sync sets the session to it.
export function LtcSync({ session, onUse, onClose }) {
  const [state, setState] = useState('starting') // starting | listening | denied
  const [level, setLevel] = useState(0)
  const [latest, setLatest] = useState(null) // { ms, at, fps, df }
  const latestRef = useRef(null)
  const df = session.frame_count === 'df'

  useEffect(() => {
    let stream, ctx, node, stopped = false, shown = 0
    const AC = window.AudioContext || window.webkitAudioContext
    if (!navigator.mediaDevices?.getUserMedia || !AC) { setState('denied'); return }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      .then(s => {
        if (stopped) { s.getTracks().forEach(tr => tr.stop()); return }
        stream = s
        ctx = new AC()
        const source = ctx.createMediaStreamSource(s)
        const decoder = new LtcDecoder(ctx.sampleRate)
        let counter = 0
        node = ctx.createScriptProcessor(2048, 1, 1)
        const mute = ctx.createGain()
        mute.gain.value = 0
        source.connect(node); node.connect(mute); mute.connect(ctx.destination)
        node.onaudioprocess = e => {
          const input = e.inputBuffer.getChannelData(0)
          const now = performance.now()
          const frames = decoder.push(input, counter)
          counter += input.length
          const end = frames.at(-1)
          if (end) {
            // The word ended at the start of the next frame; when was that, on this phone?
            const at = now - ((counter - end.endSample) / ctx.sampleRate) * 1000
            const fps = Number(session.fps)
            latestRef.current = { ms: tcFields({ ...end, fps, df }) + 1000 / fps, at, fps: decoder.fps, df: end.df }
          }
          if (now - shown > 120) { shown = now; setLevel(decoder.level); setLatest(latestRef.current) }
        }
        setState('listening')
      })
      .catch(() => setState('denied'))
    return () => { stopped = true; if (node) node.onaudioprocess = null; ctx?.close(); stream?.getTracks().forEach(tr => tr.stop()) }
  }, [session.fps, df])

  const fresh = latest && performance.now() - latest.at < 600
  const fpsOff = fresh && Math.abs(latest.fps - Number(session.fps)) > 0.6
  const dfOff = fresh && latest.df !== df
  const now = () => latestRef.current.ms + (performance.now() - latestRef.current.at)

  return (
    <Modal title={t('rehearsal.ltcSync')} onClose={onClose}>
      <div style={{ ...card, textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 700, color: fresh ? 'var(--text)' : colors.muted }}>
          {fresh ? msToTc(latest.ms + (performance.now() - latest.at), session.fps, df) : '--:--:--:--'}
        </div>
        <div aria-hidden="true" style={{ height: '6px', borderRadius: '3px', background: tint(colors.muted, 25), marginTop: '10px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.round(level * 140))}%`, height: '100%', background: colors.accent, transition: 'width 0.1s' }} />
        </div>
      </div>
      <p role="status" aria-live="polite" style={{ fontSize: '14px', lineHeight: 1.5, marginBottom: '8px' }}>
        {state === 'denied' ? t('rehearsal.micDenied') : state === 'starting' ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} /> {t('rehearsal.micStarting')}</>
          : fresh ? t('rehearsal.ltcReceiving', { fps: Math.round(latest.fps * 100) / 100 }) : t('rehearsal.ltcWaiting')}
      </p>
      {fpsOff && <p style={{ fontSize: '13px', color: colors.danger, marginBottom: '8px' }}>{t('rehearsal.ltcFpsOff', { ltc: Math.round(latest.fps), session: Number(session.fps) })}</p>}
      {dfOff && <p style={{ fontSize: '13px', color: colors.danger, marginBottom: '8px' }}>{latest.df ? t('rehearsal.ltcIsDf') : t('rehearsal.ltcIsNdf')}</p>}
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '12px' }}>{t('rehearsal.ltcHint')}</p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} style={{ ...btn, background: 'transparent' }}>{t('common.cancel')}</button>
        <button type="button" disabled={!fresh} onClick={() => onUse(now(), 'ltc')} style={btnPrimary}><Check size={14} /> {t('rehearsal.syncNow')}</button>
      </div>
    </Modal>
  )
}

export const SyncIcons = { camera: Camera, ltc: AudioLines }

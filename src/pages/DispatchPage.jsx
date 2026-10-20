import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Camera, CameraOff, ScanLine, Check, X, Loader2, PackageCheck, ClipboardList, Maximize2, Volume2, VolumeX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { useToast } from '../lib/ToastContext'
import { logger, userMessage } from '../lib/logger'
import { track } from '../lib/usage'
import { codeFromScan, DISPATCH_STEP, stepTarget, stepTotals } from '../lib/inventory'
import { useGigSteps } from '../lib/useSteps'
import { useFieldKit, beep, buzz, speak } from '../lib/fieldKit'
import { useI18n, t } from '../i18n'
import AppShell from '../components/shell/AppShell'
import { btn, btnPrimary, input, label, card, colors } from '../components/ui'
import { Hint } from '../components/help/HelpParts'
import { CameraScanner, FeedRow, ScanMode, StepPicker, feedText, stepHue, AMBER } from '../components/dispatch/ScanParts'

const REPEAT_MS = 2500 // the same code seen again within this time is the same scan
// On the way back, lines that went out count even if they weren't planned
const STEP_AFTER_OUT = step => step !== 'prepped' && step !== 'loaded' && step !== 'on_site'

// Scan equipment out to a gig and back in, and through the steps in between (docs/HELP.md,
// H5b: prepped, on site, loaded back, checked in): with the phone camera (QR labels), a
// USB/Bluetooth scanner (types the code + Enter), or by typing the code. Every scan is checked
// and logged by the database (dispatch_scan, step_scan); warnings never stop what really
// happened, and the person who scanned can undo it for 15 minutes (undo_scan).
//   /gig/:id/scan
export default function DispatchPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { roleIn } = useWorkspace()
  const { notify } = useToast()
  const { ago, lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const scanMode = params.get('mode') === 'scan'
  const [kit, setKit] = useFieldKit()
  const [gig, setGig] = useState(null)
  const [allowed, setAllowed] = useState(null)
  const [unitsOut, setUnitsOut] = useState([])
  const [step, setStep] = useState('loaded')
  const direction = DISPATCH_STEP[step] || null
  const [damaged, setDamaged] = useState(false)
  const [quantity, setQuantity] = useState('1')
  const [code, setCode] = useState('')
  const [feed, setFeed] = useState([])
  const [busy, setBusy] = useState(false)
  const [camera, setCamera] = useState(false)
  const inputRef = useRef(null)
  const last = useRef({ code: '', at: 0 })

  const { steps, lines: summary, counts, reload: reloadSteps } = useGigSteps(id, gig ? gig.org_id : undefined)
  const loadProgress = useCallback(async () => {
    const [u] = await Promise.all([supabase.rpc('gig_units_out', { p_gig: id }), reloadSteps()])
    setUnitsOut(u.data || [])
  }, [id, reloadSteps])

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

  // Every scan is heard and felt as well as seen (docs/HELP.md, H5): a beep, a buzz and,
  // when asked for, the phone's voice saying what was scanned
  const signal = useCallback(entry => {
    if (kit.sound) beep(entry.tone)
    buzz(entry.tone)
    if (kit.speak) { const { what, msg } = feedText(entry); speak([what, msg].filter(Boolean).join('. '), lang) }
  }, [kit.sound, kit.speak, lang])
  // Scan mode is its own history step, so the phone's back button closes it
  const openedHere = useRef(false)
  const setScanMode = useCallback(on => {
    if (!on && openedHere.current) { openedHere.current = false; return navigate(-1) }
    openedHere.current = on
    setParams(p => { const next = new URLSearchParams(p); if (on) next.set('mode', 'scan'); else next.delete('mode'); return next }, { replace: !on })
  }, [navigate, setParams])
  const closeScanMode = useCallback(() => setScanMode(false), [setScanMode])

  const scan = useCallback(async raw => {
    const value = codeFromScan(raw)
    if (!value) {
      const entry = { key: Date.now(), tone: 'error', text: t('dispatch.badCode', { code: String(raw).slice(0, 40) }) }
      signal(entry)
      setFeed(f => [entry, ...f].slice(0, 30))
      return
    }
    const now = Date.now()
    if (value === last.current.code && now - last.current.at < REPEAT_MS) return
    last.current = { code: value, at: now }
    setBusy(true)
    const qty = Math.max(1, Math.min(100000, Math.round(Number(quantity) || 1)))
    const { data, error } = direction
      ? await supabase.rpc('dispatch_scan', {
        p_gig: id, p_code: value, p_direction: direction, p_quantity: qty, p_condition: direction === 'in' && damaged ? 'damaged' : 'ok',
      })
      : await supabase.rpc('step_scan', { p_gig: id, p_code: value, p_step: step, p_quantity: qty })
    setBusy(false)
    setCode('')
    if (error) {
      logger.error('dispatch', error, { step: 'scan' })
      return notify(userMessage(error), 'error')
    }
    const tone = !data.ok ? 'error' : data.warning ? 'warn' : 'ok'
    const entry = { key: now, tone, code: value, result: data, direction, step }
    signal(entry)
    if (data.ok) {
      track(`dispatch:${direction || step}`)
      setQuantity('1')
      setDamaged(false)
    }
    setFeed(f => [entry, ...f].slice(0, 30))
    loadProgress()
    if (!scanMode) inputRef.current?.focus()
  }, [id, direction, step, damaged, quantity, loadProgress, notify, scanMode, signal])

  // Undo a scan of your own (within 15 minutes, while nothing has happened to it since)
  const undo = useCallback(async entry => {
    const { data, error } = await supabase.rpc('undo_scan', { p_gig: id, p_batch: entry.result.batch })
    if (error) {
      logger.error('dispatch', error, { step: 'undo' })
      return notify(userMessage(error), 'error')
    }
    if (!data?.ok) {
      if (kit.sound) beep('error')
      return notify(t(`undoScan.error.${data?.error || 'nothing'}`), 'error')
    }
    track('dispatch:undo')
    if (kit.sound) beep('warn')
    last.current = { code: '', at: 0 }
    setFeed(f => f.map(x => (x.key === entry.key ? { ...x, undone: true } : x)))
    loadProgress()
  }, [id, kit.sound, loadProgress, notify])

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

  const progress = stepTotals(summary.filter(r => r.planned > 0 || STEP_AFTER_OUT(step)), counts, step)
  // Scan mode takes the whole screen, in place of the page (nothing behind it to tab into)
  if (scanMode) return (
    <>
      <ScanMode gigName={gig.name} steps={steps} step={step} setStep={setStep} quantity={quantity} setQuantity={setQuantity}
        damaged={damaged} setDamaged={setDamaged} onScan={scan} onUndo={undo} last={feed[0]} busy={busy} progress={progress}
        kit={kit} setKit={setKit} onClose={closeScanMode} />
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </>
  )
  return (
    <AppShell>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '16px 16px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button onClick={() => navigate(`/gig/${id}?tab=equipment`)} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft, padding: '6px 10px' }}><ArrowLeft size={14} /> {gig.name}</button>
          <button onClick={() => navigate(`/gig/${id}/packing`)} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft, padding: '6px 10px', marginLeft: 'auto' }}><ClipboardList size={14} /> {t('dispatch.packingList')}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, flex: 1 }}>{t('dispatch.title')}</h1>
          <button type="button" aria-pressed={kit.sound} onClick={() => setKit({ sound: !kit.sound })} style={btn}>
            {kit.sound ? <Volume2 size={15} /> : <VolumeX size={15} />} {t('scanMode.sound')}
          </button>
          <button type="button" onClick={() => setScanMode(true)} style={btnPrimary}><Maximize2 size={15} /> {t('scanMode.open')}</button>
        </div>

        <div style={{ marginBottom: '12px' }}>
          <StepPicker steps={steps} step={step} onChange={next => { setStep(next); inputRef.current?.focus() }} />
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
          {step === 'returned' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: damaged ? AMBER : colors.soft, marginTop: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={damaged} onChange={e => setDamaged(e.target.checked)} style={{ accentColor: AMBER }} /> {t('dispatch.damaged')}
            </label>
          )}
        </div>

        {feed.length > 0 && (
          <section aria-live="polite" style={{ marginBottom: '16px' }}>
            {feed.slice(0, 8).map(f => <FeedRow key={f.key} entry={f} onUndo={undo} />)}
          </section>
        )}

        <section style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackageCheck size={16} /> {t(`steps.progress.${step}`, progress)}
          </h2>
          <div style={{ height: '6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{ height: '100%', background: stepHue(step), width: `${Math.min(100, (100 * progress.done) / Math.max(1, progress.total))}%` }} />
          </div>
          {summary.length === 0 ? <p style={{ fontSize: '13px', color: colors.muted }}>{t('dispatch.nothingPlanned')}</p> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {summary.map(r => {
                const target = stepTarget(step, r, counts[r.item_id])
                const done = counts[r.item_id]?.[step] || 0
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
            {step === 'returned' && (
              <button onClick={markLost} style={{ ...btn, background: 'transparent', borderColor: 'color-mix(in srgb, var(--danger) 35%, transparent)', color: colors.danger }}>
                <X size={14} /> {t('dispatch.markLost', { count: unitsOut.length })}
              </button>
            )}
            {step === 'returned' && <Hint id="mark-lost" label={t('dispatch.markLost', { count: unitsOut.length })} />}
          </section>
        )}
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </AppShell>
  )
}

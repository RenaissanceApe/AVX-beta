import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Plus, Trash2, Loader2, AlertTriangle, Info } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { stageSize } from '../../lib/stagePlot'
import { KINDS, LIMITS, settingsOf, sourcesOf, listenersOf, speedOfSound, delays, listenerReport, coverage, newSource, newListener, nextName } from '../../lib/systemCalc'
import { t } from '../../i18n'
import { btn, iconBtn, input, label, card, colors, tint } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import SystemPlotSvg from './SystemPlotSvg'

// The sound system calculator (docs/FIELD_TOOLS.md, F4): the PA's sources (mains, subs, delays,
// fills) and the listening positions, with estimates of each source's delay, how the subs line
// up with the mains, the level at each position, whether a delay arrives too early or as an
// echo, and how wide each source covers. Everything is labelled as an estimate. Everyone on the
// gig reads it, also offline; editors change it.
export default function SystemCalcTool({ gig, canEdit }) {
  const { notify } = useToast()
  const [show, setShow] = useState(null) // { stage, system }
  const [savedAt, setSavedAt] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('gig_show').select('stage, system').eq('gig_id', gig.id).maybeSingle()
    if (error && isNetworkError(error)) {
      const snap = loadSnapshot(`system.${gig.id}`)
      setShow(snap?.data || { stage: {}, system: {} })
      setSavedAt(snap?.savedAt || null)
      return
    }
    if (error) logger.error('system', error, { step: 'load' })
    const next = { stage: data?.stage || {}, system: data?.system || {} }
    setShow(next)
    setSavedAt(null)
    saveSnapshot(`system.${gig.id}`, next)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  const settings = useMemo(() => settingsOf(show?.system), [show])
  const sources = useMemo(() => sourcesOf(show?.system), [show])
  const listeners = useMemo(() => listenersOf(show?.system), [show])
  const set = useMemo(() => delays(sources, listeners, settings), [sources, listeners, settings])
  const reach = useMemo(() => coverage(sources, listeners, settings), [sources, listeners, settings])
  const reports = useMemo(() => listeners.map(l => ({ listener: l, ...listenerReport(l, sources, settings, set) })), [listeners, sources, settings, set])

  async function save(patch) {
    const system = { ...(show?.system || {}), ...patch }
    setShow(s => ({ ...s, system }))
    const { error } = await supabase.from('gig_show').upsert({ gig_id: gig.id, system })
    if (error) { logger.error('system', error, { step: 'save' }); notify(userMessage(error), 'error'); load() }
  }
  const editSource = (id, patch) => save({ sources: sources.map(s => (s.id === id ? { ...s, ...patch } : s)) })
  const editListener = (id, patch) => save({ listeners: listeners.map(l => (l.id === id ? { ...l, ...patch } : l)) })

  function addSource(kind) {
    save({ sources: [...sources, newSource(sources, stageSize(show.stage).width_m, kind, nextName(sources, t(`sys.kind.${kind}`)))] })
    track(`system:add:${kind}`)
  }
  function addListener() {
    save({ listeners: [...listeners, newListener(listeners, stageSize(show.stage).width_m, listeners.length ? nextName(listeners, t('sys.position')) : t('sys.foh'))] })
  }
  function removeWithUndo(key, list, id, name) {
    const before = list
    save({ [key]: list.filter(x => x.id !== id) })
    notify(t('undo.removed', { name }), 'success', { action: { label: t('common.undo'), onClick: () => save({ [key]: before }) } })
  }

  if (show === null) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  const nameOf = id => sources.find(s => s.id === id)?.name || '—'

  return (
    <section aria-labelledby="system-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px' }}>
          <h2 id="system-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.system_calc')}</h2>
          <p style={{ color: colors.muted, fontSize: '13px' }}>{t('sys.count', { sources: sources.length, listeners: listeners.length })}</p>
        </div>
        {sources.length > 0 && <Link to={`/gig/${gig.id}/system`} style={{ ...btn, textDecoration: 'none' }}><Printer size={14} /> {t('inputs.print')}</Link>}
      </div>
      {savedAt && <p role="status" style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '10px' }}>{t('sys.offline')}</p>}
      <p style={{ ...card, display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', lineHeight: 1.5, marginBottom: '12px', borderColor: tint(colors.accent, 35) }}>
        <Info size={15} color={colors.accentText} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} /> {t('sys.estimate')}
      </p>

      <section aria-labelledby="sys-settings" style={{ marginBottom: '14px' }}>
        <h3 id="sys-settings" style={{ ...label, marginBottom: '6px' }}>{t('sys.settings')}</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <NumberField id="sys-temp" hint="sys-temp" text={t('sys.temp')} value={settings.temp_c} min={-20} max={50} step={1} disabled={!canEdit} onSave={v => save({ temp_c: v })} />
          <NumberField id="sys-haas" hint="sys-haas" text={t('sys.haas')} value={settings.haas_ms} min={0} max={30} step={1} disabled={!canEdit} onSave={v => save({ haas_ms: v })} />
          <NumberField id="sys-ear" text={t('sys.ear')} value={settings.ear_m} min={0} max={3} step={0.1} disabled={!canEdit} onSave={v => save({ ear_m: v })} />
          <p style={{ fontSize: '12px', color: colors.muted, paddingBottom: '10px' }}>{t('sys.speed', { c: Math.round(speedOfSound(settings.temp_c) * 10) / 10 })}</p>
        </div>
      </section>

      {(sources.length > 0 || listeners.length > 0) && (
        <div style={{ ...card, padding: '8px', marginBottom: '14px' }}>
          <SystemPlotSvg stage={show.stage} sources={sources} listeners={listeners} title={t('sys.drawingTitle', { name: gig.name })} />
        </div>
      )}

      <section aria-labelledby="sys-sources" style={{ marginBottom: '16px' }}>
        <h3 id="sys-sources" style={{ ...label, marginBottom: '6px' }}>{t('sys.sources')}</h3>
        {canEdit && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {KINDS.map(k => <button key={k} type="button" onClick={() => addSource(k)} style={{ ...btn, padding: '6px 10px', fontSize: '13px' }}><Plus size={13} /> {t(`sys.kind.${k}`)}</button>)}
          </div>
        )}
        {sources.length === 0 ? (
          <EmptyState compact title={t('sys.emptyTitle')} body={canEdit ? t('sys.emptyEditor') : t('sys.emptyReader')} guide="pm-system-calc" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sources.map(s => {
              const d = set[s.id]
              const cov = reach[s.id]
              return (
                <li key={s.id} style={{ ...card, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: canEdit ? '8px' : 0 }}>
                    <strong style={{ fontSize: '14px' }}>{s.name}</strong>
                    <span style={{ fontSize: '12px', color: colors.muted }}>{t(`sys.kind.${s.kind}`)}{s.count > 1 ? ` × ${s.count}` : ''}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 800, color: colors.accentText }}>{t('sys.delayMs', { ms: d.ms })}</span>
                    {canEdit && <button type="button" onClick={() => removeWithUndo('sources', sources, s.id, s.name)} aria-label={t('inputs.remove', { name: s.name })} style={iconBtn}><Trash2 size={14} /></button>}
                  </div>
                  <p style={{ fontSize: '12px', color: colors.soft, lineHeight: 1.5 }}>
                    {t(`sys.reason.${d.reason}`, { main: nameOf(d.from), ms: Math.round((d.mainWait || 0) * 10) / 10, haas: settings.haas_ms })}
                    {s.extra_ms ? ` ${t('sys.extraIncluded', { ms: s.extra_ms })}` : ''}
                    {cov && ` · ${t('sys.covers', { width: cov.width, d: cov.d })}`}
                  </p>
                  {canEdit && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '8px', marginTop: '8px' }}>
                      <TextField id={`src-name-${s.id}`} text={t('sys.name')} value={s.name} onSave={v => editSource(s.id, { name: v })} />
                      <div>
                        <label style={label} htmlFor={`src-kind-${s.id}`}>{t('sys.kindLabel')}</label>
                        <select id={`src-kind-${s.id}`} value={s.kind} onChange={e => editSource(s.id, { kind: e.target.value })} style={{ ...input, appearance: 'auto' }}>
                          {KINDS.map(k => <option key={k} value={k}>{t(`sys.kind.${k}`)}</option>)}
                        </select>
                      </div>
                      <NumberField id={`src-x-${s.id}`} text={t('sys.x')} value={s.x} min={LIMITS.x[0]} max={LIMITS.x[1]} step={0.5} onSave={v => editSource(s.id, { x: v })} />
                      <NumberField id={`src-y-${s.id}`} hint="sys-y" text={t('sys.y')} value={s.y} min={LIMITS.y[0]} max={LIMITS.y[1]} step={0.5} onSave={v => editSource(s.id, { y: v })} />
                      <NumberField id={`src-h-${s.id}`} text={t('sys.height')} value={s.height} min={0} max={40} step={0.5} onSave={v => editSource(s.id, { height: v })} />
                      <NumberField id={`src-spl-${s.id}`} hint="sys-spl" text={t('sys.spl')} value={s.spl} min={60} max={160} step={1} onSave={v => editSource(s.id, { spl: v })} />
                      <NumberField id={`src-angle-${s.id}`} hint="sys-angle" text={t('sys.angle')} value={s.angle} min={1} max={180} step={5} onSave={v => editSource(s.id, { angle: v })} />
                      <NumberField id={`src-count-${s.id}`} text={t('sys.boxes')} value={s.count} min={1} max={64} step={1} onSave={v => editSource(s.id, { count: Math.round(v) })} />
                      <NumberField id={`src-extra-${s.id}`} text={t('sys.extra')} value={s.extra_ms} min={-500} max={500} step={0.1} onSave={v => editSource(s.id, { extra_ms: v })} />
                    </div>
                  )}
                  {!canEdit && (
                    <p style={{ fontSize: '12px', color: colors.muted, marginTop: '4px' }}>
                      {t('sys.where', { x: s.x, y: s.y, h: s.height })} · {s.spl} dB · {s.angle}°
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="sys-listeners">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <h3 id="sys-listeners" style={{ ...label }}>{t('sys.listeners')}</h3>
          {canEdit && <button type="button" onClick={addListener} style={{ ...btn, padding: '6px 10px', fontSize: '13px', marginLeft: 'auto' }}><Plus size={13} /> {t('sys.addListener')}</button>}
        </div>
        {listeners.length === 0 ? (
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('sys.noListeners')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reports.map(({ listener: l, rows, total, mains, checks }, i) => (
              <li key={l.id} style={{ ...card, padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '14px' }}>{l.name}</strong>
                  {i === 0 && <span style={{ fontSize: '11px', fontWeight: 800, color: colors.accentText }}>{t('sys.reference')}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700 }}>{total !== null ? t('sys.level', { db: total }) : '—'}</span>
                  {canEdit && <button type="button" onClick={() => removeWithUndo('listeners', listeners, l.id, l.name)} aria-label={t('inputs.remove', { name: l.name })} style={iconBtn}><Trash2 size={14} /></button>}
                </div>
                <p style={{ fontSize: '12px', color: colors.soft, lineHeight: 1.6 }}>
                  {mains !== null && `${t('sys.fromMains', { db: mains })} · `}
                  {rows.map(r => `${nameOf(r.id)} ${r.d} m`).join(' · ')}
                </p>
                {checks.map(c => (
                  <p key={c.id} style={{ fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center', color: c.state === 'ok' ? colors.soft : 'var(--warn)' }}>
                    {c.state !== 'ok' && <AlertTriangle size={13} aria-hidden="true" />}
                    {t(`sys.check.${c.state}`, { name: nameOf(c.id), main: nameOf(c.main), ms: Math.abs(c.gap) })}
                  </p>
                ))}
                {canEdit && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '8px', marginTop: '8px' }}>
                    <TextField id={`lis-name-${l.id}`} text={t('sys.name')} value={l.name} onSave={v => editListener(l.id, { name: v })} />
                    <NumberField id={`lis-x-${l.id}`} text={t('sys.x')} value={l.x} min={LIMITS.x[0]} max={LIMITS.x[1]} step={0.5} onSave={v => editListener(l.id, { x: v })} />
                    <NumberField id={`lis-y-${l.id}`} hint="sys-y" text={t('sys.y')} value={l.y} min={LIMITS.y[0]} max={LIMITS.y[1]} step={0.5} onSave={v => editListener(l.id, { y: v })} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

// A number saved when the field is left, within its limits
function NumberField({ id, text, hint, value, min, max, step, disabled, onSave }) {
  return (
    <div style={{ minWidth: '96px', flex: '0 1 120px' }}>
      {hint ? <HintLabel htmlFor={id} hint={hint}>{text}</HintLabel> : <label style={label} htmlFor={id}>{text}</label>}
      <input id={id} type="number" min={min} max={max} step={step} defaultValue={value} key={`${id}${value}`} disabled={disabled} style={input}
        onBlur={e => {
          if (e.target.value === '') return
          const v = Math.min(max, Math.max(min, Number(e.target.value)))
          if (Number.isFinite(v) && v !== value) onSave(v)
        }} />
    </div>
  )
}

function TextField({ id, text, value, onSave }) {
  return (
    <div style={{ gridColumn: 'span 2' }}>
      <label style={label} htmlFor={id}>{text}</label>
      <input id={id} maxLength={40} defaultValue={value} key={`${id}${value}`} style={input}
        onBlur={e => { const v = e.target.value.trim(); if (v && v !== value) onSave(v) }} />
    </div>
  )
}

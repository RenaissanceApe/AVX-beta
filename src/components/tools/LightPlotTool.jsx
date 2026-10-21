import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, RotateCw, Trash2, Plus, Loader2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, AlertTriangle, Undo2, LogOut } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { STEP_M, stageSize } from '../../lib/stagePlot'
import { BAR_KINDS, FIXTURE_SYMBOLS, barsOf, supplyOf, newBar, nextBarName, layoutFixtures, snapToBar, clampToArea, viewArea, powerSummary, symbolOf } from '../../lib/lightPlot'
import { t } from '../../i18n'
import { btn, iconBtn, input, label, card, colors, tint } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import LightPlotSvg from './LightPlotSvg'
import { FixtureForm } from './DmxPatchTool'

const FIELDS = 'id, name, fixture_type, mode, footprint, universe, address, position, item_id, notes, sort, plot_x, plot_y, symbol, power_w, weight_kg'

// The light plot (docs/FIELD_TOOLS.md, F3): bars (trusses, pipes, ladders, floor) drawn over the
// stage, with the DMX patch's fixtures hanging on them. Editors add and move bars, drag fixtures
// onto bars (or anywhere), choose symbols and power, and set the supply; the power and weight
// per bar and per phase are shown as estimates. Everyone on the gig reads it, also offline.
export default function LightPlotTool({ gig, canEdit, hasDmxPatch, onToolsChanged }) {
  const { notify } = useToast()
  const [show, setShow] = useState(null) // { stage, lighting }
  const [fixtures, setFixtures] = useState([])
  const [savedAt, setSavedAt] = useState(null)
  const [selected, setSelected] = useState(null) // { kind: 'bar' | 'fixture', id }
  const [adding, setAdding] = useState(null) // a bar's name: the fixture form is open for it
  const [catalogue, setCatalogue] = useState([])
  const svgRef = useRef(null)
  const drag = useRef(null)
  const fixtureTimers = useRef({})
  const lightingTimer = useRef(null)

  const load = useCallback(async () => {
    const [s, f] = await Promise.all([
      supabase.from('gig_show').select('stage, lighting').eq('gig_id', gig.id).maybeSingle(),
      supabase.from('gig_fixtures').select(FIELDS).eq('gig_id', gig.id),
    ])
    if (f.error && isNetworkError(f.error)) {
      const snap = loadSnapshot(`lights.${gig.id}`)
      setShow(snap?.data?.show || { stage: {}, lighting: {} })
      setFixtures(snap?.data?.fixtures || [])
      setSavedAt(snap?.savedAt || null)
      return
    }
    if (f.error) logger.error('lights', f.error, { step: 'load' })
    const next = { show: { stage: s.data?.stage || {}, lighting: s.data?.lighting || {} }, fixtures: f.data || [] }
    setShow(next.show)
    setFixtures(next.fixtures)
    setSavedAt(null)
    saveSnapshot(`lights.${gig.id}`, next)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!canEdit || !gig.org_id) return
    supabase.from('price_items').select('id, name, category').eq('org_id', gig.org_id).neq('tracking', 'none').is('archived_at', null).order('name')
      .then(({ data }) => setCatalogue(data || []))
  }, [canEdit, gig.org_id])

  const bars = useMemo(() => barsOf(show?.lighting), [show])
  const supply = useMemo(() => supplyOf(show?.lighting), [show])
  const layout = useMemo(() => layoutFixtures(bars, fixtures), [bars, fixtures])
  const power = useMemo(() => powerSummary(fixtures, bars, supply), [fixtures, bars, supply])
  const loose = fixtures.filter(f => !layout[f.id])
  const bar = selected?.kind === 'bar' ? bars.find(b => b.id === selected.id) : null
  const fixture = selected?.kind === 'fixture' ? fixtures.find(f => f.id === selected.id) : null

  // ── Saving: bars with the show model, fixtures one by one; a drag or a run of arrow presses is one save
  function saveLighting(patch, { now = false } = {}) {
    const lighting = { ...(show?.lighting || {}), ...patch }
    setShow(s => ({ ...s, lighting }))
    clearTimeout(lightingTimer.current?.timer)
    const save = async () => {
      lightingTimer.current = null
      const { error } = await supabase.from('gig_show').upsert({ gig_id: gig.id, lighting })
      if (error) { logger.error('lights', error, { step: 'lighting' }); notify(userMessage(error), 'error'); load() }
    }
    if (now) save()
    else lightingTimer.current = { timer: setTimeout(save, 500), save }
  }
  const setBars = (next, opts) => saveLighting({ bars: next }, opts)
  const editBar = (id, patch, opts) => setBars(bars.map(b => (b.id === id ? { ...b, ...patch } : b)), opts)

  function changeFixture(id, patch, { now = false } = {}) {
    setFixtures(list => list.map(f => (f.id === id ? { ...f, ...patch } : f)))
    const waiting = fixtureTimers.current[id]
    if (waiting) clearTimeout(waiting.timer)
    const merged = { ...(waiting?.patch || {}), ...patch }
    const save = async () => {
      delete fixtureTimers.current[id]
      const { error } = await supabase.from('gig_fixtures').update(merged).eq('id', id)
      if (error) { logger.error('lights', error, { step: 'fixture' }); notify(userMessage(error), 'error'); load() }
    }
    if (now) save()
    else fixtureTimers.current[id] = { patch: merged, timer: setTimeout(save, 500), save }
  }
  useEffect(() => () => {
    for (const w of Object.values(fixtureTimers.current)) { clearTimeout(w.timer); w.save() }
    if (lightingTimer.current) { clearTimeout(lightingTimer.current.timer); lightingTimer.current.save() }
  }, [])

  // ── Bars
  function addBar(kind) {
    const b = newBar(bars, show.stage, kind, nextBarName(bars, t(`light.kind.${kind}`)))
    setBars([...bars, b], { now: true })
    setSelected({ kind: 'bar', id: b.id })
    track(`lights:bar:${kind}`)
  }
  async function renameBar(b, name) {
    const clean = name.trim().slice(0, 40)
    if (!clean || clean === b.name) return
    if (bars.some(x => x.id !== b.id && x.name.toLowerCase() === clean.toLowerCase())) return notify(t('light.nameTaken'), 'error')
    editBar(b.id, { name: clean }, { now: true })
    // The fixtures hanging on it follow the new name
    const on = fixtures.filter(f => (f.position || '').toLowerCase() === b.name.toLowerCase())
    if (on.length) {
      setFixtures(list => list.map(f => (on.some(o => o.id === f.id) ? { ...f, position: clean } : f)))
      const { error } = await supabase.from('gig_fixtures').update({ position: clean }).in('id', on.map(f => f.id))
      if (error) { notify(userMessage(error), 'error'); load() }
    }
  }
  function removeBar(b) {
    const before = bars
    setSelected(null)
    setBars(bars.filter(x => x.id !== b.id), { now: true })
    notify(t('light.barRemoved', { name: b.name }), 'success', { action: { label: t('common.undo'), onClick: () => setBars(before, { now: true }) } })
  }
  // Moving a bar takes the fixtures placed by hand on it along
  function moveBar(b, x, y, { now = false } = {}) {
    const spot = clampToArea(x, y, show.stage)
    const dx = spot.x - b.x, dy = spot.y - b.y
    if (!dx && !dy) return
    editBar(b.id, spot, { now })
    for (const f of fixtures) {
      if ((f.position || '').toLowerCase() !== b.name.toLowerCase() || f.plot_x === null || f.plot_x === undefined) continue
      changeFixture(f.id, { plot_x: Math.round((Number(f.plot_x) + dx) * 100) / 100, plot_y: Math.round((Number(f.plot_y) + dy) * 100) / 100 }, { now })
    }
  }

  // ── Fixtures
  function placeFixture(f, x, y) {
    const on = snapToBar(bars, x, y)
    if (on) return changeFixture(f.id, { plot_x: on.x, plot_y: on.y, position: on.bar.name }, { now: true })
    const spot = clampToArea(x, y, show.stage)
    const wasBar = bars.some(b => b.name.toLowerCase() === (f.position || '').toLowerCase())
    changeFixture(f.id, { plot_x: spot.x, plot_y: spot.y, ...(wasBar ? { position: null } : {}) }, { now: true })
  }
  function hangOn(f, barName) {
    if (barName === '') return
    if (barName === '__floor') {
      const { width_m } = stageSize(show.stage)
      return changeFixture(f.id, { plot_x: Math.round(width_m / 2 * 4) / 4, plot_y: 0.5 }, { now: true })
    }
    changeFixture(f.id, { position: barName, plot_x: null, plot_y: null }, { now: true })
    track('lights:hang')
  }

  // ── Dragging with a finger or the mouse, in metres
  function pointerToPlot(e) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    const a = viewArea(show.stage, bars, layout)
    return { x: p.x / 100 + a.x0, y: a.y1 - p.y / 100 }
  }
  function onPointerDown(e, target) {
    if (!canEdit) return
    setSelected(target)
    const p = pointerToPlot(e)
    const b = target.kind === 'bar' ? bars.find(x => x.id === target.id) : null
    drag.current = { ...target, moved: false, start: p, origin: b ? { x: b.x, y: b.y } : null }
    svgRef.current.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d) return
    const p = pointerToPlot(e)
    d.moved = true
    d.at = p
    if (d.kind === 'bar') {
      const spot = clampToArea(d.origin.x + p.x - d.start.x, d.origin.y + p.y - d.start.y, show.stage)
      setShow(s => ({ ...s, lighting: { ...s.lighting, bars: barsOf(s.lighting).map(b => (b.id === d.id ? { ...b, ...spot } : b)) } }))
      d.spot = spot
    } else {
      const spot = clampToArea(p.x, p.y, show.stage)
      setFixtures(list => list.map(f => (f.id === d.id ? { ...f, plot_x: spot.x, plot_y: spot.y } : f)))
    }
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    if (d.kind === 'bar' && d.spot) {
      const b = bars.find(x => x.id === d.id)
      // The drawing already shows the bar at its new place; save from where it started
      if (b) moveBar({ ...b, x: d.origin.x, y: d.origin.y }, d.spot.x, d.spot.y, { now: true })
    } else if (d.kind === 'fixture' && d.at) {
      const f = fixtures.find(x => x.id === d.id)
      if (f) placeFixture(f, d.at.x, d.at.y)
    }
  }
  function onKeyDown(e, target) {
    if (!canEdit) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return setSelected(target) }
    const step = e.shiftKey ? 1 : STEP_M
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const b = target.kind === 'bar' ? bars.find(x => x.id === target.id) : null
    const f = target.kind === 'fixture' ? fixtures.find(x => x.id === target.id) : null
    if (moves[e.key]) {
      e.preventDefault()
      setSelected(target)
      nudge(b, f, ...moves[e.key])
    } else if (b && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); editBar(b.id, { rotation: b.rotation === 90 ? 0 : 90 }) }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (b) removeBar(b)
      else if (f) takeOff(f)
    }
  }
  function nudge(b, f, dx, dy) {
    if (b) return moveBar(b, b.x + dx, b.y + dy)
    const at = layout[f.id]
    if (at) changeFixture(f.id, { plot_x: Math.round((at.x + dx) * 100) / 100, plot_y: Math.round((at.y + dy) * 100) / 100 })
  }
  function takeOff(f) {
    setSelected(null)
    const wasBar = bars.some(b => b.name.toLowerCase() === (f.position || '').toLowerCase())
    changeFixture(f.id, { plot_x: null, plot_y: null, ...(wasBar ? { position: null } : {}) }, { now: true })
  }

  if (show === null) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  const onBar = b => fixtures.filter(f => (f.position || '').toLowerCase() === b.name.toLowerCase())
  const watts = w => (w >= 1000 ? `${Math.round(w / 100) / 10} kW` : `${w} W`)

  return (
    <section aria-labelledby="light-plot-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px' }}>
          <h2 id="light-plot-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.light_plot')}</h2>
          <p style={{ color: colors.muted, fontSize: '13px' }}>
            {t('light.barCount', { count: bars.length })} · {t('dmx.count', { count: fixtures.length })}{power.total.watts > 0 && ` · ${watts(power.total.watts)}`}
          </p>
        </div>
        {(bars.length > 0 || fixtures.length > 0) && <Link to={`/gig/${gig.id}/lights`} style={{ ...btn, textDecoration: 'none' }}><Printer size={14} /> {t('inputs.print')}</Link>}
      </div>
      {savedAt && <p role="status" style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '10px' }}>{t('light.offline')}</p>}

      {canEdit && (
        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ ...label, marginBottom: '6px' }}>{t('light.addBar')}</h3>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {BAR_KINDS.map(kind => (
              <button key={kind} type="button" onClick={() => addBar(kind)} style={{ ...btn, padding: '6px 10px', fontSize: '13px' }}><Plus size={13} /> {t(`light.kind.${kind}`)}</button>
            ))}
            <p style={{ fontSize: '12px', color: colors.muted, flex: '1 1 220px', lineHeight: 1.5 }}>{t('light.howTo')}</p>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: '8px', marginBottom: '12px' }}
        onPointerMove={canEdit ? onPointerMove : undefined} onPointerUp={canEdit ? onPointerUp : undefined} onPointerCancel={canEdit ? onPointerUp : undefined}>
        <LightPlotSvg ref={svgRef} stage={show.stage} bars={bars} fixtures={fixtures} layout={layout} selected={selected}
          title={t('light.drawingTitle', { name: gig.name })}
          onSelect={canEdit ? setSelected : undefined} onPointerDown={canEdit ? onPointerDown : undefined} onKeyDown={canEdit ? onKeyDown : undefined} />
      </div>

      {canEdit && bar && (
        <div role="group" aria-label={t('plot.selected', { name: bar.name })} style={{ ...card, marginBottom: '12px', borderColor: tint(colors.accent, 45), display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <strong style={{ fontSize: '14px' }}>{bar.name} · {t(`light.kind.${bar.kind}`)}</strong>
          <Moves onMove={(dx, dy) => nudge(bar, null, dx, dy)}>
            <button type="button" onClick={() => editBar(bar.id, { rotation: bar.rotation === 90 ? 0 : 90 })} style={btn}><RotateCw size={14} /> {t('plot.rotate')}</button>
            <button type="button" onClick={() => setAdding(bar.name)} style={btn}><Plus size={14} /> {t('light.addFixtures')}</button>
            <button type="button" onClick={() => removeBar(bar)} style={{ ...btn, color: colors.danger }}><Trash2 size={14} /> {t('plot.remove')}</button>
          </Moves>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="bar-name">{t('light.barName')}</label>
              <input id="bar-name" maxLength={40} defaultValue={bar.name} key={`n${bar.id}${bar.name}`} onBlur={e => renameBar(bar, e.target.value)} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="bar-kind">{t('light.barKind')}</label>
              <select id="bar-kind" value={bar.kind} onChange={e => editBar(bar.id, { kind: e.target.value }, { now: true })} style={{ ...input, appearance: 'auto' }}>
                {BAR_KINDS.map(k => <option key={k} value={k}>{t(`light.kind.${k}`)}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="bar-length">{t('light.length')}</label>
              <input id="bar-length" type="number" min={0.5} max={40} step={0.5} defaultValue={bar.length} key={`l${bar.id}${bar.length}`}
                onBlur={e => { const v = Math.min(40, Math.max(0.5, Number(e.target.value) || bar.length)); if (v !== bar.length) editBar(bar.id, { length: v }, { now: true }) }} style={input} />
            </div>
            <div>
              <HintLabel htmlFor="bar-height" hint="light-trim">{t('light.height')}</HintLabel>
              <input id="bar-height" type="number" min={0} max={30} step={0.1} defaultValue={bar.height ?? ''} key={`h${bar.id}${bar.height}`}
                onBlur={e => { const v = e.target.value === '' ? null : Math.min(30, Math.max(0, Number(e.target.value))); if (v !== bar.height) editBar(bar.id, { height: v }, { now: true }) }} style={input} />
            </div>
            <div>
              <HintLabel htmlFor="bar-phase" hint="light-phase">{t('light.phase')}</HintLabel>
              <select id="bar-phase" value={bar.phase ?? ''} onChange={e => editBar(bar.id, { phase: e.target.value ? Number(e.target.value) : null }, { now: true })} style={{ ...input, appearance: 'auto' }}>
                <option value="">{t('light.phaseShared')}</option>
                {Array.from({ length: supply.phases }, (_, i) => <option key={i} value={i + 1}>L{i + 1}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {canEdit && fixture && (
        <div role="group" aria-label={t('plot.selected', { name: fixture.name })} style={{ ...card, marginBottom: '12px', borderColor: tint(colors.accent, 45), display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <strong style={{ fontSize: '14px' }}>{fixture.name} · {fixture.fixture_type}</strong>
          <Moves onMove={(dx, dy) => nudge(null, fixture, dx, dy)} disabled={!layout[fixture.id]}>
            {layout[fixture.id] && !layout[fixture.id].auto && layout[fixture.id].bar && (
              <button type="button" onClick={() => changeFixture(fixture.id, { plot_x: null, plot_y: null }, { now: true })} style={btn}><Undo2 size={14} /> {t('light.respace')}</button>
            )}
            {layout[fixture.id] && <button type="button" onClick={() => takeOff(fixture)} style={btn}><LogOut size={14} /> {t('light.takeOff')}</button>}
            <span style={{ fontSize: '12px', color: colors.muted }}>{fixture.position || t('light.noBar')}</span>
          </Moves>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="fx-symbol">{t('light.symbol')}</label>
              <select id="fx-symbol" value={fixture.symbol || ''} onChange={e => changeFixture(fixture.id, { symbol: e.target.value || null }, { now: true })} style={{ ...input, appearance: 'auto' }}>
                <option value="">{t('light.symbolAuto', { symbol: t(`light.symbol.${symbolOf({ fixture_type: fixture.fixture_type })}`) })}</option>
                {FIXTURE_SYMBOLS.map(s => <option key={s} value={s}>{t(`light.symbol.${s}`)}</option>)}
              </select>
            </div>
            <div>
              <HintLabel htmlFor="fx-power" hint="light-power">{t('light.power')}</HintLabel>
              <input id="fx-power" type="number" min={0} max={20000} defaultValue={fixture.power_w ?? ''} key={`p${fixture.id}${fixture.power_w}`}
                onBlur={e => { const v = e.target.value === '' ? null : Math.min(20000, Math.max(0, Math.round(Number(e.target.value)))); if (v !== (fixture.power_w ?? null)) changeFixture(fixture.id, { power_w: v }, { now: true }) }} style={input} />
            </div>
            <div>
              <label style={label} htmlFor="fx-weight">{t('light.weight')}</label>
              <input id="fx-weight" type="number" min={0} max={2000} step={0.1} defaultValue={fixture.weight_kg ?? ''} key={`w${fixture.id}${fixture.weight_kg}`}
                onBlur={e => { const v = e.target.value === '' ? null : Math.min(2000, Math.max(0, Number(e.target.value))); if (v !== (fixture.weight_kg === null ? null : Number(fixture.weight_kg))) changeFixture(fixture.id, { weight_kg: v }, { now: true }) }} style={input} />
            </div>
          </div>
        </div>
      )}

      {bars.length === 0 && fixtures.length === 0 ? (
        <EmptyState compact title={t('light.emptyTitle')} body={canEdit ? t('light.emptyEditor') : t('light.emptyReader')} guide="pm-light-plot" />
      ) : (
        <>
          {loose.length > 0 && (
            <section aria-labelledby="light-loose" style={{ marginBottom: '14px' }}>
              <h3 id="light-loose" style={{ ...label, marginBottom: '6px' }}>{t('light.notOnPlot', { count: loose.length })}</h3>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {loose.map(f => (
                  <li key={f.id} style={{ ...card, padding: '6px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
                    <span style={{ flex: '1 1 160px', minWidth: 0 }}><strong>{f.name}</strong> <span style={{ color: colors.muted }}>· {f.fixture_type}{f.position ? ` · ${f.position}` : ''}</span></span>
                    {canEdit && (
                      <select aria-label={t('light.hangOn', { name: f.name })} value="" onChange={e => hangOn(f, e.target.value)}
                        style={{ ...input, appearance: 'auto', width: 'auto', padding: '4px 8px', minHeight: '32px', fontSize: '13px' }}>
                        <option value="">{t('light.hangOnPick')}</option>
                        {bars.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                        <option value="__floor">{t('light.onFloor')}</option>
                      </select>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="light-bars" style={{ marginBottom: '14px' }}>
            <h3 id="light-bars" style={{ ...label, marginBottom: '6px' }}>{t('light.barsTitle')}</h3>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {bars.map(b => {
                const row = power.bars.find(r => r.id === b.id)
                const list = onBar(b)
                return (
                  <li key={b.id}>
                    <button type="button" onClick={() => setSelected({ kind: 'bar', id: b.id })} disabled={!canEdit} aria-pressed={canEdit ? bar?.id === b.id : undefined}
                      style={{ ...card, width: '100%', textAlign: 'left', padding: '8px 12px', font: 'inherit', color: 'var(--text)', cursor: canEdit ? 'pointer' : 'default', opacity: 1,
                        borderColor: bar?.id === b.id ? colors.accent : undefined, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <strong style={{ fontSize: '14px' }}>{b.name}</strong>
                        <span style={{ fontSize: '12px', color: colors.muted }}>
                          {[t(`light.kind.${b.kind}`), `${b.length} m`, b.height !== null && b.kind !== 'floor' ? t('light.trimAt', { m: b.height }) : null, b.phase ? `L${b.phase}` : null].filter(Boolean).join(' · ')}
                        </span>
                        <span style={{ fontSize: '12px', color: colors.soft, marginLeft: 'auto' }}>
                          {t('dmx.count', { count: row.count })}{row.watts > 0 && ` · ${watts(row.watts)} · ${row.amps} A`}{row.kg > 0 && ` · ${row.kg} kg`}
                        </span>
                      </span>
                      {list.length > 0 && <span style={{ fontSize: '12px', color: colors.soft, lineHeight: 1.5 }}>{list.map(f => `${f.name}${f.address ? ` (${f.universe}/${f.address})` : ''}`).join(' · ')}</span>}
                      {row.unknown > 0 && <span style={{ fontSize: '12px', color: 'var(--warn)' }}>{t('light.unknownPower', { count: row.unknown })}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <PowerPanel power={power} supply={supply} canEdit={canEdit} onSupply={s => saveLighting({ supply: { ...supply, ...s } }, { now: true })} watts={watts} />
        </>
      )}

      {canEdit && !hasDmxPatch && fixtures.length === 0 && (
        <p style={{ fontSize: '12px', color: colors.muted, marginTop: '10px', lineHeight: 1.5 }}>{t('light.dmxNote')}</p>
      )}

      {adding !== null && (
        <FixtureForm gig={gig} fixture={null} existing={fixtures} catalogue={catalogue} defaults={{ position: adding }}
          onClose={() => setAdding(null)}
          onSaved={async () => {
            setAdding(null)
            // The fixtures belong to the DMX patch too: add it to the gig if it isn't there
            if (!hasDmxPatch) {
              const { error } = await supabase.from('gig_tools').insert({ gig_id: gig.id, tool: 'dmx_patch' })
              if (!error) onToolsChanged?.()
            }
            track('lights:addFixtures')
            load()
          }} />
      )}
    </section>
  )
}

function Moves({ onMove, disabled, children }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
      {!disabled && (
        <>
          <button type="button" onClick={() => onMove(-STEP_M, 0)} aria-label={t('plot.moveLeft')} style={iconBtn}><ArrowLeft size={16} /></button>
          <button type="button" onClick={() => onMove(0, STEP_M)} aria-label={t('plot.moveBack')} style={iconBtn}><ArrowUp size={16} /></button>
          <button type="button" onClick={() => onMove(0, -STEP_M)} aria-label={t('plot.moveFront')} style={iconBtn}><ArrowDown size={16} /></button>
          <button type="button" onClick={() => onMove(STEP_M, 0)} aria-label={t('plot.moveRight')} style={iconBtn}><ArrowRight size={16} /></button>
        </>
      )}
      {children}
    </div>
  )
}

// Power per phase against the supply, as an estimate (fixtures without a figure count as 0 W)
function PowerPanel({ power, supply, canEdit, onSupply, watts }) {
  const warn = power.over ? colors.danger : 'var(--warn)'
  return (
    <section aria-labelledby="light-power" style={card}>
      <h3 id="light-power" style={{ fontSize: '15px', fontWeight: 800, marginBottom: '4px' }}>{t('light.powerTitle')}</h3>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '10px' }}>
        {t('light.powerNote', { volts: supply.volts })}
      </p>
      {canEdit && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div style={{ width: '160px' }}>
            <label style={label} htmlFor="supply-phases">{t('light.phases')}</label>
            <select id="supply-phases" value={supply.phases} onChange={e => onSupply({ phases: Number(e.target.value) })} style={{ ...input, appearance: 'auto' }}>
              <option value={1}>{t('light.single')}</option>
              <option value={3}>{t('light.three')}</option>
            </select>
          </div>
          <div style={{ width: '110px' }}>
            <HintLabel htmlFor="supply-amps" hint="light-supply">{t('light.amps')}</HintLabel>
            <input id="supply-amps" type="number" min={1} max={1000} defaultValue={supply.amps} key={`a${supply.amps}`}
              onBlur={e => { const v = Math.min(1000, Math.max(1, Math.round(Number(e.target.value) || supply.amps))); if (v !== supply.amps) onSupply({ amps: v }) }} style={input} />
          </div>
          <div style={{ width: '110px' }}>
            <label style={label} htmlFor="supply-volts">{t('light.volts')}</label>
            <input id="supply-volts" type="number" min={100} max={400} defaultValue={supply.volts} key={`v${supply.volts}`}
              onBlur={e => { const v = Math.min(400, Math.max(100, Math.round(Number(e.target.value) || supply.volts))); if (v !== supply.volts) onSupply({ volts: v }) }} style={input} />
          </div>
        </div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {power.phases.map(p => (
          <li key={p.phase} style={{ fontSize: '13px' }}>
            <span style={{ display: 'flex', gap: '8px', justifyContent: 'space-between' }}>
              <strong>{supply.phases === 1 ? t('light.single') : `L${p.phase}`}</strong>
              <span style={{ color: p.load > 1 ? colors.danger : p.load > 0.8 ? 'var(--warn)' : undefined }}>{watts(p.watts)} · {t('light.ampsOf', { a: p.amps, max: supply.amps })}</span>
            </span>
            <span aria-hidden="true" style={{ display: 'block', height: '6px', borderRadius: '3px', background: 'color-mix(in srgb, var(--fg) min(100%, calc(8% * var(--line-k))), transparent)', overflow: 'hidden', marginTop: '3px' }}>
              <span style={{ display: 'block', height: '100%', width: `${Math.min(100, p.load * 100)}%`, background: p.load > 1 ? colors.danger : p.load > 0.8 ? 'var(--warn)' : colors.accent }} />
            </span>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: '13px', marginTop: '10px' }}>
        {t('light.total', { watts: watts(power.total.watts), amps: power.total.amps, kg: power.total.kg })}
      </p>
      {power.total.unknown > 0 && <p style={{ fontSize: '12px', color: 'var(--warn)', marginTop: '4px' }}>{t('light.unknownPower', { count: power.total.unknown })}</p>}
      {(power.over || power.near) && (
        <p role="status" style={{ fontSize: '13px', color: warn, marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 700 }}>
          <AlertTriangle size={14} aria-hidden="true" /> {power.over ? t('light.over') : t('light.near')}
        </p>
      )}
    </section>
  )
}

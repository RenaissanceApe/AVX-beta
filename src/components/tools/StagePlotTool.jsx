import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, RotateCw, Trash2, ListOrdered, PackagePlus, Loader2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { useUndoRemove } from '../../lib/undo'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { inputsToEquipment } from '../../lib/tools'
import { SYMBOLS, SYMBOL_ORDER, STEP_M, stageSize, place, nextRotation, newSpot, plotToInputs, plotChannelCount } from '../../lib/stagePlot'
import { t } from '../../i18n'
import { btn, btnPrimary, iconBtn, input, label, card, colors, tint } from '../ui'
import EmptyState from '../EmptyState'
import StagePlotSvg from './StagePlotSvg'

const FIELDS = 'id, kind, label, x, y, rotation, item_id, notes'

// The stage plot (docs/FIELD_TOOLS.md, F1b): a grid-and-symbols drawing of the stage, no free
// drawing. Editors add things from the library, drag them (or select one and use the arrow keys
// or buttons, 25 cm at a time), rotate, name and remove them; "Send to the input list" adds the
// channels the drums, mics, amps and DIs need. Everyone on the gig reads it, also offline.
export default function StagePlotTool({ gig, canEdit, canPlanEquipment, hasInputList, onToolsChanged }) {
  const { notify } = useToast()
  const [items, setItems] = useState(null)
  const [stage, setStage] = useState({})
  const [savedAt, setSavedAt] = useState(null)
  const [selected, setSelected] = useState(null)
  const [catalogue, setCatalogue] = useState([])
  const [busy, setBusy] = useState(false)
  const { hidden, remove: removeLater } = useUndoRemove()
  const svgRef = useRef(null)
  const drag = useRef(null)
  const saveTimers = useRef({})

  const load = useCallback(async () => {
    const [plot, show] = await Promise.all([
      supabase.from('gig_plot_items').select(FIELDS).eq('gig_id', gig.id).order('created_at'),
      supabase.from('gig_show').select('stage').eq('gig_id', gig.id).maybeSingle(),
    ])
    if (plot.error && isNetworkError(plot.error)) {
      const snap = loadSnapshot(`plot.${gig.id}`)
      setItems(snap?.data?.items || [])
      setStage(snap?.data?.stage || {})
      setSavedAt(snap?.savedAt || null)
      return
    }
    if (plot.error) logger.error('plot', plot.error, { step: 'load' })
    const next = { items: plot.data || [], stage: show.data?.stage || {} }
    setItems(next.items)
    setStage(next.stage)
    setSavedAt(null)
    saveSnapshot(`plot.${gig.id}`, next)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!canEdit || !gig.org_id) return
    selectAll(() => supabase.from('price_items').select('id, name, category').eq('org_id', gig.org_id).neq('tracking', 'none').is('archived_at', null).order('name').order('id'))
      .then(({ data }) => setCatalogue(data || []))
  }, [canEdit, gig.org_id])

  const shown = useMemo(() => (items || []).filter(i => !hidden.has(i.id)), [items, hidden])
  const size = stageSize(stage)
  const current = shown.find(i => i.id === selected) || null

  // Changes show at once and are saved a moment later (a drag or a run of arrow presses is one save)
  function change(id, patch, { now = false } = {}) {
    setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)))
    const waiting = saveTimers.current[id]
    if (waiting) clearTimeout(waiting.timer)
    const merged = { ...(waiting?.patch || {}), ...patch }
    const save = async () => {
      delete saveTimers.current[id]
      const { error } = await supabase.from('gig_plot_items').update(merged).eq('id', id)
      if (error) { logger.error('plot', error, { step: 'update' }); notify(userMessage(error), 'error'); load() }
    }
    if (now) save()
    else saveTimers.current[id] = { patch: merged, timer: setTimeout(save, 500), save }
  }
  // Saves still waiting are sent when leaving the tool
  useEffect(() => () => {
    for (const w of Object.values(saveTimers.current)) { clearTimeout(w.timer); w.save() }
  }, [])

  async function add(kind) {
    const spot = newSpot(shown, stage)
    const { data, error } = await supabase.from('gig_plot_items').insert({ gig_id: gig.id, kind, ...spot }).select(FIELDS).single()
    if (error) return notify(userMessage(error), 'error')
    track(`plot:add:${kind}`)
    setItems(list => [...list, data])
    setSelected(data.id)
  }

  function remove(item) {
    setSelected(null)
    removeLater(item.id, {
      message: t('undo.removed', { name: item.label || t(`plot.kind.${item.kind}`) }),
      commit: async () => (await supabase.from('gig_plot_items').delete().eq('id', item.id)).error,
      onDone: load,
    })
  }

  function nudge(item, dx, dy) {
    change(item.id, place(Number(item.x) + dx, Number(item.y) + dy, stage))
  }

  async function saveStage(patch) {
    const next = { ...stage, ...patch }
    setStage(next)
    const { error } = await supabase.from('gig_show').upsert({ gig_id: gig.id, stage: next })
    if (error) { logger.error('plot', error, { step: 'stage' }); notify(userMessage(error), 'error') }
  }

  // Dragging with a finger or the mouse: the pointer's place on the drawing, in metres
  function pointerToStage(e) {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { x: p.x / 100, y: size.depth_m - p.y / 100 }
  }
  function onPointerDownItem(e, item) {
    if (!canEdit) return
    setSelected(item.id)
    drag.current = { id: item.id, moved: false }
    svgRef.current.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e) {
    if (!drag.current) return
    const p = pointerToStage(e)
    drag.current.moved = true
    const spot = place(p.x, p.y, stage)
    setItems(list => list.map(i => (i.id === drag.current.id ? { ...i, ...spot } : i)))
    drag.current.spot = spot
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    if (d?.moved && d.spot) change(d.id, d.spot, { now: true })
  }
  function onKeyDownItem(e, item) {
    if (!canEdit) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return setSelected(item.id) }
    const step = e.shiftKey ? 1 : STEP_M
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[e.key]) { e.preventDefault(); setSelected(item.id); nudge(item, ...moves[e.key]) }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); change(item.id, { rotation: nextRotation(item.rotation) }) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(item) }
  }

  // The plot's channels → the input list (adding the input list to the gig if it isn't there)
  async function sendToInputs() {
    setBusy(true)
    const { data: inputs, error } = await supabase.from('gig_inputs').select('channel, plot_ref').eq('gig_id', gig.id)
    if (error) { setBusy(false); return notify(userMessage(error), 'error') }
    const rows = plotToInputs(shown, inputs, t)
    if (rows.length) {
      if (!hasInputList) {
        const res = await supabase.from('gig_tools').insert({ gig_id: gig.id, tool: 'input_list' })
        if (res.error) { setBusy(false); return notify(userMessage(res.error), 'error') }
        onToolsChanged?.()
      }
      const res = await supabase.from('gig_inputs').insert(rows.map(r => ({ ...r, gig_id: gig.id })))
      if (res.error) { setBusy(false); logger.error('plot', res.error, { step: 'inputs' }); return notify(userMessage(res.error), 'error') }
      track('plot:toInputs')
    }
    setBusy(false)
    notify(rows.length ? t('plot.sentToInputs', { count: rows.length }) : t('plot.inputsUpToDate'), 'success')
  }

  async function addToEquipment() {
    setBusy(true)
    const { data: lines, error } = await supabase.from('gig_equipment').select('id, item_id, quantity').eq('gig_id', gig.id)
    if (error) { setBusy(false); return notify(userMessage(error), 'error') }
    const todo = inputsToEquipment(shown, lines).filter(x => x.add > 0)
    for (const x of todo) {
      const line = lines.find(l => l.item_id === x.item_id)
      const res = line
        ? await supabase.from('gig_equipment').update({ quantity: x.needed }).eq('id', line.id)
        : await supabase.from('gig_equipment').insert({ gig_id: gig.id, item_id: x.item_id, quantity: x.needed })
      if (res.error) { setBusy(false); return notify(userMessage(res.error), 'error') }
    }
    setBusy(false)
    track('plot:toEquipment')
    notify(todo.length ? t('inputs.addedToEquipment', { count: todo.reduce((s, x) => s + x.add, 0) }) : t('plot.equipmentUpToDate'), 'success')
  }

  if (items === null) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  const channels = plotChannelCount(shown)
  const nameOf = item => (item.label ? `${t(`plot.kind.${item.kind}`)} · ${item.label}` : t(`plot.kind.${item.kind}`))

  return (
    <section aria-labelledby="stage-plot-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 200px' }}>
          <h2 id="stage-plot-title" style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.stage_plot')}</h2>
          <p style={{ color: colors.muted, fontSize: '13px' }}>
            {t('plot.count', { count: shown.length })}{channels > 0 && ` · ${t('plot.channels', { count: channels })}`}
          </p>
        </div>
        {shown.length > 0 && <Link to={`/gig/${gig.id}/plot`} style={{ ...btn, textDecoration: 'none' }}><Printer size={14} /> {t('inputs.print')}</Link>}
      </div>
      {savedAt && <p role="status" style={{ fontSize: '12px', color: 'var(--warn)', marginBottom: '10px' }}>{t('plot.offline')}</p>}

      {canEdit && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}>
          <div style={{ width: '110px' }}>
            <label style={label} htmlFor="stage-width">{t('plot.width')}</label>
            <input id="stage-width" type="number" min={2} max={40} step={0.5} defaultValue={size.width_m} key={`w${size.width_m}`}
              onBlur={e => Number(e.target.value) !== size.width_m && saveStage({ width_m: stageSize({ width_m: e.target.value, depth_m: size.depth_m }).width_m })} style={input} />
          </div>
          <div style={{ width: '110px' }}>
            <label style={label} htmlFor="stage-depth">{t('plot.depth')}</label>
            <input id="stage-depth" type="number" min={2} max={30} step={0.5} defaultValue={size.depth_m} key={`d${size.depth_m}`}
              onBlur={e => Number(e.target.value) !== size.depth_m && saveStage({ depth_m: stageSize({ width_m: size.width_m, depth_m: e.target.value }).depth_m })} style={input} />
          </div>
          <p style={{ fontSize: '12px', color: colors.muted, flex: '1 1 200px', lineHeight: 1.5 }}>{t('plot.howTo')}</p>
        </div>
      )}

      <div style={{ ...card, padding: '8px', marginBottom: '12px' }}
        onPointerMove={canEdit ? onPointerMove : undefined} onPointerUp={canEdit ? onPointerUp : undefined} onPointerCancel={canEdit ? onPointerUp : undefined}>
        <StagePlotSvg ref={svgRef} stage={stage} items={shown} selected={selected} title={t('plot.drawingTitle', { name: gig.name })}
          onSelect={canEdit ? id => setSelected(id) : undefined}
          onPointerDownItem={canEdit ? onPointerDownItem : undefined} onKeyDownItem={canEdit ? onKeyDownItem : undefined} />
      </div>

      {canEdit && current && (
        <div role="group" aria-label={t('plot.selected', { name: nameOf(current) })} style={{ ...card, marginBottom: '12px', borderColor: tint(colors.accent, 45), display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <strong style={{ fontSize: '14px' }}>{nameOf(current)}</strong>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={() => nudge(current, -STEP_M, 0)} aria-label={t('plot.moveLeft')} style={iconBtn}><ArrowLeft size={16} /></button>
            <button type="button" onClick={() => nudge(current, 0, STEP_M)} aria-label={t('plot.moveBack')} style={iconBtn}><ArrowUp size={16} /></button>
            <button type="button" onClick={() => nudge(current, 0, -STEP_M)} aria-label={t('plot.moveFront')} style={iconBtn}><ArrowDown size={16} /></button>
            <button type="button" onClick={() => nudge(current, STEP_M, 0)} aria-label={t('plot.moveRight')} style={iconBtn}><ArrowRight size={16} /></button>
            <button type="button" onClick={() => change(current.id, { rotation: nextRotation(current.rotation) })} style={btn}><RotateCw size={14} /> {t('plot.rotate')}</button>
            <button type="button" onClick={() => remove(current)} style={{ ...btn, color: colors.danger }}><Trash2 size={14} /> {t('plot.remove')}</button>
            <span style={{ fontSize: '12px', color: colors.muted }}>{t('plot.where', { x: Number(current.x), y: Number(current.y) })}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <div>
              <label style={label} htmlFor="plot-label">{t('plot.label')}</label>
              <input id="plot-label" maxLength={60} defaultValue={current.label || ''} key={`l${current.id}`} placeholder={t('plot.labelPlaceholder')}
                onBlur={e => (e.target.value.trim() || null) !== (current.label || null) && change(current.id, { label: e.target.value.trim() || null }, { now: true })} style={input} />
            </div>
            {catalogue.length > 0 && (
              <div>
                <label style={label} htmlFor="plot-item">{t('inputs.item')}</label>
                <select id="plot-item" value={current.item_id || ''} onChange={e => change(current.id, { item_id: e.target.value || null }, { now: true })} style={{ ...input, appearance: 'auto' }}>
                  <option value="">{t('inputs.noItem')}</option>
                  {catalogue.map(i => <option key={i.id} value={i.id}>{i.name}{i.category ? ` · ${i.category}` : ''}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {canEdit && (
        <div style={{ marginBottom: '14px' }}>
          <h3 style={{ ...label, marginBottom: '6px' }}>{t('plot.addTitle')}</h3>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SYMBOL_ORDER.map(kind => (
              <button key={kind} type="button" onClick={() => add(kind)} style={{ ...btn, padding: '6px 10px', fontSize: '13px' }}>
                {t(`plot.kind.${kind}`)}{SYMBOLS[kind].inputs.length > 0 && <span style={{ color: colors.muted, fontSize: '11px' }}> · {SYMBOLS[kind].inputs.length} ch</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState compact title={t('plot.emptyTitle')} body={canEdit ? t('plot.emptyEditor') : t('plot.emptyReader')} guide="pm-stage-plot" />
      ) : (
        <section aria-labelledby="on-stage">
          <h3 id="on-stage" style={{ ...label, marginBottom: '6px' }}>{t('plot.onStage')}</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[...shown].sort((a, b) => Number(b.y) - Number(a.y) || Number(a.x) - Number(b.x)).map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} disabled={!canEdit}
                  style={{ ...card, width: '100%', textAlign: 'left', padding: '8px 12px', font: 'inherit', color: 'var(--text)', cursor: canEdit ? 'pointer' : 'default',
                    borderColor: selected === item.id ? colors.accent : undefined, display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'baseline', opacity: 1 }}>
                  <strong style={{ fontSize: '14px' }}>{nameOf(item)}</strong>
                  <span style={{ fontSize: '12px', color: colors.muted }}>{t('plot.where', { x: Number(item.x), y: Number(item.y) })}</span>
                  {SYMBOLS[item.kind]?.inputs.length > 0 && <span style={{ fontSize: '12px', color: colors.soft }}>{t('plot.channels', { count: SYMBOLS[item.kind].inputs.length })}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && shown.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '14px' }}>
          {channels > 0 && (
            <button type="button" onClick={sendToInputs} disabled={busy} style={btnPrimary}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ListOrdered size={14} />} {t('plot.toInputs')}
            </button>
          )}
          {canPlanEquipment && shown.some(i => i.item_id) && (
            <button type="button" onClick={addToEquipment} disabled={busy} style={btn}><PackagePlus size={14} /> {t('plot.toEquipment')}</button>
          )}
        </div>
      )}
    </section>
  )
}

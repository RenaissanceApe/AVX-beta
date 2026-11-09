import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Trash2, AlertTriangle, ShieldAlert, CheckCircle2, CircleHelp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { saveSnapshot, loadSnapshot, isNetworkError } from '../../lib/offline'
import { barsOf } from '../../lib/lightPlot'
import { sourcesOf } from '../../lib/systemCalc'
import { selectAll } from '../../lib/selectAll'
import { arraysOf, arrayLoadsOnLine } from '../../lib/lineArray'
import {
  LIMITS, HOIST_CLASSES, OVER_PEOPLE, settingsOf, linesOf, fixturesOnBar, fingerprint, defaultPoints,
  analyseLine, nextLineName, modelsById, hoistCopy,
} from '../../lib/rigging'
import { t, fmt } from '../../i18n'
import { btn, btnPrimary, iconBtn, input, label, card, colors, AvxLoader, Modal } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import { NumberField, TextField, Check } from './RigFields'
import LineArrays from './LineArrays'

const FIXTURE_FIELDS = 'id, name, position, universe, address, plot_x, plot_y, weight_kg'
const MODEL_FIELDS = 'id, org_id, brand, model, class, wll_kg, falls, self_weight_kg, chain_kg_m, speed_m_min, source, source_date, notes, needs_check, removed_at'
const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

// The rigging tool, first part (docs/TOOLS_PLAN.md §5, RG1): each truss line's load (fixtures from
// the light plot, the truss itself, cable, accessories, extra loads, motors), its hang points and
// what each hoist carries, checked against the hoist's WLL and class. Everything is an aid that a
// competent rigger must check. Everyone on the gig reads it, also offline; editors change it.
// ?line=<bar id> (from the light plot) opens or starts the line for that bar.
export default function RiggingTool({ gig, canEdit, canPlanEquipment }) {
  const { notify } = useToast()
  const [params, setParams] = useSearchParams()
  const [show, setShow] = useState(null) // { lighting, rigging, system }
  const [fixtures, setFixtures] = useState([])
  const [models, setModels] = useState([])
  const [savedAt, setSavedAt] = useState(null)
  const [addingModel, setAddingModel] = useState(false)
  const lineRefs = useRef({})

  const load = useCallback(async () => {
    const [s, f, m] = await Promise.all([
      supabase.from('gig_show').select('lighting, rigging, system').eq('gig_id', gig.id).maybeSingle(),
      supabase.from('gig_fixtures').select(FIXTURE_FIELDS).eq('gig_id', gig.id),
      supabase.from('hoist_models').select(MODEL_FIELDS).is('removed_at', null).order('brand').order('model'),
    ])
    if (s.error && isNetworkError(s.error)) {
      const snap = loadSnapshot(`rigging.${gig.id}`)
      setShow(snap?.data?.show || { lighting: {}, rigging: {}, system: {} })
      setFixtures(snap?.data?.fixtures || [])
      setModels(snap?.data?.models || [])
      setSavedAt(snap?.savedAt || null)
      return
    }
    if (s.error) logger.error('rigging', s.error, { step: 'load' })
    if (f.error) logger.warn('rigging', f.error, { step: 'fixtures' })
    if (m.error) logger.warn('rigging', m.error, { step: 'models' })
    const next = { show: { lighting: s.data?.lighting || {}, rigging: s.data?.rigging || {}, system: s.data?.system || {} }, fixtures: f.data || [], models: m.data || [] }
    setShow(next.show)
    setFixtures(next.fixtures)
    setModels(next.models)
    setSavedAt(null)
    saveSnapshot(`rigging.${gig.id}`, next)
  }, [gig.id])
  useEffect(() => { load() }, [load])

  const bars = useMemo(() => barsOf(show?.lighting), [show])
  const settings = useMemo(() => settingsOf(show?.rigging), [show])
  const lines = useMemo(() => linesOf(show?.rigging), [show])
  const byId = useMemo(() => modelsById(models), [models])
  const arrays = useMemo(() => arraysOf(show?.rigging), [show])
  const sources = useMemo(() => sourcesOf(show?.system), [show])
  // Speakers in the organisation's catalogue (A1) that can be array elements, with their rigging
  // data and its check (RG3). Only editors who can read the catalogue get them.
  const [speakers, setSpeakers] = useState([])
  useEffect(() => {
    if (!canEdit || !canPlanEquipment || !gig.org_id) return
    selectAll(() => supabase.from('price_items').select('id, name, speaker_type, speaker_preset, weight_kg, rigging')
      .eq('org_id', gig.org_id).in('speaker_type', ['line_array', 'subwoofer']).is('archived_at', null).order('name').order('id'))
      .then(({ data, error }) => {
        if (error) logger.warn('rigging', error, { step: 'speakers' })
        setSpeakers(data || [])
      })
  }, [canEdit, canPlanEquipment, gig.org_id])
  // How many of each item the gig's equipment holds, to compare with an array's element count
  const [booked, setBooked] = useState({})
  useEffect(() => {
    if (!canEdit) return
    supabase.from('gig_equipment').select('item_id, quantity').eq('gig_id', gig.id).not('item_id', 'is', null).limit(1000)
      .then(({ data, error }) => {
        if (error) return logger.warn('rigging', error, { step: 'booked' })
        const out = {}
        for (const l of data || []) out[l.item_id] = (out[l.item_id] || 0) + (Number(l.quantity) || 0)
        setBooked(out)
      })
  }, [canEdit, gig.id])
  // Organisation models first, then the presets; only the gig's organisation's own and the presets
  const pickable = useMemo(() => models.filter(m => !m.org_id || m.org_id === gig.org_id), [models, gig.org_id])

  async function save(patch) {
    const rigging = { ...(show?.rigging || {}), ...patch }
    setShow(s => ({ ...s, rigging }))
    const { error } = await supabase.from('gig_show').upsert({ gig_id: gig.id, rigging })
    if (error) { logger.error('rigging', error, { step: 'save' }); notify(userMessage(error), 'error'); load() }
  }
  const saveLines = list => save({ lines: list })
  const editLine = (id, patch) => saveLines(lines.map(l => (l.id === id ? { ...l, ...patch } : l)))

  function addLine(bar) {
    if (lines.length >= LIMITS.lines) return
    const length = bar ? bar.length : 6
    const line = {
      id: uid('l'), bar_id: bar?.id || null, name: bar ? bar.name : nextLineName(lines, t('rig.line')),
      length_m: length, truss_kg_m: 0, cable_kg_m: null, accessories_kg: 0, loads: [], points: defaultPoints(length, i => uid(`p${i}`)), checked: null,
    }
    saveLines([...lines, line])
    track(bar ? 'rigging:addFromPlot' : 'rigging:addByHand')
    return line
  }

  // From the light plot: open the bar's line, or start one
  const wanted = params.get('line')
  useEffect(() => {
    if (!wanted || show === null) return
    const bar = bars.find(b => b.id === wanted)
    let line = lines.find(l => l.bar_id === wanted)
    if (!line && bar && canEdit && !savedAt) line = addLine(bar)
    setParams(p => { const next = new URLSearchParams(p); next.delete('line'); return next }, { replace: true })
    if (line) setTimeout(() => lineRefs.current[line.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, show === null])

  function removeLine(line) {
    const before = lines
    saveLines(lines.filter(l => l.id !== line.id))
    notify(t('undo.removed', { name: line.name }), 'success', { action: { label: t('common.undo'), onClick: () => saveLines(before) } })
  }

  async function addModel(values) {
    const { data, error } = await supabase.from('hoist_models').insert({ org_id: gig.org_id, ...values }).select(MODEL_FIELDS).single()
    if (error) { logger.error('rigging', error, { step: 'addModel' }); return notify(userMessage(error), 'error') }
    setModels(ms => [...ms, data])
    setAddingModel(false)
    track('rigging:addModel')
    notify(t('rig.modelAdded'), 'success')
  }
  async function removeModel(m) {
    const { error } = await supabase.from('hoist_models').update({ removed_at: new Date().toISOString() }).eq('id', m.id)
    if (error) return notify(userMessage(error), 'error')
    setModels(ms => ms.filter(x => x.id !== m.id))
    notify(t('undo.removed', { name: `${m.brand} ${m.model}` }), 'success', {
      action: { label: t('common.undo'), onClick: async () => { await supabase.from('hoist_models').update({ removed_at: null }).eq('id', m.id); load() } },
    })
  }

  if (show === null) return <AvxLoader size={20} color={colors.accentText} />
  const freeBars = bars.filter(b => b.kind !== 'floor' && !lines.some(l => l.bar_id === b.id))

  return (
    <section aria-labelledby="rig-title">
      <div style={{ marginBottom: '12px' }}>
        <h2 id="rig-title" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.rigging')}</h2>
        <p style={{ color: colors.muted, fontSize: '13px' }}>{t('rig.count', { count: lines.length })}</p>
      </div>
      {savedAt && <p role="status" style={{ fontSize: '13px', color: colors.warn, marginBottom: '8px' }}>{t('rig.offline')}</p>}
      <p style={{ ...card, display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', lineHeight: 1.5, marginBottom: '12px', borderColor: 'var(--warn)' }}>
        <ShieldAlert size={16} color={colors.warn} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
        <span><strong>{t('rig.aidTitle')}</strong> {t('rig.aid')}</span>
      </p>

      <section aria-labelledby="rig-settings" style={{ marginBottom: '16px' }}>
        <h3 id="rig-settings" style={{ ...label, marginBottom: '4px' }}>{t('rig.defaults')}</h3>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('rig.defaultsNote')}</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <NumberField id="rig-cable" hint="rig-cable" text={t('rig.cable')} value={settings.cable_kg_m} range={LIMITS.cable_kg_m} step={0.5} disabled={!canEdit} onSave={v => save({ settings: { ...settings, cable_kg_m: v } })} />
          <NumberField id="rig-dynamic" hint="rig-dynamic" text={t('rig.dynamic')} value={settings.dynamic_factor} range={LIMITS.dynamic_factor} step={0.05} disabled={!canEdit} onSave={v => save({ settings: { ...settings, dynamic_factor: v } })} />
        </div>
      </section>

      <section aria-labelledby="rig-lines" style={{ marginBottom: '16px' }}>
        <h3 id="rig-lines" style={{ ...label, marginBottom: '8px' }}>{t('rig.lines')}</h3>
        {canEdit && !savedAt && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'flex-end' }}>
            {freeBars.length > 0 && (
              <div style={{ flex: '1 1 200px' }}>
                <label style={label} htmlFor="rig-from-plot">{t('rig.fromPlot')}</label>
                <select id="rig-from-plot" value="" onChange={e => { const b = bars.find(x => x.id === e.target.value); if (b) addLine(b) }} style={{ ...input, appearance: 'auto' }}>
                  <option value="">{t('rig.pickBar')}</option>
                  {freeBars.map(b => <option key={b.id} value={b.id}>{b.name} · {b.length} m</option>)}
                </select>
              </div>
            )}
            <button type="button" onClick={() => addLine(null)} style={btn}><Plus size={14} /> {t('rig.addByHand')}</button>
          </div>
        )}
        {lines.length === 0 ? (
          <EmptyState compact title={t('rig.emptyTitle')} body={canEdit ? t('rig.emptyEditor') : t('rig.emptyReader')} guide="pm-rigging" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lines.map(line => {
              const bar = line.bar_id ? bars.find(b => b.id === line.bar_id) || null : null
              const onBar = bar ? fixturesOnBar(bar, bars, fixtures) : []
              return (
                <li key={line.id} ref={el => { lineRefs.current[line.id] = el }}>
                  <LineCard line={line} bar={bar} arrayLoads={arrayLoadsOnLine(arrays, line.id, { models: byId, settings, lines })} lost={!!line.bar_id && !bar} onBar={onBar} settings={settings} models={byId} pickable={pickable}
                    canEdit={canEdit && !savedAt} onEdit={patch => editLine(line.id, patch)} onRemove={() => removeLine(line)} />
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <LineArrays rigging={show?.rigging} onSave={save} lines={lines} models={byId} pickable={pickable} settings={settings} speakers={speakers} sources={sources} booked={booked}
        canEdit={canEdit && !savedAt} canReadCatalogue={canPlanEquipment && !!gig.org_id} />

      <section aria-labelledby="rig-models">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <h3 id="rig-models" style={label}>{t('rig.models')}</h3>
          {canEdit && canPlanEquipment && gig.org_id && !savedAt && (
            <button type="button" onClick={() => setAddingModel(true)} style={{ ...btn, padding: '6px 10px', marginLeft: 'auto' }}><Plus size={14} /> {t('rig.addModel')}</button>
          )}
        </div>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('rig.modelsNote')}</p>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pickable.map(m => (
            <li key={m.id} style={{ ...card, padding: '8px 12px', fontSize: '13px', lineHeight: 1.5 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '14px' }}>{m.brand} {m.model}</strong>
                <span style={{ color: colors.muted }}>{m.class}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{m.wll_kg !== null ? t('rig.wllKg', { kg: Number(m.wll_kg) }) : t('rig.noWllShort')}</span>
                {m.org_id && canEdit && canPlanEquipment && !savedAt && (
                  <button type="button" onClick={() => removeModel(m)} aria-label={t('inputs.remove', { name: `${m.brand} ${m.model}` })} style={iconBtn}><Trash2 size={14} /></button>
                )}
              </div>
              <p style={{ color: colors.soft }}>
                {[m.self_weight_kg !== null && t('rig.selfWeight', { kg: Number(m.self_weight_kg) }), m.chain_kg_m !== null && t('rig.chainWeight', { kg: Number(m.chain_kg_m) }),
                  m.falls && t('rig.falls', { count: m.falls }), m.speed_m_min !== null && t('rig.speed', { m: Number(m.speed_m_min) })].filter(Boolean).join(' · ')}
              </p>
              <p style={{ color: colors.muted }}>
                {m.org_id ? t('rig.ownModel') : t('rig.preset')}
                {m.source && <> · {/^https?:\/\//.test(m.source) ? <a href={m.source} target="_blank" rel="noreferrer" style={{ color: colors.accentText }}>{t('rig.source')}</a> : m.source}</>}
                {m.source_date && ` (${m.source_date})`}
              </p>
              {m.notes && <p style={{ color: colors.muted }}>{m.notes}</p>}
              {m.needs_check && <p style={{ color: colors.warn, display: 'flex', gap: '4px', alignItems: 'center' }}><AlertTriangle size={13} aria-hidden="true" /> {t('rig.needsCheck')}</p>}
            </li>
          ))}
        </ul>
      </section>

      {addingModel && <ModelForm onClose={() => setAddingModel(false)} onSave={addModel} />}
    </section>
  )
}

const STATUS_ICON = { ok: CheckCircle2, near: AlertTriangle, over: AlertTriangle, uplift: AlertTriangle, noHoist: CircleHelp, noWll: CircleHelp, unknown: CircleHelp }
const statusColour = s => (s === 'over' || s === 'uplift' ? colors.danger : s === 'near' ? colors.warn : s === 'ok' ? colors.accentText : colors.muted)

function LineCard({ line, bar, lost, onBar, arrayLoads = [], settings, models, pickable, canEdit, onEdit, onRemove }) {
  // Line arrays hung from this line (RG3) add their pick loads; they're edited in the array
  const a = analyseLine({ ...line, loads: [...line.loads, ...arrayLoads] }, { bar, onBar, models, settings })
  const print = fingerprint(bar, onBar)
  const checked = bar && line.checked && line.checked.fingerprint === print
  const editPoint = (id, patch) => onEdit({ points: line.points.map(p => (p.id === id ? { ...p, ...patch } : p)) })
  const editLoad = (id, patch) => onEdit({ loads: line.loads.map(x => (x.id === id ? { ...x, ...patch } : x)) })
  const pickModel = (id, modelId) => editPoint(id, { hoist_model_id: modelId || null, hoist: modelId ? hoistCopy(models[modelId]) : null })
  const loadRows = ['fixtures', 'truss', 'cable', 'accessories', 'extra', 'motors'].filter(k => a.loads[k] > 0)

  return (
    <article aria-labelledby={`rig-line-${line.id}`} style={{ ...card, padding: '12px', borderColor: a.over ? 'var(--danger)' : undefined }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h4 id={`rig-line-${line.id}`} style={{ fontSize: '16px', fontWeight: 700 }}>{line.name}</h4>
        <span style={{ fontSize: '13px', color: colors.muted }}>{bar ? t('rig.fromBar', { m: a.length }) : t('rig.byHand', { m: a.length })}</span>
        <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700 }}>{t('rig.totalKg', { kg: a.total })}</span>
        {canEdit && <button type="button" onClick={onRemove} aria-label={t('inputs.remove', { name: line.name })} style={iconBtn}><Trash2 size={14} /></button>}
      </div>
      {lost && <p style={{ fontSize: '13px', color: colors.warn }}>{t('rig.barGone')}</p>}

      <p style={{ fontSize: '13px', color: colors.soft, lineHeight: 1.6, marginTop: '4px' }}>
        {loadRows.length ? loadRows.map(k => t(`rig.load.${k}`, { kg: a.loads[k] })).join(' · ') : t('rig.noLoads')}
        {` · ${t('rig.withFactor', { factor: settings.dynamic_factor, kg: a.dynamic_total })}`}
      </p>
      {a.unknownWeights > 0 && <p style={{ fontSize: '13px', color: colors.warn }}>{t('rig.unknownWeights', { count: a.unknownWeights })}</p>}
      {bar && (
        <p style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px', color: checked ? colors.soft : colors.warn }}>
          {checked ? t('rig.checkedOn', { date: fmt(line.checked.at, 'd MMM yyyy, HH:mm') }) : line.checked ? t('rig.changedSince') : t('rig.notChecked')}
          {canEdit && !checked && (
            <button type="button" onClick={() => onEdit({ checked: { at: new Date().toISOString(), fingerprint: print } })} style={{ ...btn, padding: '4px 8px' }}>{t('rig.markChecked')}</button>
          )}
        </p>
      )}

      {canEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '8px' }}>
          {!bar && <TextField id={`rl-name-${line.id}`} text={t('rig.name')} value={line.name} onSave={v => v && onEdit({ name: v })} />}
          {!bar && <NumberField id={`rl-len-${line.id}`} text={t('rig.length')} value={line.length_m} range={LIMITS.length_m} step={0.5} onSave={v => onEdit({ length_m: v })} />}
          <NumberField id={`rl-truss-${line.id}`} hint="rig-truss" text={t('rig.trussKgM')} value={line.truss_kg_m} range={LIMITS.truss_kg_m} step={0.1} onSave={v => onEdit({ truss_kg_m: v })} />
          <NumberField id={`rl-cable-${line.id}`} text={t('rig.cableHere')} value={line.cable_kg_m} placeholder={String(settings.cable_kg_m)} empty range={LIMITS.cable_kg_m} step={0.5} onSave={v => onEdit({ cable_kg_m: v })} />
          <NumberField id={`rl-acc-${line.id}`} hint="rig-accessories" text={t('rig.accessories')} value={line.accessories_kg} range={LIMITS.accessories_kg} step={1} onSave={v => onEdit({ accessories_kg: v })} />
        </div>
      )}

      <h5 style={{ ...label, marginTop: '12px', marginBottom: '4px' }}>{t('rig.extraLoads')}</h5>
      {line.loads.length === 0 && <p style={{ fontSize: '13px', color: colors.muted }}>{t('rig.noExtra')}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {line.loads.map(x => (
          <li key={x.id} style={{ fontSize: '13px' }}>
            {canEdit ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '8px', alignItems: 'end' }}>
                <TextField id={`ld-name-${x.id}`} text={t('rig.loadName')} value={x.name} onSave={v => editLoad(x.id, { name: v })} />
                <NumberField id={`ld-kg-${x.id}`} text={t('rig.kg')} value={x.kg} range={LIMITS.load_kg} step={1} onSave={v => editLoad(x.id, { kg: v })} />
                <NumberField id={`ld-at-${x.id}`} hint="rig-along" text={t('rig.at')} value={x.at_m} range={[0, a.length]} step={0.25} onSave={v => editLoad(x.id, { at_m: v })} />
                <NumberField id={`ld-to-${x.id}`} hint="rig-spread" text={t('rig.to')} value={x.to_m} empty range={[0, a.length]} step={0.25} onSave={v => editLoad(x.id, { to_m: v })} />
                <button type="button" onClick={() => onEdit({ loads: line.loads.filter(y => y.id !== x.id) })} aria-label={t('inputs.remove', { name: x.name || t('rig.loadName') })} style={iconBtn}><Trash2 size={14} /></button>
              </div>
            ) : (
              <span style={{ color: colors.soft }}>{x.name || '—'} · {x.kg} kg · {x.to_m !== null ? t('rig.spreadAt', { from: x.at_m, to: x.to_m }) : t('rig.pointAt', { m: x.at_m })}</span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && line.loads.length < LIMITS.loads && (
        <button type="button" onClick={() => onEdit({ loads: [...line.loads, { id: uid('x'), name: '', kg: 0, at_m: 0, to_m: null }] })} style={{ ...btn, padding: '6px 10px', marginTop: '8px' }}>
          <Plus size={14} /> {t('rig.addLoad')}
        </button>
      )}

      {arrayLoads.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '8px', fontSize: '13px', color: colors.soft }}>
          {arrayLoads.map(x => <li key={x.id}>{t('la.onThisLine', { name: x.name, kg: x.kg, m: x.at_m })}</li>)}
        </ul>
      )}

      <h5 style={{ ...label, marginTop: '12px', marginBottom: '4px' }}>{t('rig.points')}</h5>
      {a.problem && <p role="alert" style={{ fontSize: '13px', color: colors.danger, marginBottom: '4px' }}>{t(`rig.problem.${a.problem}`)}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {a.results.map((r, i) => {
          const p = line.points.find(x => x.id === r.id)
          const Icon = STATUS_ICON[r.status]
          return (
            <li key={r.id} style={{ borderTop: i ? '1px solid var(--line)' : 'none', paddingTop: i ? '8px' : 0 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '13px' }}>
                <strong style={{ fontSize: '14px' }}>{t('rig.pointName', { n: i + 1, m: r.at_m })}</strong>
                <span style={{ color: colors.soft }}>{r.model ? `${r.model.brand} ${r.model.model} (${r.model.class || '—'})` : t('rig.noHoistChosen')}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {r.kg === null ? '—' : t('rig.reaction', { kg: r.kg, dyn: r.dynamic_kg })}
                </span>
              </div>
              <p style={{ fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center', color: statusColour(r.status) }}>
                <Icon size={13} aria-hidden="true" />
                {t(`rig.status.${r.status}`, { use: r.use !== null ? Math.round(r.use * 100) : 0, wll: r.wll_kg })}
              </p>
              {!r.peopleOk && (
                <p style={{ fontSize: '13px', display: 'flex', gap: '4px', alignItems: 'center', color: colors.danger }}>
                  <AlertTriangle size={13} aria-hidden="true" /> {t('rig.notOverPeople', { cls: r.model.class })}
                </p>
              )}
              {r.model?.needs_check && <p style={{ fontSize: '13px', color: colors.muted }}>{t('rig.modelNeedsCheck')}</p>}
              {canEdit && p && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '8px', alignItems: 'end' }}>
                  <NumberField id={`pt-at-${p.id}`} hint="rig-along" text={t('rig.at')} value={p.at_m} range={[0, a.length]} step={0.25} onSave={v => editPoint(p.id, { at_m: v })} />
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={label} htmlFor={`pt-model-${p.id}`}>{t('rig.hoist')}</label>
                    <select id={`pt-model-${p.id}`} value={p.hoist_model_id || ''} onChange={e => pickModel(p.id, e.target.value)} style={{ ...input, appearance: 'auto' }}>
                      <option value="">{t('rig.noHoistChosen')}</option>
                      {p.hoist_model_id && !pickable.some(m => m.id === p.hoist_model_id) && <option value={p.hoist_model_id}>{p.hoist ? `${p.hoist.brand} ${p.hoist.model}` : '—'}</option>}
                      {pickable.map(m => <option key={m.id} value={m.id}>{m.brand} {m.model} · {m.class}{m.wll_kg !== null ? ` · ${Number(m.wll_kg)} kg` : ''}</option>)}
                    </select>
                  </div>
                  <Check id={`pt-people-${p.id}`} text={t('rig.overPeople')} checked={p.over_people} onChange={v => editPoint(p.id, { over_people: v })} />
                  <Check id={`pt-motor-${p.id}`} hint="rig-climbing" text={t('rig.motorOnLine')} checked={p.motor_on_line} onChange={v => editPoint(p.id, { motor_on_line: v })} />
                  {line.points.length > 2 && (
                    <button type="button" onClick={() => onEdit({ points: line.points.filter(x => x.id !== p.id) })} aria-label={t('rig.removePoint', { n: i + 1 })} style={iconBtn}><Trash2 size={14} /></button>
                  )}
                </div>
              )}
              {!canEdit && <p style={{ fontSize: '13px', color: colors.muted }}>{p?.over_people ? t('rig.isOverPeople') : t('rig.isNotOverPeople')}{p?.motor_on_line ? ` · ${t('rig.motorOnLine')}` : ''}</p>}
            </li>
          )
        })}
      </ul>
      {canEdit && line.points.length < LIMITS.points && (
        <button type="button" onClick={() => onEdit({ points: [...line.points, { id: uid('p'), at_m: Math.round(a.length * 50) / 100, hoist_model_id: null, hoist: null, over_people: true, motor_on_line: false }] })}
          style={{ ...btn, padding: '6px 10px', marginTop: '8px' }}>
          <Plus size={14} /> {t('rig.addPoint')}
        </button>
      )}
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginTop: '8px' }}>{t('rig.assumptions')}</p>
    </article>
  )
}

function ModelForm({ onClose, onSave }) {
  const [v, setV] = useState({ brand: '', model: '', class: 'D8+', wll_kg: '', self_weight_kg: '', source: t('rig.dataPlate'), notes: '' })
  const set = k => e => setV(s => ({ ...s, [k]: e.target.value }))
  const n = x => (x === '' ? null : Number(x))
  const valid = v.brand.trim() && v.model.trim() && Number(v.wll_kg) > 0
  return (
    <Modal title={t('rig.addModel')} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (valid) onSave({ brand: v.brand.trim(), model: v.model.trim(), class: v.class, wll_kg: n(v.wll_kg), self_weight_kg: n(v.self_weight_kg), source: v.source.trim(), notes: v.notes.trim() }) }}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5 }}>{t('rig.modelFormNote')}</p>
        <div><label style={label} htmlFor="hm-brand">{t('rig.brand')}</label><input id="hm-brand" required maxLength={60} value={v.brand} onChange={set('brand')} style={input} /></div>
        <div><label style={label} htmlFor="hm-model">{t('rig.model')}</label><input id="hm-model" required maxLength={80} value={v.model} onChange={set('model')} style={input} /></div>
        <div>
          <HintLabel htmlFor="hm-class" hint="rig-class">{t('rig.class')}</HintLabel>
          <select id="hm-class" value={v.class} onChange={set('class')} style={{ ...input, appearance: 'auto' }}>
            {HOIST_CLASSES.map(c => <option key={c} value={c}>{c} · {OVER_PEOPLE[c] ? t('rig.classOverPeople') : t('rig.classNotOverPeople')}</option>)}
          </select>
        </div>
        <div><HintLabel htmlFor="hm-wll" hint="rig-wll">{t('rig.wll')}</HintLabel><input id="hm-wll" required type="number" min={1} max={50000} step={1} value={v.wll_kg} onChange={set('wll_kg')} style={input} /></div>
        <div><label style={label} htmlFor="hm-weight">{t('rig.selfWeightLabel')}</label><input id="hm-weight" type="number" min={0} max={5000} step={0.1} value={v.self_weight_kg} onChange={set('self_weight_kg')} style={input} /></div>
        <div><label style={label} htmlFor="hm-source">{t('rig.sourceLabel')}</label><input id="hm-source" maxLength={500} value={v.source} onChange={set('source')} style={input} /></div>
        <div><label style={label} htmlFor="hm-notes">{t('rig.notes')}</label><input id="hm-notes" maxLength={1000} value={v.notes} onChange={set('notes')} style={input} /></div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btn}>{t('rig.cancel')}</button>
          <button type="submit" disabled={!valid} style={{ ...btnPrimary, opacity: valid ? 1 : 0.5 }}>{t('rig.saveModel')}</button>
        </div>
      </form>
    </Modal>
  )
}

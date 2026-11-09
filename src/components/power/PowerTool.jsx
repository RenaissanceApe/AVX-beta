import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Plus, Trash2, AlertTriangle, Info, Plug, FileDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { buildPowerPdf, powerPdfName } from '../../lib/powerPdf'
import { track } from '../../lib/usage'
import {
  CONNECTORS, PHASES, OUTPUT_PHASES, connectorOf, feedChoices, distroFromItem, figuresOf, newId, HEADROOM_WARN,
} from '../../lib/power'
import { t, getLanguage } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors, StatusBadge, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import usePowerPlan from './usePowerPlan'

const row = { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }
const small = { fontSize: '13px', color: colors.muted, lineHeight: 1.5 }
const h3 = { fontSize: '16px', fontWeight: 700, marginBottom: '4px' }
const select = { ...input, appearance: 'auto', cursor: 'pointer' }
const KINDS = ['fixture', 'speaker', 'equipment', 'manual']

export const STATUS_TONE = { connected: 'ok', partly: 'warn', none: 'off' }
export const STATE_TONE = { ok: 'ok', near: 'warn', over: 'danger' }
export const ampsText = (amps, phases) => (phases === 1 ? `${amps[0]} A` : PHASES.map((p, i) => `${p} ${amps[i]} A`).join(' · '))
export const wattsText = w => (w >= 10000 ? t('power.kw', { kw: Math.round(w / 100) / 10 }) : t('power.w', { w: Math.round(w) }))

// What a load draws, in words: watts, amps from its datasheet (D77), or no figure
export function loadFigure(load) {
  if (load.unknown) return t('power.noFigure')
  if (load.fromAmps) return t('power.fromAmps', { va: Math.round(load.va) })
  return wattsText(load.watts)
}

// Where a load is plugged in, as a select value: '', 'p:L1', 'd:<distro>:<output>'
const placeValue = a => (!a ? '' : a.phase ? `p:${a.phase}` : `d:${a.distro}:${a.output}`)
const placeOf = v => {
  if (!v) return null
  if (v.startsWith('p:')) return { phase: v.slice(2) }
  const [, distro, output] = v.split(':')
  return { distro, output }
}

// The gig's power plan (P1, docs/TOOLS_PLAN.md §4): the supply, the distros and their outputs, the
// loads from the light plot, DMX patch, sound system, equipment and typed by hand, and where each
// is plugged in; current per phase and output, neutral, headroom, balance and a generator size.
// Every figure is an estimate for a qualified electrician. Everyone on the gig reads it; editors change it.
export default function PowerTool({ gig, canEdit }) {
  const { notify } = useToast()
  const p = usePowerPlan(gig, { canEdit })
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState('all')
  const [picked, setPicked] = useState(new Set())
  const [filing, setFiling] = useState(false)
  const { user } = useAuth() || {}

  if (!p.data) return <AvxLoader size={20} color={colors.accentText} />
  const { supply, distros, manual, assign, loads, plan, warnings, margin } = p
  const edit = canEdit && !p.savedAt

  async function save(patch) {
    const error = await p.save(patch)
    if (error) notify(userMessage(error), 'error')
  }
  const saveDistros = list => save({ distros: list })
  const editDistro = (id, patch) => saveDistros(distros.map(d => (d.id === id ? { ...d, ...patch } : d)))
  function place(keys, value) {
    const next = { ...assign }
    for (const k of keys) { if (value) next[k] = placeOf(value); else delete next[k] }
    save({ assign: next })
  }
  function removeDistro(d) {
    const before = { distros, assign }
    const next = { ...assign }
    for (const [k, a] of Object.entries(next)) if (a.distro === d.id) delete next[k]
    save({ distros: distros.filter(x => x.id !== d.id).map(x => (x.feed?.distro === d.id ? { ...x, feed: null } : x)), assign: next })
    notify(t('undo.removed', { name: d.name }), 'success', { action: { label: t('common.undo'), onClick: () => save(before) } })
  }
  function removeManual(m) {
    const before = { manual, assign }
    const next = { ...assign }
    delete next[`m:${m.id}`]
    save({ manual: manual.filter(x => x.id !== m.id), assign: next })
    notify(t('undo.removed', { name: m.name }), 'success', { action: { label: t('common.undo'), onClick: () => save(before) } })
  }
  function addDistro(item) {
    const d = item ? distroFromItem(item, figuresOf(item)) : { id: newId('d'), name: t('power.distroName', { n: distros.length + 1 }), item_id: null, input: 'cee32_3', feed: null, outputs: [] }
    if (!distros.length) d.feed = 'supply'
    const figures = item ? { ...(p.data.power.figures || {}), [item.id]: figuresOf(item) } : undefined
    save({ distros: [...distros, d], ...(figures ? { figures } : {}) })
    track(item ? 'power:distro-catalogue' : 'power:distro-blank')
    setAdding(false)
  }

  // The report as a PDF in the gig's files (Files tab)
  async function saveToFiles() {
    setFiling(true)
    try {
      const lang = getLanguage()
      const doc = await buildPowerPdf({ gig, org: gig.organisations?.name || '', supply, distros, loads, assign, plan, warnings, lang })
      const blob = doc.output('blob')
      const path = `${gig.id}/${Date.now()}-power.pdf`
      const { error: upErr } = await supabase.storage.from('gig-assets').upload(path, blob, { contentType: 'application/pdf' })
      if (upErr) throw upErr
      const { error } = await supabase.from('assets').insert({ gig_id: gig.id, type: 'document', name: powerPdfName(gig, lang), file_url: path, file_size: blob.size, created_by: user?.id })
      if (error) throw error
      track('power:report-file')
      notify(t('power.filed'), 'success')
    } catch (e) {
      logger.error('power', e, { step: 'gig_file', gigId: gig.id })
      notify(userMessage(e), 'error')
    } finally {
      setFiling(false)
    }
  }

  // Every place a load can go, for the selects
  const places = [
    ...OUTPUT_PHASES.filter(ph => supply.phases === 3 || ph === 'L1').map(ph => ({ value: `p:${ph}`, text: t('power.direct', { phase: supply.phases === 1 ? t('power.single') : ph === '3P' ? t('power.threePhase') : ph }) })),
    ...distros.flatMap(d => d.outputs.map(o => ({ value: `d:${d.id}:${o.id}`, text: `${d.name} · ${o.label || t(`power.conn.${o.connector}`)} (${o.phase})` }))),
  ]
  const shown = loads.filter(l => kind === 'all' || l.kind === kind)

  return (
    <section aria-labelledby="power-title" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <h2 id="power-title" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{t('tools.name.power')}</h2>
          <p style={small}>{t('power.count', { loads: loads.length, distros: distros.length })}</p>
        </div>
        {(loads.length > 0 || distros.length > 0) && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Link to={`/gig/${gig.id}/power`} style={{ ...btn, textDecoration: 'none' }}><Printer size={14} aria-hidden="true" /> {t('power.report')}</Link>
            {edit && <button type="button" onClick={saveToFiles} disabled={filing} style={btn}>{filing ? <AvxLoader size={14} /> : <FileDown size={14} aria-hidden="true" />} {t('power.toFiles')}</button>}
          </div>
        )}
      </div>
      {p.savedAt && <p role="status" style={{ ...small, color: 'var(--warn)' }}>{t('power.offline')}</p>}
      <p style={{ ...card, fontSize: '13px', lineHeight: 1.5, display: 'flex', gap: '8px' }}>
        <Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} /> <span>{t('power.estimate')}</span>
      </p>

      <SupplyCard supply={supply} plan={plan} margin={margin} edit={edit} onSupply={s => save({ supply: { ...supply, ...s } })} onMargin={m => save({ margin: m })} />

      {warnings.length > 0 && (
        <section aria-labelledby="power-warnings" style={card}>
          <h3 id="power-warnings" style={h3}>{t('power.warnings')}</h3>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {warnings.map((w, i) => (
              <li key={i} style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start', color: w.level === 'over' ? colors.danger : undefined }}>
                {w.level === 'info' ? <Info size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} /> : <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />}
                <span><strong>{t(`power.level.${w.level}`)}:</strong> {t(w.key, w.vars)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="power-distros" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 id="power-distros" style={{ ...h3, marginBottom: 0 }}>{t('power.distros')}</h3>
          {edit && <button type="button" onClick={() => setAdding(true)} style={btn}><Plus size={14} aria-hidden="true" /> {t('power.addDistro')}</button>}
        </div>
        {distros.length === 0 ? (
          <EmptyState icon={<Plug size={28} />} title={t('power.noDistrosTitle')} body={edit ? t('power.noDistrosEditor') : t('power.noDistrosReader')}
            action={edit ? t('power.addDistro') : null} onAction={() => setAdding(true)} guide={edit ? 'pm-power' : null} />
        ) : distros.map(d => (
          <DistroCard key={d.id} d={d} distros={distros} result={plan.distros[d.id]} supply={supply} edit={edit} loads={loads}
            onChange={patch => editDistro(d.id, patch)} onRemove={() => removeDistro(d)} />
        ))}
      </section>

      <section aria-labelledby="power-loads" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 id="power-loads" style={{ ...h3, marginBottom: 0 }}>{t('power.loads')}</h3>
        <p style={small}>{t('power.total', { watts: wattsText(plan.total.watts), count: plan.total.count })}{plan.unplugged.count > 0 && ` · ${t('power.unpluggedTotal', { count: plan.unplugged.count, watts: wattsText(plan.unplugged.watts) })}`}</p>
        <div style={row}>
          <div style={{ width: '200px' }}>
            <label style={label} htmlFor="power-kind">{t('power.show')}</label>
            <select id="power-kind" value={kind} onChange={e => { setKind(e.target.value); setPicked(new Set()) }} style={select}>
              <option value="all">{t('power.kind.all')}</option>
              {KINDS.map(k => <option key={k} value={k}>{t(`power.kind.${k}`)}</option>)}
            </select>
          </div>
          {edit && picked.size > 0 && (
            <div style={{ width: '260px' }}>
              <label style={label} htmlFor="power-bulk">{t('power.plugPicked', { count: picked.size })}</label>
              <select id="power-bulk" value="" onChange={e => { place([...picked], e.target.value === '-' ? '' : e.target.value); setPicked(new Set()) }} style={select}>
                <option value="" disabled>{t('power.choosePlace')}</option>
                <option value="-">{t('power.notPlugged')}</option>
                {places.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
              </select>
            </div>
          )}
        </div>
        {loads.length === 0 ? (
          <EmptyState icon={<Plug size={28} />} title={t('power.noLoadsTitle')} body={t('power.noLoadsBody')} />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {shown.map(l => {
              const info = plan.loads[l.key]
              const id = `pl-${l.key.replace(/[^a-z0-9]/gi, '-')}`
              return (
                <li key={l.key} style={{ ...card, display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {edit && (
                    <input type="checkbox" checked={picked.has(l.key)} aria-label={t('power.pick', { name: l.name })} style={{ width: '20px', height: '20px' }}
                      onChange={e => setPicked(s => { const n = new Set(s); if (e.target.checked) n.add(l.key); else n.delete(l.key); return n })} />
                  )}
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '14px' }}>{l.name}{l.qty > 1 ? ` × ${l.qty}` : ''}</strong>
                    <span style={small}>{[t(`power.kind.${l.kind}`), l.detail, loadFigure(l), info.amps ? t('power.ampsPhase', { a: info.amps, phases: info.phases.join('+') }) : ''].filter(Boolean).join(' · ')}</span>
                  </div>
                  <StatusBadge small tone={STATUS_TONE[info.status]}>{t(`power.status.${info.status}`)}</StatusBadge>
                  {edit ? (
                    <div style={{ flex: '1 1 200px' }}>
                      <select id={id} aria-label={t('power.pluggedInto', { name: l.name })} value={placeValue(assign[l.key])} onChange={e => place([l.key], e.target.value)} style={select}>
                        <option value="">{t('power.notPlugged')}</option>
                        {places.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
                      </select>
                    </div>
                  ) : (
                    <span style={{ fontSize: '13px' }}>{places.find(o => o.value === placeValue(assign[l.key]))?.text || t('power.notPlugged')}</span>
                  )}
                  {edit && l.kind === 'manual' && (
                    <button type="button" onClick={() => removeManual(manual.find(m => `m:${m.id}` === l.key))} aria-label={t('power.removeLoad', { name: l.name })} style={iconBtn}><Trash2 size={14} aria-hidden="true" /></button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {edit && <ManualForm supply={supply} onAdd={(m, phase) => {
          save({ manual: [...manual, m], ...(phase ? { assign: { ...assign, [`m:${m.id}`]: { phase } } } : {}) })
          track('power:manual')
        }} />}
      </section>

      {adding && (
        <Modal title={t('power.addDistro')} onClose={() => setAdding(false)}>
          <p style={{ ...small, marginBottom: '12px' }}>{t('power.addDistroNote')}</p>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {p.catalogue.map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => addDistro(item)} style={{ ...card, width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--text)', font: 'inherit' }}>
                  <strong style={{ display: 'block' }}>{item.name}</strong>
                  <span style={small}>{t('power.outputsCount', { count: item.distro?.outputs?.length || 0 })}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => addDistro(null)} style={{ ...btn, width: '100%', justifyContent: 'center' }}><Plus size={14} aria-hidden="true" /> {t('power.blankDistro')}</button>
            </li>
          </ul>
        </Modal>
      )}
    </section>
  )
}

// The supply and its totals: phases with their load, neutral, balance and the generator suggestion
function SupplyCard({ supply, plan, margin, edit, onSupply, onMargin }) {
  const num = (key, lo, hi) => e => { const v = Math.min(hi, Math.max(lo, Math.round(Number(e.target.value) || supply[key]))); if (v !== supply[key]) onSupply({ [key]: v }) }
  const g = plan.generator
  return (
    <section aria-labelledby="power-supply" style={card}>
      <h3 id="power-supply" style={h3}>{t('power.supply')}</h3>
      <p style={{ ...small, marginBottom: '12px' }}>
        {supply.name ? `${supply.name} · ` : ''}{t(`power.kindOf.${supply.kind}`)} · {supply.phases === 3 ? t('power.voltsThree', { v: supply.volts, ll: Math.round(supply.volts * Math.sqrt(3)) }) : t('power.voltsSingle', { v: supply.volts })} · {supply.hz} Hz · {t('power.ampsPerPhase', { a: supply.amps })}
      </p>
      {edit && (
        <div style={{ ...row, marginBottom: '12px' }}>
          <div style={{ width: '150px' }}>
            <label style={label} htmlFor="ps-kind">{t('power.supplyKind')}</label>
            <select id="ps-kind" value={supply.kind} onChange={e => onSupply({ kind: e.target.value })} style={select}>
              <option value="venue">{t('power.kindOf.venue')}</option>
              <option value="generator">{t('power.kindOf.generator')}</option>
            </select>
          </div>
          <div style={{ width: '180px' }}>
            <label style={label} htmlFor="ps-name">{t('power.supplyName')}</label>
            <input id="ps-name" defaultValue={supply.name} key={`n${supply.name}`} maxLength={60} onBlur={e => e.target.value.trim() !== supply.name && onSupply({ name: e.target.value.trim() })} style={input} />
          </div>
          <div style={{ width: '150px' }}>
            <label style={label} htmlFor="ps-phases">{t('power.phases')}</label>
            <select id="ps-phases" value={supply.phases} onChange={e => onSupply({ phases: Number(e.target.value) })} style={select}>
              <option value={1}>{t('power.single')}</option>
              <option value={3}>{t('power.threePhase')}</option>
            </select>
          </div>
          <div style={{ width: '110px' }}>
            <HintLabel htmlFor="ps-amps" hint="power-supply-amps">{t('power.amps')}</HintLabel>
            <input id="ps-amps" type="number" min={1} max={6300} defaultValue={supply.amps} key={`a${supply.amps}`} onBlur={num('amps', 1, 6300)} style={input} />
          </div>
          <div style={{ width: '110px' }}>
            <HintLabel htmlFor="ps-volts" hint="power-volts">{t('power.volts')}</HintLabel>
            <input id="ps-volts" type="number" min={100} max={277} defaultValue={supply.volts} key={`v${supply.volts}`} onBlur={num('volts', 100, 277)} style={input} />
          </div>
          <div style={{ width: '100px' }}>
            <label style={label} htmlFor="ps-hz">{t('power.hz')}</label>
            <select id="ps-hz" value={supply.hz} onChange={e => onSupply({ hz: Number(e.target.value) })} style={select}>
              <option value={50}>50</option>
              <option value={60}>60</option>
            </select>
          </div>
        </div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {plan.supply.amps.slice(0, supply.phases).map((a, i) => {
          const ratio = a / supply.amps
          const tone = ratio > 1 ? 'danger' : ratio >= HEADROOM_WARN ? 'warn' : 'ok'
          return (
            <li key={i} style={{ fontSize: '13px' }}>
              <span style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <strong>{supply.phases === 1 ? t('power.single') : PHASES[i]}</strong>
                <span>{t('power.ampsOf', { a, max: supply.amps, pct: Math.round(ratio * 100) })} {tone !== 'ok' && <StatusBadge small tone={tone}>{t(`power.state.${tone === 'danger' ? 'over' : 'near'}`)}</StatusBadge>}</span>
              </span>
              <span aria-hidden="true" style={{ display: 'block', height: '6px', background: 'var(--hover)', overflow: 'hidden', marginTop: '4px' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.min(100, ratio * 100)}%`, background: tone === 'danger' ? colors.danger : tone === 'warn' ? colors.warn : colors.accent }} />
              </span>
            </li>
          )
        })}
      </ul>
      <p style={{ fontSize: '13px', marginTop: '12px', lineHeight: 1.5 }}>
        {t('power.neutral', { a: plan.supply.neutral })}
        {supply.phases === 3 && ` · ${t('power.balance', { pct: plan.supply.balance })}`}
      </p>
      <div style={{ ...row, marginTop: '12px' }}>
        <p style={{ fontSize: '14px', flex: '1 1 220px', lineHeight: 1.5 }}>
          <strong>{t('power.generator')}</strong>{' '}
          {g.needed > 0 ? (g.size ? t('power.generatorSize', { size: g.size, kva: g.kva, margin: g.margin }) : t('power.generatorTooBig', { kva: g.needed })) : t('power.generatorNone')}
        </p>
        {edit && (
          <div style={{ width: '110px' }}>
            <HintLabel htmlFor="ps-margin" hint="power-margin">{t('power.margin')}</HintLabel>
            <input id="ps-margin" type="number" min={0} max={100} defaultValue={margin} key={`m${margin}`}
              onBlur={e => { const v = Math.min(100, Math.max(0, Math.round(Number(e.target.value)))); if (Number.isFinite(v) && v !== margin) onMargin(v) }} style={input} />
          </div>
        )}
      </div>
    </section>
  )
}

// One distro: what feeds it, its outputs with their current and headroom, and its status
function DistroCard({ d, distros, result, supply, edit, loads, onChange, onRemove }) {
  const feedValue = !d.feed ? '' : d.feed === 'supply' ? 'supply' : `${d.feed.distro}:${d.feed.output}`
  const choices = feedChoices(distros, d.id)
  const setOutput = (oid, patch) => onChange({ outputs: d.outputs.map(o => (o.id === oid ? { ...o, ...patch } : o)) })
  const nameOf = key => loads.find(l => l.key === key)?.name || '—'
  const base = `dist-${d.id}`
  return (
    <article aria-labelledby={`${base}-name`} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <h4 id={`${base}-name`} style={{ fontSize: '16px', fontWeight: 700, flex: '1 1 160px' }}>{d.name}</h4>
        <StatusBadge tone={STATUS_TONE[result.status]}>{t(`power.status.${result.status}`)}</StatusBadge>
        {result.rating && result.state !== 'ok' && <StatusBadge tone={STATE_TONE[result.state]}>{t(`power.state.${result.state}`)}</StatusBadge>}
        {edit && <button type="button" onClick={onRemove} aria-label={t('power.removeDistro', { name: d.name })} style={iconBtn}><Trash2 size={14} aria-hidden="true" /></button>}
      </div>
      <p style={small}>
        {ampsText(result.amps, supply.phases)}{result.rating ? ` · ${t('power.rating', { a: result.rating })}` : ''} · {t('power.neutral', { a: result.neutral })}
      </p>
      {edit ? (
        <div style={row}>
          <div style={{ width: '180px' }}>
            <label style={label} htmlFor={`${base}-n`}>{t('power.distroNameLabel')}</label>
            <input id={`${base}-n`} defaultValue={d.name} key={d.name} maxLength={60} onBlur={e => e.target.value.trim() && e.target.value.trim() !== d.name && onChange({ name: e.target.value.trim() })} style={input} />
          </div>
          <div style={{ width: '240px' }}>
            <HintLabel htmlFor={`${base}-feed`} hint="power-feed">{t('power.feed')}</HintLabel>
            <select id={`${base}-feed`} value={feedValue} style={select}
              onChange={e => { const v = e.target.value; onChange({ feed: !v ? null : v === 'supply' ? 'supply' : { distro: v.split(':')[0], output: v.split(':')[1] } }) }}>
              <option value="">{t('power.notPlugged')}</option>
              <option value="supply">{t('power.fromSupply')}</option>
              {choices.flatMap(c => c.outputs.map(o => <option key={`${c.id}:${o.id}`} value={`${c.id}:${o.id}`}>{`${c.name} · ${o.label || t(`power.conn.${o.connector}`)} (${o.phase})`}</option>))}
            </select>
          </div>
          <div style={{ width: '170px' }}>
            <label style={label} htmlFor={`${base}-in`}>{t('power.input')}</label>
            <select id={`${base}-in`} value={d.input || ''} onChange={e => onChange({ input: e.target.value || null })} style={select}>
              <option value="">—</option>
              {CONNECTORS.map(c => <option key={c.id} value={c.id}>{t(`power.conn.${c.id}`)}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '13px' }}>{t('power.feed')}: {!d.feed ? t('power.notPlugged') : d.feed === 'supply' ? t('power.fromSupply') : `${distros.find(x => x.id === d.feed.distro)?.name || '—'} · ${distros.find(x => x.id === d.feed.distro)?.outputs.find(o => o.id === d.feed.output)?.label || d.feed.output}`}</p>
      )}

      <ul aria-label={t('power.outputsOf', { name: d.name })} style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {d.outputs.map((o, i) => {
          const r = result.outputs[o.id]
          const oid = `${base}-${o.id}`
          return (
            <li key={o.id} style={{ borderTop: '1px solid var(--line)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <strong style={{ fontSize: '14px', flex: '1 1 140px' }}>{o.label || t('power.outputN', { n: i + 1 })} · {t(`power.conn.${o.connector}`)} · {o.phase}</strong>
                <span style={{ fontSize: '13px' }}>{t('power.outputLoad', { a: Math.max(...r.amps), max: r.rating, pct: Math.round((r.ratio || 0) * 100) })}</span>
                <StatusBadge small tone={STATE_TONE[r.state]}>{t(`power.state.${r.state}`)}</StatusBadge>
              </div>
              {r.loads.length > 0 && <p style={small}>{r.loads.map(nameOf).join(', ')}</p>}
              {edit && (
                <div style={row}>
                  <div style={{ width: '120px' }}>
                    <label style={label} htmlFor={`${oid}-l`}>{t('power.outputLabel')}</label>
                    <input id={`${oid}-l`} defaultValue={o.label} key={o.label} maxLength={30} onBlur={e => e.target.value.trim() !== o.label && setOutput(o.id, { label: e.target.value.trim() })} style={input} />
                  </div>
                  <div style={{ width: '150px' }}>
                    <label style={label} htmlFor={`${oid}-c`}>{t('power.connector')}</label>
                    <select id={`${oid}-c`} value={o.connector} onChange={e => setOutput(o.id, { connector: e.target.value })} style={select}>
                      {CONNECTORS.map(c => <option key={c.id} value={c.id}>{t(`power.conn.${c.id}`)}</option>)}
                    </select>
                  </div>
                  <div style={{ width: '90px' }}>
                    <label style={label} htmlFor={`${oid}-p`}>{t('power.phase')}</label>
                    <select id={`${oid}-p`} value={o.phase} onChange={e => setOutput(o.id, { phase: e.target.value })} style={select}>
                      {OUTPUT_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
                    </select>
                  </div>
                  <div style={{ width: '90px' }}>
                    <HintLabel htmlFor={`${oid}-b`} hint="power-breaker">{t('power.breaker')}</HintLabel>
                    <input id={`${oid}-b`} type="number" min={1} max={6300} defaultValue={o.breaker_a ?? ''} key={`b${o.breaker_a}`} placeholder={String(connectorOf(o.connector)?.amps || '')}
                      onBlur={e => { const v = e.target.value === '' ? null : Math.round(Number(e.target.value)); if (v !== o.breaker_a && (v === null || v > 0)) setOutput(o.id, { breaker_a: v }) }} style={input} />
                  </div>
                  <div style={{ width: '90px' }}>
                    <HintLabel htmlFor={`${oid}-r`} hint="power-rcd">{t('power.rcd')}</HintLabel>
                    <input id={`${oid}-r`} type="number" min={1} max={1000} defaultValue={o.rcd_ma ?? ''} key={`r${o.rcd_ma}`}
                      onBlur={e => { const v = e.target.value === '' ? null : Math.round(Number(e.target.value)); if (v !== o.rcd_ma && (v === null || v > 0)) setOutput(o.id, { rcd_ma: v }) }} style={input} />
                  </div>
                  <button type="button" onClick={() => onChange({ outputs: d.outputs.filter(x => x.id !== o.id) })} aria-label={t('power.removeOutput', { name: o.label || t('power.outputN', { n: i + 1 }) })} style={iconBtn}><Trash2 size={14} aria-hidden="true" /></button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {d.outputs.length === 0 && <p style={small}>{t('power.noOutputs')}</p>}
      {edit && d.outputs.length < 48 && (
        <button type="button" onClick={() => onChange({ outputs: [...d.outputs, { id: newId('o'), label: '', connector: 'schuko', phase: PHASES[d.outputs.length % 3], breaker_a: 16, rcd_ma: 30 }] })} style={{ ...btn, alignSelf: 'flex-start' }}>
          <Plus size={14} aria-hidden="true" /> {t('power.addOutput')}
        </button>
      )}
    </article>
  )
}

// A load typed by hand: catering, bars, a site office…
function ManualForm({ supply, onAdd }) {
  const [f, setF] = useState({ name: '', watts: '', qty: '1', pf: '', three: false, phase: '' })
  const set = k => e => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const watts = Math.round(Number(f.watts))
  const pf = f.pf === '' ? null : Number(String(f.pf).replace(',', '.'))
  const ok = f.name.trim() && Number.isFinite(watts) && watts > 0 && watts <= 1000000 && (pf === null || (pf >= 0.3 && pf <= 1))
  const phases = useMemo(() => (supply.phases === 1 ? ['L1'] : f.three ? ['3P'] : PHASES), [supply.phases, f.three])
  function submit(e) {
    e.preventDefault()
    if (!ok) return
    onAdd({ id: newId('m'), name: f.name.trim().slice(0, 60), watts, qty: Math.min(999, Math.max(1, Math.round(Number(f.qty)) || 1)), pf, three: f.three }, phases.includes(f.phase) ? f.phase : null)
    setF({ name: '', watts: '', qty: '1', pf: '', three: false, phase: '' })
  }
  return (
    <form onSubmit={submit} aria-labelledby="power-manual" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4 id="power-manual" style={{ fontSize: '14px', fontWeight: 700 }}>{t('power.addManual')}</h4>
      <p style={small}>{t('power.manualNote')}</p>
      <div style={row}>
        <div style={{ flex: '1 1 180px' }}>
          <label style={label} htmlFor="pm-name">{t('power.manualName')}</label>
          <input id="pm-name" value={f.name} onChange={set('name')} maxLength={60} placeholder={t('power.manualPlaceholder')} style={input} />
        </div>
        <div style={{ width: '110px' }}>
          <label style={label} htmlFor="pm-watts">{t('power.wattsEach')}</label>
          <input id="pm-watts" type="number" min={1} max={1000000} value={f.watts} onChange={set('watts')} style={input} />
        </div>
        <div style={{ width: '80px' }}>
          <label style={label} htmlFor="pm-qty">{t('power.qty')}</label>
          <input id="pm-qty" type="number" min={1} max={999} value={f.qty} onChange={set('qty')} style={input} />
        </div>
        <div style={{ width: '100px' }}>
          <HintLabel htmlFor="pm-pf" hint="power-factor">{t('power.pf')}</HintLabel>
          <input id="pm-pf" inputMode="decimal" value={f.pf} onChange={set('pf')} placeholder="1" aria-invalid={pf !== null && !(pf >= 0.3 && pf <= 1)} style={input} />
        </div>
        <div style={{ width: '170px' }}>
          <label style={label} htmlFor="pm-phase">{t('power.manualPhase')}</label>
          <select id="pm-phase" value={phases.includes(f.phase) ? f.phase : ''} onChange={set('phase')} style={select}>
            <option value="">{t('power.later')}</option>
            {phases.map(ph => <option key={ph} value={ph}>{t('power.direct', { phase: supply.phases === 1 ? t('power.single') : ph === '3P' ? t('power.threePhase') : ph })}</option>)}
          </select>
        </div>
      </div>
      {supply.phases === 3 && (
        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '14px' }}>
          <input type="checkbox" checked={f.three} onChange={set('three')} style={{ width: '20px', height: '20px' }} /> {t('power.manualThree')}
        </label>
      )}
      <button type="submit" disabled={!ok} style={{ ...btnPrimary, alignSelf: 'flex-start' }}><Plus size={14} aria-hidden="true" /> {t('power.addManualButton')}</button>
    </form>
  )
}

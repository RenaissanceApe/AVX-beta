import { Plus, Trash2, AlertTriangle, CheckCircle2, CircleHelp, ShieldAlert, RefreshCw } from 'lucide-react'
import {
  LIMITS, arraysOf, analyseArray, framesFor, sourceFor, dataCheckState, fromSource, differsFromSource, isArrayElement, softwareFor,
} from '../../lib/lineArray'
import { hoistCopy } from '../../lib/rigging'
import { track } from '../../lib/usage'
import { t, fmt } from '../../i18n'
import { btn, iconBtn, input, label, card, colors } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import { NumberField, TextField, Check } from './RigFields'
import LineArraySvg from './LineArraySvg'

const uid = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const STATUS_ICON = { pass: CheckCircle2, check: CircleHelp, fail: AlertTriangle, none: CircleHelp }
const statusColour = s => (s === 'fail' ? colors.danger : s === 'pass' ? colors.accentText : colors.warn)
const pickColour = s => (s === 'over' || s === 'uplift' ? colors.danger : s === 'near' ? colors.warn : s === 'ok' || s === 'onLine' ? colors.accentText : colors.muted)

// Line arrays (RG3, docs/TOOLS_PLAN.md §5) inside the rigging tool: elements with splay angles on
// the manufacturer's bumper, checked against its limits; the point loads, pick position and tilt
// come from the manufacturer's software, which decides. Arrays live in gig_show.rigging.arrays.
export default function LineArrays({ rigging, onSave, lines, models, pickable, settings, speakers, speakersLoading = false, sources, booked = {}, canEdit, canReadCatalogue }) {
  const arrays = arraysOf(rigging)
  const saveArrays = list => onSave({ arrays: list })
  const edit = (id, patch) => saveArrays(arrays.map(a => (a.id === id ? { ...a, ...patch } : a)))
  const linked = new Set(arrays.map(a => a.source_id).filter(Boolean))
  const freeSources = sources.filter(s => !linked.has(s.id))
  // Elements of one item needed by all the arrays, against what the gig's equipment holds
  const needed = {}
  for (const a of arrays) if (a.item_id) needed[a.item_id] = (needed[a.item_id] || 0) + a.count

  function add(source) {
    if (arrays.length >= LIMITS.arrays) return
    // An array from the sound system copies its speaker's data: never save it before the speakers have loaded
    if (source?.item_id && speakersLoading) return
    const base = { id: uid('a'), name: t('la.newName', { n: arrays.length + 1 }), count: 8, splays: [], picks: 2, mode: 'cog' }
    const from = fromSource(source)
    const item = from.item_id ? speakers.find(s => s.id === from.item_id) : null
    saveArrays([...arrays, { ...base, ...from, ...(item ? elementFrom(item) : {}) }])
    track(source ? 'rigging:arrayFromSystem' : 'rigging:arrayByHand')
  }
  function remove(arr) { saveArrays(arrays.filter(a => a.id !== arr.id)) }

  return (
    <section aria-labelledby="la-title" style={{ marginBottom: '16px' }}>
      <h3 id="la-title" style={{ ...label, marginBottom: '4px' }}>{t('la.title')}</h3>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('la.intro')}</p>
      {canEdit && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', alignItems: 'flex-end' }}>
          {freeSources.length > 0 && (
            <div style={{ flex: '1 1 200px' }}>
              <HintLabel htmlFor="la-from-system" hint="la-from-system">{t('la.fromSystem')}</HintLabel>
              <select id="la-from-system" value="" disabled={speakersLoading} aria-busy={speakersLoading || undefined} onChange={e => { const s = sources.find(x => x.id === e.target.value); if (s) add(s) }} style={{ ...input, appearance: 'auto' }}>
                <option value="">{speakersLoading ? t('la.loadingSpeakers') : t('la.pickSource')}</option>
                {freeSources.map(s => <option key={s.id} value={s.id}>{s.name} · {t('la.elements', { count: s.count })}</option>)}
              </select>
            </div>
          )}
          {arrays.length < LIMITS.arrays && <button type="button" onClick={() => add(null)} style={btn}><Plus size={14} /> {t('la.addByHand')}</button>}
        </div>
      )}
      {arrays.length === 0 ? (
        <EmptyState compact title={t('la.emptyTitle')} body={canEdit ? t('la.emptyEditor') : t('la.emptyReader')} guide="pm-line-arrays" />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {arrays.map(arr => (
            <li key={arr.id}>
              <ArrayCard arr={arr} booked={arr.item_id ? booked[arr.item_id] ?? 0 : null} needed={arr.item_id ? needed[arr.item_id] : null} lines={lines} models={models} pickable={pickable} settings={settings} speakers={speakers} speakersLoading={speakersLoading} canReadCatalogue={canReadCatalogue}
                source={arr.source_id ? sources.find(s => s.id === arr.source_id) || null : null}
                canEdit={canEdit} onEdit={patch => edit(arr.id, patch)} onRemove={() => remove(arr)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// What an array copies from a catalogue item: name, weight, preset, the state of its rigging check
function elementFrom(item) {
  const frames = framesFor(item.speaker_preset)
  return {
    item_id: item.id, element_name: item.name, element_kg: item.weight_kg ?? null, preset: item.speaker_preset || null,
    data_check: dataCheckState(item.rigging, item.speaker_preset), frame_id: frames[0]?.id || null, frame: null,
  }
}

function ArrayCard({ arr, booked, needed, source, lines, models, pickable, settings, speakers, speakersLoading, canReadCatalogue, canEdit, onEdit, onRemove }) {
  const a = analyseArray(arr, { models, settings, lines })
  const frames = framesFor(arr.preset)
  const doc = sourceFor(arr.preset)
  const Icon = STATUS_ICON[a.status]
  const elements = speakers.filter(isArrayElement)
  const setSplay = (i, v) => { const s = [...arr.splays]; s[i] = v; onEdit({ splays: s }) }
  const editPick = (name, patch) => onEdit({ [name]: { ...arr[name], ...patch } })
  const pickModel = (name, id) => editPick(name, { hoist_model_id: id || null, hoist: id ? hoistCopy(models[id]) : null })
  const item = arr.item_id ? speakers.find(s => s.id === arr.item_id) : null
  // The item's check may have changed since the array copied it (editors who read the catalogue see it)
  const liveCheck = item ? dataCheckState(item.rigging, item.speaker_preset) : arr.data_check
  const pickName = n => t(`la.pick.${n}`)

  return (
    <article aria-labelledby={`la-${arr.id}`} style={{ ...card, padding: '12px', borderColor: a.status === 'fail' ? 'var(--danger)' : undefined }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h4 id={`la-${arr.id}`} style={{ fontSize: '16px', fontWeight: 700 }}>{arr.name}</h4>
        <span style={{ fontSize: '13px', color: colors.muted }}>{t('la.summary', { count: arr.count, name: arr.element_name || t('la.noElement') })}</span>
        <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700 }}>{t('rig.totalKg', { kg: a.weight.total })}</span>
        {canEdit && <button type="button" onClick={onRemove} aria-label={t('inputs.remove', { name: arr.name })} style={iconBtn}><Trash2 size={14} /></button>}
      </div>
      <p role="status" style={{ fontSize: '14px', fontWeight: 700, display: 'flex', gap: '4px', alignItems: 'center', color: statusColour(a.status), marginTop: '4px' }}>
        <Icon size={15} aria-hidden="true" /> {t(`la.status.${a.status}`)}
      </p>
      <p style={{ fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'flex-start', lineHeight: 1.5, marginTop: '4px' }}>
        <ShieldAlert size={14} color={colors.warn} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>{a.software ? t('la.softwareDecides', { software: a.software }) : t('la.softwareDecidesAny')}</span>
      </p>
      {a.needsCheck && (
        <p style={{ fontSize: '13px', color: colors.warn, display: 'flex', gap: '4px', alignItems: 'center' }}>
          <AlertTriangle size={13} aria-hidden="true" /> {a.frame?.hand ? t('la.handFrameCheck') : t(`la.data.${arr.data_check}`)}
        </p>
      )}
      {canEdit && item && liveCheck !== arr.data_check && (
        <button type="button" onClick={() => onEdit({ data_check: liveCheck })} style={{ ...btn, padding: '4px 8px', marginTop: '4px' }}>
          <RefreshCw size={13} /> {t('la.refreshCheck')}
        </button>
      )}
      {source && differsFromSource(arr, source) && (
        <p style={{ fontSize: '13px', color: colors.warn, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
          {t('la.sourceChanged', { name: source.name, n: source.count })}
          {canEdit && (
            <button type="button" style={{ ...btn, padding: '4px 8px' }} disabled={speakersLoading} aria-busy={speakersLoading || undefined} onClick={() => {
              const from = fromSource(source)
              const it = from.item_id ? speakers.find(s => s.id === from.item_id) : null
              onEdit({ ...from, ...(it ? elementFrom(it) : {}) })
            }}>{t('la.updateFromSource')}</button>
          )}
        </p>
      )}
      {canEdit && booked !== null && booked < needed && (
        <p style={{ fontSize: '13px', color: colors.warn }}>{t('la.booked', { have: booked, needed, name: arr.element_name })}</p>
      )}
      {arr.source_id && !source && <p style={{ fontSize: '13px', color: colors.warn }}>{t('la.sourceGone')}</p>}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
        <div style={{ flex: '1 1 160px', maxWidth: '260px' }}>
          <LineArraySvg arr={arr} analysis={a} />
          <p style={{ fontSize: '11px', color: colors.muted, marginTop: '4px' }}>{t('la.schematic')}</p>
        </div>
        <dl style={{ flex: '2 1 220px', fontSize: '13px', lineHeight: 1.6, margin: 0 }}>
          <Fact term={t('la.weight')}>
            {[a.weight.elements !== null && t('la.w.elements', { count: arr.count, kg: a.weight.elements }), a.weight.frame !== null && t('la.w.frame', { kg: a.weight.frame }), a.weight.extra > 0 && t('la.w.extra', { kg: a.weight.extra })].filter(Boolean).join(' · ') || '—'}
            {a.weight.unknown.length > 0 && <span style={{ display: 'block', color: colors.warn }}>{a.weight.unknown.map(k => t(`la.unknown.${k}`)).join(' ')}</span>}
          </Fact>
          <Fact term={t('la.bumper')}>
            {a.frame ? a.frame.name : t('la.noFrame')}
            {a.frame && <span style={{ display: 'block', color: colors.soft }}>{t('la.limits', { safe: a.frame.safe ?? '—', max: a.frame.max ?? '—' })}{a.frame.swl_kg !== null && t('la.limitsSwl', { swl: a.frame.swl_kg })}</span>}
            <span style={{ display: 'block', color: statusColour(a.bumper.status === 'none' ? 'check' : a.bumper.status) }}>
              {a.bumper.reasons.map(r => t(`la.reason.${r}`, { n: arr.count, safe: a.frame?.safe, max: a.frame?.max, swl: a.frame?.swl_kg, safeKg: a.frame?.safe_kg })).join(' ')}
            </span>
          </Fact>
          <Fact term={t('la.tilt')}>{arr.tilt_deg === null ? t('la.fromSoftware') : t('la.deg', { deg: arr.tilt_deg })}{arr.position && ` · ${t('la.positionIs', { position: arr.position })}`}</Fact>
          <Fact term={t('la.splays')}>{arr.splays.map(s => `${s}°`).join(' · ')}</Fact>
        </dl>
      </div>

      {a.frame && !a.frame.hand && (
        <details style={{ marginTop: '8px', fontSize: '13px' }}>
          <summary style={{ cursor: 'pointer', color: colors.accentText }}>{t('la.manufacturerData')}</summary>
          <p style={{ color: colors.soft, lineHeight: 1.5, marginTop: '4px' }}>“{a.frame.quote}” ({t('la.page', { page: a.frame.page })})</p>
          {a.frame.parts.map(p => <p key={p.name} style={{ color: colors.soft }}>{p.name}: {p.kg === null ? t('la.notPrinted') : `${p.kg} kg`} · “{p.quote}” ({t('la.page', { page: p.page })})</p>)}
          {a.frame.note && <p style={{ color: colors.muted }}>{a.frame.note}</p>}
          {doc && <p style={{ color: colors.muted }}><a href={doc.url} target="_blank" rel="noreferrer" style={{ color: colors.accentText }}>{doc.document}</a>, {doc.version} · {t('la.opened', { date: fmt(doc.opened, 'd MMM yyyy') })}</p>}
        </details>
      )}
      {a.frame?.hand && a.frame.source && <p style={{ fontSize: '13px', color: colors.muted, marginTop: '4px' }}>{t('la.handSource', { source: a.frame.source })}</p>}

      <h5 style={{ ...label, marginTop: '12px', marginBottom: '4px' }}>{t('la.picks')}</h5>
      {a.loads.problem && <p role="alert" style={{ fontSize: '13px', color: a.loads.problem === 'cogOutside' ? colors.danger : colors.warn, marginBottom: '4px' }}>{t(`la.problem.${a.loads.problem}`, { software: a.software || t('la.theSoftware') })}</p>}
      <p style={{ fontSize: '13px', color: colors.muted, marginBottom: '4px' }}>{t(`la.loadsFrom.${a.loads.from}`)}</p>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {a.picks.map((p, i) => {
          const pick = arr[p.name]
          return (
            <li key={p.name} style={{ borderTop: i ? '1px solid var(--line)' : 'none', paddingTop: i ? '8px' : 0 }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', fontSize: '13px' }}>
                <strong style={{ fontSize: '14px' }}>{pickName(p.name)}</strong>
                <span style={{ color: colors.soft }}>{p.line ? t('la.onLine', { line: p.line.name, m: pick.at_m }) : p.model ? `${p.model.brand} ${p.model.model} (${p.model.class || '—'})` : t('rig.noHoistChosen')}</span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                  {p.kg === null ? '—' : p.line ? `${p.kg} kg` : t('rig.reaction', { kg: p.kg, dyn: p.dynamic_kg })}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: pickColour(p.status) }}>
                {p.status === 'onLine' ? t('la.checkedOnLine') : p.status === 'unknown' ? t('la.pickUnknown') : p.status === 'uplift' ? t('la.pickUplift') : t(`rig.status.${p.status}`, { use: p.use !== null ? Math.round(p.use * 100) : 0, wll: p.wll_kg })}
              </p>
              {!p.peopleOk && <p style={{ fontSize: '13px', color: colors.danger }}>{t('rig.notOverPeople', { cls: p.model.class })}</p>}
              {p.model?.needs_check && <p style={{ fontSize: '13px', color: colors.muted }}>{t('rig.modelNeedsCheck')}</p>}
              {canEdit && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '8px', alignItems: 'end' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <HintLabel htmlFor={`la-hang-${arr.id}-${p.name}`} hint="la-hang">{t('la.hangsFrom')}</HintLabel>
                    <select id={`la-hang-${arr.id}-${p.name}`} value={pick.line_id || ''} onChange={e => editPick(p.name, { line_id: e.target.value || null })} style={{ ...input, appearance: 'auto' }}>
                      <option value="">{t('la.ownHoist')}</option>
                      {lines.map(l => <option key={l.id} value={l.id}>{t('la.truss', { name: l.name })}</option>)}
                    </select>
                  </div>
                  {pick.line_id ? (
                    <NumberField id={`la-at-${arr.id}-${p.name}`} text={t('rig.at')} value={pick.at_m} range={[0, 40]} step={0.25} onSave={v => editPick(p.name, { at_m: v })} />
                  ) : (
                    <>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={label} htmlFor={`la-hoist-${arr.id}-${p.name}`}>{t('rig.hoist')}</label>
                        <select id={`la-hoist-${arr.id}-${p.name}`} value={pick.hoist_model_id || ''} onChange={e => pickModel(p.name, e.target.value)} style={{ ...input, appearance: 'auto' }}>
                          <option value="">{t('rig.noHoistChosen')}</option>
                          {pick.hoist_model_id && !pickable.some(m => m.id === pick.hoist_model_id) && <option value={pick.hoist_model_id}>{pick.hoist ? `${pick.hoist.brand} ${pick.hoist.model}` : '—'}</option>}
                          {pickable.map(m => <option key={m.id} value={m.id}>{m.brand} {m.model} · {m.class}{m.wll_kg !== null ? ` · ${Number(m.wll_kg)} kg` : ''}</option>)}
                        </select>
                      </div>
                      <Check id={`la-people-${arr.id}-${p.name}`} text={t('rig.overPeople')} checked={pick.over_people} onChange={v => editPick(p.name, { over_people: v })} />
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {canEdit && (
        <details style={{ marginTop: '12px' }} open={!arr.element_name}>
          <summary style={{ ...label, cursor: 'pointer' }}>{t('la.edit')}</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '8px', alignItems: 'end' }}>
            <TextField id={`la-name-${arr.id}`} text={t('rig.name')} value={arr.name} onSave={v => v && onEdit({ name: v })} />
            <div style={{ gridColumn: 'span 2' }}>
              <HintLabel htmlFor={`la-el-${arr.id}`} hint="la-element">{t('la.element')}</HintLabel>
              <select id={`la-el-${arr.id}`} value={arr.item_id || ''} style={{ ...input, appearance: 'auto' }}
                onChange={e => { const it = elements.find(x => x.id === e.target.value); onEdit(it ? elementFrom(it) : { item_id: null, preset: null, frame_id: null, data_check: 'notChecked' }) }}>
                <option value="">{t('la.elementByHand')}</option>
                {arr.item_id && !elements.some(x => x.id === arr.item_id) && <option value={arr.item_id}>{arr.element_name || '—'}</option>}
                {elements.map(x => <option key={x.id} value={x.id}>{x.name}{x.weight_kg !== null ? ` · ${Number(x.weight_kg)} kg` : ''}</option>)}
              </select>
              {!canReadCatalogue && <p style={{ fontSize: '11px', color: colors.muted }}>{t('la.noCatalogue')}</p>}
            </div>
            {!arr.item_id && <TextField id={`la-elname-${arr.id}`} text={t('la.elementName')} max={60} value={arr.element_name} onSave={v => onEdit({ element_name: v })} />}
            {!arr.item_id && <NumberField id={`la-elkg-${arr.id}`} text={t('la.elementKg')} value={arr.element_kg} empty range={LIMITS.element_kg} step={0.1} onSave={v => onEdit({ element_kg: v })} />}
            <NumberField id={`la-count-${arr.id}`} text={t('la.count')} value={arr.count} range={LIMITS.count} step={1} onSave={v => onEdit({ count: Math.round(v) })} />
            <NumberField id={`la-extra-${arr.id}`} hint="la-extra" text={t('la.extraKg')} value={arr.extra_kg} range={LIMITS.extra_kg} step={1} onSave={v => onEdit({ extra_kg: v })} />
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0' }}>
            <legend style={{ ...label, padding: 0, marginBottom: '4px' }}>{t('la.splaysEdit')}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '8px' }}>
              {arr.splays.map((s, i) => (
                <NumberField key={i} id={`la-splay-${arr.id}-${i}`} text={i === 0 ? t('la.splayTop') : t('la.splay', { a: i, b: i + 1 })} value={s} range={LIMITS.splay} step={0.25} onSave={v => setSplay(i, v)} />
              ))}
            </div>
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '12px', alignItems: 'end' }}>
            <div style={{ gridColumn: 'span 2' }}>
              <HintLabel htmlFor={`la-frame-${arr.id}`} hint="la-bumper">{t('la.bumper')}</HintLabel>
              <select id={`la-frame-${arr.id}`} value={arr.frame_id || (arr.frame ? 'hand' : '')} style={{ ...input, appearance: 'auto' }}
                onChange={e => { const v = e.target.value; onEdit(v === 'hand' ? { frame_id: null, frame: arr.frame || { name: '' } } : { frame_id: v || null, frame: null }) }}>
                <option value="">{t('la.noFrame')}</option>
                {frames.map(f => <option key={f.id} value={f.id}>{f.name}{f.kg !== null ? ` · ${f.kg} kg` : ''}</option>)}
                <option value="hand">{t('la.frameByHand')}</option>
              </select>
            </div>
          </div>
          {arr.frame && !arr.frame_id && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '8px', alignItems: 'end' }}>
              <p style={{ gridColumn: '1 / -1', fontSize: '13px', color: colors.muted }}>{t('la.frameByHandNote')}</p>
              <TextField id={`la-fname-${arr.id}`} text={t('la.frameName')} max={60} value={arr.frame.name} onSave={v => onEdit({ frame: { ...arr.frame, name: v } })} />
              <NumberField id={`la-fkg-${arr.id}`} text={t('la.frameKg')} value={arr.frame.kg} empty range={LIMITS.frame_kg} step={0.1} onSave={v => onEdit({ frame: { ...arr.frame, kg: v } })} />
              <NumberField id={`la-fsafe-${arr.id}`} hint="la-safe-limit" text={t('la.safeLimit')} value={arr.frame.safe} empty range={LIMITS.elements_max} step={1} onSave={v => onEdit({ frame: { ...arr.frame, safe: v } })} />
              <NumberField id={`la-fmax-${arr.id}`} hint="la-max-limit" text={t('la.maxLimit')} value={arr.frame.max} empty range={LIMITS.elements_max} step={1} onSave={v => onEdit({ frame: { ...arr.frame, max: v } })} />
              <NumberField id={`la-fswl-${arr.id}`} text={t('la.swl')} value={arr.frame.swl_kg} empty range={LIMITS.swl_kg} step={1} onSave={v => onEdit({ frame: { ...arr.frame, swl_kg: v } })} />
              <TextField id={`la-fsrc-${arr.id}`} text={t('la.frameSource')} max={300} span={3} value={arr.frame.source} onSave={v => onEdit({ frame: { ...arr.frame, source: v } })} />
              <Check id={`la-fpull-${arr.id}`} text={t('la.withPullback')} checked={arr.frame.pullback} onChange={v => onEdit({ frame: { ...arr.frame, pullback: v } })} />
            </div>
          )}

          <fieldset style={{ border: '1px solid var(--line)', padding: '10px 12px', margin: '12px 0 0' }}>
            <legend style={{ ...label, padding: '0 4px' }}>{t('la.fromSoftwareTitle', { software: softwareFor(arr.preset) || t('la.theSoftware') })}</legend>
            <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginBottom: '8px' }}>{t('la.fromSoftwareNote')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', alignItems: 'end' }}>
              <TextField id={`la-sw-${arr.id}`} text={t('la.software')} max={120} span={3} value={arr.software} onSave={v => onEdit({ software: v })} />
              <NumberField id={`la-tilt-${arr.id}`} hint="la-tilt" text={t('la.tiltDeg')} value={arr.tilt_deg} empty range={LIMITS.tilt} step={0.1} onSave={v => onEdit({ tilt_deg: v })} />
              <TextField id={`la-pos-${arr.id}`} text={t('la.position')} span={1} value={arr.position} onSave={v => onEdit({ position: v })} />
              <div>
                <label style={label} htmlFor={`la-picks-${arr.id}`}>{t('la.pickCount')}</label>
                <select id={`la-picks-${arr.id}`} value={arr.picks} onChange={e => onEdit({ picks: Number(e.target.value) })} style={{ ...input, appearance: 'auto' }}>
                  <option value={1}>{t('la.onePick')}</option>
                  <option value={2}>{t('la.twoPicks')}</option>
                </select>
              </div>
              <div>
                <label style={label} htmlFor={`la-mode-${arr.id}`}>{t('la.mode')}</label>
                <select id={`la-mode-${arr.id}`} value={arr.mode} onChange={e => onEdit({ mode: e.target.value })} style={{ ...input, appearance: 'auto' }}>
                  <option value="cog">{t('la.modeCog')}</option>
                  <option value="loads">{t('la.modeLoads')}</option>
                </select>
              </div>
              {arr.mode === 'cog' && arr.picks === 2 && <NumberField id={`la-cog-${arr.id}`} hint="la-cog" text={t('la.cogMm')} value={arr.cog_mm} empty range={[-20000, 20000]} step={1} onSave={v => onEdit({ cog_mm: v })} />}
              {arr.mode === 'cog' && arr.picks === 2 && <NumberField id={`la-spacing-${arr.id}`} text={t('la.spacingMm')} value={arr.spacing_mm} empty range={LIMITS.mm} step={1} onSave={v => onEdit({ spacing_mm: v })} />}
              {arr.mode === 'loads' && <NumberField id={`la-front-${arr.id}`} text={arr.picks === 1 ? t('la.singleKg') : t('la.frontKg')} value={arr.front_kg} empty range={LIMITS.load_kg} step={1} onSave={v => onEdit({ front_kg: v })} />}
              {arr.mode === 'loads' && arr.picks === 2 && <NumberField id={`la-rear-${arr.id}`} text={t('la.rearKg')} value={arr.rear_kg} empty range={LIMITS.load_kg} step={1} onSave={v => onEdit({ rear_kg: v })} />}
              <NumberField id={`la-pull-${arr.id}`} hint="la-pullback" text={t('la.pullbackKg')} value={arr.pullback_kg} empty range={LIMITS.load_kg} step={1} onSave={v => onEdit({ pullback_kg: v })} />
            </div>
          </fieldset>
        </details>
      )}
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.5, marginTop: '8px' }}>{t('la.assumptions')}</p>
    </article>
  )
}

function Fact({ term, children }) {
  return (
    <div style={{ marginBottom: '4px' }}>
      <dt style={{ fontSize: '11px', color: colors.muted, fontWeight: 700 }}>{term}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  )
}

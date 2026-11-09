import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Cable, Wand2, PackagePlus, Tag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { newId } from '../../lib/power'
import {
  CABLE_TYPES, CABLE_KINDS, CORES, CABLE_DATA, LAYINGS, DROP_WARN, DROP_MAX, typeOf, cableTypeName, cableLineName, linkChoices, linkLabel,
  runName, cableList, matchItems, cablesToEquipment, runsFromPlan,
} from '../../lib/cables'
import { t } from '../../i18n'
import { btn, btnPrimary, iconBtn, input, label, card, colors, StatusBadge, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'

const row = { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }
const small = { fontSize: '13px', color: colors.muted, lineHeight: 1.5 }
const h3 = { fontSize: '16px', fontWeight: 700, marginBottom: 0 }
const select = { ...input, appearance: 'auto', cursor: 'pointer' }
export const CABLE_TONE = { ok: 'ok', near: 'warn', over: 'danger', unknown: 'off' }

// The cable runs of the gig's power plan (P2): power runs carry a link of the plan and show their
// current, voltage drop (added up from the supply) and what the cable may carry where it's laid;
// DMX, speaker and signal runs are typed with a from and a to. Below them, the cable list that goes
// into the gig's equipment. Estimates for a qualified electrician.
export default function CablesSection({ gig, p, edit, save }) {
  const { notify } = useToast()
  const { user } = useAuth() || {}
  const { distros, plan, cables, checks } = p
  const [kind, setKind] = useState('all')
  const before = cables
  const saveCables = list => save({ cables: list })
  const editRun = (id, patch) => saveCables(cables.map(c => (c.id === id ? { ...c, ...patch } : c)))
  function remove(c) {
    saveCables(cables.filter(x => x.id !== c.id))
    notify(t('undo.removed', { name: runName(c, distros, t) }), 'success', { action: { label: t('common.undo'), onClick: () => save({ cables: before }) } })
  }
  function fromPlan() {
    const add = runsFromPlan({ distros, plan, cables, newId })
    if (!add.length) return notify(t('cables.fromPlanNone'), 'success')
    saveCables([...cables, ...add])
    track('power:cables-from-plan')
    notify(t('cables.fromPlanAdded', { count: add.length }), 'success', { action: { label: t('common.undo'), onClick: () => save({ cables: before }) } })
  }
  const shown = cables.filter(c => kind === 'all' || c.kind === kind)
  const links = linkChoices(distros, t)

  return (
    <section aria-labelledby="power-cables" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 id="power-cables" style={h3}>{t('cables.title')}</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {cables.length + distros.length > 0 && <Link to={`/gig/${gig.id}/power/labels`} style={{ ...btn, textDecoration: 'none' }}><Tag size={14} aria-hidden="true" /> {t('cables.labels')}</Link>}
          {edit && distros.length > 0 && <button type="button" onClick={fromPlan} style={btn}><Wand2 size={14} aria-hidden="true" /> {t('cables.fromPlan')}</button>}
        </div>
      </div>
      <p style={small}>{t('cables.note', { warn: DROP_WARN, max: DROP_MAX })}</p>
      {cables.length > 0 && (
        <div style={{ width: '200px' }}>
          <label style={label} htmlFor="cable-kind">{t('power.show')}</label>
          <select id="cable-kind" value={kind} onChange={e => setKind(e.target.value)} style={select}>
            <option value="all">{t('cables.kind.all')}</option>
            {CABLE_KINDS.map(k => <option key={k} value={k}>{t(`cables.kind.${k}`)}</option>)}
          </select>
        </div>
      )}
      {cables.length === 0 ? (
        <EmptyState icon={<Cable size={28} />} title={t('cables.emptyTitle')} body={edit ? t('cables.emptyEditor') : t('cables.emptyReader')} guide={edit ? 'pm-cables' : null} />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shown.map(c => <RunCard key={c.id} c={c} x={checks[c.id]} distros={distros} links={links} edit={edit} onChange={patch => editRun(c.id, patch)} onRemove={() => remove(c)} />)}
        </ul>
      )}
      {edit && <AddRun links={links} onAdd={c => { saveCables([...cables, c]); track(`power:cable-${c.kind}`) }} />}
      {cables.length > 0 && <CableList gig={gig} p={p} edit={edit} save={save} user={user} />}
    </section>
  )
}

// One run: what it is, where it goes, its figures (power) and, for editors, its fields
function RunCard({ c, x, distros, links, edit, onChange, onRemove }) {
  const base = `run-${c.id}`
  const type = typeOf(c.type)
  const lengths = type?.lengths || []
  const name = runName(c, distros, t)
  return (
    <li style={{ ...card, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <strong id={`${base}-name`} style={{ display: 'block', fontSize: '14px', overflowWrap: 'anywhere' }}>{c.label || cableTypeName(c, t)}{c.qty > 1 ? ` × ${c.qty}` : ''}</strong>
          <span style={small}>{[t(`cables.kind.${c.kind}`), t('cables.metres', { m: c.length }), c.kind === 'power' ? linkLabel(c.link, distros, t) : [c.from, c.to].filter(Boolean).join(' → '), c.label ? cableTypeName(c, t) : ''].filter(Boolean).join(' · ')}</span>
        </div>
        {c.kind === 'power' && x && <StatusBadge small tone={CABLE_TONE[x.state]}>{t(`cables.state.${x.state}`)}</StatusBadge>}
        {edit && <button type="button" onClick={onRemove} aria-label={t('cables.remove', { name })} style={iconBtn}><Trash2 size={14} aria-hidden="true" /></button>}
      </div>
      {c.kind === 'power' && x && (
        <p style={{ fontSize: '13px', lineHeight: 1.5 }}>
          {x.state === 'unknown'
            ? (c.link ? t('cables.noFigure') : t('cables.linkIt'))
            : [
                t('cables.carries', { a: x.amps }),
                x.cap ? t('cables.capacity', { a: x.cap.amps }) : t('cables.noCapacity'),
                t('cables.drop', { v: x.drop.volts, pct: x.drop.pct }),
                t('cables.dropTotal', { pct: x.total }),
              ].join(' · ')}
          {x.unprotected && <><br />{t('cables.unprotected', { breaker: x.breaker, max: x.cap.amps })}</>}
        </p>
      )}
      {edit && (
        <div style={row}>
          <div style={{ width: '220px' }}>
            <label style={label} htmlFor={`${base}-t`}>{t('cables.type')}</label>
            <select id={`${base}-t`} value={c.type || (c.cores ? `custom:${c.cores}:${c.mm2}` : '')} style={select}
              onChange={e => { const v = e.target.value; if (v.startsWith('custom:')) { const [, cores, mm2] = v.split(':'); onChange({ type: null, cores, mm2: Number(mm2) }) } else onChange({ type: v, cores: undefined, mm2: undefined }) }}>
              <TypeOptions kind={c.kind} />
            </select>
          </div>
          <div style={{ width: '100px' }}>
            <label style={label} htmlFor={`${base}-l`}>{t('cables.length')}</label>
            <input id={`${base}-l`} type="number" min={0.5} max={500} step={0.5} list={lengths.length ? `${base}-ls` : undefined} defaultValue={c.length} key={`l${c.length}`}
              onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0 && v !== c.length) onChange({ length: v }) }} style={input} />
            {lengths.length > 0 && <datalist id={`${base}-ls`}>{lengths.map(l => <option key={l} value={l} />)}</datalist>}
          </div>
          <div style={{ width: '80px' }}>
            <label style={label} htmlFor={`${base}-q`}>{t('power.qty')}</label>
            <input id={`${base}-q`} type="number" min={1} max={99} defaultValue={c.qty} key={`q${c.qty}`}
              onBlur={e => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= 99 && v !== c.qty) onChange({ qty: v }) }} style={input} />
          </div>
          {c.kind === 'power' ? (
            <>
              <div style={{ width: '260px' }}>
                <HintLabel htmlFor={`${base}-k`} hint="cables-link">{t('cables.link')}</HintLabel>
                <select id={`${base}-k`} value={c.link || ''} onChange={e => onChange({ link: e.target.value || null })} style={select}>
                  <option value="">{t('cables.noLink')}</option>
                  {links.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
                </select>
              </div>
              <div style={{ width: '170px' }}>
                <HintLabel htmlFor={`${base}-y`} hint="cables-laying">{t('cables.laying')}</HintLabel>
                <select id={`${base}-y`} value={c.laying} onChange={e => onChange({ laying: e.target.value, group: e.target.value === 'bundled' ? 2 : e.target.value === 'drum' ? 1 : null })} style={select}>
                  {LAYINGS.map(l => <option key={l} value={l}>{t(`cables.lay.${l}`)}</option>)}
                </select>
              </div>
              {c.laying !== 'air' && (
                <div style={{ width: '120px' }}>
                  <label style={label} htmlFor={`${base}-g`}>{t(c.laying === 'drum' ? 'cables.layers' : 'cables.bundledWith')}</label>
                  <select id={`${base}-g`} value={c.group} onChange={e => onChange({ group: Number(e.target.value) })} style={select}>
                    {(c.laying === 'drum' ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6, 7, 8, 9, 10]).map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
              <div style={{ width: '110px' }}>
                <label style={label} htmlFor={`${base}-a`}>{t('cables.ambient')}</label>
                <select id={`${base}-a`} value={c.ambient} onChange={e => onChange({ ambient: Number(e.target.value) })} style={select}>
                  {[30, 40, 50, 60].map(n => <option key={n} value={n}>{n === 60 ? t('cables.ambientHot') : `${n} °C`}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div style={{ width: '160px' }}>
                <label style={label} htmlFor={`${base}-f`}>{t('cables.from')}</label>
                <input id={`${base}-f`} defaultValue={c.from} key={`f${c.from}`} maxLength={60} onBlur={e => e.target.value.trim() !== c.from && onChange({ from: e.target.value.trim() })} style={input} />
              </div>
              <div style={{ width: '160px' }}>
                <label style={label} htmlFor={`${base}-to`}>{t('cables.to')}</label>
                <input id={`${base}-to`} defaultValue={c.to} key={`t${c.to}`} maxLength={60} onBlur={e => e.target.value.trim() !== c.to && onChange({ to: e.target.value.trim() })} style={input} />
              </div>
            </>
          )}
          <div style={{ width: '160px' }}>
            <label style={label} htmlFor={`${base}-n`}>{t('cables.label')}</label>
            <input id={`${base}-n`} defaultValue={c.label} key={`n${c.label}`} maxLength={40} placeholder={t('cables.labelPlaceholder')} onBlur={e => e.target.value.trim() !== c.label && onChange({ label: e.target.value.trim() })} style={input} />
          </div>
        </div>
      )}
    </li>
  )
}

// The cable types of a kind, and for power any H07RN-F size from the datasheet
function TypeOptions({ kind }) {
  return (
    <>
      {CABLE_TYPES.filter(c => c.kind === kind).map(c => <option key={c.id} value={c.id}>{t(`cables.type.${c.id}`)}</option>)}
      {kind === 'power' && (
        <optgroup label={t('cables.customGroup')}>
          {CORES.flatMap(cores => Object.keys(CABLE_DATA[cores]).map(Number).sort((a, b) => a - b).map(mm2 => (
            <option key={`${cores}${mm2}`} value={`custom:${cores}:${mm2}`}>{cableTypeName({ cores, mm2 }, t)}</option>
          )))}
        </optgroup>
      )}
    </>
  )
}

// A new run: kind, type, length, how many, and where it goes
function AddRun({ links, onAdd }) {
  const [f, setF] = useState({ kind: 'power', type: 'cee32_3', length: '25', qty: '1', link: '', from: '', to: '' })
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }))
  const type = typeOf(f.type)
  const length = Number(String(f.length).replace(',', '.'))
  const ok = Boolean(f.type) && Number.isFinite(length) && length > 0 && length <= 500
  function submit(e) {
    e.preventDefault()
    if (!ok) return
    const custom = f.type.startsWith('custom:') ? f.type.split(':') : null
    onAdd({
      id: newId('c'), kind: f.kind, type: custom ? null : f.type, ...(custom ? { cores: custom[1], mm2: Number(custom[2]) } : {}),
      length, qty: Math.min(99, Math.max(1, Math.round(Number(f.qty)) || 1)), laying: 'air', ambient: 30,
      ...(f.kind === 'power' ? { link: f.link || null } : { from: f.from.trim().slice(0, 60), to: f.to.trim().slice(0, 60) }),
    })
    setF(x => ({ ...x, qty: '1', link: '', from: '', to: '' }))
  }
  return (
    <form onSubmit={submit} aria-labelledby="cable-add" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h4 id="cable-add" style={{ fontSize: '14px', fontWeight: 700 }}>{t('cables.add')}</h4>
      <div style={row}>
        <div style={{ width: '140px' }}>
          <label style={label} htmlFor="ca-kind">{t('cables.kindLabel')}</label>
          <select id="ca-kind" value={f.kind} onChange={e => { const k = e.target.value; setF(x => ({ ...x, kind: k, type: CABLE_TYPES.find(c => c.kind === k)?.id || '' })) }} style={select}>
            {CABLE_KINDS.map(k => <option key={k} value={k}>{t(`cables.kind.${k}`)}</option>)}
          </select>
        </div>
        <div style={{ width: '220px' }}>
          <label style={label} htmlFor="ca-type">{t('cables.type')}</label>
          <select id="ca-type" value={f.type} onChange={set('type')} style={select}><TypeOptions kind={f.kind} /></select>
        </div>
        <div style={{ width: '100px' }}>
          <label style={label} htmlFor="ca-len">{t('cables.length')}</label>
          <input id="ca-len" inputMode="decimal" list={type ? 'ca-lens' : undefined} value={f.length} onChange={set('length')} aria-invalid={!ok} style={input} />
          {type && <datalist id="ca-lens">{type.lengths.map(l => <option key={l} value={l} />)}</datalist>}
        </div>
        <div style={{ width: '80px' }}>
          <label style={label} htmlFor="ca-qty">{t('power.qty')}</label>
          <input id="ca-qty" type="number" min={1} max={99} value={f.qty} onChange={set('qty')} style={input} />
        </div>
        {f.kind === 'power' ? (
          <div style={{ width: '260px' }}>
            <HintLabel htmlFor="ca-link" hint="cables-link">{t('cables.link')}</HintLabel>
            <select id="ca-link" value={f.link} onChange={set('link')} style={select}>
              <option value="">{t('cables.noLink')}</option>
              {links.map(o => <option key={o.value} value={o.value}>{o.text}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div style={{ width: '160px' }}>
              <label style={label} htmlFor="ca-from">{t('cables.from')}</label>
              <input id="ca-from" value={f.from} onChange={set('from')} maxLength={60} placeholder={t('cables.fromPlaceholder')} style={input} />
            </div>
            <div style={{ width: '160px' }}>
              <label style={label} htmlFor="ca-to">{t('cables.to')}</label>
              <input id="ca-to" value={f.to} onChange={set('to')} maxLength={60} placeholder={t('cables.toPlaceholder')} style={input} />
            </div>
          </>
        )}
      </div>
      <button type="submit" disabled={!ok} style={{ ...btnPrimary, alignSelf: 'flex-start' }}><Plus size={14} aria-hidden="true" /> {t('cables.addButton')}</button>
    </form>
  )
}

// The cable list: runs grouped by cable and length, each matched to a catalogue item by name (or
// picked by hand, kept in power.cableItems); editors can create the missing items and add the list
// to the gig's equipment (only what's missing is added).
function CableList({ gig, p, edit, save, user }) {
  const { notify } = useToast()
  const lines = useMemo(() => cableList(p.cables), [p.cables])
  const [items, setItems] = useState(null) // the catalogue's items (editors)
  const [busy, setBusy] = useState(false)
  const picked = p.data.power.cableItems && typeof p.data.power.cableItems === 'object' ? p.data.power.cableItems : {}

  useEffect(() => {
    if (!edit || !gig.org_id) return
    let gone = false
    selectAll(() => supabase.from('price_items').select('id, name').eq('org_id', gig.org_id).is('archived_at', null).order('name').order('id')).then(r => {
      if (gone) return
      if (r.error) { logger.warn('power', r.error, { step: 'cable_items' }); setItems([]) } else setItems(r.data || [])
    })
    return () => { gone = true }
  }, [edit, gig.org_id])

  const nameOf = l => cableLineName(l, t)
  const matched = items ? matchItems(lines, items, picked, nameOf) : {}

  async function create(l) {
    setBusy(true)
    const { data, error } = await supabase.from('price_items').insert({ org_id: gig.org_id, created_by: user?.id, name: nameOf(l), kind: 'rental', category: t('cables.category'), unit_price: 0 }).select('id, name').single()
    setBusy(false)
    if (error) { logger.error('power', error, { step: 'cable_item' }); return notify(userMessage(error), 'error') }
    setItems(list => [...(list || []), data])
    save({ cableItems: { ...picked, [l.key]: data.id } })
    track('power:cable-item')
    notify(t('cables.created', { name: data.name }), 'success')
  }

  async function toEquipment() {
    setBusy(true)
    const { data: eq, error } = await supabase.from('gig_equipment').select('id, item_id, quantity').eq('gig_id', gig.id)
    if (error) { setBusy(false); return notify(userMessage(error), 'error') }
    const todo = cablesToEquipment(lines, matched, eq || []).filter(x => x.add > 0)
    for (const x of todo) {
      const res = x.line_id
        ? await supabase.from('gig_equipment').update({ quantity: x.needed }).eq('id', x.line_id)
        : await supabase.from('gig_equipment').insert({ gig_id: gig.id, item_id: x.item_id, quantity: x.needed })
      if (res.error) { setBusy(false); logger.error('power', res.error, { step: 'cable_equipment' }); return notify(userMessage(res.error), 'error') }
    }
    setBusy(false)
    track('power:cables-equipment')
    notify(todo.length ? t('inputs.addedToEquipment', { count: todo.reduce((s, x) => s + x.add, 0) }) : t('dmx.equipmentUpToDate'), 'success')
  }

  const unmatched = lines.filter(l => !matched[l.key]).length
  return (
    <section aria-labelledby="cable-list" style={{ ...card, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ ...row, justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 id="cable-list" style={{ fontSize: '14px', fontWeight: 700 }}>{t('cables.list')}</h4>
        {edit && items && <button type="button" onClick={toEquipment} disabled={busy || lines.length === unmatched} style={btn}>{busy ? <AvxLoader size={14} /> : <PackagePlus size={14} aria-hidden="true" />} {t('cables.toEquipment')}</button>}
      </div>
      <p style={small}>{edit ? t('cables.listNoteEditor') : t('cables.listNote')}</p>
      {edit && !items && <AvxLoader size={16} color={colors.accentText} />}
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {lines.map(l => {
          const it = matched[l.key]
          const id = `cl-${l.key.replace(/[^a-z0-9]/gi, '-')}`
          return (
            <li key={l.key} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '8px' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: '14px' }}>{l.qty} × {nameOf(l)}</strong>
                <span style={small}>{t(`cables.kind.${l.kind}`)}{edit && items ? ` · ${it ? t('cables.inCatalogue', { name: it.name }) : t('cables.notInCatalogue')}` : ''}</span>
              </div>
              {edit && items && (
                <>
                  <div style={{ flex: '1 1 200px' }}>
                    <select id={id} aria-label={t('cables.pickItem', { name: nameOf(l) })} value={it?.id || ''} style={select}
                      onChange={e => { const next = { ...picked }; if (e.target.value) next[l.key] = e.target.value; else delete next[l.key]; save({ cableItems: next }) }}>
                      <option value="">{t('cables.noItem')}</option>
                      {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                  {!it && <button type="button" onClick={() => create(l)} disabled={busy} style={btn}><Plus size={14} aria-hidden="true" /> {t('cables.createItem')}</button>}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

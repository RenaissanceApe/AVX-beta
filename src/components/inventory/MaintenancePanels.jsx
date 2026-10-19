import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Wrench, ClipboardCheck, Camera, Loader2, Check, Plus, AlertTriangle, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { REPAIR_STATUSES, isOpenRepair, dueState, repairPhotoPath, MAX_PHOTO_BYTES } from '../../lib/inventory'
import { formatMoney, localISODate } from '../../lib/quotes'
import { useI18n, t } from '../../i18n'
import { Modal, btn, btnPrimary, input, label, card, colors } from '../ui'
import ContextThread from '../messages/ContextThread'

const AMBER = '#F59E0B'
const select = { ...input, appearance: 'auto' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }
const small = { fontSize: '12px', color: colors.muted, lineHeight: 1.5 }
const STATUS_COLOR = { open: AMBER, in_repair: '#38BDF8', done: colors.accent, written_off: colors.muted }
const DUE_COLOR = { overdue: colors.danger, soon: AMBER, ok: colors.muted }
const REPAIR_SELECT = '*, unit:unit_id(code), gig:gig_id(name)'

const Field = ({ id, text, children }) => <div><label style={label} htmlFor={id}>{text}</label>{children}</div>
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)

// Uploads a damage photo; returns its path, or null (with a message) when it can't
export async function uploadRepairPhoto(orgId, gigId, file, notify) {
  if (!file) return null
  const path = repairPhotoPath(orgId, gigId, file, newId())
  if (!path) { notify(t('repair.photoType'), 'error'); return false }
  if (file.size > MAX_PHOTO_BYTES) { notify(t('repair.photoTooBig'), 'error'); return false }
  const { error } = await supabase.storage.from('repair-photos').upload(path, file, { contentType: file.type })
  if (error) {
    logger.error('repairs', error, { step: 'photo' })
    notify(userMessage(error), 'error')
    return false
  }
  return path
}

export function PhotoInput({ file, setFile }) {
  return (
    <label style={{ ...btn, cursor: 'pointer', justifyContent: 'center' }}>
      <Camera size={14} /> {file ? file.name.slice(0, 30) : t('repair.addPhoto')}
      <input type="file" accept="image/*" capture="environment" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
    </label>
  )
}

function PhotoLink({ path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    supabase.storage.from('repair-photos').createSignedUrl(path, 600).then(({ data }) => setUrl(data?.signedUrl || null))
  }, [path])
  if (!url) return null
  return <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#38BDF8', fontSize: '12px' }}><ImageIcon size={12} /> {t('repair.photo')}</a>
}

// A new repair (from the warehouse) or an existing one: status, repairer, cost, outcome
export function RepairModal({ orgId, repair, items = [], preset = {}, onClose, onSaved }) {
  const { notify } = useToast()
  const [itemId, setItemId] = useState(repair?.item_id || preset.itemId || '')
  const [unitId, setUnitId] = useState(repair?.unit_id || preset.unitId || '')
  const [units, setUnits] = useState([])
  const [form, setForm] = useState({
    quantity: String(repair?.quantity || 1), problem: repair?.problem || '', status: repair?.status || 'open',
    repairer: repair?.repairer || '', cost: repair?.cost ?? '', charge_client: !!repair?.charge_client,
    expected_back: repair?.expected_back || '', outcome: repair?.outcome || '',
  })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const item = items.find(i => i.id === itemId)
  const serial = repair ? !!repair.unit_id : item?.tracking === 'serial'
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  useEffect(() => {
    if (repair || !itemId || item?.tracking !== 'serial') return setUnits([])
    supabase.from('stock_units').select('id, code, serial, status').eq('item_id', itemId).in('status', ['available', 'repair']).order('code')
      .then(({ data }) => setUnits(data || []))
  }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps

  const cost = form.cost === '' ? null : Number(String(form.cost).replace(',', '.'))
  const invalid = !form.problem.trim() || (!repair && (!itemId || (serial && !unitId))) || (cost != null && !(cost >= 0))

  async function save(e) {
    e.preventDefault()
    if (invalid) return
    setSaving(true)
    const photo = await uploadRepairPhoto(orgId, repair?.gig_id, file, notify)
    if (photo === false) return setSaving(false)
    const fields = {
      problem: form.problem.trim().slice(0, 1000), status: form.status, repairer: form.repairer.trim() || null, cost,
      charge_client: form.charge_client, expected_back: form.expected_back || null, outcome: form.outcome.trim() || null,
      ...(photo ? { photo_path: photo } : {}),
    }
    const { error } = repair
      ? await supabase.from('repairs').update(fields).eq('id', repair.id)
      : await supabase.from('repairs').insert({
          ...fields, org_id: orgId, item_id: itemId, unit_id: serial ? unitId : null,
          quantity: serial ? 1 : Math.max(1, Math.round(Number(form.quantity) || 1)),
        })
    setSaving(false)
    if (error) {
      logger.error('repairs', error, { step: repair ? 'update' : 'insert' })
      return notify(error.code === '23505' ? t('repair.alreadyOpen') : userMessage(error), 'error')
    }
    if (!repair) track('inventory:repair')
    onSaved()
    onClose()
  }

  return (
    <Modal title={repair ? `${repair.item_name || t('repair.title')}${repair.unit?.code ? ` · ${repair.unit.code}` : ''}` : t('repair.new')} onClose={onClose} maxWidth={600}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {repair ? (
          <p style={small}>
            {[repair.gig?.name && t('repair.fromGig', { gig: repair.gig.name }), !repair.unit_id && t('repair.quantity', { count: repair.quantity })].filter(Boolean).join(' · ')}
            {repair.photo_path && <span style={{ marginLeft: '8px' }}><PhotoLink path={repair.photo_path} /></span>}
          </p>
        ) : (
          <div style={grid}>
            <Field id="rp-item" text={t('repair.item')}>
              <select id="rp-item" value={itemId} onChange={e => { setItemId(e.target.value); setUnitId('') }} disabled={!!preset.itemId} style={select}>
                <option value="">—</option>
                {items.filter(i => i.tracking !== 'none' && !i.archived_at).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            {serial ? (
              <Field id="rp-unit" text={t('inv.unit')}>
                <select id="rp-unit" value={unitId} onChange={e => setUnitId(e.target.value)} disabled={!!preset.unitId && !!units.length} style={select}>
                  <option value="">—</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.code}{u.serial ? ` · ${u.serial}` : ''}{u.status === 'repair' ? ` · ${t('inv.unitStatus.repair')}` : ''}</option>)}
                </select>
              </Field>
            ) : itemId && (
              <Field id="rp-qty" text={t('inv.quantity')}><input id="rp-qty" type="number" min={1} value={form.quantity} onChange={set('quantity')} style={input} /></Field>
            )}
          </div>
        )}
        <Field id="rp-problem" text={`${t('repair.problem')} *`}>
          <textarea id="rp-problem" value={form.problem} onChange={set('problem')} maxLength={1000} rows={2} style={{ ...input, resize: 'vertical' }} autoFocus={!repair} />
        </Field>
        <div style={grid}>
          <Field id="rp-status" text={t('inv.status')}>
            <select id="rp-status" value={form.status} onChange={set('status')} style={select}>
              {REPAIR_STATUSES.map(s => <option key={s} value={s}>{t(`repair.status.${s}`)}</option>)}
            </select>
          </Field>
          <Field id="rp-repairer" text={t('repair.repairer')}><input id="rp-repairer" value={form.repairer} onChange={set('repairer')} maxLength={120} placeholder={t('repair.inHouse')} style={input} /></Field>
          <Field id="rp-cost" text={t('repair.cost')}><input id="rp-cost" inputMode="decimal" value={form.cost} onChange={set('cost')} style={input} /></Field>
          <Field id="rp-back" text={t('repair.expectedBack')}><input id="rp-back" type="date" value={form.expected_back} onChange={set('expected_back')} style={input} /></Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: colors.soft, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.charge_client} onChange={set('charge_client')} style={{ accentColor: colors.accent }} /> {t('repair.chargeClient')}
        </label>
        {(form.status === 'done' || form.status === 'written_off' || repair?.outcome) && (
          <Field id="rp-outcome" text={t('repair.outcome')}><input id="rp-outcome" value={form.outcome} onChange={set('outcome')} maxLength={1000} style={input} /></Field>
        )}
        {form.status === 'written_off' && form.status !== repair?.status && (
          <p role="alert" style={{ fontSize: '12px', color: AMBER }}>{t(serial ? 'repair.writeOffUnit' : 'repair.writeOffBulk')}</p>
        )}
        {!repair?.photo_path && <PhotoInput file={file} setFile={setFile} />}
        <button type="submit" disabled={saving || invalid} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
        </button>
      </form>
      {repair && <div style={{ marginTop: '14px' }}><ContextThread type="repair" id={repair.id} height="260px" /></div>}
    </Modal>
  )
}

// Record an inspection; a fail opens a repair
export function InspectionModal({ item, unitId: presetUnit, onClose, onSaved }) {
  const { notify } = useToast()
  const [units, setUnits] = useState([])
  const [unitId, setUnitId] = useState(presetUnit || '')
  const [form, setForm] = useState({ done_on: localISODate(), result: 'pass', inspector: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const serial = item.tracking === 'serial'
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  useEffect(() => {
    if (!serial) return
    supabase.from('stock_units').select('id, code, serial').eq('item_id', item.id).in('status', ['available', 'repair']).order('code')
      .then(({ data }) => setUnits(data || []))
  }, [item.id, serial])

  async function save(e) {
    e.preventDefault()
    if (serial && !unitId) return
    setSaving(true)
    const { error } = await supabase.from('inspections').insert({
      org_id: item.org_id, item_id: item.id, unit_id: serial ? unitId : null, done_on: form.done_on, result: form.result,
      inspector: form.inspector.trim() || null, notes: form.notes.trim() || null,
    })
    setSaving(false)
    if (error) {
      logger.error('inspections', error, { step: 'insert' })
      return notify(userMessage(error), 'error')
    }
    track('inventory:inspection')
    notify(t(form.result === 'fail' ? 'inspect.savedFail' : 'inspect.saved'), form.result === 'fail' ? 'error' : 'success')
    onSaved()
    onClose()
  }

  return (
    <Modal title={`${t('inspect.record')}${item.inspection_kind ? ` · ${item.inspection_kind}` : ''}`} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={small}>{item.name}</p>
        <div style={grid}>
          {serial && (
            <Field id="in-unit" text={t('inv.unit')}>
              <select id="in-unit" value={unitId} onChange={e => setUnitId(e.target.value)} style={select} required>
                <option value="">—</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.code}{u.serial ? ` · ${u.serial}` : ''}</option>)}
              </select>
            </Field>
          )}
          <Field id="in-date" text={t('inspect.date')}><input id="in-date" type="date" value={form.done_on} max={localISODate()} onChange={set('done_on')} style={input} required /></Field>
          <Field id="in-by" text={t('inspect.by')}><input id="in-by" value={form.inspector} onChange={set('inspector')} maxLength={120} style={input} /></Field>
        </div>
        <div role="radiogroup" aria-label={t('inspect.result')} style={{ display: 'flex', gap: '8px' }}>
          {['pass', 'fail'].map(r => (
            <button key={r} type="button" role="radio" aria-checked={form.result === r} onClick={() => setForm(f => ({ ...f, result: r }))} style={{
              ...btn, flex: 1, justifyContent: 'center',
              ...(form.result === r ? { background: r === 'pass' ? 'rgba(30,200,120,0.15)' : 'rgba(239,68,68,0.15)', borderColor: r === 'pass' ? colors.accent : colors.danger, color: '#fff' } : {}),
            }}>{t(`inspect.${r}`)}</button>
          ))}
        </div>
        <Field id="in-notes" text={t('inv.note')}><input id="in-notes" value={form.notes} onChange={set('notes')} maxLength={1000} style={input} /></Field>
        {form.result === 'fail' && <p role="alert" style={{ fontSize: '12px', color: AMBER }}>{t('inspect.failHint')}</p>}
        <button type="submit" disabled={saving || (serial && !unitId)} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}

function RepairRow({ r, itemName, orgId, onOpen }) {
  const { lang, fmt } = useI18n()
  return (
    <button onClick={() => onOpen(r)} style={{ ...card, padding: '9px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', width: '100%', textAlign: 'left', cursor: 'pointer', color: '#fff', font: 'inherit' }}>
      <span style={{ flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>
          {itemName && <>{orgId ? <Link to={`/org/${orgId}/inventory/${r.item_id}`} onClick={e => e.stopPropagation()} style={{ color: '#fff' }}>{itemName}</Link> : itemName} · </>}
          {r.unit?.code ? <span style={{ fontFamily: 'monospace' }}>{r.unit.code}</span> : t('repair.quantity', { count: r.quantity })}
        </span>
        <span style={{ fontSize: '12px', color: colors.muted, overflowWrap: 'anywhere' }}>
          {[r.problem, r.gig?.name && t('repair.fromGig', { gig: r.gig.name }), r.repairer, r.cost != null && formatMoney(r.cost, 'EUR', lang), r.charge_client && t('repair.charged')].filter(Boolean).join(' · ')}
        </span>
      </span>
      {r.photo_path && <ImageIcon size={13} color={colors.muted} aria-label={t('repair.photo')} />}
      <span style={{ fontSize: '12px', color: colors.muted, whiteSpace: 'nowrap' }}>{fmt(r.created_at, 'd MMM')}{r.expected_back && isOpenRepair(r) ? ` → ${fmt(r.expected_back, 'd MMM')}` : ''}</span>
      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLOR[r.status] }}>{t(`repair.status.${r.status}`)}</span>
    </button>
  )
}

function DueRow({ d, orgId, onRecord }) {
  const { fmt } = useI18n()
  const state = dueState(d.due_on)
  return (
    <div style={{ ...card, padding: '9px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>
          <Link to={`/org/${orgId}/inventory/${d.item_id}`} style={{ color: '#fff' }}>{d.item_name}</Link>
          {d.unit_code && <span style={{ fontFamily: 'monospace', fontWeight: 400 }}> · {d.unit_code}</span>}
        </span>
        <span style={{ fontSize: '12px', color: colors.muted }}>
          {[d.inspection_kind, d.last_done ? t('inspect.lastDone', { date: fmt(d.last_done, 'd MMM yyyy') }) : t('inspect.never'), d.last_result === 'fail' && t('inspect.lastFailed')].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span style={{ fontSize: '12px', fontWeight: 700, color: DUE_COLOR[state] }}>{t(`inspect.due.${state}`, { date: fmt(d.due_on, 'd MMM yyyy') })}</span>
      <button onClick={() => onRecord(d)} style={{ ...btn, padding: '5px 9px', fontSize: '12px' }}><ClipboardCheck size={12} /> {t('inspect.record')}</button>
    </div>
  )
}

function H({ icon, children, count }) {
  const Icon = icon
  return (
    <h2 style={{ fontSize: '17px', fontWeight: 700, margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: '7px' }}>
      <Icon size={16} color={colors.accent} /> {children}{count != null && <span style={{ color: colors.soft, fontWeight: 600 }}>· {count}</span>}
    </h2>
  )
}

// Inventory → Maintenance: open repairs, inspections due, recently closed repairs
export function MaintenanceTab({ orgId, inv }) {
  const [repairs, setRepairs] = useState(null)
  const [due, setDue] = useState([])
  const [allDue, setAllDue] = useState(false)
  const [editing, setEditing] = useState(null) // repair, or {} for a new one
  const [inspecting, setInspecting] = useState(null)
  const [params] = useSearchParams()
  const linkOpened = useRef(false)
  const nameOf = id => inv.items.find(i => i.id === id)?.name

  async function load() {
    const [repRes, dueRes] = await Promise.all([
      supabase.from('repairs').select(REPAIR_SELECT).eq('org_id', orgId).order('created_at', { ascending: false }).limit(200),
      supabase.rpc('maintenance_due', { p_org: orgId }),
    ])
    if (repRes.error) logger.error('repairs', repRes.error, { step: 'list' })
    if (dueRes.error) logger.error('repairs', dueRes.error, { step: 'due' })
    setRepairs(repRes.data || [])
    setDue(dueRes.data || [])
    // ?open=<repair id>: a link from its conversation
    const linked = !linkOpened.current && params.get('open') && (repRes.data || []).find(r => r.id === params.get('open'))
    if (linked) { linkOpened.current = true; setEditing(linked) }
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!repairs) return <Loader2 size={20} color={colors.accent} style={{ animation: 'spin 1s linear infinite' }} />
  const open = repairs.filter(isOpenRepair)
  const closed = repairs.filter(r => !isOpenRepair(r)).slice(0, 30)
  const dueSoon = due.filter(d => dueState(d.due_on) !== 'ok')
  const shownDue = allDue ? due : dueSoon

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button onClick={() => setEditing({})} style={btnPrimary}><Plus size={15} /> {t('repair.new')}</button>
      </div>
      <section style={{ marginBottom: '22px' }}>
        <H icon={Wrench} count={open.length}>{t('repair.open')}</H>
        {open.length === 0 ? <p style={small}>{t('repair.noneOpen')}</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {open.map(r => <RepairRow key={r.id} r={r} itemName={nameOf(r.item_id)} orgId={orgId} onOpen={setEditing} />)}
          </div>
        )}
      </section>
      <section style={{ marginBottom: '22px' }}>
        <H icon={ClipboardCheck} count={dueSoon.length}>{t('inspect.dueTitle')}</H>
        {due.length === 0 ? <p style={small}>{t('inspect.noneSetUp')}</p> : (
          <>
            {shownDue.length === 0 && <p style={small}>{t('inspect.nothingDue')}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {shownDue.map(d => <DueRow key={`${d.item_id}-${d.unit_id}`} d={d} orgId={orgId} onRecord={setInspecting} />)}
            </div>
            {due.length > dueSoon.length && (
              <button onClick={() => setAllDue(v => !v)} style={{ ...btn, marginTop: '8px', padding: '5px 10px', fontSize: '12px' }}>
                {allDue ? t('inspect.showDue') : t('inspect.showAll', { count: due.length })}
              </button>
            )}
          </>
        )}
      </section>
      {closed.length > 0 && (
        <section>
          <H icon={Check}>{t('repair.closed')}</H>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {closed.map(r => <RepairRow key={r.id} r={r} itemName={nameOf(r.item_id)} orgId={orgId} onOpen={setEditing} />)}
          </div>
        </section>
      )}
      {editing && (
        <RepairModal orgId={orgId} repair={editing.id ? { ...editing, item_name: nameOf(editing.item_id) } : null} items={inv.items}
          onClose={() => setEditing(null)} onSaved={load} />
      )}
      {inspecting && (
        <InspectionModal item={inv.items.find(i => i.id === inspecting.item_id) || { id: inspecting.item_id, name: inspecting.item_name, tracking: inspecting.unit_id ? 'serial' : 'bulk', org_id: orgId }}
          unitId={inspecting.unit_id} onClose={() => setInspecting(null)} onSaved={load} />
      )}
    </div>
  )
}

// Item page: its repairs and inspections
export function ItemMaintenance({ orgId, item, onChanged }) {
  const { fmt } = useI18n()
  const [repairs, setRepairs] = useState([])
  const [inspections, setInspections] = useState([])
  const [due, setDue] = useState([])
  const [editing, setEditing] = useState(null)
  const [inspecting, setInspecting] = useState(false)

  async function load() {
    const [repRes, insRes, dueRes] = await Promise.all([
      supabase.from('repairs').select(REPAIR_SELECT).eq('item_id', item.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('inspections').select('*, unit:unit_id(code)').eq('item_id', item.id).order('done_on', { ascending: false }).limit(30),
      item.inspection_months ? supabase.rpc('maintenance_due', { p_org: orgId }) : Promise.resolve({ data: [] }),
    ])
    setRepairs(repRes.data || [])
    setInspections(insRes.data || [])
    setDue((dueRes.data || []).filter(d => d.item_id === item.id && dueState(d.due_on) !== 'ok'))
  }
  useEffect(() => { load() }, [item.id, item.inspection_months]) // eslint-disable-line react-hooks/exhaustive-deps
  const changed = () => { load(); onChanged?.() }

  if (item.tracking === 'none') return null
  return (
    <section style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, flex: '1 1 auto' }}>{t('repair.maintenance')}</h2>
        <button onClick={() => setEditing({})} style={{ ...btn, padding: '6px 10px' }}><Wrench size={13} /> {t('repair.new')}</button>
        <button onClick={() => setInspecting(true)} style={{ ...btn, padding: '6px 10px' }}><ClipboardCheck size={13} /> {t('inspect.record')}</button>
      </div>
      <p style={{ ...small, marginBottom: '8px' }}>
        {item.inspection_months
          ? t('inspect.every', { kind: item.inspection_kind || t('inspect.inspection'), count: item.inspection_months })
          : t('inspect.notSetUp')}
      </p>
      {due.length > 0 && (
        <p role="status" style={{ fontSize: '13px', color: AMBER, display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
          <AlertTriangle size={14} /> {t('inspect.dueOnItem', { count: due.length })}
        </p>
      )}
      {repairs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
          {repairs.map(r => <RepairRow key={r.id} r={r} onOpen={setEditing} />)}
        </div>
      )}
      {inspections.length > 0 && (
        <div style={{ fontSize: '13px' }}>
          {inspections.map(i => (
            <div key={i.id} style={{ display: 'flex', gap: '10px', padding: '6px 4px', borderBottom: `1px solid ${colors.border}`, flexWrap: 'wrap' }}>
              <span style={{ color: colors.soft, minWidth: '90px' }}>{fmt(i.done_on, 'd MMM yyyy')}</span>
              {i.unit?.code && <span style={{ fontFamily: 'monospace' }}>{i.unit.code}</span>}
              <span style={{ fontWeight: 700, color: i.result === 'pass' ? colors.accent : colors.danger }}>{t(`inspect.${i.result}`)}</span>
              <span style={{ color: colors.muted, flex: '1 1 160px' }}>{[i.inspector, i.notes].filter(Boolean).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <RepairModal orgId={orgId} repair={editing.id ? { ...editing, item_name: item.name } : null} items={[item]} preset={{ itemId: item.id }}
          onClose={() => setEditing(null)} onSaved={changed} />
      )}
      {inspecting && <InspectionModal item={item} onClose={() => setInspecting(false)} onSaved={changed} />}
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Package, AlertTriangle, Check, Trash2, Pencil, Loader2, Search, Weight, Zap, ScanLine, ClipboardList, Shuffle, Wrench, Handshake } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { equipmentWindow, shortBy, expandPlan, kitsFree, alternativesOf, broughtList } from '../../lib/inventory'
import { useKits } from '../../lib/useInventory'
import { rangeText } from '../../lib/clashes'
import { toLocalInput } from './Booking'
import { useUndoRemove } from '../../lib/undo'
import { t } from '../../i18n'
import { Modal, btn, btnPrimary, iconBtn, input, label, card, colors } from '../ui'
import EmptyState from '../EmptyState'
import { TabHeader } from './parts'
import ReportDamageModal from './ReportDamageModal'
import { SubrentalModal, GigSubrentals } from '../inventory/SubrentalPanels'

const AMBER = 'var(--warn)'
const fromLocalInput = v => (v ? new Date(v).toISOString() : null)

// Equipment on a gig. Everyone on the gig sees the list; the gig's managers and the
// organisation's admins/members plan it, with what's free for the gig's dates
// (docs/INVENTORY.md, I2). Nothing is blocked: a shortage is a warning.
export default function EquipmentTab({ gig, org, canEdit, canAdd }) {
  const { notify } = useToast()
  const [lines, setLines] = useState(null)
  const { hidden, remove: removeLater } = useUndoRemove()
  const [status, setStatus] = useState({}) // line_id -> gig_equipment_status row
  const [moved, setMoved] = useState({}) // item_id -> { out_qty, back_qty } from scanning
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(null)
  const [reporting, setReporting] = useState(false)
  // ?report=1 (the simple home's "Report damage") opens the report form once the gear is loaded
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    if (params.get('report') !== '1' || lines === null) return
    if (lines.length > 0) setReporting(true)
    const next = new URLSearchParams(params)
    next.delete('report')
    setParams(next, { replace: true })
  }, [lines, params, setParams])
  const [subrenting, setSubrenting] = useState(null) // { itemId, quantity }
  const [subKey, setSubKey] = useState(0)
  const [altFree, setAltFree] = useState({}) // item_id -> availability of alternatives to short lines
  const kits = useKits(gig.org_id, canEdit)

  async function load() {
    const [linesRes, statusRes, movedRes] = await Promise.all([
      supabase.from('gig_equipment').select('*').eq('gig_id', gig.id).order('category', { nullsFirst: false }).order('item_name'),
      canEdit ? supabase.rpc('gig_equipment_status', { p_gig: gig.id }) : Promise.resolve({ data: [] }),
      supabase.rpc('gig_dispatch_summary', { p_gig: gig.id }),
    ])
    setMoved(Object.fromEntries((movedRes.data || []).map(r => [r.item_id, r])))
    if (linesRes.error) logger.error('equipment', linesRes.error, { step: 'lines', gigId: gig.id })
    if (statusRes.error) logger.error('equipment', statusRes.error, { step: 'status', gigId: gig.id })
    setLines(linesRes.data || [])
    setStatus(Object.fromEntries((statusRes.data || []).map(r => [r.line_id, r])))
  }
  useEffect(() => { load() }, [gig.id, gig.start_date, gig.end_date, gig.status, canEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  async function setQuantity(line, value) {
    const quantity = Math.max(1, Math.min(100000, Math.round(Number(value) || 1)))
    if (quantity === line.quantity) return
    // More of an item brings more of its accessories
    const plan = quantity > line.quantity ? expandPlan({ [line.item_id]: quantity }, onGig, kits.parts, kits.items) : { added: {} }
    const added = plan.added
    const { error } = Object.keys(added).length
      ? await saveLines(gig, plan.lines)
      : await supabase.from('gig_equipment').update({ quantity }).eq('id', line.id)
    if (error) return notify(userMessage(error), 'error')
    if (Object.keys(added).length) notify(t('equip.alsoAdded', { list: broughtList(added, kits.items) }), 'success')
    load()
  }
  // Use an alternative for what's short: move that many to the other item
  async function swap(line, altId, count) {
    const plan = expandPlan({ [altId]: (onGig[altId] || 0) + count }, onGig, kits.parts, kits.items)
    const [moveRes, altRes] = await Promise.all([
      count >= line.quantity
        ? supabase.from('gig_equipment').delete().eq('id', line.id)
        : supabase.from('gig_equipment').update({ quantity: line.quantity - count }).eq('id', line.id),
      saveLines(gig, plan.lines),
    ])
    const error = moveRes.error || altRes.error
    if (error) {
      logger.error('equipment', error, { step: 'swap' })
      return notify(userMessage(error), 'error')
    }
    notify(t('equip.swapped', { count, name: kits.items[altId]?.name || '' }), 'success')
    load()
  }
  function remove(line) {
    removeLater(line.id, {
      message: t('undo.removed', { name: line.item_name }),
      commit: async () => (await supabase.from('gig_equipment').delete().eq('id', line.id)).error,
      onDone: load,
    })
  }

  const onGig = Object.fromEntries((lines || []).map(l => [l.item_id, l.quantity]))
  const shortIds = (lines || []).filter(l => status[l.id] && shortBy({ ...l, ...status[l.id] }) > 0).map(l => l.item_id)
  const altIds = [...new Set(shortIds.flatMap(id => alternativesOf(id, kits.pairs)))]
  const altKey = altIds.sort().join(',')
  useEffect(() => {
    const win = equipmentWindow(gig, org)
    if (!altKey || !win) return setAltFree({})
    supabase.rpc('equipment_availability', { p_org: gig.org_id, p_items: altKey.split(','), p_from: win.from, p_until: win.until, p_exclude_gig: gig.id })
      .then(({ data, error }) => {
        if (error) logger.error('equipment', error, { step: 'alternatives' })
        setAltFree(Object.fromEntries((data || []).map(r => [r.item_id, r])))
      })
  }, [altKey, gig.id, gig.start_date, gig.end_date]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lines) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  const rows = lines.filter(l => !hidden.has(l.id)).map(l => ({ ...l, ...(status[l.id] || {}) }))
  const short = rows.filter(r => status[r.id] && shortBy(r) > 0)
  const weight = rows.reduce((s, r) => s + (Number(r.weight_kg) || 0) * r.quantity, 0)
  const power = rows.reduce((s, r) => s + (Number(r.power_w) || 0) * r.quantity, 0)
  const groups = rows.reduce((map, r) => { const k = r.category || ''; (map[k] ||= []).push(r); return map }, {})

  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      <TabHeader title={t('gig.tab.equipment')} subtitle={t('equip.count', { count: lines.length })}
        action={canAdd && <button onClick={() => setPicking(true)} style={btnPrimary}><Plus size={14} /> {t('equip.add')}</button>} />

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <Link to={`/gig/${gig.id}/packing`} style={{ ...ghostLink }}><ClipboardList size={14} /> {t('dispatch.packingList')}</Link>
          {canEdit && <Link to={`/gig/${gig.id}/scan`} style={{ ...ghostLink }}><ScanLine size={14} /> {t('dispatch.open')}</Link>}
          <button onClick={() => setReporting(true)} style={{ ...ghostLink }}><Wrench size={14} /> {t('report.title')}</button>
        </div>
      )}
      {canEdit && rows.length > 0 && (
        <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap', fontSize: '13px', color: colors.soft, marginBottom: '12px' }}>
          {weight > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Weight size={13} /> {t('equip.weight', { kg: Math.round(weight) })}</span>}
          {power > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Zap size={13} /> {t('equip.power', { kw: (power / 1000).toFixed(1) })}</span>}
          {!gig.start_date && <span style={{ color: AMBER }}>{t('equip.noDates')}</span>}
        </div>
      )}
      {short.length > 0 && (
        <div role="status" style={{ ...card, borderColor: 'color-mix(in srgb, var(--warn) 40%, transparent)', background: 'color-mix(in srgb, var(--warn) 6%, transparent)', marginBottom: '14px', fontSize: '13px', color: AMBER, display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{t('equip.shortBanner', { count: short.length })}</span>
        </div>
      )}

      {canAdd && <GigSubrentals gig={gig} org={org} items={Object.values(kits.items)} refreshKey={subKey} onChanged={load} />}

      {rows.length === 0 ? (
        <EmptyState icon={<Package size={28} />} body={canAdd ? t('equip.emptyPlanner') : t('equip.empty')}
          action={canAdd ? t('equip.add') : null} onAction={() => setPicking(true)} guide={canAdd ? 'pm-equipment' : null} />
      ) : Object.entries(groups).sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))).map(([category, list]) => (
        <section key={category || '—'} style={{ marginBottom: '14px' }}>
          <h3 style={{ ...label, marginBottom: '6px' }}>{category || t('prices.noCategory')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {list.map(r => {
              const missing = status[r.id] ? shortBy(r) : 0
              const alts = missing ? alternativesOf(r.item_id, kits.pairs).filter(id => altFree[id]?.available - (onGig[id] || 0) > 0) : []
              return (
                <div key={r.id} style={{ ...card, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', borderColor: missing ? 'color-mix(in srgb, var(--warn) 40%, transparent)' : colors.border }}>
                  <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '14px' }}>{r.item_name}</span>
                    <span style={{ fontSize: '12px', color: colors.muted }}>
                      {[r.planned_from && t('equip.ownDates', { range: rangeText(r.planned_from, r.planned_until) }), r.notes,
                        (moved[r.item_id]?.out_qty || moved[r.item_id]?.back_qty) && t('equip.outBack', { out: moved[r.item_id].out_qty, back: moved[r.item_id].back_qty }),
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {status[r.id] && (
                    missing
                      ? <span style={{ fontSize: '12px', fontWeight: 700, color: AMBER, display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12} /> {t('equip.short', { count: missing, free: Math.max(0, r.available) })}</span>
                      : <span style={{ fontSize: '12px', color: colors.accentText, display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> {t('equip.free', { count: r.available })}</span>
                  )}
                  {canEdit ? (
                    <input type="number" min={1} max={100000} defaultValue={r.quantity} key={r.quantity} onBlur={e => setQuantity(r, e.target.value)}
                      aria-label={t('equip.quantityFor', { name: r.item_name })} style={{ ...input, width: '72px', padding: '5px 8px' }} />
                  ) : <strong style={{ fontSize: '15px', minWidth: '30px', textAlign: 'right' }}>× {r.quantity}</strong>}
                  {canEdit && (
                    <>
                      <button onClick={() => setEditing(r)} aria-label={t('equip.editNamed', { name: r.item_name })} title={t('common.edit')} style={iconBtn}><Pencil size={14} /></button>
                      <button onClick={() => remove(r)} aria-label={t('equip.removeNamed', { name: r.item_name })} title={t('equip.remove')} style={iconBtn}><Trash2 size={14} /></button>
                    </>
                  )}
                  {canAdd && missing > 0 && (
                    <span style={{ flexBasis: '100%', display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px' }}>
                      <button onClick={() => setSubrenting({ itemId: r.item_id, quantity: missing })} style={{ ...btn, padding: '3px 8px', fontSize: '12px' }}>
                        <Handshake size={12} /> {t('sub.subrentN', { count: missing })}
                      </button>
                    </span>
                  )}
                  {canEdit && alts.length > 0 && (
                    <span style={{ flexBasis: '100%', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px', color: colors.soft }}>
                      <Shuffle size={12} /> {t('equip.alternatives')}
                      {alts.map(id => {
                        const n = Math.min(missing, altFree[id].available - (onGig[id] || 0))
                        return (
                          <button key={id} onClick={() => swap(r, id, n)} style={{ ...btn, padding: '3px 8px', fontSize: '12px' }} title={t('equip.swapHint', { count: n, name: kits.items[id]?.name || '' })}>
                            {t('equip.swap', { count: n, name: kits.items[id]?.name || '' })}
                          </button>
                        )
                      })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {picking && <EquipmentPicker gig={gig} org={org} planned={lines} kits={kits} onClose={() => setPicking(false)} onAdded={load} />}
      {subrenting && (
        <SubrentalModal orgId={gig.org_id} org={org} items={Object.values(kits.items)} preset={{ gig, ...subrenting }}
          onClose={() => setSubrenting(null)} onSaved={() => { setSubKey(k => k + 1); load() }} />
      )}
      {reporting && <ReportDamageModal gig={gig} lines={lines} onClose={() => setReporting(false)} />}
      {editing && <LineModal line={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  )
}

const ghostLink = { ...btn, textDecoration: 'none', background: 'transparent', borderColor: 'color-mix(in srgb, var(--fg) min(100%, calc(12% * var(--line-k))), transparent)', color: colors.soft }

// Saves planned quantities (item_id -> quantity), adding or updating lines
const saveLines = (gig, lines) => {
  const rows = Object.entries(lines).map(([item_id, quantity]) => ({ gig_id: gig.id, org_id: gig.org_id, item_id, quantity }))
  return rows.length ? supabase.from('gig_equipment').upsert(rows, { onConflict: 'gig_id,item_id' }) : Promise.resolve({ error: null })
}

// Pick catalogue items with what's free for the gig's dates; ticked items are added
// (or their quantity updated if already on the gig)
function EquipmentPicker({ gig, org, planned, kits, onClose, onAdded }) {
  const { notify } = useToast()
  const [items, setItems] = useState(null)
  const [free, setFree] = useState({})
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState({}) // item_id -> quantity
  const [saving, setSaving] = useState(false)
  const already = useMemo(() => Object.fromEntries(planned.map(l => [l.item_id, l.quantity])), [planned])
  const win = equipmentWindow(gig, org)

  useEffect(() => {
    Promise.all([
      supabase.from('price_items').select('id, name, category, code, tracking, kit_type').eq('org_id', gig.org_id).or('tracking.neq.none,kit_type.eq.set').is('archived_at', null).order('name'),
      win ? supabase.rpc('equipment_availability', { p_org: gig.org_id, p_items: null, p_from: win.from, p_until: win.until, p_exclude_gig: gig.id }) : Promise.resolve({ data: [] }),
    ]).then(([itemsRes, freeRes]) => {
      if (itemsRes.error) logger.error('equipment', itemsRes.error, { step: 'catalogue' })
      if (freeRes.error) logger.error('equipment', freeRes.error, { step: 'availability' })
      setItems((itemsRes.data || []).filter(i => i.tracking !== 'none' || i.kit_type === 'set'))
      setFree(Object.fromEntries((freeRes.data || []).map(r => [r.item_id, r])))
    })
  }, [gig.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase()
  const visible = (items || []).filter(i => !q || [i.name, i.code, i.category].some(v => (v || '').toLowerCase().includes(q)))
  const count = Object.keys(picked).length

  async function add() {
    setSaving(true)
    const picks = Object.fromEntries(Object.entries(picked).map(([id, q]) => [id, Math.max(1, Math.round(Number(q) || 1))]))
    const { lines, added } = expandPlan(picks, already, kits.parts, kits.items)
    const { error } = await saveLines(gig, lines)
    setSaving(false)
    if (error) {
      logger.error('equipment', error, { step: 'add', count: Object.keys(lines).length })
      return notify(userMessage(error), 'error')
    }
    track('equipment:planned')
    if (Object.keys(added).length) notify(t('equip.alsoAdded', { list: broughtList(added, kits.items) }), 'success')
    onAdded()
    onClose()
  }

  return (
    <Modal title={t('equip.add')} onClose={onClose} maxWidth={620}>
      <p style={{ fontSize: '12px', color: colors.muted, marginBottom: '10px', lineHeight: 1.5 }}>
        {win ? t('equip.pickerWindow', { range: rangeText(win.from, win.until) }) : t('equip.noDates')}
      </p>
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <Search size={14} color={colors.muted} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inv.search')} aria-label={t('inv.search')} autoFocus style={{ ...input, paddingLeft: '32px' }} />
      </div>
      {!items ? <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} /> : items.length === 0 ? (
        <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6 }}>{t('equip.noCatalogue')}</p>
      ) : (
        <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '12px' }}>
          {visible.map(item => {
            const isSet = item.kit_type === 'set'
            const setsFree = isSet ? kitsFree(item.id, kits.parts, kits.items, free) : null
            const f = isSet ? (setsFree == null ? null : { available: setsFree }) : free[item.id]
            const brings = kits.parts.filter(p => p.parent_id === item.id)
            const on = picked[item.id] != null
            const qty = Number(picked[item.id] ?? already[item.id] ?? 1)
            const over = f && on && qty > f.available
            return (
              <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', cursor: 'pointer', background: on ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent' }}>
                <input type="checkbox" checked={on} style={{ accentColor: colors.accent }}
                  onChange={() => setPicked(p => { const n = { ...p }; if (on) delete n[item.id]; else n[item.id] = already[item.id] || 1; return n })} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '14px' }}>{item.name}</span>
                  <span style={{ fontSize: '12px', color: colors.muted }}>
                    {[item.kit_type && t(`kit.typeOpt.${item.kit_type}`), item.category, already[item.id] && t('equip.alreadyPlanned', { count: already[item.id] })].filter(Boolean).join(' · ')}
                  </span>
                  {brings.length > 0 && (
                    <span style={{ display: 'block', fontSize: '11px', color: colors.muted }}>
                      {t(isSet ? 'equip.setContents' : 'equip.brings', { list: brings.map(p => `${p.quantity} × ${kits.items[p.child_id]?.name || '…'}`).join(', ') })}
                    </span>
                  )}
                </span>
                {f && <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: f.available <= 0 || over ? AMBER : colors.soft }}>{isSet ? t('equip.setsFree', { count: Math.max(0, f.available) }) : t('equip.freeOf', { count: Math.max(0, f.available), owned: f.owned })}</span>}
                <input type="number" min={1} max={100000} value={on ? picked[item.id] : ''} placeholder={String(already[item.id] || 1)} disabled={!on}
                  onChange={e => setPicked(p => ({ ...p, [item.id]: e.target.value }))} onClick={e => e.stopPropagation()}
                  aria-label={t('equip.quantityFor', { name: item.name })} style={{ ...input, width: '70px', padding: '5px 8px', borderColor: over ? AMBER : undefined }} />
              </label>
            )
          })}
        </div>
      )}
      <button onClick={add} disabled={!count || saving} style={{ ...btnPrimary, justifyContent: 'center', width: '100%' }}>
        {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={15} />} {t('equip.addPicked', { count })}
      </button>
    </Modal>
  )
}

// One line: quantity, own dates (instead of the gig's days) and a note
function LineModal({ line, onClose, onSaved }) {
  const { notify } = useToast()
  const [quantity, setQuantity] = useState(String(line.quantity))
  const [ownDates, setOwnDates] = useState(!!line.planned_from)
  const [from, setFrom] = useState(toLocalInput(line.planned_from || line.starts_at))
  const [until, setUntil] = useState(toLocalInput(line.planned_until || line.ends_at))
  const [notes, setNotes] = useState(line.notes || '')
  const [saving, setSaving] = useState(false)
  const n = Math.round(Number(quantity))
  const invalid = !(n >= 1) || (ownDates && (!from || !until || new Date(until) <= new Date(from)))

  async function save(e) {
    e.preventDefault()
    if (invalid) return
    setSaving(true)
    const { error } = await supabase.from('gig_equipment').update({
      quantity: n, notes: notes.trim() || null,
      planned_from: ownDates ? fromLocalInput(from) : null, planned_until: ownDates ? fromLocalInput(until) : null,
    }).eq('id', line.id)
    setSaving(false)
    if (error) return notify(userMessage(error), 'error')
    onSaved()
    onClose()
  }

  return (
    <Modal title={line.item_name} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={label} htmlFor="eq-qty">{t('inv.quantity')}</label>
          <input id="eq-qty" type="number" min={1} max={100000} value={quantity} onChange={e => setQuantity(e.target.value)} style={input} autoFocus />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: colors.soft, cursor: 'pointer' }}>
          <input type="checkbox" checked={ownDates} onChange={e => setOwnDates(e.target.checked)} style={{ accentColor: colors.accent }} /> {t('equip.useOwnDates')}
        </label>
        {ownDates && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
            <div><label style={label} htmlFor="eq-from">{t('equip.out')}</label><input id="eq-from" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} style={input} /></div>
            <div><label style={label} htmlFor="eq-until">{t('equip.back')}</label><input id="eq-until" type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} style={input} /></div>
          </div>
        )}
        {!ownDates && <p style={{ fontSize: '12px', color: colors.muted }}>{t('equip.gigDatesHint')}</p>}
        <div>
          <label style={label} htmlFor="eq-notes">{t('inv.note')}</label>
          <input id="eq-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} style={input} />
        </div>
        <button type="submit" disabled={saving || invalid} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}


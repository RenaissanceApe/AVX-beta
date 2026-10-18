import { useMemo, useState } from 'react'
import { Check, Loader2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { UNITS, parsePrice } from '../../lib/quotes'
import { TRACKING, KIT_TYPES, STOCK_KINDS, LOCATION_KINDS, UNIT_STATUSES, MOVEMENT_SHAPES, countCorrection, parseStockImport, matchItem } from '../../lib/inventory'
import { useI18n, t } from '../../i18n'
import { Modal, btnPrimary, input, label, colors } from '../ui'

const Field = ({ id, text, children }) => (
  <div style={{ minWidth: 0 }}>
    <label style={label} htmlFor={id}>{text}</label>
    {children}
  </div>
)
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }
const select = { ...input, cursor: 'pointer' }
const numberOrNull = v => (String(v ?? '').trim() === '' ? null : parsePrice(v))
const SaveButton = ({ saving, disabled, children }) => (
  <button type="submit" disabled={saving || disabled} style={{ ...btnPrimary, justifyContent: 'center' }}>
    {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={15} />} {children}
  </button>
)

// Catalogue item: the price list fields plus how stock is kept and its specs
export function ItemModal({ orgId, userId, item, hasStock, categories, onClose, onSaved }) {
  const { notify } = useToast()
  const [form, setForm] = useState({
    name: item?.name || '', kind: item?.kind || 'rental', category: item?.category || '', unit_price: item?.unit_price ?? '',
    unit: item?.unit || 'day', tracking: item?.tracking || 'bulk', code: item?.code || '', brand: item?.brand || '',
    model: item?.model || '', weight_kg: item?.weight_kg ?? '', power_w: item?.power_w ?? '', dimensions: item?.dimensions || '',
    replacement_value: item?.replacement_value ?? '', min_stock: item?.min_stock ?? '', packing_note: item?.packing_note || '',
    details: item?.details || '', kit_type: item?.kit_type || '',
  })
  const [saving, setSaving] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  // A set is a planning shortcut (no stock of its own); a case is stock (usually per unit)
  const setKit = e => setForm(f => ({
    ...f, kit_type: e.target.value,
    tracking: e.target.value === 'set' ? 'none' : e.target.value === 'case' && f.tracking === 'none' ? 'serial' : f.tracking,
  }))
  const price = parsePrice(form.unit_price === '' ? '0' : form.unit_price)
  const codeOk = !form.code.trim() || /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(form.code.trim())

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim() || !Number.isFinite(price) || price < 0 || !codeOk) return
    setSaving(true)
    const int = v => { const n = numberOrNull(v); return n == null ? null : Math.round(n) }
    const row = {
      name: form.name.trim(), kind: form.kind, category: form.category.trim() || null, unit_price: price, unit: form.unit,
      tracking: form.tracking, kit_type: form.kit_type || null, code: form.code.trim() || null, brand: form.brand.trim() || null, model: form.model.trim() || null,
      weight_kg: numberOrNull(form.weight_kg), power_w: int(form.power_w), dimensions: form.dimensions.trim() || null,
      replacement_value: numberOrNull(form.replacement_value), min_stock: int(form.min_stock),
      packing_note: form.packing_note.trim() || null, details: form.details.trim() || null, updated_at: new Date().toISOString(),
    }
    const query = item
      ? supabase.from('price_items').update(row).eq('id', item.id)
      : supabase.from('price_items').insert({ ...row, org_id: orgId, created_by: userId })
    const { data, error } = await query.select().single()
    setSaving(false)
    if (error) {
      logger.error('inventory', error, { step: item ? 'updateItem' : 'insertItem' })
      return notify(userMessage(error), 'error')
    }
    if (!item) track('inventory:item-added')
    onSaved(data)
    onClose()
  }

  return (
    <Modal title={item ? t('inv.editItem') : t('inv.addItem')} onClose={onClose} maxWidth={620}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Field id="it-name" text={`${t('prices.name')} *`}>
          <input id="it-name" value={form.name} onChange={set('name')} maxLength={200} style={input} autoFocus required />
        </Field>
        <div style={grid}>
          <Field id="it-kind" text={t('quote.col.kind')}>
            <select id="it-kind" value={form.kind} onChange={set('kind')} style={select}>
              {STOCK_KINDS.map(k => <option key={k} value={k}>{t(`lineKind.${k}`)}</option>)}
            </select>
          </Field>
          <Field id="it-cat" text={t('prices.category')}>
            <input id="it-cat" list="it-categories" value={form.category} onChange={set('category')} maxLength={80} style={input} />
            <datalist id="it-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field id="it-price" text={t('prices.price')}>
            <input id="it-price" inputMode="decimal" value={form.unit_price} onChange={set('unit_price')} style={input} />
          </Field>
          <Field id="it-unit" text={t('quote.col.unit')}>
            <select id="it-unit" value={form.unit} onChange={set('unit')} style={select}>
              {UNITS.map(u => <option key={u} value={u}>{t(`unit.${u}`, { count: 1 })}</option>)}
            </select>
          </Field>
        </div>
        <div style={grid}>
          <Field id="it-tracking" text={t('inv.tracking')}>
            <select id="it-tracking" value={form.tracking} onChange={set('tracking')} disabled={hasStock || form.kit_type === 'set'} style={select}>
              {TRACKING.filter(k => !(form.kit_type === 'case' && k === 'none')).map(k => <option key={k} value={k}>{t(`inv.trackingOpt.${k}`)}</option>)}
            </select>
          </Field>
          <Field id="it-kit" text={t('kit.type')}>
            <select id="it-kit" value={form.kit_type} onChange={setKit} style={select}>
              <option value="">{t('kit.typeOpt.none')}</option>
              {KIT_TYPES.filter(k => !(k === 'set' && hasStock && item?.tracking !== 'none')).map(k => <option key={k} value={k}>{t(`kit.typeOpt.${k}`)}</option>)}
            </select>
          </Field>
          <Field id="it-code" text={t('inv.code')}>
            <input id="it-code" value={form.code} onChange={set('code')} maxLength={40} placeholder={t('inv.codeAuto')} style={{ ...input, fontFamily: 'monospace' }} />
          </Field>
          <Field id="it-min" text={t('inv.minStock')}>
            <input id="it-min" type="number" min={0} value={form.min_stock} onChange={set('min_stock')} style={input} />
          </Field>
        </div>
        <p style={{ fontSize: '12px', color: hasStock ? '#F59E0B' : colors.muted, lineHeight: 1.5, marginTop: '-4px' }}>
          {form.kit_type ? t(`kit.typeHint.${form.kit_type}`) : hasStock ? t('inv.trackingLocked') : t(`inv.trackingHint.${form.tracking}`)}
          {!codeOk && <span style={{ color: colors.danger, display: 'block' }}>{t('inv.codeInvalid')}</span>}
        </p>
        <div style={grid}>
          <Field id="it-brand" text={t('inv.brand')}><input id="it-brand" value={form.brand} onChange={set('brand')} maxLength={80} style={input} /></Field>
          <Field id="it-model" text={t('inv.model')}><input id="it-model" value={form.model} onChange={set('model')} maxLength={80} style={input} /></Field>
          <Field id="it-weight" text={t('inv.weight')}><input id="it-weight" inputMode="decimal" value={form.weight_kg} onChange={set('weight_kg')} style={input} /></Field>
          <Field id="it-power" text={t('inv.power')}><input id="it-power" inputMode="numeric" value={form.power_w} onChange={set('power_w')} style={input} /></Field>
          <Field id="it-dim" text={t('inv.dimensions')}><input id="it-dim" value={form.dimensions} onChange={set('dimensions')} maxLength={80} placeholder="60 × 40 × 35 cm" style={input} /></Field>
          <Field id="it-value" text={t('inv.replacementValue')}><input id="it-value" inputMode="decimal" value={form.replacement_value} onChange={set('replacement_value')} style={input} /></Field>
        </div>
        <Field id="it-packing" text={t('inv.packingNote')}>
          <input id="it-packing" value={form.packing_note} onChange={set('packing_note')} maxLength={500} placeholder={t('inv.packingNotePlaceholder')} style={input} />
        </Field>
        <Field id="it-details" text={t('quote.lineDetails')}>
          <textarea id="it-details" value={form.details} onChange={set('details')} rows={2} maxLength={1000} style={{ ...input, resize: 'vertical' }} />
        </Field>
        <SaveButton saving={saving} disabled={!form.name.trim() || !codeOk}>{t('common.save')}</SaveButton>
      </form>
    </Modal>
  )
}

// Bulk stock: add, move, remove, or count at a location (count writes a correction)
export function MovementModal({ item, mode, locationId, locations, stock, onClose, onSaved }) {
  const { notify } = useToast()
  const kinds = mode === 'add' ? ['purchase', 'found'] : mode === 'remove' ? ['lost', 'sale', 'retire'] : mode === 'move' ? ['transfer'] : []
  const [kind, setKind] = useState(kinds[0] || 'correction')
  const [from, setFrom] = useState(mode !== 'add' ? locationId || '' : '')
  const [to, setTo] = useState(mode === 'add' || mode === 'count' ? locationId || locations[0]?.id || '' : '')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const at = id => stock?.byLocation?.[id] || 0
  const shape = mode === 'count' ? { from: false, to: true } : MOVEMENT_SHAPES[kind]
  const n = Number(qty)
  const valid = Number.isInteger(n) && (mode === 'count' ? n >= 0 : n > 0)
    && (!shape.from || from) && (!shape.to || to) && !(shape.from && shape.to && from === to)
    && (mode === 'count' || !shape.from || n <= at(from))

  async function save(e) {
    e.preventDefault()
    if (!valid) return
    let row
    if (mode === 'count') {
      const fix = countCorrection(at(to), n)
      if (!fix) { notify(t('inv.countMatches'), 'info'); return onClose() }
      row = { kind: 'correction', quantity: fix.quantity, ...(fix.direction === 'in' ? { to_location_id: to } : { from_location_id: to }) }
    } else {
      row = { kind, quantity: n, from_location_id: shape.from ? from : null, to_location_id: shape.to ? to : null }
    }
    setSaving(true)
    const { error } = await supabase.from('stock_movements').insert({ ...row, org_id: item.org_id, item_id: item.id, note: note.trim() || null })
    setSaving(false)
    if (error) {
      logger.error('inventory', error, { step: 'movement', kind: row.kind })
      return notify(userMessage(error), 'error')
    }
    track(`inventory:${mode}`)
    onSaved()
    onClose()
  }

  // Stock can leave an archived location but never go into one
  const locationSelect = (id, value, setValue, withStock, incoming) => (
    <select id={id} value={value} onChange={e => setValue(e.target.value)} style={select} required>
      <option value="">—</option>
      {locations.filter(l => !incoming || !l.archived_at).map(l => <option key={l.id} value={l.id}>{l.name}{withStock ? ` (${at(l.id)})` : ''}</option>)}
    </select>
  )

  return (
    <Modal title={`${t(`inv.mode.${mode}`)} · ${item.name}`} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {kinds.length > 1 && (
          <Field id="mv-kind" text={t('inv.reason')}>
            <select id="mv-kind" value={kind} onChange={e => setKind(e.target.value)} style={select}>
              {kinds.map(k => <option key={k} value={k}>{t(`inv.kind.${k}`)}</option>)}
            </select>
          </Field>
        )}
        <div style={grid}>
          {shape.from && <Field id="mv-from" text={t('inv.from')}>{locationSelect('mv-from', from, setFrom, true, false)}</Field>}
          {shape.to && <Field id="mv-to" text={mode === 'count' ? t('inv.location') : t('inv.to')}>{locationSelect('mv-to', to, setTo, mode === 'count', true)}</Field>}
          <Field id="mv-qty" text={mode === 'count' ? t('inv.counted') : t('inv.quantity')}>
            <input id="mv-qty" type="number" min={mode === 'count' ? 0 : 1} max={100000} value={qty} onChange={e => setQty(e.target.value)} style={input} autoFocus required />
          </Field>
        </div>
        {mode === 'count' && to && <p style={{ fontSize: '12px', color: colors.muted }}>{t('inv.countHint', { count: at(to) })}</p>}
        {shape.from && from && Number.isInteger(n) && n > at(from) && mode !== 'count' && (
          <p role="alert" style={{ fontSize: '12px', color: colors.danger }}>{t('inv.error.notEnough', { count: at(from) })}</p>
        )}
        <Field id="mv-note" text={t('inv.note')}>
          <input id="mv-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder={t('inv.notePlaceholder')} style={input} />
        </Field>
        <SaveButton saving={saving} disabled={!valid}>{t('common.save')}</SaveButton>
      </form>
    </Modal>
  )
}

// Add serial-numbered units: one per line of serials, or a number of units without serials
export function AddUnitsModal({ item, locations, onClose, onSaved }) {
  const { notify } = useToast()
  const [serials, setSerials] = useState('')
  const [count, setCount] = useState('1')
  const [location, setLocation] = useState(locations[0]?.id || '')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [cost, setCost] = useState('')
  const [life, setLife] = useState('')
  const [saving, setSaving] = useState(false)
  const list = serials.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const total = list.length || Math.max(0, Math.min(200, Math.round(Number(count) || 0)))
  const costValue = numberOrNull(cost)

  async function save(e) {
    e.preventDefault()
    if (!total || (costValue != null && (!Number.isFinite(costValue) || costValue < 0))) return
    setSaving(true)
    const base = {
      org_id: item.org_id, item_id: item.id, location_id: location || null, purchase_date: purchaseDate || null,
      purchase_cost: costValue, depreciation_months: life ? Math.round(Number(life)) : null,
    }
    const rows = list.length ? list.map(serial => ({ ...base, serial: serial.slice(0, 80) })) : Array.from({ length: total }, () => ({ ...base }))
    const { error } = await supabase.from('stock_units').insert(rows)
    setSaving(false)
    if (error) {
      logger.error('inventory', error, { step: 'addUnits', count: rows.length })
      return notify(userMessage(error), 'error')
    }
    track('inventory:units-added')
    notify(t('inv.unitsAdded', { count: rows.length }), 'success')
    onSaved()
    onClose()
  }

  return (
    <Modal title={`${t('inv.addUnits')} · ${item.name}`} onClose={onClose} maxWidth={560}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Field id="un-serials" text={t('inv.serials')}>
          <textarea id="un-serials" value={serials} onChange={e => setSerials(e.target.value)} rows={4} placeholder={t('inv.serialsPlaceholder')}
            style={{ ...input, fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }} autoFocus />
        </Field>
        <div style={grid}>
          {!list.length && (
            <Field id="un-count" text={t('inv.unitsWithoutSerial')}>
              <input id="un-count" type="number" min={1} max={200} value={count} onChange={e => setCount(e.target.value)} style={input} />
            </Field>
          )}
          <Field id="un-loc" text={t('inv.location')}>
            <select id="un-loc" value={location} onChange={e => setLocation(e.target.value)} style={select}>
              <option value="">{t('inv.noLocation')}</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field id="un-date" text={t('inv.purchaseDate')}><input id="un-date" type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={input} /></Field>
          <Field id="un-cost" text={t('inv.purchaseCost')}><input id="un-cost" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} style={input} /></Field>
          <Field id="un-life" text={t('inv.depreciationMonths')}><input id="un-life" type="number" min={1} max={600} value={life} onChange={e => setLife(e.target.value)} placeholder="60" style={input} /></Field>
        </div>
        <p style={{ fontSize: '12px', color: colors.muted }}>{t('inv.unitsHint')}</p>
        <SaveButton saving={saving} disabled={!total}>{t('inv.addUnitsButton', { count: total })}</SaveButton>
      </form>
    </Modal>
  )
}

// One unit: serial, where it is, its status and purchase details
export function UnitModal({ unit, locations, onClose, onSaved }) {
  const { notify } = useToast()
  const [form, setForm] = useState({
    serial: unit.serial || '', location_id: unit.location_id || '', status: unit.status, purchase_date: unit.purchase_date || '',
    purchase_cost: unit.purchase_cost ?? '', depreciation_months: unit.depreciation_months ?? '', notes: unit.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('stock_units').update({
      serial: form.serial.trim() || null, location_id: form.location_id || null, status: form.status,
      purchase_date: form.purchase_date || null, purchase_cost: numberOrNull(form.purchase_cost),
      depreciation_months: form.depreciation_months ? Math.round(Number(form.depreciation_months)) : null, notes: form.notes.trim() || null,
    }).eq('id', unit.id)
    setSaving(false)
    if (error) {
      logger.error('inventory', error, { step: 'updateUnit' })
      return notify(userMessage(error), 'error')
    }
    onSaved()
    onClose()
  }

  return (
    <Modal title={`${t('inv.unit')} ${unit.code}`} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={grid}>
          <Field id="u-serial" text={t('inv.serial')}><input id="u-serial" value={form.serial} onChange={set('serial')} maxLength={80} style={{ ...input, fontFamily: 'monospace' }} /></Field>
          <Field id="u-status" text={t('inv.status')}>
            <select id="u-status" value={form.status} onChange={set('status')} style={select}>
              {UNIT_STATUSES.map(s => <option key={s} value={s}>{t(`inv.unitStatus.${s}`)}</option>)}
            </select>
          </Field>
          <Field id="u-loc" text={t('inv.location')}>
            <select id="u-loc" value={form.location_id} onChange={set('location_id')} style={select}>
              <option value="">{t('inv.noLocation')}</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field id="u-date" text={t('inv.purchaseDate')}><input id="u-date" type="date" value={form.purchase_date} onChange={set('purchase_date')} style={input} /></Field>
          <Field id="u-cost" text={t('inv.purchaseCost')}><input id="u-cost" inputMode="decimal" value={form.purchase_cost} onChange={set('purchase_cost')} style={input} /></Field>
          <Field id="u-life" text={t('inv.depreciationMonths')}><input id="u-life" type="number" min={1} max={600} value={form.depreciation_months} onChange={set('depreciation_months')} placeholder="60" style={input} /></Field>
        </div>
        <Field id="u-notes" text={t('inv.note')}><input id="u-notes" value={form.notes} onChange={set('notes')} maxLength={500} style={input} /></Field>
        {(form.status === 'lost' || form.status === 'retired') && form.status !== unit.status && (
          <p role="alert" style={{ fontSize: '12px', color: '#F59E0B' }}>{t('inv.statusWarning')}</p>
        )}
        <SaveButton saving={saving}>{t('common.save')}</SaveButton>
      </form>
    </Modal>
  )
}

export function LocationModal({ orgId, location, onClose, onSaved }) {
  const { notify } = useToast()
  const [form, setForm] = useState({ name: location?.name || '', kind: location?.kind || 'warehouse', address: location?.address || '', notes: location?.notes || '' })
  const [saving, setSaving] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    const row = { name: form.name.trim(), kind: form.kind, address: form.address.trim() || null, notes: form.notes.trim() || null }
    const { error } = location
      ? await supabase.from('stock_locations').update(row).eq('id', location.id)
      : await supabase.from('stock_locations').insert({ ...row, org_id: orgId })
    setSaving(false)
    if (error) {
      logger.error('inventory', error, { step: 'location' })
      return notify(userMessage(error), 'error')
    }
    onSaved()
    onClose()
  }

  return (
    <Modal title={location ? t('inv.editLocation') : t('inv.addLocation')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={grid}>
          <Field id="lo-name" text={`${t('prices.name')} *`}><input id="lo-name" value={form.name} onChange={set('name')} maxLength={100} placeholder={t('inv.locationPlaceholder')} style={input} autoFocus required /></Field>
          <Field id="lo-kind" text={t('quote.col.kind')}>
            <select id="lo-kind" value={form.kind} onChange={set('kind')} style={select}>
              {LOCATION_KINDS.map(k => <option key={k} value={k}>{t(`inv.locationKind.${k}`)}</option>)}
            </select>
          </Field>
        </div>
        <Field id="lo-address" text={t('inv.address')}><input id="lo-address" value={form.address} onChange={set('address')} maxLength={300} style={input} /></Field>
        <Field id="lo-notes" text={t('inv.note')}><input id="lo-notes" value={form.notes} onChange={set('notes')} maxLength={500} style={input} /></Field>
        <SaveButton saving={saving} disabled={!form.name.trim()}>{t('common.save')}</SaveButton>
      </form>
    </Modal>
  )
}

// Paste from a spreadsheet: new items are created (counted in bulk), quantities are
// added as purchases at the row's location (or the chosen default location)
export function ImportStockModal({ orgId, userId, items, locations, onClose, onImported }) {
  const { notify } = useToast()
  const { lang } = useI18n()
  const [text, setText] = useState('')
  const [defaultLocation, setDefaultLocation] = useState(locations[0]?.id || '')
  const [saving, setSaving] = useState(false)
  const parsed = useMemo(() => parseStockImport(text), [text])
  const locationFor = row => (row.location
    ? locations.find(l => l.name.toLowerCase() === row.location.toLowerCase())?.id
    : defaultLocation) || null
  const unknownLocations = [...new Set(parsed.rows.filter(r => r.location && !locationFor(r)).map(r => r.location))]
  const serialRows = parsed.rows.filter(r => r.quantity && matchItem(items, r)?.tracking === 'serial')
  const needsLocation = parsed.rows.some(r => r.quantity && !locationFor(r))

  async function submit() {
    if (!parsed.rows.length || unknownLocations.length || needsLocation || serialRows.length) return
    setSaving(true)
    let created = 0
    let moved = 0
    try {
      const known = [...items]
      for (const row of parsed.rows) {
        let item = matchItem(known, row)
        if (!item) {
          const { data, error } = await supabase.from('price_items').insert({
            org_id: orgId, created_by: userId, name: row.name, category: row.category, code: row.code,
            unit_price: row.unit_price ?? 0, kind: 'rental', unit: 'day', tracking: 'bulk',
          }).select().single()
          if (error) throw error
          item = data
          known.push(item)
          created++
        } else if (item.tracking === 'none' && row.quantity) {
          const { data, error } = await supabase.from('price_items').update({ tracking: 'bulk' }).eq('id', item.id).select().single()
          if (error) throw error
          Object.assign(item, data)
        }
        if (row.quantity) {
          const { error } = await supabase.from('stock_movements').insert({
            org_id: orgId, item_id: item.id, kind: 'purchase', quantity: row.quantity, to_location_id: locationFor(row), note: t('inv.importNote'),
          })
          if (error) throw error
          moved++
        }
      }
      track('inventory:imported')
      notify(t('inv.imported', { items: created, moves: moved }), 'success')
    } catch (error) {
      logger.error('inventory', error, { step: 'import' })
      notify(`${userMessage(error)} · ${t('inv.importPartial', { items: created, moves: moved })}`, 'error')
    } finally {
      setSaving(false)
      onImported()
    }
    onClose()
  }

  return (
    <Modal title={t('inv.import')} onClose={onClose} maxWidth={640}>
      <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6, marginBottom: '8px' }}>{t('inv.importHelp')}</p>
      <pre style={{ fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '8px 10px', borderRadius: '8px', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
        {t('inv.importExample')}
      </pre>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={9} aria-label={t('inv.import')} autoFocus
        style={{ ...input, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }} lang={lang} />
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
        <label htmlFor="im-loc" style={{ fontSize: '13px', color: colors.soft }}>{t('inv.importDefaultLocation')}</label>
        <select id="im-loc" value={defaultLocation} onChange={e => setDefaultLocation(e.target.value)} style={{ ...select, width: 'auto' }}>
          <option value="">—</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div role="status" style={{ fontSize: '13px', marginBottom: '12px', lineHeight: 1.6, color: colors.soft }}>
        {t('inv.importReady', { count: parsed.rows.length })}
        {parsed.errors.length > 0 && <div style={{ color: '#F59E0B' }}>{t('prices.importSkipped', { lines: parsed.errors.join(', ') })}</div>}
        {unknownLocations.length > 0 && <div style={{ color: colors.danger }}>{t('inv.importUnknownLocations', { names: unknownLocations.join(', ') })}</div>}
        {needsLocation && !unknownLocations.length && <div style={{ color: colors.danger }}>{t('inv.importNeedsLocation')}</div>}
        {serialRows.length > 0 && <div style={{ color: colors.danger }}>{t('inv.importSerial', { names: serialRows.map(r => r.name).join(', ') })}</div>}
      </div>
      <button onClick={submit} disabled={saving || !parsed.rows.length || unknownLocations.length > 0 || needsLocation || serialRows.length > 0}
        style={{ ...btnPrimary, justifyContent: 'center', width: '100%' }}>
        {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={15} />} {t('inv.importButton', { count: parsed.rows.length })}
      </button>
    </Modal>
  )
}

// Inventory → Vehicles (step 23, V1): the organisation's vans and trucks with their capacity,
// the licence they need and their running costs, and when each is booked for a trip.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Truck, Pencil, Archive } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { LICENCE_CATEGORIES } from '../../lib/transport'
import { parseRange, rangeText } from '../../lib/clashes'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { Modal, btn, btnPrimary, btnDanger, iconBtn, input, label, colors, AvxLoader, StatusBadge } from '../ui'
import { rowList, row, rowName, rowMeta } from '../ListParts'
import EmptyState from '../EmptyState'
import { Hint, HintLabel } from '../help/HelpParts'

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }
const small = { fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }
const toNumber = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
const shown = v => (v == null ? '' : String(v).replace('.', ','))
const badNumber = (v, max) => { const n = toNumber(v); return n != null && (!Number.isFinite(n) || n < 0 || n > max) }

// "3.5 t · 12 m³ · C1" for a vehicle's line in lists
export function vehicleMeta(v, t, lang) {
  const nf = x => Number(x).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 2 })
  return [
    v.plate,
    v.max_load_kg != null && t('vehicles.loadShort', { kg: nf(v.max_load_kg) }),
    v.volume_m3 != null && t('vehicles.volumeShort', { m3: nf(v.volume_m3) }),
    v.licence_category && t('vehicles.licenceShort', { category: v.licence_category }),
  ].filter(Boolean).join(' · ')
}

export function VehicleModal({ orgId, vehicle, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState({
    name: vehicle?.name || '', plate: vehicle?.plate || '', licence_category: vehicle?.licence_category || '',
    max_load_kg: shown(vehicle?.max_load_kg), volume_m3: shown(vehicle?.volume_m3),
    cost_per_km: shown(vehicle?.cost_per_km), cost_per_day: shown(vehicle?.cost_per_day), notes: vehicle?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }))
  const invalid = !form.name.trim() || badNumber(form.max_load_kg, 100000) || badNumber(form.volume_m3, 1000)
    || badNumber(form.cost_per_km, 10000) || badNumber(form.cost_per_day, 100000)

  async function save(e) {
    e.preventDefault()
    if (invalid) return
    setSaving(true)
    const values = {
      name: form.name.trim().slice(0, 80), plate: form.plate.trim().slice(0, 20) || null, licence_category: form.licence_category || null,
      max_load_kg: toNumber(form.max_load_kg), volume_m3: toNumber(form.volume_m3),
      cost_per_km: toNumber(form.cost_per_km), cost_per_day: toNumber(form.cost_per_day), notes: form.notes.trim().slice(0, 2000) || null,
    }
    const { error } = vehicle
      ? await supabase.from('vehicles').update(values).eq('id', vehicle.id)
      : await supabase.from('vehicles').insert({ ...values, org_id: orgId })
    setSaving(false)
    if (error) {
      logger.error('vehicles', error, { step: 'save' })
      return notify(userMessage(error), 'error')
    }
    if (!vehicle) track('vehicles:add')
    onSaved()
  }

  async function remove() {
    setSaving(true)
    const { error } = await supabase.from('vehicles').update({ removed_at: new Date().toISOString() }).eq('id', vehicle.id)
    setSaving(false)
    if (error) {
      logger.error('vehicles', error, { step: 'remove' })
      return notify(userMessage(error), 'error')
    }
    track('vehicles:remove')
    onSaved()
  }

  return (
    <Modal title={vehicle ? t('vehicles.edit') : t('vehicles.add')} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={grid}>
          <div>
            <label htmlFor="vehicle-name" style={label}>{t('vehicles.name')}</label>
            <input id="vehicle-name" value={form.name} onChange={set('name')} maxLength={80} placeholder={t('vehicles.namePlaceholder')} style={input} required autoFocus />
          </div>
          <div>
            <label htmlFor="vehicle-plate" style={label}>{t('vehicles.plate')}</label>
            <input id="vehicle-plate" value={form.plate} onChange={set('plate')} maxLength={20} style={input} />
          </div>
        </div>
        <div>
          <HintLabel htmlFor="vehicle-licence" hint="vehicle-licence">{t('vehicles.licence')}</HintLabel>
          <select id="vehicle-licence" value={form.licence_category} onChange={set('licence_category')} style={{ ...input, appearance: 'auto' }}>
            <option value="">{t('vehicles.licenceNone')}</option>
            {LICENCE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={grid}>
          <div>
            <HintLabel htmlFor="vehicle-load" hint="vehicle-capacity">{t('vehicles.maxLoad')}</HintLabel>
            <input id="vehicle-load" inputMode="decimal" value={form.max_load_kg} onChange={set('max_load_kg')} style={input} />
          </div>
          <div>
            <label htmlFor="vehicle-volume" style={label}>{t('vehicles.volume')}</label>
            <input id="vehicle-volume" inputMode="decimal" value={form.volume_m3} onChange={set('volume_m3')} style={input} />
          </div>
        </div>
        <div style={grid}>
          <div>
            <HintLabel htmlFor="vehicle-km" hint="vehicle-costs">{t('vehicles.costPerKm')}</HintLabel>
            <input id="vehicle-km" inputMode="decimal" value={form.cost_per_km} onChange={set('cost_per_km')} style={input} />
          </div>
          <div>
            <label htmlFor="vehicle-day" style={label}>{t('vehicles.costPerDay')}</label>
            <input id="vehicle-day" inputMode="decimal" value={form.cost_per_day} onChange={set('cost_per_day')} style={input} />
          </div>
        </div>
        <p style={{ ...small, margin: 0 }}>{t('vehicles.costHint')}</p>
        <div>
          <label htmlFor="vehicle-notes" style={label}>{t('vehicles.notes')}</label>
          <textarea id="vehicle-notes" value={form.notes} onChange={set('notes')} maxLength={2000} rows={3} style={{ ...input, resize: 'vertical' }} />
        </div>
        {invalid && form.name.trim() && <p role="alert" style={{ ...small, color: colors.danger }}>{t('vehicles.badNumber')}</p>}
        <button type="submit" disabled={saving || invalid} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <AvxLoader size={15} /> : null} {t('common.save')}
        </button>
        {vehicle && !confirmRemove && (
          <button type="button" onClick={() => setConfirmRemove(true)} style={{ ...btn, justifyContent: 'center' }}>
            <Archive size={14} aria-hidden="true" /> {t('vehicles.remove')}
          </button>
        )}
        {vehicle && confirmRemove && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={small}>{t('vehicles.removeConfirm')}</p>
            <button type="button" onClick={remove} disabled={saving} style={{ ...btnDanger, justifyContent: 'center' }}>{t('vehicles.removeYes')}</button>
          </div>
        )}
      </form>
    </Modal>
  )
}

export function VehiclesTab({ orgId }) {
  const { t, lang } = useI18n()
  const [vehicles, setVehicles] = useState(null)
  const [bookings, setBookings] = useState([])
  const [editing, setEditing] = useState(null) // vehicle or {}

  async function load() {
    const [v, r] = await Promise.all([
      supabase.from('vehicles').select('*').eq('org_id', orgId).is('removed_at', null).order('name').limit(500),
      supabase.from('reservations').select('id, resource_id, period, status, gig_id, gig:gig_id(name)')
        .eq('org_id', orgId).eq('resource_type', 'vehicle').neq('status', 'cancelled').limit(2000),
    ])
    if (v.error) logger.error('vehicles', v.error, { step: 'list' })
    if (r.error) logger.error('vehicles', r.error, { step: 'bookings' })
    setVehicles(v.data || [])
    const now = Date.now()
    setBookings((r.data || []).map(b => ({ ...b, range: parseRange(b.period) }))
      .filter(b => b.range && new Date(b.range.until) > now)
      .sort((a, b) => a.range.from.localeCompare(b.range.from)))
  }
  useEffect(() => { load() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!vehicles) return <AvxLoader size={20} color={colors.accentText} />
  const money = v => formatMoney(v, 'EUR', lang)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Truck size={16} color={colors.accentText} aria-hidden="true" /> {t('vehicles.title')}
          <span style={{ color: colors.soft, fontWeight: 600 }}>· {vehicles.length}</span> <Hint id="vehicles" />
        </h2>
        <button type="button" onClick={() => setEditing({})} style={btnPrimary}><Plus size={15} aria-hidden="true" /> {t('vehicles.add')}</button>
      </div>
      <p style={{ ...small, marginBottom: '12px' }}>{t('vehicles.intro')}</p>
      {vehicles.length === 0 ? (
        <EmptyState icon={<Truck size={24} />} title={t('vehicles.emptyTitle')} body={t('vehicles.emptyBody')}
          action={t('vehicles.add')} onAction={() => setEditing({})} guide="pm-vehicle-trip" />
      ) : (
        <ul style={rowList}>
          {vehicles.map(v => {
            const next = bookings.filter(b => b.resource_id === v.id)
            const costs = [v.cost_per_km != null && t('vehicles.perKm', { amount: money(v.cost_per_km) }), v.cost_per_day != null && t('vehicles.perDay', { amount: money(v.cost_per_day) })].filter(Boolean)
            return (
              <li key={v.id} style={{ ...row, alignItems: 'flex-start' }}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={rowName}>{v.name}</span>
                  <span style={rowMeta}>{vehicleMeta(v, t, lang) || t('vehicles.noDetails')}{costs.length > 0 && ` · ${costs.join(' · ')}`}</span>
                  {next.length > 0 ? (
                    <span style={{ ...rowMeta, marginTop: '4px' }}>
                      {t('vehicles.booked')}{' '}
                      {next.slice(0, 3).map((b, i) => (
                        <span key={b.id}>
                          {i > 0 && ' · '}
                          {rangeText(b.range.from, b.range.until)}{' '}
                          {b.gig?.name ? <Link to={`/gig/${b.gig_id}?tab=transport`} style={{ color: colors.accentText }}>{b.gig.name}</Link> : null}
                          {b.status === 'hold' && <> <StatusBadge small tone="draft">{t('clash.hold')}</StatusBadge></>}
                        </span>
                      ))}
                      {next.length > 3 && ` · ${t('vehicles.more', { count: next.length - 3 })}`}
                    </span>
                  ) : <span style={{ ...rowMeta, marginTop: '4px' }}>{t('vehicles.free')}</span>}
                </span>
                <button type="button" onClick={() => setEditing(v)} aria-label={t('vehicles.editNamed', { name: v.name })} title={t('common.edit')} style={iconBtn}><Pencil size={14} aria-hidden="true" /></button>
              </li>
            )
          })}
        </ul>
      )}
      {editing && <VehicleModal orgId={orgId} vehicle={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

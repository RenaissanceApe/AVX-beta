// Transport on a gig (step 23, V1; docs/BUSINESS.md, "How vehicles and trips work"). Everyone on
// the gig sees the trips; the gig's managers and the organisation's admins and members plan them.
// A trip books its vehicle and driver in the reservations engine, so double bookings show as
// clashes. Nothing is blocked: a clash is a warning, and a driver without the vehicle's licence
// category is a warning the planner overrides by ticking that they checked.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Truck, Pencil, AlertTriangle, ArrowRight, Undo2, Archive } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { TRIP_DIRECTIONS, tripProblems, tripMinutes } from '../../lib/transport'
import { rangeText } from '../../lib/clashes'
import { toZonedInput, fromZonedInput } from '../../lib/timeZone'
import { useI18n } from '../../i18n'
import { Modal, btnPrimary, iconBtn, input, label, colors, AvxLoader, StatusBadge } from '../ui'
import EmptyState from '../EmptyState'
import { HintLabel } from '../help/HelpParts'
import { TabHeader } from './parts'
import { hoursText } from '../hours/HoursParts'

const AMBER = 'var(--warn)'
const small = { fontSize: '13px', color: colors.muted, lineHeight: 1.5, margin: 0 }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }
const select = { ...input, appearance: 'auto' }
const DIRECTION_TONE = { out: 'open', back: 'ok', one_way: 'draft' }

// "Van 1: booked 10 Nov 08:00–11:00 (Festival)"
function clashLine(c, who, t, timeZone) {
  const range = rangeText(c.starts_at, c.ends_at, timeZone)
  const what = c.kind === 'unavailable' ? t('clash.unavailable', { range })
    : c.label ? t(c.kind === 'trip' ? 'transport.clashTripNamed' : 'clash.bookedNamed', { range, gig: c.label })
      : t(c.kind === 'trip' ? 'transport.clashTrip' : 'clash.booked', { range })
  return `${who}: ${what}${c.status === 'hold' ? ` ${t('clash.hold')}` : ''}`
}

function licenceLine(status, name, category, t) {
  if (status === 'missing') return t('transport.licenceMissing', { name, category })
  if (status === 'unknown') return t('transport.licenceUnknown', { name, category })
  return null
}

const dayAt = (day, time) => (day ? `${day}T${time}` : '')
const plusHours = (value, hours) => {
  if (!value) return ''
  const d = new Date(`${value}:00Z`)
  d.setUTCHours(d.getUTCHours() + hours)
  return d.toISOString().slice(0, 16)
}

function TripModal({ gig, trip, members, nameOf, timeZone, vehicles, onClose, onSaved }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const isNew = !trip?.id
  const firstDay = gig.start_date || new Date().toISOString().slice(0, 10)
  const lastDay = gig.end_date || firstDay
  const startOut = dayAt(firstDay, '08:00')
  const [form, setForm] = useState(() => ({
    direction: trip?.direction || 'out', vehicle_id: trip?.vehicle_id || '', driver_id: trip?.driver_id || '', co_driver_id: trip?.co_driver_id || '',
    passenger_ids: trip?.passenger_ids || [],
    departs: trip?.departs_at ? toZonedInput(trip.departs_at, timeZone) : (trip?.direction === 'back' ? dayAt(lastDay, '23:00') : startOut),
    arrives: trip?.arrives_at ? toZonedInput(trip.arrives_at, timeZone) : (trip?.direction === 'back' ? plusHours(dayAt(lastDay, '23:00'), 2) : plusHours(startOut, 2)),
    from_place: trip?.from_place || '', to_place: trip?.to_place || '', km: trip?.km != null ? String(trip.km).replace('.', ',') : '', note: trip?.note || '',
    withReturn: false, backDeparts: dayAt(lastDay, '23:00'), backArrives: plusHours(dayAt(lastDay, '23:00'), 2),
    licence_override: !!trip?.licence_override,
  }))
  const [checks, setChecks] = useState({ clashes: [], licence: null, coLicence: null, back: [] })
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const crew = members.map(m => ({ id: m.user_id, name: nameOf(m.user_id) })).sort((a, b) => a.name.localeCompare(b.name))
  const vehicle = vehicles.find(v => v.id === form.vehicle_id)
  const values = {
    departs_at: fromZonedInput(form.departs, timeZone), arrives_at: fromZonedInput(form.arrives, timeZone),
    driver_id: form.driver_id || null, co_driver_id: form.co_driver_id || null, km: form.km === '' ? '' : String(form.km).replace(',', '.'),
  }
  const back = form.withReturn ? { ...values, departs_at: fromZonedInput(form.backDeparts, timeZone), arrives_at: fromZonedInput(form.backArrives, timeZone) } : null
  const problems = [...new Set([...tripProblems(values), ...(back ? tripProblems(back) : [])])]

  // Clashes and the licence check for what is picked (a short pause so typing doesn't call each key)
  const runChecks = useCallback(async () => {
    const ask = (from, until) => (from && until && new Date(until) > new Date(from)
      ? supabase.rpc('transport_clashes', { p_gig: gig.id, p_trip: trip?.id || null, p_vehicle: form.vehicle_id || null, p_driver: form.driver_id || null, p_co_driver: form.co_driver_id || null, p_from: from, p_until: until })
      : Promise.resolve({ data: [] }))
    const licence = user => (user && form.vehicle_id ? supabase.rpc('driver_licence_check', { p_gig: gig.id, p_user: user, p_vehicle: form.vehicle_id }) : Promise.resolve({ data: null }))
    const [c, l, cl, b] = await Promise.all([ask(values.departs_at, values.arrives_at), licence(form.driver_id), licence(form.co_driver_id),
      back ? ask(back.departs_at, back.arrives_at) : Promise.resolve({ data: [] })])
    for (const r of [c, l, cl, b]) if (r.error) logger.error('transport', r.error, { step: 'checks' })
    setChecks({ clashes: c.data || [], licence: l.data ?? null, coLicence: cl.data ?? null, back: b.data || [] })
  }, [gig.id, trip?.id, form.vehicle_id, form.driver_id, form.co_driver_id, values.departs_at, values.arrives_at, back?.departs_at, back?.arrives_at]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = setTimeout(runChecks, 300); return () => clearTimeout(timer) }, [runChecks])

  const whoName = c => (c.who === 'vehicle' ? vehicle?.name || t('transport.vehicle') : nameOf(c.user_id))
  const licenceWarnings = [
    licenceLine(checks.licence, nameOf(form.driver_id), vehicle?.licence_category, t),
    licenceLine(checks.coLicence, nameOf(form.co_driver_id), vehicle?.licence_category, t),
  ].filter(Boolean)
  const needsOverride = licenceWarnings.length > 0 && !form.licence_override
  const togglePassenger = id => set('passenger_ids', form.passenger_ids.includes(id) ? form.passenger_ids.filter(x => x !== id) : [...form.passenger_ids, id])

  async function save(e) {
    e.preventDefault()
    if (problems.length || needsOverride) return
    setSaving(true)
    const row = {
      direction: form.direction, vehicle_id: form.vehicle_id || null, driver_id: values.driver_id, co_driver_id: values.co_driver_id,
      passenger_ids: form.passenger_ids.filter(id => id !== values.driver_id && id !== values.co_driver_id),
      departs_at: values.departs_at, arrives_at: values.arrives_at,
      from_place: form.from_place.trim().slice(0, 200) || null, to_place: form.to_place.trim().slice(0, 200) || null,
      km: values.km === '' ? null : Number(values.km), note: form.note.trim().slice(0, 1000) || null,
      licence_override: licenceWarnings.length > 0 && form.licence_override,
    }
    const rows = isNew ? [{ ...row, gig_id: gig.id }] : []
    if (isNew && back) {
      rows.push({ ...row, gig_id: gig.id, direction: 'back', from_place: row.to_place, to_place: row.from_place, departs_at: back.departs_at, arrives_at: back.arrives_at })
    }
    const { error } = isNew ? await supabase.from('trips').insert(rows) : await supabase.from('trips').update(row).eq('id', trip.id)
    setSaving(false)
    if (error) {
      logger.error('transport', error, { step: 'save' })
      return notify(userMessage(error), 'error')
    }
    if (isNew) track(back ? 'transport:add-return' : 'transport:add')
    onSaved()
  }

  return (
    <Modal title={isNew ? t('transport.add') : t('transport.edit')} onClose={onClose} maxWidth={560}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={grid}>
          <div>
            <label htmlFor="trip-direction" style={label}>{t('transport.direction')}</label>
            <select id="trip-direction" value={form.direction} onChange={e => set('direction', e.target.value)} style={select}>
              {TRIP_DIRECTIONS.map(d => <option key={d} value={d}>{t(`transport.dir.${d}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="trip-vehicle" style={label}>{t('transport.vehicle')}</label>
            <select id="trip-vehicle" value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} style={select}>
              <option value="">{t('transport.noVehicle')}</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{[v.name, v.plate, v.licence_category].filter(Boolean).join(' · ')}</option>)}
              {trip?.vehicle_id && !vehicles.some(v => v.id === trip.vehicle_id) && <option value={trip.vehicle_id}>{trip.vehicle_name || t('transport.vehicle')}</option>}
            </select>
          </div>
        </div>
        <div style={grid}>
          <div>
            <HintLabel htmlFor="trip-driver" hint="trip-driver">{t('transport.driver')}</HintLabel>
            <select id="trip-driver" value={form.driver_id} onChange={e => set('driver_id', e.target.value)} style={select}>
              <option value="">{t('transport.nobody')}</option>
              {crew.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="trip-codriver" style={label}>{t('transport.coDriver')}</label>
            <select id="trip-codriver" value={form.co_driver_id} onChange={e => set('co_driver_id', e.target.value)} style={select}>
              <option value="">{t('transport.nobody')}</option>
              {crew.filter(p => p.id !== form.driver_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div style={grid}>
          <div>
            <label htmlFor="trip-departs" style={label}>{t('transport.departs')}</label>
            <input id="trip-departs" type="datetime-local" value={form.departs} onChange={e => set('departs', e.target.value)} style={input} required />
          </div>
          <div>
            <label htmlFor="trip-arrives" style={label}>{t('transport.arrives')}</label>
            <input id="trip-arrives" type="datetime-local" value={form.arrives} onChange={e => set('arrives', e.target.value)} style={input} required />
          </div>
        </div>
        <div style={grid}>
          <div>
            <label htmlFor="trip-from" style={label}>{t('transport.from')}</label>
            <input id="trip-from" value={form.from_place} maxLength={200} onChange={e => set('from_place', e.target.value)} placeholder={t('transport.fromPlaceholder')} style={input} />
          </div>
          <div>
            <label htmlFor="trip-to" style={label}>{t('transport.to')}</label>
            <input id="trip-to" value={form.to_place} maxLength={200} onChange={e => set('to_place', e.target.value)} placeholder={gig.venue || ''} style={input} />
          </div>
          <div>
            <label htmlFor="trip-km" style={label}>{t('transport.km')}</label>
            <input id="trip-km" inputMode="decimal" value={form.km} onChange={e => set('km', e.target.value)} style={input} />
          </div>
        </div>
        {crew.length > 0 && (
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={label}>{t('transport.passengers')}</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {crew.filter(p => p.id !== form.driver_id && p.id !== form.co_driver_id).map(p => (
                <label key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.passenger_ids.includes(p.id)} onChange={() => togglePassenger(p.id)} /> {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <label htmlFor="trip-note" style={label}>{t('transport.note')}</label>
          <input id="trip-note" value={form.note} maxLength={1000} onChange={e => set('note', e.target.value)} style={input} />
        </div>
        {isNew && form.direction === 'out' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.withReturn} onChange={e => set('withReturn', e.target.checked)} /> {t('transport.withReturn')}
            </label>
            {form.withReturn && (
              <div style={grid}>
                <div>
                  <label htmlFor="trip-back-departs" style={label}>{t('transport.backDeparts')}</label>
                  <input id="trip-back-departs" type="datetime-local" value={form.backDeparts} onChange={e => set('backDeparts', e.target.value)} style={input} />
                </div>
                <div>
                  <label htmlFor="trip-back-arrives" style={label}>{t('transport.backArrives')}</label>
                  <input id="trip-back-arrives" type="datetime-local" value={form.backArrives} onChange={e => set('backArrives', e.target.value)} style={input} />
                </div>
              </div>
            )}
          </div>
        )}

        {problems.map(p => <p key={p} role="alert" style={{ ...small, color: colors.danger }}>{t(p)}</p>)}
        {(checks.clashes.length > 0 || checks.back.length > 0) && (
          <div role="status" style={{ borderLeft: `3px solid ${AMBER}`, paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p style={{ ...small, color: 'var(--text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={14} color={AMBER} aria-hidden="true" /> {t('transport.clashTitle')}
            </p>
            {checks.clashes.map((c, i) => <p key={`o${i}`} style={small}>{clashLine(c, whoName(c), t, timeZone)}</p>)}
            {checks.back.map((c, i) => <p key={`b${i}`} style={small}>{t('transport.onReturn')} {clashLine(c, whoName(c), t, timeZone)}</p>)}
          </div>
        )}
        {licenceWarnings.length > 0 && (
          <div role="status" style={{ borderLeft: `3px solid ${AMBER}`, paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {licenceWarnings.map(w => <p key={w} style={{ ...small, color: 'var(--text)', display: 'flex', gap: '4px' }}><AlertTriangle size={14} color={AMBER} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} /> {w}</p>)}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.licence_override} onChange={e => set('licence_override', e.target.checked)} /> {t('transport.licenceOverride')}
            </label>
          </div>
        )}
        <button type="submit" disabled={saving || problems.length > 0 || needsOverride} style={{ ...btnPrimary, justifyContent: 'center' }}>
          {saving ? <AvxLoader size={15} /> : null} {isNew ? (back ? t('transport.saveBoth') : t('transport.save')) : t('common.save')}
        </button>
      </form>
    </Modal>
  )
}

function TripRow({ trip, nameOf, userId, timeZone, canPlan, onEdit, onReturn, onRemove }) {
  const { t, lang } = useI18n()
  const people = [
    trip.driver_id && t('transport.drivenBy', { name: nameOf(trip.driver_id) }),
    trip.co_driver_id && t('transport.withCoDriver', { name: nameOf(trip.co_driver_id) }),
    trip.passenger_ids?.length > 0 && t('transport.passengerCount', { count: trip.passenger_ids.length }),
  ].filter(Boolean)
  const mine = trip.driver_id === userId || trip.co_driver_id === userId
  const vehicleName = trip.vehicle_name ? [trip.vehicle_name, trip.vehicle_plate].filter(Boolean).join(' · ') : t('transport.noVehicle')
  const licence = canPlan && !trip.licence_override ? [
    licenceLine(trip.licence, nameOf(trip.driver_id), trip.vehicle_licence, t),
    licenceLine(trip.co_licence, nameOf(trip.co_driver_id), trip.vehicle_licence, t),
  ].filter(Boolean) : []
  const clashes = canPlan ? trip.clashes || [] : []
  const whoName = c => (c.who === 'vehicle' ? trip.vehicle_name || t('transport.vehicle') : nameOf(c.user_id))
  return (
    <li style={{ padding: '12px 0', borderBottom: `1px solid ${colors.line}`, display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <Truck size={16} color={colors.accentText} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <StatusBadge small tone={DIRECTION_TONE[trip.direction]}>{t(`transport.dir.${trip.direction}`)}</StatusBadge>
          <span>{rangeText(trip.departs_at, trip.arrives_at, timeZone)}</span>
          <span style={{ fontWeight: 400, color: colors.muted }}>{hoursText(tripMinutes(trip) / 60, lang)}</span>
          {mine && <StatusBadge small tone="ok">{t('transport.youDrive')}</StatusBadge>}
        </p>
        {(trip.from_place || trip.to_place) && (
          <p style={{ ...small, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            {trip.from_place || '…'} <ArrowRight size={13} aria-label={t('transport.toward')} /> {trip.to_place || '…'}
            {trip.km != null && <span style={{ color: colors.muted }}> · {Number(trip.km).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')} km</span>}
          </p>
        )}
        <p style={small}>{[vehicleName, ...people].join(' · ')}</p>
        {trip.note && <p style={small}>{trip.note}</p>}
        {[...clashes.map(c => clashLine(c, whoName(c), t, timeZone)), ...licence].map(w => (
          <p key={w} style={{ ...small, color: 'var(--text)', display: 'flex', gap: '4px' }}>
            <AlertTriangle size={14} color={AMBER} aria-hidden="true" style={{ flexShrink: 0, marginTop: '2px' }} /> {w}
          </p>
        ))}
        {canPlan && trip.licence_override && (trip.licence === 'missing' || trip.licence === 'unknown' || trip.co_licence === 'missing' || trip.co_licence === 'unknown') && (
          <p style={small}>{t('transport.licenceChecked')}</p>
        )}
      </div>
      {canPlan && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {trip.direction === 'out' && <button type="button" onClick={onReturn} aria-label={t('transport.addReturn')} title={t('transport.addReturn')} style={iconBtn}><Undo2 size={14} aria-hidden="true" /></button>}
          <button type="button" onClick={onEdit} aria-label={t('transport.edit')} title={t('transport.edit')} style={iconBtn}><Pencil size={14} aria-hidden="true" /></button>
          <button type="button" onClick={onRemove} aria-label={t('transport.remove')} title={t('transport.remove')} style={iconBtn}><Archive size={14} aria-hidden="true" /></button>
        </div>
      )}
    </li>
  )
}

export default function TransportTab({ gig, members, nameOf, canPlan, canSeeVehicles, timeZone, userId }) {
  const { t } = useI18n()
  const { notify } = useToast()
  const [trips, setTrips] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [editing, setEditing] = useState(null) // trip, {} for new, or { direction: 'back', … } for a return

  const load = useCallback(async () => {
    const [tr, v] = await Promise.all([
      supabase.rpc('gig_trips', { p_gig: gig.id }),
      canPlan ? supabase.rpc('gig_vehicle_choices', { p_gig: gig.id }) : Promise.resolve({ data: [] }),
    ])
    if (tr.error) logger.error('transport', tr.error, { step: 'list' })
    if (v.error) logger.error('transport', v.error, { step: 'vehicles' })
    setTrips(tr.data || [])
    setVehicles(v.data || [])
  }, [gig.id, canPlan])
  useEffect(() => { load() }, [load])

  async function remove(trip) {
    const { error } = await supabase.from('trips').update({ removed_at: new Date().toISOString() }).eq('id', trip.id)
    if (error) {
      logger.error('transport', error, { step: 'remove' })
      return notify(userMessage(error), 'error')
    }
    track('transport:remove')
    notify(t('transport.removed'))
    load()
  }

  const returnOf = trip => ({
    direction: 'back', vehicle_id: trip.vehicle_id, vehicle_name: trip.vehicle_name, driver_id: trip.driver_id, co_driver_id: trip.co_driver_id,
    passenger_ids: trip.passenger_ids, from_place: trip.to_place, to_place: trip.from_place, km: trip.km,
  })

  if (!trips) return <AvxLoader size={20} color={colors.accentText} />
  const addButton = canPlan && <button type="button" onClick={() => setEditing({})} style={btnPrimary}><Plus size={14} aria-hidden="true" /> {t('transport.add')}</button>

  return (
    <div>
      <TabHeader title={t('gig.tab.transport')} subtitle={t('transport.count', { count: trips.length })} hint={t('transport.intro')} action={addButton} />
      {canPlan && gig.org_id && vehicles.length === 0 && (
        <p style={{ ...small, marginBottom: '12px' }}>
          {t('transport.noVehicles')}{' '}
          {canSeeVehicles && <Link to={`/org/${gig.org_id}/inventory?tab=vehicles`} style={{ color: colors.accentText }}>{t('transport.addVehicles')}</Link>}
        </p>
      )}
      {trips.length === 0 ? (
        <EmptyState icon={<Truck size={24} />} title={t('transport.emptyTitle')} body={canPlan ? t('transport.emptyBodyPlan') : t('transport.emptyBody')}
          action={canPlan ? t('transport.add') : null} onAction={() => setEditing({})} guide="pm-vehicle-trip" compact />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${colors.line}` }}>
          {trips.map(trip => (
            <TripRow key={trip.id} trip={trip} nameOf={nameOf} userId={userId} timeZone={timeZone} canPlan={canPlan}
              onEdit={() => setEditing(trip)} onReturn={() => setEditing(returnOf(trip))} onRemove={() => remove(trip)} />
          ))}
        </ul>
      )}
      {canPlan && trips.length > 0 && <p style={{ ...small, marginTop: '12px' }}>{t('transport.hoursNote')}</p>}
      {editing && (
        <TripModal gig={gig} trip={editing} members={members} nameOf={nameOf} timeZone={timeZone} vehicles={vehicles}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

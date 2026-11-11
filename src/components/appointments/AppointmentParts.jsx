// Appointments (step 23, V2): the kind chip, a row in a list, the form planners use to add or
// change one (with the invited people's clashes), and the list on a gig or client.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, MapPin, Plus, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { localToday } from '../../lib/gigs'
import { clashText } from '../../lib/clashes'
import { deviceTimeZone } from '../../lib/timeZone'
import {
  APPOINTMENT_KINDS, appointmentWhen, appointmentRange, toForm, toRow, formError, saveAppointment, cancelAppointment,
  invitees as loadInvitees, clashesFor, linkedAppointments, sortAppointments,
} from '../../lib/appointments'
import { useI18n } from '../../i18n'
import { HintLabel, Hint } from '../help/HelpParts'
import { Modal, btn, btnPrimary, btnDanger, input, colors, LabelChip, AvxLoader, Section, space } from '../ui'
import { rowList, row } from '../ListParts'
import EmptyState from '../EmptyState'

const KIND_COLOUR = { site_visit: 'sky', meeting: 'purple', warehouse: 'orange', other: 'grey' }
export function KindChip({ kind }) {
  const { t } = useI18n()
  return <LabelChip colour={KIND_COLOUR[kind] || 'grey'}>{t(`appointments.kind.${kind || 'other'}`)}</LabelChip>
}

// One appointment in a list: when, what, where, how many invited. Opens it on click.
export function AppointmentRow({ appointment: a, timeZone, org, onOpen }) {
  const { t } = useI18n()
  const people = (a.appointment_people || []).filter(p => !p.removed_at).length
  return (
    <li style={{ ...row, padding: 0 }}>
      <button type="button" onClick={() => onOpen(a)} style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: `${space[1]} ${space[3]}`, width: '100%', minHeight: '44px',
        padding: `${space[2]} 0`, background: 'transparent', border: 'none', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', fontSize: '14px',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, minWidth: '128px' }}>{appointmentWhen(a, timeZone)}</span>
        <span style={{ fontWeight: 600, flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>{a.title}</span>
        <KindChip kind={a.kind} />
        {org && <span style={{ fontSize: '13px', color: colors.muted }}>{org}</span>}
        {a.place && <span style={{ fontSize: '13px', color: colors.muted, display: 'inline-flex', gap: '4px', alignItems: 'center' }}><MapPin size={12} aria-hidden="true" /> {a.place}</span>}
        <span style={{ fontSize: '13px', color: colors.muted, display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
          <Users size={12} aria-hidden="true" /> {t('appointments.peopleCount', { count: people })}
        </span>
      </button>
    </li>
  )
}

// Read-only view for people who are invited but don't plan
export function AppointmentView({ appointment: a, timeZone, onClose }) {
  const { t } = useI18n()
  const people = (a.appointment_people || []).filter(p => !p.removed_at)
  const [names, setNames] = useState({})
  const ids = people.map(p => p.user_id).join(',')
  useEffect(() => {
    if (!ids) return
    let live = true
    supabase.from('profiles').select('id, full_name').in('id', ids.split(',')).then(({ data }) => {
      if (live) setNames(Object.fromEntries((data || []).map(p => [p.id, p.full_name])))
    })
    return () => { live = false }
  }, [ids])
  const zoneNote = timeZone && timeZone !== deviceTimeZone() ? ` (${timeZone})` : ''
  return (
    <Modal title={a.title} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], fontSize: '14px' }}>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <KindChip kind={a.kind} />
          <strong>{appointmentWhen(a, timeZone)}{a.all_day ? '' : zoneNote}</strong>
        </div>
        {a.place && <p style={{ margin: 0 }}><MapPin size={13} aria-hidden="true" /> {a.place}</p>}
        {a.notes && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.notes}</p>}
        <div>
          <h3 style={{ fontSize: '13px', color: colors.muted, fontWeight: 700, margin: `0 0 ${space[1]}` }}>{t('appointments.invited')}</h3>
          <p style={{ margin: 0 }}>{people.map(p => names[p.user_id] || '—').join(', ') || '—'}</p>
        </div>
      </div>
    </Modal>
  )
}

// The form for planners. appointment: the row being changed (null for a new one).
// preset: { gigId, clientId } when started from a gig or a client.
export function AppointmentForm({ orgId, timeZone, appointment, preset, onSaved, onClose }) {
  const { notify } = useToast()
  const { t } = useI18n()
  const [form, setForm] = useState(() => {
    const f = toForm(appointment, timeZone, localToday())
    return appointment ? f : { ...f, gigId: preset?.gigId || '', clientId: preset?.clientId || '' }
  })
  const existing = appointment?.appointment_people || []
  const [chosen, setChosen] = useState(() => existing.filter(p => !p.removed_at).map(p => p.user_id))
  const [people, setPeople] = useState(null)
  const [gigs, setGigs] = useState([])
  const [clients, setClients] = useState([])
  const [filter, setFilter] = useState('')
  const [clashes, setClashes] = useState([])
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const set = patch => setForm(f => ({ ...f, ...patch }))

  useEffect(() => {
    let live = true
    Promise.all([
      loadInvitees(orgId).catch(error => { logger.error('appointments', error, { step: 'invitees' }); return [] }),
      supabase.from('gigs').select('id, name, start_date').eq('org_id', orgId).not('status', 'in', '(archived,cancelled)')
        .order('start_date', { ascending: false, nullsFirst: false }).limit(300),
      supabase.from('clients').select('id, name').eq('org_id', orgId).is('archived_at', null).order('name').limit(1000),
    ]).then(([inv, g, c]) => {
      if (!live) return
      setPeople(inv)
      setGigs(g.data || [])
      setClients(c.data || [])
    })
    return () => { live = false }
  }, [orgId])

  // The chosen people's other bookings at this time
  const error = formError(form)
  const range = useMemo(() => (error ? null : appointmentRange(toRow(form, timeZone), timeZone)), [form, timeZone, error])
  useEffect(() => {
    if (!range || !chosen.length) { setClashes([]); return }
    let live = true
    const timer = setTimeout(() => {
      clashesFor(orgId, chosen, range, appointment?.id)
        .then(rows => { if (live) setClashes(rows) })
        .catch(e => logger.error('appointments', e, { step: 'clashes' }))
    }, 400)
    return () => { live = false; clearTimeout(timer) }
  }, [orgId, chosen, range, appointment?.id])

  const nameOf = id => people?.find(p => p.user_id === id)?.full_name || '—'
  const shown = (people || []).filter(p => !filter || (p.full_name || '').toLowerCase().includes(filter.toLowerCase()) || chosen.includes(p.user_id))
  const toggle = id => setChosen(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))

  async function submit(e) {
    e.preventDefault()
    if (error) { notify(t(error), 'error'); return }
    setSaving(true)
    try {
      await saveAppointment({ id: appointment?.id, orgId, row: toRow(form, timeZone), existingPeople: existing, people: chosen })
      track(appointment ? 'appointment:edit' : `appointment:${form.kind}`)
      notify(t('appointments.saved'), 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      logger.error('appointments', err, { step: 'save' })
      notify(userMessage(err), 'error')
      setSaving(false)
    }
  }

  async function cancel() {
    setSaving(true)
    try {
      await cancelAppointment(appointment.id)
      notify(t('appointments.cancelled'), 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      logger.error('appointments', err, { step: 'cancel' })
      notify(userMessage(err), 'error')
      setSaving(false)
    }
  }

  const field = { minWidth: 0, fontSize: '13px', color: colors.soft, display: 'flex', flexDirection: 'column', gap: '4px' }
  const full = { ...field, gridColumn: '1 / -1' }
  const differentZone = timeZone && timeZone !== deviceTimeZone()
  return (
    <Modal title={appointment ? t('appointments.editTitle') : t('appointments.newTitle')} onClose={onClose} maxWidth={560}>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
        <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
          <HintLabel htmlFor="appt-kind" hint="appointment-kind">{t('appointments.kindLabel')}</HintLabel>
          <select id="appt-kind" value={form.kind} onChange={e => set({ kind: e.target.value })} style={input}>
            {APPOINTMENT_KINDS.map(k => <option key={k} value={k}>{t(`appointments.kind.${k}`)}</option>)}
          </select>
        </div>
        <label style={full}>{t('appointments.titleLabel')}
          <input value={form.title} onChange={e => set({ title: e.target.value })} maxLength={200} required
            placeholder={t('appointments.titlePlaceholder')} style={input} />
        </label>
        <label style={full}>{t('appointments.place')}
          <input value={form.place} onChange={e => set({ place: e.target.value })} maxLength={300} placeholder={t('appointments.placePlaceholder')} style={input} />
        </label>
        <label style={{ ...full, flexDirection: 'row', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
          <input type="checkbox" checked={form.allDay} onChange={e => set({ allDay: e.target.checked })} />
          {t('appointments.allDay')}
        </label>
        <label style={form.allDay ? field : full}>{form.allDay ? t('appointments.firstDay') : t('appointments.day')}
          <input type="date" required value={form.day} onChange={e => set({ day: e.target.value, endDay: form.endDay && form.endDay < e.target.value ? e.target.value : form.endDay })} style={input} />
        </label>
        {form.allDay ? (
          <label style={field}>{t('appointments.lastDay')}
            <input type="date" value={form.endDay} min={form.day} onChange={e => set({ endDay: e.target.value })} style={input} />
          </label>
        ) : (
          <>
            <label style={field}>{t('appointments.from')}
              <input type="time" required value={form.from} onChange={e => set({ from: e.target.value })} style={input} />
            </label>
            <label style={field}>{t('appointments.until')}
              <input type="time" required value={form.until} onChange={e => set({ until: e.target.value })} style={input} />
            </label>
            {form.until && form.from && form.until < form.from && <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '13px', color: colors.muted }}>{t('appointments.nextDay')}</p>}
            {differentZone && <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '13px', color: colors.muted }}>{t('appointments.zoneNote', { zone: timeZone })}</p>}
          </>
        )}

        <fieldset style={{ gridColumn: '1 / -1', border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          <legend style={{ fontSize: '13px', color: colors.soft, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {t('appointments.invite')} <Hint id="appointment-invite" label={t('appointments.invite')} />
          </legend>
          {!people ? <AvxLoader size={16} color={colors.accentText} /> : people.length === 0 ? (
            <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>{t('appointments.nobodyToInvite')}</p>
          ) : (
            <>
              {people.length > 8 && <input value={filter} onChange={e => setFilter(e.target.value)} placeholder={t('appointments.findPerson')}
                aria-label={t('appointments.findPerson')} style={{ ...input, marginBottom: '6px' }} />}
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', border: `1px solid ${colors.border}`, padding: '6px 8px' }}>
                {shown.map(p => (
                  <label key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', minHeight: '32px', color: 'var(--text)' }}>
                    <input type="checkbox" checked={chosen.includes(p.user_id)} onChange={() => toggle(p.user_id)} />
                    <span style={{ flex: 1, minWidth: 0 }}>{p.full_name || '—'}</span>
                    {!p.is_member && <span style={{ fontSize: '12px', color: colors.muted }}>{t('appointments.crew')}</span>}
                  </label>
                ))}
              </div>
            </>
          )}
          {clashes.length > 0 && (
            <div role="status" style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.5 }}>
              <strong style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontWeight: 600 }}>
                <AlertTriangle size={14} aria-hidden="true" color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} /> {t('appointments.clashes')}
              </strong>
              {clashes.map((c, i) => <div key={i} style={{ paddingLeft: '22px', color: 'var(--text-2)' }}>{nameOf(c.user_id)}: {clashText(c, timeZone)}</div>)}
            </div>
          )}
        </fieldset>

        <label style={field}>{t('appointments.gig')}
          <select value={form.gigId} onChange={e => set({ gigId: e.target.value })} style={input}>
            <option value="">{t('appointments.noGig')}</option>
            {gigs.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            {form.gigId && !gigs.some(g => g.id === form.gigId) && <option value={form.gigId}>{t('appointments.linkedGig')}</option>}
          </select>
        </label>
        <label style={field}>{t('appointments.client')}
          <select value={form.clientId} onChange={e => set({ clientId: e.target.value })} style={input}>
            <option value="">{t('appointments.noClient')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            {form.clientId && !clients.some(c => c.id === form.clientId) && <option value={form.clientId}>{t('appointments.linkedClient')}</option>}
          </select>
        </label>
        <label style={full}>{t('appointments.notes')}
          <textarea value={form.notes} onChange={e => set({ notes: e.target.value })} maxLength={4000} rows={3} style={{ ...input, resize: 'vertical' }} />
        </label>

        <button type="submit" disabled={saving} style={{ ...btnPrimary, gridColumn: '1 / -1', justifyContent: 'center' }}>
          {saving ? <AvxLoader size={14} /> : <CalendarClock size={14} aria-hidden="true" />} {appointment ? t('appointments.save') : t('appointments.add')}
        </button>
        {appointment && (confirmCancel ? (
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ flex: '1 1 200px' }}>{t('appointments.cancelConfirm')}</span>
            <button type="button" onClick={() => setConfirmCancel(false)} style={btn}>{t('appointments.keep')}</button>
            <button type="button" onClick={cancel} disabled={saving} style={btnDanger}>{t('appointments.cancelYes')}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmCancel(true)} style={{ ...btn, gridColumn: '1 / -1', justifyContent: 'center' }}>
            {t('appointments.cancel')}
          </button>
        ))}
      </form>
    </Modal>
  )
}

// The appointments linked to a gig or a client (step 23, V2). Planners can add one from here.
export function LinkedAppointments({ orgId, timeZone, gigId, clientId, canPlan, plain = false }) {
  const { t } = useI18n()
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null) // appointment | 'new'
  const [viewing, setViewing] = useState(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    linkedAppointments(gigId ? 'gig_id' : 'client_id', gigId || clientId)
      .then(rows => { if (live) setList(rows) })
      .catch(error => { logger.error('appointments', error, { step: 'linked' }); if (live) setList([]) })
    return () => { live = false }
  }, [gigId, clientId, version])
  if (!list) return null
  // People who don't plan only see appointments they're on; hide the section when there are none
  if (!canPlan && list.length === 0) return null
  const { upcoming, past } = sortAppointments(list, timeZone)
  const all = [...upcoming, ...past]
  const body = all.length === 0 ? (
    <EmptyState compact icon={<CalendarClock size={26} />} title={t('appointments.noneLinked')} body={t(gigId ? 'appointments.noneLinkedGig' : 'appointments.noneLinkedClient')}
      action={t('appointments.new')} onAction={() => setEditing('new')} guide="pm-site-visit" />
  ) : (
    <ul style={rowList}>
      {all.map(a => <AppointmentRow key={a.id} appointment={a} timeZone={timeZone} onOpen={x => (canPlan ? setEditing(x) : setViewing(x))} />)}
    </ul>
  )
  const add = canPlan && all.length > 0 && (
    <button type="button" onClick={() => setEditing('new')} style={{ ...btn, padding: '4px 10px', fontSize: '13px' }}>
      <Plus size={13} aria-hidden="true" /> {t('appointments.new')}
    </button>
  )
  const form = viewing ? <AppointmentView appointment={viewing} timeZone={timeZone} onClose={() => setViewing(null)} /> : editing && (
    <AppointmentForm orgId={orgId} timeZone={timeZone} appointment={editing === 'new' ? null : editing}
      preset={{ gigId, clientId }} onSaved={() => setVersion(v => v + 1)} onClose={() => setEditing(null)} />
  )
  if (plain) return (
    <section style={{ marginTop: space[4] }}>
      <h3 style={{ fontSize: '14px', fontWeight: 700, margin: `0 0 ${space[2]}`, display: 'flex', alignItems: 'center', gap: space[2] }}>{t('appointments.title')} <span style={{ marginLeft: 'auto' }}>{add}</span></h3>
      {body}{form}
    </section>
  )
  return <Section id="ov-appointments" title={t('appointments.title')} aside={add}>{body}{form}</Section>
}

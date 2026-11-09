// Leave (step 9), admins only: requests waiting for a decision, and everyone's holiday balance
// and working week for a year.
import { useCallback, useEffect, useState } from 'react'
import { Check, X, Pencil, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { DEFAULT_ALLOWANCE, DEFAULT_WEEK, WEEKDAYS, decideLeave, leaveError, leaveRange } from '../../lib/leave'
import { useI18n, fmt } from '../../i18n'
import { HintLabel } from '../help/HelpParts'
import { Modal, btn, btnPrimary, btnDanger, input, label, colors, AvxLoader } from '../ui'
import { TypeChip, daysText } from './LeaveParts'

// Page sections on the page ground, no card (DESIGN.md rule 2)
const section = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }
const h2 = { font: '700 16px/24px var(--font-mono)', margin: 0 }
// 1 January 2024 was a Monday: weekday names in the UI language
const dayName = (d, pattern = 'EEE') => fmt(new Date(2024, 0, d), pattern)
export function weekText(days, t) {
  const list = [...(days || DEFAULT_WEEK)].map(Number).sort()
  if (list.join() === DEFAULT_WEEK.join()) return t('leave.monFri')
  return list.map(d => dayName(d)).join(', ')
}

export function LeaveRequests({ orgId, version, onChanged }) {
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const [list, setList] = useState(null)
  const [names, setNames] = useState({})
  const [refusing, setRefusing] = useState(null) // { id, note }
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('crew_unavailability').select('*').eq('org_id', orgId).eq('status', 'requested')
      .is('removed_at', null).order('start_date').limit(500)
    if (error) logger.error('leave', error, { step: 'requests' })
    const rows = data || []
    const ids = [...new Set(rows.map(r => r.user_id))]
    const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
    setNames(Object.fromEntries((people || []).map(p => [p.id, p.full_name || '—'])))
    setList(rows)
  }, [orgId])
  useEffect(() => { load() }, [load, version])

  async function decide(id, approve, note) {
    setBusy(id)
    try {
      await decideLeave(id, approve, note)
      track(approve ? 'leave:approve' : 'leave:refuse')
      notify(approve ? t('leave.approvedToast') : t('leave.refusedToast'), 'success')
      setRefusing(null)
      onChanged()
    } catch (error) {
      logger.error('leave', error, { step: approve ? 'approve' : 'refuse' })
      notify(leaveError(error, t) || userMessage(error), 'error')
    }
    setBusy(null)
  }

  if (!list || list.length === 0) return null
  return (
    <section className="avx-section" style={section} aria-labelledby="leave-requests">
      <h2 id="leave-requests" style={h2}>{t('leave.waitingForYou', { count: list.length })}</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
        {list.map(l => (
          <li key={l.id} style={{ padding: '8px 0', borderTop: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
            <span style={{ display: 'flex', gap: '8px 12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{names[l.user_id] || '…'}</strong>
              <span>{leaveRange(l, t, fmt)}</span>
              <TypeChip type={l.type} />
              <span style={{ color: colors.muted }}>{t('leave.dayCount', { count: Number(l.days), days: daysText(l.days, lang) })}</span>
            </span>
            {l.note && <span style={{ fontSize: '13px', color: colors.muted }}>“{l.note}”</span>}
            {refusing?.id === l.id ? (
              <form onSubmit={e => { e.preventDefault(); decide(l.id, false, refusing.note) }} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input value={refusing.note} onChange={e => setRefusing({ id: l.id, note: e.target.value })} maxLength={500} required autoFocus
                  aria-label={t('leave.refuseNote')} placeholder={t('leave.refuseNote')} style={{ ...input, flex: '1 1 200px' }} />
                <button type="submit" disabled={busy === l.id || !refusing.note.trim()} style={btnDanger}>{t('leave.refuse')}</button>
                <button type="button" onClick={() => setRefusing(null)} style={btn}>{t('common.cancel')}</button>
              </form>
            ) : (
              <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" disabled={busy === l.id} onClick={() => decide(l.id, true)} style={btnPrimary}>
                  {busy === l.id ? <AvxLoader size={14} /> : <Check size={14} />} {t('leave.approve')}
                </button>
                <button type="button" disabled={busy === l.id} onClick={() => setRefusing({ id: l.id, note: '' })} style={btnDanger}><X size={14} /> {t('leave.refuse')}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LeaveBalances({ orgId, version, onChanged }) {
  const { notify } = useToast()
  const { t, lang } = useI18n()
  const [year, setYear] = useState(new Date().getFullYear())
  const [rows, setRows] = useState(null)
  const [orgDays, setOrgDays] = useState('')
  const [savedOrgDays, setSavedOrgDays] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    const [bal, settings] = await Promise.all([
      supabase.rpc('leave_balances', { p_org: orgId, p_year: year }),
      supabase.from('org_leave_settings').select('holiday_days').eq('org_id', orgId).maybeSingle(),
    ])
    if (bal.error) logger.error('leave', bal.error, { step: 'balances' })
    setRows(bal.data || [])
    const days = settings.data ? Number(settings.data.holiday_days) : null
    setSavedOrgDays(days)
    setOrgDays(String(days ?? DEFAULT_ALLOWANCE))
  }, [orgId, year])
  useEffect(() => { load() }, [load, version])

  async function saveOrgDays(e) {
    e.preventDefault()
    const value = Number(orgDays)
    if (!Number.isFinite(value) || value < 0 || value > 100) return notify(t('leave.error.allowance'), 'error')
    const { error } = savedOrgDays == null
      ? await supabase.from('org_leave_settings').insert({ org_id: orgId, holiday_days: value })
      : await supabase.from('org_leave_settings').update({ holiday_days: value }).eq('org_id', orgId)
    if (error) {
      logger.error('leave', error, { step: 'orgDays' })
      return notify(userMessage(error), 'error')
    }
    notify(t('leave.settingsSaved'), 'success')
    onChanged()
  }

  return (
    <section className="avx-section" style={section} aria-labelledby="leave-balances">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <h2 id="leave-balances" style={{ ...h2, flex: '1 1 160px' }}>{t('leave.balances')}</h2>
        <div>
          <label htmlFor="leave-year" style={label}>{t('leave.year')}</label>
          <input id="leave-year" type="number" min={2000} max={2100} value={year}
            onChange={e => { const y = Number(e.target.value); if (y >= 2000 && y <= 2100) setYear(y) }} style={{ ...input, width: '96px' }} />
        </div>
      </div>
      <form onSubmit={saveOrgDays} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <HintLabel htmlFor="leave-org-days" hint="leave-allowance">{t('leave.orgAllowance')}</HintLabel>
          <input id="leave-org-days" type="number" min={0} max={100} step={0.5} value={orgDays} onChange={e => setOrgDays(e.target.value)} style={{ ...input, width: '96px' }} />
        </div>
        <button type="submit" disabled={String(savedOrgDays ?? DEFAULT_ALLOWANCE) === orgDays} style={btn}><Save size={14} /> {t('common.save')}</button>
      </form>
      {!rows ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}><AvxLoader size={20} color={colors.accentText} /></div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
          {rows.map(r => (
            <li key={r.user_id} style={{ display: 'flex', gap: '4px 12px', alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: '14px' }}>
              <span style={{ fontWeight: 700, flex: '1 1 140px', minWidth: 0 }}>{r.full_name || '—'}</span>
              <span><strong>{t('leave.daysLeft', { count: Number(r.left_days), days: daysText(r.left_days, lang) })}</strong></span>
              <span style={{ color: colors.muted, fontSize: '13px' }}>
                {t('leave.balanceLine', { allowance: daysText(r.allowance, lang), carried: daysText(r.carried, lang), used: daysText(r.used, lang) })}
                {Number(r.asked) > 0 && ` · ${t('leave.waitingDays', { days: daysText(r.asked, lang) })}`}
              </span>
              <span style={{ color: colors.muted, fontSize: '13px' }}>{weekText(r.work_days, t)} · {t('leave.hoursPerDay', { hours: daysText(r.hours_per_day, lang) })}</span>
              <button type="button" onClick={() => setEditing(r)} aria-label={t('leave.editPerson', { name: r.full_name || '—' })} style={btn}><Pencil size={13} /> {t('common.edit')}</button>
            </li>
          ))}
        </ul>
      )}
      {editing && <PersonLeaveForm orgId={orgId} year={year} row={editing} onSaved={onChanged} onClose={() => setEditing(null)} />}
    </section>
  )
}

// One person's allowance and carry-over for a year, and their working week
function PersonLeaveForm({ orgId, year, row, onSaved, onClose }) {
  const { notify } = useToast()
  const { t } = useI18n()
  const [allowance, setAllowance] = useState(row.own_allowance == null ? '' : String(row.own_allowance))
  const [carried, setCarried] = useState(String(row.carried ?? 0))
  const [week, setWeek] = useState((row.work_days || DEFAULT_WEEK).map(Number))
  const [hours, setHours] = useState(String(row.hours_per_day ?? 8))
  const [saving, setSaving] = useState(false)

  async function save(e) {
    e.preventDefault()
    const a = allowance === '' ? null : Number(allowance)
    const c = Number(carried || 0)
    const h = Number(hours)
    if ((a != null && !(a >= 0 && a <= 100)) || !(c >= 0 && c <= 100)) return notify(t('leave.error.allowance'), 'error')
    if (!week.length || !(h > 0 && h <= 24)) return notify(t('leave.error.week'), 'error')
    setSaving(true)
    try {
      const yearRow = { allowance: a, carried: c }
      const { data: hasYear } = await supabase.from('staff_leave_years').select('year').eq('org_id', orgId).eq('user_id', row.user_id).eq('year', year).maybeSingle()
      const y = hasYear
        ? await supabase.from('staff_leave_years').update(yearRow).eq('org_id', orgId).eq('user_id', row.user_id).eq('year', year)
        : await supabase.from('staff_leave_years').insert({ org_id: orgId, user_id: row.user_id, year, ...yearRow })
      if (y.error) throw y.error
      const weekRow = { days: [...week].sort(), hours_per_day: h }
      const { data: hasWeek } = await supabase.from('staff_work_weeks').select('user_id').eq('org_id', orgId).eq('user_id', row.user_id).maybeSingle()
      const w = hasWeek
        ? await supabase.from('staff_work_weeks').update(weekRow).eq('org_id', orgId).eq('user_id', row.user_id)
        : await supabase.from('staff_work_weeks').insert({ org_id: orgId, user_id: row.user_id, ...weekRow })
      if (w.error) throw w.error
      track('leave:balance')
      notify(t('leave.settingsSaved'), 'success')
      onSaved()
      onClose()
    } catch (error) {
      logger.error('leave', error, { step: 'person' })
      notify(userMessage(error), 'error')
      setSaving(false)
    }
  }

  const toggle = d => setWeek(w => (w.includes(d) ? w.filter(x => x !== d) : [...w, d]))
  return (
    <Modal title={t('leave.personTitle', { name: row.full_name || '—', year })} onClose={onClose}>
      <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <HintLabel htmlFor="leave-own-days" hint="leave-allowance">{t('leave.ownAllowance')}</HintLabel>
          <input id="leave-own-days" type="number" min={0} max={100} step={0.5} value={allowance} onChange={e => setAllowance(e.target.value)}
            placeholder={t('leave.orgDefault')} style={input} />
        </div>
        <div style={{ minWidth: 0 }}>
          <HintLabel htmlFor="leave-carried" hint="leave-carried">{t('leave.carriedLabel')}</HintLabel>
          <input id="leave-carried" type="number" min={0} max={100} step={0.5} value={carried} onChange={e => setCarried(e.target.value)} style={input} />
        </div>
        <fieldset style={{ gridColumn: '1 / -1', border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ ...label, marginBottom: '6px' }}>{t('leave.workWeek')}</legend>
          <span style={{ display: 'flex', gap: '8px 12px', flexWrap: 'wrap', fontSize: '13px' }}>
            {WEEKDAYS.map(d => (
              <label key={d} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="checkbox" checked={week.includes(d)} onChange={() => toggle(d)} /> {dayName(d)}
              </label>
            ))}
          </span>
        </fieldset>
        <div style={{ minWidth: 0 }}>
          <HintLabel htmlFor="leave-hours" hint="leave-hours">{t('leave.hoursLabel')}</HintLabel>
          <input id="leave-hours" type="number" min={0.5} max={24} step={0.25} value={hours} onChange={e => setHours(e.target.value)} style={input} />
        </div>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, gridColumn: '1 / -1', justifyContent: 'center' }}>
          {saving ? <AvxLoader size={14} /> : <Save size={14} />} {t('common.save')}
        </button>
      </form>
    </Modal>
  )
}

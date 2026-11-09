// Hours on a gig's Crew tab (step 8). Crew see and log their own days; the gig's managers see
// everyone's, log for anyone, approve or send back with a note, and download a CSV.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Plus, Pencil, Check, Undo2, Download, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/ToastContext'
import { logger, userMessage } from '../../lib/logger'
import { track } from '../../lib/usage'
import { HOURS_COLUMNS, HOURS_QUEUE_CHANGED, readQueuedHours, reviewHours, approval, downloadHoursCsv } from '../../lib/hours'
import { totals } from '../../lib/timeRegistration'
import { resolveRate } from '../../lib/crewRates'
import { useRateCard } from '../../lib/useCrewRates'
import { useI18n } from '../../i18n'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { HoursModal, DayLine, SplitLine, StatusChip, hoursText, money } from './HoursParts'
import { Modal, btn, btnPrimary, iconBtn, input, label, colors, AvxLoader } from '../ui'

export default function GigHours({ gig, members, isPM, userId, nameOf, onReviewed }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const rateCard = useRateCard(isPM ? gig.org_id : null)
  const [entries, setEntries] = useState(null)
  const [schedule, setSchedule] = useState([])
  const [settings, setSettings] = useState(null)
  const [fees, setFees] = useState([])
  const [queued, setQueued] = useState(() => readQueuedHours(userId).filter(q => q.gig_id === gig.id))
  const [editing, setEditing] = useState(null) // { entry } or { new: true }
  const [returning, setReturning] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const [e, s, set, f] = await Promise.all([
      supabase.from('time_entries').select(HOURS_COLUMNS).eq('gig_id', gig.id).is('removed_at', null).order('work_date').limit(2000),
      supabase.from('gig_schedule').select('day, start_time, end_time').eq('gig_id', gig.id),
      isPM ? supabase.rpc('time_settings', { p_gig: gig.id }) : { data: null },
      isPM ? supabase.from('gig_crew_fees').select('user_id, unit, rate, quantity').eq('gig_id', gig.id) : { data: [] },
    ])
    if (e.error) logger.error('hours', e.error, { step: 'load' })
    setEntries(e.data || [])
    setSchedule(s.data || [])
    setSettings(set.data || { factors: null, holidays: [] })
    setFees(f.data || [])
  }, [gig.id, isPM])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onQueue = () => { setQueued(readQueuedHours(userId).filter(q => q.gig_id === gig.id)); load() }
    window.addEventListener(HOURS_QUEUE_CHANGED, onQueue)
    return () => window.removeEventListener(HOURS_QUEUE_CHANGED, onQueue)
  }, [userId, gig.id, load])

  const factors = useMemo(() => ({ ...(rateCard.factors || {}), ...(settings?.factors || {}) }), [rateCard.factors, settings])
  const ctxFor = useCallback(entry => {
    const m = members.find(x => x.user_id === entry.user_id)
    return {
      fee: fees.find(f => f.user_id === entry.user_id && f.rate != null) || null,
      rate: resolveRate(rateCard.rates, { userId: entry.user_id, functionTitle: m?.function_title }),
      factors, holidays: settings?.holidays || [],
    }
  }, [members, fees, rateCard.rates, factors, settings])

  if (!entries) return null
  const mine = entries.filter(e => e.user_id === userId)
  const shown = isPM ? entries : mine
  const pendingQueue = queued.filter(q => !entries.some(e => e.id === q.id))
  const myMember = members.find(m => m.user_id === userId)
  const canLog = isPM || !!myMember
  const waiting = isPM ? entries.filter(e => e.status === 'submitted') : []
  const byPerson = isPM ? [...new Set(shown.map(e => e.user_id))] : [userId]
  const people = isPM ? members.map(m => ({ user_id: m.user_id, name: nameOf(m.user_id), booked_from: m.booked_from, booked_until: m.booked_until })) : null

  async function review(entry, approve, note) {
    setBusy(entry.id)
    try {
      await reviewHours(entry, approve, note, ctxFor(entry))
      track(approve ? 'hours:approve' : 'hours:return')
      setReturning(null)
      await load()
      onReviewed?.()
    } catch (error) {
      logger.error('hours', error, { step: 'review' })
      notify(userMessage(error), 'error')
    }
    setBusy(null)
  }
  async function approveAll() {
    setBusy('all')
    let failed = 0
    for (const e of waiting) {
      try { await reviewHours(e, true, null, ctxFor(e)) } catch (error) { failed++; logger.error('hours', error, { step: 'approveAll' }) }
    }
    track('hours:approve-all')
    if (failed) notify(t('hours.someFailed', { count: failed }), 'error')
    setBusy(null)
    await load()
    onReviewed?.()
  }

  const total = totals(shown, factors, settings?.holidays)

  return (
    // On the gig page's Crew tab: a section on the page ground, not a card (DESIGN.md "One box deep"; DR2)
    <section aria-labelledby="hours-title" className="avx-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
        <h3 id="hours-title" className="avx-section__title" style={{ flex: 1 }}>
          {isPM ? t('hours.gigTitle') : t('hours.myTitle')} <Hint id="hours" />
        </h3>
        {isPM && shown.length > 0 && (
          <button type="button" onClick={() => { downloadHoursCsv(shown.map(e => ({ ...e, gig_name: gig.name })), Object.fromEntries(members.map(m => [m.user_id, nameOf(m.user_id)])), `${gig.name} - ${t('hours.fileName')}`); track('hours:csv') }} style={btn}>
            <Download size={14} /> CSV
          </button>
        )}
        {canLog && <button type="button" onClick={() => setEditing({ new: true })} style={btnPrimary}><Plus size={14} /> {t('hours.log')}</button>}
      </div>
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.5, marginBottom: '10px' }}>{isPM ? t('hours.gigIntro') : t('hours.myIntro')}</p>

      {waiting.length > 1 && (
        <button type="button" onClick={approveAll} disabled={busy === 'all'} style={{ ...btn, marginBottom: '10px' }}>
          {busy === 'all' ? <AvxLoader size={14} /> : <CheckCheck size={14} />} {t('hours.approveAll', { count: waiting.length })}
        </button>
      )}

      {shown.length === 0 && pendingQueue.length === 0 ? (
        <EmptyState icon={<Clock size={24} />} title={t('hours.emptyTitle')} body={isPM ? t('hours.emptyBodyPM') : t('hours.emptyBody')} compact />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {byPerson.map(pid => {
            const days = shown.filter(e => e.user_id === pid)
            const queuedDays = pid === userId ? pendingQueue : []
            if (!days.length && !queuedDays.length) return null
            const sum = totals(days, factors, settings?.holidays)
            return (
              <div key={pid}>
                {isPM && (
                  <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 4px' }}>
                    {nameOf(pid)} <span style={{ fontWeight: 400, color: colors.muted }}>· {hoursText(sum.worked, lang)}{sum.cost > 0 && ` · ${money(sum.cost, lang)}`}</span>
                  </p>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {queuedDays.map(q => (
                    <li key={q.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '14px' }}>
                      <span style={{ flex: '1 1 200px', minWidth: 0 }}><DayLine entry={q} /></span>
                      <StatusChip status="queued" />
                    </li>
                  ))}
                  {days.map(e => {
                    const preview = isPM && e.status === 'submitted' ? approval(e, ctxFor(e))?.preview : null
                    return (
                      <li key={e.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '14px' }}>
                        <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <DayLine entry={e} />
                          {e.status === 'approved' && <SplitLine split={e.split} cost={e.user_id === userId || isPM ? e.cost : null} />}
                          {preview && <SplitLine split={preview} cost={preview.cost} />}
                          {e.status === 'returned' && e.review_note && <span style={{ display: 'block', fontSize: '12px', color: colors.danger }}>{t('hours.returnedNote', { note: e.review_note })}</span>}
                          {e.note && <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>“{e.note}”</span>}
                        </span>
                        <StatusChip status={e.status} />
                        {e.status !== 'approved' && (
                          <button type="button" onClick={() => setEditing({ entry: e })} aria-label={t('hours.editFor', { date: e.work_date })} style={iconBtn}><Pencil size={14} /></button>
                        )}
                        {isPM && e.status === 'submitted' && (
                          <>
                            <button type="button" disabled={busy === e.id} onClick={() => review(e, true)} style={btn}>
                              {busy === e.id ? <AvxLoader size={14} /> : <Check size={14} />} {t('hours.approve')}
                            </button>
                            <button type="button" disabled={busy === e.id} onClick={() => setReturning(e)} style={btn}><Undo2 size={14} /> {t('hours.sendBack')}</button>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {shown.length > 0 && (
        <p style={{ fontSize: '13px', marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${colors.border}` }}>
          {t('hours.total')}: <strong>{hoursText(total.worked, lang)}</strong>
          {total.overtime > 0 && <span style={{ color: colors.muted }}> · {t('hours.bucket.overtime')} {hoursText(total.overtime, lang)}</span>}
          {total.travel > 0 && <span style={{ color: colors.muted }}> · {t('hours.travel')} {hoursText(total.travel, lang)}</span>}
        </p>
      )}

      {editing && (
        <HoursModal gig={gig} member={editing.entry ? members.find(m => m.user_id === editing.entry.user_id) : myMember} entry={editing.entry}
          schedule={schedule} userId={userId} people={editing.new && isPM ? people : null}
          takenDays={[...entries, ...pendingQueue].map(e => `${e.user_id}:${e.work_date}`)}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
      {returning && <ReturnModal entry={returning} name={nameOf(returning.user_id)} busy={busy === returning.id} onClose={() => setReturning(null)} onSend={note => review(returning, false, note)} />}
    </section>
  )
}

function ReturnModal({ entry, name, busy, onClose, onSend }) {
  const { t } = useI18n()
  const [note, setNote] = useState('')
  return (
    <Modal title={t('hours.sendBackTitle', { name })} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (note.trim()) onSend(note) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ margin: 0, fontSize: '14px' }}><DayLine entry={entry} /></p>
        <div>
          <label htmlFor="hours-return-note" style={label}>{t('hours.sendBackNote')}</label>
          <textarea id="hours-return-note" value={note} maxLength={500} rows={3} onChange={e => setNote(e.target.value)} style={{ ...input, resize: 'vertical' }} autoFocus required />
        </div>
        <button type="submit" disabled={busy || !note.trim()} style={{ ...btnPrimary, justifyContent: 'center' }}><Undo2 size={15} /> {t('hours.sendBack')}</button>
      </form>
    </Modal>
  )
}

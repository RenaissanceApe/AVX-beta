import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { retryOnce } from '../lib/selectAll'
import { logger, userMessage } from '../lib/logger'
import { useToast } from '../lib/ToastContext'
import { useGigLabels, gigStatusLabel, labelStyle } from '../lib/gigLabels'
import { hoursVariance, hoursText } from '../lib/analytics/ops'
import { formatMoney } from '../lib/quotes'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { btn, btnPrimary, card, colors, input, AvxLoader } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import { PageHelp } from '../components/help/HelpParts'
import { PrintStyles } from '../components/reports/ReportParts'

const section = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px', breakInside: 'avoid' }
const h2 = { fontSize: '16px', fontWeight: 700, margin: 0 }
const small = { fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }
const row = { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px', padding: '3px 0', borderBottom: `1px solid ${colors.border}` }
const list = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }

// The gig wrap-up (K7) at /gig/:id/wrapup: a printable page after the gig, from public.gig_wrapup.
// Planned against actual hours (each person for the gig's managers and the organisation's admins),
// money only for those who see it, damage, losses and what didn't come back, open tasks, and notes
// the gig's managers write. Crew and viewers can't open it (the function refuses them).
export default function GigWrapupPage() {
  const { id } = useParams()
  const { t, lang, fmt } = useI18n()
  const { notify } = useToast()
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const labels = useGigLabels(data?.gig?.org_id || null)

  useEffect(() => {
    let cancelled = false
    retryOnce(() => supabase.rpc('gig_wrapup', { p_gig: id })).then(({ data: d, error }) => {
      if (cancelled) return
      if (error) {
        logger.error('wrapup', error, { gigId: id })
        return setFailed(true)
      }
      setData(d)
      setNotes(d?.gig?.wrapup_notes || '')
      track('view:gig:wrapup')
    })
    return () => { cancelled = true }
  }, [id])

  async function saveNotes(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('gigs').update({ wrapup_notes: notes.trim() || null }).eq('id', id)
    setSaving(false)
    if (error) {
      logger.error('wrapup', error, { gigId: id, step: 'notes' })
      return notify(userMessage(error), 'error')
    }
    setData(d => ({ ...d, gig: { ...d.gig, wrapup_notes: notes.trim() || null } }))
    notify(t('wrapup.notesSaved'), 'success')
  }

  if (failed) return (
    <AppShell>
      <div style={{ maxWidth: '420px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{t('wrapup.title')}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('wrapup.noAccess')}</p>
        <Link to={`/gig/${id}`} style={{ ...btnPrimary, textDecoration: 'none' }}><ArrowLeft size={14} /> {t('wrapup.backToGig')}</Link>
      </div>
    </AppShell>
  )
  if (!data) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} label={t('common.loading')} /></div></AppShell>

  const { gig, can, hours: h, people, money } = data
  const status = gigStatusLabel(gig, t, labels.statuses)
  const v = hoursVariance(h?.hours_planned, h?.hours_approved)
  const hrs = n => hoursText(n, lang)
  const eur = n => formatMoney(Number(n) || 0, 'EUR', lang)
  const dates = gig.start_date ? `${fmt(gig.start_date, 'd MMM yyyy')}${gig.end_date && gig.end_date !== gig.start_date ? ` – ${fmt(gig.end_date, 'd MMM yyyy')}` : ''}` : t('wrapup.noDate')
  const anyWaiting = (people || []).some(p => Number(p.hours_waiting) > 0)
  const cols = ['person', 'function', 'days', 'planned', 'approved', ...(anyWaiting ? ['waiting'] : [])]
  const equipmentEmpty = !data.damaged?.length && !data.lost?.length && !data.not_back?.length && !data.repairs?.length

  return (
    <AppShell>
      <PrintStyles />
      <div style={{ maxWidth: '820px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to={`/gig/${id}`} style={{ ...btn, textDecoration: 'none' }}><ArrowLeft size={14} aria-hidden="true" /> {t('wrapup.backToGig')}</Link>
          <span style={{ flex: '1 1 auto' }} />
          <button type="button" onClick={() => window.print()} style={btn}><Printer size={14} aria-hidden="true" /> {t('reports.print')}</button>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{t('wrapup.titleFor', { gig: gig.name })}</h1>
            <span className="no-print"><PageHelp page="gig-wrapup" /></span>
          </div>
          <p style={{ fontSize: '13px', color: colors.muted, marginTop: '2px' }}>
            {dates}{gig.venue ? ` · ${gig.venue}` : ''} · <span style={labelStyle(status.colour)}>{status.name}</span>
          </p>
          {!gig.ended && <p role="status" style={{ ...small, color: 'var(--warn)', marginTop: '6px' }}>{t('wrapup.notEnded')}</p>}
        </div>

        <section aria-labelledby="wu-hours" style={section}>
          <h2 id="wu-hours" style={h2}>{t('wrapup.hours')}</h2>
          <div style={row}><span>{t('wrapup.crew')}</span><strong>{t('wrapup.peopleDays', { count: Number(h?.people) || 0, days: Number(h?.days_planned) || 0 })}</strong></div>
          <div style={row}><span>{t('wrapup.hoursPlanned')}</span><strong>{hrs(v.planned)}</strong></div>
          <div style={row}><span>{t('wrapup.hoursApproved')}</span><strong>{hrs(v.approved)}</strong></div>
          <div style={row}><span>{t('wrapup.difference')}</span>
            <strong>{v.diff === 0 ? t('wrapup.asPlanned') : t(v.diff > 0 ? 'wrapup.more' : 'wrapup.less', { hours: hrs(Math.abs(v.diff)) })}</strong></div>
          {(Number(h?.overtime) > 0 || Number(h?.night) > 0 || Number(h?.weekend) > 0 || Number(h?.holiday) > 0) && (
            <p style={small}>{t('wrapup.extraHours', { overtime: hrs(h.overtime), night: hrs(h.night), weekend: hrs(h.weekend), holiday: hrs(h.holiday) })}</p>
          )}
          {Number(h?.hours_waiting) > 0 && <p style={{ ...small, color: 'var(--warn)' }}>{t('wrapup.waiting', { hours: hrs(h.hours_waiting) })}</p>}
          {Number(h?.days_returned) > 0 && <p style={{ ...small, color: 'var(--warn)' }}>{t('wrapup.returned', { count: Number(h.days_returned) })}</p>}
          {people && people.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <caption style={{ textAlign: 'left', fontSize: '13px', color: colors.muted, padding: '4px 0' }}>{t('wrapup.perPerson')}</caption>
                <thead>
                  <tr>
                    {cols.map((k, i) => (
                      <th key={k} scope="col" style={{ textAlign: i < 2 ? 'left' : 'right', padding: '4px 6px', fontSize: '11px', color: colors.muted, borderBottom: `1px solid ${colors.border}` }}>{t(`wrapup.col.${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {people.map(p => (
                    <tr key={p.user_id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '4px 6px' }}>{p.full_name || t('ops.unnamed')}</td>
                      <td style={{ padding: '4px 6px' }}>{p.function_title || '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{p.days}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{hrs(p.hours_planned)}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{hrs(p.hours_approved)}</td>
                      {anyWaiting && <td style={{ padding: '4px 6px', textAlign: 'right' }}>{hrs(p.hours_waiting)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={small}>{t('wrapup.howHours')}</p>
        </section>

        {can?.money && money && (
          <section aria-labelledby="wu-money" style={section}>
            <h2 id="wu-money" style={h2}>{t('wrapup.money')}</h2>
            <div style={row}><span>{t('finance.revenue')}</span><strong>{money.revenue_source === 'none' ? t('finance.noQuoteShort') : `${eur(money.revenue)}${money.revenue_source === 'estimate' ? ` (${t('finance.estimate')})` : ''}`}</strong></div>
            <div style={row}><span>{t('wrapup.labourPlanned')}</span><strong>{eur(money.labour_planned)}</strong></div>
            <div style={row}><span>{t('wrapup.labourActual')}</span><strong>{money.labour_actual == null ? '—' : eur(money.labour_actual)}</strong></div>
            <div style={row}><span>{t('finance.subrentals')}</span><strong>{eur(money.subrentals)}</strong></div>
            <div style={row}><span>{t('finance.repairs')}</span><strong>{eur(money.repairs)}</strong></div>
            <div style={row}><span>{t('finance.otherCosts')}</span><strong>{eur(money.other_costs)}</strong></div>
            <div style={row}><span>{t('finance.cost')}</span><strong>{eur(money.cost)}</strong></div>
            <div style={{ ...row, borderBottom: 'none' }}><span>{t('finance.margin')}</span>
              <strong style={{ color: money.revenue_source !== 'none' && Number(money.margin) < 0 ? colors.danger : 'var(--text)' }}>{eur(money.margin)}</strong></div>
            {Number(money.estimated_cost) > 0 && <p style={{ ...small, color: 'var(--warn)' }}>{t('finance.estimatedShare', { amount: eur(money.estimated_cost) })}</p>}
            <p style={small}>{t('wrapup.howMoney')}</p>
          </section>
        )}

        <section aria-labelledby="wu-gear" style={section}>
          <h2 id="wu-gear" style={h2}>{t('wrapup.equipment')}</h2>
          {equipmentEmpty && <p style={small}>{t('wrapup.equipmentNone')}</p>}
          {data.damaged?.length > 0 && <>
            <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0 0' }}>{t('wrapup.damaged')}</h3>
            <ul style={list}>{data.damaged.map((d, i) => <li key={i}>{d.quantity} × {d.item_name}{d.unit_code ? ` (${d.unit_code})` : ''}{d.note ? ` · ${d.note}` : ''}</li>)}</ul>
          </>}
          {data.repairs?.length > 0 && <>
            <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0 0' }}>{t('wrapup.repairs')}</h3>
            <ul style={list}>{data.repairs.map(r => (
              <li key={r.id}>{r.quantity} × {r.item_name} · {r.problem} · {t(`repair.status.${r.status}`)}{r.charge_client ? ` · ${t('wrapup.charged')}` : ''}{r.cost != null ? ` · ${eur(r.cost)}` : ''}</li>
            ))}</ul>
          </>}
          {data.lost?.length > 0 && <>
            <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0 0' }}>{t('wrapup.lost')}</h3>
            <ul style={list}>{data.lost.map(u => <li key={u.unit_id}>{u.item_name} · {u.code}{u.serial ? ` · ${u.serial}` : ''}</li>)}</ul>
          </>}
          {data.not_back?.length > 0 && <>
            <h3 style={{ fontSize: '13px', fontWeight: 700, margin: '4px 0 0' }}>{t('wrapup.notBack')}</h3>
            <ul style={list}>{data.not_back.map(n => <li key={n.item_id}>{t('wrapup.notBackLine', { item: n.item_name, missing: n.missing, out: n.out })}</li>)}</ul>
            <Link className="no-print" to={`/gig/${id}/scan`} style={{ fontSize: '13px', color: colors.accentText }}>{t('wrapup.openScan')}</Link>
          </>}
        </section>

        <section aria-labelledby="wu-tasks" style={section}>
          <h2 id="wu-tasks" style={h2}>{t('wrapup.tasks')}</h2>
          <p style={small}>{t('wrapup.tasksCount', { open: Number(data.tasks?.open) || 0, done: Number(data.tasks?.done) || 0 })}</p>
          {data.tasks?.items?.length > 0 && (
            <ul style={list}>{data.tasks.items.map(tk => (
              <li key={tk.id}>{tk.title}{tk.assignee ? ` · ${tk.assignee}` : ''}{tk.due_on ? ` · ${fmt(tk.due_on, 'd MMM')}` : ''}
                {tk.overdue && <strong style={{ color: colors.danger }}> · {t('wrapup.overdue')}</strong>}</li>
            ))}</ul>
          )}
          <Link className="no-print" to={`/gig/${id}?tab=tasks`} style={{ fontSize: '13px', color: colors.accentText }}>{t('wrapup.openTasks')}</Link>
        </section>

        <section aria-labelledby="wu-notes" style={section}>
          <h2 id="wu-notes" style={h2}>{t('wrapup.notes')}</h2>
          {can?.manage ? (
            <form onSubmit={saveNotes} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label htmlFor="wu-notes-text" style={small}>{t('wrapup.notesHint')}</label>
              <textarea id="wu-notes-text" value={notes} onChange={e => setNotes(e.target.value)} maxLength={4000} rows={5} style={{ ...input, resize: 'vertical' }} />
              <div className="no-print">
                <button type="submit" disabled={saving || notes.trim() === (gig.wrapup_notes || '')} style={btnPrimary}><Save size={14} aria-hidden="true" /> {t('wrapup.saveNotes')}</button>
              </div>
            </form>
          ) : (
            <p style={{ fontSize: '13px', whiteSpace: 'pre-wrap', margin: 0 }}>{gig.wrapup_notes || t('wrapup.noNotes')}</p>
          )}
        </section>
      </div>
    </AppShell>
  )
}

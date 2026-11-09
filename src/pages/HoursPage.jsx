import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { logger } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { HOURS_COLUMNS, HOURS_QUEUE_CHANGED, readQueuedHours, downloadHoursCsv } from '../lib/hours'
import { totals } from '../lib/timeRegistration'
import { useI18n, fmt } from '../i18n'
import { btnPrimary, input, label, colors, AvxLoader, PageHeader, Stack, space } from '../components/ui'
import { pageWrap, rowList, row, rowButton } from '../components/ListParts'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import { DayLine, SplitLine, StatusChip, hoursText, money } from '../components/hours/HoursParts'

const thisMonth = () => fmt(new Date(), 'yyyy-MM')
const monthRange = m => {
  const [y, mo] = m.split('-').map(Number)
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  return [`${m}-01`, `${next}-01`]
}

// Time registration (step 8), per month:
//   /me/hours            your own hours on every gig
//   /org/:orgId/hours    the organisation's, per person (admins)
export default function HoursPage() {
  const { orgId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t, lang } = useI18n()
  const { roleIn, loading, setWorkspace } = useWorkspace()
  const isOrg = !!orgId
  const role = isOrg ? roleIn(orgId) : null
  const [month, setMonth] = useState(thisMonth())
  const [entries, setEntries] = useState(null)
  const [names, setNames] = useState({})
  const [open, setOpen] = useState(null)
  const [queued, setQueued] = useState(() => readQueuedHours(user.id))
  useEffect(() => { setWorkspace(isOrg ? orgId : 'me') }, [isOrg, orgId, setWorkspace])

  const load = useCallback(async () => {
    if (isOrg && role !== 'admin') return
    const [from, until] = monthRange(month)
    let q = supabase.from('time_entries').select(`${HOURS_COLUMNS}, gigs(name)`).is('removed_at', null)
      .gte('work_date', from).lt('work_date', until).order('work_date').limit(5000)
    q = isOrg ? q.eq('org_id', orgId) : q.eq('user_id', user.id)
    const { data, error } = await q
    if (error) logger.error('hours', error, { step: isOrg ? 'org' : 'mine' })
    const list = (data || []).map(e => ({ ...e, gig_name: e.gigs?.name || '' }))
    setEntries(list)
    if (isOrg) {
      const ids = [...new Set(list.map(e => e.user_id))]
      const { data: people } = ids.length ? await supabase.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
      setNames(Object.fromEntries((people || []).map(p => [p.id, p.full_name || '—'])))
    }
  }, [isOrg, role, orgId, month, user.id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onQueue = () => { setQueued(readQueuedHours(user.id)); load() }
    window.addEventListener(HOURS_QUEUE_CHANGED, onQueue)
    return () => window.removeEventListener(HOURS_QUEUE_CHANGED, onQueue)
  }, [user.id, load])

  const people = useMemo(() => {
    if (!isOrg || !entries) return []
    const ids = [...new Set(entries.map(e => e.user_id))]
    return ids.map(id => {
      const days = entries.filter(e => e.user_id === id)
      return { id, name: names[id] || '…', days, sum: totals(days), waiting: days.filter(d => d.status === 'submitted').length }
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [isOrg, entries, names])

  const title = isOrg ? t('hours.orgTitle') : t('hours.pageTitle')
  if (isOrg && loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (isOrg && role !== 'admin') return (
    <AppShell>
      <div style={{ maxWidth: '360px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{title}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('hours.noAccess')}</p>
        <button type="button" onClick={() => navigate('/dashboard')} style={btnPrimary}><ArrowLeft size={14} /> {t('common.backToDashboard')}</button>
      </div>
    </AppShell>
  )

  const all = totals(entries || [])
  const waitingQueue = isOrg ? [] : queued.filter(q => q.work_date?.startsWith(month) && !(entries || []).some(e => e.id === q.id))
  const csv = () => {
    downloadHoursCsv(entries, names, `${t('hours.fileName')} ${month}`)
    track(isOrg ? 'hours:org-csv' : 'hours:my-csv')
  }

  return (
    <AppShell>
      <div style={pageWrap}>
        <PageHeader title={title} help={<PageHelp page={isOrg ? 'org-hours' : 'my-hours'} />}
          secondary={entries?.length > 0 ? [{ label: 'CSV', icon: <Download size={15} aria-hidden="true" />, onClick: csv }] : []} />

        <div style={{ marginBottom: space[5] }}>
          <label htmlFor="hours-month" style={label}>{t('hours.month')}</label>
          <input id="hours-month" type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)} style={{ ...input, width: 'auto' }} />
        </div>

        {!entries ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: space[6] }}><AvxLoader size={22} color={colors.accentText} /></div>
        ) : entries.length === 0 && waitingQueue.length === 0 ? (
          <EmptyState icon={<Clock size={28} />} title={t('hours.monthEmptyTitle')} body={isOrg ? t('hours.orgEmptyBody') : t('hours.myEmptyBody')} guide="crew-hours" />
        ) : (
          <Stack gap={4}>
            <p style={{ fontSize: '14px', margin: 0, display: 'flex', gap: `${space[1]} ${space[4]}`, flexWrap: 'wrap' }}>
              <span>{t('hours.total')}: <strong>{hoursText(all.worked, lang)}</strong></span>
              {['overtime', 'night', 'weekend', 'holiday'].filter(b => all[b] > 0).map(b => <span key={b} style={{ color: colors.muted }}>{t(`hours.bucket.${b}`)} {hoursText(all[b], lang)}</span>)}
              {all.travel > 0 && <span style={{ color: colors.muted }}>{t('hours.travel')} {hoursText(all.travel, lang)}</span>}
              {all.km > 0 && <span style={{ color: colors.muted }}>{all.km.toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')} km</span>}
              {all.cost > 0 && <span>{isOrg ? t('hours.approvedCost') : t('hours.approvedPay')}: <strong>{money(all.cost, lang)}</strong></span>}
            </p>
            {isOrg ? (
              <ul style={rowList}>
                {people.map(p => (
                  <li key={p.id} style={{ borderBottom: `1px solid ${colors.line}` }}>
                    <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}
                      style={{ ...rowButton, borderBottom: 'none', flexWrap: 'wrap', gap: space[2] }}>
                      {open === p.id ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                      <span style={{ fontWeight: 700, flex: '1 1 140px', minWidth: 0 }}>{p.name}</span>
                      <span>{t('hours.daysCount', { count: p.days.length })} · <strong>{hoursText(p.sum.worked, lang)}</strong></span>
                      {p.sum.overtime > 0 && <span style={{ color: colors.muted }}>{t('hours.bucket.overtime')} {hoursText(p.sum.overtime, lang)}</span>}
                      {p.sum.cost > 0 && <strong>{money(p.sum.cost, lang)}</strong>}
                      {p.waiting > 0 && <span style={{ color: colors.warn, fontSize: '13px', fontWeight: 700 }}>{t('hours.waitingCount', { count: p.waiting })}</span>}
                    </button>
                    {open === p.id && <div style={{ padding: `0 0 ${space[3]} ${space[6]}` }}><DayList days={p.days} showCost /></div>}
                  </li>
                ))}
              </ul>
            ) : (
              <DayList days={[...waitingQueue.map(q => ({ ...q, status: 'queued' })), ...entries]} showCost rows />
            )}
          </Stack>
        )}
      </div>
    </AppShell>
  )
}

// rows: a page list with hairlines; otherwise the days under a person, spaced
function DayList({ days, showCost, rows }) {
  const { t } = useI18n()
  return (
    <ul style={rows ? rowList : { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {days.map(e => (
        <li key={e.id} style={rows ? { ...row, flexWrap: 'wrap', gap: space[2], fontSize: '14px' } : { display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap', fontSize: '14px' }}>
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>
            <DayLine entry={e} />
            <span style={{ display: 'block', fontSize: '13px' }}>
              <Link to={`/gig/${e.gig_id}?tab=crew`} style={{ color: colors.accentText }}>{e.gig_name}</Link>
            </span>
            {e.status === 'approved' && <SplitLine split={e.split} cost={showCost ? e.cost : null} />}
            {e.status === 'returned' && e.review_note && <span style={{ display: 'block', fontSize: '13px', color: colors.danger }}>{t('hours.returnedNote', { note: e.review_note })}</span>}
          </span>
          <StatusChip status={e.status} />
        </li>
      ))}
    </ul>
  )
}

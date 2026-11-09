import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Users, Briefcase, ListTodo } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { retryOnce } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { periodRange, comparisonRange, change, monthsOf, todayIn, periodKey, comparisonKey } from '../../lib/analytics/periods'
import {
  OPS_VIEWS, ACTIVITY_GROUPS, statusKeyOf, typeKeyOf, stackByMonth, sumField, leadBars, share, hoursVariance,
  hoursText, pctText, durationParts, positionsByMonth, answerRows, onTimeShare, leaveText,
} from '../../lib/analytics/ops'
import { useI18n } from '../../i18n'
import { btn, colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { NumberTile, BarChart, StackedBarChart } from './Charts'
import { PeriodBar, GroupBy, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

const FUNCTIONS = { activity: 'ops_activity', people: 'ops_people', staffing: 'ops_staffing', tasks: 'ops_tasks' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }
const note = { fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }
const h3 = { fontSize: '14px', fontWeight: 700, margin: '6px 0 0' }

// Reports → Operations (K7): activity, people, staffing and tasks, counted in the database
// (public.ops_*). The whole period counts, days still to come included (bookings and positions are
// planned ahead); the comparison is the previous period, or the same one last year, in full.
// Per-person rows (people and tasks) come back for admins only (the owner's choice).
export default function OperationsReport({ orgId, timeZone, labels, params, setParam, isAdmin }) {
  const { t, lang, fmt } = useI18n()
  const view = OPS_VIEWS.includes(params.get('view')) ? params.get('view') : 'activity'
  const [details, toggleDetails] = useDetails(`operations-${view}`)
  const period = periodKey(params.get('period'))
  const compare = comparisonKey(params.get('compare'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const groupBy = ACTIVITY_GROUPS.includes(params.get('by')) ? params.get('by') : 'status'
  const today = todayIn(timeZone)
  const range = useMemo(() => {
    const r = periodRange(period, { today, from: custom.from, until: custom.until })
    return r && { ...r, asOf: r.until, partial: false }
  }, [period, today, custom.from, custom.until])
  const compared = useMemo(() => comparisonRange(range, compare), [range, compare])
  const [data, setData] = useState(null)
  const [sort, setSort] = useState({ key: 'days', dir: -1 })

  useEffect(() => {
    if (!range) return
    let cancelled = false
    setData(null)
    const fn = FUNCTIONS[view]
    const call = r => retryOnce(() => supabase.rpc(fn, { p_org: orgId, p_from: r.from, p_until: r.until }))
    const withPrev = view === 'activity' || view === 'people'
    Promise.all([call(range), withPrev ? call(compared) : Promise.resolve({ data: null })]).then(([cur, prev]) => {
      if (cancelled) return
      const error = cur.error || prev.error
      if (error) logger.error('reports', error, { step: `operations:${view}` })
      // People reads at most 400 days (the leave rules' limit): say so rather than fail silently
      setData({ cur: cur.data, prev: prev.data, failed: !!error, tooLong: error?.code === '22023' })
    })
    return () => { cancelled = true }
  }, [orgId, view, range, compared])

  // One change to the address at a time: setSearchParams builds each update from the address as it
  // was when the page drew, so two calls in a row keep only the last (`by` is only read by Activity)
  const setView = v => setParam('view', v === 'activity' ? null : v)
  const compareLabel = t(`reports.compareShort.${compare}`)
  const months = monthsOf(range)
  const monthLabel = key => fmt(`${key}-01`, months.length > 6 ? 'MMM' : 'MMM yy')
  const statusLabel = key => {
    if (key.startsWith('own:')) return labels.statuses.find(s => `own:${s.id}` === key)?.name || t('ops.otherStatus')
    return t(`status.${key.slice(5)}`)
  }
  const typeLabel = key => (key === 'type:none' ? t('ops.noType') : labels.types.find(x => `type:${x.id}` === key)?.name || t('ops.noType'))
  const num = v => (Number(v) || 0).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')
  const hours = v => hoursText(v, lang)
  const pct = v => pctText(v, lang)
  const duration = h => {
    const d = durationParts(h)
    return d ? t(`ops.duration.${d.unit}`, { n: d.value.toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB') }) : '—'
  }

  let body = null
  if (!range) body = null
  else if (!data) body = <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
  else if (data.tooLong) body = <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('ops.tooLong')}</p>
  else if (data.failed) body = <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
  else if (view === 'activity') body = activityView()
  else if (view === 'people') body = peopleView()
  else if (view === 'staffing') body = staffingView()
  else body = tasksView()

  function activityView() {
    const cur = data.cur || {}
    const prev = data.prev || {}
    const gigs = sumField(cur.gigs, 'gigs')
    const days = sumField(cur.days, 'gig_days')
    const keyOf = groupBy === 'type' ? typeKeyOf : statusKeyOf
    const labelOf = groupBy === 'type' ? typeLabel : statusLabel
    const byMonth = stackByMonth(cur.gigs, months, 'gigs', keyOf, labelOf)
    const daysByMonth = stackByMonth(cur.days, months, 'gig_days', keyOf, labelOf)
    const busiest = (cur.busiest || []).map(b => ({ ...b, id: b.day }))
    const lead = cur.lead || {}
    if (!gigs) return <EmptyState compact icon={<CalendarDays size={26} />} title={t('ops.emptyActivity')} body={t('ops.emptyActivityBody')} guide="pm-operations" />
    return (
      <>
        <div style={grid}>
          <NumberTile label={t('ops.gigs')} value={num(gigs)} change={change(gigs, sumField(prev.gigs, 'gigs'))} compareLabel={compareLabel} />
          <NumberTile label={t('ops.gigDays')} value={num(days)} change={change(days, sumField(prev.days, 'gig_days'))} compareLabel={compareLabel} />
          <NumberTile label={t('ops.cancelled')} value={num(cur.cancelled)} sub={t('ops.ofGigs', { count: gigs })} />
          <NumberTile label={t('ops.leadMedian')} value={lead.median_days == null ? '—' : t('ops.duration.days', { n: num(Math.round(lead.median_days)) })}
            sub={t('ops.leadSub', { count: Number(lead.gigs) || 0 })} />
        </div>
        <StackedBarChart title={t(`ops.chart.gigsBy.${groupBy}`)} format={num}
          data={byMonth.data.map(d => ({ label: monthLabel(d.key), values: d.values }))} series={byMonth.series} />
        {toolbar(() => downloadCsv(`${t('ops.csvName.activity')} ${range.from}`, cur.gigs || [], [
          { key: 'month', label: t('ops.col.month'), value: r => r.month },
          { key: 'status', label: t('reports.filter.status'), value: r => statusLabel(statusKeyOf(r)) },
          { key: 'type', label: t('reports.filter.type'), value: r => typeLabel(typeKeyOf(r)) },
          { key: 'gigs', label: t('ops.gigs'), value: r => r.gigs },
        ], 'csv:reports:operations'))}
        {details && (
          <>
            <GroupBy value={groupBy} options={ACTIVITY_GROUPS} onChange={v => setParam('by', v === 'status' ? null : v)} />
            <StackedBarChart title={t(`ops.chart.daysBy.${groupBy}`)} format={num}
              data={daysByMonth.data.map(d => ({ label: monthLabel(d.key), values: d.values }))} series={daysByMonth.series} />
            <BarChart title={t('ops.chart.lead')} format={num} valueLabel={t('ops.gigs')}
              data={leadBars(lead).map(b => ({ label: t(`ops.lead.${b.key}`), value: b.value }))} />
            <ReportTable caption={t('ops.busiest')} sort={{ key: 'gigs', dir: -1 }} onSort={() => {}} empty={t('ops.emptyActivity')} rows={busiest}
              columns={[
                { key: 'day', label: t('ops.col.day'), left: true, value: r => r.day, show: r => fmt(r.day, 'EEE d MMM yyyy') },
                { key: 'gigs', label: t('ops.gigs'), value: r => r.gigs },
                { key: 'crew', label: t('ops.col.crewBooked'), value: r => r.crew },
              ]} />
          </>
        )}
        <p style={note}>{t('ops.howActivity')}</p>
      </>
    )
  }

  function peopleView() {
    const tot = data.cur?.totals || {}
    const prevTot = data.prev?.totals || {}
    const v = hoursVariance(tot.hours_planned, tot.hours_approved)
    const persons = data.cur?.persons
    if (!Number(tot.crew_days) && !Number(tot.hours_approved) && !Number(tot.hours_waiting)) {
      return <EmptyState compact icon={<Users size={26} />} title={t('ops.emptyPeople')} body={t('ops.emptyPeopleBody')} guide="pm-operations" />
    }
    const columns = [
      { key: 'name', label: t('ops.col.person'), left: true, value: r => r.full_name || '',
        show: r => <Link to={`/org/${orgId}/people/${r.user_id}`} style={{ color: 'var(--text)' }}>{r.full_name || t('ops.unnamed')}</Link> },
      { key: 'kind', label: t('ops.col.kind'), left: true, value: r => (r.staff ? t('ops.staff') : t('ops.freelance')) },
      { key: 'days', label: t('ops.crewDays'), value: r => Number(r.days) },
      { key: 'planned', label: t('ops.col.planned'), value: r => Number(r.hours_planned), show: r => hours(r.hours_planned) },
      { key: 'approved', label: t('ops.col.approved'), value: r => Number(r.hours_approved), show: r => hours(r.hours_approved) },
      { key: 'overtime', label: t('ops.overtime'), value: r => Number(r.overtime), show: r => hours(r.overtime) },
      { key: 'night', label: t('ops.night'), value: r => Number(r.night), show: r => hours(r.night) },
      { key: 'weekend', label: t('ops.weekend'), value: r => Number(r.weekend), show: r => hours(r.weekend) },
      { key: 'holiday', label: t('ops.holiday'), value: r => Number(r.holiday), show: r => hours(r.holiday) },
      { key: 'waiting', label: t('ops.col.waiting'), value: r => Number(r.hours_waiting), show: r => hours(r.hours_waiting) },
      { key: 'utilisation', label: t('ops.utilisation'), value: r => (r.utilisation == null ? -1 : Number(r.utilisation)), show: r => pct(r.utilisation) },
      { key: 'leave', label: t('ops.col.leave'), left: true, value: r => leaveText(r.leave, k => t(`leave.type.${k}`)) },
      { key: 'left', label: t('ops.col.leaveLeft'), value: r => (r.leave_left == null ? -1 : Number(r.leave_left)), show: r => (r.leave_left == null ? '—' : num(r.leave_left)) },
    ]
    return (
      <>
        <div style={grid}>
          <NumberTile label={t('ops.crewDays')} value={num(tot.crew_days)} change={change(tot.crew_days, prevTot.crew_days)} compareLabel={compareLabel}
            sub={t('ops.freelanceShare', { pct: pct(share(tot.crew_days_freelance, tot.crew_days)) })} />
          <NumberTile label={t('ops.hoursApproved')} value={hours(tot.hours_approved)} change={change(tot.hours_approved, prevTot.hours_approved)} compareLabel={compareLabel}
            sub={t('ops.ofPlanned', { hours: hours(v.planned) })} />
          <NumberTile label={t('ops.hoursWaiting')} value={hours(tot.hours_waiting)} sub={t('ops.daysWaiting', { count: Number(tot.days_waiting) || 0 })} />
          <NumberTile label={t('ops.approvalTime')} value={duration(tot.approval_hours)} />
        </div>
        <BarChart title={t('ops.chart.extraHours')} format={hours} valueLabel={t('ops.col.hours')}
          data={['overtime', 'night', 'weekend', 'holiday'].map(k => ({ label: t(`ops.${k}`), value: Number(tot[k]) || 0 }))} />
        {toolbar(persons ? () => downloadCsv(`${t('ops.csvName.people')} ${range.from}`, persons, columns.map(c => ({ ...c, csv: c.value })), 'csv:reports:operations') : null)}
        {details && (persons
          ? <ReportTable caption={t('ops.perPerson')} columns={columns} rows={persons.map(r => ({ ...r, id: r.user_id }))} sort={sort} onSort={setSort} empty={t('ops.emptyPeople')} />
          : <p style={note}>{t('ops.adminsOnly')}</p>)}
        <p style={note}>{t('ops.howPeople')}</p>
      </>
    )
  }

  function staffingView() {
    const cur = data.cur || {}
    const pos = cur.positions || {}
    const fill = cur.time_to_fill || {}
    const calls = cur.calls || {}
    const posts = cur.posts || {}
    const byMonth = positionsByMonth(cur.gigs, months)
    if (!Number(pos.needed) && !Number(calls.calls) && !Number(posts.posts)) {
      return <EmptyState compact icon={<Briefcase size={26} />} title={t('ops.emptyStaffing')} body={t('ops.emptyStaffingBody')} guide="pm-operations" />
    }
    const gigCols = [
      { key: 'gig', label: t('reports.group.gig'), left: true, value: r => r.name || '', show: r => <Link to={`/gig/${r.gig_id}?tab=crew`} style={{ color: 'var(--text)' }}>{r.name}</Link> },
      { key: 'start', label: t('finance.col.start'), left: true, value: r => r.start_date || '', show: r => fmt(r.start_date, 'd MMM yyyy') },
      { key: 'needed', label: t('ops.col.needed'), value: r => Number(r.needed) },
      { key: 'filled', label: t('ops.col.filled'), value: r => Number(r.filled) },
      { key: 'open', label: t('ops.col.open'), value: r => Number(r.open), show: r => <span style={{ color: Number(r.open) ? 'var(--warn)' : 'var(--text)', fontWeight: Number(r.open) ? 700 : 400 }}>{num(r.open)}</span> },
    ]
    return (
      <>
        <div style={grid}>
          <NumberTile label={t('ops.positionsOpen')} value={num(pos.open)} sub={t('ops.ofNeeded', { count: Number(pos.needed) || 0, gigs: Number(pos.gigs_open) || 0 })} />
          <NumberTile label={t('ops.timeToFill')} value={duration(fill.median_hours)} sub={t('ops.timeToFillSub', { count: Number(fill.count) || 0 })} />
          <NumberTile label={t('ops.callsAccepted')} value={pct(share(calls.accepted, calls.invited))} sub={t('ops.callsSub', { count: Number(calls.calls) || 0, people: Number(calls.invited) || 0 })} />
          <NumberTile label={t('ops.posts')} value={num(posts.posts)} sub={t('ops.postsSub', { filled: Number(posts.filled) || 0, count: Number(posts.applications) || 0 })} />
        </div>
        <StackedBarChart title={t('ops.chart.positions')} format={num}
          data={byMonth.map(d => ({ label: monthLabel(d.key), values: d.values }))}
          series={[{ key: 'filled', label: t('ops.col.filled') }, { key: 'open', label: t('ops.col.open') }]} />
        {toolbar(() => downloadCsv(`${t('ops.csvName.staffing')} ${range.from}`, cur.gigs || [], gigCols.map(c => ({ ...c, csv: c.value })), 'csv:reports:operations'))}
        {details && (
          <>
            <ReportTable caption={t('ops.positionsByGig')} columns={gigCols} rows={(cur.gigs || []).map(r => ({ ...r, id: r.gig_id }))}
              sort={sort.key in { gig: 1, start: 1, needed: 1, filled: 1, open: 1 } ? sort : { key: 'start', dir: 1 }} onSort={setSort} empty={t('ops.emptyStaffing')} />
            <h3 style={h3}>{t('ops.callAnswers')}</h3>
            <ReportTable sort={{ key: 'n', dir: -1 }} onSort={() => {}} empty={t('ops.noCalls')}
              rows={Number(calls.invited) ? answerRows(calls).map(r => ({ ...r, id: r.key })) : []}
              columns={[
                { key: 'answer', label: t('ops.col.answer'), left: true, value: r => t(`ops.answer.${r.key}`) },
                { key: 'n', label: t('ops.col.people'), value: r => r.value },
                { key: 'share', label: t('ops.col.share'), value: r => r.share ?? 0, show: r => pct(r.share) },
              ]} />
            <p style={note}>{t('ops.answerTime', { time: duration(calls.median_answer_hours) })}</p>
            <p style={note}>{t('ops.postsDetail', { open: Number(posts.open) || 0, filled: Number(posts.filled) || 0, closed: Number(posts.closed) || 0, accepted: Number(posts.accepted) || 0 })}</p>
          </>
        )}
        <p style={note}>{t('ops.howStaffing')}</p>
      </>
    )
  }

  function tasksView() {
    const cur = data.cur || {}
    const tot = cur.totals || {}
    if (!Number(tot.open) && !Number(tot.done)) {
      return <EmptyState compact icon={<ListTodo size={26} />} title={t('ops.emptyTasks')} body={t('ops.emptyTasksBody')} guide="pm-operations" />
    }
    const counts = [
      { key: 'open', label: t('ops.col.open'), value: r => Number(r.open) },
      { key: 'overdue', label: t('ops.overdue'), value: r => Number(r.overdue),
        show: r => <span style={{ color: Number(r.overdue) ? colors.danger : 'var(--text)', fontWeight: Number(r.overdue) ? 700 : 400 }}>{num(r.overdue)}</span> },
      { key: 'done', label: t('ops.done'), value: r => Number(r.done) },
      { key: 'on_time', label: t('ops.onTime'), value: r => Number(r.on_time) },
      { key: 'late', label: t('ops.late'), value: r => Number(r.late) },
    ]
    const gigCols = [
      { key: 'gig', label: t('reports.group.gig'), left: true, value: r => r.name || '',
        show: r => (r.gig_id ? <Link to={`/gig/${r.gig_id}?tab=tasks`} style={{ color: 'var(--text)' }}>{r.name}</Link> : <Link to={`/org/${orgId}/tasks`} style={{ color: 'var(--text)' }}>{t('ops.orgTasks')}</Link>) },
      ...counts,
    ]
    const personCols = [
      { key: 'person', label: t('ops.col.person'), left: true, value: r => r.full_name || '',
        show: r => (r.user_id ? <Link to={`/org/${orgId}/people/${r.user_id}`} style={{ color: 'var(--text)' }}>{r.full_name || t('ops.unnamed')}</Link> : t('ops.nobody')) },
      ...counts,
    ]
    const top = (cur.by_gig || []).filter(r => Number(r.open)).slice(0, 10)
    const taskSort = sort.key in { open: 1, overdue: 1, done: 1, on_time: 1, late: 1, gig: 1, person: 1 } ? sort : { key: 'overdue', dir: -1 }
    return (
      <>
        <div style={grid}>
          <NumberTile label={t('ops.openTasks')} value={num(tot.open)} />
          <NumberTile label={t('ops.overdue')} value={num(tot.overdue)} />
          <NumberTile label={t('ops.doneInPeriod')} value={num(tot.done)} />
          <NumberTile label={t('ops.onTimeShare')} value={pct(onTimeShare(tot))} sub={t('ops.onTimeSub', { onTime: Number(tot.on_time) || 0, late: Number(tot.late) || 0 })} />
        </div>
        {top.length > 0 && <BarChart title={t('ops.chart.openByGig')} format={num} valueLabel={t('ops.col.open')}
          data={top.map(r => ({ label: r.name || t('ops.orgTasks'), value: Number(r.open) }))} />}
        {toolbar(() => downloadCsv(`${t('ops.csvName.tasks')} ${range.from}`, cur.by_gig || [], gigCols.map(c => ({ ...c, csv: r => (c.key === 'gig' ? r.name || t('ops.orgTasks') : c.value(r)) })), 'csv:reports:operations'))}
        {details && (
          <>
            <ReportTable caption={t('ops.tasksByGig')} columns={gigCols} rows={(cur.by_gig || []).map(r => ({ ...r, id: r.gig_id || 'org' }))} sort={taskSort} onSort={setSort} empty={t('ops.emptyTasks')} />
            {cur.by_person
              ? <ReportTable caption={t('ops.tasksByPerson')} columns={personCols} rows={cur.by_person.map(r => ({ ...r, id: r.user_id || 'nobody' }))} sort={taskSort} onSort={setSort} empty={t('ops.emptyTasks')} />
              : <p style={note}>{t('ops.adminsOnly')}</p>}
          </>
        )}
        <p style={note}>{t('ops.howTasks', { date: fmt(cur.today || today, 'd MMM yyyy') })}</p>
      </>
    )
  }

  function toolbar(csv) {
    return (
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv || (() => {})} disabled={!csv} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PeriodBar period={period} onPeriod={v => setParam('period', v === 'this_month' ? null : v)} custom={custom}
        onCustom={c => { setParam('from', c.from || null); setParam('until', c.until || null) }}
        compare={compare} onCompare={v => setParam('compare', v === 'previous' ? null : v)} range={range} compared={compared} />
      <div className="no-print" role="group" aria-label={t('ops.views')} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {OPS_VIEWS.map(v => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            style={{ ...btn, padding: '6px 10px', ...(view === v ? { borderColor: colors.accentText, color: colors.accentText, fontWeight: 700 } : {}) }}>
            {t(`ops.view.${v}`)}
          </button>
        ))}
        <Hint id="operations-report" label={t('reports.tab.operations')} />
      </div>
      {!isAdmin && (view === 'people' || view === 'tasks') && <p style={note}>{t('ops.membersNote')}</p>}
      {body}
    </div>
  )
}

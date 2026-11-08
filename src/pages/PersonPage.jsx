import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { retryOnce } from '../lib/selectAll'
import { logger } from '../lib/logger'
import { useWorkspace } from '../lib/WorkspaceContext'
import { periodRange, todayIn, periodKey } from '../lib/analytics/periods'
import { hoursText, pctText, share, leaveText } from '../lib/analytics/ops'
import { formatMoney } from '../lib/quotes'
import { track } from '../lib/usage'
import { useI18n } from '../i18n'
import { btn, btnPrimary, colors, AvxLoader } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import { NumberTile } from '../components/reports/Charts'
import { PeriodBar, ReportTable, ExportButtons, downloadCsv, PrintStyles } from '../components/reports/ReportParts'

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }
const small = { fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }

// A person's days, hours and cost with the organisation (K7), at /org/:orgId/people/:userId, from
// public.ops_person. Admins only (the owner's choice; docs/DATA_MAP.md): members and everyone else
// get "only admins". Gigs are dated by their start date, like the money reports.
export default function PersonPage() {
  const { orgId, userId } = useParams()
  const [params, setParams] = useSearchParams()
  const { t, lang, fmt } = useI18n()
  const { roleIn, loading, setWorkspace, orgs } = useWorkspace()
  const isAdmin = roleIn(orgId) === 'admin'
  const org = orgs.find(o => o.id === orgId)
  const period = periodKey(params.get('period') || 'this_year')
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const today = todayIn(org?.time_zone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const [data, setData] = useState(null)
  const [sort, setSort] = useState({ key: 'start', dir: 1 })
  useEffect(() => { setWorkspace(orgId) }, [orgId, setWorkspace])

  useEffect(() => {
    if (!isAdmin || !range) return
    let cancelled = false
    setData(null)
    retryOnce(() => supabase.rpc('ops_person', { p_org: orgId, p_user: userId, p_from: range.from, p_until: range.until })).then(({ data: d, error }) => {
      if (cancelled) return
      if (error) logger.error('person', error, { orgId, step: 'ops_person' })
      setData({ d, failed: !!error, missing: error?.code === 'P0002' })
    })
    track('view:people:person')
    return () => { cancelled = true }
  }, [isAdmin, orgId, userId, range])

  // Several keys in one change: setSearchParams builds each update from the address as it was when
  // the page drew, so two calls in a row would keep only the last
  const setParam = changes => setParams(p => {
    const next = new URLSearchParams(p)
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === '') next.delete(key); else next.set(key, value)
    }
    return next
  }, { replace: true })

  if (loading) return <AppShell><div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><AvxLoader size={24} color={colors.accentText} /></div></AppShell>
  if (!isAdmin) return (
    <AppShell>
      <div style={{ maxWidth: '380px', margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>{t('person.title')}</h1>
        <p style={{ color: colors.muted, fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{t('person.adminsOnly')}</p>
        <Link to={`/org/${orgId}`} style={{ ...btnPrimary, textDecoration: 'none' }}><ArrowLeft size={14} /> {t('person.back')}</Link>
      </div>
    </AppShell>
  )

  const p = data?.d
  const tot = p?.totals || {}
  const eur = n => formatMoney(Number(n) || 0, 'EUR', lang)
  const hrs = n => hoursText(n, lang)
  const util = p?.utilisation
  const columns = [
    { key: 'gig', label: t('reports.group.gig'), left: true, value: r => r.name || '', show: r => <Link to={`/gig/${r.gig_id}`} style={{ color: 'var(--text)' }}>{r.name}</Link> },
    { key: 'start', label: t('finance.col.start'), left: true, value: r => r.start_date || '', show: r => (r.start_date ? fmt(r.start_date, 'd MMM yyyy') : '—') },
    { key: 'function', label: t('wrapup.col.function'), left: true, value: r => r.function_title || '' },
    { key: 'days', label: t('ops.crewDays'), value: r => Number(r.days) },
    { key: 'planned', label: t('ops.col.planned'), value: r => Number(r.hours_planned), show: r => hrs(r.hours_planned) },
    { key: 'approved', label: t('ops.col.approved'), value: r => Number(r.hours_approved), show: r => hrs(r.hours_approved) },
    { key: 'cost', label: t('person.cost'), value: r => (r.cost == null ? -1 : Number(r.cost)),
      show: r => (r.cost == null ? t('person.noRate') : `${eur(r.cost)}${r.estimated ? ` (${t('finance.estimate')})` : ''}`) },
  ]

  return (
    <AppShell>
      <PrintStyles />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="no-print">
          <Link to={`/org/${orgId}/reports?tab=operations&view=people`} style={{ ...btn, textDecoration: 'none' }}><ArrowLeft size={14} aria-hidden="true" /> {t('person.toReport')}</Link>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>{p?.full_name || t('person.title')}</h1>
            <span className="no-print"><PageHelp page="org-person" /></span>
          </div>
          {p && (
            <p style={{ fontSize: '13px', color: colors.muted, marginTop: '2px' }}>
              {org?.name ? `${org.name} · ` : ''}{p.staff ? t(`person.role.${p.role}`) : t('ops.freelance')}
              {p.first_gig ? ` · ${t('person.since', { date: fmt(p.first_gig, 'MMM yyyy'), count: Number(p.all_gigs) || 0 })}` : ''}
            </p>
          )}
        </div>
        <PeriodBar period={period} onPeriod={v => setParam({ period: v === 'this_year' ? null : v })} custom={custom}
          onCustom={c => setParam({ from: c.from || null, until: c.until || null })}
          range={range} compared={null} />

        {!range ? null : !data ? (
          <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
        ) : data.missing ? (
          <EmptyState compact icon={<UserRound size={26} />} title={t('person.notFound')} body={t('person.notFoundBody')} />
        ) : data.failed ? (
          <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
        ) : (
          <>
            <div style={grid}>
              <NumberTile label={t('ops.crewDays')} value={String(tot.days ?? 0)} sub={t('person.gigs', { count: Number(tot.gigs) || 0 })} />
              <NumberTile label={t('ops.hoursApproved')} value={hrs(tot.hours_approved)} sub={t('ops.ofPlanned', { hours: hrs(tot.hours_planned) })} />
              <NumberTile label={t('person.cost')} value={eur(tot.cost)} estimate={Number(tot.cost_estimated) > 0}
                sub={Number(tot.cost_estimated) > 0 ? t('finance.estimatedShare', { amount: eur(tot.cost_estimated) }) : null} />
              {util && <NumberTile label={t('ops.utilisation')} value={pctText(share(util.booked_working_days, util.available_days), lang)}
                sub={t('person.utilSub', { booked: Number(util.booked_working_days) || 0, available: Number(util.available_days) || 0 })} />}
            </div>
            {(Number(tot.overtime) > 0 || Number(tot.night) > 0 || Number(tot.weekend) > 0 || Number(tot.holiday) > 0 || Number(tot.hours_waiting) > 0) && (
              <p style={small}>{t('person.extraHours', { overtime: hrs(tot.overtime), night: hrs(tot.night), weekend: hrs(tot.weekend), holiday: hrs(tot.holiday), waiting: hrs(tot.hours_waiting) })}</p>
            )}
            {p.leave && (
              <p style={small}>{t('person.leave', { year: p.year, used: p.leave.used, left: p.leave.left, asked: p.leave.asked })}
                {util?.leave && Object.keys(util.leave).length > 0 ? ` ${t('person.leaveInPeriod', { list: leaveText(util.leave, k => t(`leave.type.${k}`)) })}` : ''}</p>
            )}
            {p.gigs.length === 0 ? (
              <EmptyState compact icon={<UserRound size={26} />} title={t('person.noGigs')} body={t('person.noGigsBody')} />
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <ExportButtons onCsv={() => downloadCsv(`${t('person.csvName')} ${range.from}`, p.gigs, columns.map(c => ({ ...c, csv: c.value })), 'csv:people:person')} />
                </div>
                <ReportTable caption={t('person.gigsTable')} columns={columns} rows={p.gigs.map(r => ({ ...r, id: r.gig_id }))} sort={sort} onSort={setSort} empty={t('person.noGigs')} />
              </>
            )}
            <p style={small}>{t('person.how')}</p>
          </>
        )}
      </div>
    </AppShell>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Wallet, FileText, BadgeCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { track } from '../lib/usage'
import { useWorkspace } from '../lib/WorkspaceContext'
import { MY_WORK } from '../lib/nav'
import { formatMoney } from '../lib/quotes'
import { crewTotals, notYetPaid, byCompany, byMonth, busiestMonths, functionsWorked, hoursAndMinutes } from '../lib/analytics/crewNumbers'
import { useI18n, fmt } from '../i18n'
import { input, label, card, colors, AvxLoader } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp, Hint } from '../components/help/HelpParts'
import { NumberTile, BarChart } from '../components/reports/Charts'
import { useMyGigNumbers } from '../components/mywork/MyNumbersStrip'

const section = { ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }
const h2 = { fontSize: '15px', fontWeight: 700, margin: 0 }
const row = { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '14px', padding: '6px 0', borderTop: `1px solid ${colors.border}` }
const num = { fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }

// My numbers (K8) at /me/numbers?year=YYYY&org=<id>: the person's own work on AVX in a year, per
// company and month. Only their own rows; a company shows only its name. AVX work only (D25).
export default function MyNumbersPage() {
  const { t, lang } = useI18n()
  const { setWorkspace } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const thisYear = new Date().getFullYear()
  const year = /^\d{4}$/.test(params.get('year') || '') ? Number(params.get('year')) : thisYear
  const org = params.get('org') || ''
  const from = `${year}-01-01`
  const until = `${year + 1}-01-01`
  const { rows: all } = useMyGigNumbers({ p_from: from, p_until: until })
  const [activity, setActivity] = useState(null)
  useEffect(() => { setWorkspace(MY_WORK) }, [setWorkspace])
  useEffect(() => { track('view:my-numbers') }, [])
  useEffect(() => {
    let live = true
    supabase.rpc('my_crew_activity', { p_from: from, p_until: until }).then(({ data, error }) => {
      if (error) logger.error('crewNumbers', error, { step: 'activity' })
      if (live) setActivity(data || null)
    })
    return () => { live = false }
  }, [from, until])

  const companies = useMemo(() => byCompany(all || []), [all])
  const rows = useMemo(() => (all || []).filter(r => !org || r.org_id === org), [all, org])
  const sum = crewTotals(rows)
  const unpaid = notYetPaid(rows)
  const months = byMonth(rows)
  const busy = busiestMonths(rows)
  const functions = functionsWorked(rows)
  const travel = hoursAndMinutes(sum.travelMinutes)
  const eur = v => formatMoney(v, 'EUR', lang)
  const set = (k, v) => { const next = new URLSearchParams(params); if (v) next.set(k, v); else next.delete(k); setParams(next, { replace: true }) }
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3]
  const owed = activity?.reimbursements_owed || {}

  return (
    <AppShell>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Link to="/me" style={{ fontSize: '13px', color: colors.muted, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} aria-hidden="true" /> {t('nav.myWork')}
        </Link>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Wallet size={20} color="var(--accent-text)" aria-hidden="true" /> {t('myNumbers.title')} <PageHelp page="my-numbers" />
        </h1>
        <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>{t('myNumbers.intro')}</p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="mn-year" style={label}>{t('myNumbers.year')}</label>
            <select id="mn-year" value={year} onChange={e => set('year', e.target.value === String(thisYear) ? '' : e.target.value)} style={{ ...input, appearance: 'auto', width: 'auto' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 0 }}>
            <label htmlFor="mn-org" style={label}>{t('myNumbers.company')}</label>
            <select id="mn-org" value={org} onChange={e => set('org', e.target.value)} style={{ ...input, appearance: 'auto', width: 'auto', maxWidth: '100%' }}>
              <option value="">{t('myNumbers.allCompanies')}</option>
              {companies.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <Link to={`/me/numbers/statement?year=${year}${org ? `&org=${org}` : ''}`} style={{ fontSize: '13px', color: colors.accentText, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '10px 0' }}>
            <FileText size={14} aria-hidden="true" /> {t('myNumbers.statementLink')}
          </Link>
        </div>

        {!all ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><AvxLoader size={22} color={colors.accentText} /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wallet size={30} color="var(--accent-text)" />} title={t('myNumbers.emptyTitle')} body={t('myNumbers.emptyBody')} guide="crew-numbers" />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
              <NumberTile label={t('myNumbers.earned')} value={eur(sum.earned)} sub={t('myNumbers.gigsCount', { count: sum.gigs })} />
              <NumberTile label={t('myNumbers.tile.notYetPaid')} value={eur(unpaid.amount)} sub={t('myNumbers.tileSub.gigs', { count: unpaid.count })} />
              <NumberTile label={t('myNumbers.upcoming')} value={eur(sum.upcoming)} />
              <NumberTile label={t('myNumbers.days')} value={String(sum.days)} />
              <NumberTile label={t('myNumbers.hours')} value={t('myNumbers.hoursValue', { approved: sum.hoursApproved, waiting: sum.hoursWaiting })}
                sub={t('myNumbers.overtime', { hours: sum.overtime })} />
              <NumberTile label={t('myNumbers.travel')} value={t('myNumbers.km', { km: sum.km })} sub={t('myNumbers.travelTime', travel)} />
            </div>

            <BarChart title={t('myNumbers.earnedByMonth')} valueLabel={t('myNumbers.earned')} format={v => eur(v)}
              data={months.map(m => ({ label: fmt(`${m.key}-01`, 'MMM'), value: m.earned }))} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              <section style={section} aria-labelledby="mn-companies">
                <h2 id="mn-companies" style={h2}>{t('myNumbers.perCompany')}</h2>
                {byCompany(rows).map(c => (
                  <div key={c.key} style={row}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.label}<span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>{t('myNumbers.gigsDays', { gigs: c.gigs, days: c.days })}</span></span>
                    <span style={num}>{eur(c.earned)}</span>
                  </div>
                ))}
              </section>
              <section style={section} aria-labelledby="mn-busy">
                <h2 id="mn-busy" style={h2}>{t('myNumbers.busiest')}</h2>
                {busy.map(m => (
                  <div key={m.key} style={row}><span>{fmt(`${m.key}-01`, 'MMMM yyyy')}</span><span style={num}>{t('myNumbers.daysCount', { count: m.days })}</span></div>
                ))}
              </section>
              <section style={section} aria-labelledby="mn-functions">
                <h2 id="mn-functions" style={h2}>{t('myNumbers.functions')}</h2>
                {functions.length === 0 && <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>{t('myNumbers.noFunctions')}</p>}
                {functions.map(f => (
                  <div key={f.key} style={row}><span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{f.label}</span><span style={num}>{t('myNumbers.gigsDays', { gigs: f.gigs, days: f.days })}</span></div>
                ))}
              </section>
              <section style={section} aria-labelledby="mn-activity">
                <h2 id="mn-activity" style={h2}>{t('myNumbers.activity')}</h2>
                <div style={row}><span>{t('myNumbers.applied')}</span><span style={num}>{activity?.applications?.total ?? 0}</span></div>
                <div style={row}><span>{t('myNumbers.shortlisted')}</span><span style={num}>{activity?.applications?.shortlisted ?? 0}</span></div>
                <div style={row}><span>{t('myNumbers.accepted')}</span><span style={num}>{activity?.applications?.accepted ?? 0}</span></div>
                <div style={row}><span>{t('myNumbers.callsAnswered')}</span><span style={num}>{t('myNumbers.ofCount', { n: activity?.calls?.answered ?? 0, count: activity?.calls?.total ?? 0 })}</span></div>
                {Object.keys(owed).length > 0 && (
                  <div style={row}><span>{t('myNumbers.reimbursementsOwed')} <Hint id="reimbursements-owed" /></span>
                    <span style={num}>{Object.entries(owed).map(([c, v]) => formatMoney(v, c, lang)).join(' · ')}</span></div>
                )}
              </section>
            </div>

            <section style={section} aria-labelledby="mn-gigs">
              <h2 id="mn-gigs" style={h2}>{t('myNumbers.gigs')} <Hint id="fee-paid" /></h2>
              {rows.map(r => (
                <div key={r.gig_id} style={{ ...row, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <Link to={`/gig/${r.gig_id}?tab=crew`} style={{ color: 'var(--text)', fontWeight: 600 }}>{r.gig_name}</Link>
                    <span style={{ display: 'block', fontSize: '12px', color: colors.muted }}>
                      {[r.start_date && fmt(r.start_date, 'd MMM'), r.org_name, r.function_title].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={num}>
                    {r.earned != null ? eur(r.earned) : r.upcoming != null ? t('myNumbers.booked', { amount: eur(r.upcoming) }) : '—'}
                    <span style={{ display: 'block', fontSize: '12px', color: r.paid_on ? colors.accentText : colors.muted, fontWeight: r.paid_on ? 600 : 400 }}>
                      {r.paid_on ? <><BadgeCheck size={12} aria-hidden="true" /> {t('labour.paidOn', { date: fmt(r.paid_on, 'd MMM yyyy') })}{r.received_at ? ` · ${t('labour.receivedShort')}` : ''}</>
                        : r.finished && r.earned != null ? t('myNumbers.notPaidYet') : ''}
                    </span>
                  </span>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </AppShell>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { track } from '../lib/usage'
import { useAuth } from '../lib/AuthContext'
import { useWorkspace } from '../lib/WorkspaceContext'
import { MY_WORK } from '../lib/nav'
import { formatMoney } from '../lib/quotes'
import { yearStatement, summaryCompanies } from '../lib/analytics/crewNumbers'
import { useI18n, fmt } from '../i18n'
import { input, label, card, colors, AvxLoader } from '../components/ui'
import AppShell from '../components/shell/AppShell'
import EmptyState from '../components/EmptyState'
import { PageHelp } from '../components/help/HelpParts'
import { ExportButtons, PrintStyles, downloadCsv } from '../components/reports/ReportParts'
import { useMyGigNumbers } from '../components/mywork/MyNumbersStrip'

const th = { padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${colors.border}`, fontSize: '11px', textTransform: 'uppercase', color: colors.muted, whiteSpace: 'nowrap' }
const td = { padding: '6px 8px', textAlign: 'right', borderBottom: `1px solid ${colors.border}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

// Year statement (K8) at /me/numbers/statement?year=YYYY&org=<id>: per company, one row per month with
// the year's totals, then each gig. For the tax return; CSV and print. The monthly rows come from
// public.my_monthly_summary, the same summary step 27 uses for the "recibo verde".
export default function YearStatementPage() {
  const { t, lang } = useI18n()
  const { profile } = useAuth()
  const { setWorkspace } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const thisYear = new Date().getFullYear()
  const year = /^\d{4}$/.test(params.get('year') || '') ? Number(params.get('year')) : thisYear
  const from = `${year}-01-01`
  const until = `${year + 1}-01-01`
  const [summary, setSummary] = useState(null)
  const { rows: gigs } = useMyGigNumbers({ p_from: from, p_until: until })
  useEffect(() => { setWorkspace(MY_WORK) }, [setWorkspace])
  useEffect(() => {
    let live = true
    setSummary(null)
    supabase.rpc('my_monthly_summary', { p_from: from, p_until: until }).then(({ data, error }) => {
      if (error) logger.error('crewNumbers', error, { step: 'summary' })
      if (live) setSummary(data || [])
    })
    return () => { live = false }
  }, [from, until])

  const companies = useMemo(() => summaryCompanies(summary), [summary])
  const org = params.get('org') && companies.some(c => c.id === params.get('org')) ? params.get('org') : companies[0]?.id || ''
  const orgName = companies.find(c => c.id === org)?.name || ''
  const statement = yearStatement(summary, year, org)
  const detail = (gigs || []).filter(g => g.org_id === org)
  const eur = v => formatMoney(v, 'EUR', lang)
  const set = (k, v) => { const next = new URLSearchParams(params); next.set(k, v); setParams(next, { replace: true }) }
  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3]

  const columns = [
    { key: 'month', label: t('statement.month'), value: m => m.month, show: m => fmt(`${m.month}-01`, 'MMMM'), left: true },
    { key: 'gigs', label: t('statement.gigs'), value: m => m.gigs },
    { key: 'days', label: t('statement.days'), value: m => m.days },
    { key: 'hours', label: t('statement.hours'), value: m => m.hours },
    { key: 'overtime', label: t('statement.overtime'), value: m => m.overtime },
    { key: 'earned', label: t('statement.earned'), value: m => m.earned, show: m => eur(m.earned) },
    { key: 'paid', label: t('statement.paid'), value: m => m.paid, show: m => eur(m.paid) },
    { key: 'km', label: t('statement.km'), value: m => m.km },
    { key: 'reimbursements', label: t('statement.reimbursements'), value: m => m.reimbursements, show: m => eur(m.reimbursements) },
  ]
  const csv = () => {
    downloadCsv(`${t('statement.csvName')} ${year} ${orgName}`, [...statement.months, { month: t('statement.total'), ...statement.total }], columns, 'csv:my-statement')
  }
  useEffect(() => { track('view:my-statement') }, [])

  return (
    <AppShell>
      <PrintStyles />
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Link to={`/me/numbers?year=${year}`} className="no-print" style={{ fontSize: '13px', color: colors.muted, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={14} aria-hidden="true" /> {t('myNumbers.title')}
        </Link>
        <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {t('statement.title', { year })} <span className="no-print"><PageHelp page="my-statement" /></span>
        </h1>
        <p style={{ fontSize: '14px', margin: 0 }}>
          {[profile?.full_name, orgName].filter(Boolean).join(' · ')}
        </p>
        <div className="no-print" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label htmlFor="st-year" style={label}>{t('myNumbers.year')}</label>
            <select id="st-year" value={year} onChange={e => set('year', e.target.value)} style={{ ...input, appearance: 'auto', width: 'auto' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {companies.length > 0 && (
            <div style={{ minWidth: 0 }}>
              <label htmlFor="st-org" style={label}>{t('myNumbers.company')}</label>
              <select id="st-org" value={org} onChange={e => set('org', e.target.value)} style={{ ...input, appearance: 'auto', width: 'auto', maxWidth: '100%' }}>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <ExportButtons onCsv={csv} disabled={!companies.length} />
        </div>

        {!summary ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><AvxLoader size={22} color={colors.accentText} /></div>
        ) : companies.length === 0 ? (
          <EmptyState icon={<FileText size={30} color="var(--accent-text)" />} title={t('statement.emptyTitle')} body={t('statement.emptyBody')} guide="crew-numbers" />
        ) : (
          <>
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <caption style={{ textAlign: 'left', padding: '10px 12px 0', fontSize: '13px', fontWeight: 700 }}>{t('statement.byMonth')}</caption>
                <thead><tr>{columns.map(c => <th key={c.key} scope="col" style={{ ...th, textAlign: c.left ? 'left' : 'right' }}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {statement.months.map(m => (
                    <tr key={m.month}>{columns.map(c => <td key={c.key} style={{ ...td, textAlign: c.left ? 'left' : 'right', color: m.gigs || m.reimbursements ? 'var(--text)' : colors.muted }}>{c.show ? c.show(m) : c.value(m)}</td>)}</tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>{columns.map(c => (
                    <td key={c.key} style={{ ...td, fontWeight: 700, textAlign: c.left ? 'left' : 'right' }}>
                      {c.key === 'month' ? t('statement.total') : c.show ? c.show(statement.total) : c.value(statement.total)}
                    </td>
                  ))}</tr>
                </tfoot>
              </table>
            </div>

            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <caption style={{ textAlign: 'left', padding: '10px 12px 0', fontSize: '13px', fontWeight: 700 }}>{t('statement.byGig')}</caption>
                <thead><tr>
                  <th scope="col" style={{ ...th, textAlign: 'left' }}>{t('statement.date')}</th>
                  <th scope="col" style={{ ...th, textAlign: 'left' }}>{t('statement.gig')}</th>
                  <th scope="col" style={th}>{t('statement.days')}</th>
                  <th scope="col" style={th}>{t('statement.hours')}</th>
                  <th scope="col" style={th}>{t('statement.earned')}</th>
                  <th scope="col" style={th}>{t('statement.paidOn')}</th>
                </tr></thead>
                <tbody>
                  {detail.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.muted }}>{t('statement.noGigs')}</td></tr>}
                  {detail.map(g => (
                    <tr key={g.gig_id}>
                      <td style={{ ...td, textAlign: 'left' }}>{g.start_date ? fmt(g.start_date, 'd MMM') : '—'}</td>
                      <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>{g.gig_name}{g.function_title ? ` · ${g.function_title}` : ''}</td>
                      <td style={td}>{g.days}</td>
                      <td style={td}>{g.hours_approved}</td>
                      <td style={td}>{g.earned != null ? eur(g.earned) : '—'}</td>
                      <td style={td}>{g.paid_on ? fmt(g.paid_on, 'd MMM yyyy') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '13px', color: colors.muted, margin: 0, lineHeight: 1.5 }}>{t('statement.note')}</p>
          </>
        )}
      </div>
    </AppShell>
  )
}

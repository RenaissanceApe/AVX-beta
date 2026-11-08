import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectReport } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { periodRange, comparisonRange, change, monthsOf, todayIn, periodKey, comparisonKey } from '../../lib/analytics/periods'
import { financeTotals, filterFinanceRows, isEstimate, hasMargin } from '../../lib/analytics/gigFinance'
import { shortNumber } from '../../lib/analytics/charts'
import { BASE_STATUSES } from '../../lib/gigLabels'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { NumberTile, BarChart } from './Charts'
import { PeriodBar, FilterBar, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

// Every gig starting in a period, 1000 rows at a time (the API's limit per request)
function loadRows(orgId, range) {
  return selectReport(() => supabase.rpc('gig_finance', { p_org: orgId, p_from: range.from, p_until: range.until })
    .order('start_date').order('gig_id'))
}

// Reports → Gig margins (step 10): each gig starting in the period with its revenue, cost and
// margin, from public.gig_finance (counted in the database, in euros). K2 builds on it.
export default function GigMarginsReport({ orgId, timeZone, labels, params, setParam }) {
  const { t, lang, fmt } = useI18n()
  const [details, toggleDetails] = useDetails('margins')
  const period = periodKey(params.get('period'))
  const compare = comparisonKey(params.get('compare'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const [filters, setFilters] = useState({ status: '', type: '', client: '' })
  const [sort, setSort] = useState({ key: 'start', dir: 1 })
  const [data, setData] = useState(null)
  const today = todayIn(timeZone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const compared = useMemo(() => comparisonRange(range, compare), [range, compare])

  useEffect(() => {
    if (!range) return
    let cancelled = false
    setData(null)
    Promise.all([loadRows(orgId, range), loadRows(orgId, compared)]).then(([cur, prev]) => {
      if (cancelled) return
      if (cur.error || prev.error) logger.error('reports', cur.error || prev.error, { step: 'margins' })
      // A period not yet over counts gigs up to today, day for day with the comparison
      setData({ cur: (cur.data || []).filter(r => r.start_date < range.asOf), prev: prev.data || [], failed: !!(cur.error || prev.error) })
    })
    return () => { cancelled = true }
  }, [orgId, range, compared])

  const rows = useMemo(() => (data ? filterFinanceRows(data.cur, filters) : []), [data, filters])
  const prevRows = useMemo(() => (data ? filterFinanceRows(data.prev, filters) : []), [data, filters])
  const totals = financeTotals(rows)
  const prevTotals = financeTotals(prevRows)
  const money = (v, short) => (short ? shortNumber(v, lang) : formatMoney(v, 'EUR', lang))
  const pct = v => (v == null ? '—' : t('finance.pct', { pct: Number(v).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB') }))
  const compareLabel = t(`reports.compareShort.${compare}`)
  const months = monthsOf(range)
  const monthRows = months.map(m => ({
    label: fmt(`${m.key}-01`, months.length > 6 ? 'MMM' : 'MMM yy'),
    value: financeTotals(rows.filter(r => r.start_date?.startsWith(m.key))).margin,
  }))
  const gigRows = [...rows].sort((a, b) => Number(a.margin) - Number(b.margin)).slice(0, 12)
    .map(r => ({ label: r.gig_name, value: Number(r.margin) }))

  const statusOptions = [
    ...BASE_STATUSES.map(s => ({ value: `base:${s}`, label: t(`status.${s}`) })),
    ...labels.statuses.map(s => ({ value: `own:${s.id}`, label: s.name })),
  ]
  const clients = [...new Set((data?.cur || []).map(r => r.client_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const columns = [
    { key: 'gig', label: t('reports.group.gig'), value: r => r.gig_name || '', left: true,
      show: r => <Link to={`/gig/${r.gig_id}`} style={{ color: 'var(--text)' }}>{r.gig_name}</Link> },
    { key: 'start', label: t('finance.col.start'), value: r => r.start_date || '', left: true, show: r => (r.start_date ? fmt(r.start_date, 'd MMM yyyy') : '—') },
    { key: 'client', label: t('reports.group.client'), value: r => r.client_name || '', left: true },
    { key: 'revenue', label: t('finance.revenue'), value: r => Number(r.revenue),
      show: r => (r.revenue_source === 'none' ? t('finance.noQuoteShort') : money(r.revenue) + (r.revenue_source === 'estimate' ? ` (${t('finance.estimate')})` : '')), csv: r => r.revenue },
    { key: 'cost', label: t('finance.cost'), value: r => Number(r.cost), show: r => money(r.cost) + (Number(r.estimated_cost) > 0 ? ` (${t('finance.estimate')})` : ''), csv: r => r.cost },
    { key: 'margin', label: t('finance.margin'), value: r => Number(r.margin),
      show: r => <span style={{ color: hasMargin(r) && Number(r.margin) < 0 ? colors.danger : 'var(--text)', fontWeight: 600 }}>{money(r.margin)}</span>, csv: r => r.margin },
    { key: 'pct', label: t('finance.col.pct'), value: r => (r.margin_pct == null ? -Infinity : Number(r.margin_pct)), show: r => pct(r.margin_pct), csv: r => r.margin_pct ?? '' },
    { key: 'estimate', label: t('finance.col.estimate'), value: r => (isEstimate(r) ? t('finance.estimate') : ''), csv: r => (isEstimate(r) ? 'yes' : '') },
  ]
  const csvColumns = [
    ...columns.slice(0, 3),
    { key: 'status', label: t('reports.filter.status'), value: r => r.gig_status },
    { key: 'revenue', label: t('finance.revenue'), value: r => r.revenue },
    { key: 'source', label: t('finance.col.revenueSource'), value: r => r.revenue_source },
    { key: 'labour', label: t('finance.labour'), value: r => r.labour },
    { key: 'labourPlanned', label: t('finance.col.labourPlanned'), value: r => r.labour_planned },
    { key: 'labourActual', label: t('finance.col.labourActual'), value: r => r.labour_actual ?? '' },
    { key: 'subrentals', label: t('finance.subrentals'), value: r => r.subrentals },
    { key: 'repairs', label: t('finance.repairs'), value: r => r.repairs },
    { key: 'other', label: t('finance.otherCosts'), value: r => r.other_costs },
    { key: 'cost', label: t('finance.cost'), value: r => r.cost },
    { key: 'estimated', label: t('finance.col.estimatedCost'), value: r => r.estimated_cost },
    { key: 'margin', label: t('finance.margin'), value: r => r.margin },
    { key: 'pct', label: t('finance.col.pct'), value: r => r.margin_pct ?? '' },
  ].map(c => ({ ...c, csv: c.csv || c.value }))
  const csv = () => downloadCsv(`${t('reports.csvName.margins')} ${range.from} ${range.until}`, rows, csvColumns, 'csv:reports:margins')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PeriodBar period={period} onPeriod={v => setParam('period', v === 'this_month' ? null : v)} custom={custom}
        onCustom={c => { setParam('from', c.from || null); setParam('until', c.until || null) }}
        compare={compare} onCompare={v => setParam('compare', v === 'previous' ? null : v)} range={range} compared={compared} />

      {!range ? null : !data ? (
        <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
      ) : data.failed ? (
        <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            <NumberTile label={t('finance.margin')} value={money(totals.margin)} change={change(totals.margin, prevTotals.margin)} compareLabel={compareLabel}
              sub={totals.marginPct != null ? t('finance.ofRevenue', { pct: pct(totals.marginPct) }) : null} estimate={totals.estimated > 0} />
            <NumberTile label={t('finance.revenue')} value={money(totals.revenue)} change={change(totals.revenue, prevTotals.revenue)} compareLabel={compareLabel} />
            <NumberTile label={t('finance.cost')} value={money(totals.cost)} change={change(totals.cost, prevTotals.cost)} compareLabel={compareLabel} />
            <NumberTile label={t('finance.negativeGigs')} value={String(totals.negative)} sub={t('finance.ofGigs', { count: totals.gigs })} />
          </div>
          {totals.estimated > 0 && <p style={{ fontSize: '12px', color: 'var(--warn)', margin: 0 }}>{t('finance.estimatedShare', { amount: money(totals.estimated) })}</p>}

          {rows.length === 0 ? (
            <EmptyState compact icon={<Wallet size={26} />} title={t('finance.emptyReport')} body={t('finance.emptyReportBody')} guide="office-gig-finance" />
          ) : months.length > 1 ? (
            <BarChart title={t('finance.chart.byMonth')} data={monthRows} format={money} valueLabel={t('finance.margin')} />
          ) : (
            <BarChart title={t('finance.chart.byGig')} data={gigRows} format={money} valueLabel={t('finance.margin')} />
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <DetailsToggle on={details} onToggle={toggleDetails} />
            <span style={{ flex: '1 1 auto' }} />
            <ExportButtons onCsv={csv} disabled={!rows.length} />
          </div>

          {details && (
            <>
              <FilterBar filters={filters} onChange={setFilters} statuses={statusOptions} types={labels.types} clients={clients} />
              <ReportTable columns={columns} rows={rows.map(r => ({ ...r, id: r.gig_id }))} sort={sort} onSort={setSort} empty={t('finance.emptyReport')} />
            </>
          )}
          <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('finance.howMargins')}</p>
        </>
      )}
    </div>
  )
}

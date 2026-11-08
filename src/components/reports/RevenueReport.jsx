import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectReport } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { periodRange, comparisonRange, change, monthsOf, todayIn, periodKey, comparisonKey } from '../../lib/analytics/periods'
import { filterRevenueLines, groupRevenue, totalsByCurrency, mainCurrency } from '../../lib/analytics/revenue'
import { shortNumber } from '../../lib/analytics/charts'
import { BASE_STATUSES } from '../../lib/gigLabels'
import { formatMoney, round2 } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { NumberTile, BarChart, StackedBarChart } from './Charts'
import { PeriodBar, FilterBar, GroupBy, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

const GROUPS = ['kind', 'client', 'gig', 'gigType', 'month']
const KINDS = ['rental', 'sale', 'crew', 'transport', 'other']

// Every revenue line of a period, 1000 rows at a time (the API's limit per request)
function loadLines(orgId, range) {
  return selectReport(() => supabase.rpc('report_revenue_lines', { p_org: orgId, p_from: range.from, p_until: range.until })
    .order('report_date').order('quote_id').order('phase_id').order('line_id'))
}

// Reports → Revenue: net revenue of accepted quotes in a period (the revenue rule), compared with
// the previous period or the same period last year; by month, kind, client, gig or gig type.
export default function RevenueReport({ orgId, timeZone, labels, params, setParam }) {
  const { t, lang, fmt } = useI18n()
  const [details, toggleDetails] = useDetails('revenue')
  const period = periodKey(params.get('period'))
  const compare = comparisonKey(params.get('compare'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const [filters, setFilters] = useState({ status: '', type: '', client: '' })
  const [group, setGroup] = useState('kind')
  const [sort, setSort] = useState({ key: 'amount', dir: -1 })
  const [data, setData] = useState(null)
  const today = todayIn(timeZone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const compared = useMemo(() => comparisonRange(range, compare), [range, compare])

  useEffect(() => {
    if (!range) return
    let cancelled = false
    setData(null)
    Promise.all([loadLines(orgId, range), loadLines(orgId, compared)]).then(([cur, prev]) => {
      if (cancelled) return
      if (cur.error || prev.error) logger.error('reports', cur.error || prev.error, { step: 'revenue' })
      // Lines of a period not yet over only count up to today, day for day with the comparison
      setData({ cur: (cur.data || []).filter(r => r.report_date < range.asOf), prev: prev.data || [], failed: !!(cur.error || prev.error) })
    })
    return () => { cancelled = true }
  }, [orgId, range, compared])

  const lines = useMemo(() => (data ? filterRevenueLines(data.cur, filters) : []), [data, filters])
  const prevLines = useMemo(() => (data ? filterRevenueLines(data.prev, filters) : []), [data, filters])
  const currency = mainCurrency(lines)
  const money = (v, short) => (short ? shortNumber(v, lang) : formatMoney(v, currency, lang))
  const inCur = rows => rows.filter(r => r.currency === currency)
  const total = round2(inCur(lines).reduce((s, r) => s + r.amount, 0))
  const prevTotal = round2(inCur(prevLines).reduce((s, r) => s + r.amount, 0))
  const others = Object.entries(totalsByCurrency(lines)).filter(([c]) => c !== currency)
  const quotes = new Set(lines.map(r => r.quote_id)).size
  const gigs = new Set(lines.map(r => r.gig_id).filter(Boolean)).size
  const compareLabel = t(`reports.compareShort.${compare}`)

  const typeName = id => labels.types.find(x => x.id === id)?.name || t('reports.filter.noType')
  const groupBy = {
    kind: r => [r.kind, t(`lineKind.${r.kind}`)],
    client: r => [r.client_name || '', r.client_name || t('reports.noClient')],
    gig: r => [r.gig_id || '', r.gig_name || t('reports.noGig')],
    gigType: r => [r.gig_type_id || '', typeName(r.gig_type_id)],
    month: r => [r.report_date.slice(0, 7), fmt(`${r.report_date.slice(0, 7)}-01`, 'MMM yyyy')],
  }[group]
  const groups = useMemo(() => groupRevenue(lines, groupBy), [lines, group]) // eslint-disable-line react-hooks/exhaustive-deps

  const months = monthsOf(range)
  const byMonth = months.map(m => ({ label: fmt(`${m.key}-01`, months.length > 6 ? 'MMM' : 'MMM yy'), key: m.key }))
  const monthRows = byMonth.map(m => ({ label: m.label, value: round2(inCur(lines).filter(r => r.report_date.startsWith(m.key)).reduce((s, r) => s + r.amount, 0)) }))
  const kindRows = KINDS.map(k => ({ label: t(`lineKind.${k}`), value: round2(inCur(lines).filter(r => r.kind === k).reduce((s, r) => s + r.amount, 0)) }))
  const stacked = byMonth.map(m => ({ label: m.label, values: Object.fromEntries(KINDS.map(k => [k, round2(inCur(lines).filter(r => r.kind === k && r.report_date.startsWith(m.key)).reduce((s, r) => s + r.amount, 0))])) }))

  const statusOptions = [
    ...BASE_STATUSES.map(s => ({ value: `base:${s}`, label: t(`status.${s}`) })),
    ...labels.statuses.map(s => ({ value: `own:${s.id}`, label: s.name })),
  ]
  const clients = [...new Set((data?.cur || []).map(r => r.client_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const columns = [
    { key: 'label', label: t(`reports.group.${group}`), value: g => g.label || '', left: true,
      show: g => (group === 'gig' && g.key ? <Link to={`/gig/${g.key}`} style={{ color: 'var(--text)' }}>{g.label}</Link> : g.label) },
    { key: 'amount', label: t('reports.netRevenue'), value: g => g.amount, show: g => formatMoney(g.amount, g.currency, lang), csv: g => g.amount },
    { key: 'currency', label: t('reports.currency'), value: g => g.currency },
    { key: 'quotes', label: t('reports.quotes'), value: g => g.quotes },
    { key: 'lines', label: t('reports.lines'), value: g => g.lines },
  ]
  const csv = () => downloadCsv(`${t('reports.csvName.revenue')} ${range.from} ${range.until}`, groups, columns, 'csv:reports:revenue')

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
            <NumberTile label={t('reports.netRevenue')} value={money(total)} change={change(total, prevTotal)} compareLabel={compareLabel}
              sub={others.length ? t('reports.otherCurrencies', { list: others.map(([c, v]) => formatMoney(v, c, lang)).join(' · ') }) : null} />
            <NumberTile label={t('reports.acceptedQuotes')} value={String(quotes)} change={change(quotes, new Set(prevLines.map(r => r.quote_id)).size)} compareLabel={compareLabel} />
            <NumberTile label={t('reports.gigs')} value={String(gigs)} change={change(gigs, new Set(prevLines.map(r => r.gig_id).filter(Boolean)).size)} compareLabel={compareLabel} />
          </div>

          {lines.length === 0 ? (
            <EmptyState compact icon={<TrendingUp size={26} />} title={t('reports.emptyRevenue')} body={t('reports.emptyRevenueBody')} guide="office-reports" />
          ) : months.length > 1 ? (
            <BarChart title={t('reports.chart.byMonth', { currency })} data={monthRows} format={money} valueLabel={t('reports.netRevenue')} />
          ) : (
            <BarChart title={t('reports.chart.byKind', { currency })} data={kindRows} format={money} valueLabel={t('reports.netRevenue')} />
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <DetailsToggle on={details} onToggle={toggleDetails} />
            <span style={{ flex: '1 1 auto' }} />
            <ExportButtons onCsv={csv} disabled={!groups.length} />
          </div>

          {details && (
            <>
              <FilterBar filters={filters} onChange={setFilters} statuses={statusOptions} types={labels.types} clients={clients} />
              {months.length > 1 && lines.length > 0 && (
                <StackedBarChart title={t('reports.chart.kindByMonth', { currency })} data={stacked}
                  series={KINDS.map(k => ({ key: k, label: t(`lineKind.${k}`) }))} format={money} />
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <GroupBy value={group} options={GROUPS} onChange={setGroup} />
              </div>
              <ReportTable columns={columns} rows={groups} sort={sort} onSort={setSort} empty={t('reports.emptyRevenue')} />
            </>
          )}
          <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('reports.howRevenue')}</p>
        </>
      )}
    </div>
  )
}

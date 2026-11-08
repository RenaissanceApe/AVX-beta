import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectReport } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { periodRange, comparisonRange, change, todayIn, periodKey, comparisonKey } from '../../lib/analytics/periods'
import { EQUIPMENT_VIEWS, PROFIT_GROUPS, toProfitRow, profitTotals, groupByCategory, coverage, paybackState, hasActivity } from '../../lib/analytics/equipment'
import { formatMoney } from '../../lib/quotes'
import { shortNumber } from '../../lib/analytics/charts'
import { useI18n } from '../../i18n'
import { btn, card, colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { NumberTile, BarChart } from './Charts'
import { PeriodBar, GroupBy, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'
import ReportsTab from '../inventory/ReportsTab'

// Reports → Equipment (K5): profit per item, category and unit in a period; payback; buy or keep
// hiring in; purchase-cost coverage; and I7's use and value table. Inventory → Reports opens it.
// Everything is counted in the database (public.equipment_money and its siblings), in euros.
export default function EquipmentReport({ orgId, timeZone, params, setParam }) {
  const { t } = useI18n()
  const view = EQUIPMENT_VIEWS.includes(params.get('view')) ? params.get('view') : 'profit'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <nav className="no-print" aria-label={t('equipMoney.views')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {EQUIPMENT_VIEWS.map(v => (
          <button key={v} type="button" onClick={() => setParam('view', v === 'profit' ? null : v)} aria-current={view === v ? 'page' : undefined}
            style={{ ...btn, padding: '6px 10px', fontSize: '13px', ...(view === v ? { background: colors.accent, color: colors.onAccent, borderColor: colors.accent } : {}) }}>
            {t(`equipMoney.view.${v}`)}
          </button>
        ))}
      </nav>
      {(view === 'profit' || view === 'coverage') && <ProfitView orgId={orgId} timeZone={timeZone} params={params} setParam={setParam} coverageOnly={view === 'coverage'} />}
      {view === 'payback' && <PaybackView orgId={orgId} />}
      {view === 'buy' && <BuyView orgId={orgId} focus={params.get('item')} />}
      {view === 'use' && <ReportsTab orgId={orgId} inv={{ org: { time_zone: timeZone } }} />}
    </div>
  )
}

function loadProfit(orgId, range) {
  return selectReport(() => supabase.rpc('equipment_money', { p_org: orgId, p_from: range.from, p_until: range.asOf || range.until })
    .order('name', { nullsFirst: false }).order('item_id'))
}

const itemLink = (orgId, id, name) => <Link to={`/org/${orgId}/inventory/${id}`} style={{ color: 'var(--text)' }}>{name}</Link>

function ProfitView({ orgId, timeZone, params, setParam, coverageOnly }) {
  const { t, lang } = useI18n()
  const [details, toggleDetails] = useDetails('equipment')
  const period = periodKey(params.get('period') || 'this_year')
  const compare = comparisonKey(params.get('compare'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const by = PROFIT_GROUPS.includes(params.get('by')) ? params.get('by') : 'item'
  const [sort, setSort] = useState(() => (params.get('sort') === 'profit_asc' ? { key: 'profit', dir: 1 } : { key: 'profit', dir: -1 }))
  const [data, setData] = useState(null)
  const today = todayIn(timeZone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const compared = useMemo(() => comparisonRange(range, compare), [range, compare])

  useEffect(() => {
    if (!range) return
    let cancelled = false
    setData(null)
    const units = by === 'unit'
      ? selectReport(() => supabase.rpc('equipment_unit_money', { p_org: orgId, p_from: range.from, p_until: range.asOf || range.until }).order('item_name').order('code'))
      : Promise.resolve({ data: [] })
    Promise.all([loadProfit(orgId, range), loadProfit(orgId, compared), units]).then(([cur, prev, u]) => {
      if (cancelled) return
      const error = cur.error || prev.error || u.error
      if (error) logger.error('reports', error, { step: 'equipment' })
      setData({ cur: (cur.data || []).map(toProfitRow), prev: (prev.data || []).map(toProfitRow), units: u.data || [], failed: !!error })
    })
    return () => { cancelled = true }
  }, [orgId, range, compared, by])

  const money = v => formatMoney(v, 'EUR', lang)
  const pct = v => `${Math.round(v * 100)}%`
  const onPeriod = v => setParam('period', v === 'this_year' ? null : v)
  const bar = (
    <PeriodBar period={period} onPeriod={onPeriod} custom={custom}
      onCustom={c => { setParam('from', c.from || null); setParam('until', c.until || null) }}
      compare={compare} onCompare={v => setParam('compare', v === 'previous' ? null : v)} range={range} compared={compared} />
  )
  if (!range) return bar
  if (!data) return <>{bar}<AvxLoader size={20} color={colors.accentText} label={t('common.loading')} /></>
  if (data.failed) return <>{bar}<p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p></>

  const cov = coverage(data.cur)
  const coverageCard = (
    <section aria-labelledby="eq-coverage" style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <h2 id="eq-coverage" style={{ fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
        {t('equipMoney.coverage.title')} <Hint id="equipment-coverage" />
      </h2>
      <p style={{ margin: 0, fontSize: '13px' }}>
        {t('equipMoney.coverage.items', { n: cov.itemsWithCost, total: cov.items })} · {t('equipMoney.coverage.units', { n: cov.unitsWithCost, total: cov.units })}
      </p>
      {cov.missing.length > 0 && (coverageOnly ? (
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {cov.missing.slice(0, 100).map(r => (
            <li key={r.id}>{itemLink(orgId, r.item_id, r.name)} <span style={{ color: colors.muted }}>· {t('equipMoney.coverage.missingRow', { count: r.owned })}</span></li>
          ))}
        </ul>
      ) : (
        <button type="button" onClick={() => setParam('view', 'coverage')} style={{ ...btn, alignSelf: 'flex-start', fontSize: '13px' }}>
          {t('equipMoney.coverage.fill', { count: cov.missing.length })}
        </button>
      ))}
      {cov.missing.length === 0 && cov.items > 0 && <p style={{ margin: 0, fontSize: '12px', color: colors.muted }}>{t('equipMoney.coverage.complete')}</p>}
    </section>
  )
  if (coverageOnly) return <>{bar}{coverageCard}</>

  const totals = profitTotals(data.cur)
  const prevTotals = profitTotals(data.prev)
  const compareLabel = t(`reports.compareShort.${compare}`)
  const itemRows = data.cur.filter(r => r.item_id && hasActivity(r))
  const nameCol = { key: 'name', label: t('report.item'), value: r => r.name || '', left: true, show: r => itemLink(orgId, r.item_id, r.name) }
  const moneyCols = [
    { key: 'revenue', label: t('equipMoney.col.revenue'), value: r => r.revenue, show: r => money(r.revenue) },
    { key: 'depreciation', label: t('equipMoney.col.depreciation'), value: r => r.depreciation,
      show: r => money(r.depreciation) + (r.depreciation_estimated > 0 ? ` (${t('reports.estimate')})` : '') },
    { key: 'repairs', label: t('equipMoney.col.repairs'), value: r => r.repairs, show: r => money(r.repairs) },
    { key: 'inspections', label: t('equipMoney.col.inspections'), value: r => r.inspections, show: r => money(r.inspections) },
    { key: 'hire_in', label: t('equipMoney.col.hireIn'), value: r => r.hire_in, show: r => money(r.hire_in) },
    { key: 'losses', label: t('equipMoney.col.losses'), value: r => r.losses, show: r => money(r.losses) },
    { key: 'profit', label: t('equipMoney.col.profit'), value: r => r.profit,
      show: r => <span style={{ fontWeight: 600, color: r.profit < 0 ? colors.danger : 'var(--text)' }}>{money(r.profit)}</span> },
  ]
  const unitRows = data.units.map(u => {
    const row = { ...u, id: u.unit_id }
    for (const k of ['revenue', 'depreciation', 'depreciation_estimated', 'repairs', 'inspections', 'losses', 'profit']) row[k] = Number(u[k]) || 0
    row.hire_in = 0
    return row
  })
  const columns = by === 'category'
    ? [{ key: 'category', label: t('reports.group.category'), value: r => r.category || t('equipMoney.noCategory'), left: true },
        { key: 'items', label: t('equipMoney.col.items'), value: r => r.items }, ...moneyCols]
    : by === 'unit'
      ? [{ key: 'code', label: t('equipMoney.col.unit'), value: r => r.code, left: true, show: r => <>{itemLink(orgId, r.item_id, r.item_name)} · {r.code}</> },
          { key: 'owned_days', label: t('equipMoney.col.ownedDays'), value: r => r.owned_days },
          ...moneyCols.filter(c => c.key !== 'hire_in')]
      : [nameCol, ...moneyCols]
  const tableRows = by === 'category' ? groupByCategory(data.cur) : by === 'unit' ? unitRows : itemRows
  const chartRows = [...(by === 'category' ? groupByCategory(data.cur) : itemRows)].sort((a, b) => b.profit - a.profit)
  const chartData = (chartRows.length > 12 ? [...chartRows.slice(0, 6), ...chartRows.slice(-6)] : chartRows)
    .map(r => ({ label: by === 'category' ? (r.category || t('equipMoney.noCategory')) : r.name, value: r.profit }))
  const csv = () => downloadCsv(`${t('equipMoney.csvName')} ${range.from} ${range.until}`, tableRows,
    columns.map(c => ({ ...c, csv: c.value })), 'csv:reports:equipment')

  return (
    <>
      {bar}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
        <NumberTile label={t('equipMoney.col.profit')} value={money(totals.profit)} change={change(totals.profit, prevTotals.profit)} compareLabel={compareLabel}
          estimate={totals.depreciation_estimated > 0} />
        <NumberTile label={t('equipMoney.col.revenue')} value={money(totals.revenue)} change={change(totals.revenue, prevTotals.revenue)} compareLabel={compareLabel}
          sub={totals.notLinkedShare ? t('equipMoney.notLinked', { pct: pct(totals.notLinkedShare), amount: money(totals.notLinked) }) : null} />
        <NumberTile label={t('equipMoney.costs')} value={money(totals.costs)} change={change(totals.costs, prevTotals.costs)} compareLabel={compareLabel}
          sub={t('equipMoney.costsSub', { depreciation: money(totals.depreciation), hireIn: money(totals.hire_in) })} />
        <NumberTile label={t('equipMoney.col.losses')} value={money(totals.losses)} />
      </div>
      {totals.depreciation_estimated > 0 && <p style={{ fontSize: '12px', color: 'var(--warn)', margin: 0 }}>{t('equipMoney.estimatedShare', { amount: money(totals.depreciation_estimated) })}</p>}

      {itemRows.length === 0 ? (
        <EmptyState compact icon={<Boxes size={26} />} title={t('equipMoney.empty')} body={t('equipMoney.emptyBody')} guide="warehouse-equipment-money" />
      ) : (
        <BarChart title={t(by === 'category' ? 'equipMoney.chart.byCategory' : 'equipMoney.chart.byItem')} data={chartData} format={v => shortNumber(v, lang)} valueLabel={t('equipMoney.col.profit')} />
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv} disabled={!tableRows.length} />
      </div>
      {details && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <GroupBy value={by} options={PROFIT_GROUPS} onChange={v => setParam('by', v === 'item' ? null : v)} />
          </div>
          <ReportTable columns={columns} rows={tableRows} sort={columns.some(c => c.key === sort.key) ? sort : { key: 'profit', dir: -1 }} onSort={setSort} empty={t('equipMoney.empty')} />
          {by === 'unit' && <p style={{ fontSize: '12px', color: colors.muted, margin: 0 }}>{t('equipMoney.unitNote')}</p>}
        </>
      )}
      {coverageCard}
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('equipMoney.howProfit')}</p>
    </>
  )
}

function useRows(fn, args, deps) {
  const [state, setState] = useState(null)
  useEffect(() => {
    let cancelled = false
    setState(null)
    selectReport(() => supabase.rpc(fn, args)).then(({ data, error }) => {
      if (cancelled) return
      if (error) logger.error('reports', error, { step: fn })
      setState({ rows: data || [], failed: !!error })
    })
    return () => { cancelled = true }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

function PaybackView({ orgId }) {
  const { t, lang, fmt } = useI18n()
  const [details, toggleDetails] = useDetails('equipment-payback')
  const [sort, setSort] = useState({ key: 'ratio', dir: -1 })
  const state = useRows('equipment_payback', { p_org: orgId }, [orgId])
  if (!state) return <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
  if (state.failed) return <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
  const money = v => formatMoney(Number(v) || 0, 'EUR', lang)
  const rows = state.rows.map(r => ({ ...r, id: r.unit_id || r.item_id, ratio: Number(r.ratio) || 0 }))
  const items = rows.filter(r => r.level === 'item')
  const units = rows.filter(r => r.level === 'unit')
  const paid = items.filter(r => r.paid_back_on).length
  const status = r => {
    const s = paybackState(r)
    return s === 'paid' ? t('equipMoney.payback.paid', { date: fmt(r.paid_back_on, 'd MMM yyyy') })
      : s === 'expected' ? t('equipMoney.payback.expected', { date: fmt(r.expected_on, 'MMM yyyy') }) : t('equipMoney.payback.noPace')
  }
  const columns = [
    { key: 'name', label: t(details ? 'equipMoney.col.unit' : 'report.item'), value: r => `${r.name} ${r.code || ''}`, left: true,
      show: r => <>{itemLink(orgId, r.item_id, r.name)}{r.code ? ` · ${r.code}` : ''}</> },
    { key: 'since', label: t('equipMoney.col.since'), value: r => r.since || '', show: r => (r.since ? fmt(r.since, 'd MMM yyyy') : '—') },
    { key: 'cost', label: t('equipMoney.col.cost'), value: r => Number(r.cost), show: r => money(r.cost) + (r.estimated ? ` (${t('reports.estimate')})` : '') },
    { key: 'revenue', label: t('equipMoney.col.revenueSince'), value: r => Number(r.revenue), show: r => money(r.revenue) },
    { key: 'ratio', label: t('equipMoney.col.ratio'), value: r => r.ratio, show: r => `${Math.round(r.ratio * 100)}%` },
    { key: 'status', label: t('equipMoney.col.status'), value: r => r.paid_back_on || r.expected_on || '9999', left: true, show: status },
  ]
  const shown = details ? units : items
  const csv = () => downloadCsv(t('equipMoney.csvNamePayback'), shown, columns.map(c => ({ ...c, csv: c.key === 'status' ? status : c.value })), 'csv:reports:equipment')
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
        <NumberTile label={t('equipMoney.payback.paidItems')} value={`${paid} / ${items.length}`} />
        <NumberTile label={t('equipMoney.col.cost')} value={money(items.reduce((s, r) => s + Number(r.cost), 0))} />
        <NumberTile label={t('equipMoney.col.revenueSince')} value={money(items.reduce((s, r) => s + Number(r.revenue), 0))} />
      </div>
      {items.length === 0 ? (
        <EmptyState compact icon={<Boxes size={26} />} title={t('equipMoney.payback.empty')} body={t('equipMoney.payback.emptyBody')} guide="warehouse-equipment-money" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <DetailsToggle on={details} onToggle={toggleDetails} />
            <span style={{ fontSize: '12px', color: colors.muted }}>{t(details ? 'equipMoney.payback.perUnit' : 'equipMoney.payback.perItem')}</span>
            <span style={{ flex: '1 1 auto' }} />
            <ExportButtons onCsv={csv} disabled={!shown.length} />
          </div>
          <ReportTable columns={columns} rows={shown} sort={sort} onSort={setSort} empty={t('equipMoney.payback.empty')} />
        </>
      )}
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('equipMoney.howPayback')}</p>
    </>
  )
}

function BuyView({ orgId, focus }) {
  const { t, lang } = useI18n()
  const [sort, setSort] = useState({ key: 'months', dir: 1 })
  const state = useRows('equipment_buy_or_hire', { p_org: orgId }, [orgId])
  if (!state) return <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
  if (state.failed) return <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
  const money = v => formatMoney(Number(v) || 0, 'EUR', lang)
  const rows = state.rows.map(r => ({ ...r, id: r.item_id }))
  const picked = rows.find(r => r.item_id === focus)
  const verdict = r => (r.months_to_pay_back == null ? t('equipMoney.buy.noPrice')
    : t('equipMoney.buy.months', { months: Number(r.months_to_pay_back).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB') }))
  const columns = [
    { key: 'name', label: t('report.item'), value: r => r.name, left: true,
      show: r => <>{itemLink(orgId, r.item_id, r.name)}{r.item_id === focus ? <strong> · {t('equipMoney.buy.picked')}</strong> : null}</> },
    { key: 'months', label: t('equipMoney.col.months'), value: r => (r.months_to_pay_back == null ? Infinity : Number(r.months_to_pay_back)), show: verdict },
    { key: 'owned', label: t('report.owned'), value: r => r.owned },
    { key: 'hire_ins', label: t('equipMoney.col.hireIns'), value: r => r.hire_ins },
    { key: 'peak', label: t('equipMoney.col.peak'), value: r => r.peak },
    { key: 'spend', label: t('equipMoney.col.spend12'), value: r => Number(r.spend), show: r => money(r.spend) },
    { key: 'price', label: t('equipMoney.col.priceEach'), value: r => Number(r.unit_price) || 0,
      show: r => (r.unit_price == null ? '—' : `${money(r.unit_price)} (${t(`equipMoney.buy.source.${r.price_source}`)})`) },
    { key: 'cost', label: t('equipMoney.col.costToBuy'), value: r => Number(r.cost_to_buy) || 0, show: r => (r.cost_to_buy == null ? '—' : money(r.cost_to_buy)) },
  ]
  const csv = () => downloadCsv(t('equipMoney.csvNameBuy'), rows, columns.map(c => ({ ...c, csv: c.value })), 'csv:reports:equipment')
  return (
    <>
      {picked && (
        <p role="status" style={{ ...card, padding: '10px 12px', margin: 0, fontSize: '13px' }}>
          {t('equipMoney.buy.pickedLine', { name: picked.name, spend: money(picked.spend), cost: picked.cost_to_buy == null ? '—' : money(picked.cost_to_buy), verdict: verdict(picked) })}
        </p>
      )}
      {focus && !picked && <p role="status" style={{ fontSize: '13px', margin: 0 }}>{t('equipMoney.buy.notHired')}</p>}
      {rows.length === 0 ? (
        <EmptyState compact icon={<Boxes size={26} />} title={t('equipMoney.buy.empty')} body={t('equipMoney.buy.emptyBody')} guide="warehouse-equipment-money" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>{t('equipMoney.buy.title')} <Hint id="equipment-buy" /></span>
            <span style={{ flex: '1 1 auto' }} />
            <ExportButtons onCsv={csv} disabled={!rows.length} />
          </div>
          <ReportTable columns={columns} rows={rows} sort={sort} onSort={setSort} empty={t('equipMoney.buy.empty')} />
        </>
      )}
      <p style={{ fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>{t('equipMoney.howBuy')}</p>
    </>
  )
}

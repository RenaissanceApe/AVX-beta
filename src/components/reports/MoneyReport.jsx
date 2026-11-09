import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectReport } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { periodRange, comparisonRange, change, monthsOf, todayIn, periodKey, comparisonKey } from '../../lib/analytics/periods'
import {
  MONEY_VIEWS, MARGIN_GROUPS, LABOUR_GROUPS, currenciesOf, rowFor, statementLines, estimates, labourVariance, groupName, expensesLink,
} from '../../lib/analytics/money'
import { shortNumber } from '../../lib/analytics/charts'
import { categoryName } from '../../lib/expenses'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { btn, card, colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { NumberTile, BarChart } from './Charts'
import CashReport from './CashReport'
import { CASH_VIEWS } from '../../lib/analytics/cash'
import { PeriodBar, GroupBy, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

// One call of public.finance_results (counted in the database), 1000 rows at a time
function loadRows(orgId, range, group) {
  return selectReport(() => supabase.rpc('finance_results', { p_org: orgId, p_from: range.from, p_until: range.asOf || range.until, p_group: group })
    .order('group_key', { nullsFirst: false }).order('currency'))
}

// Reports → Money (K2): results (revenue, direct costs, gross margin, overheads, depreciation,
// operating result), margins by gig type, status, client, kind of line, production manager or
// period, and planned against actual labour. Simple first; "Show details" adds the parts.
export default function MoneyReport({ orgId, timeZone, labels, params, setParam }) {
  const { t, lang, fmt } = useI18n()
  const [details, toggleDetails] = useDetails('money')
  const view = MONEY_VIEWS.includes(params.get('view')) ? params.get('view') : 'results'
  const groups = view === 'labour' ? LABOUR_GROUPS : MARGIN_GROUPS
  const cashView = CASH_VIEWS.includes(view)
  const group = view === 'results' ? 'month' : groups.includes(params.get('by')) ? params.get('by') : groups[0]
  const period = periodKey(params.get('period'))
  const compare = comparisonKey(params.get('compare'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const [picked, setPicked] = useState('')
  const [sort, setSort] = useState({ key: 'margin', dir: -1 })
  const [data, setData] = useState(null)
  const today = todayIn(timeZone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const compared = useMemo(() => comparisonRange(range, compare), [range, compare])

  useEffect(() => {
    if (!range || cashView) return
    let cancelled = false
    setData(null)
    Promise.all([loadRows(orgId, range, 'total'), loadRows(orgId, compared, 'total'), loadRows(orgId, range, group)]).then(([cur, prev, grouped]) => {
      if (cancelled) return
      const error = cur.error || prev.error || grouped.error
      if (error) logger.error('reports', error, { step: 'money', view, group })
      setData({ cur: cur.data || [], prev: prev.data || [], grouped: grouped.data || [], failed: !!error })
    })
    return () => { cancelled = true }
  }, [orgId, range, compared, group, view, cashView])

  const currencies = currenciesOf(data?.cur)
  const currency = view === 'labour' ? 'EUR' : currencies.includes(picked) ? picked : (currencies[0] || 'EUR')
  const row = rowFor(data?.cur, currency)
  const prevRow = rowFor(data?.prev, currency)
  const grouped = (data?.grouped || []).filter(r => r.currency === currency)
  const money = (v, short) => (short ? shortNumber(v, lang) : formatMoney(v, currency, lang))
  const number = v => Number(v || 0).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 1 })
  const pct = v => (v == null ? '—' : t('finance.pct', { pct: number(v) }))
  const compareLabel = t(`reports.compareShort.${compare}`)
  const est = estimates(row)
  const empty = data && !data.failed && !data.cur.some(r => Number(r.revenue) || Number(r.direct_costs) || Number(r.overheads) || Number(r.depreciation))
  // One change to the address only: two in a row would overwrite each other. A grouping that
  // doesn't belong to the new view is ignored (see `group` above).
  const setView = v => setParam('view', v === 'results' ? null : v)
  const name = r => groupName(r, group, { t, labels })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PeriodBar period={period} onPeriod={v => setParam('period', v === 'this_month' ? null : v)} custom={custom}
        onCustom={c => { setParam('from', c.from || null); setParam('until', c.until || null) }}
        compare={compare} onCompare={v => setParam('compare', v === 'previous' ? null : v)} range={range} compared={compared} />

      <div className="no-print" role="group" aria-label={t('money.views')} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {MONEY_VIEWS.map(v => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            style={{ ...btn, padding: '6px 10px', ...(view === v ? { borderColor: colors.accentText, color: colors.accentText, fontWeight: 700 } : {}) }}>
            {t(`money.view.${v}`)}
          </button>
        ))}
        {!cashView && <Hint id="money-report" label={t('reports.tab.money')} />}
        <span style={{ flex: '1 1 auto' }} />
        {!cashView && view !== 'labour' && currencies.length > 1 && (
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', color: colors.muted, gap: '4px' }}>
            {t('reports.currency')}
            <select value={currency} onChange={e => setPicked(e.target.value)} style={{ ...btn, padding: '6px 8px' }}>
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
      </div>

      {!range ? null : cashView ? (
        <CashReport view={view} {...{ orgId, range, compared, compareLabel, params, setParam, today }} />
      ) : !data ? (
        <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
      ) : data.failed ? (
        <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
      ) : empty ? (
        <EmptyState compact icon={<Wallet size={26} />} title={t('money.empty')} body={t('money.emptyBody')} guide="office-money" />
      ) : view === 'results' ? (
        <Results {...{ orgId, range, row, prevRow, grouped, details, toggleDetails, money, pct, compareLabel, est, currency, currencies, t, fmt }} />
      ) : view === 'margins' ? (
        <Margins {...{ group, setParam, grouped, details, toggleDetails, money, pct, name, sort, setSort, currency, range, t }} />
      ) : (
        <Labour {...{ group, setParam, grouped, row, prevRow, details, toggleDetails, money, number, name, compareLabel, range, t }} />
      )}
    </div>
  )
}

const noteStyle = { fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }
const warnStyle = { fontSize: '13px', color: 'var(--warn)', lineHeight: 1.6, margin: 0 }
const tiles = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }

function Results({ orgId, range, row, prevRow, grouped, details, toggleDetails, money, pct, compareLabel, est, currency, currencies, t, fmt }) {
  const months = monthsOf(range)
  const lines = statementLines(row, { details })
  const prevLines = statementLines(prevRow, { details })
  // The same line in the comparison period (a category by its id)
  const prevOf = l => (l.key === 'category'
    ? -Number((prevRow.overheads_by_category || []).find(c => c.category_id === l.category.category_id)?.amount || 0)
    : prevLines.find(p => p.key === l.key)?.value ?? 0)
  const label = l => (l.key === 'category' ? categoryName(l.category.category_id ? l.category : null, t)
    : l.key.startsWith('kind.') ? t(`lineKind.${l.key.slice(5)}`) : t(`money.line.${l.key}`))
  const chart = months.length > 1
    ? months.map(m => ({ label: fmt(`${m.key}-01`, months.length > 6 ? 'MMM' : 'MMM yy'), value: Number(grouped.find(g => g.group_key === m.key)?.operating_result || 0) }))
    : ['revenue', 'direct_costs', 'gross_margin', 'overheads', 'depreciation', 'operating_result']
      .map(k => ({ label: t(`money.chart.${k}`), value: Number(row[k] || 0) }))
  const others = currencies.filter(c => c !== currency)
  const csv = () => downloadCsv(`${t('money.csvName')} ${range.from} ${range.until}`, statementLines(row, { details: true }).map((l, i) => ({ ...l, i })),
    [{ key: 'line', label: t('money.col.line'), value: l => label(l) },
      { key: 'amount', label: `${t('money.col.thisPeriod')} (${currency})`, value: l => l.value },
      { key: 'previous', label: `${t('money.col.compared')} (${currency})`, value: l => prevOf(l) }], 'csv:reports:money')

  return (
    <>
      <div style={tiles}>
        <NumberTile label={t('money.line.revenue')} value={money(row.revenue)} change={change(row.revenue, prevRow.revenue)} compareLabel={compareLabel} />
        <NumberTile label={t('money.line.grossMargin')} value={money(row.gross_margin)} change={change(row.gross_margin, prevRow.gross_margin)} compareLabel={compareLabel}
          sub={row.margin_pct != null ? t('finance.ofRevenue', { pct: pct(row.margin_pct) }) : null} estimate={est.labour > 0} />
        <NumberTile label={t('money.line.operatingResult')} value={money(row.operating_result)} change={change(row.operating_result, prevRow.operating_result)} compareLabel={compareLabel} estimate={est.any} />
        <NumberTile label={t('finance.negativeGigs')} value={String(row.gigs_negative || 0)} sub={t('finance.ofGigs', { count: row.gigs || 0 })} />
      </div>
      {others.length > 0 && <p style={noteStyle}>{t('money.otherCurrencies', { list: others.join(', ') })}</p>}

      <BarChart title={t(months.length > 1 ? 'money.chart.byMonth' : 'money.chart.steps', { currency })} data={chart} format={money} valueLabel={t('money.line.operatingResult')} />

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv} />
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
          <caption style={{ textAlign: 'left', padding: '10px 12px 0', fontSize: '13px', fontWeight: 700 }}>{t('money.statement', { currency })}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', padding: '8px 10px', fontSize: '11px', color: colors.muted }}>{t('money.col.line')}</th>
              <th scope="col" style={{ textAlign: 'right', padding: '8px 10px', fontSize: '11px', color: colors.muted }}>{t('money.col.thisPeriod')}</th>
              {details && <th scope="col" style={{ textAlign: 'right', padding: '8px 10px', fontSize: '11px', color: colors.muted }}>{t('money.col.compared')}</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.key}-${l.category?.category_id ?? i}`} style={{ borderTop: `1px solid ${colors.border}`, fontWeight: l.strong ? 700 : l.level ? 400 : 600 }}>
                <th scope="row" style={{ textAlign: 'left', padding: '7px 10px', paddingLeft: l.level ? '26px' : '10px', fontWeight: 'inherit', color: l.level ? colors.muted : 'var(--text)' }}>
                  {l.key === 'category'
                    ? <Link to={expensesLink(orgId, range, l.category.category_id)} style={{ color: 'var(--text)' }}>{label(l)}</Link>
                    : label(l)}
                  {l.pct != null && <span style={{ fontWeight: 400, color: colors.muted }}> · {pct(l.pct)}</span>}
                  {l.estimate && <span style={{ fontWeight: 400, color: colors.muted }}> · {t('money.partEstimate')}</span>}
                </th>
                <td style={{ textAlign: 'right', padding: '7px 10px', whiteSpace: 'nowrap', color: l.strong && l.value < 0 ? colors.danger : 'var(--text)' }}>{money(l.value)}</td>
                {details && <td style={{ textAlign: 'right', padding: '7px 10px', whiteSpace: 'nowrap', color: colors.muted }}>{money(prevOf(l))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {est.any && (
        <p style={warnStyle}>
          {[est.labour > 0 && t('money.est.labour', { amount: money(est.labour) }),
            est.depreciation > 0 && t('money.est.depreciation', { amount: money(est.depreciation) }),
            est.cogsMissing > 0 && t(`money.est.cogs.${est.cogsMissing === 1 ? 'one' : 'other'}`, { count: est.cogsMissing })].filter(Boolean).join(' ')}
        </p>
      )}
      {est.withoutAccepted > 0 && <p style={noteStyle}>{t(`money.withoutAccepted.${est.withoutAccepted === 1 ? 'one' : 'other'}`, { count: est.withoutAccepted })}</p>}
      <p style={noteStyle}>{t('money.howResults')} <Link to={`/org/${orgId}/reports?tab=margins`} style={{ color: colors.accentText }}>{t('money.perGig')}</Link></p>
    </>
  )
}

function Margins({ group, setParam, grouped, details, toggleDetails, money, pct, name, sort, setSort, currency, range, t }) {
  const rows = grouped.filter(r => Number(r.revenue) || Number(r.direct_costs) || Number(r.overheads) || Number(r.depreciation))
    .map(r => ({ ...r, id: r.group_key ?? 'none' }))
  const chart = [...rows].filter(r => r.group_key != null).sort((a, b) => Number(b.gross_margin) - Number(a.gross_margin)).slice(0, 12)
    .map(r => ({ label: name(r), value: Number(r.gross_margin) }))
  const columns = [
    { key: 'name', label: t(`reports.group.${group}`), value: r => name(r), left: true },
    { key: 'revenue', label: t('money.line.revenue'), value: r => Number(r.revenue), show: r => money(r.revenue) },
    { key: 'direct', label: t('money.line.directCosts'), value: r => Number(r.direct_costs), show: r => money(r.direct_costs) + (Number(r.labour_estimated) > 0 ? ` (${t('finance.estimate')})` : '') },
    { key: 'margin', label: t('money.line.grossMargin'), value: r => Number(r.gross_margin),
      show: r => <span style={{ color: Number(r.gross_margin) < 0 ? colors.danger : 'var(--text)', fontWeight: 600 }}>{money(r.gross_margin)}</span> },
    { key: 'pct', label: t('finance.col.pct'), value: r => (r.margin_pct == null ? -Infinity : Number(r.margin_pct)), show: r => pct(r.margin_pct) },
    ...(details ? [
      { key: 'gigs', label: t('reports.gigs'), value: r => Number(r.gigs) },
      { key: 'negative', label: t('money.col.negative'), value: r => Number(r.gigs_negative) },
      { key: 'operating', label: t('money.line.operatingResult'), value: r => Number(r.operating_result), show: r => money(r.operating_result) },
    ] : []),
  ]
  const csv = () => downloadCsv(`${t('money.csvName')} ${t(`reports.group.${group}`)} ${range.from} ${range.until}`, rows,
    [...columns.map(c => ({ ...c, csv: c.value })), { key: 'currency', label: t('reports.currency'), value: () => currency }]
      .map(c => (c.key === 'pct' ? { ...c, csv: r => r.margin_pct ?? '' } : c)), 'csv:reports:money')
  return (
    <>
      <div className="no-print" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <GroupBy value={group} options={MARGIN_GROUPS} onChange={v => setParam('by', v === MARGIN_GROUPS[0] ? null : v)} />
        <Link to={`?tab=margins`} style={{ ...btn, textDecoration: 'none' }}>{t('money.perGig')}</Link>
      </div>
      {chart.length > 0 && <BarChart title={t('money.chart.marginBy', { group: t(`reports.group.${group}`), currency })} data={chart} format={money} valueLabel={t('money.line.grossMargin')} />}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv} disabled={!rows.length} />
      </div>
      <ReportTable columns={columns} rows={rows} sort={columns.some(c => c.key === sort.key) ? sort : { key: 'margin', dir: -1 }} onSort={setSort} empty={t('money.empty')} />
      <p style={noteStyle}>{t(group === 'pm' ? 'money.howPm' : 'money.howMargins')}</p>
    </>
  )
}

function Labour({ group, setParam, grouped, row, prevRow, details, toggleDetails, money, number, name, compareLabel, range, t }) {
  const v = labourVariance(row)
  const pv = labourVariance(prevRow)
  const hours = h => t('money.hours', { hours: number(h) })
  const rows = grouped.filter(r => r.group_key != null && (Number(r.hours_planned) || Number(r.labour) || Number(r.hours_actual)))
    .map(r => ({ ...r, id: r.group_key, v: labourVariance(r) }))
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const columns = [
    { key: 'name', label: t(`reports.group.${group}`), value: r => name(r), left: true,
      show: r => (group === 'gig' ? <Link to={`/gig/${r.group_key}`} style={{ color: 'var(--text)' }}>{name(r)}</Link> : name(r)) },
    { key: 'hp', label: t('money.col.hoursPlanned'), value: r => r.v.hoursPlanned, show: r => number(r.v.hoursPlanned) },
    { key: 'ha', label: t('money.col.hoursActual'), value: r => r.v.hoursActual, show: r => number(r.v.hoursActual) },
    { key: 'planned', label: t('finance.col.labourPlanned'), value: r => r.v.planned, show: r => money(r.v.planned) },
    { key: 'actual', label: t('finance.col.labourActual'), value: r => r.v.actual ?? -Infinity, show: r => (r.v.actual == null ? '—' : money(r.v.actual)) },
    { key: 'counted', label: t('money.col.labourCounted'), value: r => r.v.counted, show: r => money(r.v.counted) + (Number(r.labour_estimated) > 0 ? ` (${t('finance.estimate')})` : '') },
    ...(details ? [
      { key: 'days', label: t('money.col.daysPlanned'), value: r => Number(r.days_planned), show: r => number(r.days_planned) },
      { key: 'diff', label: t('money.col.difference'), value: r => r.v.money, show: r => `${r.v.money > 0 ? '+' : r.v.money < 0 ? '−' : ''}${money(Math.abs(r.v.money))}` },
    ] : []),
  ]
  const csv = () => downloadCsv(`${t('money.csvNameLabour')} ${range.from} ${range.until}`, rows,
    columns.map(c => ({ ...c, csv: c.key === 'actual' ? r => r.v.actual ?? '' : c.value })), 'csv:reports:money')
  return (
    <>
      <div style={tiles}>
        <NumberTile label={t('money.tile.hoursActual')} value={hours(v.hoursActual)} sub={t('money.ofPlanned', { amount: hours(v.hoursPlanned) })}
          change={change(v.hoursActual, pv.hoursActual)} compareLabel={compareLabel} />
        <NumberTile label={t('finance.col.labourPlanned')} value={money(v.planned)} change={change(v.planned, pv.planned)} compareLabel={compareLabel} />
        <NumberTile label={t('money.col.labourCounted')} value={money(v.counted)} change={change(v.counted, pv.counted)} compareLabel={compareLabel} estimate={Number(row.labour_estimated) > 0}
          sub={t('money.difference', { amount: `${v.money > 0 ? '+' : v.money < 0 ? '−' : ''}${money(Math.abs(v.money))}` })} />
      </div>
      <div className="no-print" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <GroupBy value={group} options={LABOUR_GROUPS} onChange={g => setParam('by', g === LABOUR_GROUPS[0] ? null : g)} />
        <span style={{ flex: '1 1 auto' }} />
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <ExportButtons onCsv={csv} disabled={!rows.length} />
      </div>
      <ReportTable columns={columns} rows={rows} sort={sort} onSort={setSort} empty={t('money.emptyLabour')} />
      <p style={noteStyle}>{t('money.howLabour')}</p>
    </>
  )
}

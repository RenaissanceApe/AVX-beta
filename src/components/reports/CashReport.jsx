import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectAll } from '../../lib/selectAll'
import { logger, userMessage } from '../../lib/logger'
import { useToast } from '../../lib/ToastContext'
import { monthsOf, change } from '../../lib/analytics/periods'
import {
  SPENDING_GROUPS, AGE_BANDS, OUT_PARTS, MONTHS_AHEAD, currenciesIn, cashByMonth, agedOverdue, monthsAhead, recurringList,
  spendingChanges, forecastOf, targetState, balancesOf,
} from '../../lib/analytics/cash'
import { expensesLink } from '../../lib/analytics/money'
import { shortNumber } from '../../lib/analytics/charts'
import { categoryName } from '../../lib/expenses'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { btn, btnPrimary, card, colors, input, label, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { NumberTile, BarChart, StackedBarChart } from './Charts'
import { GroupBy, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

// Reports → Money, views Cash, Spending and Forecast (K3, docs/ANALYTICS.md). Everything is counted
// in the database (cash_report, spending, client_balance, revenue_forecast, target_progress); the
// browser picks a currency and labels the rows. Simple first; "Show details" adds the parts.

const noteStyle = { fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }
const tiles = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }
const h2 = { fontSize: '15px', fontWeight: 700, margin: 0 }

const all = (name, args) => selectAll(() => supabase.rpc(name, args))

function useLoad(load, deps) {
  const [data, setData] = useState(null)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    setData(null)
    load().then(d => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])
  return [data, () => setVersion(v => v + 1)]
}

// One loaded result → { ...rows, failed } with errors logged
function settle(step, results) {
  const out = { failed: false }
  for (const [k, res] of Object.entries(results)) {
    if (res.error) { logger.error('reports', res.error, { step: `cash:${step}:${k}` }); out.failed = true }
    out[k] = res.data || []
  }
  return out
}

function CurrencyPicker({ currencies, value, onChange }) {
  const { t } = useI18n()
  if (currencies.length < 2) return null
  return (
    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '12px', color: colors.muted, gap: '2px' }}>
      {t('reports.currency')}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...btn, padding: '6px 8px' }}>
        {currencies.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  )
}

export default function CashReport({ view, ...props }) {
  if (view === 'spending') return <Spending {...props} />
  if (view === 'forecast') return <Forecast {...props} />
  return <Cash {...props} />
}

function Loading({ data, children }) {
  const { t } = useI18n()
  if (!data) return <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
  if (data.failed) return <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
  return children
}

// ── Cash ─────────────────────────────────────────────────────────────────────
function Cash({ orgId, range, today }) {
  const { t, lang, fmt } = useI18n()
  const [details, toggleDetails] = useDetails('cash')
  const [picked, setPicked] = useState('')
  const [data] = useLoad(async () => {
    const [cash, balances] = await Promise.all([
      all('cash_report', { p_org: orgId, p_from: range.from, p_until: range.until, p_ahead: MONTHS_AHEAD }),
      all('client_balance', { p_org: orgId }),
    ])
    return settle('cash', { cash, balances })
  }, [orgId, range.from, range.until])

  const rows = data?.cash || []
  const currencies = currenciesIn([...rows, ...(data?.balances || []).map(b => ({ currency: b.currency, amount: b.balance }))])
  const currency = currencies.includes(picked) ? picked : (currencies[0] || 'EUR')
  const money = (v, short) => (short ? shortNumber(v, lang) : formatMoney(v, currency, lang))
  const months = monthsOf(range)
  const byMonth = cashByMonth(rows, currency, months)
  const aged = agedOverdue(rows, currency)
  const ahead = monthsAhead(rows, currency, today)
  const recurring = recurringList(rows, currency)
  const balances = balancesOf(data?.balances, currency)
  const [sort, setSort] = useState({ key: 'balance', dir: -1 })
  const monthLabel = key => fmt(`${key}-01`, months.length > 6 ? 'MMM' : 'MMM yy')
  const sum = k => byMonth.reduce((s, m) => s + m[k], 0)
  const empty = data && !data.failed && !rows.length && !balances.length

  const csv = () => downloadCsv(`${t('cash.csvName')} ${range.from} ${range.until}`, ahead,
    [{ key: 'month', label: t('cash.col.month'), value: m => m.key },
      { key: 'in', label: t('cash.col.expectedIn'), value: m => m.in },
      { key: 'out', label: t('cash.col.expectedOut'), value: m => m.out },
      { key: 'position', label: t('cash.col.position'), value: m => m.position },
      { key: 'currency', label: t('reports.currency'), value: () => currency }], 'csv:reports:cash')

  const balanceColumns = [
    { key: 'name', label: t('cash.col.client'), value: r => r.client_name || t('money.none.client'), left: true },
    { key: 'balance', label: t('cash.col.balance'), value: r => Number(r.balance), show: r => money(r.balance) },
    { key: 'overdue', label: t('cash.col.overdue'), value: r => Number(r.overdue),
      show: r => (Number(r.overdue) > 0 ? <span style={{ color: colors.danger, fontWeight: 600 }}>{money(r.overdue)}</span> : money(0)) },
    ...(details ? [
      { key: 'invoiced', label: t('cash.col.invoiced'), value: r => Number(r.invoiced), show: r => money(r.invoiced) },
      { key: 'deposits', label: t('cash.col.deposits'), value: r => Number(r.deposits), show: r => money(r.deposits) },
      { key: 'credited', label: t('cash.col.credited'), value: r => Number(r.credited), show: r => money(r.credited) },
      { key: 'paid', label: t('cash.col.paid'), value: r => Number(r.paid), show: r => money(r.paid) },
      { key: 'oldest', label: t('cash.col.oldestDue'), value: r => r.oldest_due || '', show: r => (r.oldest_due ? fmt(r.oldest_due, 'd MMM yyyy') : '—') },
    ] : []),
  ]

  return (
    <Loading data={data}>
      {empty ? (
        <EmptyState compact icon={<Banknote size={26} />} title={t('cash.empty')} body={t('cash.emptyBody')} guide="office-cash" />
      ) : (
        <>
          {currencies.length > 1 && (
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <CurrencyPicker currencies={currencies} value={currency} onChange={setPicked} />
            </div>
          )}
          <div style={tiles}>
            <NumberTile label={t('cash.tile.overdue')} value={money(aged.total)} sub={t(`cash.invoices.${aged.count === 1 ? 'one' : 'other'}`, { count: aged.count })} />
            <NumberTile label={t('cash.tile.expectedIn', { count: MONTHS_AHEAD })} value={money(ahead.reduce((s, m) => s + m.in, 0))} />
            <NumberTile label={t('cash.tile.expectedOut', { count: MONTHS_AHEAD })} value={money(ahead.reduce((s, m) => s + m.out, 0))} />
            <NumberTile label={t('cash.tile.received')} value={money(sum('received'))} sub={t('cash.paidOutSub', { amount: money(sum('paidOut')) })} />
          </div>

          <section aria-labelledby="cash-position" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <h2 id="cash-position" style={h2}>{t('cash.position', { count: MONTHS_AHEAD })}</h2>
              <Hint id="cash-report" label={t('money.view.cash')} />
            </div>
            <BarChart title={t('cash.chart.position', { currency })} data={ahead.map(m => ({ label: fmt(`${m.key}-01`, 'MMM yy'), value: m.position }))}
              format={money} valueLabel={t('cash.col.position')} />
            {details && (
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                  <caption style={{ textAlign: 'left', padding: '10px 12px 0', fontSize: '13px', fontWeight: 700 }}>{t('cash.aheadTable', { currency })}</caption>
                  <thead>
                    <tr>
                      <th scope="col" style={th}>{t('cash.col.month')}</th>
                      <th scope="col" style={thR}>{t('cash.col.expectedIn')}</th>
                      {OUT_PARTS.map(p => <th key={p} scope="col" style={thR}>{t(`cash.out.${p}`)}</th>)}
                      <th scope="col" style={thR}>{t('cash.col.position')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ahead.map(m => (
                      <tr key={m.key} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{fmt(`${m.key}-01`, 'MMMM yyyy')}</th>
                        <td style={td}>{money(m.in)}{m.inOverdue > 0 && <span style={{ display: 'block', fontSize: '11px', color: colors.danger }}>{t('cash.ofWhichOverdue', { amount: money(m.inOverdue) })}</span>}</td>
                        {OUT_PARTS.map(p => <td key={p} style={td}>{money(m[p])}</td>)}
                        <td style={{ ...td, fontWeight: 700, color: m.position < 0 ? colors.danger : 'var(--text)' }}>{money(m.position)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={noteStyle}>{t('cash.howPosition')} {t('cash.crewFeesLater')}</p>
          </section>

          <section aria-labelledby="cash-overdue" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 id="cash-overdue" style={{ ...h2, flex: '1 1 auto' }}>{t('cash.overdueByAge')}</h2>
              <Link to={`/org/${orgId}/invoices?view=unpaid`} style={{ fontSize: '13px', color: colors.accentText }}>{t('cash.openInvoices')}</Link>
            </div>
            <BarChart title={t('cash.chart.overdue', { currency })} data={AGE_BANDS.map(b => ({ label: t(`cash.age.${b}`), value: aged[b] }))}
              format={money} valueLabel={t('cash.col.overdue')} />
          </section>

          <section aria-labelledby="cash-in-out" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 id="cash-in-out" style={h2}>{t('cash.inOut')}</h2>
            <StackedBarChart title={t('cash.chart.inOut', { currency })}
              data={byMonth.map(m => ({ label: monthLabel(m.key), values: { received: m.received, paidOut: m.paidOut } }))}
              series={[{ key: 'received', label: t('cash.series.received') }, { key: 'paidOut', label: t('cash.series.paidOut') }]} format={money} />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <DetailsToggle on={details} onToggle={toggleDetails} />
              <span style={{ flex: '1 1 auto' }} />
              <ExportButtons onCsv={csv} />
            </div>
            {details && (
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                  <caption style={{ textAlign: 'left', padding: '10px 12px 0', fontSize: '13px', fontWeight: 700 }}>{t('cash.monthTable', { currency })}</caption>
                  <thead>
                    <tr>
                      <th scope="col" style={th}>{t('cash.col.month')}</th>
                      {['invoiced', 'deposits', 'credited', 'received', 'paidOut'].map(k => <th key={k} scope="col" style={thR}>{t(`cash.col.${k}`)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {byMonth.map(m => (
                      <tr key={m.key} style={{ borderTop: `1px solid ${colors.border}` }}>
                        <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{fmt(`${m.key}-01`, 'MMMM yyyy')}</th>
                        {['invoiced', 'deposits', 'credited', 'received', 'paidOut'].map(k => <td key={k} style={td}>{money(m[k])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={noteStyle}>{t('cash.howInOut')}</p>
          </section>

          {recurring.length > 0 && (
            <section aria-labelledby="cash-recurring" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <h2 id="cash-recurring" style={{ ...h2, flex: '1 1 auto' }}>{t('cash.recurring', { count: MONTHS_AHEAD })}</h2>
                <Link to={`/org/${orgId}/expenses?view=recurring`} style={{ fontSize: '13px', color: colors.accentText }}>{t('cash.openRecurring')}</Link>
              </div>
              <ul style={{ ...card, listStyle: 'none', margin: 0, padding: '4px 12px' }}>
                {recurring.map(r => (
                  <li key={r.id} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: '13px' }}>
                    <span style={{ flex: '1 1 auto', minWidth: 0 }}>{r.label}</span>
                    <span style={{ color: colors.muted, whiteSpace: 'nowrap' }}>{t(`cash.dates.${r.dates === 1 ? 'one' : 'other'}`, { count: r.dates })}</span>
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="cash-clients" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2 id="cash-clients" style={h2}>{t('cash.balances')}</h2>
            <ReportTable columns={balanceColumns} rows={balances} sort={balanceColumns.some(c => c.key === sort.key) ? sort : { key: 'balance', dir: -1 }}
              onSort={setSort} empty={t('cash.noBalances')} />
            <p style={noteStyle}>{t('cash.howBalances')}</p>
          </section>
        </>
      )}
    </Loading>
  )
}

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '11px', color: colors.muted }
const thR = { ...th, textAlign: 'right' }
const td = { textAlign: 'right', padding: '7px 10px', whiteSpace: 'nowrap' }

// ── Spending ─────────────────────────────────────────────────────────────────
function Spending({ orgId, range, compared, compareLabel, params, setParam }) {
  const { t, lang, fmt } = useI18n()
  const [details, toggleDetails] = useDetails('spending')
  const [picked, setPicked] = useState('')
  const [sort, setSort] = useState({ key: 'amount', dir: -1 })
  const group = SPENDING_GROUPS.includes(params.get('by')) ? params.get('by') : SPENDING_GROUPS[0]
  const [data] = useLoad(async () => {
    const [cur, prev] = await Promise.all([
      all('spending', { p_org: orgId, p_from: range.from, p_until: range.asOf || range.until, p_group: group }),
      all('spending', { p_org: orgId, p_from: compared.from, p_until: compared.asOf || compared.until, p_group: group }),
    ])
    return settle('spending', { cur, prev })
  }, [orgId, range.from, range.until, range.asOf, compared.from, compared.until, compared.asOf, group])

  const currencies = currenciesIn(data?.cur)
  const currency = currencies.includes(picked) ? picked : (currencies[0] || 'EUR')
  const money = (v, short) => (short ? shortNumber(v, lang) : formatMoney(v, currency, lang))
  const changes = spendingChanges(data?.cur, data?.prev, currency)
  const total = changes.reduce((s, x) => s + x.now, 0)
  const before = changes.reduce((s, x) => s + x.before, 0)
  const name = r => {
    const k = r.group_key
    if (!k) return t(`spending.none.${group}`)
    if (group === 'category') return categoryName({ name: r.group_label, starter_key: r.starter_key }, t)
    if (group === 'kind') return t(`expenses.kind.${k}`)
    if (group === 'month') return fmt(k, 'MMMM yyyy')
    return r.group_label || k.replace(/^name:/, '')
  }
  const link = r => {
    if (!r.group_key) return null
    if (group === 'category') return expensesLink(orgId, range, r.group_key)
    if (group === 'gig') return `/gig/${r.group_key}`
    return null
  }
  const rows = changes.map(x => ({ ...x, name: name(x.row) }))
  const biggest = rows.filter(x => x.diff !== 0).slice(0, 5)
  const pct = v => (v == null ? t('spending.new') : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 100)}%`)
  const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v))}`
  const columns = [
    { key: 'name', label: t(`reports.group.${group}`), value: r => r.name, left: true,
      show: r => (link(r.row) ? <Link to={link(r.row)} style={{ color: 'var(--text)' }}>{r.name}</Link> : r.name) },
    { key: 'amount', label: t('spending.col.amount'), value: r => r.now, show: r => money(r.now) },
    { key: 'before', label: compareLabel, value: r => r.before, show: r => money(r.before) },
    { key: 'diff', label: t('spending.col.change'), value: r => r.diff, show: r => `${signed(r.diff)} (${pct(r.change)})` },
    ...(details ? [
      { key: 'total', label: t('spending.col.withVat'), value: r => Number(r.row.total || 0), show: r => (r.now ? money(r.row.total) : '—') },
      { key: 'items', label: t('spending.col.items'), value: r => (r.now ? Number(r.row.items || 0) : 0) },
    ] : []),
  ]
  const csv = () => downloadCsv(`${t('spending.csvName')} ${t(`reports.group.${group}`)} ${range.from} ${range.until}`, rows,
    [...columns.map(c => ({ ...c, csv: c.value })), { key: 'currency', label: t('reports.currency'), value: () => currency }], 'csv:reports:spending')

  return (
    <Loading data={data}>
      {data && !data.failed && !rows.length ? (
        <EmptyState compact icon={<Banknote size={26} />} title={t('spending.empty')} body={t('spending.emptyBody')} guide="office-cash" />
      ) : (
        <>
          <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <GroupBy value={group} options={SPENDING_GROUPS} onChange={v => setParam('by', v === SPENDING_GROUPS[0] ? null : v)} />
            <Hint id="spending-report" label={t('money.view.spending')} />
            <span style={{ flex: '1 1 auto' }} />
            <CurrencyPicker currencies={currencies} value={currency} onChange={setPicked} />
          </div>
          <div style={tiles}>
            <NumberTile label={t('spending.tile.total')} value={money(total)} change={change(total, before)} compareLabel={compareLabel} />
          </div>
          <BarChart title={t('spending.chart', { group: t(`reports.group.${group}`), currency })}
            data={[...rows].filter(r => r.now).sort((a, b) => b.now - a.now).slice(0, 12).map(r => ({ label: r.name, value: r.now }))}
            format={money} valueLabel={t('spending.col.amount')} />
          {biggest.length > 0 && (
            <section aria-labelledby="sp-changes" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <h2 id="sp-changes" style={h2}>{t('spending.biggest', { compared: compareLabel })}</h2>
              <ul style={{ ...card, listStyle: 'none', margin: 0, padding: '4px 12px' }}>
                {biggest.map(r => (
                  <li key={r.id || 'none'} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: `1px solid ${colors.border}`, fontSize: '13px' }}>
                    <span style={{ flex: '1 1 auto', minWidth: 0 }}>{r.name}</span>
                    <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{t(r.diff > 0 ? 'spending.up' : 'spending.down', { amount: money(Math.abs(r.diff)), pct: pct(r.change) })}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <DetailsToggle on={details} onToggle={toggleDetails} />
            <span style={{ flex: '1 1 auto' }} />
            <ExportButtons onCsv={csv} disabled={!rows.length} />
          </div>
          {details && <ReportTable columns={columns} rows={rows} sort={columns.some(c => c.key === sort.key) ? sort : { key: 'amount', dir: -1 }} onSort={setSort} empty={t('spending.empty')} />}
          <p style={noteStyle}>{t('spending.how')}</p>
        </>
      )}
    </Loading>
  )
}

// ── Forecast, budgets and targets ────────────────────────────────────────────
function Forecast({ orgId, range }) {
  const { t, lang, fmt } = useI18n()
  const [picked, setPicked] = useState('')
  const [data, reload] = useLoad(async () => {
    const [forecast, progress, cats] = await Promise.all([
      all('revenue_forecast', { p_org: orgId, p_months: MONTHS_AHEAD }),
      all('target_progress', { p_org: orgId, p_from: range.from, p_until: range.until }),
      selectAll(() => supabase.from('expense_categories').select('id, name, starter_key, archived_at').eq('org_id', orgId).order('sort').order('id')),
    ])
    return settle('forecast', { forecast, progress, cats })
  }, [orgId, range.from, range.until])

  const currencies = currenciesIn(data?.forecast, r => Number(r.confirmed) + Number(r.waiting))
  const currency = currencies.includes(picked) ? picked : (currencies[0] || 'EUR')
  const money = (v, short) => (short ? shortNumber(v, lang) : formatMoney(v, currency, lang))
  const f = forecastOf(data?.forecast, currency)
  const rate = v => (v == null ? '—' : `${Math.round(v * 100)}%`)

  return (
    <Loading data={data}>
      <div className="no-print" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Hint id="forecast-report" label={t('money.view.forecast')} />
        <span style={{ flex: '1 1 auto' }} />
        <CurrencyPicker currencies={currencies} value={currency} onChange={setPicked} />
      </div>
      <div style={tiles}>
        <NumberTile label={t('forecast.tile.confirmed', { count: MONTHS_AHEAD })} value={money(f.confirmed)} />
        <NumberTile label={t('forecast.tile.waiting')} value={money(f.waiting)} sub={t(`forecast.quotes.${f.quotes === 1 ? 'one' : 'other'}`, { count: f.quotes })} />
        <NumberTile label={t('forecast.tile.winRate')} value={rate(f.winCount)} sub={t('forecast.byValue', { pct: rate(f.winValue) })} />
      </div>
      {f.months.length > 0 ? (
        <StackedBarChart title={t('forecast.chart', { currency })}
          data={f.months.map(m => ({ label: fmt(`${m.key}-01`, 'MMM yy'), values: { confirmed: m.confirmed, waiting: m.waiting } }))}
          series={[{ key: 'confirmed', label: t('forecast.series.confirmed') }, { key: 'waiting', label: t('forecast.series.waiting') }]} format={money} />
      ) : (
        <EmptyState compact icon={<Banknote size={26} />} title={t('forecast.empty')} body={t('forecast.emptyBody')} guide="office-cash" />
      )}
      <p style={noteStyle}>{t('forecast.how')}</p>
      <Targets orgId={orgId} rows={data?.progress || []} categories={data?.cats || []} onChanged={reload} />
    </Loading>
  )
}

function Targets({ orgId, rows, categories, onChanged }) {
  const { t, lang } = useI18n()
  const { notify } = useToast()
  const [form, setForm] = useState({ kind: 'budget', category: '', amount: '' })
  const [busy, setBusy] = useState(false)
  const live = categories.filter(c => !c.archived_at)
  const taken = useMemo(() => new Set(rows.filter(r => r.kind === 'budget').map(r => r.category_id)), [rows])
  const hasRevenue = rows.some(r => r.kind === 'revenue' && r.currency === 'EUR')
  const save = useCallback(async e => {
    e.preventDefault()
    const amount = Number(String(form.amount).replace(',', '.'))
    if (!(amount > 0) || (form.kind === 'budget' && !form.category)) return
    setBusy(true)
    const { error } = await supabase.from('finance_targets').insert({
      org_id: orgId, kind: form.kind, category_id: form.kind === 'budget' ? form.category : null, amount, currency: 'EUR',
    })
    setBusy(false)
    if (error) { logger.error('reports', error, { step: 'targets:add' }); notify(userMessage(error), 'error'); return }
    setForm({ kind: 'budget', category: '', amount: '' })
    onChanged()
  }, [form, orgId, notify, onChanged])
  const remove = async r => {
    const { error } = await supabase.from('finance_targets').update({ removed_at: new Date().toISOString() }).eq('id', r.target_id)
    if (error) { logger.error('reports', error, { step: 'targets:remove' }); notify(userMessage(error), 'error'); return }
    onChanged()
  }
  const name = r => (r.kind === 'revenue' ? t('targets.revenue') : categoryName({ name: r.category_name, starter_key: r.starter_key }, t))

  return (
    <section aria-labelledby="targets" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <h2 id="targets" style={h2}>{t('targets.title')}</h2>
        <Hint id="finance-targets" label={t('targets.title')} />
      </div>
      {rows.length === 0 ? (
        <EmptyState compact icon={<Banknote size={26} />} title={t('targets.empty')} body={t('targets.emptyBody')} guide="office-cash" />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
          {rows.map(r => {
            const s = targetState(r)
            const money = v => formatMoney(v, r.currency, lang)
            const pct = s.share == null ? 0 : Math.round(s.share * 100)
            const status = r.kind === 'budget'
              ? (s.over ? t('targets.over', { amount: money(-s.left) }) : t('targets.left', { amount: money(s.left) }))
              : (s.left <= 0 ? t('targets.reached') : t('targets.toGo', { amount: money(s.left) }))
            return (
              <li key={r.target_id} style={{ ...card, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '12px', color: colors.muted, flex: '1 1 auto' }}>{name(r)}</span>
                  <button type="button" onClick={() => remove(r)} aria-label={`${t('targets.remove')}: ${name(r)}`} title={t('targets.remove')}
                    className="no-print" style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', padding: 0 }}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700 }}>{money(s.actual)}</div>
                <div role="progressbar" aria-label={name(r)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-valuetext={t('targets.ofTarget', { pct, amount: money(s.target) })}
                  style={{ height: '6px', background: colors.border, position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${Math.min(pct, 100)}%`, background: s.over ? colors.danger : colors.accent }} />
                </div>
                <span style={{ fontSize: '11px', color: colors.muted }}>{t('targets.ofTarget', { pct, amount: money(s.target) })}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: s.over ? colors.danger : 'var(--text)' }}>{status}</span>
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={save} className="no-print" style={{ ...card, padding: '12px 14px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 160px', minWidth: 0 }}>
          <label htmlFor="tg-kind" style={label}>{t('targets.kindLabel')}</label>
          <select id="tg-kind" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} style={input}>
            <option value="budget">{t('targets.kind.budget')}</option>
            {!hasRevenue && <option value="revenue">{t('targets.kind.revenue')}</option>}
          </select>
        </div>
        {form.kind === 'budget' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 180px', minWidth: 0 }}>
            <label htmlFor="tg-cat" style={label}>{t('targets.category')}</label>
            <select id="tg-cat" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={input} required>
              <option value="">{t('targets.pickCategory')}</option>
              {live.filter(c => !taken.has(c.id)).map(c => <option key={c.id} value={c.id}>{categoryName(c, t)}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '0 1 140px', minWidth: 0 }}>
          <label htmlFor="tg-amount" style={label}>{t('targets.amount')}</label>
          <input id="tg-amount" inputMode="decimal" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={input} required />
        </div>
        <button type="submit" disabled={busy} style={btnPrimary}>{t('targets.add')}</button>
      </form>
      <p style={noteStyle}>{t('targets.how')}</p>
    </section>
  )
}

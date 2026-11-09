import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Handshake } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { selectReport } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { periodRange, comparisonRange, change, todayIn, periodKey, comparisonKey } from '../../lib/analytics/periods'
import {
  SALES_VIEWS, WIN_GROUPS, FOLLOW_UP_DAYS, ageBuckets, waitingTotals, currenciesBy, winTotals, topClients, clientMix, clientRows,
} from '../../lib/analytics/sales'
import { shortNumber } from '../../lib/analytics/charts'
import { formatMoney, quoteNumber } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { btn, card, colors, input, label, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { NumberTile, BarChart } from './Charts'
import { PeriodBar, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

const noteStyle = { fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }
const tiles = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }
const h2 = { fontSize: '16px', fontWeight: 700, margin: 0 }
const select = { ...input, width: 'auto', minWidth: 0, maxWidth: '100%', padding: '7px 10px' }

// Reports → Sales (K4): quotes waiting for an answer and the follow-up list, the win rate (by
// period, gig type, client, author, lost reason or a "choice" custom field) and clients. Counted in
// the database (public.sales_waiting, sales_win_rate, sales_clients); simple first, "Show details"
// adds the rest.
export default function SalesReport({ orgId, timeZone, labels, params, setParam }) {
  const { t, lang } = useI18n()
  const [details, toggleDetails] = useDetails('sales')
  const view = SALES_VIEWS.includes(params.get('view')) ? params.get('view') : 'waiting'
  const period = periodKey(params.get('period') || (view === 'waiting' ? 'this_month' : 'last_12_months'))
  const compare = comparisonKey(params.get('compare'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const [picked, setPicked] = useState('')
  const [prefix, setPrefix] = useState('Q')
  const [fields, setFields] = useState([])
  const today = todayIn(timeZone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const compared = useMemo(() => comparisonRange(range, compare), [range, compare])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('organisations').select('quote_number_prefix').eq('id', orgId).maybeSingle(),
      supabase.from('custom_fields').select('id, entity, label, position').eq('org_id', orgId).eq('kind', 'choice').in('entity', ['gig', 'client'])
        .is('removed_at', null).order('position'),
    ]).then(([o, f]) => {
      if (cancelled) return
      setPrefix(o.data?.quote_number_prefix ?? 'Q')
      setFields(f.data || [])
    })
    return () => { cancelled = true }
  }, [orgId])

  const setView = v => setParam('view', v === 'waiting' ? null : v)
  const money = (v, currency, short) => (short ? shortNumber(v, lang) : formatMoney(Number(v) || 0, currency, lang))
  const pct = v => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`)
  const days = v => t('sales.days', { days: Number(v).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: 1 }) })
  const common = { orgId, range, compared, today, details, toggleDetails, money, pct, days, picked, setPicked, t, lang, labels, params, setParam, prefix, fields }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {view !== 'waiting' && (
        <PeriodBar period={period} onPeriod={v => setParam('period', v)} custom={custom}
          onCustom={c => { setParam('from', c.from || null); setParam('until', c.until || null) }}
          compare={compare} onCompare={v => setParam('compare', v === 'previous' ? null : v)} range={range} compared={compared} />
      )}
      <div className="no-print" role="group" aria-label={t('sales.views')} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {SALES_VIEWS.map(v => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            style={{ ...btn, padding: '6px 10px', ...(view === v ? { borderColor: colors.accentText, color: colors.accentText, fontWeight: 700 } : {}) }}>
            {t(`sales.view.${v}`)}
          </button>
        ))}
        <Hint id="sales-report" label={t('reports.tab.sales')} />
      </div>
      {!range ? null : view === 'waiting' ? <Waiting {...common} />
        : view === 'winrate' ? <WinRate {...common} compareLabel={t(`reports.compareShort.${compare}`)} />
          : <Clients {...common} />}
    </div>
  )
}

function CurrencyPicker({ currencies, currency, onPick, t }) {
  if (currencies.length < 2) return null
  return (
    <label style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', color: colors.muted, gap: '4px' }}>
      {t('reports.currency')}
      <select value={currency} onChange={e => onPick(e.target.value)} style={{ ...btn, padding: '6px 8px' }}>
        {currencies.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  )
}

function useRpc(fn, args, deps) {
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

const Loading = ({ t }) => <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
const Failed = ({ t }) => <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>

// ── Waiting for an answer ──────────────────────────────────────────────────
function Waiting({ orgId, today, details, toggleDetails, money, picked, setPicked, t, prefix }) {
  const { fmt } = useI18n()
  const data = useRpc('sales_waiting', { p_org: orgId, p_days: FOLLOW_UP_DAYS }, [orgId, today])
  const [sort, setSort] = useState({ key: 'days', dir: -1 })
  if (!data) return <Loading t={t} />
  if (data.failed) return <Failed t={t} />
  if (!data.rows.length) return <EmptyState compact icon={<Handshake size={26} />} title={t('sales.emptyWaiting')} body={t('sales.emptyWaitingBody')} guide="office-sales" />
  const currencies = currenciesBy(data.rows)
  const currency = currencies.includes(picked) ? picked : currencies[0]
  const tot = waitingTotals(data.rows, currency)
  const rows = data.rows.filter(r => r.currency === currency).map(r => ({ ...r, id: r.quote_id }))
  const follow = rows.filter(r => r.follow_up)
  const chart = ageBuckets(data.rows, currency).map(b => ({ label: t(`sales.age.${b.key}`), value: b.value }))
  const flags = r => [r.opened && t('sales.flag.opened'), r.expiring && t('sales.flag.expiring', Number(r.days_left) > 0 ? { count: Number(r.days_left) } : undefined), r.expired && t('sales.flag.expired')]
    .filter(Boolean).join(' · ')
  const quoteCell = r => <Link to={`/quote/${r.quote_id}`} style={{ color: 'var(--text)' }}>{quoteNumber({ number: r.quote_number }, prefix)} · {r.title}</Link>
  const columns = [
    { key: 'quote', label: t('sales.col.quote'), value: r => r.quote_number, show: quoteCell, left: true },
    { key: 'client', label: t('reports.group.client'), value: r => r.client_name || '', show: r => r.client_name || t('reports.noClient'), left: true },
    { key: 'days', label: t('sales.col.days'), value: r => Number(r.days_waiting) },
    { key: 'value', label: t('sales.col.value'), value: r => Number(r.value), show: r => money(r.value, currency) },
    { key: 'flags', label: t('sales.col.state'), value: r => flags(r), left: true },
    ...(details ? [
      { key: 'sent', label: t('sales.col.sent'), value: r => r.sent_on || '', show: r => (r.sent_on ? fmt(r.sent_on, 'd MMM yyyy') : '—') },
      { key: 'valid', label: t('sales.col.validUntil'), value: r => r.valid_until || '', show: r => (r.valid_until ? fmt(r.valid_until, 'd MMM yyyy') : '—') },
      { key: 'author', label: t('reports.group.author'), value: r => r.author_name || '', left: true },
    ] : []),
  ]
  const csv = () => downloadCsv(`${t('sales.csvName.waiting')} ${today}`, rows,
    [...columns.map(c => ({ ...c, csv: c.key === 'quote' ? r => `${quoteNumber({ number: r.quote_number }, prefix)} ${r.title}` : c.value })),
      { key: 'currency', label: t('reports.currency'), value: () => currency }], 'csv:reports:sales')
  return (
    <>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <p style={{ ...noteStyle, flex: '1 1 240px' }}>{t('sales.asOfToday', { date: fmt(today, 'd MMM yyyy') })}</p>
        <CurrencyPicker currencies={currencies} currency={currency} onPick={setPicked} t={t} />
      </div>
      <div style={tiles}>
        <NumberTile label={t('sales.tile.waiting')} value={money(tot.value, currency)} sub={t(`reports.tileSub.quotes.${tot.waiting === 1 ? 'one' : 'other'}`, { count: tot.waiting })} />
        <NumberTile label={t('sales.tile.followUp', { days: FOLLOW_UP_DAYS })} value={String(tot.followUp)} sub={money(tot.followUpValue, currency)} />
        <NumberTile label={t('sales.tile.opened')} value={String(tot.opened)} sub={t('sales.ofWaiting', { count: tot.waiting })} />
        <NumberTile label={t('sales.tile.expiring')} value={String(tot.expiring)} sub={t('sales.withinDays')} />
      </div>
      <BarChart title={t('sales.chart.byAge', { currency })} data={chart} format={v => money(v, currency)} valueLabel={t('sales.col.value')} />

      <section aria-labelledby="sl-follow" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 id="sl-follow" style={{ ...h2, flex: '1 1 auto' }}>{t('sales.followUpList', { days: FOLLOW_UP_DAYS })}</h2>
          <Link to={`/org/${orgId}/quotes?status=follow_up`} className="no-print" style={{ fontSize: '13px', color: colors.accentText }}>{t('sales.openInQuotes')}</Link>
        </div>
        {follow.length === 0 ? <p style={noteStyle}>{t('sales.noFollowUp')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[...follow].sort((a, b) => b.days_waiting - a.days_waiting).map(r => (
              <li key={r.quote_id}>
                <Link to={`/quote/${r.quote_id}`} style={{ ...card, padding: '9px 12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', color: 'var(--text)', textDecoration: 'none' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: colors.soft }}>{quoteNumber({ number: r.quote_number }, prefix)}</span>
                  <span style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', overflowWrap: 'anywhere' }}>{r.title}</span>
                    <span style={{ display: 'block', fontSize: '13px', color: colors.muted }}>
                      {[r.client_name || t('reports.noClient'), t('sales.daysWaiting', { count: Number(r.days_waiting) }), flags(r)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px' }}>{money(r.value, currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv} disabled={!rows.length} />
      </div>
      {details && <ReportTable columns={columns} rows={rows} sort={columns.some(c => c.key === sort.key) ? sort : { key: 'days', dir: -1 }} onSort={setSort}
        caption={t('sales.allWaiting', { currency })} empty={t('sales.emptyWaiting')} />}
      {tot.expired > 0 && <p style={noteStyle}>{t(`sales.expiredNote.${tot.expired === 1 ? 'one' : 'other'}`, { count: tot.expired, amount: money(tot.expiredValue, currency) })}</p>}
      <p style={noteStyle}>{t('sales.howWaiting', { days: FOLLOW_UP_DAYS })}</p>
    </>
  )
}

// ── Win rate ───────────────────────────────────────────────────────────────
function WinRate({ orgId, range, compared, compareLabel, details, toggleDetails, money, pct, days, picked, setPicked, t, labels, params, setParam, fields }) {
  const { fmt } = useI18n()
  const fieldGroups = fields.map(f => `field:${f.id}`)
  const groups = [...WIN_GROUPS, ...fieldGroups]
  const group = groups.includes(params.get('by')) ? params.get('by') : 'month'
  const until = range.asOf || range.until
  const cur = useRpc('sales_win_rate', { p_org: orgId, p_from: range.from, p_until: until, p_group: 'total' }, [orgId, range.from, until])
  const prev = useRpc('sales_win_rate', { p_org: orgId, p_from: compared.from, p_until: compared.asOf || compared.until, p_group: 'total' }, [orgId, compared.from, compared.until, compared.asOf])
  const grouped = useRpc('sales_win_rate', { p_org: orgId, p_from: range.from, p_until: until, p_group: group }, [orgId, range.from, until, group])
  const lost = useRpc('sales_win_rate', { p_org: orgId, p_from: range.from, p_until: until, p_group: 'lost_reason' }, [orgId, range.from, until])
  const [pickedSort, setSort] = useState(null)
  if (!cur || !prev || !grouped || !lost) return <Loading t={t} />
  if (cur.failed || prev.failed || grouped.failed || lost.failed) return <Failed t={t} />
  if (!cur.rows.length) return <EmptyState compact icon={<Handshake size={26} />} title={t('sales.emptyWin')} body={t('sales.emptyWinBody')} guide="office-sales" />
  const currencies = currenciesBy(cur.rows, r => Number(r.value_accepted) + Number(r.value_declined))
  const currency = currencies.includes(picked) ? picked : currencies[0]
  const w = winTotals(cur.rows, currency)
  const pw = winTotals(prev.rows, currency)
  const row = cur.rows.find(r => r.currency === currency) || {}
  const groupLabel = g => (g.startsWith('field:') ? fields.find(f => `field:${f.id}` === g)?.label || g : t(`reports.group.${g === 'gig_type' ? 'gigType' : g}`))
  const name = r => {
    const k = r.group_key
    if (k == null) return t(`sales.none.${group.startsWith('field:') ? 'field' : group}`)
    if (group === 'month') return fmt(`${k}-01`, 'MMM yyyy')
    if (group === 'gig_type') return (labels.types || []).find(x => x.id === k)?.name || r.group_label || k
    if (group === 'lost_reason') return t(`lost.reasons.${k}`)
    if (group === 'author') return r.group_label || t('money.unnamed')
    return r.group_label || k
  }
  // Counts add up across currencies; money columns show the picked currency
  const byKey = new Map()
  for (const r of grouped.rows) {
    const k = r.group_key ?? ''
    const e = byKey.get(k) || { ...r, id: k || 'none', rows: [] }
    e.rows.push(r)
    byKey.set(k, e)
  }
  const rows = [...byKey.values()].map(e => ({ ...e, w: winTotals(e.rows, currency), money: e.rows.find(r => r.currency === currency) || {} }))
  const chartRows = group === 'month' || group === 'quarter' ? [...rows].filter(r => r.group_key).sort((a, b) => a.group_key.localeCompare(b.group_key))
    : [...rows].sort((a, b) => b.w.decided - a.w.decided).slice(0, 12)
  const chart = chartRows.map(r => ({ label: name(r), value: Math.round((r.w.byCount ?? 0) * 100) }))
  const byDate = group === 'month' || group === 'quarter'
  const sort = pickedSort && pickedSort.group === group ? pickedSort : (byDate ? { key: 'name', dir: 1 } : { key: 'decided', dir: -1 })
  const columns = [
    { key: 'name', label: groupLabel(group), value: r => (byDate ? r.group_key || '' : name(r)), show: r => name(r), left: true },
    { key: 'decided', label: t('sales.col.decided'), value: r => r.w.decided },
    { key: 'rate', label: t('sales.col.byCount'), value: r => r.w.byCount ?? -1, show: r => pct(r.w.byCount) },
    { key: 'rateValue', label: t('sales.col.byValue'), value: r => r.w.byValue ?? -1, show: r => pct(r.w.byValue) },
    { key: 'won', label: t('sales.col.valueWon'), value: r => r.w.valueAccepted, show: r => money(r.w.valueAccepted, currency) },
    ...(details ? [
      { key: 'accepted', label: t('sales.col.accepted'), value: r => r.w.accepted },
      { key: 'declined', label: t('sales.col.declined'), value: r => r.w.declined },
      { key: 'median', label: t('sales.col.median'), value: r => (r.money.median_days == null ? -1 : Number(r.money.median_days)), show: r => (r.money.median_days == null ? '—' : days(r.money.median_days)) },
      { key: 'avg', label: t('sales.col.avgValue'), value: r => Number(r.money.avg_value || 0), show: r => money(r.money.avg_value, currency) },
      { key: 'discount', label: t('sales.col.discount'), value: r => r.w.discount, show: r => money(r.w.discount, currency) },
    ] : []),
  ]
  const lostRows = lost.rows.filter(r => r.group_key && Number(r.declined) > 0)
  const lostBy = new Map()
  for (const r of lostRows) {
    const e = lostBy.get(r.group_key) || { key: r.group_key, count: 0, value: 0 }
    e.count += Number(r.declined)
    if (r.currency === currency) e.value += Number(r.value_declined)
    lostBy.set(r.group_key, e)
  }
  const notSaid = lost.rows.filter(r => !r.group_key).reduce((s, r) => s + Number(r.declined), 0)
  const csv = () => downloadCsv(`${t('sales.csvName.winrate')} ${groupLabel(group)} ${range.from} ${range.until}`, rows,
    [...columns.map(c => ({ ...c, csv: c.value })), { key: 'currency', label: t('reports.currency'), value: () => currency }], 'csv:reports:sales')
  return (
    <>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
        <CurrencyPicker currencies={currencies} currency={currency} onPick={setPicked} t={t} />
      </div>
      <div style={tiles}>
        <NumberTile label={t('sales.tile.winByCount')} value={pct(w.byCount)} change={w.byCount != null && pw.byCount ? change(w.byCount, pw.byCount) : null} compareLabel={compareLabel}
          sub={t('sales.wonOf', { won: w.accepted, count: w.decided })} />
        <NumberTile label={t('sales.tile.winByValue')} value={pct(w.byValue)} change={w.byValue != null && pw.byValue ? change(w.byValue, pw.byValue) : null} compareLabel={compareLabel}
          sub={t('sales.wonAmount', { amount: money(w.valueAccepted, currency) })} />
        <NumberTile label={t('sales.tile.median')} value={row.median_days == null ? '—' : days(row.median_days)} />
        <NumberTile label={t('sales.tile.avgValue')} value={money(row.avg_value, currency)} />
        <NumberTile label={t('sales.tile.discounts')} value={money(w.discount, currency)}
          sub={w.gross > 0 ? t('sales.discountOf', { gross: money(w.gross, currency), pct: pct(w.discountPct) }) : null} />
      </div>
      {currencies.length > 1 && <p style={noteStyle}>{t('sales.countsAllCurrencies')}</p>}

      <div className="no-print" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: '0 1 220px' }}>
          <label htmlFor="sl-group" style={{ ...label, marginBottom: 0 }}>{t('reports.groupBy')}</label>
          <select id="sl-group" value={group} onChange={e => setParam('by', e.target.value === 'month' ? null : e.target.value)} style={select}>
            {groups.map(g => <option key={g} value={g}>{groupLabel(g)}</option>)}
          </select>
        </div>
      </div>
      {chart.length > 0 && <BarChart title={t('sales.chart.winBy', { group: groupLabel(group) })} data={chart} format={v => `${v}%`} valueLabel={t('sales.col.byCount')} />}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv} disabled={!rows.length} />
      </div>
      <ReportTable columns={columns} rows={rows} sort={columns.some(c => c.key === sort.key) ? sort : { key: 'decided', dir: -1 }} onSort={v => setSort({ ...v, group })} empty={t('sales.emptyWin')} />

      <section aria-labelledby="sl-lost" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h2 id="sl-lost" style={h2}>{t('sales.lostReasons')}</h2>
        {lostBy.size === 0 && !notSaid ? <p style={noteStyle}>{t('sales.noLost')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
            {[...lostBy.values()].sort((a, b) => b.count - a.count).map(e => (
              <li key={e.key} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 160px' }}>{t(`lost.reasons.${e.key}`)}</span>
                <span style={{ color: colors.muted }}>{t(`sales.quotesCount.${e.count === 1 ? 'one' : 'other'}`, { count: e.count })} · {money(e.value, currency)}</span>
              </li>
            ))}
            {notSaid > 0 && <li style={{ color: colors.muted }}>{t(`sales.notSaid.${notSaid === 1 ? 'one' : 'other'}`, { count: notSaid })}</li>}
          </ul>
        )}
      </section>
      <p style={noteStyle}>{t('sales.howWin')}</p>
    </>
  )
}

// ── Clients ────────────────────────────────────────────────────────────────
function Clients({ orgId, range, today, details, toggleDetails, money, pct, picked, setPicked, t, lang }) {
  const { fmt } = useI18n()
  const until = range.asOf || range.until
  const data = useRpc('sales_clients', { p_org: orgId, p_from: range.from, p_until: until }, [orgId, range.from, until, today])
  const [sort, setSort] = useState({ key: 'revenue', dir: -1 })
  if (!data) return <Loading t={t} />
  if (data.failed) return <Failed t={t} />
  const currencies = currenciesBy(data.rows, r => r.revenue)
  const currency = currencies.includes(picked) ? picked : (currencies[0] || 'EUR')
  const rows = clientRows(data.rows, currency).filter(r => Number(r.revenue) || Number(r.gigs) || Number(r.quotes) || Number(r.decided)).map(r => ({ ...r, id: r.client_key }))
  if (!rows.length) return <EmptyState compact icon={<Handshake size={26} />} title={t('sales.emptyClients')} body={t('sales.emptyClientsBody')} guide="office-sales" />
  const top = topClients(data.rows, currency)
  const mix = clientMix(data.rows)
  const day = d => (d ? fmt(d, 'd MMM yyyy') : '—')
  const chart = [...rows].filter(r => Number(r.revenue) > 0).sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 10)
    .map(r => ({ label: r.client_name || '—', value: Number(r.revenue) }))
  const columns = [
    { key: 'name', label: t('reports.group.client'), value: r => r.client_name || '', left: true,
      show: r => <>{r.client_name || '—'}{r.is_new && <span style={{ fontSize: '11px', color: colors.accentText }}> · {t('sales.new')}</span>}</> },
    { key: 'revenue', label: t('money.line.revenue'), value: r => Number(r.revenue), show: r => money(r.revenue, currency) },
    { key: 'margin', label: t('money.line.grossMargin'), value: r => Number(r.gross_margin),
      show: r => <span style={{ color: Number(r.gross_margin) < 0 ? colors.danger : 'var(--text)' }}>{money(r.gross_margin, currency)}{r.margin_pct != null ? ` · ${Number(r.margin_pct).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')}%` : ''}</span> },
    { key: 'gigs', label: t('reports.gigs'), value: r => Number(r.gigs) },
    { key: 'avg', label: t('sales.col.avgGig'), value: r => Number(r.avg_gig_value ?? -1), show: r => (r.avg_gig_value == null ? '—' : money(r.avg_gig_value, currency)) },
    ...(details ? [
      { key: 'quotes', label: t('sales.col.quotesSent'), value: r => Number(r.quotes) },
      { key: 'rate', label: t('sales.col.byCount'), value: r => (r.win_rate_count == null ? -1 : Number(r.win_rate_count)), show: r => pct(r.win_rate_count) },
      { key: 'first', label: t('sales.col.firstGig'), value: r => r.first_gig || '', show: r => day(r.first_gig) },
      { key: 'last', label: t('sales.col.lastGig'), value: r => r.last_gig || '', show: r => day(r.last_gig) },
      { key: 'next', label: t('sales.col.nextGig'), value: r => r.next_gig || '', show: r => day(r.next_gig) },
    ] : []),
  ]
  const csv = () => downloadCsv(`${t('sales.csvName.clients')} ${range.from} ${range.until}`, rows,
    [...columns.map(c => ({ ...c, csv: c.value })),
      { key: 'new', label: t('sales.new'), value: r => (r.is_new ? 1 : 0) }, { key: 'returning', label: t('sales.returning'), value: r => (r.is_returning ? 1 : 0) },
      { key: 'currency', label: t('reports.currency'), value: () => currency }], 'csv:reports:sales')
  return (
    <>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
        <CurrencyPicker currencies={currencies} currency={currency} onPick={setPicked} t={t} />
      </div>
      <div style={tiles}>
        <NumberTile label={t('sales.tile.top5')} value={money(top.amount, currency)} sub={top.share == null ? null : t('sales.ofRevenue', { pct: pct(top.share) })} />
        <NumberTile label={t('sales.tile.withGigs')} value={String(mix.withGigs)} />
        <NumberTile label={t('sales.tile.new')} value={String(mix.new)} />
        <NumberTile label={t('sales.tile.returning')} value={String(mix.returning)} />
      </div>
      {chart.length > 0 && <BarChart title={t('sales.chart.topClients', { currency })} data={chart} format={v => money(v, currency)} valueLabel={t('money.line.revenue')} />}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv} disabled={!rows.length} />
      </div>
      <ReportTable columns={columns} rows={rows} sort={columns.some(c => c.key === sort.key) ? sort : { key: 'revenue', dir: -1 }} onSort={setSort} empty={t('sales.emptyClients')} />
      <p style={noteStyle}>{t('sales.howClients')} <Link to={`/org/${orgId}/contacts`} style={{ color: colors.accentText }}>{t('nav.contacts')}</Link></p>
    </>
  )
}

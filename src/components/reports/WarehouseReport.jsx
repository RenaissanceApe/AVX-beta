import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Truck, Wrench, ScanLine } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { retryOnce } from '../../lib/selectAll'
import { logger } from '../../lib/logger'
import { periodRange, todayIn, periodKey } from '../../lib/analytics/periods'
import { pctText, durationParts } from '../../lib/analytics/ops'
import {
  WAREHOUSE_VIEWS, DEMAND_FILTERS, DAMAGE_GROUPS, demandRows, demandTotals, peakBars, confirmRate, dispatchLeadBars,
  scanBars, outShare, damageRows,
} from '../../lib/analytics/warehouse'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { btn, colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { Hint } from '../help/HelpParts'
import { NumberTile, BarChart } from './Charts'
import { PeriodBar, GroupBy, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

const FUNCTIONS = { demand: 'warehouse_demand', suppliers: 'warehouse_suppliers', damage: 'warehouse_damage', dispatch: 'warehouse_dispatch' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }
const note = { fontSize: '12px', color: colors.muted, lineHeight: 1.6, margin: 0 }
const h3 = { fontSize: '14px', fontWeight: 700, margin: '6px 0 0' }
const link = { color: 'var(--text)' }

// Reports → Warehouse (K6): demand against stock, suppliers, damage and loss, dispatch, counted in
// the database (public.warehouse_*). The whole period counts, days still to come included
// (bookings are planned ahead). Money (book value, spend, repair and loss costs) comes back only for
// those who see it; the others get counts.
export default function WarehouseReport({ orgId, timeZone, params, setParam }) {
  const { t, lang, fmt } = useI18n()
  const view = WAREHOUSE_VIEWS.includes(params.get('view')) ? params.get('view') : 'demand'
  const [details, toggleDetails] = useDetails(`warehouse-${view}`)
  const period = periodKey(params.get('period'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const filter = DEMAND_FILTERS.includes(params.get('show')) ? params.get('show') : 'short'
  const by = DAMAGE_GROUPS.includes(params.get('by')) ? params.get('by') : 'item'
  const today = todayIn(timeZone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const [data, setData] = useState(null)
  const [sort, setSort] = useState({ key: 'days_short', dir: -1 })

  useEffect(() => {
    if (!range) return
    let cancelled = false
    setData(null)
    retryOnce(() => supabase.rpc(FUNCTIONS[view], { p_org: orgId, p_from: range.from, p_until: range.until })).then(({ data: d, error }) => {
      if (cancelled) return
      if (error) logger.error('reports', error, { step: `warehouse:${view}` })
      setData({ cur: d, failed: !!error, tooLong: error?.code === '22023' })
    })
    return () => { cancelled = true }
  }, [orgId, view, range])

  const num = v => (Number(v) || 0).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')
  const money = v => (v == null ? '—' : formatMoney(Number(v) || 0, 'EUR', lang))
  const pct = v => pctText(v, lang)
  const days = v => (v == null ? '—' : t('ops.duration.days', { n: num(Math.round(Number(v) * 10) / 10) }))
  const duration = h => {
    const d = durationParts(h)
    return d ? t(`ops.duration.${d.unit}`, { n: d.value.toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB') }) : '—'
  }
  const date = v => (v ? fmt(v, 'd MMM yyyy') : '—')
  // Days between the first out scan and the gig's start: "2 days before", or after the start
  const lead = v => {
    if (v == null) return '—'
    const n = Math.round(Number(v) * 10) / 10
    return n < 0 ? t('wh.daysAfter', { count: -n }) : t('wh.daysBefore', { count: n })
  }
  const itemLink = r => <Link to={`/org/${orgId}/inventory/${r.item_id}`} style={link}>{r.name}</Link>

  let body = null
  if (!range) body = null
  else if (!data) body = <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
  else if (data.tooLong) body = <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('wh.tooLong')}</p>
  else if (data.failed) body = <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
  else if (view === 'demand') body = demandView()
  else if (view === 'suppliers') body = suppliersView()
  else if (view === 'damage') body = damageView()
  else body = dispatchView()

  function demandView() {
    const cur = data.cur || {}
    const items = cur.items || []
    if (!items.length) return <EmptyState compact icon={<Boxes size={26} />} title={t('wh.emptyDemand')} body={t('wh.emptyDemandBody')} guide="warehouse-numbers" />
    const tot = demandTotals(items)
    const bars = peakBars(items)
    const columns = [
      { key: 'name', label: t('reports.group.item'), left: true, value: r => r.name || '', show: itemLink },
      { key: 'owned', label: t('wh.col.ownedNow'), value: r => Number(r.owned) },
      { key: 'peak', label: t('wh.col.peak'), value: r => Number(r.peak_booked),
        show: r => (Number(r.peak_booked) ? `${num(r.peak_booked)} · ${date(r.peak_day)}` : '—') },
      { key: 'owned_then', label: t('wh.col.ownedThen'), value: r => Number(r.owned_at_peak ?? -1), show: r => (r.owned_at_peak == null ? '—' : num(r.owned_at_peak)) },
      { key: 'hired_then', label: t('wh.col.hiredThen'), value: r => Number(r.hired_at_peak) },
      { key: 'days_over', label: t('wh.col.daysOver'), value: r => Number(r.days_over) },
      { key: 'days_short', label: t('wh.col.daysShort'), value: r => Number(r.days_short),
        show: r => <span style={{ color: Number(r.days_short) ? colors.danger : 'var(--text)', fontWeight: Number(r.days_short) ? 700 : 400 }}>{num(r.days_short)}</span> },
      { key: 'hire_ins', label: t('wh.col.hireIns'), value: r => Number(r.hire_ins),
        show: r => (Number(r.hire_ins) ? <Link to={`/org/${orgId}/reports?tab=equipment&view=buy&item=${r.item_id}`} style={link}>{num(r.hire_ins)}</Link> : '0') },
      { key: 'last', label: t('wh.col.lastConfirmed'), left: true, value: r => r.last_confirmed || '', show: r => date(r.last_confirmed) },
      ...(cur.money ? [{ key: 'book', label: t('wh.col.bookValue'), value: r => Number(r.book_value ?? -1),
        show: r => (r.book_value == null ? '—' : `${money(r.book_value)}${r.book_value_estimated ? ' *' : ''}`) }] : []),
      { key: 'idle', label: t('wh.col.sell'), left: true, value: r => (r.idle ? 1 : 0), show: r => (r.idle ? t('wh.sell') : '') },
    ]
    const rows = demandRows(items, filter).map(r => ({ ...r, id: r.item_id }))
    return (
      <>
        <div style={grid}>
          <NumberTile label={t('wh.overStock')} value={num(tot.over)} sub={t('wh.overStockSub')} />
          <NumberTile label={t('wh.stillShort')} value={num(tot.short)} sub={t('wh.stillShortSub')} />
          <NumberTile label={t('wh.hireIns')} value={num(tot.hireIns)} />
          <NumberTile label={t('wh.idle')} value={num(tot.idle)} sub={tot.idleValue == null ? t('wh.idleSub') : t('wh.idleValue', { amount: money(tot.idleValue) })} />
        </div>
        {bars.length > 0 && <BarChart title={t('wh.chart.peak')} format={num} valueLabel={t('wh.col.peak')}
          data={bars.map(r => ({ label: t('wh.peakLabel', { name: r.name, owned: num(r.owned_at_peak) }), value: Number(r.peak_booked) }))} />}
        {toolbar(() => downloadCsv(`${t('wh.csvName.demand')} ${range.from}`, demandRows(items, 'all'), columns.map(c => ({ ...c, csv: c.value })), 'csv:reports:warehouse'))}
        {details && (
          <>
            <div className="no-print" role="group" aria-label={t('wh.show')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {DEMAND_FILTERS.map(f => (
                <button key={f} type="button" onClick={() => setParam('show', f === 'short' ? null : f)} aria-pressed={filter === f}
                  style={{ ...btn, padding: '5px 10px', fontSize: '12px', ...(filter === f ? { borderColor: colors.accentText, color: colors.accentText, fontWeight: 700 } : {}) }}>
                  {t(`wh.filter.${f}`)}
                </button>
              ))}
            </div>
            <ReportTable caption={t(`wh.filter.${filter}`)} columns={columns} rows={rows} sort={sort} onSort={setSort} empty={t(`wh.emptyFilter.${filter}`)} />
          </>
        )}
        <p style={note}>{t('wh.howDemand')}</p>
      </>
    )
  }

  function suppliersView() {
    const cur = data.cur || {}
    const tot = cur.totals || {}
    const list = cur.suppliers || []
    if (!list.length) return <EmptyState compact icon={<Truck size={26} />} title={t('wh.emptySuppliers')} body={t('wh.emptySuppliersBody')} guide="warehouse-numbers" />
    const columns = [
      { key: 'name', label: t('wh.col.supplier'), left: true, value: r => r.name || '' },
      ...(cur.money ? [{ key: 'spend', label: t('wh.col.spend'), value: r => Number(r.spend), show: r => money(r.spend) }] : []),
      { key: 'requests', label: t('wh.col.requests'), value: r => Number(r.requests) },
      { key: 'confirmed', label: t('wh.col.confirmed'), value: r => Number(r.confirmed) },
      { key: 'declined', label: t('wh.col.declined'), value: r => Number(r.declined) },
      { key: 'waiting', label: t('wh.col.waiting'), value: r => Number(r.waiting) },
      { key: 'answer', label: t('wh.col.answerTime'), value: r => Number(r.median_answer_hours ?? -1), show: r => duration(r.median_answer_hours) },
    ]
    const chart = list.filter(r => (cur.money ? Number(r.spend) : Number(r.requests)) > 0).slice(0, 10)
    return (
      <>
        <div style={grid}>
          {cur.money && <NumberTile label={t('wh.spend')} value={money(tot.spend)} />}
          <NumberTile label={t('wh.requests')} value={num(tot.requests)} sub={t('wh.requestsSub', { waiting: Number(tot.waiting) || 0, cancelled: Number(tot.cancelled) || 0 })} />
          <NumberTile label={t('wh.confirmRate')} value={pct(confirmRate(tot))} sub={t('wh.confirmRateSub', { confirmed: Number(tot.confirmed) || 0, declined: Number(tot.declined) || 0 })} />
          <NumberTile label={t('wh.answerTime')} value={duration(tot.median_answer_hours)} sub={t('wh.answerTimeSub', { count: Number(tot.answered) || 0 })} />
        </div>
        {chart.length > 0 && <BarChart title={cur.money ? t('wh.chart.spend') : t('wh.chart.requests')} format={cur.money ? money : num}
          valueLabel={cur.money ? t('wh.col.spend') : t('wh.col.requests')}
          data={chart.map(r => ({ label: r.name, value: Number(cur.money ? r.spend : r.requests) }))} />}
        {toolbar(() => downloadCsv(`${t('wh.csvName.suppliers')} ${range.from}`, list, columns.map(c => ({ ...c, csv: c.value })), 'csv:reports:warehouse'))}
        {details && <ReportTable caption={t('wh.perSupplier')} columns={columns} rows={list.map(r => ({ ...r, id: r.supplier_id }))}
          sort={sort.key in { name: 1, spend: 1, requests: 1, confirmed: 1, declined: 1, waiting: 1, answer: 1 } ? sort : { key: cur.money ? 'spend' : 'requests', dir: -1 }}
          onSort={setSort} empty={t('wh.emptySuppliers')} />}
        <p style={note}>{t('wh.howSuppliers')} <Link to={`/org/${orgId}/inventory?tab=subrentals`} style={{ color: colors.accentText }}>{t('wh.openSubrentals')}</Link></p>
      </>
    )
  }

  function damageView() {
    const cur = data.cur || {}
    const rep = cur.repairs || {}
    const loss = cur.losses || {}
    const ins = cur.inspections || {}
    if (!Number(rep.count) && !Number(loss.units) && !Number(loss.bulk) && !Number(ins.done) && !Number(ins.overdue) && !Number(ins.due_30) && !Number(ins.never)) {
      return <EmptyState compact icon={<Wrench size={26} />} title={t('wh.emptyDamage')} body={t('wh.emptyDamageBody')} guide="warehouse-numbers" />
    }
    const nameCol = by === 'gig'
      ? { key: 'name', label: t('reports.group.gig'), left: true, value: r => r.name || '', show: r => <Link to={`/gig/${r.gig_id}`} style={link}>{r.name}</Link> }
      : by === 'client'
        ? { key: 'name', label: t('wh.col.client'), left: true, value: r => r.name || '', show: r => r.name || t('wh.noClient') }
        : { key: 'name', label: t('reports.group.item'), left: true, value: r => r.name || '', show: itemLink }
    const columns = [
      nameCol,
      ...(by === 'gig' ? [{ key: 'client', label: t('wh.col.client'), left: true, value: r => r.client || '' }] : []),
      { key: 'repairs', label: t('wh.col.repairs'), value: r => Number(r.repairs) },
      ...(by === 'item' ? [
        { key: 'open', label: t('wh.col.open'), value: r => Number(r.open) },
        { key: 'md', label: t('wh.col.repairDays'), value: r => Number(r.median_days ?? -1), show: r => days(r.median_days) },
      ] : [{ key: 'lost', label: t('wh.col.lost'), value: r => Number(r.lost) }]),
      ...(cur.money ? [
        { key: 'cost', label: t('wh.col.cost'), value: r => Number(r.cost), show: r => money(r.cost) },
        { key: 'charged', label: t('wh.col.charged'), value: r => Number(r.charged), show: r => money(r.charged) },
        ...(by === 'item' ? [] : [{ key: 'lost_value', label: t('wh.col.lostValue'), value: r => Number(r.lost_value), show: r => money(r.lost_value) }]),
      ] : []),
    ]
    const rows = damageRows(cur, by)
    const top = (cur.by_item || []).slice(0, 10)
    return (
      <>
        <div style={grid}>
          <NumberTile label={t('wh.repairs')} value={num(rep.count)} sub={t('wh.repairsSub', { open: Number(rep.open) || 0, units: Number(rep.units) || 0 })} />
          <NumberTile label={t('wh.repairTime')} value={days(rep.median_days)} sub={t('wh.repairTimeSub', { count: Number(rep.done) || 0 })} />
          {cur.money && <NumberTile label={t('wh.repairCost')} value={money(rep.cost)} sub={t('wh.chargedBack', { amount: money(rep.charged) })} />}
          <NumberTile label={t('wh.losses')} value={num((Number(loss.units) || 0) + (Number(loss.bulk) || 0))}
            sub={cur.money ? t('wh.lossValue', { amount: money(loss.value) }) : t('wh.lossOnGigs', { count: Number(loss.on_gigs) || 0 })} />
          <NumberTile label={t('wh.inspectionsOverdue')} value={num(ins.overdue)}
            sub={t('wh.inspectionsSub', { due: Number(ins.due_30) || 0, never: Number(ins.never) || 0 })} />
        </div>
        {top.length > 0 && <BarChart title={t('wh.chart.repairs')} format={num} valueLabel={t('wh.col.repairs')}
          data={top.map(r => ({ label: r.name, value: Number(r.repairs) }))} />}
        {toolbar(() => downloadCsv(`${t('wh.csvName.damage')} ${range.from}`, rows, columns.map(c => ({ ...c, csv: c.value })), 'csv:reports:warehouse'))}
        {details && (
          <>
            <GroupBy value={by} options={DAMAGE_GROUPS} onChange={v => setParam('by', v === 'item' ? null : v)} />
            <ReportTable caption={t(`wh.damageBy.${by}`)} columns={columns} rows={rows}
              sort={sort.key in { name: 1, client: 1, repairs: 1, open: 1, md: 1, lost: 1, cost: 1, charged: 1, lost_value: 1 } ? sort : { key: 'repairs', dir: -1 }}
              onSort={setSort} empty={t('wh.emptyDamage')} />
            <h3 style={h3}>{t('wh.lossesByItem')}</h3>
            <ReportTable sort={{ key: 'units', dir: -1 }} onSort={() => {}} empty={t('wh.noLosses')}
              rows={(loss.items || []).map(r => ({ ...r, id: r.item_id }))}
              columns={[
                { key: 'name', label: t('reports.group.item'), left: true, value: r => r.name || '', show: itemLink },
                { key: 'units', label: t('wh.col.lost'), value: r => Number(r.units) },
                ...(cur.money ? [{ key: 'value', label: t('wh.col.lostValue'), value: r => Number(r.value), show: r => money(r.value) }] : []),
              ]} />
            <h3 style={h3}>{t('wh.inspectionsDue')}</h3>
            <ReportTable sort={{ key: 'overdue', dir: -1 }} onSort={() => {}} empty={t('wh.noInspections')}
              rows={(ins.items || []).map(r => ({ ...r, id: r.item_id }))}
              columns={[
                { key: 'name', label: t('reports.group.item'), left: true, value: r => r.name || '', show: itemLink },
                { key: 'overdue', label: t('wh.col.overdue'), value: r => Number(r.overdue) },
                { key: 'due_30', label: t('wh.col.due30'), value: r => Number(r.due_30) },
                { key: 'never', label: t('wh.col.never'), value: r => Number(r.never) },
                { key: 'next', label: t('wh.col.nextDue'), left: true, value: r => r.next_due || '', show: r => date(r.next_due) },
              ]} />
            <p style={note}>{t('wh.inspectionsMore', { done: Number(ins.done) || 0, failed: Number(ins.failed) || 0 })}{cur.money ? ` ${t('wh.inspectionsCost', { amount: money(ins.cost) })}` : ''}</p>
          </>
        )}
        <p style={note}>{t('wh.howDamage')} <Link to={`/org/${orgId}/inventory?tab=maintenance`} style={{ color: colors.accentText }}>{t('wh.openMaintenance')}</Link></p>
      </>
    )
  }

  function dispatchView() {
    const cur = data.cur || {}
    const tot = cur.totals || {}
    const gigs = cur.gigs || []
    if (!gigs.length && !Number(tot.scans)) return <EmptyState compact icon={<ScanLine size={26} />} title={t('wh.emptyDispatch')} body={t('wh.emptyDispatchBody')} guide="warehouse-numbers" />
    const bars = scanBars(cur.scans_by_day, range)
    const daily = bars.length && bars[0].key.length === 10
    const columns = [
      { key: 'gig', label: t('reports.group.gig'), left: true, value: r => r.name || '', show: r => <Link to={`/gig/${r.gig_id}/scan`} style={link}>{r.name}</Link> },
      { key: 'start', label: t('finance.col.start'), left: true, value: r => r.start_date || '', show: r => date(r.start_date) },
      { key: 'planned', label: t('wh.col.planned'), value: r => Number(r.planned) },
      { key: 'out', label: t('wh.col.out'), value: r => Number(r.out) },
      { key: 'short_out', label: t('wh.col.shortOut'), value: r => Number(r.short_out) },
      { key: 'back', label: t('wh.col.back'), value: r => Number(r.back) },
      { key: 'missing', label: t('wh.col.missing'), value: r => Number(r.missing),
        show: r => (r.ended && Number(r.missing) ? <span style={{ color: colors.danger, fontWeight: 700 }}>{num(r.missing)}</span> : num(r.missing)) },
      { key: 'lead', label: t('wh.col.left'), value: r => (r.lead_days == null ? -999 : Number(r.lead_days)),
        show: r => lead(r.lead_days) },
    ]
    return (
      <>
        <div style={grid}>
          <NumberTile label={t('wh.scannedOut')} value={pct(outShare(tot))} sub={t('wh.scannedOutSub', { out: Number(tot.out) || 0, planned: Number(tot.planned) || 0 })} />
          <NumberTile label={t('wh.stillMissing')} value={num(tot.missing)} sub={t('wh.stillMissingSub', { count: Number(tot.gigs_missing) || 0 })} />
          <NumberTile label={t('wh.leftBefore')} value={lead(tot.median_lead_days)} sub={t('wh.leftBeforeSub')} />
          <NumberTile label={t('wh.scans')} value={num(tot.scans)}
            sub={tot.busiest_day ? t('wh.busiestDay', { date: date(tot.busiest_day.day), count: Number(tot.busiest_day.scans) || 0 }) : null} />
        </div>
        {bars.length > 0 && <BarChart title={t('wh.chart.scans')} format={num} valueLabel={t('wh.scans')}
          data={bars.map(b => ({ label: daily ? fmt(b.key, 'd MMM') : fmt(`${b.key}-01`, 'MMM yy'), value: b.value }))} />}
        {toolbar(() => downloadCsv(`${t('wh.csvName.dispatch')} ${range.from}`, gigs, columns.map(c => ({ ...c, csv: c.value })), 'csv:reports:warehouse'))}
        {details && (
          <>
            <ReportTable caption={t('wh.perGig')} columns={columns} rows={gigs.map(r => ({ ...r, id: r.gig_id }))}
              sort={sort.key in { gig: 1, start: 1, planned: 1, out: 1, short_out: 1, back: 1, missing: 1, lead: 1 } ? sort : { key: 'start', dir: 1 }}
              onSort={setSort} empty={t('wh.emptyDispatch')} />
            <BarChart title={t('wh.chart.lead')} format={num} valueLabel={t('ops.gigs')}
              data={dispatchLeadBars(tot.lead).map(b => ({ label: t(`wh.lead.${b.key}`), value: b.value }))} />
          </>
        )}
        <p style={note}>{t('wh.howDispatch')}</p>
      </>
    )
  }

  function toolbar(csv) {
    return (
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <DetailsToggle on={details} onToggle={toggleDetails} />
        <span style={{ flex: '1 1 auto' }} />
        <ExportButtons onCsv={csv} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PeriodBar period={period} onPeriod={v => setParam('period', v === 'this_month' ? null : v)} custom={custom}
        onCustom={c => { setParam('from', c.from || null); setParam('until', c.until || null) }} range={range} />
      <div className="no-print" role="group" aria-label={t('wh.views')} style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {WAREHOUSE_VIEWS.map(v => (
          <button key={v} type="button" onClick={() => setParam('view', v === 'demand' ? null : v)} aria-pressed={view === v}
            style={{ ...btn, padding: '6px 10px', ...(view === v ? { borderColor: colors.accentText, color: colors.accentText, fontWeight: 700 } : {}) }}>
            {t(`wh.view.${v}`)}
          </button>
        ))}
        <Hint id="warehouse-report" label={t('reports.tab.warehouse')} />
      </div>
      {body}
    </div>
  )
}

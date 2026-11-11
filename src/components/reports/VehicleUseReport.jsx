import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { periodRange, comparisonRange, change, todayIn, periodKey, comparisonKey } from '../../lib/analytics/periods'
import { vehicleUseTotals, loadShare } from '../../lib/transportCost'
import { formatMoney } from '../../lib/quotes'
import { useI18n } from '../../i18n'
import { colors, AvxLoader } from '../ui'
import EmptyState from '../EmptyState'
import { NumberTile, BarChart } from './Charts'
import { PeriodBar, ReportTable, ExportButtons, DetailsToggle, useDetails, downloadCsv } from './ReportParts'

const load = (orgId, range) => supabase.rpc('vehicle_use', { p_org: orgId, p_from: range.from, p_until: range.until })

// Reports → Vehicle use (step 23, V4): per vehicle and period, its trips, km, days used, load
// against capacity, running cost (km × cost per km + days × cost per day) and the expenses linked
// to it, from public.vehicle_use (counted in the database, in euros). Load is the heaviest trip's
// load from the packing list per vehicle (V3); "not recorded" when there is none.
export default function VehicleUseReport({ orgId, timeZone, params, setParam }) {
  const { t, lang } = useI18n()
  const [details, toggleDetails] = useDetails('vehicles')
  const period = periodKey(params.get('period'))
  const compare = comparisonKey(params.get('compare'))
  const custom = { from: params.get('from') || '', until: params.get('until') || '' }
  const [sort, setSort] = useState({ key: 'total', dir: -1 })
  const [data, setData] = useState(null)
  const today = todayIn(timeZone)
  const range = useMemo(() => periodRange(period, { today, from: custom.from, until: custom.until }), [period, today, custom.from, custom.until])
  const compared = useMemo(() => comparisonRange(range, compare), [range, compare])

  useEffect(() => {
    if (!range) return
    let cancelled = false
    setData(null)
    Promise.all([load(orgId, range), load(orgId, compared)]).then(([cur, prev]) => {
      if (cancelled) return
      if (cur.error || prev.error) logger.error('reports', cur.error || prev.error, { step: 'vehicles' })
      setData({ cur: cur.data || [], prev: prev.data || [], failed: !!(cur.error || prev.error) })
    })
    return () => { cancelled = true }
  }, [orgId, range, compared])

  const rows = data?.cur || []
  const totals = vehicleUseTotals(rows)
  const prevTotals = vehicleUseTotals(data?.prev)
  const num = v => Number(v || 0).toLocaleString(lang === 'pt' ? 'pt-PT' : 'en-GB')
  const money = v => formatMoney(Number(v) || 0, 'EUR', lang)
  const compareLabel = t(`reports.compareShort.${compare}`)
  const used = rows.filter(r => r.trips > 0 || Number(r.expenses) > 0)
  const chart = [...used].sort((a, b) => Number(b.total) - Number(a.total)).slice(0, 12)
    .map(r => ({ label: r.vehicle_name, value: Number(r.total) }))
  const loadText = r => {
    const share = loadShare(r)
    if (share != null) return t('vehicleUse.loadShare', { pct: share })
    return r.max_load_kg != null ? t('vehicleUse.loadNotRecordedOf', { kg: num(r.max_load_kg) }) : t('vehicleUse.loadNotRecorded')
  }
  const other = r => Object.entries(r.other_currencies || {}).map(([c, v]) => formatMoney(v, c, lang)).join(' · ')

  const columns = [
    { key: 'vehicle', label: t('vehicleUse.col.vehicle'), value: r => r.vehicle_name, left: true,
      show: r => <span>{r.vehicle_name}{r.plate ? ` · ${r.plate}` : ''}{r.removed_at ? ` (${t('vehicleUse.removed')})` : ''}</span> },
    { key: 'trips', label: t('vehicleUse.col.trips'), value: r => r.trips },
    { key: 'gigs', label: t('vehicleUse.col.gigs'), value: r => r.gigs },
    { key: 'km', label: t('vehicleUse.col.km'), value: r => Number(r.km), show: r => num(r.km) + (r.km_missing > 0 ? ` (${t('vehicleUse.kmMissingShort', { count: r.km_missing })})` : '') },
    { key: 'days', label: t('vehicleUse.col.days'), value: r => r.days },
    { key: 'load', label: t('vehicleUse.col.load'), value: r => loadShare(r) ?? -1, show: loadText, left: true },
    { key: 'running', label: t('vehicleUse.col.running'), value: r => Number(r.running), show: r => money(r.running) },
    { key: 'expenses', label: t('vehicleUse.col.expenses'), value: r => Number(r.expenses),
      show: r => money(r.expenses) + (r.other_currencies ? ` + ${other(r)}` : '') },
    { key: 'total', label: t('vehicleUse.col.total'), value: r => Number(r.total), show: r => <strong>{money(r.total)}</strong> },
  ]
  const csvColumns = [
    { key: 'vehicle', label: t('vehicleUse.col.vehicle'), value: r => r.vehicle_name },
    { key: 'plate', label: t('vehicleUse.col.plate'), value: r => r.plate || '' },
    { key: 'trips', label: t('vehicleUse.col.trips'), value: r => r.trips },
    { key: 'gigs', label: t('vehicleUse.col.gigs'), value: r => r.gigs },
    { key: 'km', label: t('vehicleUse.col.km'), value: r => r.km },
    { key: 'kmMissing', label: t('vehicleUse.col.kmMissing'), value: r => r.km_missing },
    { key: 'days', label: t('vehicleUse.col.days'), value: r => r.days },
    { key: 'maxLoad', label: t('vehicleUse.col.maxLoad'), value: r => r.max_load_kg ?? '' },
    { key: 'load', label: t('vehicleUse.col.loadKg'), value: r => r.load_kg ?? '' },
    { key: 'perKm', label: t('vehicleUse.col.perKm'), value: r => r.cost_per_km ?? '' },
    { key: 'perDay', label: t('vehicleUse.col.perDay'), value: r => r.cost_per_day ?? '' },
    { key: 'running', label: t('vehicleUse.col.running'), value: r => r.running },
    { key: 'expenses', label: t('vehicleUse.col.expenses'), value: r => r.expenses },
    { key: 'total', label: t('vehicleUse.col.total'), value: r => r.total },
  ].map(c => ({ ...c, csv: c.value }))
  const csv = () => downloadCsv(`${t('vehicleUse.csvName')} ${range.from} ${range.until}`, rows, csvColumns, 'csv:reports:vehicles')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <PeriodBar period={period} onPeriod={v => setParam('period', v === 'this_month' ? null : v)} custom={custom}
        onCustom={c => { setParam('from', c.from || null); setParam('until', c.until || null) }}
        compare={compare} onCompare={v => setParam('compare', v === 'previous' ? null : v)} range={range} compared={compared} />

      {!range ? null : !data ? (
        <AvxLoader size={20} color={colors.accentText} label={t('common.loading')} />
      ) : data.failed ? (
        <p role="alert" style={{ color: colors.danger, fontSize: '13px' }}>{t('reports.loadFailed')}</p>
      ) : rows.length === 0 ? (
        <EmptyState compact icon={<Truck size={26} />} title={t('vehicleUse.noVehicles')} body={t('vehicleUse.noVehiclesBody')}
          guide="office-vehicle-costs" />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            <NumberTile label={t('vehicleUse.tile.total')} value={money(totals.total)} change={change(totals.total, prevTotals.total)} compareLabel={compareLabel}
              sub={t('vehicleUse.tile.totalSub', { running: money(totals.running), expenses: money(totals.expenses) })} />
            <NumberTile label={t('vehicleUse.tile.km')} value={num(totals.km)} change={change(totals.km, prevTotals.km)} compareLabel={compareLabel}
              sub={t('vehicleUse.tile.trips', { count: totals.trips })} />
            <NumberTile label={t('vehicleUse.tile.days')} value={String(totals.days)} change={change(totals.days, prevTotals.days)} compareLabel={compareLabel}
              sub={t('vehicleUse.tile.vehicles', { count: totals.vehicles })} />
          </div>
          {totals.kmMissing > 0 && <p style={{ fontSize: '13px', color: 'var(--warn)', margin: 0 }}>{t('vehicleUse.kmMissing', { count: totals.kmMissing })}</p>}

          {used.length === 0 ? (
            <EmptyState compact icon={<Truck size={26} />} title={t('vehicleUse.empty')} body={t('vehicleUse.emptyBody')} guide="office-vehicle-costs" />
          ) : (
            <BarChart title={t('vehicleUse.chart')} data={chart} format={money} valueLabel={t('vehicleUse.col.total')} />
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <DetailsToggle on={details} onToggle={toggleDetails} />
            <span style={{ flex: '1 1 auto' }} />
            <ExportButtons onCsv={csv} disabled={!rows.length} />
          </div>

          {details && (
            <ReportTable columns={columns} rows={rows.map(r => ({ ...r, id: r.vehicle_id }))} sort={sort} onSort={setSort} empty={t('vehicleUse.empty')} />
          )}
          <p style={{ fontSize: '13px', color: colors.muted, lineHeight: 1.6, margin: 0 }}>
            {t('vehicleUse.how')}{' '}
            <Link to={`/org/${orgId}/inventory?tab=vehicles`} style={{ color: colors.accentText }}>{t('vehicleUse.ratesLink')}</Link>
          </p>
        </>
      )}
    </div>
  )
}

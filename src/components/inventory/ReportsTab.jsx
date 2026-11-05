import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Download, ArrowDown, ArrowUp, Moon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { logger } from '../../lib/logger'
import { reportCsv } from '../../lib/reports'
import { selectAll } from '../../lib/selectAll'
import { todayIn, addDaysIso } from '../../lib/analytics/periods'
import { round2 } from '../../lib/quotes'
import { formatMoney, localISODate } from '../../lib/quotes'
import { useI18n, t } from '../../i18n'
import { btn, input, card, label, colors } from '../ui'

const PERIODS = ['90d', '12m', 'ytd']
const AMBER = 'var(--warn)'
const select = { ...input, appearance: 'auto', width: 'auto', padding: '6px 10px' }

// The period as dates in the organisation's time zone: from the first day, until the day after today
function periodRange(key, timeZone) {
  const today = todayIn(timeZone)
  const untilDay = addDaysIso(today, 1)
  const fromDay = key === '90d' ? addDaysIso(untilDay, -90)
    : key === '12m' ? `${Number(untilDay.slice(0, 4)) - 1}${untilDay.slice(4)}`.replace(/-02-29$/, '-02-28')
      : `${today.slice(0, 4)}-01-01`
  return { fromDay, untilDay }
}

// A row of public.equipment_report in the shape the table uses
const toRow = r => ({
  id: r.item_id, name: r.name, category: r.category, owned: r.owned, use: Number(r.use) || 0, gigs: r.gigs,
  lastUsed: r.last_used ? new Date(r.last_used) : null, revenue: Number(r.revenue) || 0,
  returnOnCost: r.return_on_cost == null ? null : Number(r.return_on_cost), repairs: r.repairs,
  repairCost: Number(r.repair_cost) || 0, charged: Number(r.charged) || 0, lost: r.lost, lostValue: Number(r.lost_value) || 0,
  hiredIn: Number(r.hired_in) || 0, bookValue: Number(r.book_value) || 0, cost: Number(r.cost) || 0, idle: r.idle,
})

// Inventory → Reports: use, revenue, repairs, losses and value per item (docs/INVENTORY.md, I7)
export default function ReportsTab({ orgId, inv }) {
  const { lang, fmt } = useI18n()
  const [period, setPeriod] = useState('12m')
  const [data, setData] = useState(null)
  const [sort, setSort] = useState({ key: 'revenue', dir: -1 })
  const timeZone = inv.org?.time_zone
  const range = useMemo(() => periodRange(period, timeZone), [period, timeZone])

  // Counted in the database (public.equipment_report, step K1): every row, whatever the size
  useEffect(() => {
    let cancelled = false
    setData(null)
    selectAll(() => supabase.rpc('equipment_report', { p_org: orgId, p_from: range.fromDay, p_until: range.untilDay }).order('name').order('item_id'))
      .then(({ data: rows, error }) => {
        if (cancelled) return
        if (error) logger.error('reports', error, { step: 'equipment_report' })
        setData((rows || []).map(toRow))
      })
    return () => { cancelled = true }
  }, [orgId, range])

  const report = useMemo(() => {
    if (!data) return null
    const sum = key => round2(data.reduce((s, r) => s + (r[key] || 0), 0))
    return {
      rows: data,
      totals: {
        revenue: sum('revenue'), repairCost: sum('repairCost'), charged: sum('charged'), lostValue: sum('lostValue'),
        hiredIn: sum('hiredIn'), bookValue: sum('bookValue'), idle: data.filter(r => r.idle).length,
      },
    }
  }, [data])

  if (!report) return <Loader2 size={20} color={colors.accentText} style={{ animation: 'spin 1s linear infinite' }} />
  const money = v => formatMoney(v, 'EUR', lang)
  const pct = v => `${Math.round(v * 100)}%`
  const cols = [
    { key: 'name', label: t('report.item'), value: r => r.name, show: r => <Link to={`/org/${orgId}/inventory/${r.id}`} style={{ color: 'var(--text)' }}>{r.name}</Link>, left: true },
    { key: 'owned', label: t('report.owned'), value: r => r.owned },
    { key: 'use', label: t('report.use'), value: r => r.use, show: r => pct(r.use) },
    { key: 'gigs', label: t('report.gigs'), value: r => r.gigs },
    { key: 'lastUsed', label: t('report.lastUsed'), value: r => (r.lastUsed ? r.lastUsed.getTime() : 0), csv: r => (r.lastUsed ? localISODate(r.lastUsed) : ''), show: r => (r.lastUsed ? fmt(r.lastUsed, 'd MMM yy') : '—') },
    { key: 'revenue', label: t('report.revenue'), value: r => r.revenue, show: r => money(r.revenue) },
    { key: 'returnOnCost', label: t('report.returnOnCost'), value: r => r.returnOnCost ?? -1, csv: r => r.returnOnCost, show: r => (r.returnOnCost == null ? '—' : pct(r.returnOnCost)) },
    { key: 'repairCost', label: t('report.repairs'), value: r => r.repairCost, show: r => (r.repairs ? `${r.repairs} · ${money(r.repairCost)}` : '—') },
    { key: 'lost', label: t('report.lost'), value: r => r.lost, show: r => (r.lost ? <span style={{ color: colors.danger }}>{r.lost}</span> : '—') },
    { key: 'hiredIn', label: t('report.hiredIn'), value: r => r.hiredIn, show: r => (r.hiredIn ? money(r.hiredIn) : '—') },
    { key: 'bookValue', label: t('report.bookValue'), value: r => r.bookValue, show: r => (r.bookValue ? money(r.bookValue) : '—') },
  ]
  const sortCol = cols.find(c => c.key === sort.key) || cols[5]
  // Items with nothing to say (none in stock, no activity) stay out of the table
  const rows = report.rows.filter(r => r.owned > 0 || r.revenue || r.repairs || r.lost || r.hiredIn || r.gigs).sort((a, b) => {
    const x = sortCol.value(a); const y = sortCol.value(b)
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir
  })
  const idle = report.rows.filter(r => r.idle).sort((a, b) => b.bookValue - a.bookValue)
  const tiles = [
    ['revenue', money(report.totals.revenue)],
    ['bookValue', money(report.totals.bookValue)],
    ['repairCost', money(report.totals.repairCost), report.totals.charged ? t('report.chargedBack', { amount: money(report.totals.charged) }) : null],
    ['lostValue', money(report.totals.lostValue)],
    ['hiredIn', money(report.totals.hiredIn)],
    ['idle', String(report.totals.idle)],
  ]

  function download() {
    const csv = reportCsv(rows, cols.map(c => ({ label: c.label, value: c.csv || c.value })))
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `inventory-${range.fromDay}-${range.untilDay}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <label htmlFor="rp-period" style={{ ...label, marginBottom: 0 }}>{t('report.period')}</label>
        <select id="rp-period" value={period} onChange={e => setPeriod(e.target.value)} style={select}>
          {PERIODS.map(p => <option key={p} value={p}>{t(`report.periods.${p}`)}</option>)}
        </select>
        <span style={{ fontSize: '12px', color: colors.muted, flex: '1 1 auto' }}>{fmt(range.fromDay, 'd MMM yyyy')} – {fmt(new Date(), 'd MMM yyyy')}</span>
        <button onClick={download} style={btn}><Download size={14} /> {t('report.csv')}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px', marginBottom: '18px' }}>
        {tiles.map(([key, value, sub]) => (
          <div key={key} style={{ ...card, padding: '12px 14px' }}>
            <div style={{ fontSize: '12px', color: colors.muted }}>{t(`report.tile.${key}`)}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px', color: key === 'lostValue' && report.totals.lostValue ? colors.danger : key === 'idle' && report.totals.idle ? AMBER : 'var(--text)' }}>{value}</div>
            {sub && <div style={{ fontSize: '11px', color: colors.muted }}>{sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: '18px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1040px' }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '9px 10px', textAlign: c.left ? 'left' : 'right', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>
                  <button onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? -s.dir : (c.left ? 1 : -1) }))} style={{ background: 'none', border: 'none', color: sort.key === c.key ? colors.accentText : colors.muted, font: 'inherit', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: 0 }}>
                    {c.label}{sort.key === c.key && (sort.dir > 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cols.length} style={{ padding: '18px', color: colors.muted, textAlign: 'center' }}>{t('report.noItems')}</td></tr>}
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: '8px 10px', textAlign: c.left ? 'left' : 'right', whiteSpace: c.left ? 'normal' : 'nowrap', minWidth: c.left ? '190px' : undefined, fontVariantNumeric: 'tabular-nums', color: c.key === 'use' && r.idle ? AMBER : undefined }}>
                    {c.show ? c.show(r) : c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {idle.length > 0 && (
        <section>
          <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '7px' }}><Moon size={16} color={AMBER} /> {t('report.idleTitle')}</h2>
          <p style={{ fontSize: '12px', color: colors.muted, marginBottom: '8px' }}>{t('report.idleHint')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {idle.slice(0, 50).map(r => (
              <div key={r.id} style={{ ...card, padding: '8px 12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
                <Link to={`/org/${orgId}/inventory/${r.id}`} style={{ color: 'var(--text)', fontWeight: 600, flex: '1 1 180px' }}>{r.name}</Link>
                <span style={{ color: colors.muted }}>{t('report.idleRow', { count: r.owned, last: r.lastUsed ? fmt(r.lastUsed, 'd MMM yyyy') : t('report.never') })}</span>
                {r.bookValue > 0 && <strong>{money(r.bookValue)}</strong>}
              </div>
            ))}
          </div>
        </section>
      )}
      <p style={{ fontSize: '12px', color: colors.muted, marginTop: '16px', lineHeight: 1.6 }}>{t('report.howCounted')}</p>
    </div>
  )
}

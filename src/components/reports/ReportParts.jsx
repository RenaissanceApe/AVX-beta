import { useState } from 'react'
import { ArrowDown, ArrowUp, Download, Printer } from 'lucide-react'
import { reportCsv } from '../../lib/reports'
import { PERIODS, COMPARISONS, addDaysIso } from '../../lib/analytics/periods'
import { track } from '../../lib/usage'
import { useI18n } from '../../i18n'
import { btn, input, label, card, colors } from '../ui'

// The parts every report is made of (docs/ANALYTICS.md, principle 8): period and comparison,
// filters, group-by, a sortable table with CSV and print, and "Show details" remembered on the
// device.

const select = { ...input, width: 'auto', minWidth: 0, maxWidth: '100%', padding: '7px 10px' }
const field = { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: '1 1 140px' }
const lab = { ...label, marginBottom: 0 }

// "Show details", remembered on this device per report
export function useDetails(key) {
  const storageKey = `avx.reports.details.${key}`
  const [on, setOn] = useState(() => { try { return localStorage.getItem(storageKey) === '1' } catch { return false } })
  const toggle = () => setOn(v => {
    try { localStorage.setItem(storageKey, v ? '0' : '1') } catch { /* private window */ }
    return !v
  })
  return [on, toggle]
}

export function DetailsToggle({ on, onToggle }) {
  const { t } = useI18n()
  return (
    <label className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
      <input type="checkbox" checked={on} onChange={onToggle} /> {t('reports.showDetails')}
    </label>
  )
}

// A period as readable dates: "1 Nov – 5 Nov 2026" (until is exclusive)
export function PeriodDates({ range }) {
  const { fmt } = useI18n()
  if (!range) return null
  const last = addDaysIso(range.until, -1)
  return <>{fmt(range.from, 'd MMM yyyy')} – {fmt(last, 'd MMM yyyy')}</>
}

// Period, custom dates and comparison (no comparison when onCompare isn't given, e.g. the person page)
export function PeriodBar({ period, onPeriod, custom, onCustom, compare, onCompare, range, compared }) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={field}>
        <label htmlFor="rp-period" style={lab}>{t('reports.period')}</label>
        <select id="rp-period" value={period} onChange={e => onPeriod(e.target.value)} style={select}>
          {PERIODS.map(p => <option key={p} value={p}>{t(`reports.periods.${p}`)}</option>)}
        </select>
      </div>
      {period === 'custom' && (
        <>
          <div style={field}>
            <label htmlFor="rp-from" style={lab}>{t('reports.from')}</label>
            <input id="rp-from" type="date" value={custom.from || ''} onChange={e => onCustom({ ...custom, from: e.target.value })} style={select} />
          </div>
          <div style={field}>
            <label htmlFor="rp-until" style={lab}>{t('reports.until')}</label>
            <input id="rp-until" type="date" value={custom.until || ''} onChange={e => onCustom({ ...custom, until: e.target.value })} style={select} />
          </div>
        </>
      )}
      {onCompare && (
        <div style={field}>
          <label htmlFor="rp-compare" style={lab}>{t('reports.compareWith')}</label>
          <select id="rp-compare" value={compare} onChange={e => onCompare(e.target.value)} style={select}>
            {COMPARISONS.map(c => <option key={c} value={c}>{t(`reports.compare.${c}`)}</option>)}
          </select>
        </div>
      )}
      <p style={{ flex: '1 1 100%', fontSize: '13px', color: colors.muted, margin: 0 }}>
        {range ? <><PeriodDates range={range} />{compared && <> · {t('reports.comparedWith')} <PeriodDates range={compared} /></>}{range.partial && compared && <> · {t('reports.dayForDay')}</>}</> : t('reports.pickDates')}
      </p>
    </div>
  )
}

// Filters: status (built-in or the organisation's own), gig type, client
export function FilterBar({ filters, onChange, statuses = [], types = [], clients = [] }) {
  const { t } = useI18n()
  const set = (k, v) => onChange({ ...filters, [k]: v })
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={field}>
        <label htmlFor="rp-status" style={lab}>{t('reports.filter.status')}</label>
        <select id="rp-status" value={filters.status || ''} onChange={e => set('status', e.target.value)} style={select}>
          <option value="">{t('reports.filter.all')}</option>
          {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div style={field}>
        <label htmlFor="rp-type" style={lab}>{t('reports.filter.type')}</label>
        <select id="rp-type" value={filters.type || ''} onChange={e => set('type', e.target.value)} style={select}>
          <option value="">{t('reports.filter.all')}</option>
          <option value="none">{t('reports.filter.noType')}</option>
          {types.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div style={field}>
        <label htmlFor="rp-client" style={lab}>{t('reports.filter.client')}</label>
        <select id="rp-client" value={filters.client || ''} onChange={e => set('client', e.target.value)} style={select}>
          <option value="">{t('reports.filter.all')}</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  )
}

export function GroupBy({ value, options, onChange }) {
  const { t } = useI18n()
  return (
    <div style={{ ...field, flex: '0 1 180px' }}>
      <label htmlFor="rp-group" style={lab}>{t('reports.groupBy')}</label>
      <select id="rp-group" value={value} onChange={e => onChange(e.target.value)} style={select}>
        {options.map(o => <option key={o} value={o}>{t(`reports.group.${o}`)}</option>)}
      </select>
    </div>
  )
}

// Download rows as CSV (semicolon-separated, as Inventory → Reports), counted as csv:reports:<tab>
export function downloadCsv(fileName, rows, columns, event) {
  const csv = reportCsv(rows, columns.map(c => ({ label: c.label, value: c.csv || c.value })))
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = `${fileName}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  if (event) track(event)
}

export function ExportButtons({ onCsv, disabled }) {
  const { t } = useI18n()
  return (
    <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button type="button" onClick={onCsv} disabled={disabled} style={btn}><Download size={14} aria-hidden="true" /> {t('reports.csv')}</button>
      <button type="button" onClick={() => window.print()} style={btn}><Printer size={14} aria-hidden="true" /> {t('reports.print')}</button>
    </div>
  )
}

// Sortable table. columns: [{ key, label, value(row), show?(row), left? }]
export function ReportTable({ columns, rows, sort, onSort, caption, empty }) {
  const col = columns.find(c => c.key === sort.key) || columns[0]
  const sorted = [...rows].sort((a, b) => {
    const x = col.value(a); const y = col.value(b)
    return (typeof x === 'string' || typeof y === 'string' ? String(x ?? '').localeCompare(String(y ?? '')) : (x ?? 0) - (y ?? 0)) * sort.dir
  })
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        {caption && <caption style={{ textAlign: 'left', padding: '10px 12px 0', fontSize: '13px', fontWeight: 700 }}>{caption}</caption>}
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}
                style={{ padding: '8px 10px', textAlign: c.left ? 'left' : 'right', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>
                <button type="button" onClick={() => onSort({ key: c.key, dir: sort.key === c.key ? -sort.dir : (c.left ? 1 : -1) })}
                  style={{ background: 'none', border: 'none', color: sort.key === c.key ? colors.accentText : colors.muted, font: 'inherit', fontSize: '11px', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', padding: 0 }}>
                  {c.label}{sort.key === c.key && (sort.dir > 0 ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={columns.length} style={{ padding: '16px', color: colors.muted, textAlign: 'center' }}>{empty}</td></tr>}
          {sorted.map((r, i) => (
            <tr key={r.id ?? i} style={{ borderBottom: `1px solid ${colors.border}` }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '7px 10px', textAlign: c.left ? 'left' : 'right', whiteSpace: c.left ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {c.show ? c.show(r) : c.value(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Hides the menus and buttons when printing a report
export function PrintStyles() {
  return <style>{'@media print { header, nav, .no-print, [data-shell-chrome] { display: none !important; } body { background: none; } }'}</style>
}
